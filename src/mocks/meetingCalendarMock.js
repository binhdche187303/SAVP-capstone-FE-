// MOCK-BE: Dữ liệu giả cho trang Lịch cá nhân (/…/my-schedule) khi chưa có API lịch VPĐT UEL.
// Bật/tắt bằng MEETING_CALENDAR_MOCK_ENABLED (src/config/featureFlags.js).
// Dựng theo tài liệu "Mo ta ve Lich tuan UEL tren VPDT.docx" (18/10/2026): tài nguyên phòng họp/xe,
// 3 loại lịch, các trường của 1 cuộc họp và bảng hình thức vi phạm điểm danh.
// getMockMySchedule trả về ĐÚNG hình dạng GET /me/schedule; getMockMeetingDetail mô tả dữ liệu
// BE cần trả cho chi tiết + điểm danh + log ra vào. Xem docs/MOCK_CHO_BE.md mục "Lịch họp VPĐT".

/** Loại lịch theo VPĐT UEL — BE trả về trường calendarType với 1 trong 3 giá trị này. */
export const CALENDAR_TYPES = {
    leadership: {
        label: 'Lịch lãnh đạo trường', color: '#d97706', dot: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-700 border-amber-200', block: 'bg-amber-50/80 text-amber-800 border-amber-200',
        register: 'Văn thư/Thư ký', approve: 'P.HC duyệt',
    },
    other: {
        label: 'Lịch hoạt động khác', color: '#7c3aed', dot: 'bg-violet-500',
        chip: 'bg-violet-50 text-violet-700 border-violet-200', block: 'bg-violet-50/80 text-violet-800 border-violet-200',
        register: 'Văn thư/Thư ký', approve: 'P.HC duyệt',
    },
    unit: {
        label: 'Lịch đơn vị', color: '#2563eb', dot: 'bg-blue-500',
        chip: 'bg-blue-50 text-action-blue border-blue-200', block: 'bg-blue-50/80 text-action-blue border-blue-200',
        register: 'Văn thư/Thư ký, Chuyên viên', approve: 'Văn thư/Thư ký, Lãnh đạo phòng',
    },
};

