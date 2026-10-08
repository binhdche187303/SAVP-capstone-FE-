// src/mocks/visitorReport/seed.js
// Dữ liệu minh hoạ cho phân hệ Khách (2.10) và Báo cáo (2.13). Tất định theo ngày:
// lịch sử quá khứ không đổi giữa các lần tải; riêng "hôm nay" neo theo thời điểm hiện tại.
import { hashSeed, mulberry32, pick, int } from './prng';
import { defaultAccessWindow } from './visitStateMachine';
import { resolvePeriod } from './scheduleNextRun';

// Tăng số này khi đổi dạng dữ liệu: trình duyệt đang giữ bản cũ sẽ tự sinh lại.
export const SEED_VERSION = 2;
export const ME_HOST_ID = 'host-me';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const DEPARTMENTS = [
    ['dep-dt', 'Phòng Đào tạo', 'A1'],
    ['dep-ctsv', 'Phòng Công tác sinh viên', 'A1'],
    ['dep-khtc', 'Phòng Kế hoạch - Tài chính', 'A2'],
    ['dep-tchc', 'Phòng Tổ chức - Hành chính', 'A2'],
    ['dep-qlkh', 'Phòng Quản lý khoa học', 'A2'],
    ['dep-htqt', 'Phòng Hợp tác quốc tế', 'A1'],
    ['dep-cntt', 'Khoa Công nghệ thông tin', 'B1'],
    ['dep-kt', 'Khoa Kinh tế', 'B2'],
    ['dep-nn', 'Khoa Ngoại ngữ', 'B2'],
    ['dep-ck', 'Khoa Cơ khí', 'B2'],
    ['dep-ttcntt', 'Trung tâm CNTT', 'B1'],
    ['dep-tv', 'Thư viện', 'A1'],
].map(([id, name, building]) => ({ id, name, building }));

export const ZONES = [
    { id: 'zone-gate-main', name: 'Cổng chính', type: 'gate', hasFaceGate: true },
    { id: 'zone-gate-east', name: 'Cổng phụ phía Đông', type: 'gate', hasFaceGate: false },
    { id: 'zone-a1', name: 'Tòa A1', type: 'building', hasFaceGate: true },
    { id: 'zone-a2', name: 'Tòa A2', type: 'building', hasFaceGate: true },
    { id: 'zone-b1', name: 'Tòa B1', type: 'building', hasFaceGate: true },
    { id: 'zone-b2', name: 'Tòa B2', type: 'building', hasFaceGate: false },
];

export const PURPOSES = [
    'Làm việc với đơn vị',
    'Hợp tác doanh nghiệp',
    'Giảng viên thỉnh giảng',
    'Phụ huynh liên hệ',
    'Nhà thầu - bảo trì',
    'Giao nhận hồ sơ',
    'Phỏng vấn tuyển dụng',
    'Tham quan - khảo sát',
];

const ORGANIZATIONS = [
    'Công ty CP FPT Software',
    'Viettel Solutions',
    'VNPT Hà Nội',
    'Công ty TNHH Samsung SDS Việt Nam',
    'Ngân hàng BIDV',
    'Sở Giáo dục và Đào tạo Hà Nội',
    'Công ty CP MISA',
    'Đại học Bách khoa Hà Nội',
    'Công ty TNHH Kỹ thuật Hòa Phát',
    'Công ty CP Thiết bị giáo dục Tân Á',
    'Phụ huynh sinh viên',
    'Cá nhân',
];

const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const MIDDLE_NAMES = ['Văn', 'Thị', 'Minh', 'Đức', 'Thu', 'Quang', 'Ngọc', 'Hữu', 'Thanh', 'Anh'];
const GIVEN_NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hùng', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Phương', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Việt'];
const PLATE_SERIES = ['A', 'B', 'C', 'F', 'H', 'K'];
const REJECT_REASONS = ['Trùng lịch công tác của người được gặp', 'Chưa có lịch hẹn trước với đơn vị', 'Thông tin đăng ký chưa đầy đủ'];

export const pad = (n, length = 2) => String(n).padStart(length, '0');
export const ymdCompact = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const zoneOfBuilding = (building) => `zone-${building.toLowerCase()}`;
export const personName = (rng) => `${pick(rng, FAMILY_NAMES)} ${pick(rng, MIDDLE_NAMES)} ${pick(rng, GIVEN_NAMES)}`;

