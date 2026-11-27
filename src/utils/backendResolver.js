// Tự động dò backend CHÍNH (chạy trên máy cá nhân, có thể tắt bất cứ lúc nào)
// và fallback sang backend BACKUP (EC2, luôn bật) nếu CHÍNH không phản hồi.
// request.js và socket.js đều đọc URL đã resolve từ đây để REST và WebSocket
// luôn trỏ cùng một domain, không bao giờ lệch nhau.
//
// CHẾ ĐỘ CÙNG ĐỊA CHỈ (same-origin): khi REACT_APP_API_BASE_URL là đường dẫn
// tương đối (vd "/api/v1"), web và API dùng chung 1 địa chỉ — nginx của FE chuyển
// /api, /ws, /uploads sang backend. URL đầy đủ được ghép với địa chỉ trình duyệt
// đang mở LÚC CHẠY, nên đổi IP → tên miền không cần build lại.

const isDevelopment = process.env.NODE_ENV === 'development';
const DEFAULT_API_BASE_URL = isDevelopment ? 'http://localhost:3000/api/v1' : 'https://api.smartracking.io.vn/api/v1';
const DEFAULT_WS_URL = isDevelopment ? 'http://localhost:3000' : 'https://api.smartracking.io.vn';

const isRelative = (url) => typeof url === 'string' && url.startsWith('/');
const currentOrigin = () => window.location.origin;
const trimSlash = (url) => url.replace(/\/+$/, '');
// "/api/v1" → "http://192.168.1.50:3001/api/v1"; URL đầy đủ giữ nguyên.
const toAbsolute = (url) => trimSlash(isRelative(url) ? `${currentOrigin()}${url}` : url);

const RAW_API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
export const SAME_ORIGIN_MODE = isRelative(RAW_API_BASE_URL);

const PRIMARY_API_BASE_URL = toAbsolute(RAW_API_BASE_URL || DEFAULT_API_BASE_URL);
const PRIMARY_WS_URL = SAME_ORIGIN_MODE && !process.env.REACT_APP_WS_URL
    ? currentOrigin()
    : toAbsolute(process.env.REACT_APP_WS_URL || DEFAULT_WS_URL);
// Chế độ cùng địa chỉ: không có backup trừ khi khai báo rõ — tránh nhảy sang domain mặc định không tồn tại.
const BACKUP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL_BACKUP
    ? toAbsolute(process.env.REACT_APP_API_BASE_URL_BACKUP)
    : (SAME_ORIGIN_MODE ? PRIMARY_API_BASE_URL : DEFAULT_API_BASE_URL);
const BACKUP_WS_URL = process.env.REACT_APP_WS_URL_BACKUP
    ? toAbsolute(process.env.REACT_APP_WS_URL_BACKUP)
    : (SAME_ORIGIN_MODE ? PRIMARY_WS_URL : DEFAULT_WS_URL);

const HEALTH_CHECK_TIMEOUT_MS = 4000;
const RECHECK_INTERVAL_MS = 2 * 60 * 1000;

// Mặc định lạc quan là CHÍNH — không đổi hành vi hiện tại khi CHÍNH hoạt động bình thường.
let currentApiBaseUrl = PRIMARY_API_BASE_URL;
let currentWsUrl = PRIMARY_WS_URL;

const pingPrimary = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
        const response = await fetch(`${PRIMARY_API_BASE_URL}/health`, {
            method: 'GET',
            signal: controller.signal,
        });
        return response.ok;
    } catch (e) {
        return false;
    } finally {
        clearTimeout(timer);
    }
};

const resolveBackend = async () => {
    const primaryOk = await pingPrimary();
    const wasOnBackup = currentApiBaseUrl === BACKUP_API_BASE_URL && BACKUP_API_BASE_URL !== PRIMARY_API_BASE_URL;
    currentApiBaseUrl = primaryOk ? PRIMARY_API_BASE_URL : BACKUP_API_BASE_URL;
    currentWsUrl = primaryOk ? PRIMARY_WS_URL : BACKUP_WS_URL;

    if (BACKUP_API_BASE_URL === PRIMARY_API_BASE_URL) return primaryOk; // không có backup thật
    if (!primaryOk && !wasOnBackup) {
        console.warn('[backendResolver] Backend CHÍNH không phản hồi, đã chuyển sang BACKUP:', BACKUP_API_BASE_URL);
    } else if (primaryOk && wasOnBackup) {
        console.info('[backendResolver] Backend CHÍNH đã hoạt động trở lại, chuyển về CHÍNH:', PRIMARY_API_BASE_URL);
    }
    return primaryOk;
};

// Dò ngay khi module được load (app khởi động). request()/getSocket() chờ promise
// này trước khi gọi lần đầu để không bao giờ bắn nhầm request vào domain đã chết.
export const backendReady = resolveBackend();

// Dò lại định kỳ để tự phục hồi về CHÍNH khi nó sống lại, hoặc phát hiện CHÍNH
// chết giữa session (không chỉ lúc khởi động).
setInterval(resolveBackend, RECHECK_INTERVAL_MS);

export const getApiBaseUrl = () => currentApiBaseUrl;
export const getWsBaseUrl = () => currentWsUrl;

/**
 * Địa chỉ để CẤU HÌNH VÀO CAMERA/THIẾT BỊ (callback /vf, /hb, /sf).
 * Thiết bị phải gọi THẲNG backend (cổng 3000) chứ không qua nginx, vì backend kiểm tra
 * IP nguồn của thiết bị (allowed_source_ip). Ở chế độ cùng địa chỉ → http://<máy đang mở>:3000/api/v1,
 * đổi được bằng REACT_APP_DEVICE_CALLBACK_BASE_URL. Chế độ cũ → giữ nguyên như trước (API_BASE_URL).
 */
export const getDeviceCallbackBaseUrl = () => {
    if (process.env.REACT_APP_DEVICE_CALLBACK_BASE_URL) {
        return trimSlash(process.env.REACT_APP_DEVICE_CALLBACK_BASE_URL);
    }
    if (SAME_ORIGIN_MODE) {
        const port = process.env.REACT_APP_DEVICE_CALLBACK_PORT || '3000';
        return `http://${window.location.hostname}:${port}/api/v1`;
    }
    return currentApiBaseUrl;
};
