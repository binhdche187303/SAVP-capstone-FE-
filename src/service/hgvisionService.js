import { get, post, buildQuery } from '../utils/request';
import { getApiBaseUrl } from '../utils/backendResolver';

// ============================================================
// HGVision camera — BE proxy (/api/v1/hgvision/*). FE không gọi thẳng máy HGVision.
// ============================================================

/** GET /hgvision/cameras — danh sách camera + tình trạng + liveUrl. meta: {total, online} */
export const getHgCameras = (options = {}) => get('/hgvision/cameras', { skipToast: true, ...options });

/** GET /hgvision/cameras/:name/health — tình trạng chi tiết 1 camera. */
export const getHgCameraHealth = (name, options = {}) =>
    get(`/hgvision/cameras/${encodeURIComponent(name)}/health`, { skipToast: true, ...options });

/** GET /hgvision/cameras/:name/logs?limit= — nhật ký kết nối 1 camera. */
export const getHgCameraLogs = (name, params = { limit: 20 }, options = {}) =>
    get(`/hgvision/cameras/${encodeURIComponent(name)}/logs${buildQuery(params)}`, { skipToast: true, ...options });

/**
 * Đổi liveUrl BE trả về (`/api/v1/hgvision/live/<cam>/index.m3u8`) thành URL tuyệt đối
 * theo backend đang dùng (API_BASE_URL kết thúc bằng /api/v1).
 */
export const toBackendUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
};

/** POST /hgvision/cameras/:name/snapshot — BE lấy 1 khung hình từ luồng live và lưu lịch sử. */
export const captureHgSnapshot = (name, options = {}) =>
    post(`/hgvision/cameras/${encodeURIComponent(name)}/snapshot`, {}, { skipToast: true, ...options });

/** GET /hgvision/snapshots?camera=&limit= — ảnh chụp gần đây (mới nhất trước). */
export const getHgSnapshots = (params = { limit: 5 }, options = {}) =>
    get(`/hgvision/snapshots${buildQuery(params)}`, { skipToast: true, ...options });

/** GET /hgvision/snapshots/:id/file — file PNG (blob, kèm token). */
export const getHgSnapshotFile = (id, options = {}) =>
    get(`/hgvision/snapshots/${encodeURIComponent(id)}/file`, { skipToast: true, responseType: 'blob', ...options });

// ---------------- Xem lại (playback) ----------------

/**
 * GET /hgvision/playback/recordings?camera=&from=&to= (epoch ms, tối đa 24 giờ).
 * data: { ranges: [{startMs,endMs}], segments: [{startMs,endMs,thumbUrl}] }
 */
export const getHgPlaybackRecordings = ({ camera, from, to }, options = {}) =>
    get(`/hgvision/playback/recordings${buildQuery({ camera, from, to })}`, { skipToast: true, ...options });

/** URL tuyệt đối của playlist HLS xem lại (HlsPlayer tự gắn Bearer token). */
export const hgPlaybackPlaylistUrl = ({ camera, from, to }) =>
    toBackendUrl(`/api/v1/hgvision/playback/playlist.m3u8${buildQuery({ camera, from, to })}`);

/** GET /hgvision/playback/download — MP4 (blob, tối đa 1 giờ). */
export const downloadHgPlayback = ({ camera, from, to }, options = {}) =>
    get(`/hgvision/playback/download${buildQuery({ camera, from, to })}`, { skipToast: true, responseType: 'blob', ...options });

/** Ảnh thumbnail đoạn ghi qua proxy BE (thumbUrl đã gồm /api/v1) — trả blob vì <img> không gắn được token. */
export const getHgMediaBlob = (path, options = {}) =>
    get(String(path).replace(/^\/api\/v1/, ''), { skipToast: true, responseType: 'blob', ...options });

/** GET /hgvision/resources — tài nguyên máy chủ HGVision: {cpu, memory, disk:{percent,used,total}, gpu}. */
export const getHgResources = (options = {}) => get('/hgvision/resources', { skipToast: true, ...options });

/** GET /hgvision/groups — nhóm camera trên HGVision. */
export const getHgGroups = (options = {}) => get('/hgvision/groups', { skipToast: true, ...options });

/** POST /hgvision/cameras — thêm camera RTSP sang HGVision (quyền hgvision.camera.write). */
export const createHgCamera = (body, options = {}) => post('/hgvision/cameras', body, { skipToast: true, ...options });
