import toast from './toast';
import { backendReady, getApiBaseUrl } from './backendResolver';

// Giữ nguyên là export mutable (live binding ES module) vì vài file khác (DeviceManagement.jsx,
// sysAdminServices.js, EventSnapshotModal.jsx, ThumbnailImage.jsx, UserAvatar.jsx) import trực
// tiếp API_BASE_URL để dựng URL — reassign ở đây tự động phản ánh sang các nơi đó, không cần sửa.
export let API_BASE_URL = getApiBaseUrl();

const decodeUnicodeEscapes = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        if (obj.includes('\\u')) {
            try {
                return obj.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
                    return String.fromCharCode(parseInt(grp, 16));
                });
            } catch (e) {
                return obj;
            }
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(decodeUnicodeEscapes);
    }
    if (typeof obj === 'object') {
        const decoded = {};
        for (const [key, value] of Object.entries(obj)) {
            decoded[key] = decodeUnicodeEscapes(value);
        }
        return decoded;
    }
    return obj;
};

// Token storage helpers
export const getAccessToken = () => localStorage.getItem('accessToken');
export const getRefreshToken = () => localStorage.getItem('refreshToken');
export const setTokens = (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
};
export const clearTokens = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
};

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
    refreshSubscribers.push(cb);
};

const onRefreshed = (token) => {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
};

/**
 * Xây dựng query string từ object, lọc bỏ các giá trị undefined, null, chuỗi rỗng
 * @param {Object} params - Tham số truy vấn
 * @returns {string} Chuỗi truy vấn đã serialize
 */
export const buildQuery = (params) => {
    if (!params) return '';
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                value.forEach(item => query.append(key, item));
            } else {
                query.append(key, value);
            }
        }
    }
    const qStr = query.toString();
    return qStr ? `?${qStr}` : '';
};

const isPublicEndpoint = (path) => {
    const publicPaths = [
        '/auth/login',
        '/auth/password-reset/request',
        '/auth/password-reset/confirm',
        '/public/visitor-'
    ];
    // Normalize path (remove leading/trailing slashes for check)
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    return publicPaths.some(p => normalizedPath.startsWith(p));
};

