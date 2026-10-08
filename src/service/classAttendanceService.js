const SETTINGS_KEY = 'camai.classAttendance.settings';
const RECORDS_KEY = 'camai.classAttendance.records.v2';

export const DEFAULT_CLASS_ATTENDANCE_SETTINGS = {
    classStartTime: '08:00',
    lateThresholdMinutes: 10,
    autoScanIntervalSeconds: 4,
    semester: 'HK1 2026-2027'
};

const demoStudents = [
    { id: 'SV001', code: 'SV001', username: 'student.demo', email: 'student@meetingsys.vn', name: 'Lê Minh Sinh', avatar: 'S' },
    { id: 'SV002', code: 'SV002', username: 'nam.nguyen', email: 'nam.nguyen@smartracking.edu.vn', name: 'Nguyễn Hoàng Nam', avatar: 'N' },
    { id: 'SV003', code: 'SV003', username: 'lan.ngo', email: 'lan.ngo@smartracking.edu.vn', name: 'Ngô Thị Lan', avatar: 'L' },
    { id: 'SV004', code: 'SV004', username: 'huy.do', email: 'huy.do@smartracking.edu.vn', name: 'Đỗ Gia Huy', avatar: 'H' },
    { id: 'SV005', code: 'SV005', username: 'mai.tran', email: 'mai.tran@smartracking.edu.vn', name: 'Trần Ngọc Mai', avatar: 'M' },
    { id: 'SV006', code: 'SV006', username: 'anh.pham', email: 'anh.pham@smartracking.edu.vn', name: 'Phạm Đức Anh', avatar: 'A' },
    { id: 'SV007', code: 'SV007', username: 'thao.vo', email: 'thao.vo@smartracking.edu.vn', name: 'Võ Minh Thảo', avatar: 'T' },
    { id: 'SV008', code: 'SV008', username: 'khoa.le', email: 'khoa.le@smartracking.edu.vn', name: 'Lê Đăng Khoa', avatar: 'K' }
];

export const mockClassrooms = [
    {
        id: 'WEB-101',
        code: 'WEB101',
        subject: 'Lập trình Web',
        room: 'Phòng học A101',
        teacher: 'Nguyễn Thị Giang',
        schedule: 'Thứ 2, 08:00 - 10:30',
        scheduleWeekday: 1,
        semester: 'HK1 2026-2027',
        students: demoStudents.slice(0, 7)
    },
    {
        id: 'AI-202',
        code: 'AI202',
        subject: 'Trí tuệ nhân tạo ứng dụng',
        room: 'Phòng học A102',
        teacher: 'Nguyễn Thị Giang',
        schedule: 'Thứ 4, 13:30 - 16:00',
        scheduleWeekday: 3,
        semester: 'HK1 2026-2027',
        students: [demoStudents[0], demoStudents[1], demoStudents[2], demoStudents[4], demoStudents[5], demoStudents[7]]
    },
    {
        id: 'DB-303',
        code: 'DB303',
        subject: 'Cơ sở dữ liệu nâng cao',
        room: 'Phòng học B203',
        teacher: 'Nguyễn Thị Giang',
        schedule: 'Thứ 6, 09:00 - 11:30',
        scheduleWeekday: 5,
        semester: 'HK1 2026-2027',
        students: [demoStudents[0], demoStudents[2], demoStudents[3], demoStudents[4], demoStudents[6]]
    }
];

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('class-attendance-updated'));
};

const toLocalDateKey = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const todayKey = () => toLocalDateKey(new Date());

const toDateKey = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return toLocalDateKey(d);
};

const formatTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

const generatedEvidence = (student, direction) => {
    const text = `${student.code} - ${direction === 'out' ? 'RA LỚP' : 'VÀO LỚP'}`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
            <rect width="360" height="220" rx="16" fill="#111827"/>
            <rect x="24" y="24" width="312" height="172" rx="14" fill="#1f2937"/>
            <circle cx="180" cy="88" r="38" fill="#006BFF"/>
            <text x="180" y="101" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#fff">${student.avatar}</text>
            <text x="180" y="150" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#fff">${text}</text>
            <text x="180" y="174" text-anchor="middle" font-family="Arial" font-size="12" fill="#A6BBD1">CAMAI MOCK ĐIỂM DANH LỚP</text>
        </svg>
    `)}`;
};

