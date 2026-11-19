// Trạng thái đồng bộ biển số SAVP → HGVision (null = chưa dùng HGVision → không hiển thị).
// Dùng chung: Danh sách biển số giám sát, Đăng ký phương tiện (system admin), Phương tiện cá nhân.
export const HGV_SYNC = {
    synced: { text: 'Đã đồng bộ HGVision', cls: 'text-emerald-700' },
    pending: { text: 'Chưa đồng bộ HGVision (ghi đang tắt)', cls: 'text-amber-700' },
    failed: { text: 'Đồng bộ HGVision lỗi', cls: 'text-red-700' },
};
