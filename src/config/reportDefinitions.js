// Khai báo 7 loại báo cáo của Trung tâm báo cáo (2.13): bộ lọc, KPI, biểu đồ, cột bảng.
// Đây là cấu hình giao diện, giữ nguyên khi có BE thật. `lookup` trỏ tới khóa của
// `getReportLookups()`; `options` là danh sách cố định.
import { Briefcase, GraduationCap, DoorOpen, Building2, Car, UserCheck, ShieldAlert } from 'lucide-react';

const col = (key, label, format = 'text') => ({ key, label, format });
const kpi = (key, label, format = 'number') => ({ key, label, format });
const lookup = (key, label, source) => ({ key, label, lookup: source });
const options = (key, label, pairs) => ({ key, label, options: pairs.map(([value, text]) => ({ value, label: text })) });
const chart = (key, title, kind, xKey, series) => ({
    key, title, kind, xKey,
    series: series.map(([seriesKey, label]) => ({ key: seriesKey, label })),
});

export const REPORT_DEFINITIONS = {
    'staff-attendance': {
        type: 'staff-attendance',
        title: 'Chuyên cần cán bộ',
        description: 'Ngày công, đi muộn, về sớm và giờ hiện diện của cán bộ theo đơn vị.',
        icon: Briefcase,
        filters: [lookup('departmentId', 'Đơn vị', 'departments'), lookup('staffId', 'Cán bộ', 'staff')],
        kpis: [
            kpi('attendanceRate', 'Tỷ lệ chuyên cần', 'percent'),
            kpi('lateCount', 'Lượt đi muộn'),
            kpi('earlyLeaveCount', 'Lượt về sớm'),
            kpi('absentDays', 'Ngày vắng'),
            kpi('avgHoursPerDay', 'Giờ hiện diện TB/ngày', 'hours'),
        ],
        charts: [
            chart('daily', 'Tỷ lệ chuyên cần theo ngày', 'line', 'date', [['rate', 'Tỷ lệ (%)']]),
            chart('byDepartment', 'So sánh theo đơn vị', 'bar', 'name', [['rate', 'Tỷ lệ (%)']]),
        ],
        columns: [
            col('employeeCode', 'Mã CB'), col('fullName', 'Họ tên'), col('departmentName', 'Đơn vị'),
            col('workDays', 'Ngày công', 'number'), col('onTime', 'Đúng giờ', 'number'), col('late', 'Đi muộn', 'number'),
            col('earlyLeave', 'Về sớm', 'number'), col('absent', 'Vắng', 'number'),
            col('totalHours', 'Tổng giờ hiện diện', 'hours'), col('rate', 'Tỷ lệ', 'percent'),
        ],
    },
    'student-attendance': {
        type: 'student-attendance',
        title: 'Chuyên cần sinh viên',
        description: 'Có mặt, đi muộn, vắng của sinh viên theo lớp học phần, môn học và học kỳ.',
        icon: GraduationCap,
        filters: [
            lookup('semesterId', 'Học kỳ', 'semesters'),
            lookup('subjectId', 'Môn học', 'subjects'),
            lookup('classSectionId', 'Lớp học phần', 'classSections'),
        ],
        kpis: [
            kpi('attendanceRate', 'Tỷ lệ chuyên cần', 'percent'),
            kpi('sessionCount', 'Số buổi'),
            kpi('absentCount', 'Lượt vắng'),
            kpi('lateCount', 'Lượt muộn'),
            kpi('atRiskStudents', 'SV vắng quá 20%'),
        ],
        charts: [
            chart('weekly', 'Tỷ lệ chuyên cần theo tuần', 'line', 'week', [['rate', 'Tỷ lệ (%)']]),
            chart('bySection', 'So sánh theo lớp học phần', 'bar', 'name', [['rate', 'Tỷ lệ (%)']]),
        ],
        columns: [
            col('studentCode', 'MSSV'), col('fullName', 'Họ tên'), col('classSectionName', 'Lớp học phần'),
            col('subjectName', 'Môn'), col('sessions', 'Số buổi', 'number'), col('present', 'Có mặt', 'number'),
            col('late', 'Muộn', 'number'), col('absent', 'Vắng', 'number'), col('rate', 'Tỷ lệ', 'percent'),
            col('warning', 'Cảnh báo'),
        ],
    },
    'gate-access': {
        type: 'gate-access',
        title: 'Ra vào khuôn viên',
        description: 'Lượt vào, lượt ra và thời gian lưu trú tại các cổng theo đối tượng.',
        icon: DoorOpen,
        filters: [
            lookup('zoneId', 'Cổng', 'gates'),
            lookup('departmentId', 'Đơn vị', 'departments'),
            options('subjectType', 'Đối tượng', [['staff', 'Cán bộ'], ['student', 'Sinh viên'], ['visitor', 'Khách'], ['unknown', 'Vãng lai']]),
        ],
        kpis: [
            kpi('entries', 'Lượt vào'), kpi('exits', 'Lượt ra'), kpi('onSite', 'Đang trong khuôn viên'),
            kpi('avgStayMinutes', 'Lưu trú TB', 'minutes'),
        ],
        charts: [
            chart('hourly', 'Lượt vào/ra theo giờ', 'bar', 'hour', [['entries', 'Lượt vào'], ['exits', 'Lượt ra']]),
            chart('byZone', 'Theo cổng', 'bar', 'name', [['entries', 'Lượt vào']]),
        ],
        columns: [
            col('zoneName', 'Khu vực'), col('code', 'Mã'), col('fullName', 'Họ tên'), col('departmentName', 'Đơn vị'),
            col('plateNumber', 'Biển số'), col('checkInTime', 'Giờ vào', 'datetime'), col('checkOutTime', 'Giờ ra', 'datetime'),
            col('durationSeconds', 'Thời lượng', 'duration'),
        ],
    },
    'room-utilization': {
        type: 'room-utilization',
        title: 'Sử dụng phòng họp',
        description: 'Số cuộc họp, giờ đặt, giờ thực dùng và tỷ lệ không đến của từng phòng.',
        icon: Building2,
        filters: [lookup('building', 'Tòa nhà', 'buildings'), lookup('roomId', 'Phòng', 'rooms')],
        kpis: [
            kpi('meetingCount', 'Số cuộc họp'), kpi('utilizationRate', 'Tỷ lệ sử dụng', 'percent'),
            kpi('noShowRate', 'Tỷ lệ không đến', 'percent'), kpi('usedHours', 'Tổng giờ dùng', 'hours'),
        ],
        charts: [
            chart('daily', 'Giờ sử dụng theo ngày', 'line', 'date', [['usedHours', 'Giờ sử dụng']]),
            chart('byRoom', 'Tỷ lệ sử dụng theo phòng', 'bar', 'name', [['utilizationRate', 'Tỷ lệ sử dụng (%)']]),
        ],
        columns: [
            col('roomName', 'Phòng'), col('building', 'Tòa nhà'), col('capacity', 'Sức chứa', 'number'),
            col('meetingCount', 'Số cuộc họp', 'number'), col('bookedHours', 'Giờ đặt', 'hours'),
            col('usedHours', 'Giờ thực dùng', 'hours'), col('utilizationRate', 'Tỷ lệ sử dụng', 'percent'),
            col('noShowCount', 'Không đến', 'number'),
        ],
    },
    vehicle: {
        type: 'vehicle',
        title: 'Phương tiện',
        description: 'Lượt xe qua cổng theo loại xe, trạng thái đăng ký và danh sách kiểm soát.',
        icon: Car,
        filters: [
            lookup('zoneId', 'Cổng', 'gates'),
            options('vehicleType', 'Loại xe', [['car', 'Ô tô'], ['motorbike', 'Xe máy']]),
            options('registrationStatus', 'Trạng thái', [['registered', 'Đã đăng ký'], ['unregistered', 'Chưa đăng ký'], ['watchlist', 'Danh sách kiểm soát']]),
        ],
        kpis: [
            kpi('total', 'Tổng lượt'), kpi('cars', 'Ô tô'), kpi('motorbikes', 'Xe máy'),
            kpi('unregistered', 'Chưa đăng ký'), kpi('watchlist', 'Thuộc danh sách kiểm soát'),
        ],
        charts: [
            chart('hourly', 'Lưu lượng theo giờ', 'bar', 'hour', [['count', 'Lượt xe']]),
            chart('byType', 'Cơ cấu loại xe', 'pie', 'name', [['count', 'Lượt xe']]),
        ],
        columns: [
            col('plateNumber', 'Biển số'), col('vehicleTypeLabel', 'Loại xe'), col('ownerName', 'Chủ xe'),
            col('departmentName', 'Đơn vị'), col('zoneName', 'Cổng'), col('checkInTime', 'Giờ vào', 'datetime'),
            col('checkOutTime', 'Giờ ra', 'datetime'), col('durationSeconds', 'Thời lượng', 'duration'),
            col('statusLabel', 'Trạng thái'),
        ],
    },
    visitor: {
        type: 'visitor',
        title: 'Khách đến làm việc',
        description: 'Lượt khách theo đơn vị tiếp, mục đích, thời gian lưu trú và tỷ lệ không đến.',
        icon: UserCheck,
        filters: [
            lookup('departmentId', 'Đơn vị tiếp', 'departments'),
            lookup('purpose', 'Mục đích', 'purposes'),
            options('status', 'Trạng thái', [['checked_in', 'Đang trong khuôn viên'], ['checked_out', 'Đã rời'], ['expired', 'Không đến']]),
        ],
        kpis: [
            kpi('totalVisits', 'Tổng lượt'), kpi('uniqueVisitors', 'Khách duy nhất'),
            kpi('avgStayMinutes', 'Lưu trú TB', 'minutes'), kpi('overstayCount', 'Lượt quá giờ'),
            kpi('noShowRate', 'Tỷ lệ không đến', 'percent'),
        ],
        charts: [
            chart('daily', 'Lượt khách theo ngày', 'line', 'date', [['count', 'Lượt khách']]),
            chart('byDepartment', 'Theo đơn vị tiếp', 'bar', 'name', [['count', 'Lượt khách']]),
        ],
        columns: [
            col('code', 'Mã lượt'), col('visitorName', 'Khách'), col('organization', 'Đơn vị công tác'),
            col('hostName', 'Người gặp'), col('departmentName', 'Đơn vị tiếp'), col('purpose', 'Mục đích'),
            col('checkInTime', 'Giờ vào', 'datetime'), col('checkOutTime', 'Giờ ra', 'datetime'),
            col('durationSeconds', 'Thời lượng', 'duration'), col('statusLabel', 'Trạng thái'),
        ],
    },
    'security-alert': {
        type: 'security-alert',
        title: 'Sự kiện an ninh',
        description: 'Cảnh báo theo loại, mức độ, khu vực và thời gian xử lý.',
        icon: ShieldAlert,
        filters: [
            options('alertType', 'Loại', [
                ['stranger', 'Người lạ'], ['watchlist_person', 'Người thuộc danh sách kiểm soát'],
                ['vehicle', 'Phương tiện bất thường'], ['intrusion', 'Xâm nhập khu vực cấm'],
                ['crowd', 'Tụ tập đông người'], ['camera_offline', 'Camera mất tín hiệu'],
                ['visitor_overstay', 'Khách quá giờ'], ['visitor_must_leave', 'Khách phải rời'],
                ['visitor_zone_violation', 'Khách vào sai khu vực'],
            ]),
            options('severity', 'Mức độ', [['low', 'Thấp'], ['medium', 'Trung bình'], ['high', 'Cao'], ['critical', 'Nghiêm trọng']]),
            lookup('zoneId', 'Khu vực', 'zones'),
            options('status', 'Trạng thái', [['open', 'Chưa xử lý'], ['acknowledged', 'Đã tiếp nhận'], ['resolved', 'Đã xử lý']]),
        ],
        kpis: [
            kpi('total', 'Tổng sự kiện'), kpi('critical', 'Mức nghiêm trọng'), kpi('resolved', 'Đã xử lý'),
            kpi('avgResolveMinutes', 'Thời gian xử lý TB', 'minutes'),
        ],
        charts: [
            chart('daily', 'Sự kiện theo ngày', 'bar', 'date', [['count', 'Sự kiện']]),
            chart('byType', 'Cơ cấu theo loại', 'pie', 'name', [['count', 'Sự kiện']]),
        ],
        columns: [
            col('occurredAt', 'Thời gian', 'datetime'), col('typeLabel', 'Loại'), col('severityLabel', 'Mức độ'),
            col('zoneName', 'Khu vực'), col('cameraName', 'Camera'), col('subject', 'Đối tượng'),
            col('statusLabel', 'Trạng thái'), col('handlerName', 'Người xử lý'),
            col('resolveMinutes', 'Thời gian xử lý', 'minutes'),
        ],
    },
};

export const REPORT_TYPES = Object.keys(REPORT_DEFINITIONS);

export const getReportDefinition = (type) =>
    (Object.prototype.hasOwnProperty.call(REPORT_DEFINITIONS, type) ? REPORT_DEFINITIONS[type] : null);

// Nhãn của một giá trị bộ lọc dạng `options` (ví dụ subjectType=staff → "Cán bộ").
export const optionLabel = (type, filterKey, value) =>
    REPORT_DEFINITIONS[type]?.filters.find((f) => f.key === filterKey)?.options?.find((o) => o.value === value)?.label || value;