export const getClassAttendanceSettingsStore = () => {
    const saved = readJson(SETTINGS_KEY, null);
    if (!saved) {
        return { global: DEFAULT_CLASS_ATTENDANCE_SETTINGS, byClass: {} };
    }
    if (saved.global || saved.byClass) {
        return {
            global: { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...(saved.global || {}) },
            byClass: saved.byClass || {}
        };
    }
    return {
        global: { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...saved },
        byClass: {}
    };
};

export const getClassAttendanceSettingsForClass = (classId) => {
    const store = getClassAttendanceSettingsStore();
    return {
        ...DEFAULT_CLASS_ATTENDANCE_SETTINGS,
        ...store.global,
        ...(classId ? store.byClass?.[classId] : {})
    };
};

export const getClassAttendanceSettings = (classId) => getClassAttendanceSettingsForClass(classId);

export const saveClassAttendanceSettings = (settings, classId) => {
    if (classId) {
        const store = getClassAttendanceSettingsStore();
        const nextStore = {
            ...store,
            byClass: {
                ...store.byClass,
                [classId]: { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...settings }
            }
        };
        writeJson(SETTINGS_KEY, nextStore);
        return nextStore.byClass[classId];
    }
    const next = { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...settings };
    const store = getClassAttendanceSettingsStore();
    writeJson(SETTINGS_KEY, { ...store, global: next });
    return next;
};

const buildDateForWeekday = (weekday, weeksAgo = 0) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const current = date.getDay();
    const offset = weekday - current - (weeksAgo * 7);
    date.setDate(date.getDate() + offset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() > today.getTime()) {
        date.setDate(date.getDate() - 7);
    }
    return toLocalDateKey(date);
};

const buildTimeIso = (dateKey, time) => new Date(`${dateKey}T${time}:00`).toISOString();

const seedClassAttendanceRecords = () => {
    const records = [];
    const statuses = ['on_time', 'late', 'left', 'on_time', 'absent', 'late', 'on_time', 'left'];
    const classTodayStatuses = ['left', 'on_time', 'late', 'on_time', 'absent', 'left', 'late', 'on_time'];

    mockClassrooms.forEach((klass, classIndex) => {
        const dateKeys = [
            todayKey(),
            buildDateForWeekday(klass.scheduleWeekday, 0),
            buildDateForWeekday(klass.scheduleWeekday, 1),
            buildDateForWeekday(klass.scheduleWeekday, 2),
            buildDateForWeekday(klass.scheduleWeekday, 3)
        ];
        Array.from(new Set(dateKeys)).forEach((dateKey, dateIndex) => {
            klass.students.forEach((student, studentIndex) => {
                const status = dateIndex === 0
                    ? classTodayStatuses[(studentIndex + classIndex) % classTodayStatuses.length]
                    : statuses[(studentIndex + dateIndex + classIndex) % statuses.length];
                if (status === 'absent') {
                    records.push({
                        id: `${klass.id}-${student.id}-${dateKey}`,
                        classId: klass.id,
                        date: dateKey,
                        studentId: student.id,
                        studentCode: student.code,
                        studentName: student.name,
                        checkInAt: null,
                        checkOutAt: null,
                        status: 'absent',
                        confidence: null,
                        evidenceImage: null,
                        source: 'mock-seed'
                    });
                    return;
                }

                const inTime = status === 'late'
                    ? ['08:16', '08:21', '09:14'][classIndex] || '08:16'
                    : ['07:56', '13:24', '08:51'][classIndex] || '07:56';
                const outTime = status === 'left'
                    ? ['10:32', '16:03', '11:28'][classIndex] || '10:32'
                    : null;
                records.push({
                    id: `${klass.id}-${student.id}-${dateKey}`,
                    classId: klass.id,
                    date: dateKey,
                    studentId: student.id,
                    studentCode: student.code,
                    studentName: student.name,
                    checkInAt: buildTimeIso(dateKey, inTime),
                    checkOutAt: outTime ? buildTimeIso(dateKey, outTime) : null,
                    status,
                    confidence: 94,
                    evidenceImage: generatedEvidence(student, status === 'left' ? 'out' : 'in'),
                    source: 'mock-seed'
                });
            });
        });
    });

    return records;
};

