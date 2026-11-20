// Trạng thái đồng bộ biển số SAVP → HGVision (null = chưa dùng HGVision → không hiển thị).
// Dùng chung: Danh sách biển số giám sát, Đăng ký phương tiện (system admin), Phương tiện cá nhân.
export const HGV_SYNC = {
    synced: { text: 'Đã đồng bộ HGVision', cls: 'text-emerald-700' },
    pending: { text: 'Chưa đồng bộ HGVision (ghi đang tắt)', cls: 'text-amber-700' },
    failed: { text: 'Đồng bộ HGVision lỗi', cls: 'text-red-700' },
    // Đối soát định kỳ: bị sửa tay bên HGVision (SAVP không ghi đè) / bị xoá chưa khôi phục.
    mismatch: { text: 'Lệch với hệ thống nhận diện', cls: 'text-orange-600' },
    missing: { text: 'Bị xoá bên hệ thống nhận diện', cls: 'text-orange-600' },
};

// Trạng thái cho phép bấm ↻ (đẩy lại dữ liệu SAVP sang HGVision).
export const HGV_RESYNCABLE = ['failed', 'pending', 'mismatch', 'missing'];

export const resyncTitle = (status) =>
    status === 'mismatch'
        ? 'Ghi đè HGVision bằng dữ liệu SAVP'
        : 'Đồng bộ lại sang HGVision';