/** Bảng hình thức vi phạm (docx mục Điểm danh cuộc họp). */
export const ATTENDANCE_RULES = { lateAfterMin: 5, earlyBeforeMin: 15 };
export const ATTENDANCE_STATUS = {
    present: { label: 'Có mặt', points: 0, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    late: { label: 'Đi trễ', points: -1, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    early_leave: { label: 'Về sớm', points: -1, cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    late_early: { label: 'Đi trễ + về sớm', points: -2, cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    absent: { label: 'Vắng mặt', points: -2, cls: 'bg-red-50 text-red-700 border-red-200' },
    not_arrived: { label: 'Chưa đến', points: 0, cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    upcoming: { label: 'Chưa diễn ra', points: 0, cls: 'bg-slate-50 text-slate-500 border-slate-200' },
    not_required: { label: 'Không điểm danh', points: 0, cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

/** Tài nguyên phòng họp (docx bảng 1). hasCamera=false → thư ký điểm danh tay. */
export const ROOMS = {
    A114: { name: 'Phòng A.114', capacity: '70 - 100', hasCamera: true, door: 'Cửa chính A.114' },
    A102: { name: 'Phòng A.102', capacity: '15 - 20', hasCamera: true, door: 'Cửa A.102' },
    A103: { name: 'Phòng A.103', capacity: '10 - 15', hasCamera: true, door: 'Cửa A.103' },
    A107: { name: 'Phòng A.107', capacity: '30 - 40', hasCamera: true, door: 'Cửa A.107' },
    A204BIS: { name: 'Phòng A.204bis', capacity: '15 - 20', hasCamera: true, door: 'Cửa A.204bis' },
    HTA: { name: 'Hội trường A', capacity: '500', hasCamera: true, door: 'Cửa chính Hội trường A' },
    ONLINE: { name: 'Phòng họp Online', capacity: 'Google Meet: 100 · Zoom: 300', hasCamera: false, online: true },
};
const CAMPUS = 'Cơ sở chính – 669 QL1, P. Linh Xuân, TP. Thủ Đức';

/** Tài nguyên xe ô tô (docx bảng 2). */
export const VEHICLES = {
    X29: 'Xe 29C – 50A-013.63',
    X15: 'Xe 15C – 50M1-000.86',
    X4: 'Xe 4C – 50A-010.74',
};

export const MOCK_ID_PREFIX = 'mock-';
export const isMockMeetingId = (id) => typeof id === 'string' && id.startsWith(MOCK_ID_PREFIX);

// Nhân sự giả (tên hư cấu). Mã CB dạng CBxxxx như VPĐT.
const STAFF = {
    ht: { code: 'CB0001', name: 'PGS.TS. Nguyễn Hoàng Minh', unit: 'Ban Giám hiệu', title: 'Hiệu trưởng' },
    pht1: { code: 'CB0002', name: 'TS. Trần Thị Thu Hà', unit: 'Ban Giám hiệu', title: 'Phó Hiệu trưởng' },
    pht2: { code: 'CB0003', name: 'PGS.TS. Lê Văn Phúc', unit: 'Ban Giám hiệu', title: 'Phó Hiệu trưởng' },
    bt: { code: 'CB0004', name: 'TS. Phạm Quốc Bảo', unit: 'Đảng ủy', title: 'Bí thư Đảng ủy' },
    tphc: { code: 'CB0101', name: 'ThS. Võ Thị Lan', unit: 'Phòng Hành chính', title: 'Trưởng phòng' },
    vthc: { code: 'CB0102', name: 'CN. Huỳnh Ngọc Trâm', unit: 'Phòng Hành chính', title: 'Văn thư' },
    tpdt: { code: 'CB0111', name: 'TS. Đặng Minh Khoa', unit: 'Phòng Đào tạo', title: 'Trưởng phòng' },
    cvdt: { code: 'CB0112', name: 'ThS. Bùi Thanh Tâm', unit: 'Phòng Đào tạo', title: 'Chuyên viên' },
    tpkt: { code: 'CB0121', name: 'TS. Ngô Thị Mai', unit: 'Phòng Khảo thí & ĐBCL', title: 'Trưởng phòng' },
    tpkh: { code: 'CB0131', name: 'PGS.TS. Hồ Đức Thịnh', unit: 'Phòng KH-CN', title: 'Trưởng phòng' },
    tpct: { code: 'CB0141', name: 'ThS. Lý Thanh Sơn', unit: 'Phòng Công tác sinh viên', title: 'Trưởng phòng' },
    tptc: { code: 'CB0151', name: 'ThS. Trịnh Thị Hồng', unit: 'Phòng Tài chính – Kế toán', title: 'Trưởng phòng' },
    tkhttt: { code: 'CB0201', name: 'PGS.TS. Châu Văn Lộc', unit: 'Khoa Hệ thống thông tin', title: 'Trưởng khoa' },
    pkhttt: { code: 'CB0202', name: 'TS. Mai Thị Kim Ngân', unit: 'Khoa Hệ thống thông tin', title: 'Phó Trưởng khoa' },
    vtkhttt: { code: 'CB0203', name: 'CN. Đỗ Thị Yến', unit: 'Khoa Hệ thống thông tin', title: 'Văn thư khoa' },
    gv1: { code: 'CB0211', name: 'ThS. Phan Hữu Nghĩa', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên' },
    gv2: { code: 'CB0212', name: 'TS. Vương Thị Diễm', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên' },
    gv3: { code: 'CB0213', name: 'ThS. Tạ Minh Hiếu', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên' },
    gv4: { code: 'CB0214', name: 'ThS. Kiều Ngọc Hân', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên' },
    gv5: { code: 'CB0215', name: 'TS. Lâm Gia Huy', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên' },
    tkkt: { code: 'CB0301', name: 'PGS.TS. Dương Thành Nhân', unit: 'Khoa Kinh tế', title: 'Trưởng khoa' },
    tktc: { code: 'CB0311', name: 'TS. Quách Thị Phương', unit: 'Khoa Tài chính – Ngân hàng', title: 'Trưởng khoa' },
    tkqt: { code: 'CB0321', name: 'TS. Hà Minh Tuấn', unit: 'Khoa Quản trị kinh doanh', title: 'Trưởng khoa' },
    tkkto: { code: 'CB0331', name: 'PGS.TS. La Thị Thanh', unit: 'Khoa Kế toán – Kiểm toán', title: 'Trưởng khoa' },
    dn1: { code: 'KM-01', name: 'Ông Trương Văn Hậu', unit: 'Công ty CP Công nghệ Sao Việt', title: 'Khách mời' },
};
const ALL_LEADERS = ['tpdt', 'tpkt', 'tpkh', 'tpct', 'tptc', 'tkhttt', 'tkkt', 'tktc', 'tkqt', 'tkkto'];
const KHOA_HTTT = ['tkhttt', 'pkhttt', 'vtkhttt', 'gv1', 'gv2', 'gv3', 'gv4', 'gv5'];

const readCurrentUser = () => {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return {
            code: u.userCode || u.employeeCode || u.staffCode || 'CB0216',
            name: u.fullName || u.full_name || 'Bạn (giảng viên)',
            unit: 'Khoa Hệ thống thông tin',
            title: 'Giảng viên',
            isMe: true,
        };
    } catch {
        return { code: 'CB0216', name: 'Bạn (giảng viên)', unit: 'Khoa Hệ thống thông tin', title: 'Giảng viên', isMe: true };
    }
};

/*
 * Kịch bản cuộc họp. dayOffset tính từ hôm nay; giờ HH:MM giờ VN. start 'NOW' = cuộc họp đang diễn ra
 * (bắt đầu 20 phút trước, dài 60 phút) để xem log ra vào cập nhật real-time.
 * me: vai trò của user hiện tại; meProfile: kịch bản điểm danh của user (xem PROFILE bên dưới).
 * profiles: kịch bản riêng cho từng người khác; còn lại sinh ngẫu nhiên có seed (ổn định giữa các lần tải).
 */
const TEMPLATES = [
    {
        dayOffset: -14, start: '07:30', end: '09:30', type: 'leadership', room: 'A114',
        title: 'Giao ban đầu tháng 11 – Ban Giám hiệu với lãnh đạo các đơn vị',
        content: 'Đánh giá kết quả tháng 10; triển khai kế hoạch tháng 11; công tác chuẩn bị Ngày Nhà giáo Việt Nam 20/11.',
        host: 'ht', secretary: 'vthc', participants: ['pht1', 'pht2', 'bt', 'tphc', ...ALL_LEADERS], groups: 'Ban Giám hiệu; Lãnh đạo các khoa, phòng, ban',
        me: 'attendee', meProfile: 'ontime', profiles: { tkkt: 'late', tptc: 'excused' },
        attachments: [{ name: 'Bao-cao-thang-10.pdf', size: '1,2 MB' }, { name: 'Ke-hoach-thang-11.docx', size: '86 KB' }],
        requireConclusion: true, reminder: 30, recurrence: 'Hằng tháng – thứ Hai tuần đầu', approvedBy: 'P.HC (ThS. Võ Thị Lan)',
    },
    {
        dayOffset: -10, start: '14:00', end: '16:00', type: 'unit', room: 'A107',
        title: 'Họp Hội đồng Khoa học & Đào tạo Khoa HTTT',
        content: 'Thẩm định đề cương chi tiết 4 học phần mới của CTĐT Hệ thống thông tin quản lý khóa 2027.',
        host: 'tkhttt', secretary: 'vtkhttt', participants: KHOA_HTTT.filter((k) => k !== 'tkhttt' && k !== 'vtkhttt'), groups: 'Hội đồng KH&ĐT Khoa',
        me: 'attendee', meProfile: { type: 'late', inAt: 12, reason: 'Kẹt xe trên Xa lộ Hà Nội, đã báo chủ trì', reasonApproved: true }, profiles: { gv3: 'early' },
        attachments: [{ name: 'De-cuong-4-hoc-phan.zip', size: '4,8 MB' }], requireReport: true, approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: -8, start: '08:00', end: '11:30', type: 'other', room: 'HTA',
        title: 'Hội thảo khoa học "Chuyển đổi số trong giáo dục đại học khối kinh tế"',
        content: 'Hội thảo cấp trường do Khoa HTTT chủ trì, phối hợp Phòng KH-CN và doanh nghiệp đối tác.',
        host: 'tkhttt', secretary: 'vtkhttt', participants: ['pht2', 'tpkh', 'tkkt', 'tktc', 'tkqt', 'pkhttt', 'gv1', 'gv2', 'gv4', 'gv5', 'dn1'],
        groups: 'Giảng viên toàn trường quan tâm; Doanh nghiệp đối tác; Học viên cao học',
        me: 'attendee', meProfile: 'ontime', profiles: { tkqt: 'absent' },
        attachments: [{ name: 'Ky-yeu-hoi-thao.pdf', size: '12,4 MB' }], reminder: 60, approvedBy: 'P.HC (CN. Huỳnh Ngọc Trâm)',
    },
    {
        dayOffset: -6, start: '09:00', end: '10:30', type: 'unit', room: 'ONLINE', online: 'Google Meet – meet.google.com/uel-httt-bm',
        title: 'Sinh hoạt chuyên môn Bộ môn Hệ thống thông tin quản lý',
        content: 'Thống nhất đề thi kết thúc học phần HK1; phân công chấm thi.',
        host: 'me', secretary: 'gv4', participants: ['gv1', 'gv2', 'gv3', 'gv4', 'gv5'], groups: 'Giảng viên bộ môn',
        me: 'host', meProfile: 'ontime', profiles: { gv5: { type: 'absent', reason: 'Đi công tác Hà Nội theo quyết định của Khoa', reasonApproved: true } },
        attachments: [], recurrence: 'Hằng tuần – thứ Tư', approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: -4, start: '13:30', end: '15:30', type: 'leadership', room: 'A114',
        title: 'Họp triển khai tự đánh giá CTĐT theo chuẩn AUN-QA',
        content: 'Phân công nhóm viết báo cáo tự đánh giá; tiến độ thu thập minh chứng.',
        host: 'pht1', secretary: 'tpkt', participants: ['tphc', 'tpdt', 'tkhttt', 'pkhttt', 'tkkt', 'tktc', 'gv2'], groups: 'Tổ công tác AUN-QA',
        me: 'attendee', meProfile: { type: 'early', outBeforeEnd: 35, reason: 'Có lịch dạy ca 4 tại B1.204', reasonApproved: false },
        profiles: { tkkt: 'late' }, attachments: [{ name: 'Huong-dan-AUN-QA-v4.pdf', size: '2,1 MB' }],
        requireReport: true, requireConclusion: true, restricted: true, approvedBy: 'P.HC (ThS. Võ Thị Lan)',
    },
    {
        dayOffset: -2, start: '08:30', end: '09:30', type: 'unit', room: 'A103',
        title: 'Họp xét duyệt đề tài NCKH sinh viên cấp Khoa',
        content: 'Xét chọn 12 đề tài gửi dự thi cấp trường.',
        host: 'pkhttt', secretary: 'me', participants: ['gv1', 'gv2', 'gv5'], groups: 'Tiểu ban xét duyệt',
        me: 'secretary', meProfile: { type: 'late', inAt: 9 },
        attachments: [{ name: 'Danh-sach-de-tai.xlsx', size: '45 KB' }], requireConclusion: true, approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: -1, start: '14:00', end: '15:00', type: 'unit', room: 'A102', attendance: false,
        title: 'Trao đổi kế hoạch hướng dẫn thực tập doanh nghiệp',
        content: 'Buổi trao đổi nhanh, không điểm danh.',
        host: 'tkhttt', participants: ['gv1', 'gv3', 'gv4'], groups: 'GV hướng dẫn thực tập',
        me: 'attendee', meProfile: 'ontime', approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: 0, start: '07:30', end: '08:30', type: 'unit', room: 'A204BIS',
        title: 'Giao ban đầu tuần Khoa Hệ thống thông tin',
        content: 'Rà soát công việc tuần; lịch coi thi giữa kỳ.',
        host: 'tkhttt', secretary: 'vtkhttt', participants: KHOA_HTTT.filter((k) => k !== 'tkhttt' && k !== 'vtkhttt'), groups: 'Toàn thể cán bộ khoa',
        me: 'attendee', meProfile: 'ontime', recurrence: 'Hằng tuần – thứ Sáu', approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: 0, start: 'NOW', type: 'unit', room: 'A107',
        title: 'Họp duyệt đề cương khóa luận tốt nghiệp K47',
        content: 'Duyệt 38 đề cương khóa luận; phân công giảng viên hướng dẫn và phản biện.',
        host: 'me', secretary: 'vtkhttt', participants: ['pkhttt', 'gv1', 'gv2', 'gv3', 'gv4', 'gv5'], groups: 'Hội đồng duyệt đề cương',
        me: 'host', meProfile: { type: 'ontime', inAt: -6 },
        // Các mốc rơi vào vài phút tới → xem log ra vào chạy real-time.
        profiles: {
            pkhttt: { type: 'ontime', inAt: -3 },
            gv1: { type: 'ontime', inAt: 2 },
            gv2: { type: 'brief', inAt: -1, outAt: 21, backAt: 25 },
            gv3: { type: 'late', inAt: 22 },
            gv4: { type: 'late', inAt: 24 },
            gv5: { type: 'absent', reason: 'Báo bệnh, có giấy xác nhận', reasonApproved: false },
        },
        guestAt: 23,
        attachments: [{ name: 'Danh-sach-de-cuong-K47.xlsx', size: '118 KB' }],
        requireReport: true, requireConclusion: true, reminder: 15, approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: 0, start: '16:00', end: '17:00', type: 'other', room: 'A102',
        title: 'Làm việc với Công ty CP Công nghệ Sao Việt về học bổng doanh nghiệp',
        host: 'tkhttt', participants: ['tpct', 'dn1'], groups: 'Đại diện doanh nghiệp; Phòng CTSV',
        content: 'Ký kết biên bản ghi nhớ tài trợ 20 suất học bổng năm học 2026–2027.',
        me: 'attendee', meProfile: 'ontime', approvedBy: 'P.HC (CN. Huỳnh Ngọc Trâm)',
    },
    {
        dayOffset: 1, start: '09:00', end: '10:30', type: 'leadership', room: 'A114',
        title: 'Họp Ban chỉ đạo chuyển đổi số Trường',
        content: 'Nghiệm thu giai đoạn 1 hệ thống điểm danh khuôn mặt phòng họp; kế hoạch mở rộng 8 phòng tòa A3.',
        host: 'ht', secretary: 'vthc', participants: ['pht1', 'tphc', 'tpdt', 'tptc', 'tkhttt', 'gv5'], groups: 'Ban chỉ đạo CĐS',
        me: 'attendee', attachments: [{ name: 'Bao-cao-nghiem-thu-GD1.pdf', size: '3,3 MB' }],
        requireReport: true, restricted: true, reminder: 30, approvedBy: 'P.HC (ThS. Võ Thị Lan)',
    },
    {
        dayOffset: 2, start: '14:00', end: '16:00', type: 'unit', room: 'A107', approval: 'pending',
        title: 'Họp xét học bổng khuyến khích học tập HK1 – Khoa HTTT',
        content: 'Do chuyên viên đăng ký, chờ Văn thư khoa duyệt.',
        host: 'pkhttt', secretary: 'vtkhttt', participants: ['gv1', 'gv2', 'gv3'], groups: 'Hội đồng xét học bổng Khoa',
        me: 'attendee',
    },
    {
        dayOffset: 3, start: '07:00', end: '11:30', type: 'other', room: null,
        place: 'Khu công nghệ cao TP.HCM – Lô I3, đường N2, TP. Thủ Đức', vehicle: 'X29', attendance: false,
        title: 'Đưa sinh viên tham quan doanh nghiệp tại Khu công nghệ cao',
        content: 'Tập trung 6h45 tại cổng chính, xuất phát bằng xe trường.',
        host: 'tpct', participants: ['gv1', 'gv4'], groups: 'Sinh viên năm 3 ngành HTTTQL (80 SV)',
        me: 'attendee', approvedBy: 'P.HC (CN. Huỳnh Ngọc Trâm)',
    },
    {
        dayOffset: 4, start: '08:00', end: '11:00', type: 'leadership', room: 'HTA',
        title: 'Lễ kỷ niệm 44 năm Ngày Nhà giáo Việt Nam 20/11',
        content: 'Tôn vinh nhà giáo tiêu biểu; trao kỷ niệm chương.',
        host: 'ht', secretary: 'vthc', participants: ['pht1', 'pht2', 'bt', ...ALL_LEADERS, 'pkhttt', 'gv1', 'gv2', 'gv3', 'gv4', 'gv5'],
        groups: 'Toàn thể viên chức, người lao động; Đại biểu khách mời',
        me: 'attendee', reminder: 60, approvedBy: 'P.HC (ThS. Võ Thị Lan)',
    },
    {
        dayOffset: 7, start: '09:00', end: '10:30', type: 'unit', room: 'ONLINE', online: 'Zoom – ID 842 113 2026',
        title: 'Sinh hoạt chuyên môn Bộ môn Hệ thống thông tin quản lý',
        content: 'Báo cáo tiến độ chấm thi; góp ý đề cương học phần mới.',
        host: 'me', secretary: 'gv4', participants: ['gv1', 'gv2', 'gv3', 'gv4', 'gv5'], groups: 'Giảng viên bộ môn',
        me: 'host', recurrence: 'Hằng tuần – thứ Tư', approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
    {
        dayOffset: 9, start: '13:30', end: '16:30', type: 'leadership', room: 'HTA',
        title: 'Hội nghị viên chức, người lao động năm học 2026–2027',
        host: 'ht', secretary: 'tphc', participants: ['pht1', 'pht2', 'bt', ...ALL_LEADERS, 'gv1', 'gv2'], groups: 'Toàn thể viên chức, người lao động',
        content: 'Báo cáo tổng kết năm học; thông qua quy chế chi tiêu nội bộ sửa đổi.',
        me: 'attendee', attachments: [{ name: 'Du-thao-quy-che-chi-tieu.pdf', size: '780 KB' }],
        requireReport: true, reminder: 60, approvedBy: 'P.HC (ThS. Võ Thị Lan)',
    },
    {
        dayOffset: 12, start: '08:30', end: '10:00', type: 'other', room: 'A114',
        title: 'Họp kế hoạch tổ chức thi kết thúc học phần HK1',
        content: 'Phòng Khảo thí chủ trì, các khoa phối hợp bố trí cán bộ coi thi.',
        host: 'tpkt', secretary: 'cvdt', participants: ['tpdt', 'tkhttt', 'tkkt', 'tktc', 'tkqt', 'tkkto', 'gv3'], groups: 'Đại diện các khoa',
        me: 'attendee', approvedBy: 'P.HC (CN. Huỳnh Ngọc Trâm)',
    },
    {
        dayOffset: -3, start: '15:00', end: '16:00', type: 'unit', room: 'A103', approval: 'cancelled',
        title: 'Họp nhóm nghiên cứu đề tài cấp Bộ', content: 'Hủy do chủ trì đi công tác.',
        host: 'gv5', participants: ['gv2'], me: 'attendee', cancelReason: 'Chủ trì đi công tác đột xuất', approvedBy: 'Văn thư khoa (CN. Đỗ Thị Yến)',
    },
];

const pad = (n) => String(n).padStart(2, '0');
const MIN = 60000;

/** ISO có offset +07:00 cho ngày `date` (giờ máy) + chuỗi HH:MM. */
const toIso = (date, hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(h)}:${pad(m)}:00+07:00`;
};

// Sinh số giả ngẫu nhiên ổn định theo seed (mulberry32).
const seeded = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hashOf = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const between = (rnd, a, b) => Math.round(a + rnd() * (b - a));

// Thời điểm "hôm nay" cố định theo ngày để giờ họp 'NOW' không trôi khi poll.
let anchor = null;
const getAnchor = () => {
    const now = Date.now();
    const dayKey = new Date().toDateString();
    if (!anchor || anchor.dayKey !== dayKey) {
        const s = new Date(now - 20 * MIN);
        s.setSeconds(0, 0);
        anchor = { dayKey, nowStart: s.getTime() };
    }
    return anchor;
};

const randomProfile = (rnd) => {
    const r = rnd();
    if (r < 0.70) return 'ontime';
    if (r < 0.82) return 'late';
    if (r < 0.90) return 'early';
    if (r < 0.95) return 'absent';
    return 'brief';
};

/** Từ kịch bản → danh sách sự kiện ra/vào (phút lệch so với giờ bắt đầu / kết thúc). */
const planEvents = (profile, S, E, rnd) => {
    const p = typeof profile === 'string' ? { type: profile } : profile;
    const ev = [];
    if (p.type === 'absent' || p.type === 'excused') return { p, ev };
    const inAt = p.inAt ?? (p.type === 'late' ? between(rnd, 7, 22) : between(rnd, -12, 4));
    ev.push({ t: S + inAt * MIN, dir: 'in' });
    if (p.type === 'brief') {
        const outAt = p.outAt ?? between(rnd, 25, 40);
        ev.push({ t: S + outAt * MIN, dir: 'out' });
        ev.push({ t: S + (p.backAt ?? outAt + between(rnd, 4, 9)) * MIN, dir: 'in' });
    }
    if (p.type === 'early') {
        ev.push({ t: E - (p.outBeforeEnd ?? between(rnd, 20, 45)) * MIN, dir: 'out' });
    } else {
        ev.push({ t: E + between(rnd, 0, 6) * MIN, dir: 'out' });
    }
    return { p, ev };
};

/** Áp luật điểm danh của docx cho 1 người tại thời điểm nowTs. */
const evaluate = ({ events, profile, manual }, S, E, nowTs, attendanceEnabled) => {
    if (!attendanceEnabled) return { status: 'not_required', points: 0 };
    if (nowTs < S) return { status: 'upcoming', points: 0 };
    const seen = events.filter((e) => e.t <= nowTs);
    const firstIn = seen.find((e) => e.dir === 'in');
    const last = seen[seen.length - 1];
    const ended = nowTs > E;
    let status;
    if (!firstIn) {
        status = ended ? 'absent' : 'not_arrived';
    } else {
        const late = firstIn.t > S + ATTENDANCE_RULES.lateAfterMin * MIN;
        const early = ended && last?.dir === 'out' && last.t < E - ATTENDANCE_RULES.earlyBeforeMin * MIN;
        status = late && early ? 'late_early' : late ? 'late' : early ? 'early_leave' : 'present';
    }
    const base = ATTENDANCE_STATUS[status].points;
    const excused = Boolean(profile.reason && profile.reasonApproved && base < 0);
    return {
        status,
        points: excused ? 0 : base,
        excused,
        checkInAt: firstIn ? new Date(firstIn.t).toISOString() : null,
        checkOutAt: last?.dir === 'out' ? new Date(last.t).toISOString() : null,
        inside: last?.dir === 'in',
        source: manual ? 'manual' : 'camera',
        reason: profile.reason || '',
        reasonStatus: profile.reason ? (profile.reasonApproved ? 'approved' : 'pending') : null,
    };
};

const buildOne = (t, i, me, nowTs) => {
    const today = new Date(nowTs);
    today.setHours(0, 0, 0, 0);
    const day = new Date(today);
    day.setDate(day.getDate() + t.dayOffset);

    let S;
    let E;
    if (t.start === 'NOW') {
        S = getAnchor().nowStart;
        E = S + 60 * MIN;
    } else {
        S = new Date(toIso(day, t.start)).getTime();
        E = new Date(toIso(day, t.end)).getTime();
    }

    const approval = t.approval || 'approved';
    const status = approval === 'pending' ? 'pending_approval'
        : approval === 'cancelled' ? 'cancelled'
            : E < nowTs ? 'completed' : S <= nowTs ? 'in_progress' : 'scheduled';

    const room = t.room ? ROOMS[t.room] : null;
    const manual = !room?.hasCamera;
    const attendanceEnabled = t.attendance !== false;
    const person = (key) => (key === 'me' ? me : STAFF[key]);
    const host = person(t.host);
    const secretary = t.secretary ? person(t.secretary) : null;

    const memberKeys = [t.host, ...(t.secretary ? [t.secretary] : []), ...t.participants];
    if (!memberKeys.includes('me')) memberKeys.push('me');
    const uniq = [...new Set(memberKeys)];

    const rnd = seeded(1000 + i * 97);
    const members = uniq.map((key) => {
        const info = person(key);
        const profile = key === 'me' ? (t.meProfile || 'ontime') : (t.profiles?.[key] || randomProfile(rnd));
        const { p, ev } = planEvents(profile, S, E, rnd);
        const role = key === t.host ? 'host' : key === t.secretary ? 'secretary' : 'attendee';
        return { key, ...info, role, profile: p, events: ev, manual };
    });

    return { t, i, S, E, status, approval, room, manual, attendanceEnabled, host, secretary, members };
};

const buildAll = (nowTs) => {
    const me = readCurrentUser();
    return TEMPLATES.map((t, i) => buildOne(t, i, me, nowTs));
};

const meetingId = (i) => `${MOCK_ID_PREFIX}${i + 1}`;
const roomLabel = (b) => (b.room ? b.room.name : b.t.place || 'Chưa xác định');

/**
 * Giả lập GET /me/schedule — cùng tham số ({ from, to, status }) và cùng response
 * ({ success, data: { items } }) với employeeServices.getMySchedule.
 * Thêm: calendarType, hostName, attendanceEnabled, myAttendance (điểm danh của chính mình).
 */
export const getMockMySchedule = async (params = {}) => {
    const nowTs = Date.now();
    const fromTs = params.from ? new Date(params.from).getTime() : -Infinity;
    const toTs = params.to ? new Date(params.to).getTime() : Infinity;
    const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : null;

    const items = buildAll(nowTs)
        .filter((b) => b.S >= fromTs && b.S <= toTs && (!statuses || statuses.includes(b.status)))
        .map((b) => {
            const mine = b.members.find((m) => m.isMe);
            const att = b.status === 'cancelled' || b.status === 'pending_approval'
                ? null
                : evaluate(mine, b.S, b.E, nowTs, b.attendanceEnabled);
            return {
                meetingId: meetingId(b.i),
                title: b.t.title,
                roomName: roomLabel(b),
                location: b.room?.online ? b.t.online : b.room ? CAMPUS : b.t.place,
                startTime: new Date(b.S).toISOString(),
                endTime: new Date(b.E).toISOString(),
                userRole: mine.role,
                status: b.status,
                calendarType: b.t.type,
                hostName: b.host.name,
                attendanceEnabled: b.attendanceEnabled,
                myAttendance: att,
            };
        });

    await new Promise((r) => setTimeout(r, 250));
    return { success: true, data: { items } };
};

/**
 * Chi tiết 1 cuộc họp tại thời điểm nowTs — gồm đủ trường VPĐT, bảng điểm danh và log ra vào camera.
 * Gọi lại mỗi vài giây để thấy log/số liệu cập nhật như real-time.
 */
export const getMockMeetingDetail = (id, nowTs = Date.now()) => {
    const idx = Number(String(id).slice(MOCK_ID_PREFIX.length)) - 1;
    const t = TEMPLATES[idx];
    if (!t) return null;
    const b = buildOne(t, idx, readCurrentUser(), nowTs);

    const attendance = b.members.map((m) => ({
        code: m.code, name: m.name, unit: m.unit, title: m.title, role: m.role, isMe: Boolean(m.isMe),
        ...evaluate(m, b.S, b.E, nowTs, b.attendanceEnabled),
    }));

    const accessLog = [];
    if (!b.manual) {
        b.members.forEach((m) => m.events.forEach((e) => {
            if (e.t <= nowTs) {
                accessLog.push({
                    time: new Date(e.t).toISOString(), direction: e.dir, code: m.code, name: m.name,
                    unit: m.unit, door: b.room.door, confidence: 0.9 + (hashOf(`${m.code}${e.t}`) % 9) / 100,
                });
            }
        }));
        if (t.guestAt && b.S + t.guestAt * MIN <= nowTs) {
            accessLog.push({
                time: new Date(b.S + t.guestAt * MIN).toISOString(), direction: 'in', code: null,
                name: 'Người chưa định danh', unit: 'Chưa đăng ký khuôn mặt', door: b.room.door, confidence: 0.41, unknown: true,
            });
        }
        accessLog.sort((a, c) => new Date(c.time) - new Date(a.time));
    }

    const counted = attendance.filter((a) => !['upcoming', 'not_required'].includes(a.status));
    const count = (fn) => attendance.filter(fn).length;
    const summary = {
        invited: attendance.length,
        present: count((a) => a.status === 'present'),
        late: count((a) => a.status === 'late' || a.status === 'late_early'),
        earlyLeave: count((a) => a.status === 'early_leave' || a.status === 'late_early'),
        absent: count((a) => a.status === 'absent'),
        notArrived: count((a) => a.status === 'not_arrived'),
        excused: count((a) => a.excused),
        inside: b.status === 'in_progress' ? count((a) => a.inside) : 0,
        totalPoints: counted.reduce((s, a) => s + a.points, 0),
    };

    return {
        meetingId: meetingId(idx),
        title: t.title,
        content: t.content || '',
        calendarType: t.type,
        status: b.status,
        approval: b.approval,
        approvedBy: b.approval === 'approved' || b.approval === 'cancelled' ? t.approvedBy : null,
        cancelReason: t.cancelReason || null,
        startTime: new Date(b.S).toISOString(),
        endTime: new Date(b.E).toISOString(),
        room: b.room ? { ...b.room } : null,
        place: b.room?.online ? t.online : b.room ? CAMPUS : t.place,
        vehicle: t.vehicle ? VEHICLES[t.vehicle] : null,
        host: b.host,
        secretary: b.secretary,
        participantGroups: t.groups || '',
        attachments: t.attachments || [],
        requireReport: Boolean(t.requireReport),
        requireConclusion: Boolean(t.requireConclusion),
        restrictedView: Boolean(t.restricted),
        reminderMinutes: t.reminder ?? 10,
        recurrence: t.recurrence || null,
        attendanceEnabled: b.attendanceEnabled,
        attendanceSource: b.manual ? 'manual' : 'camera',
        myRole: attendance.find((a) => a.isMe)?.role || 'attendee',
        attendance,
        accessLog,
        summary,
    };
};
