// Nhãn tiếng Việt và hàm định dạng dùng chung cho phân hệ Khách đến làm việc (2.10).

export const VISIT_STATUS_META = {
    pending_approval: { label: 'Chờ duyệt', cls: 'text-amber-700 bg-amber-50' },
    approved: { label: 'Đã duyệt', cls: 'text-action-blue bg-blue-50' },
    checked_in: { label: 'Đang trong khuôn viên', cls: 'text-green-700 bg-green-50' },
    checked_out: { label: 'Đã rời', cls: 'text-slate-blue bg-pale-gray' },
    rejected: { label: 'Từ chối', cls: 'text-red-700 bg-red-50' },
    cancelled: { label: 'Đã hủy', cls: 'text-slate-blue bg-pale-gray' },
    revoked: { label: 'Đã thu hồi', cls: 'text-red-700 bg-red-50' },
    expired: { label: 'Hết hạn', cls: 'text-slate-blue bg-pale-gray' },
    must_leave: { label: 'Phải rời khuôn viên', cls: 'text-white bg-red-600' },
    exit_unrecorded: { label: 'Chưa ghi nhận giờ ra', cls: 'text-amber-700 bg-amber-50' },
};

export const VISIT_CHANNEL_LABELS = {
    online: 'Tự đăng ký trực tuyến',
    host_invite: 'Cán bộ mời',
    walk_in: 'Lễ tân nhập',
};

export const VISIT_EVENT_LABELS = {
    registered: 'Đã gửi đăng ký',
    approved: 'Đã duyệt',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
    revoked: 'Thu hồi quyền ra vào',
    extended: 'Gia hạn quyền ra vào',
    photo_added: 'Bổ sung ảnh khuôn mặt',
    face_verified: 'Xác thực khuôn mặt thành công',
    manual_review: 'Cần lễ tân xác minh',
    access_denied: 'Từ chối ra vào',
    check_in: 'Vào khuôn viên',
    check_out: 'Rời khuôn viên',
    expired: 'Hết hiệu lực, khách không đến',
    face_removed: 'Đã gỡ khuôn mặt khỏi thiết bị',
    email_sent: 'Đã gửi email',
    host_notified: 'Đã thông báo người được gặp',
    security_notified: 'Đã báo bảo vệ',
    manual_close: 'Đóng lượt thủ công',
    exit_unrecorded: 'Chưa ghi nhận giờ ra',
};

export const GATE_REASON_LABELS = {
    outside_window: 'Ngoài khung giờ được cấp',
    zone_not_allowed: 'Khu vực không được phép',
    invalid_status: 'Lượt khách chưa được duyệt hoặc đã đóng',
    low_score: 'Độ khớp khuôn mặt dưới ngưỡng 80%',
    no_photo: 'Chưa có ảnh khuôn mặt',
    access_revoked: 'Quyền ra vào đã bị thu hồi',
    already_inside: 'Khách đã ở trong khuôn viên',
    not_on_site: 'Khách chưa vào khuôn viên',
};

export const CLOSE_REASON_LABELS = {
    left_unrecorded: 'Khách đã rời, camera không ghi nhận',
    not_found: 'Không tìm thấy khách, báo bảo vệ',
};


const pad = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// 07/10 08:30
export const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 07/10 08:30 – 10:30 (khác ngày thì ghi đủ hai đầu)
export const fmtTimeRange = (from, to) => {
    if (!from || !to) return '—';
    const a = new Date(from);
    const b = new Date(to);
    const end = sameDay(a, b) ? `${pad(b.getHours())}:${pad(b.getMinutes())}` : fmtDateTime(to);
    return `${fmtDateTime(from)} – ${end}`;
};

// "Tòa A1 · 07/10 10:20" — lần cuối camera thấy khách (BR-V16).
export const fmtLastSeen = (lastSeen) => (lastSeen ? `${lastSeen.zoneName} · ${fmtDateTime(lastSeen.at)}` : '—');

export const fmtScore = (score) => (score === null || score === undefined ? '—' : `${Math.round(score * 100)}%`);

// Chuyển qua lại giữa ISO và giá trị của <input type="datetime-local"> (giờ máy).
export const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '');