const iso = (ms) => new Date(ms).toISOString();
const digits = (rng, length) => Array.from({ length }, () => int(rng, 0, 9)).join('');
const round30 = (ms) => Math.round(ms / (30 * MIN)) * 30 * MIN;
const isWeekend = (day) => day.getDay() === 0 || day.getDay() === 6;

const buildHosts = () => {
    const rng = mulberry32(hashSeed('hosts'));
    const hosts = [{
        id: ME_HOST_ID,
        fullName: 'Tài khoản đang đăng nhập',
        employeeCode: 'CB0000',
        departmentId: 'dep-ttcntt',
        email: 'cb0000@savp.edu.vn',
    }];
    let n = 0;
    DEPARTMENTS.forEach((department) => {
        for (let i = 0; i < 5; i += 1) {
            n += 1;
            const employeeCode = `CB${pad(n, 4)}`;
            hosts.push({
                id: `host-${pad(n, 3)}`,
                fullName: personName(rng),
                employeeCode,
                departmentId: department.id,
                email: `${employeeCode.toLowerCase()}@savp.edu.vn`,
            });
        }
    });
    return hosts;
};

const buildVisitor = (rng) => ({
    fullName: personName(rng),
    idNumber: `0${digits(rng, 11)}`,
    phone: `09${digits(rng, 8)}`,
    email: `khach${digits(rng, 4)}@example.com`,
    organization: pick(rng, ORGANIZATIONS),
    plateNumber: rng() < 0.3 ? `${int(rng, 29, 99)}${pick(rng, PLATE_SERIES)}-${digits(rng, 3)}.${digits(rng, 2)}` : '',
    photo: null,
    hasPhoto: true,
});

// Nhóm khách quen để màn Lịch sử có khách đến nhiều lần.
const buildVisitorPool = () => {
    const rng = mulberry32(hashSeed('visitor-pool'));
    return Array.from({ length: 80 }, () => buildVisitor(rng));
};

const pickChannel = (rng) => {
    const r = rng();
    if (r < 0.55) return 'online';
    if (r < 0.8) return 'host_invite';
    return 'walk_in';
};

const CHANNEL_ACTOR = { online: 'Khách', host_invite: 'Người được gặp', walk_in: 'Lễ tân' };

const buildEvents = (visit) => {
    const events = [];
    const add = (at, type, extra = {}) => events.push({ at: iso(at), type, note: null, zoneId: null, score: null, actor: null, ...extra });
    const created = new Date(visit.createdAt).getTime();
    const email = visit.visitor.email;
    const gate = 'zone-gate-main';

    add(created, 'registered', { actor: CHANNEL_ACTOR[visit.channel] });
    if (visit.status === 'pending_approval') {
        if (email) add(created + MIN, 'email_sent', { note: `Đã gửi email xác nhận tới ${email}` });
        return events;
    }
    if (visit.status === 'rejected') {
        add(created + 40 * MIN, 'rejected', { note: visit.rejectReason, actor: 'Người được gặp' });
        if (email) add(created + 41 * MIN, 'email_sent', { note: `Đã gửi email thông báo từ chối tới ${email}` });
        return events;
    }
    if (visit.status === 'cancelled') {
        add(created + 30 * MIN, 'cancelled', { actor: 'Khách' });
        return events;
    }

    const approvedAt = visit.channel === 'online' ? created + 30 * MIN : created;
    add(approvedAt, 'approved', { actor: visit.channel === 'walk_in' ? 'Lễ tân' : 'Người được gặp' });
    if (email) add(approvedAt + MIN, 'email_sent', { note: `Đã gửi email kèm mã lượt và QR tới ${email}` });

    if (visit.checkInAt) {
        const at = new Date(visit.checkInAt).getTime();
        if (visit.faceScore < 0.8) {
            add(at - 2 * MIN, 'manual_review', { zoneId: gate, score: visit.faceScore, note: 'Độ khớp khuôn mặt dưới ngưỡng 80%' });
            add(at, 'check_in', { zoneId: gate, actor: 'Lễ tân', note: 'Lễ tân xác minh thủ công, đã đối chiếu giấy tờ' });
        } else {
            add(at, 'face_verified', { zoneId: gate, score: visit.faceScore });
            add(at, 'check_in', { zoneId: gate });
        }
        add(at, 'host_notified', { note: 'Thông báo khách đã đến' });
    }
    if (visit.checkOutAt) {
        const at = new Date(visit.checkOutAt).getTime();
        add(at, 'check_out', { zoneId: gate });
        add(at, 'face_removed');
    }
    if (visit.status === 'must_leave') {
        const at = new Date(visit.revokedAt).getTime();
        add(at, 'revoked', { note: 'Vi phạm quy định ra vào khu vực', actor: 'Quản trị' });
        add(at, 'host_notified', { note: 'Yêu cầu khách rời khuôn viên' });
        add(at, 'security_notified', { note: 'Đã báo bảo vệ hỗ trợ khách rời khuôn viên' });
    }
    if (visit.status === 'exit_unrecorded') {
        const end = new Date(visit.access.validTo);
        add(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime(), 'exit_unrecorded');
    }
    if (visit.status === 'expired') {
        const at = new Date(visit.access.validTo).getTime();
        add(at, 'expired');
        add(at, 'face_removed');
    }
    if (visit.status === 'revoked') {
        const at = approvedAt + 2 * HOUR;
        add(at, 'revoked', { note: 'Thay đổi kế hoạch làm việc', actor: 'Quản trị' });
        add(at, 'face_removed');
    }
    return events.sort((a, b) => new Date(a.at) - new Date(b.at));
};

