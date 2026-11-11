import { post, get, patch, clearTokens } from '../utils/request';
import { getApiBaseUrl } from '../utils/backendResolver';
import { resetSocket } from '../utils/socket';

/**
 * UC-AUTH-01 Đăng nhập hệ thống
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} response envelope (success, data, meta)
 */
export const login = async (email, password) => {
    return await post('/auth/login', { email, password }, { isPublic: true });
};

/**
 * Đăng nhập một lần UEL (PSC SSO) — BE có bật không (UEL_SSO_ENABLED + đủ cấu hình).
 * @returns {Promise<object>} { success, data: { enabled } }
 */
export const getSsoConfig = async () => {
    return await get('/auth/sso/config', { isPublic: true });
};

/** URL bắt đầu đăng nhập UEL — điều hướng cả trang tới đây (BE redirect sang UEL). */
export const getSsoLoginUrl = () => `${getApiBaseUrl()}/auth/sso/login`;

/**
 * Đổi ticket dùng 1 lần (nhận ở /sso/callback) lấy access/refresh token.
 * @param {string} ticket
 * @returns {Promise<object>} cùng dạng response với login()
 */
export const exchangeSsoTicket = async (ticket) => {
    return await post('/auth/sso/exchange', { ticket }, { isPublic: true });
};

/**
 * UC-AUTH-02 Đăng xuất hệ thống
 * @returns {Promise<object>} response envelope
 */
export const logout = async () => {
    try {
        return await post('/auth/logout');
    } finally {
        // Clear local storage tokens regardless of API success/failure
        clearTokens();
        localStorage.removeItem('user');
        // Huỷ socket đang mang token của người vừa đăng xuất — nếu không, phiên
        // đăng nhập kế tiếp dùng lại socket singleton cũ và sẽ nhận thông báo
        // của tài khoản trước (room user:{userId} cũ vẫn đang join).
        resetSocket();
    }
};


/**
 * Yêu cầu mã OTP đặt lại mật khẩu (UC-AUTH-03)
 * @param {string} email
 * @returns {Promise<object>} response envelope
 */
export const requestPasswordResetOtp = async (email) => {
    return await post('/auth/password-reset/request', { email }, { isPublic: true });
};

/**
 * Xác nhận đặt lại mật khẩu với mã OTP (UC-AUTH-03)
 * @param {string} email
 * @param {string} otp
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<object>} response envelope
 */
export const confirmPasswordReset = async (email, otp, newPassword, confirmPassword) => {
    return await post('/auth/password-reset/confirm', { email, otp, newPassword, confirmPassword }, { isPublic: true });
};

/**
 * UC-AUTH-04 Thay đổi mật khẩu đăng nhập
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<object>} response envelope
 */
export const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    return await patch('/auth/change-password', { currentPassword, newPassword, confirmPassword });
};

/**
 * Lấy thông tin tài khoản hiện tại (Get Profile / Me)
 * @returns {Promise<object>} response envelope
 */
export const getCurrentUser = async () => {
    return await get('/auth/me');
};

