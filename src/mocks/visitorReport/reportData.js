// src/mocks/visitorReport/reportData.js
// Dữ liệu minh hoạ cho 7 báo cáo (spec §4.2). Mỗi loại: facts() sinh bản ghi gốc tất định
// theo ngày, summarize() gộp thành KPI, biểu đồ, dòng bảng. Riêng báo cáo khách đọc kho
// lượt khách thật của phân hệ 2.10 để số liệu khớp với màn Thống kê khách.
import { hashSeed, mulberry32, pick, int } from './prng';
import { ME_HOST_ID, PURPOSES, pad, personName } from './seed';
import { selectVisitsInRange, computeVisitorKpis, buildVisitSeries } from './visitorApi';
import { isOverstay } from './visitStateMachine';
import { optionLabel } from '../../config/reportDefinitions';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const MAX_RANGE_DAYS = 366;
const DATA_WINDOW_DAYS = 400;
const RESERVED_KEYS = ['from', 'to', 'q', 'page', 'limit', 'sortKey', 'sortDir', 'format', 'preset'];

const fail = (message) => {
    throw new Error(message);
};
const round1 = (n) => Math.round(n * 10) / 10;
const percent = (part, whole) => (whole ? round1((part / whole) * 100) : 0);
const parseYmd = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Date(y, m - 1, d);
};
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dm = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const at = (day, minutes) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
const rngFor = (key) => mulberry32(hashSeed(key));
const weighted = (rng, pairs) => {
    const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
    let r = rng() * total;
    for (const [value, weight] of pairs) {
        r -= weight;
        if (r < 0) return value;
    }
    return pairs[pairs.length - 1][0];
};
const groupBy = (items, keyOf) => {
    const map = new Map();
    items.forEach((item) => {
        const key = keyOf(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    });
    return map;
};
const sum = (items, valueOf) => items.reduce((total, item) => total + valueOf(item), 0);
const plate = (rng) => `${int(rng, 29, 99)}${pick(rng, ['A', 'B', 'C', 'F', 'H', 'K'])}-${int(rng, 100, 999)}.${pad(int(rng, 0, 99))}`;

export const validateRange = (from, to) => {
    if (!from || !to) fail('Vui lòng chọn kỳ báo cáo');
    if (from > to) fail('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    if ((parseYmd(to) - parseYmd(from)) / (24 * HOUR) > MAX_RANGE_DAYS) fail('Kỳ báo cáo tối đa 366 ngày');
};

// Các ngày có dữ liệu trong kỳ: chỉ trong 400 ngày gần nhất và không vượt hôm nay.
const daysInRange = (from, to, now) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const earliest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - DATA_WINDOW_DAYS);
    const start = Math.max(parseYmd(from).getTime(), earliest.getTime());
    const end = Math.min(parseYmd(to).getTime(), today.getTime());
    const days = [];
    for (let d = new Date(start); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        days.push({
            date: d,
            ymd: toYmd(d),
            label: dm(d),
            weekday: d.getDay() !== 0 && d.getDay() !== 6,
            isToday: d.getTime() === today.getTime(),
        });
    }
    return days;
};

// ---------- Danh mục cố định ----------

const SEMESTERS = [
    { id: 'sem-2026-1', name: 'HK1 2026-2027', from: '2026-09-07', to: '9999-12-31' },
    { id: 'sem-2026-h', name: 'HK hè 2026', from: '2026-06-01', to: '2026-08-15' },
];
const SUBJECTS = [
    ['sub-prf', 'PRF192', 'Lập trình cơ bản'],
    ['sub-dbi', 'DBI202', 'Cơ sở dữ liệu'],
    ['sub-swe', 'SWE201', 'Công nghệ phần mềm'],
    ['sub-mas', 'MAS291', 'Xác suất thống kê'],
    ['sub-eng', 'ENW492', 'Tiếng Anh chuyên ngành'],
    ['sub-eco', 'ECO111', 'Kinh tế vi mô'],
].map(([id, code, name]) => ({ id, code, name: `${code} - ${name}` }));

