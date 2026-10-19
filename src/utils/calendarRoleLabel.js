// Lịch tuần UEL: nhãn vai trò lịch gán trên tài khoản (không phải role hệ thống).
const LEADERSHIP_LABELS = {
    HIEU_TRUONG: 'Hiệu trưởng',
    PHO_HIEU_TRUONG: 'Phó Hiệu trưởng',
    BI_THU: 'Bí thư Đảng ủy',
    PHO_BI_THU: 'Phó Bí thư Đảng ủy',
};

/** Trả về nhãn hiển thị thay cho nhãn role, hoặc null nếu tài khoản không có vai trò lịch. */
export const getCalendarRoleLabel = (user) => {
    if (!user) return null;
    if (user.leadershipTitle) return LEADERSHIP_LABELS[user.leadershipTitle] || 'Ban Giám hiệu';
    if (user.isUnitClerk) return 'Văn thư';
    return null;
};
export const LEADERSHIP_TITLE_LABELS = LEADERSHIP_LABELS;