// Dựng một lượt khách hoàn chỉnh từ phần khung; `rng` chỉ dùng cho các độ lệch nhỏ.
const buildVisit = (rng, frame, departmentsById) => {
    const { day, seq, channel, status, host, visitor, from, to } = frame;
    const key = ymdCompact(day);
    const department = departmentsById[host.departmentId];
    const access = {
        ...defaultAccessWindow(iso(from), iso(to)),
        zoneIds: ['zone-gate-main', zoneOfBuilding(department.building)],
    };
    if (frame.validTo) access.validTo = iso(frame.validTo);

    const lead = { online: int(rng, 20, 70) * HOUR, host_invite: 24 * HOUR, walk_in: 5 * MIN }[channel];
    const createdAt = Math.min(from - lead, frame.createdBefore ?? Infinity);

    const arrived = ['checked_in', 'checked_out', 'must_leave', 'exit_unrecorded'].includes(status);
    const lowScore = arrived && rng() < 0.08;
    const visit = {
        id: `v-${key}-${pad(seq)}`,
        code: `VS-${key.slice(2)}-${pad(seq, 4)}`,
        channel,
        status,
        visitor: { ...visitor, ...(frame.noPhoto ? { hasPhoto: false } : {}) },
        hostId: host.id,
        departmentId: host.departmentId,
        purpose: pick(rng, PURPOSES),
        companions: rng() < 0.25 ? int(rng, 1, 3) : 0,
        scheduledFrom: iso(from),
        scheduledTo: iso(to),
        access,
        checkInAt: arrived ? iso(frame.checkInAt ?? from + int(rng, -10, 15) * MIN) : null,
        checkOutAt: status === 'checked_out' ? iso(frame.checkOutAt ?? to + int(rng, -20, 25) * MIN) : null,
        faceScore: arrived ? Math.round((lowScore ? 0.6 + rng() * 0.19 : 0.82 + rng() * 0.17) * 100) / 100 : null,
        rejectReason: status === 'rejected' ? pick(rng, REJECT_REASONS) : null,
        revokedAt: frame.revokedAt ? iso(frame.revokedAt) : null,
        lastSeen: null,
        events: [],
        createdAt: iso(createdAt),
        userTouched: false,
    };
    // BR-V16: lần cuối camera thấy — khách đã rời thì ở cổng, còn ở trong thì ở tòa của đơn vị tiếp.
    if (visit.checkOutAt) {
        visit.lastSeen = { at: visit.checkOutAt, zoneId: 'zone-gate-main' };
    } else if (visit.checkInAt) {
        const seenAt = new Date(visit.checkInAt).getTime() + int(rng, 10, 40) * MIN;
        visit.lastSeen = { at: iso(Math.min(seenAt, frame.nowMs ?? Infinity)), zoneId: access.zoneIds[1] };
    }
    visit.events = buildEvents(visit);
    return visit;
};

