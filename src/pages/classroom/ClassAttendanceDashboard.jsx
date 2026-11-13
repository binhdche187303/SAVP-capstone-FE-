import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Download, Info, MapPin, RefreshCw, Search, Users, Wrench, X } from 'lucide-react';
import {
    DEFAULT_CLASS_ATTENDANCE_SETTINGS,
    fetchClassAttendanceClasses,
    fetchClassAttendanceRows,
    fetchClassAttendanceEvents,
    fetchClassAttendanceSettings,
    fetchClassSessions
} from '../../service/classAttendanceService';
import { getEquipments, reportEquipmentFault } from '../../service/equipmentServices';
import SimpleModal from '../../components/common/SimpleModal';
import { downloadReport } from '../../utils/exportExcel';
import SharedStatCard from '../../components/common/StatCard';
import Pagination from '../../components/common/Pagination';

const statusClass = {
    on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    late: 'bg-amber-50 text-amber-700 border-amber-200',
    left: 'bg-blue-50 text-action-blue border-blue-200',
    not_checked: 'bg-slate-50 text-slate-blue border-platinum-tint'
};

const popupTone = {
    success: { background: '#059669', border: '#10b981', icon: Check },
    warning: { background: '#d97706', border: '#f59e0b', icon: AlertTriangle },
    error: { background: '#dc2626', border: '#ef4444', icon: X },
    info: { background: '#003865', border: '#1d4ed8', icon: Info }
};

const ClassScanPopup = ({ notice, onClose }) => {
    if (!notice) return null;
    const tone = popupTone[notice.type] || popupTone.info;
    const Icon = tone.icon;

    return createPortal(
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                right: 24,
                bottom: 24,
                zIndex: 100000,
                width: 'min(420px, calc(100vw - 32px))',
                background: tone.background,
                color: '#fff',
                border: `1px solid ${tone.border}`,
                borderRadius: 12,
                boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12
            }}
        >
            <Icon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}>{notice.message}</p>
                {notice.detail && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, fontWeight: 600, opacity: 0.9 }}>{notice.detail}</p>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Đóng thông báo"
                style={{
                    width: 28,
                    height: 28,
                    border: 0,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                }}
            >
                <X style={{ width: 15, height: 15 }} />
            </button>
        </div>,
        document.body
    );
};

const normalizeSearch = (text) => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const getTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const filterLabelClass = 'block mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-blue';
const filterControlClass = 'w-full h-10 px-3 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/15';