export const request = async (path, options = {}) => {
    // Chờ 1 lần dò backend CHÍNH lúc app khởi động (đã cache, các lần gọi sau await promise
    // đã resolve nên gần như không tốn thời gian) để chọn đúng domain trước khi bắn request.
    await backendReady;
    API_BASE_URL = getApiBaseUrl();

    const { method = 'GET', body, headers = {}, isPublic: customIsPublic, token: overrideToken } = options;
    const isPublic = customIsPublic !== undefined ? customIsPublic : isPublicEndpoint(path);
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    const url = `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;

    const defaultHeaders = {
        'Accept': 'application/json',
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
    };

    // overrideToken cho phép trang khách gắn guestToken thay vì accessToken nhân viên
    const token = overrideToken ?? (isPublic ? null : getAccessToken());
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method,
        headers: defaultHeaders,
    };

    if (body) {
        config.body = isFormData ? body : JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);

        // Handle 401 Unauthorized for non-public endpoints
        if (response.status === 401 && !isPublic) {
            const refreshToken = getRefreshToken();
            if (refreshToken) {
                if (!isRefreshing) {
                    isRefreshing = true;
                    try {
                        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ refreshToken }),
                        });
                        const refreshResult = await refreshResponse.json();

                        if (refreshResponse.ok && refreshResult.success) {
                            const { accessToken: newAccess, refreshToken: newRefresh } = refreshResult.data;
                            setTokens(newAccess, newRefresh);
                            isRefreshing = false;
                            onRefreshed(newAccess);

                            // Retry this initiating request immediately with the new token
                            config.headers['Authorization'] = `Bearer ${newAccess}`;
                            const retriedResponse = await fetch(url, config);
                            return handleResponse(retriedResponse);
                        } else {
                            isRefreshing = false;
                            clearTokens();
                            window.dispatchEvent(new Event('auth-expired'));
                            throw {
                                success: false,
                                error: {
                                    message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.',
                                    code: 'AUTH_EXPIRED',
                                    requestId: refreshResult.requestId !== 'unknown' ? refreshResult.requestId : null
                                },
                                requestId: refreshResult.requestId !== 'unknown' ? refreshResult.requestId : null
                            };
                        }
                    } catch (refreshErr) {
                        isRefreshing = false;
                        clearTokens();
                        window.dispatchEvent(new Event('auth-expired'));
                        throw refreshErr;
                    }
                } else {
                    // Queue original request until refresh is done
                    const retryOriginalRequest = new Promise((resolve) => {
                        subscribeTokenRefresh((newToken) => {
                            config.headers['Authorization'] = `Bearer ${newToken}`;
                            resolve(fetch(url, config));
                        });
                    });
                    const retriedResponse = await retryOriginalRequest;
                    return handleResponse(retriedResponse);
                }
            } else {
                clearTokens();
                window.dispatchEvent(new Event('auth-expired'));
                throw {
                    success: false,
                    error: {
                        message: 'Phiên làm việc hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
                        code: 'AUTH_EXPIRED',
                        requestId: null
                    },
                    requestId: null
                };
            }
        }

        return handleResponse(response, options);
    } catch (error) {
        if (error.success === false && error.error) {
            if (!options.skipToast) toast.error(error.error.message);
            throw error;
        }
        const connError = {
            success: false,
            error: {
                message: 'Lỗi mạng: Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền.',
                code: 'CONNECTION_ERROR',
                requestId: null
            },
            requestId: null
        };
        if (!options.skipToast) toast.error(connError.error.message);
        throw connError;
    }
};

const ERROR_TRANSLATIONS = {
    // Attendance list errors
    'attendance list is not open yet': 'Danh sách điểm danh chưa được mở. Vui lòng quay lại khi cuộc họp bắt đầu.',
    'please come back when the meeting starts': 'Danh sách điểm danh chưa được mở. Vui lòng quay lại khi cuộc họp bắt đầu.',
    
    // Auth & Account errors
    'unauthorized': 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    'forbidden': 'Bạn không có quyền thực hiện hành động này.',
    'invalid credentials': 'Tài khoản hoặc mật khẩu không chính xác.',
    'email is already in use': 'Email này đã được đăng ký sử dụng bởi người dùng khác.',
    'username is already in use': 'Tên đăng nhập này đã được đăng ký sử dụng.',
    
    // Meeting & Booking errors
    'meeting has already ended': 'Cuộc họp này đã kết thúc.',
    'room is already booked during this time range': 'Phòng họp đã được đặt trong khung giờ này. Vui lòng chọn phòng khác.',
    'pdpa consent is required': 'Bạn phải đồng ý với cam kết bảo vệ dữ liệu cá nhân (PDPA) khi kích hoạt ghi âm/ghi hình.',
    'room has faulty equipment': 'Phòng họp hiện có thiết bị gặp sự cố kỹ thuật.',
    'cannot book meeting in the past': 'Không thể đặt cuộc họp trong quá khứ.',
    'meeting time range is invalid': 'Khung giờ cuộc họp không hợp lệ.',
};

const translateErrorMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return msg;
    const cleanMsg = msg.toLowerCase().trim();
    for (const [eng, vie] of Object.entries(ERROR_TRANSLATIONS)) {
        if (cleanMsg.includes(eng)) {
            return vie;
        }
    }
    return msg;
};

const handleResponse = async (response, options = {}) => {
    const contentType = response.headers.get('Content-Type') || '';
    if (
        contentType.includes('spreadsheetml') ||
        contentType.includes('excel') ||
        contentType.includes('pdf') ||
        contentType.includes('octet-stream') ||
        contentType.includes('image')
    ) {
        try {
            const blob = await response.blob();
            return {
                success: true,
                isBlob: true,
                data: blob
            };
        } catch (e) {
            console.error('Lỗi đọc blob:', e);
        }
    }

    let result;
    try {
        const parsed = await response.json();
        result = decodeUnicodeEscapes(parsed);
    } catch (e) {
        const parseError = {
            success: false,
            error: {
                message: `Lỗi hệ thống: Phản hồi không hợp lệ từ máy chủ (${response.status})`,
                code: 'INVALID_RESPONSE',
                requestId: null
            },
            requestId: null
        };
        if (!options.skipToast) toast.error(parseError.error.message);
        throw parseError;
    }

    if (!response.ok || result.success === false) {
        const errorDetail = result.error || {};
        let message = result.message || errorDetail.message || 'Đã xảy ra lỗi hệ thống.';
        const code = errorDetail.code || 'UNKNOWN_ERROR';
        let requestId = result.requestId || errorDetail.requestId || 'unknown';

        if (typeof message === 'string') {
            if (message.startsWith('Cannot ') && (message.includes('POST') || message.includes('GET') || message.includes('PUT') || message.includes('DELETE') || message.includes('PATCH'))) {
                message = 'Lỗi hệ thống: Đường dẫn không tồn tại hoặc chưa được hỗ trợ.';
            } else if (message === 'Internal Server Error' || response.status >= 500) {
                message = 'Lỗi hệ thống: Máy chủ đang gặp sự cố.';
            } else if (response.status === 404 && message.includes('Not Found')) {
                message = 'Lỗi hệ thống: Không tìm thấy dữ liệu yêu cầu.';
            } else {
                message = translateErrorMessage(message);
            }
        }

        if (requestId === 'unknown' || requestId === 'N/A') {
            requestId = null;
        }

        const errorObj = {
            success: false,
            error: {
                message: message,
                code: code,
                requestId: requestId,
                details: errorDetail.details
            },
            status: response.status,
            requestId: requestId
        };

        if (!options.skipToast) {
            toast.error(message);
        }

        throw errorObj;
    }

    // Mock API Adapter: json-server returns direct objects/arrays. Wrap them.
    if (result && typeof result.success === 'undefined') {
        return {
            success: true,
            data: result
        };
    }

    return result;
};

export const get = (path, options = {}) => request(path, { ...options, method: 'GET' });
export const post = (path, body, options = {}) => request(path, { ...options, method: 'POST', body });

export const patch = (path, body, options = {}) => {
    let actualPath = path;
    let actualOptions = options;
    if (typeof options === 'string' || typeof options === 'number') {
        actualPath = `${path}/${options}`;
        actualOptions = {};
    }
    return request(actualPath, { ...actualOptions, method: 'PATCH', body });
};

export const put = (path, body, options = {}) => request(path, { ...options, method: 'PUT', body });

export const dele = (path, options = {}) => {
    let actualPath = path;
    let actualOptions = options;
    if (typeof options === 'string' || typeof options === 'number') {
        actualPath = `${path}/${options}`;
        actualOptions = {};
    }
    return request(actualPath, { ...actualOptions, method: 'DELETE' });
};