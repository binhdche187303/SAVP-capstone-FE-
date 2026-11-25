import { get, post } from '../utils/request';

/** GET /api/v1/me/biometric-status — kèm `profile` (ảnh các góc, lý do Cần kiểm tra / Bị gỡ). */
export const getBiometricStatus = async () => get('/me/biometric-status');

// Phát khi trạng thái sinh trắc học của chính người dùng thay đổi (vd: vừa đăng ký),
// để menu tài khoản (useFaceStatus) cập nhật ngay mà không cần đăng nhập lại.
export const BIOMETRIC_STATUS_EVENT = 'biometric-status-changed';

/**
 * [2026-11-23] POST /api/v1/me/biometric-scan (multipart) — đăng ký FaceID bằng quét webcam 5 góc.
 * Tự duyệt: qua kiểm tra → "Đã đăng ký"; trùng định danh người khác → "Cần kiểm tra".
 * @param {{pose: string, blob: Blob, meta?: object}[]} captures theo đúng thứ tự góc quét
 * @param {boolean} consentAccepted
 */
export const submitBiometricScan = async (captures, consentAccepted) => {
    const formData = new FormData();
    captures.forEach(({ pose, blob }) => formData.append('files', blob, `${pose}.jpg`));
    formData.append('poses', captures.map((c) => c.pose).join(','));
    formData.append('consentAccepted', consentAccepted ? 'true' : 'false');
    formData.append(
        'clientMeta',
        JSON.stringify({
            poses: Object.fromEntries(captures.map((c) => [c.pose, c.meta ?? null])),
            userAgent: navigator.userAgent,
        }),
    );
    const res = await post('/me/biometric-scan', formData, { skipToast: true });
    if (res?.success) window.dispatchEvent(new Event(BIOMETRIC_STATUS_EVENT));
    return res;
};

/**
 * Cập nhật avatar hiển thị (đổi ảnh hồ sơ) — độc lập với FaceID.
 * @param {File} file
 */
export const updateSelfAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return post('/me/avatar', formData);
};