const STUDENTS = (() => {
    const rng = rngFor('students');
    return Array.from({ length: 300 }, (_, i) => ({
        id: `st-${pad(i + 1, 3)}`,
        studentCode: `HE18${pad(i + 1, 4)}`,
        fullName: personName(rng),
        oftenAbsent: i % 20 === 7,
    }));
})();

// 8 lớp học phần, mỗi lớp 2 buổi/tuần vào hai thứ cố định (1 = thứ Hai … 6 = thứ Bảy).
const CLASS_SECTIONS = [
    ['sub-prf', 'SE1801', [1, 3]], ['sub-prf', 'SE1802', [2, 4]], ['sub-dbi', 'SE1803', [1, 4]],
    ['sub-swe', 'SE1804', [2, 5]], ['sub-mas', 'SE1805', [3, 5]], ['sub-eng', 'SE1806', [1, 5]],
    ['sub-eco', 'IB1801', [2, 4]], ['sub-eco', 'IB1802', [3, 6]],
].map(([subjectId, group, days], i) => {
    const subject = SUBJECTS.find((s) => s.id === subjectId);
    const size = 35 + (i % 6);
    return {
        id: `cls-${i + 1}`,
        name: `${subject.code}.${group}`,
        subjectId,
        subjectName: subject.name,
        days,
        students: Array.from({ length: size }, (_, k) => STUDENTS[(i * 37 + k) % STUDENTS.length]),
    };
});

const ROOMS = [
    ['A1', '201', 20], ['A1', '305', 12], ['A1', '402', 40], ['A2', '101', 8], ['A2', '203', 16],
    ['A2', '301', 30], ['B1', '204', 12], ['B1', '501', 24], ['B2', '102', 10], ['B2', '303', 18],
].map(([building, number, capacity], i) => ({
    id: `room-${pad(i + 1)}`,
    name: `Phòng họp ${building}-${number}`,
    building,
    capacity,
}));

const ALERT_TYPES = [['stranger', 30], ['watchlist_person', 8], ['vehicle', 15], ['intrusion', 12], ['crowd', 15], ['camera_offline', 20]];
const SEVERITIES = [['low', 40], ['medium', 35], ['high', 20], ['critical', 5]];

const staffOf = (state) => state.hosts.filter((h) => h.id !== ME_HOST_ID);
const departmentName = (state, id) => state.departments.find((d) => d.id === id)?.name || '';
const gatesOf = (state) => state.zones.filter((z) => z.type === 'gate');

export const getLookups = (state) => ({
    departments: state.departments.map((d) => ({ id: d.id, name: d.name })),
    staff: staffOf(state).map((h) => ({ id: h.id, name: `${h.fullName} (${h.employeeCode})` })),
    semesters: SEMESTERS.map((s) => ({ id: s.id, name: s.name })),
    subjects: SUBJECTS.map((s) => ({ id: s.id, name: s.name })),
    classSections: CLASS_SECTIONS.map((c) => ({ id: c.id, name: c.name })),
    zones: state.zones.map((z) => ({ id: z.id, name: z.name })),
    gates: gatesOf(state).map((z) => ({ id: z.id, name: z.name })),
    buildings: [...new Set(ROOMS.map((r) => r.building))].map((b) => ({ id: b, name: `Tòa ${b}` })),
    rooms: ROOMS.map((r) => ({ id: r.id, name: r.name })),
    purposes: PURPOSES.map((p) => ({ id: p, name: p })),
});

// ---------- Chuyên cần cán bộ ----------
// Giả định mockup (spec §11.4): giờ làm 08:00–17:00 thứ Hai–thứ Sáu, ân hạn 15 phút.