const pickVisitor = (rng, pool) => (rng() < 0.5 ? pick(rng, pool) : buildVisitor(rng));
const pickHost = (rng, hosts) => (rng() < 0.06 ? hosts[0] : hosts[int(rng, 1, hosts.length - 1)]);

const pastStatus = (rng, channel) => {
    const r = rng();
    if (r < 0.765) return 'checked_out';
    // Khoảng 1,5% lượt: camera không ghi nhận lúc khách ra (BR-V15).
    if (r < 0.78) return 'exit_unrecorded';
    if (r < 0.86) return 'expired';
    if (r < 0.92) return channel === 'online' ? 'rejected' : 'checked_out';
    if (r < 0.96) return 'cancelled';
    return 'revoked';
};

// Ngày thường 4–8 lượt (plan ghi 3–8; nâng sàn để tổng luôn vượt 350 ở mọi ngày chạy demo).
const buildPastDay = (day, ctx) => {
    const rng = mulberry32(hashSeed(`visits:${ymdCompact(day)}`));
    const count = isWeekend(day) ? int(rng, 0, 2) : int(rng, 4, 8);
    return Array.from({ length: count }, (_, i) => {
        const from = day.getTime() + int(rng, 16, 31) * 30 * MIN;
        const to = from + pick(rng, [1, 1.5, 2, 3]) * HOUR;
        const channel = pickChannel(rng);
        return buildVisit(rng, {
            day, seq: i + 1, channel, status: pastStatus(rng, channel),
            host: pickHost(rng, ctx.hosts), visitor: pickVisitor(rng, ctx.pool), from, to,
        }, ctx.departmentsById);
    });
};

const buildFutureDay = (day, ctx) => {
    const rng = mulberry32(hashSeed(`visits:${ymdCompact(day)}`));
    const count = isWeekend(day) ? int(rng, 0, 1) : int(rng, 2, 5);
    return Array.from({ length: count }, (_, i) => {
        const from = day.getTime() + int(rng, 16, 31) * 30 * MIN;
        const to = from + pick(rng, [1, 1.5, 2, 3]) * HOUR;
        const channel = pickChannel(rng);
        const status = channel === 'online' && rng() < 0.5 ? 'pending_approval' : 'approved';
        return buildVisit(rng, {
            day, seq: i + 1, channel, status,
            host: pickHost(rng, ctx.hosts), visitor: pickVisitor(rng, ctx.pool), from, to,
            createdBefore: ctx.now.getTime() - 10 * MIN,
        }, ctx.departmentsById);
    });
};

// 14 lượt hôm nay, đủ mọi trạng thái cần cho kịch bản demo. Giờ tính từ `now`.
// [trạng thái, kênh, lệch giờ bắt đầu so với now, thời lượng (giờ), tuỳ chọn]
const TODAY_PLAN = [
    ['pending_approval', 'online', 1, 2, { me: true }],
    ['pending_approval', 'online', 2, 1.5, { me: true }],
    ['pending_approval', 'online', 3, 2, {}],
    ['approved', 'online', 0.5, 2, { me: true }],
    ['approved', 'host_invite', 1.5, 1, { noPhoto: true }],
    ['approved', 'online', 2.5, 2, {}],
    ['approved', 'host_invite', 4, 1.5, {}],
    ['checked_in', 'online', -1, 2, { me: true }],
    ['checked_in', 'walk_in', -1, 2, {}],
    ['must_leave', 'online', -1, 2, { revoked: true }],
    ['checked_in', 'host_invite', -3, 2, { overstay: true }],
    ['checked_out', 'online', -4, 2, {}],
    ['checked_out', 'walk_in', -4, 2, {}],
    ['rejected', 'online', 2, 1, {}],
];

