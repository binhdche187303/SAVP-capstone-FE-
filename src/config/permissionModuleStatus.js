// Cảnh báo cho UI cấp quyền (RolePermissionManagement.jsx) khi 1 permission module chưa có
// màn hình tương ứng — để admin biết trước khi gán, thay vì gán xong không thấy gì xảy ra.
//
// status: 'partial' | 'missing' | 'orphaned'
// note: nội dung tooltip hiển thị cạnh permission thuộc module đó.
//
// Đây là config sống, không phải logic gating — dev cập nhật khi thêm/gỡ màn hình. Độc lập với
// navigationRegistry.js/buildDynamicNavigation.js (nơi build menu thật); file này chỉ gắn nhãn
// cảnh báo. Module không có mặt ở đây coi như đã có màn hình đầy đủ (không cảnh báo).
export const PERMISSION_MODULE_STATUS = {
    face_access: {
        status: 'missing',
        note: 'Chưa có màn hình cho quyền thuộc nhóm này.',
    },
    ivss: {
        status: 'partial',
        note: 'ivss.access_log.read: chưa có API backend. ivss.health.read: chưa có màn hình. ivss.presence.read: chỉ xem được trong chi tiết cuộc họp, chưa có màn riêng.',
    },
    minutes: {
        status: 'partial',
        note: 'Chỉ xem được trong chi tiết cuộc họp, chưa có màn riêng.',
    },
    scheduling: {
        status: 'partial',
        note: 'Chỉ dùng ngầm khi đặt lịch họp, chưa có màn riêng.',
    },
    transcription: {
        status: 'partial',
        note: 'Chỉ xem được trong chi tiết cuộc họp, chưa có màn riêng.',
    },
    campus_dashboard: {
        status: 'partial',
        note: 'Cần xác nhận thêm phạm vi màn hình đang phủ.',
    },
    attendance: {
        status: 'unknown',
        note: 'Chưa xác định được màn hình tương ứng — cần audit thêm.',
    },
};