const staffAttendance = {
    facts: (state, days) => {
        const staff = staffOf(state);
        const facts = [];
        days.filter((d) => d.weekday).forEach((day) => {
            staff.forEach((person) => {
                const rng = rngFor(`staff:${day.ymd}:${person.id}`);
                const absent = rng() < 0.03;
                // Phần lớn đến 07:45–08:10 và về 17:00–17:45; khoảng 8% đi muộn, 7% về sớm.
                const inMinute = rng() < 0.08 ? 8 * 60 + int(rng, 16, 35) : 7 * 60 + int(rng, 45, 70);
                const outMinute = rng() < 0.07 ? 16 * 60 + int(rng, 30, 59) : 17 * 60 + int(rng, 0, 45);
                facts.push({
                    staffId: person.id,
                    departmentId: person.departmentId,
                    employeeCode: person.employeeCode,
                    fullName: person.fullName,
                    day,
                    absent,
                    late: !absent && inMinute > 8 * 60 + 15,
                    earlyLeave: !absent && outMinute < 17 * 60,
                    hours: absent ? 0 : (outMinute - inMinute) / 60,
                });
            });
        });
        return facts;
    },
    summarize: (facts, { state }) => {
        const onTime = (f) => !f.absent && !f.late && !f.earlyLeave;
        const present = facts.filter((f) => !f.absent);
        const rows = [...groupBy(facts, (f) => f.staffId).values()].map((items) => {
            const worked = items.filter((f) => !f.absent);
            return {
                staffId: items[0].staffId,
                employeeCode: items[0].employeeCode,
                fullName: items[0].fullName,
                departmentName: departmentName(state, items[0].departmentId),
                workDays: worked.length,
                onTime: items.filter(onTime).length,
                late: items.filter((f) => f.late).length,
                earlyLeave: items.filter((f) => f.earlyLeave).length,
                absent: items.filter((f) => f.absent).length,
                totalHours: round1(sum(worked, (f) => f.hours)),
                rate: percent(items.filter(onTime).length, items.length),
            };
        });
        return {
            kpis: {
                attendanceRate: percent(facts.filter(onTime).length, facts.length),
                lateCount: facts.filter((f) => f.late).length,
                earlyLeaveCount: facts.filter((f) => f.earlyLeave).length,
                absentDays: facts.filter((f) => f.absent).length,
                avgHoursPerDay: present.length ? round1(sum(present, (f) => f.hours) / present.length) : 0,
            },
            charts: {
                daily: [...groupBy(facts, (f) => f.day.ymd).values()].map((items) => ({
                    date: items[0].day.label,
                    rate: percent(items.filter(onTime).length, items.length),
                })),
                byDepartment: [...groupBy(facts, (f) => f.departmentId).entries()].map(([id, items]) => ({
                    name: departmentName(state, id),
                    rate: percent(items.filter(onTime).length, items.length),
                })),
            },
            rows,
        };
    },
};

// ---------- Chuyên cần sinh viên ----------

const semesterOf = (ymd) => SEMESTERS.find((s) => ymd >= s.from && ymd <= s.to);
const mondayLabel = (d) => {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return { sort: monday.getTime(), label: `Tuần ${dm(monday)}` };
};

const studentAttendance = {
    facts: (state, days) => {
        const facts = [];
        days.forEach((day) => {
            const semester = semesterOf(day.ymd);
            if (!semester) return;
            CLASS_SECTIONS.filter((section) => section.days.includes(day.date.getDay())).forEach((section) => {
                section.students.forEach((student) => {
                    const r = rngFor(`student:${day.ymd}:${section.id}:${student.id}`)();
                    const absentRate = student.oftenAbsent ? 0.3 : 0.07;
                    const status = r < absentRate ? 'absent' : r < absentRate + 0.05 ? 'late' : 'present';
                    facts.push({
                        semesterId: semester.id,
                        subjectId: section.subjectId,
                        classSectionId: section.id,
                        studentId: student.id,
                        section,
                        student,
                        day,
                        status,
                    });
                });
            });
        });
        return facts;
    },
    summarize: (facts) => {
        const attended = (items) => items.filter((f) => f.status !== 'absent').length;
        const rows = [...groupBy(facts, (f) => `${f.classSectionId}:${f.studentId}`).values()].map((items) => {
            const absent = items.filter((f) => f.status === 'absent').length;
            return {
                studentCode: items[0].student.studentCode,
                fullName: items[0].student.fullName,
                classSectionName: items[0].section.name,
                subjectName: items[0].section.subjectName,
                sessions: items.length,
                present: items.filter((f) => f.status === 'present').length,
                late: items.filter((f) => f.status === 'late').length,
                absent,
                rate: percent(items.length - absent, items.length),
                warning: absent / items.length > 0.2 ? 'Vắng quá 20%' : '',
            };
        });
        const weeks = groupBy(facts, (f) => mondayLabel(f.day.date).sort);
        return {
            kpis: {
                attendanceRate: percent(attended(facts), facts.length),
                sessionCount: new Set(facts.map((f) => `${f.classSectionId}:${f.day.ymd}`)).size,
                absentCount: facts.filter((f) => f.status === 'absent').length,
                lateCount: facts.filter((f) => f.status === 'late').length,
                atRiskStudents: new Set(rows.filter((r) => r.warning).map((r) => r.studentCode)).size,
            },
            charts: {
                weekly: [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, items]) => ({
                    week: mondayLabel(items[0].day.date).label,
                    rate: percent(attended(items), items.length),
                })),
                bySection: [...groupBy(facts, (f) => f.classSectionId).values()].map((items) => ({
                    name: items[0].section.name,
                    rate: percent(attended(items), items.length),
                })),
            },
            rows,
        };
    },
};