const buildToday = (ctx) => {
    const { now, hosts, pool } = ctx;
    const today = startOfDay(now);
    const nowMs = now.getTime();
    const rng = mulberry32(hashSeed(`today:${ymdCompact(today)}`));
    const clamp = (ms) => Math.min(Math.max(ms, today.getTime()), today.getTime() + 23 * HOUR);

    return TODAY_PLAN.map(([status, channel, offsetHours, hours, opts], i) => {
        const from = clamp(round30(nowMs + offsetHours * HOUR));
        const to = from + hours * HOUR;
        const frame = {
            day: today, seq: i + 1, channel, status,
            host: opts.me ? hosts[0] : hosts[int(rng, 1, hosts.length - 1)],
            visitor: pickVisitor(rng, pool), from, to,
            noPhoto: opts.noPhoto,
            createdBefore: nowMs - 10 * MIN,
        };
        if (status === 'checked_in') frame.checkInAt = Math.min(from + 5 * MIN, nowMs - 5 * MIN);
        if (status === 'checked_out') {
            frame.checkInAt = Math.min(from + 5 * MIN, nowMs - 90 * MIN);
            frame.checkOutAt = Math.min(to - 10 * MIN, nowMs - 15 * MIN);
        }
        if (status === 'must_leave') {
            frame.checkInAt = Math.min(from + 5 * MIN, nowMs - 40 * MIN);
            frame.revokedAt = Math.max(nowMs - 10 * MIN, today.getTime());
        }
        // Quá giờ đã 45 phút: vượt mốc leo thang 30 phút để hàng "Cần xử lý" có đủ hai mức.
        // Kẹp trong ngày hôm nay: nếu rơi sang hôm qua thì BR-V15 sẽ coi là "chưa ghi nhận giờ ra".
        if (opts.overstay) frame.validTo = Math.max(nowMs - 45 * MIN, today.getTime());
        frame.nowMs = nowMs;
        return buildVisit(rng, frame, ctx.departmentsById);
    });
};

const NOTIFICATION_FOR_STATUS = {
    pending_approval: ['pending_approval', (v) => `${v.visitor.fullName} (${v.visitor.organization}) xin gặp bạn, đang chờ duyệt`],
    checked_in: ['visitor_arrived', (v) => `${v.visitor.fullName} đã đến Cổng chính`],
};

const buildNotifications = (todayVisits) =>
    todayVisits
        .filter((v) => v.hostId === ME_HOST_ID && NOTIFICATION_FOR_STATUS[v.status])
        .map((v) => {
            const [type, message] = NOTIFICATION_FOR_STATUS[v.status];
            return {
                id: `n-${v.id}`,
                hostId: ME_HOST_ID,
                visitId: v.id,
                type,
                message: message(v),
                createdAt: v.checkInAt || v.createdAt,
                read: false,
                userTouched: false,
            };
        });

// ---------- Lịch gửi báo cáo ----------

// [tên, loại báo cáo, tần suất, giờ, thứ (0 = CN), ngày trong tháng, kỳ dữ liệu, định dạng, bật]
const SCHEDULE_PLAN = [
    ['Chuyên cần cán bộ hằng tuần', 'staff-attendance', 'weekly', '07:30', 1, null, 'last_week', ['pdf', 'xlsx'], true],
    ['Chuyên cần sinh viên hằng tuần', 'student-attendance', 'weekly', '08:00', 1, null, 'last_week', ['xlsx'], true],
    ['Ra vào khuôn viên hằng ngày', 'gate-access', 'daily', '07:00', null, null, 'yesterday', ['pdf'], true],
    ['Sự kiện an ninh hằng ngày', 'security-alert', 'daily', '06:30', null, null, 'yesterday', ['pdf', 'docx'], true],
    ['Khách đến làm việc hằng tháng', 'visitor', 'monthly', '08:00', null, 1, 'last_month', ['pdf', 'xlsx', 'docx'], true],
    ['Sử dụng phòng họp cuối tháng', 'room-utilization', 'monthly', '17:00', null, 'last', 'last_month', ['xlsx'], false],
];

const RUN_ERRORS = {
    4: 'Máy chủ thư từ chối người nhận ngoài hệ thống (550)',
    13: 'Quá thời gian tạo file báo cáo',
    27: 'Hộp thư người nhận đã đầy',
};

