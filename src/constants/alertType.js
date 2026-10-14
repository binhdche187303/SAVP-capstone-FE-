// Nhãn tiếng Việt cho security_alerts.alert_type (BE: create-alert-rule.dto.ts ALERT_TYPES).
// Nguồn DUY NHẤT — mọi nơi hiển thị alert_type (SecurityAlerts.jsx, NotificationBell.jsx,
// dashboard system-admin/business-admin) đều import từ đây, không tự khai lại.
export const ALERT_TYPE_VI = {
    stranger: 'Người lạ',
    crowd: 'Đám đông',
    intrusion: 'Xâm nhập',
    person_watchlist_match: 'Đối tượng theo dõi',
    unknown_vehicle: 'Xe lạ',
    // Biển số CÓ đăng ký nhưng đang chờ duyệt/bị từ chối — khác 'unknown_vehicle' (không có đăng ký nào).
    vehicle_unauthorized: 'Xe không được phép',
    vehicle_control_match: 'Biển số theo dõi',
    device_error: 'Lỗi thiết bị',
    device_maintenance: 'Camera cần bảo trì',
    visitor_overstay: 'Khách quá giờ',
    visitor_must_leave: 'Khách phải rời',
    visitor_zone_violation: 'Khách vào sai khu vực',
};

// Fallback cho giá trị alert_type chưa có trong bảng dịch — vẫn hiện được thay vì undefined.
export const getAlertTypeLabel = (type) =>
    ALERT_TYPE_VI[type] || type?.replace(/_/g, ' ') || '—';