// ---------- Ra vào khuôn viên ----------

const SUBJECT_TYPES = [['staff', 45], ['student', 40], ['visitor', 5], ['unknown', 10]];
const PLATE_RATE = { staff: 0.3, student: 0.15, visitor: 0.2, unknown: 0.6 };

const gateAccess = {
    facts: (state, days, now) => {
        const staff = staffOf(state);
        const gates = gatesOf(state);
        const facts = [];
        days.forEach((day) => {
            const rng = rngFor(`gate:${day.ymd}`);
            const count = day.weekday ? int(rng, 60, 90) : int(rng, 8, 15);
            for (let i = 0; i < count; i += 1) {
                const subjectType = weighted(rng, SUBJECT_TYPES);
                const zone = rng() < 0.7 ? gates[0] : gates[1];
                const checkIn = at(day.date, int(rng, 390, 1020));
                const checkOut = new Date(checkIn.getTime() + int(rng, 30, 540) * MIN);
                const person = subjectType === 'staff' ? pick(rng, staff) : subjectType === 'student' ? pick(rng, STUDENTS) : null;
                const visitorName = subjectType === 'visitor' ? personName(rng) : null;
                const plateNumber = rng() < PLATE_RATE[subjectType] ? plate(rng) : '';
                if (checkIn > now) continue;
                const left = checkOut <= now;
                facts.push({
                    zoneId: zone.id,
                    departmentId: subjectType === 'staff' ? person.departmentId : null,
                    subjectType,
                    day,
                    zoneName: zone.name,
                    code: person?.employeeCode || person?.studentCode || (subjectType === 'visitor' ? 'KHÁCH' : ''),
                    fullName: person?.fullName || visitorName || '',
                    departmentName: subjectType === 'staff' ? departmentName(state, person.departmentId) : '',
                    plateNumber,
                    checkInTime: checkIn.toISOString(),
                    checkOutTime: left ? checkOut.toISOString() : null,
                    durationSeconds: left ? (checkOut - checkIn) / 1000 : null,
                });
            }
        });
        return facts;
    },
    summarize: (facts) => {
        const left = facts.filter((f) => f.checkOutTime);
        const hours = Array.from({ length: 13 }, (_, i) => i + 6);
        const inByHour = groupBy(facts, (f) => new Date(f.checkInTime).getHours());
        const outByHour = groupBy(left, (f) => new Date(f.checkOutTime).getHours());
        return {
            kpis: {
                entries: facts.length,
                exits: left.length,
                onSite: facts.filter((f) => f.day.isToday && !f.checkOutTime).length,
                avgStayMinutes: left.length ? Math.round(sum(left, (f) => f.durationSeconds) / left.length / 60) : 0,
            },
            charts: {
                hourly: facts.length ? hours.map((h) => ({
                    hour: `${pad(h)}h`,
                    entries: (inByHour.get(h) || []).length,
                    exits: (outByHour.get(h) || []).length,
                })) : [],
                byZone: [...groupBy(facts, (f) => f.zoneName).entries()].map(([name, items]) => ({ name, entries: items.length })),
            },
            rows: [...facts].sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime)),
        };
    },
};