export const getClassAttendanceRecords = () => {
    const saved = readJson(RECORDS_KEY, null);
    if (saved) return saved;
    const seeded = seedClassAttendanceRecords();
    localStorage.setItem(RECORDS_KEY, JSON.stringify(seeded));
    return seeded;
};

export const saveClassAttendanceRecords = (records) => writeJson(RECORDS_KEY, records);

export const clearClassAttendanceRecords = () => {
    saveClassAttendanceRecords([]);
    return [];
};

const isLateCheckIn = (checkInIso, settings) => {
    const [hour, minute] = String(settings.classStartTime || '08:00').split(':').map(Number);
    const limit = new Date(checkInIso);
    limit.setHours(hour || 8, minute || 0, 0, 0);
    limit.setMinutes(limit.getMinutes() + Number(settings.lateThresholdMinutes || 0));
    return new Date(checkInIso).getTime() > limit.getTime();
};

const startOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d;
};

const getRangeBounds = (mode = 'day', anchorDate = new Date()) => {
    const start = new Date(anchorDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (mode === 'week') {
        const weekStart = startOfWeek(start);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return { start: weekStart, end: weekEnd };
    }
    if (mode === 'month') {
        start.setDate(1);
        end.setMonth(start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }
    if (mode === 'year') {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const formatDateText = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

const getSemesterBounds = (semester = DEFAULT_CLASS_ATTENDANCE_SETTINGS.semester) => {
    const yearMatch = String(semester).match(/(\d{4})-(\d{4})/);
    const startYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    const endYear = yearMatch ? Number(yearMatch[2]) : startYear + 1;
    if (String(semester).toUpperCase().startsWith('HK2')) {
        return {
            start: new Date(endYear, 0, 1),
            end: new Date(endYear, 4, 31, 23, 59, 59, 999)
        };
    }
    return {
        start: new Date(startYear, 8, 1),
        end: new Date(endYear, 0, 15, 23, 59, 59, 999)
    };
};

const buildSyntheticRecord = (klass, student, dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() > today.getTime()) return null;

    const day = date.getDate();
    if (day % 11 === 0) {
        return {
            classId: klass.id,
            date: dateKey,
            studentId: student.id,
            studentCode: student.code,
            studentName: student.name,
            checkInAt: null,
            checkOutAt: null,
            status: 'absent',
            confidence: null,
            source: 'mock-history'
        };
    }

    const late = day % 5 === 0;
    const checkInAt = new Date(`${dateKey}T${late ? '08:18:00' : '07:56:00'}`).toISOString();
    const checkOutAt = day % 7 === 0 ? new Date(`${dateKey}T10:30:00`).toISOString() : null;
    return {
        classId: klass.id,
        date: dateKey,
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        checkInAt,
        checkOutAt,
        status: late ? 'late' : 'on_time',
        confidence: 94,
        source: 'mock-history'
    };
};

const normalizeRecordToEntry = (klass, student, record, dateKey) => {
    const status = record?.checkInAt ? record.status : (record?.status || 'absent');
    const statusLabel = status === 'late'
        ? 'Đi muộn'
        : status === 'on_time'
            ? 'Đúng giờ'
            : status === 'left'
                ? 'Đã rời lớp'
                : 'Vắng';

    return {
        id: `${klass.id}-${student.id}-${dateKey}`,
        date: dateKey,
        dateText: formatDateText(dateKey),
        classId: klass.id,
        classCode: klass.code,
        className: klass.subject,
        room: klass.room,
        schedule: klass.schedule,
        studentId: student.id,
        studentCode: student.code,
        studentName: student.name,
        checkInAt: record?.checkInAt || null,
        checkOutAt: record?.checkOutAt || null,
        checkInText: formatTime(record?.checkInAt),
        checkOutText: formatTime(record?.checkOutAt),
        status,
        statusLabel,
        confidence: record?.confidence || null,
        evidenceImage: record?.evidenceImage || null
    };
};

export const buildClassAttendanceRows = (classId = mockClassrooms[0].id, date = todayKey()) => {
    const klass = mockClassrooms.find(item => item.id === classId) || mockClassrooms[0];
    const records = getClassAttendanceRecords().filter(r => r.classId === klass.id && r.date === date);
    return klass.students.map(student => {
        const record = records.find(r => r.studentId === student.id);
        const status = record ? (record.status || (record.checkInAt ? 'on_time' : 'absent')) : 'not_checked';
        return {
            ...student,
            classId: klass.id,
            className: klass.subject,
            checkInAt: record?.checkInAt || null,
            checkOutAt: record?.checkOutAt || null,
            evidenceImage: record?.evidenceImage || null,
            confidence: record?.confidence || null,
            status,
            statusLabel: status === 'late' ? 'Đi muộn' : status === 'on_time' ? 'Đúng giờ' : status === 'left' ? 'Đã rời lớp' : status === 'absent' ? 'Vắng' : 'Chưa điểm danh',
            checkInText: formatTime(record?.checkInAt),
            checkOutText: formatTime(record?.checkOutAt)
        };
    });
};

export const getClassAttendanceSummary = (classId = mockClassrooms[0].id, date = todayKey()) => {
    const rows = buildClassAttendanceRows(classId, date);
    return {
        total: rows.length,
        checkedIn: rows.filter(r => r.checkInAt).length,
        late: rows.filter(r => r.status === 'late').length,
        left: rows.filter(r => r.checkOutAt).length,
        missing: rows.filter(r => !r.checkInAt).length
    };
};

export const mockClassFaceScan = ({ classId = mockClassrooms[0].id, direction = 'in', snapshotImageBase64 } = {}) => {
    const klass = mockClassrooms.find(item => item.id === classId) || mockClassrooms[0];
    const settings = getClassAttendanceSettings(klass.id);
    const date = todayKey();
    const now = new Date().toISOString();
    const records = getClassAttendanceRecords();
    const todayRecords = records.filter(r => r.classId === klass.id && r.date === date);
    const target = direction === 'out'
        ? klass.students.find(student => {
            const record = todayRecords.find(r => r.studentId === student.id);
            return record?.checkInAt && !record?.checkOutAt;
        })
        : klass.students.find(student => !todayRecords.some(r => r.studentId === student.id && r.checkInAt));

    if (!target) {
        if (snapshotImageBase64) {
            const reusableRecord = [...records]
                .reverse()
                .find(record =>
                    record.classId === klass.id &&
                    record.date === date &&
                    (direction === 'out' ? record.checkOutAt : record.checkInAt)
                );
            if (reusableRecord) {
                const recordIndex = records.findIndex(record => record.id === reusableRecord.id);
                records[recordIndex] = {
                    ...records[recordIndex],
                    evidenceImage: snapshotImageBase64,
                    confidence: 94,
                    source: 'webcam'
                };
                saveClassAttendanceRecords(records);
                return {
                    success: true,
                    data: {
                        student: klass.students.find(student => student.id === reusableRecord.studentId),
                        record: records[recordIndex],
                        message: 'Không điểm danh lặp lại, đã cập nhật ảnh bằng chứng từ webcam.'
                    }
                };
            }
        }
        return {
            success: false,
            warning: true,
            message: direction === 'out' ? 'Tất cả sinh viên đã ghi nhận giờ rời lớp.' : 'Lớp này đã điểm danh đủ, không điểm danh lặp lại.'
        };
    }

    const existingIndex = records.findIndex(r => r.classId === klass.id && r.date === date && r.studentId === target.id);
    const evidenceImage = snapshotImageBase64 || generatedEvidence(target, direction);
    let nextRecord;

    if (existingIndex >= 0) {
        nextRecord = {
            ...records[existingIndex],
            checkOutAt: direction === 'out' ? now : records[existingIndex].checkOutAt,
            evidenceImage,
            confidence: 94,
            status: direction === 'out' ? 'left' : records[existingIndex].status
        };
        records[existingIndex] = nextRecord;
    } else {
        const status = isLateCheckIn(now, settings) ? 'late' : 'on_time';
        nextRecord = {
            id: `${klass.id}-${target.id}-${date}`,
            classId: klass.id,
            date,
            studentId: target.id,
            studentCode: target.code,
            studentName: target.name,
            checkInAt: now,
            checkOutAt: null,
            status,
            evidenceImage,
            confidence: 94,
            source: snapshotImageBase64 ? 'webcam' : 'mock-camera'
        };
        records.push(nextRecord);
    }

    saveClassAttendanceRecords(records);
    return {
        success: true,
        data: {
            student: target,
            record: nextRecord,
            message: direction === 'out' ? `${target.name} đã rời lớp.` : `${target.name} đã điểm danh ${nextRecord.status === 'late' ? 'đi muộn' : 'đúng giờ'}.`
        }
    };
};

export const exportClassAttendanceCsv = (classId = mockClassrooms[0].id, date = todayKey()) => {
    const klass = mockClassrooms.find(item => item.id === classId) || mockClassrooms[0];
    const rows = buildClassAttendanceRows(klass.id, date);
    const csvRows = [
        ['Môn học', 'Mã SV', 'Sinh viên', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Độ tin cậy'],
        ...rows.map(row => [
            klass.subject,
            row.code,
            row.name,
            row.checkInText,
            row.checkOutText,
            row.statusLabel,
            row.confidence ? `${row.confidence}%` : ''
        ])
    ];
    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chuyen-can-${klass.code}-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

export const exportSemesterClassAttendanceCsv = ({
    classId = 'all',
    semester = DEFAULT_CLASS_ATTENDANCE_SETTINGS.semester
} = {}) => {
    const classes = (classId === 'all' ? mockClassrooms : mockClassrooms.filter(item => item.id === classId))
        .filter(item => semester === 'all' || item.semester === semester);
    const savedRecords = getClassAttendanceRecords();
    const rows = [
        ['Học kỳ', 'Mã lớp', 'Môn học', 'Phòng học', 'Giảng viên', 'Ngày học', 'Mã SV', 'Sinh viên', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Ảnh bằng chứng']
    ];

    classes.forEach(klass => {
        const { start, end } = getSemesterBounds(klass.semester);
        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            const dateKey = toDateKey(cursor);
            if (cursor.getDay() !== klass.scheduleWeekday) return;
            klass.students.forEach(student => {
                const saved = savedRecords.find(record => record.classId === klass.id && record.date === dateKey && record.studentId === student.id);
                const record = saved || buildSyntheticRecord(klass, student, dateKey);
                if (!record) return;
                const entry = normalizeRecordToEntry(klass, student, record, dateKey);
                rows.push([
                    klass.semester,
                    klass.code,
                    klass.subject,
                    klass.room,
                    klass.teacher,
                    entry.dateText,
                    student.code,
                    student.name,
                    entry.checkInText,
                    entry.checkOutText,
                    entry.statusLabel,
                    entry.evidenceImage ? 'Có' : 'Không'
                ]);
            });
        }
    });

    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const classPart = classId === 'all' ? 'tat-ca-mon' : classes[0]?.code || 'lop';
    link.download = `bang-chuyen-can-${classPart}-${String(semester).replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

export const getBusinessClassAttendanceStats = () => {
    return mockClassrooms.map(klass => {
        const summary = getClassAttendanceSummary(klass.id);
        return {
            ...klass,
            ...summary,
            rate: summary.total ? Math.round((summary.checkedIn / summary.total) * 100) : 0
        };
    });
};

export const getStudentAttendanceReport = ({ studentId = 'SV001', mode = 'day', anchorDate = new Date() } = {}) => {
    const { start, end } = getRangeBounds(mode, anchorDate);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const savedRecords = getClassAttendanceRecords();
    const entries = [];

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const dateKey = toDateKey(cursor);
        mockClassrooms.forEach(klass => {
            const student = klass.students.find(item => item.id === studentId || item.code === studentId);
            if (!student) return;
            if (cursor.getDay() !== klass.scheduleWeekday) return;

            const saved = savedRecords.find(record => record.classId === klass.id && record.date === dateKey && record.studentId === student.id);
            const record = saved || buildSyntheticRecord(klass, student, dateKey);
            if (!record) return;
            entries.push(normalizeRecordToEntry(klass, student, record, dateKey));
        });
    }

    const attended = entries.filter(item => item.checkInAt).length;
    const late = entries.filter(item => item.status === 'late').length;
    const onTime = entries.filter(item => item.status === 'on_time' || item.status === 'left').length;
    const absent = entries.filter(item => !item.checkInAt || item.status === 'absent').length;

    return {
        period: { start: startKey, end: endKey },
        entries: entries.sort((a, b) => `${b.date}-${b.classCode}`.localeCompare(`${a.date}-${a.classCode}`)),
        summary: {
            totalSessions: entries.length,
            attended,
            onTime,
            late,
            absent,
            attendanceRate: entries.length ? Math.round((attended / entries.length) * 100) : 0
        }
    };
};
