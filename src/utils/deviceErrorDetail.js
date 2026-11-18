// Loại lỗi thiết bị theo payload_json.reason (BE hiện ghi 'offline'; các mã khác để sẵn).
const DEVICE_ERROR_REASON = {
    offline: 'Mất kết nối',
    faulty: 'Hỏng / lỗi phần cứng',
    hardware: 'Hỏng / lỗi phần cứng',
    stream_error: 'Mất hình (lỗi luồng video)',
    no_signal: 'Mất tín hiệu',
    maintenance: 'Đang bảo trì',
};

/**
 * Lỗi thiết bị: { kind: loại lỗi (Mất kết nối, Hỏng…), devices: [{ name, code }] } hoặc null.
 * Camera lấy từ payload_json.offlineDevices[] (nhiều camera rớt cùng lúc) hoặc deviceName/deviceCode.
 */
export const getDeviceErrorDetail = (alert) => {
    if (alert?.alert_type !== 'device_error') return null;
    const p = alert.payload_json || {};
    const raw = Array.isArray(p.offlineDevices) && p.offlineDevices.length
        ? p.offlineDevices
        : (p.deviceName || p.deviceCode ? [p] : []);
    return {
        kind: DEVICE_ERROR_REASON[p.reason] || (p.reason ? String(p.reason) : 'Lỗi không xác định'),
        devices: raw.map(d => ({ name: d.deviceName || d.deviceCode || 'Camera', code: d.deviceName ? d.deviceCode || '' : '' })),
    };
};