// ---------- Sử dụng phòng họp ----------

const roomUtilization = {
    facts: (state, days) => {
        const facts = [];
        days.filter((d) => d.weekday).forEach((day) => {
            ROOMS.forEach((room) => {
                const rng = rngFor(`room:${day.ymd}:${room.id}`);
                const count = int(rng, 0, 4);
                for (let i = 0; i < count; i += 1) {
                    const bookedHours = pick(rng, [1, 1.5, 2]);
                    const noShow = rng() < 0.09;
                    facts.push({
                        roomId: room.id,
                        building: room.building,
                        room,
                        day,
                        bookedHours,
                        noShow,
                        usedHours: noShow ? 0 : bookedHours * (0.7 + rng() * 0.3),
                    });
                }
            });
        });
        return facts;
    },
    summarize: (facts, { days, filters }) => {
        if (!facts.length) {
            return { kpis: { meetingCount: 0, utilizationRate: 0, noShowRate: 0, usedHours: 0 }, charts: { daily: [], byRoom: [] }, rows: [] };
        }
        const workdays = days.filter((d) => d.weekday).length;
        const rooms = ROOMS.filter((r) => (!filters.building || r.building === filters.building) && (!filters.roomId || r.id === filters.roomId));
        const capacityHours = workdays * 9;
        const byRoom = groupBy(facts, (f) => f.roomId);
        const rows = rooms.map((room) => {
            const items = byRoom.get(room.id) || [];
            const used = sum(items, (f) => f.usedHours);
            return {
                roomName: room.name,
                building: room.building,
                capacity: room.capacity,
                meetingCount: items.length,
                bookedHours: round1(sum(items, (f) => f.bookedHours)),
                usedHours: round1(used),
                utilizationRate: percent(used, capacityHours),
                noShowCount: items.filter((f) => f.noShow).length,
            };
        });
        const usedTotal = sum(facts, (f) => f.usedHours);
        return {
            kpis: {
                meetingCount: facts.length,
                utilizationRate: percent(usedTotal, capacityHours * rooms.length),
                noShowRate: percent(facts.filter((f) => f.noShow).length, facts.length),
                usedHours: round1(usedTotal),
            },
            charts: {
                daily: [...groupBy(facts, (f) => f.day.ymd).values()].map((items) => ({
                    date: items[0].day.label,
                    usedHours: round1(sum(items, (f) => f.usedHours)),
                })),
                byRoom: rows.map((r) => ({ name: r.roomName.replace('Phòng họp ', ''), utilizationRate: r.utilizationRate })),
            },
            rows,
        };
    },
};

// ---------- Phương tiện ----------

const vehicle = {
    facts: (state, days, now) => {
        const staff = staffOf(state);
        const gates = gatesOf(state);
        const facts = [];
        days.forEach((day) => {
            const rng = rngFor(`vehicle:${day.ymd}`);
            const count = day.weekday ? int(rng, 35, 60) : int(rng, 5, 10);
            for (let i = 0; i < count; i += 1) {
                const vehicleType = rng() < 0.7 ? 'motorbike' : 'car';
                const registrationStatus = weighted(rng, [['registered', 85], ['unregistered', 12], ['watchlist', 3]]);
                const zone = rng() < 0.7 ? gates[0] : gates[1];
                const checkIn = at(day.date, int(rng, 360, 1080));
                const checkOut = new Date(checkIn.getTime() + int(rng, 20, 600) * MIN);
                const owner = pick(rng, staff);
                const plateNumber = plate(rng);
                if (checkIn > now) continue;
                const left = checkOut <= now;
                const registered = registrationStatus === 'registered';
                facts.push({
                    zoneId: zone.id,
                    vehicleType,
                    registrationStatus,
                    day,
                    plateNumber,
                    vehicleTypeLabel: optionLabel('vehicle', 'vehicleType', vehicleType),
                    ownerName: registered ? owner.fullName : '',
                    departmentName: registered ? departmentName(state, owner.departmentId) : '',
                    zoneName: zone.name,
                    checkInTime: checkIn.toISOString(),
                    checkOutTime: left ? checkOut.toISOString() : null,
                    durationSeconds: left ? (checkOut - checkIn) / 1000 : null,
                    statusLabel: optionLabel('vehicle', 'registrationStatus', registrationStatus),
                });
            }
        });
        return facts;
    },
    summarize: (facts) => {
        const byHour = groupBy(facts, (f) => new Date(f.checkInTime).getHours());
        const count = (predicate) => facts.filter(predicate).length;
        return {
            kpis: {
                total: facts.length,
                cars: count((f) => f.vehicleType === 'car'),
                motorbikes: count((f) => f.vehicleType === 'motorbike'),
                unregistered: count((f) => f.registrationStatus === 'unregistered'),
                watchlist: count((f) => f.registrationStatus === 'watchlist'),
            },
            charts: {
                hourly: facts.length ? Array.from({ length: 13 }, (_, i) => i + 6).map((h) => ({ hour: `${pad(h)}h`, count: (byHour.get(h) || []).length })) : [],
                byType: [...groupBy(facts, (f) => f.vehicleTypeLabel).entries()].map(([name, items]) => ({ name, count: items.length })),
            },
            rows: [...facts].sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime)),
        };
    },
};