const shiftDateKey = (dateKey, days) => {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// vi-VN chỉ ngày+tháng ra "15-11" trên Chrome → tự ghép dd/mm.
const formatDayLabel = (dateKey) => { const [, m, d] = String(dateKey).split('-'); return `${d}/${m}`; };

/** Buổi học thật của lớp trong ngày đang xem (từ /class-attendance/sessions). */
const describeSession = (session, dateKey) => session
    ? { schedule: `${formatDayLabel(dateKey)} ${session.startTime} - ${session.endTime}`, room: session.room || 'Chưa có phòng' }
    : { schedule: `Không có buổi học ngày ${formatDayLabel(dateKey)}`, room: '—' };

const nowClock = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

/** Trạng thái buổi học so với hiện tại: live | upcoming | done (null nếu không có buổi). */
const getSessionPhase = (session, dateKey) => {
    if (!session) return null;
    const today = getTodayKey();
    if (dateKey < today) return 'done';
    if (dateKey > today) return 'upcoming';
    const now = nowClock();
    if (session.startTime && now < session.startTime) return 'upcoming';
    if (session.endTime && now > session.endTime) return 'done';
    return 'live';
};

const PHASE_META = {
    live: { label: 'Đang diễn ra', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
    upcoming: { label: 'Sắp diễn ra', cls: 'bg-blue-50 text-action-blue border-blue-200', dot: 'bg-action-blue' },
    done: { label: 'Đã kết thúc', cls: 'bg-cloud-mist text-slate-blue border-platinum-tint', dot: 'bg-steel-gray' }
};

const PhaseBadge = ({ phase }) => {
    const meta = PHASE_META[phase];
    if (!meta) return null;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${meta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
        </span>
    );
};

/** Bộ lọc bảng sinh viên — bấm thẻ thống kê để lọc. */
const STUDENT_FILTERS = {
    all: { label: 'Tất cả', match: () => true },
    in: { label: 'Đã vào lớp', match: row => Boolean(row.checkInAt) },
    late: { label: 'Đi muộn', match: row => row.status === 'late' },
    missing: { label: 'Chưa vào', match: row => !row.checkInAt }
};

const formatLongDay = (dateKey) => {
    const text = new Date(`${dateKey}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Thanh chọn ngày một dòng: ‹ Thứ Sáu, 13/11/2026 [Hôm nay] › 📅 … tóm tắt … [Về hôm nay]. */
const DayBar = ({ value, onChange, summary }) => {
    const isToday = value === getTodayKey();
    const stepClass = 'w-8 h-8 shrink-0 rounded-lg text-slate-blue inline-flex items-center justify-center hover:bg-cloud-mist hover:text-action-blue';
    return (
        <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm px-2 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center">
                <button type="button" onClick={() => onChange(shiftDateKey(value, -1))} className={stepClass} aria-label="Ngày trước">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-1 text-sm font-bold text-midnight-indigo whitespace-nowrap">{formatLongDay(value)}</span>
                {isToday && <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-50 text-action-blue text-[10px] font-bold">Hôm nay</span>}
                <button type="button" onClick={() => onChange(shiftDateKey(value, 1))} className={stepClass} aria-label="Ngày sau">
                    <ChevronRight className="w-4 h-4" />
                </button>
                <label className={`${stepClass} relative cursor-pointer`} title="Chọn ngày">
                    <CalendarDays className="w-4 h-4" />
                    <input
                        type="date"
                        value={value}
                        onChange={(event) => event.target.value && onChange(event.target.value)}
                        onClick={(event) => event.currentTarget.showPicker?.()}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label="Chọn ngày"
                    />
                </label>
            </div>
            {summary && <span className="text-xs text-slate-blue">{summary}</span>}
            {!isToday && (
                <button type="button" onClick={() => onChange(getTodayKey())} className="ml-auto h-8 px-3 rounded-lg text-xs font-bold text-action-blue hover:bg-blue-50">
                    Về hôm nay
                </button>
            )}
        </div>
    );
};

const ClassAttendanceDashboard = ({ mode = 'teacher' }) => {
    const location = useLocation();
    const attendanceQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const queryClassId = attendanceQuery.get('classId') || '';
    const queryAdministrativeClass = attendanceQuery.get('administrativeClass') || '';
    const [classrooms, setClassrooms] = useState([]);
    const [daySessions, setDaySessions] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [selectedClassId, setSelectedClassId] = useState(queryClassId);
    const [selectedDate, setSelectedDate] = useState(getTodayKey);
    const [selectedAdministrativeClass, setSelectedAdministrativeClass] = useState(queryAdministrativeClass);
    const [dayLoading, setDayLoading] = useState(true);
    const [nextSession, setNextSession] = useState(null);
    const [clockTick, setClockTick] = useState(0);
    const [studentSearch, setStudentSearch] = useState('');
    const [studentFilter, setStudentFilter] = useState('all');
    const [studentPage, setStudentPage] = useState(1);
    const [eventPage, setEventPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [attendanceEvents, setAttendanceEvents] = useState([]);
    const [settings, setSettings] = useState(DEFAULT_CLASS_ATTENDANCE_SETTINGS);
    const [scanNotice, setScanNotice] = useState(null);
    const [faultOpen, setFaultOpen] = useState(false);
    const [faultEquipments, setFaultEquipments] = useState([]);
    const [faultLoading, setFaultLoading] = useState(false);
    const [faultError, setFaultError] = useState('');
    const [faultForm, setFaultForm] = useState({ equipmentId: '', healthStatus: 'faulty', issueNote: '' });
    const [faultSubmitting, setFaultSubmitting] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    const sessionByClass = useMemo(() => {
        const map = new Map();
        daySessions.forEach(session => { if (!map.has(session.classId)) map.set(session.classId, session); });
        return map;
    }, [daySessions]);
    // Lớp đang mở: ưu tiên dữ liệu lớp đầy đủ; danh sách lớp chưa về thì dựng tạm từ buổi học trong ngày.
    const selectedClass = useMemo(() => {
        if (!selectedClassId) return null;
        const found = classrooms.find(item => item.id === selectedClassId);
        if (found) return found;
        const session = sessionByClass.get(selectedClassId);
        return session ? {
            id: session.classId,
            code: session.classCode,
            subject: session.subject,
            subjectCode: session.subjectCode,
            semester: session.semester,
            teacher: session.teacher,
            studentCount: session.studentCount,
            administrativeClasses: []
        } : null;
    }, [classrooms, selectedClassId, sessionByClass]);
    const selectedRawSession = sessionByClass.get(selectedClassId) || null;
    const selectedSession = useMemo(
        () => describeSession(selectedRawSession, selectedDate),
        [selectedRawSession, selectedDate]
    );

    // Danh sách = các buổi dạy trong ngày đang xem, theo giờ bắt đầu (1 lớp có 2 buổi/ngày → 2 dòng).
    const classById = useMemo(() => new Map(classrooms.map(item => [item.id, item])), [classrooms]);
    const dayEntries = useMemo(() => daySessions
        .map(session => {
            const cls = classById.get(session.classId);
            return {
                ...session,
                subject: session.subject || cls?.subject,
                subjectCode: session.subjectCode || cls?.subjectCode,
                classCode: session.classCode || cls?.code,
                studentCount: session.studentCount ?? cls?.studentCount,
                administrativeClasses: cls?.administrativeClasses || [],
                phase: getSessionPhase(session, selectedDate)
            };
        })
        .filter(entry => !selectedAdministrativeClass || entry.administrativeClasses.includes(selectedAdministrativeClass))
        .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || String(a.classCode).localeCompare(String(b.classCode), 'vi')),
    // clockTick: tính lại trạng thái Đang diễn ra / Đã kết thúc theo đồng hồ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classById, daySessions, selectedAdministrativeClass, selectedDate, clockTick]);
    const phaseCount = useMemo(() => dayEntries.reduce((acc, entry) => ({ ...acc, [entry.phase]: (acc[entry.phase] || 0) + 1 }), {}), [dayEntries]);
    const daySummary = dayLoading
        ? 'Đang tải…'
        : [
            `${dayEntries.length} buổi dạy`,
            phaseCount.live && `${phaseCount.live} đang diễn ra`,
            phaseCount.upcoming && `${phaseCount.upcoming} sắp tới`,
            phaseCount.done && `${phaseCount.done} đã kết thúc`
        ].filter(Boolean).join(' · ');

    // Lớp hành chính hợp lệ: đã mở lớp HP → các lớp HC của lớp đó; chưa mở → mọi lớp HC giảng viên phụ trách.
    const administrativeClassOptions = useMemo(
        () => [...new Set((selectedClass ? [selectedClass] : classrooms).flatMap(item => item.administrativeClasses || []))],
        [selectedClass, classrooms]
    );

    const filteredRows = useMemo(
        () => selectedAdministrativeClass && rows.some(row => row.administrativeClass === selectedAdministrativeClass)
            ? rows.filter(row => row.administrativeClass === selectedAdministrativeClass)
            : rows,
        [rows, selectedAdministrativeClass]
    );

    const filteredSummary = useMemo(() => ({
        total: filteredRows.length,
        checkedIn: filteredRows.filter(row => row.checkInAt).length,
        late: filteredRows.filter(row => row.status === 'late').length,
        left: filteredRows.filter(row => row.checkOutAt).length,
        missing: filteredRows.filter(row => !row.checkInAt).length
    }), [filteredRows]);

    // Bảng SV: lọc thêm theo thẻ thống kê (trạng thái) + ô tìm tên/mã SV.
    const tableRows = useMemo(() => {
        const keyword = normalizeSearch(studentSearch.trim());
        return filteredRows
            .filter(row => STUDENT_FILTERS[studentFilter]?.match(row) ?? true)
            .filter(row => !keyword || normalizeSearch(`${row.name || ''} ${row.code || ''}`).includes(keyword));
    }, [filteredRows, studentFilter, studentSearch]);

    const studentsPerPage = 20;
    const studentPageCount = Math.max(1, Math.ceil(tableRows.length / studentsPerPage));
    const visibleRows = useMemo(
        () => tableRows.slice((studentPage - 1) * studentsPerPage, studentPage * studentsPerPage),
        [tableRows, studentPage]
    );

    const eventsPerPage = 5;
    const eventPageCount = Math.max(1, Math.ceil(attendanceEvents.length / eventsPerPage));
    const visibleAttendanceEvents = useMemo(
        () => attendanceEvents.slice((eventPage - 1) * eventsPerPage, eventPage * eventsPerPage),
        [attendanceEvents, eventPage]
    );

    const refresh = useCallback(() => {
        let cancelled = false;
        const load = async () => {
            try {
                // Danh sách lớp lỗi/chậm không được làm trống trang: buổi học trong ngày đã đủ thông tin để hiển thị.
                const [apiClasses, apiSessions] = await Promise.all([
                    fetchClassAttendanceClasses().catch(() => null),
                    fetchClassSessions(selectedDate, selectedDate)
                ]);
                if (cancelled) return;
                const classList = apiClasses || [];
                if (apiClasses) setClassrooms(apiClasses);
                setDaySessions(apiSessions);
                setDayLoading(false);
                setLoadError('');
                setLastUpdatedAt(new Date());
                const exists = !selectedClassId
                    || !apiClasses
                    || classList.some(item => item.id === selectedClassId)
                    || apiSessions.some(session => session.classId === selectedClassId);
                const nextClassId = exists ? selectedClassId : (mode === 'teacher' ? '' : classList[0]?.id || '');
                if (nextClassId !== selectedClassId) setSelectedClassId(nextClassId);
                if (!nextClassId) {
                    setRows([]);
                    setAttendanceEvents([]);
                    setSettings(DEFAULT_CLASS_ATTENDANCE_SETTINGS);
                    return;
                }
                const [apiRows, apiSettings, apiEvents] = await Promise.all([
                    fetchClassAttendanceRows(nextClassId, selectedDate),
                    fetchClassAttendanceSettings(nextClassId, selectedAdministrativeClass).catch(() => DEFAULT_CLASS_ATTENDANCE_SETTINGS),
                    fetchClassAttendanceEvents(nextClassId, selectedDate).catch(() => [])
                ]);
                if (cancelled) return;
                setRows(apiRows);
                setAttendanceEvents(apiEvents);
                setSettings({ ...DEFAULT_CLASS_ATTENDANCE_SETTINGS, ...apiSettings });
            } catch (error) {
                if (cancelled) return;
                setDayLoading(false);
                setLoadError(error?.message || 'Không tải được dữ liệu lớp học. Vui lòng thử lại.');
                setRows([]);
                setAttendanceEvents([]);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [mode, selectedAdministrativeClass, selectedClassId, selectedDate]);

    // Đổi ngày → hiện "Đang tải…" thay vì nháy trạng thái "không có buổi".
    useEffect(() => {
        setDayLoading(true);
        setDaySessions([]);
        setNextSession(null);
    }, [selectedDate]);

    // Ngày không có buổi dạy → tìm buổi gần nhất trong 60 ngày tới để gợi ý nhảy tới.
    useEffect(() => {
        if (dayLoading || daySessions.length || selectedClassId) return undefined;
        let cancelled = false;
        fetchClassSessions(shiftDateKey(selectedDate, 1), shiftDateKey(selectedDate, 60))
            .then(list => {
                if (cancelled) return;
                const first = [...list].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0];
                setNextSession(first || false);
            })
            .catch(() => { if (!cancelled) setNextSession(false); });
        return () => { cancelled = true; };
    }, [dayLoading, daySessions.length, selectedClassId, selectedDate]);

    // Cập nhật nhãn Đang diễn ra / Đã kết thúc mỗi phút khi đang xem hôm nay.
    useEffect(() => {
        if (selectedClassId || selectedDate !== getTodayKey()) return undefined;
        const timer = setInterval(() => setClockTick(tick => tick + 1), 60000);
        return () => clearInterval(timer);
    }, [selectedClassId, selectedDate]);

    useEffect(() => {
        if (eventPage > eventPageCount) setEventPage(eventPageCount);
    }, [eventPage, eventPageCount]);

    useEffect(() => {
        if (studentPage > studentPageCount) setStudentPage(studentPageCount);
    }, [studentPage, studentPageCount]);

    useEffect(() => {
        setStudentPage(1);
        setEventPage(1);
    }, [selectedClassId, selectedDate, selectedAdministrativeClass]);

    useEffect(() => {
        setStudentSearch('');
        setStudentFilter('all');
    }, [selectedClassId]);

    useEffect(() => {
        setStudentPage(1);
    }, [studentFilter, studentSearch]);

    useEffect(() => {
        if (classrooms.length && selectedAdministrativeClass && !administrativeClassOptions.includes(selectedAdministrativeClass)) {
            setSelectedAdministrativeClass('');
        }
    }, [administrativeClassOptions, classrooms.length, selectedAdministrativeClass]);

    // Khi mở 1 lớp (bấm từ danh sách hoặc ?classId=): lớp HP chỉ có 1 lớp HC → lọc luôn theo lớp HC đó.
    // Lưu bộ lọc lớp HC cũ để quay về danh sách trả lại đúng như trước.
    const filtersBeforeClassRef = useRef(null);
    const syncedClassIdRef = useRef('');
    useEffect(() => {
        if (!selectedClassId) {
            syncedClassIdRef.current = '';
            filtersBeforeClassRef.current = null;
        }
    }, [selectedClassId]);

    useEffect(() => {
        if (!selectedClass || syncedClassIdRef.current === selectedClass.id) return;
        if (!syncedClassIdRef.current) {
            filtersBeforeClassRef.current = { administrativeClass: selectedAdministrativeClass };
        }
        syncedClassIdRef.current = selectedClass.id;
        const adminClasses = selectedClass.administrativeClasses || [];
        if (adminClasses.length === 1) setSelectedAdministrativeClass(adminClasses[0]);
        else if (selectedAdministrativeClass && adminClasses.length && !adminClasses.includes(selectedAdministrativeClass)) setSelectedAdministrativeClass('');
    }, [selectedAdministrativeClass, selectedClass]);

    const backToClassList = () => {
        const previous = filtersBeforeClassRef.current;
        filtersBeforeClassRef.current = null;
        syncedClassIdRef.current = '';
        setSelectedClassId('');
        setRows([]);
        setAttendanceEvents([]);
        if (previous) setSelectedAdministrativeClass(previous.administrativeClass || '');
    };

    useEffect(() => {
        const cleanup = refresh();
        const handler = () => refresh();
        window.addEventListener('class-attendance-updated', handler);
        return () => {
            cleanup?.();
            window.removeEventListener('class-attendance-updated', handler);
        };
    }, [refresh]);

    useEffect(() => {
        if (!selectedClassId || selectedDate !== getTodayKey()) return undefined;
        const timer = setInterval(() => refresh(), 5000);
        return () => clearInterval(timer);
    }, [refresh, selectedClassId, selectedDate]);

    const openFaultReport = async () => {
        const roomId = selectedRawSession?.roomId;
        setFaultOpen(true);
        setFaultError('');
        setFaultEquipments([]);
        setFaultForm({ equipmentId: '', healthStatus: 'faulty', issueNote: '' });
        if (!roomId) {
            setFaultError('Buổi học chưa được gán phòng nên chưa xác định được camera.');
            return;
        }
        setFaultLoading(true);
        try {
            const res = await getEquipments({ currentRoomId: roomId, limit: 100 });
            if (!res?.success) throw new Error(res?.message || 'Không tải được thiết bị của phòng.');
            const isCamera = (item) => (item.equipmentType === 'camera' ? 0 : 1);
            const list = [...(res.data || [])].sort((a, b) => isCamera(a) - isCamera(b));
            setFaultEquipments(list);
            if (!list.length) setFaultError('Phòng này chưa được gán thiết bị nào.');
            setFaultForm(form => ({ ...form, equipmentId: list[0]?.id || '' }));
        } catch (error) {
            setFaultError(error?.message || 'Không tải được thiết bị của phòng.');
        } finally {
            setFaultLoading(false);
        }
    };

    const submitFaultReport = async (event) => {
        event.preventDefault();
        const equipment = faultEquipments.find(item => String(item.id) === String(faultForm.equipmentId));
        if (!equipment || !faultForm.issueNote.trim()) return;
        setFaultSubmitting(true);
        setFaultError('');
        try {
            const res = await reportEquipmentFault(equipment.id, {
                healthStatus: faultForm.healthStatus,
                issueNote: faultForm.issueNote.trim()
            });
            if (!res?.success) throw new Error(res?.message || 'Gửi báo hỏng thất bại.');
            setFaultOpen(false);
            setScanNotice({
                type: 'success',
                message: `Đã báo hỏng "${equipment.equipmentName}".`,
                detail: 'Bộ phận quản trị sẽ xác nhận và xử lý.'
            });
        } catch (error) {
            setFaultError(error?.message || 'Gửi báo hỏng thất bại.');
        } finally {
            setFaultSubmitting(false);
        }
    };

    useEffect(() => {
        if (!scanNotice || scanNotice.type === 'warning' || scanNotice.type === 'error') return undefined;
        const timer = setTimeout(() => setScanNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [scanNotice]);

    const [exporting, setExporting] = useState(false);
    const exportExcel = async () => {
        if (!filteredRows.length || exporting) return;
        setExporting(true);
        try {
            await downloadReport({
                fileName: `diem-danh-${selectedClass?.code || 'lop'}-${selectedDate}`,
                title: 'DANH SÁCH ĐIỂM DANH LỚP HỌC PHẦN',
                subtitle: `Ngày ${formatDayLabel(selectedDate)}`,
                info: [
                    ['Môn học', selectedClass?.subject],
                    ['Lớp học phần', selectedClass?.code],
                    ['Lớp hành chính', selectedAdministrativeClass || 'Tất cả'],
                    ['Giảng viên', selectedClass?.teacher],
                    ['Buổi học', selectedSession.schedule],
                    ['Phòng', selectedSession.room],
                    ['Sĩ số', filteredSummary.total],
                    ['Đã vào lớp', filteredSummary.checkedIn],
                    ['Đi muộn', filteredSummary.late],
                    ['Chưa vào', filteredSummary.missing]
                ],
                sheets: [{
                    name: 'Điểm danh',
                    columns: [
                        { header: 'STT', key: 'stt', width: 6, align: 'center' },
                        { header: 'Mã SV', key: 'code', width: 14 },
                        { header: 'Họ tên', key: 'name', width: 28 },
                        { header: 'Lớp hành chính', key: 'administrativeClass', width: 16 },
                        { header: 'Giờ vào', key: 'checkInText', width: 11, align: 'center' },
                        { header: 'Giờ ra', key: 'checkOutText', width: 11, align: 'center' },
                        { header: 'Trạng thái', key: 'statusLabel', width: 16 },
                        { header: 'Độ tin cậy', key: 'confidence', width: 11, align: 'center' }
                    ],
                    rows: filteredRows.map((row, index) => ({
                        stt: index + 1,
                        code: row.code,
                        name: row.name,
                        administrativeClass: row.administrativeClass || '',
                        checkInText: row.checkInText,
                        checkOutText: row.checkOutText,
                        statusLabel: row.statusLabel,
                        status: row.status,
                        confidence: row.confidence ? `${row.confidence}%` : ''
                    })),
                    cellStyle: (row, key) => {
                        if (key !== 'statusLabel') return null;
                        if (row.status === 'late') return { fill: 'FEF3C7', color: 'B45309', bold: true };
                        if (row.status === 'not_checked') return { color: '6B7280' };
                        return { fill: 'DCFCE7', color: '15803D', bold: true };
                    }
                }]
            });
        } catch (error) {
            setScanNotice({ type: 'error', message: 'Không xuất được file Excel.', detail: error?.message || 'Vui lòng thử lại.' });
        } finally {
            setExporting(false);
        }
    };

    const showCameraPanel = mode === 'teacher' && Boolean(selectedClass);
    // clockTick: trạng thái buổi đang xem đổi theo đồng hồ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const selectedPhase = useMemo(() => (selectedRawSession ? getSessionPhase(selectedRawSession, selectedDate) : null), [selectedRawSession, selectedDate, clockTick]);
    const sessionStartTime = selectedRawSession?.startTime || settings.classStartTime;
    const adminClassChoices = selectedClass?.administrativeClasses || [];

    return (
        <div className="space-y-5 animate-fade-in-up">
            {loadError && (
                <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">
                    <AlertCircle className="w-4 h-4" /> {loadError}
                </div>
            )}

            {mode === 'teacher' && !selectedClassId ? <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight">Điểm danh lớp</h1>
                    <p className="text-xs text-slate-blue mt-0.5">
                        Các buổi dạy trong ngày. Camera phòng học tự quét FaceID, ghi nhận giờ vào/ra và đi muộn.
                    </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-blue">
                    {lastUpdatedAt && <span>Cập nhật {lastUpdatedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    <button type="button" onClick={refresh} className="w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-white hover:text-action-blue" aria-label="Tải lại" title="Tải lại">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <DayBar value={selectedDate} onChange={setSelectedDate} summary={daySummary} />

            {selectedAdministrativeClass && (
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-blue">Đang lọc:</span>
                    <button type="button" onClick={() => setSelectedAdministrativeClass('')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-action-blue font-bold">
                        Lớp HC {selectedAdministrativeClass} <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {dayLoading ? (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm divide-y divide-platinum-tint/70">
                    {[0, 1, 2].map(key => (
                        <div key={key} className="px-4 py-4 flex items-center gap-4 animate-pulse">
                            <div className="w-16 h-9 rounded-lg bg-cloud-mist" />
                            <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-cloud-mist" /><div className="h-3 w-1/4 rounded bg-cloud-mist" /></div>
                        </div>
                    ))}
                </div>
            ) : dayEntries.length === 0 ? (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm px-6 py-12 text-center">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-cloud-mist text-slate-blue flex items-center justify-center">
                        <CalendarDays className="w-6 h-6" />
                    </div>
                    <p className="mt-3 text-sm font-bold text-midnight-indigo">
                        Không có buổi dạy {selectedDate === getTodayKey() ? 'hôm nay' : `ngày ${formatDayLabel(selectedDate)}`}
                    </p>
                    {nextSession ? (
                        <>
                            <p className="mt-1 text-xs text-slate-blue">
                                Buổi tiếp theo: {formatLongDay(nextSession.date)} · {nextSession.startTime} · {nextSession.subject || nextSession.classCode}
                            </p>
                            <button type="button" onClick={() => setSelectedDate(nextSession.date)} className="mt-4 h-9 px-4 rounded-xl bg-action-blue text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-blue-700">
                                Xem ngày {formatDayLabel(nextSession.date)} <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </>
                    ) : nextSession === false ? (
                        <p className="mt-1 text-xs text-slate-blue">Không có buổi dạy nào trong 60 ngày tới.</p>
                    ) : null}
                </div>
            ) : (
                <ul className="bg-white border border-platinum-tint rounded-2xl shadow-sm divide-y divide-platinum-tint/70 overflow-hidden">
                    {dayEntries.map(entry => {
                        const live = entry.phase === 'live';
                        const done = entry.phase === 'done';
                        const adminClasses = entry.administrativeClasses;
                        return (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    data-session-entry
                                    onClick={() => setSelectedClassId(entry.classId)}
                                    className={`group w-full text-left px-4 py-3.5 flex items-center gap-4 transition-colors hover:bg-blue-50/40 ${live ? 'bg-emerald-50/40 shadow-[inset_3px_0_0_0_#10b981]' : ''}`}
                                >
                                    <div className={`w-16 shrink-0 text-center ${done ? 'text-steel-gray' : 'text-midnight-indigo'}`}>
                                        <p className="text-base font-bold leading-tight tabular-nums">{entry.startTime}</p>
                                        <p className="text-[11px] font-semibold text-slate-blue tabular-nums">{entry.endTime}</p>
                                    </div>
                                    <div className="w-px self-stretch bg-platinum-tint" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {entry.subjectCode && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-blue-50 text-action-blue text-[11px] font-bold">{entry.subjectCode}</span>
                                            )}
                                            <span className={`font-bold truncate ${done ? 'text-slate-blue' : 'text-midnight-indigo'}`} title={entry.subject}>
                                                {entry.subject || 'Chưa cập nhật tên môn'}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-blue truncate">
                                            Lớp HP {entry.classCode}
                                            {adminClasses.length > 0 && <> · Lớp HC {adminClasses.slice(0, 3).join(', ')}{adminClasses.length > 3 ? ` +${adminClasses.length - 3}` : ''}</>}
                                            {entry.periodStart ? <> · Tiết {entry.periodStart}{entry.periodCount > 1 ? `–${entry.periodStart + entry.periodCount - 1}` : ''}</> : null}
                                        </p>
                                    </div>
                                    <div className="hidden md:flex flex-col items-end gap-1 shrink-0 w-48 text-xs">
                                        <span className="inline-flex items-center gap-1.5 font-semibold text-midnight-indigo truncate max-w-full">
                                            <MapPin className="w-3.5 h-3.5 shrink-0 text-steel-gray" /> {entry.room || 'Chưa có phòng'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 text-slate-blue">
                                            <Users className="w-3.5 h-3.5 text-steel-gray" /> {entry.studentCount ?? 0} sinh viên
                                        </span>
                                    </div>
                                    <div className="w-28 shrink-0 flex justify-end"><PhaseBadge phase={entry.phase} /></div>
                                    <span className={`shrink-0 h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 ${live ? 'bg-action-blue text-white' : 'text-action-blue group-hover:bg-blue-50'}`}>
                                        {done ? 'Xem lại' : 'Điểm danh'} <ChevronRight className="w-3.5 h-3.5" />
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            </> : <>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={backToClassList}
                        className="mt-0.5 w-9 h-9 shrink-0 rounded-xl border border-platinum-tint bg-white text-midnight-indigo inline-flex items-center justify-center hover:border-action-blue hover:text-action-blue"
                        aria-label="Về danh sách buổi dạy"
                        title="Về danh sách buổi dạy"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedClass?.subjectCode && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-action-blue text-[11px] font-bold">{selectedClass.subjectCode}</span>
                            )}
                            <h1 className="text-xl font-bold text-midnight-indigo tracking-tight">{selectedClass?.subject || 'Lớp học phần'}</h1>
                            <PhaseBadge phase={selectedPhase} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-blue">
                            <span className="font-semibold text-midnight-indigo">Lớp HP {selectedClass?.code || '—'}</span>
                            <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {formatLongDay(selectedDate)}</span>
                            {selectedRawSession ? <>
                                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {selectedRawSession.startTime} – {selectedRawSession.endTime}</span>
                                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedRawSession.room || 'Chưa có phòng'}</span>
                            </> : <span className="text-amber-700 font-semibold">Không có buổi học trong ngày này</span>}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {lastUpdatedAt && (
                        <span className="text-[11px] text-slate-blue">
                            {selectedDate === getTodayKey() ? 'Tự cập nhật' : 'Cập nhật'} {lastUpdatedAt.toLocaleTimeString('vi-VN')}
                        </span>
                    )}
                    {showCameraPanel && (
                        <button
                            type="button"
                            onClick={openFaultReport}
                            disabled={!selectedRawSession}
                            title={selectedRawSession ? 'Báo hỏng camera phòng học' : 'Không có buổi học trong ngày đang xem'}
                            className="h-9 px-3 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-600 inline-flex items-center gap-2 whitespace-nowrap hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Wrench className="w-4 h-4" /> Báo hỏng camera
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={exportExcel}
                        disabled={!filteredRows.length || exporting}
                        className="h-9 px-3 rounded-xl bg-action-blue text-white text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SharedStatCard
                    label="Sĩ số"
                    value={filteredSummary.total}
                    hint={selectedAdministrativeClass ? `Lớp HC ${selectedAdministrativeClass}` : 'Bấm để xem tất cả'}
                    onClick={() => setStudentFilter('all')}
                    active={studentFilter === 'all'}
                />
                <SharedStatCard
                    tone={filteredSummary.checkedIn > 0 ? 'green' : 'neutral'}
                    label="Đã vào lớp"
                    value={filteredSummary.checkedIn}
                    hint={`Đã rời lớp: ${filteredSummary.left}`}
                    onClick={() => setStudentFilter(v => (v === 'in' ? 'all' : 'in'))}
                    active={studentFilter === 'in'}
                />
                <SharedStatCard
                    tone={filteredSummary.late > 0 ? 'amber' : 'neutral'}
                    label="Đi muộn"
                    value={filteredSummary.late}
                    hint={`Quá ${settings.lateThresholdMinutes} phút sau ${sessionStartTime}`}
                    onClick={() => setStudentFilter(v => (v === 'late' ? 'all' : 'late'))}
                    active={studentFilter === 'late'}
                />
                <SharedStatCard
                    tone={filteredSummary.missing > 0 && selectedPhase && selectedPhase !== 'upcoming' ? 'red' : 'neutral'}
                    label="Chưa vào"
                    value={filteredSummary.missing}
                    hint={selectedPhase === 'upcoming' ? `Buổi học bắt đầu ${sessionStartTime}` : 'Camera chưa ghi nhận'}
                    onClick={() => setStudentFilter(v => (v === 'missing' ? 'all' : 'missing'))}
                    active={studentFilter === 'missing'}
                />
            </div>

            {mode === 'teacher' && (
                <ClassScanPopup notice={scanNotice} onClose={() => setScanNotice(null)} />
            )}

            <SimpleModal
                isOpen={faultOpen}
                size="sm"
                title={`Báo hỏng thiết bị · ${selectedSession.room}`}
                onClose={() => !faultSubmitting && setFaultOpen(false)}
                footer={<>
                    <button type="button" onClick={() => setFaultOpen(false)} disabled={faultSubmitting} className="px-4 py-2 rounded-xl border border-platinum-tint text-xs font-bold text-slate-blue">Hủy</button>
                    <button type="submit" form="class-fault-form" disabled={faultSubmitting || !faultForm.equipmentId || !faultForm.issueNote.trim()} className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50">
                        {faultSubmitting ? 'Đang gửi...' : 'Gửi báo hỏng'}
                    </button>
                </>}
            >
                {faultLoading ? (
                    <p className="text-sm text-slate-blue">Đang tải thiết bị của phòng...</p>
                ) : (
                    <form id="class-fault-form" onSubmit={submitFaultReport} className="space-y-3">
                        {faultError && (
                            <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {faultError}
                            </div>
                        )}
                        {faultEquipments.length > 0 && <>
                            <label className="block">
                                <span className={filterLabelClass}>Thiết bị</span>
                                <select value={faultForm.equipmentId} onChange={(event) => setFaultForm(form => ({ ...form, equipmentId: event.target.value }))} className={filterControlClass}>
                                    {faultEquipments.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.equipmentName}{item.equipmentCode ? ` (${item.equipmentCode})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className={filterLabelClass}>Tình trạng</span>
                                <select value={faultForm.healthStatus} onChange={(event) => setFaultForm(form => ({ ...form, healthStatus: event.target.value }))} className={filterControlClass}>
                                    <option value="faulty">Hỏng (không nhận diện được)</option>
                                    <option value="offline">Mất kết nối</option>
                                    <option value="warning">Chập chờn (vẫn dùng được)</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className={filterLabelClass}>Mô tả sự cố</span>
                                <textarea
                                    value={faultForm.issueNote}
                                    onChange={(event) => setFaultForm(form => ({ ...form, issueNote: event.target.value }))}
                                    rows={3}
                                    maxLength={2000}
                                    placeholder="VD: Camera không nhận diện sinh viên, nhiều SV có mặt nhưng chưa được ghi nhận."
                                    className="w-full px-3 py-2 rounded-xl border border-platinum-tint text-xs text-midnight-indigo focus:outline-none focus:border-action-blue"
                                />
                            </label>
                        </>}
                    </form>
                )}
            </SimpleModal>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-platinum-tint flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h2 className="text-sm font-bold text-midnight-indigo">Danh sách sinh viên</h2>
                        {adminClassChoices.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1">
                                {['', ...adminClassChoices].map(name => {
                                    const active = selectedAdministrativeClass === name;
                                    return (
                                        <button
                                            key={name || 'all'}
                                            type="button"
                                            onClick={() => setSelectedAdministrativeClass(name)}
                                            className={`h-7 px-2.5 rounded-full border text-[11px] font-bold ${active ? 'bg-action-blue border-action-blue text-white' : 'bg-white border-platinum-tint text-slate-blue hover:border-action-blue hover:text-action-blue'}`}
                                        >
                                            {name || 'Tất cả lớp HC'}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {studentFilter !== 'all' && (
                            <button type="button" onClick={() => setStudentFilter('all')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                                {STUDENT_FILTERS[studentFilter].label} <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <label className="h-9 lg:w-72 flex items-center gap-2 px-3 rounded-xl border border-platinum-tint bg-white cursor-text focus-within:border-action-blue focus-within:ring-2 focus-within:ring-action-blue/15">
                        <Search className="w-4 h-4 shrink-0 text-steel-gray" />
                        <input
                            type="text"
                            value={studentSearch}
                            onChange={(event) => setStudentSearch(event.target.value)}
                            placeholder="Tìm tên hoặc mã sinh viên..."
                            aria-label="Tìm sinh viên"
                            className="flex-1 min-w-0 h-full !p-0 border-0 bg-transparent text-xs font-semibold text-midnight-indigo placeholder:text-steel-gray placeholder:font-medium focus:outline-none focus:ring-0"
                        />
                        {studentSearch && (
                            <button type="button" onClick={() => setStudentSearch('')} className="shrink-0 text-steel-gray hover:text-midnight-indigo" aria-label="Xóa tìm kiếm">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </label>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr>
                                <th className="text-center px-3 py-2.5 w-12">#</th>
                                <th className="text-left px-4 py-2.5">Sinh viên</th>
                                <th className="text-left px-4 py-2.5">Lớp HC</th>
                                <th className="text-left px-4 py-2.5">Giờ vào</th>
                                <th className="text-left px-4 py-2.5">Giờ ra</th>
                                <th className="text-left px-4 py-2.5">Trạng thái</th>
                                <th className="text-left px-4 py-2.5">Ảnh bằng chứng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row, index) => (
                                <tr key={row.id} className="border-t border-platinum-tint/70 hover:bg-cloud-mist/40">
                                    <td className="px-3 py-2.5 text-center text-xs text-slate-blue tabular-nums">{(studentPage - 1) * studentsPerPage + index + 1}</td>
                                    <td className="px-4 py-2.5">
                                        <p className="font-bold text-midnight-indigo leading-tight">{row.name}</p>
                                        <p className="text-xs text-slate-blue">{row.code}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-blue">{row.administrativeClass || '—'}</td>
                                    <td className={`px-4 py-2.5 text-xs font-semibold tabular-nums ${row.checkInAt ? 'text-midnight-indigo' : 'text-steel-gray'}`}>{row.checkInText}</td>
                                    <td className={`px-4 py-2.5 text-xs font-semibold tabular-nums ${row.checkOutAt ? 'text-midnight-indigo' : 'text-steel-gray'}`}>{row.checkOutText}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${statusClass[row.status] || statusClass.not_checked}`}>
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        {row.evidenceImage ? (
                                            <a href={row.evidenceImage} target="_blank" rel="noreferrer" title="Mở ảnh bằng chứng">
                                                <img src={row.evidenceImage} alt="Bằng chứng điểm danh" className="w-16 h-10 object-cover rounded-md border border-platinum-tint hover:ring-2 hover:ring-action-blue/40" />
                                            </a>
                                        ) : (
                                            <span className="text-xs text-steel-gray">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {tableRows.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="px-5 py-10 text-center text-sm text-slate-blue">
                                        {filteredRows.length ? 'Không có sinh viên phù hợp với bộ lọc.' : 'Lớp chưa có danh sách sinh viên.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {tableRows.length > 0 && (
                    <div className="px-4 py-3 border-t border-platinum-tint flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-blue">
                            Hiển thị {(studentPage - 1) * studentsPerPage + 1}–{Math.min(studentPage * studentsPerPage, tableRows.length)} trong {tableRows.length} sinh viên
                        </span>
                        {studentPageCount > 1 && <Pagination currentPage={studentPage} totalPages={studentPageCount} onPageChange={setStudentPage} />}
                    </div>
                )}
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-platinum-tint flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-midnight-indigo">Nhật ký vào/ra lớp</h2>
                    <span className="text-[11px] font-semibold text-slate-blue">{attendanceEvents.length} lượt ghi nhận</span>
                </div>
                {attendanceEvents.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-blue">Chưa có lượt vào/ra được ghi nhận trong ngày.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                                <tr>
                                    <th className="text-left px-4 py-2.5">Thời gian</th>
                                    <th className="text-left px-4 py-2.5">Sinh viên</th>
                                    <th className="text-left px-4 py-2.5">Sự kiện</th>
                                    <th className="text-left px-4 py-2.5">Nguồn</th>
                                    <th className="text-left px-4 py-2.5">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleAttendanceEvents.map(event => {
                                    const cameraText = event.cameraGroupId || event.cameraId || event.zoneId
                                        ? `Camera ${event.cameraId || event.cameraGroupId || '—'}${event.zoneId ? ` · zone ${event.zoneId}` : ''}`
                                        : '';
                                    return (
                                        <tr key={event.id} className="border-t border-platinum-tint/70">
                                            <td className="px-4 py-2.5 text-xs font-semibold text-midnight-indigo tabular-nums">
                                                {event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-bold text-midnight-indigo leading-tight">{event.studentName}</p>
                                                <p className="text-xs text-slate-blue">{event.studentCode}</p>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs font-semibold text-midnight-indigo">{event.direction === 'out' ? 'Rời lớp' : 'Vào lớp'}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${event.source === 'manual' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {event.sourceLabel || (event.source === 'manual' ? 'Thủ công' : 'Tự động')}
                                                </span>
                                                {(event.actorName || cameraText) && <p className="text-[11px] text-slate-blue mt-0.5">{event.actorName || cameraText}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-slate-blue">{event.reason || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {eventPageCount > 1 && (
                    <div className="px-4 py-3 border-t border-platinum-tint flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-blue">
                            Hiển thị {(eventPage - 1) * eventsPerPage + 1}–{Math.min(eventPage * eventsPerPage, attendanceEvents.length)} trong {attendanceEvents.length} lượt ghi nhận
                        </span>
                        <Pagination currentPage={eventPage} totalPages={eventPageCount} onPageChange={setEventPage} />
                    </div>
                )}
            </div>
            </>}
        </div>
    );
};

export default ClassAttendanceDashboard;