const EXPORT_PLAN = [['visitor', 'pdf'], ['gate-access', 'xlsx'], ['staff-attendance', 'docx'], ['security-alert', 'pdf'], ['room-utilization', 'xlsx']];
const EXPORT_EXTENSION = { pdf: 'pdf', xlsx: 'xlsx', docx: 'doc' };
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const buildSchedules = (hosts, now) =>
    SCHEDULE_PLAN.map(([name, reportType, frequency, time, dayOfWeek, dayOfMonth, period, formats, enabled], i) => {
        const users = [hosts[1 + i * 3], hosts[2 + i * 5]].slice(0, 1 + (i % 2) + 1);
        return {
            id: `sch-${i + 1}`,
            name,
            reportType,
            filters: {},
            period,
            frequency,
            time,
            dayOfWeek,
            dayOfMonth,
            formats,
            recipients: [
                ...users.map((h) => ({ type: 'user', value: h.id, label: `${h.fullName} (${h.email})` })),
                { type: 'email', value: 'bangiamhieu@savp.edu.vn', label: 'bangiamhieu@savp.edu.vn' },
            ],
            subject: `[SAVP] ${name}`,
            message: 'Kính gửi anh/chị, hệ thống gửi báo cáo định kỳ theo lịch đã thiết lập. Chi tiết xem file đính kèm.',
            enabled,
            lastRunAt: null,
            createdAt: addDays(now, -60 + i).toISOString(),
            userTouched: false,
        };
    });

const runsOnDay = (schedule, day) => {
    if (schedule.frequency === 'daily') return true;
    if (schedule.frequency === 'weekly') return day.getDay() === schedule.dayOfWeek;
    const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    return day.getDate() === (schedule.dayOfMonth === 'last' ? lastDay : schedule.dayOfMonth);
};

// 40 lần chạy gần nhất của các lịch đang bật, mới nhất ở đầu; lần thứ 5, 14, 28 thất bại.
const buildRuns = (schedules, now) => {
    const today = startOfDay(now);
    const runs = [];
    for (let offset = 1; runs.length < 40 && offset < 200; offset += 1) {
        const day = addDays(today, -offset);
        const ofDay = schedules
            .filter((s) => s.enabled && runsOnDay(s, day))
            .map((schedule) => {
                const [hh, mm] = schedule.time.split(':').map(Number);
                return { schedule, ranAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm) };
            })
            .sort((a, b) => b.ranAt - a.ranAt);
        runs.push(...ofDay);
    }
    return runs.slice(0, 40).map(({ schedule, ranAt }, i) => {
        const failed = Object.prototype.hasOwnProperty.call(RUN_ERRORS, i);
        return {
            id: `run-${pad(i + 1, 3)}`,
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            reportType: schedule.reportType,
            trigger: 'scheduled',
            status: failed ? 'failed' : 'success',
            ...resolvePeriod(schedule.period, ranAt),
            formats: schedule.formats,
            recipientCount: schedule.recipients.length,
            error: failed ? RUN_ERRORS[i] : null,
            ranAt: ranAt.toISOString(),
            retriedByRunId: null,
            userTouched: false,
        };
    });
};

const buildExports = (now) =>
    EXPORT_PLAN.map(([reportType, format], i) => {
        const day = addDays(now, -(i + 1));
        const from = isoDate(addDays(day, -7));
        const to = isoDate(addDays(day, -1));
        return {
            id: `exp-${i + 1}`,
            reportType,
            format,
            from,
            to,
            fileName: `${reportType}_${from}_${to}.${EXPORT_EXTENSION[format]}`,
            createdAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9 + i, 15).toISOString(),
            userTouched: false,
        };
    });

export const buildSeed = (now = new Date()) => {
    const today = startOfDay(now);
    const hosts = buildHosts();
    const ctx = {
        now,
        hosts,
        pool: buildVisitorPool(),
        departmentsById: Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d])),
    };

    const visits = [];
    for (let offset = -89; offset < 0; offset += 1) visits.push(...buildPastDay(addDays(today, offset), ctx));
    const todayVisits = buildToday(ctx);
    visits.push(...todayVisits);
    for (let offset = 1; offset <= 3; offset += 1) visits.push(...buildFutureDay(addDays(today, offset), ctx));

    const schedules = buildSchedules(hosts, now);
    const runs = buildRuns(schedules, now);
    schedules.forEach((schedule) => {
        schedule.lastRunAt = runs.find((r) => r.scheduleId === schedule.id)?.ranAt || null;
    });

    return {
        version: SEED_VERSION,
        seededOn: dayKey(now),
        departments: DEPARTMENTS.map((d) => ({ ...d })),
        hosts,
        zones: ZONES.map((z) => ({ ...z })),
        visits,
        notifications: buildNotifications(todayVisits),
        schedules,
        runs,
        exports: buildExports(now),
    };
};
