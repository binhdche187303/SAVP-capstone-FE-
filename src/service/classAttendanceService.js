import { get, patch, post, buildQuery } from '../utils/request';

// Điểm danh lớp học — chỉ dùng dữ liệu thật từ BE (/class-attendance/*). Không còn mock/fallback cục bộ.
const SETTINGS_KEY = 'camai.classAttendance.settings';

export const DEFAULT_CLASS_ATTENDANCE_SETTINGS = {
    classStartTime: '08:00',
    lateThresholdMinutes: 10,
    autoScanIntervalSeconds: 4,
    semester: 'HK1 2026-2027'
};

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

// ---- Cache cấu hình phía FE (SystemSettings lưu song song khi PATCH BE) ----

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

const getClassAttendanceScopeKey = (classId, administrativeClass) => (
    administrativeClass ? `${classId}::${administrativeClass}` : classId
);

export const getClassAttendanceSettingsForClass = (classId, administrativeClass) => {
    const store = getClassAttendanceSettingsStore();
    const scopeKey = getClassAttendanceScopeKey(classId, administrativeClass);
    return {
        ...DEFAULT_CLASS_ATTENDANCE_SETTINGS,
        ...store.global,
        ...(classId ? store.byClass?.[scopeKey] : {})
    };
};

export const getClassAttendanceSettings = (classId, administrativeClass) => getClassAttendanceSettingsForClass(classId, administrativeClass);

export const saveClassAttendanceSettings = (settings, classId, administrativeClass) => {
    if (classId) {
        const store = getClassAttendanceSettingsStore();
        const scopeKey = getClassAttendanceScopeKey(classId, administrativeClass);
        const nextStore = {
            ...store,
            byClass: {
                ...store.byClass,
                [scopeKey]: { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...settings }
            }
        };
        writeJson(SETTINGS_KEY, nextStore);
        return nextStore.byClass[scopeKey];
    }
    const next = { ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...settings };
    const store = getClassAttendanceSettingsStore();
    writeJson(SETTINGS_KEY, { ...store, global: next });
    return next;
};

// ---- API thật ----

export const fetchClassAttendanceSettings = async (classId, administrativeClass) => {
    const query = classId ? `?classId=${encodeURIComponent(classId)}${administrativeClass ? `&administrativeClass=${encodeURIComponent(administrativeClass)}` : ''}` : '';
    const response = await get(`/class-attendance/settings${query}`, { skipToast: true });
    return response?.data || DEFAULT_CLASS_ATTENDANCE_SETTINGS;
};

export const updateClassAttendanceSettings = async (settings, classId, administrativeClass) => {
    const response = await patch('/class-attendance/settings', {
        classId,
        administrativeClass,
        classStartTime: settings.classStartTime,
        lateThresholdMinutes: Number(settings.lateThresholdMinutes),
        autoScanIntervalSeconds: Number(settings.autoScanIntervalSeconds)
    });
    return response?.data || settings;
};

export const fetchClassAttendanceClasses = async () => {
    const response = await get('/class-attendance/classes', { skipToast: true });
    return response?.data || [];
};

/** Buổi học thật (BE class_sessions, đồng bộ TKB UEL) trong [from, to] yyyy-MM-dd — theo quyền GV/SV/admin. */
export const fetchClassSessions = async (from, to) => {
    const response = await get(`/class-attendance/sessions${buildQuery({ from, to })}`, { skipToast: true });
    return response?.data || [];
};

export const fetchClassAttendanceRows = async (classId, date = todayKey()) => {
    const response = await get(`/class-attendance/classes/${classId}/rows${buildQuery({ date })}`, { skipToast: true });
    return response?.data || [];
};

export const fetchClassAttendanceSummary = async (classId, date = todayKey()) => {
    const response = await get(`/class-attendance/classes/${classId}/summary${buildQuery({ date })}`, { skipToast: true });
    return response?.data || null;
};

export const fetchClassAttendanceEvents = async (classId, date = todayKey()) => {
    const response = await get(`/class-attendance/classes/${classId}/events${buildQuery({ date })}`, { skipToast: true });
    return response?.data || [];
};

export const scanClassAttendance = async ({ classId, administrativeClass, direction = 'in', snapshotImageBase64 } = {}) => {
    const response = await post('/class-attendance/scan', {
        classId,
        administrativeClass,
        direction,
        snapshotImageBase64
    }, { skipToast: true });
    return {
        success: response?.data?.operationSuccess !== false && response?.success !== false,
        warning: Boolean(response?.data?.warning),
        data: response?.data,
        message: response?.message || response?.data?.message
    };
};

const downloadCsvBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

/** Xuất CSV các dòng điểm danh đang hiển thị (đã lấy từ BE) của một lớp trong một ngày. */
export const exportClassAttendanceCsv = (rows = [], klass = null, date = todayKey()) => {
    const csvRows = [
        ['Môn học', 'Lớp hành chính', 'Mã SV', 'Sinh viên', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Độ tin cậy'],
        ...rows.map(row => [
            klass?.subject || '',
            row.administrativeClass || '',
            row.code,
            row.name,
            row.checkInText,
            row.checkOutText,
            row.statusLabel,
            row.confidence ? `${row.confidence}%` : ''
        ])
    ];
    const csv = csvRows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadCsvBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), `chuyen-can-${klass?.code || 'lop'}-${date}.csv`);
};

/** Xuất CSV cả học kỳ từ BE (/class-attendance/export.csv). Lỗi sẽ được ném ra để trang hiển thị. */
export const exportSemesterClassAttendanceCsv = async ({
    classId = 'all',
    semester = 'all',
    subjectCode = 'all',
    administrativeClass = 'all'
} = {}) => {
    const response = await get(`/class-attendance/export.csv${buildQuery({ classId, semester, subjectCode, administrativeClass })}`, { skipToast: true });
    if (!response?.isBlob || !response.data) {
        throw new Error('Không xuất được file chuyên cần từ máy chủ.');
    }
    const classPart = classId === 'all' ? 'tat-ca-mon' : classId;
    const semesterPart = String(semester || 'tat-ca-hoc-ky').replace(/\s+/g, '-');
    downloadCsvBlob(response.data, `bang-chuyen-can-${classPart}-${semesterPart}.csv`);
    return true;
};

export const fetchBusinessClassAttendanceStats = async () => {
    const response = await get('/class-attendance/stats', { skipToast: true });
    return response?.data || [];
};

export const fetchTeacherClassAttendanceReport = async ({
    classId = 'all',
    semester = 'all',
    mode = 'month',
    anchorDate = todayKey(),
    subjectCode = 'all',
    administrativeClass = 'all'
} = {}) => {
    const response = await get(`/class-attendance/report${buildQuery({
        classId,
        semester,
        mode,
        subjectCode,
        administrativeClass,
        anchorDate: anchorDate instanceof Date ? toDateKey(anchorDate) : anchorDate
    })}`, { skipToast: true });
    return response?.data;
};

export const fetchStudentAttendanceReport = async ({
    studentId,
    mode = 'day',
    anchorDate = new Date(),
    subjectCode = 'all',
    self = false
} = {}) => {
    const dateValue = anchorDate instanceof Date ? toDateKey(anchorDate) : anchorDate;
    const endpoint = self ? '/class-attendance/student/me' : '/class-attendance/student/report';
    const response = await get(`${endpoint}${buildQuery({ studentId, mode, anchorDate: dateValue, subjectCode })}`, { skipToast: true });
    return response?.data;
};