// ---------- Khách đến làm việc ----------

const VISIT_STATUS_LABELS = {
    checked_in: 'Đang trong khuôn viên',
    checked_out: 'Đã rời',
    expired: 'Không đến',
    revoked: 'Đã thu hồi',
    must_leave: 'Phải rời khuôn viên',
    exit_unrecorded: 'Chưa ghi nhận giờ ra',
};

const visitor = {
    facts: (state, days, now, { from, to }) =>
        selectVisitsInRange(state, { from, to })
            .filter((v) => v.checkInAt || v.status === 'expired')
            .map((v) => ({ departmentId: v.departmentId, purpose: v.purpose, status: v.status, visit: v })),
    summarize: (facts, { state, now, from, to }) => {
        const visits = facts.map((f) => f.visit);
        const arrived = visits.filter((v) => v.checkInAt);
        const hostNameOf = (id) => state.hosts.find((h) => h.id === id)?.fullName || '';
        return {
            kpis: computeVisitorKpis(visits, now),
            charts: {
                daily: visits.length ? buildVisitSeries(arrived, { from, to, groupBy: 'day' }).map((b) => ({ date: b.bucket, count: b.count })) : [],
                byDepartment: [...groupBy(arrived, (v) => v.departmentId).entries()]
                    .map(([id, items]) => ({ name: departmentName(state, id), count: items.length }))
                    .sort((a, b) => b.count - a.count),
            },
            rows: visits
                .map((v) => ({
                    code: v.code,
                    visitorName: v.visitor.fullName,
                    organization: v.visitor.organization,
                    hostName: hostNameOf(v.hostId),
                    departmentName: departmentName(state, v.departmentId),
                    purpose: v.purpose,
                    checkInTime: v.checkInAt,
                    checkOutTime: v.checkOutAt,
                    durationSeconds: v.checkInAt && v.checkOutAt ? (new Date(v.checkOutAt) - new Date(v.checkInAt)) / 1000 : null,
                    statusLabel: `${VISIT_STATUS_LABELS[v.status] || v.status}${isOverstay(v, now) ? ' (quá giờ)' : ''}${v.manualExit ? ' (giờ ra nhập tay)' : ''}`,
                    scheduledFrom: v.scheduledFrom,
                }))
                .sort((a, b) => new Date(b.scheduledFrom) - new Date(a.scheduledFrom)),
        };
    },
};

// ---------- Sự kiện an ninh ----------

const ALERT_SUBJECT = {
    stranger: () => 'Người lạ chưa định danh',
    watchlist_person: (rng) => personName(rng),
    vehicle: (rng) => `Xe ${plate(rng)}`,
    intrusion: () => 'Người không có quyền vào khu vực',
    crowd: (rng) => `Khoảng ${int(rng, 12, 40)} người`,
    camera_offline: () => 'Mất tín hiệu camera',
};

const securityAlert = {
    facts: (state, days, now) => {
        const staff = staffOf(state);
        const facts = [];
        days.forEach((day) => {
            const rng = rngFor(`alert:${day.ymd}`);
            const count = int(rng, 2, 8);
            for (let i = 0; i < count; i += 1) {
                const alertType = weighted(rng, ALERT_TYPES);
                const severity = weighted(rng, SEVERITIES);
                const zone = pick(rng, state.zones);
                const occurredAt = at(day.date, int(rng, 300, 1320));
                const ageDays = (now - occurredAt) / (24 * HOUR);
                const statusRoll = rng();
                const status = ageDays > 2
                    ? (statusRoll < 0.9 ? 'resolved' : statusRoll < 0.96 ? 'acknowledged' : 'open')
                    : (statusRoll < 0.34 ? 'open' : statusRoll < 0.67 ? 'acknowledged' : 'resolved');
                const cameraName = `CAM-${zone.id.replace('zone-', '').toUpperCase()}-${pad(int(rng, 1, 4))}`;
                const subject = ALERT_SUBJECT[alertType](rng);
                const handler = pick(rng, staff);
                const resolveMinutes = int(rng, 5, 180);
                if (occurredAt > now) continue;
                facts.push({
                    alertType,
                    severity,
                    zoneId: zone.id,
                    status,
                    day,
                    occurredAt: occurredAt.toISOString(),
                    typeLabel: optionLabel('security-alert', 'alertType', alertType),
                    severityLabel: optionLabel('security-alert', 'severity', severity),
                    zoneName: zone.name,
                    cameraName,
                    subject,
                    statusLabel: optionLabel('security-alert', 'status', status),
                    handlerName: status === 'open' ? '' : handler.fullName,
                    resolveMinutes: status === 'resolved' ? resolveMinutes : null,
                });
            }
        });
        return facts;
    },
    summarize: (facts) => {
        const resolved = facts.filter((f) => f.status === 'resolved');
        return {
            kpis: {
                total: facts.length,
                critical: facts.filter((f) => f.severity === 'critical').length,
                resolved: resolved.length,
                avgResolveMinutes: resolved.length ? Math.round(sum(resolved, (f) => f.resolveMinutes) / resolved.length) : 0,
            },
            charts: {
                daily: [...groupBy(facts, (f) => f.day.ymd).values()].map((items) => ({ date: items[0].day.label, count: items.length })),
                byType: [...groupBy(facts, (f) => f.typeLabel).entries()].map(([name, items]) => ({ name, count: items.length })),
            },
            rows: [...facts].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
        };
    },
};

const BUILDERS = {
    'staff-attendance': staffAttendance,
    'student-attendance': studentAttendance,
    'gate-access': gateAccess,
    'room-utilization': roomUtilization,
    vehicle,
    visitor,
    'security-alert': securityAlert,
};

export const hasReportBuilder = (type) => Object.prototype.hasOwnProperty.call(BUILDERS, type);

// Trả { kpis: [{ key, value }], charts: [{ key, data }], rows } theo đúng thứ tự khai báo ở
// config/reportDefinitions (người gọi truyền `definition` để giữ thứ tự).
export const buildReport = (type, filters, state, now = new Date(), definition = null) => {
    if (!hasReportBuilder(type)) fail('Loại báo cáo không tồn tại');
    const { from, to } = filters || {};
    validateRange(from, to);
    const builder = BUILDERS[type];
    const days = daysInRange(from, to, now);

    const active = Object.entries(filters).filter(([key, value]) => !RESERVED_KEYS.includes(key) && value !== '' && value != null);
    const facts = builder.facts(state, days, now, { from, to }).filter((fact) => active.every(([key, value]) => fact[key] === value));
    const summary = builder.summarize(facts, { state, days, now, from, to, filters: Object.fromEntries(active) });

    const kpiKeys = definition ? definition.kpis.map((k) => k.key) : Object.keys(summary.kpis);
    const chartKeys = definition ? definition.charts.map((c) => c.key) : Object.keys(summary.charts);
    return {
        kpis: kpiKeys.map((key) => ({ key, value: summary.kpis[key] ?? 0 })),
        charts: chartKeys.map((key) => ({ key, data: summary.charts[key] || [] })),
        rows: summary.rows,
    };
};
