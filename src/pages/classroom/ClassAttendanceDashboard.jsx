import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Download, Info, LogIn, LogOut, RefreshCw, Users, X } from 'lucide-react';
import {
    DEFAULT_CLASS_ATTENDANCE_SETTINGS,
    exportClassAttendanceCsv,
    fetchClassAttendanceClasses,
    fetchClassAttendanceRows,
    fetchClassAttendanceEvents,
    fetchClassAttendanceSettings,
    fetchClassSessions,
    scanClassAttendance
} from '../../service/classAttendanceService';

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

const captureFrame = (videoRef) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 360;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return null;
    }
};

const StatCard = ({ label, value, helper }) => (
    <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">{label}</p>
        <p className="text-2xl font-bold text-midnight-indigo mt-1">{value}</p>
        <p className="text-xs text-steel-gray mt-1">{helper}</p>
    </div>
);

const getTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDayLabel = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

/** Buổi học thật của lớp trong ngày đang xem (từ /class-attendance/sessions). */
const describeSession = (session, dateKey) => session
    ? { schedule: `${formatDayLabel(dateKey)} ${session.startTime} - ${session.endTime}`, room: session.room || 'Chưa có phòng' }
    : { schedule: `Không có buổi học ngày ${formatDayLabel(dateKey)}`, room: '—' };

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
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [selectedAdministrativeClass, setSelectedAdministrativeClass] = useState(queryAdministrativeClass);
    const [classPage, setClassPage] = useState(1);
    const [eventPage, setEventPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [attendanceEvents, setAttendanceEvents] = useState([]);
    const [settings, setSettings] = useState(DEFAULT_CLASS_ATTENDANCE_SETTINGS);
    const [scanDirection, setScanDirection] = useState('in');
    const [autoScan, setAutoScan] = useState(false);
    const [scanNotice, setScanNotice] = useState(null);
    const [webcamEnabled, setWebcamEnabled] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const lastWebcamFrameRef = useRef(null);

    const selectedClass = useMemo(
        () => selectedClassId ? classrooms.find(item => item.id === selectedClassId) || null : null,
        [classrooms, selectedClassId]
    );
    const sessionByClass = useMemo(() => {
        const map = new Map();
        daySessions.forEach(session => { if (!map.has(session.classId)) map.set(session.classId, session); });
        return map;
    }, [daySessions]);
    const selectedSession = useMemo(
        () => describeSession(sessionByClass.get(selectedClassId), selectedDate),
        [sessionByClass, selectedClassId, selectedDate]
    );

    const semesters = useMemo(
        () => [...new Set(classrooms.map(item => item.semester).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'vi')),
        [classrooms]
    );

    const semesterClassrooms = useMemo(
        () => classrooms.filter(item => selectedSemester === 'all' || item.semester === selectedSemester),
        [classrooms, selectedSemester]
    );

    const subjectOptions = useMemo(() => {
        const subjects = new Map();
        semesterClassrooms.forEach(item => {
            const code = item.subjectCode || item.code;
            if (code && !subjects.has(code)) subjects.set(code, item.subject);
        });
        return [...subjects.entries()].map(([code, name]) => ({ code, name }));
    }, [semesterClassrooms]);

    const subjectClassrooms = useMemo(
        () => selectedSubjectCode === 'all'
            ? semesterClassrooms
            : semesterClassrooms.filter(item => (item.subjectCode || item.code) === selectedSubjectCode),
        [selectedSubjectCode, semesterClassrooms]
    );

    // Mỗi thẻ = 1 lớp học phần thật. Lớp có buổi học trong ngày đang xem lên trước (theo giờ bắt đầu).
    const classOptions = useMemo(() => subjectClassrooms
        .filter(item => !selectedAdministrativeClass || (item.administrativeClasses || []).includes(selectedAdministrativeClass))
        .map(item => {
            const session = sessionByClass.get(item.id);
            return { ...item, session, ...describeSession(session, selectedDate) };
        })
        .sort((left, right) => {
            if (Boolean(left.session) !== Boolean(right.session)) return left.session ? -1 : 1;
            if (left.session && right.session && left.session.startTime !== right.session.startTime) {
                return left.session.startTime.localeCompare(right.session.startTime);
            }
            return String(left.code).localeCompare(String(right.code), 'vi');
        }), [selectedAdministrativeClass, selectedDate, sessionByClass, subjectClassrooms]);

    const classesPerPage = 8;
    const classPageCount = Math.max(1, Math.ceil(classOptions.length / classesPerPage));
    const visibleClassOptions = classOptions.slice((classPage - 1) * classesPerPage, classPage * classesPerPage);

    const administrativeClassOptions = useMemo(
        () => [...new Set((selectedClass ? [selectedClass] : subjectClassrooms).flatMap(item => item.administrativeClasses || []))]
            .sort((a, b) => a.localeCompare(b, 'vi')),
        [selectedClass, subjectClassrooms]
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
                const [apiClasses, apiSessions] = await Promise.all([
                    fetchClassAttendanceClasses(),
                    fetchClassSessions(selectedDate, selectedDate).catch(() => [])
                ]);
                if (cancelled) return;
                setClassrooms(apiClasses);
                setDaySessions(apiSessions);
                setLoadError('');
                const exists = apiClasses.some(item => item.id === selectedClassId);
                const nextClassId = exists ? selectedClassId : (mode === 'teacher' ? '' : apiClasses[0]?.id || '');
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

    useEffect(() => {
        if (classPage > classPageCount) setClassPage(classPageCount);
    }, [classPage, classPageCount]);

    useEffect(() => {
        if (eventPage > eventPageCount) setEventPage(eventPageCount);
    }, [eventPage, eventPageCount]);

    useEffect(() => {
        setEventPage(1);
    }, [selectedClassId, selectedDate, selectedAdministrativeClass]);

    useEffect(() => {
        if (selectedAdministrativeClass && !administrativeClassOptions.includes(selectedAdministrativeClass)) {
            setSelectedAdministrativeClass('');
        }
    }, [administrativeClassOptions, selectedAdministrativeClass]);

    useEffect(() => {
        if (selectedSubjectCode !== 'all' && !subjectOptions.some(subject => subject.code === selectedSubjectCode)) {
            setSelectedSubjectCode('all');
        }
    }, [selectedSubjectCode, subjectOptions]);

    useEffect(() => {
        if (classrooms.length && selectedClassId && !subjectClassrooms.some(item => item.id === selectedClassId)) {
            setSelectedClassId(mode === 'teacher' ? '' : subjectClassrooms[0]?.id || '');
            setRows([]);
                    setAttendanceEvents([]);
            setSelectedAdministrativeClass('');
        }
    }, [classrooms.length, mode, selectedClassId, subjectClassrooms]);

    useEffect(() => {
        setClassPage(1);
    }, [selectedSemester, selectedSubjectCode]);

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

    useEffect(() => () => {
        streamRef.current?.getTracks?.().forEach(track => track.stop());
    }, []);

    useEffect(() => {
        if (!webcamEnabled) {
            lastWebcamFrameRef.current = null;
            return undefined;
        }
        const timer = setInterval(() => {
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
        }, 400);
        return () => clearInterval(timer);
    }, [webcamEnabled]);

    const toggleWebcam = async () => {
        if (webcamEnabled) {
            streamRef.current?.getTracks?.().forEach(track => track.stop());
            streamRef.current = null;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
            lastWebcamFrameRef.current = null;
            setAutoScan(false);
            setWebcamEnabled(false);
            setScanNotice({
                type: 'info',
                message: 'Đã tắt webcam.'
            });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try {
                    await videoRef.current.play();
                } catch {}
                setTimeout(() => {
                    const frame = captureFrame(videoRef);
                    if (frame) lastWebcamFrameRef.current = frame;
                }, 500);
            }
            setWebcamEnabled(true);
            setScanNotice({
                type: 'info',
                message: 'Đã bật webcam. Khi quét thành công, ảnh bằng chứng sẽ là khung hình chụp tại thời điểm quét.'
            });
        } catch {
            setScanNotice({
                type: 'warning',
                message: 'Không mở được webcam. Cần webcam/camera để quét điểm danh.'
            });
        }
    };

    const performScan = useCallback(async () => {
        if (!webcamEnabled) {
            setScanNotice({ type: 'warning', message: 'Bật webcam trước khi quét điểm danh.' });
            setAutoScan(false);
            return;
        }
        const snapshotImageBase64 = captureFrame(videoRef) || lastWebcamFrameRef.current;
        if (!snapshotImageBase64) {
            const nextNotice = {
                type: 'warning',
                message: 'Chưa chụp được ảnh từ webcam. Vui lòng chờ camera hiển thị rõ rồi quét lại.'
            };
            setScanNotice(nextNotice);
            return;
        }

        let result;
        try {
            result = await scanClassAttendance({ classId: selectedClassId, administrativeClass: selectedAdministrativeClass, direction: scanDirection, snapshotImageBase64 });
        } catch (error) {
            setScanNotice({ type: 'error', message: error?.message || 'Không gửi được lượt quét lên máy chủ.', detail: 'Không tạo bản ghi điểm danh mới.' });
            return;
        }
        const nextMessage = result?.data?.message || result.message || 'Đã xử lý lượt quét.';
        const nextNotice = {
            type: result.success ? 'success' : (result.warning ? 'warning' : 'error'),
            message: nextMessage,
            detail: result.success
                ? 'Đã lưu ảnh bằng chứng từ webcam tại thời điểm quét.'
                : 'Không tạo bản ghi điểm danh mới.'
        };
        setScanNotice(nextNotice);
        refresh();
    }, [refresh, scanDirection, selectedAdministrativeClass, selectedClassId, webcamEnabled]);

    useEffect(() => {
        if (!autoScan) return undefined;
        performScan();
        const timer = setInterval(() => {
            performScan();
        }, Math.max(2, Number(settings.autoScanIntervalSeconds || 4)) * 1000);
        return () => clearInterval(timer);
    }, [autoScan, performScan, settings.autoScanIntervalSeconds]);

    useEffect(() => {
        if (!scanNotice || scanNotice.type === 'warning' || scanNotice.type === 'error') return undefined;
        const timer = setTimeout(() => setScanNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [scanNotice]);

    const canOperateCamera = mode === 'teacher' && Boolean(selectedClass) && selectedDate === getTodayKey();

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                        <Users className="w-4 h-4" />
                        Điểm danh lớp học
                    </span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">
                        {mode === 'manager' ? 'Quản lý chuyên cần lớp học' : 'Điểm danh lớp'}
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">
                        Tự động quét FaceID, ghi nhận giờ vào/ra, xác định đi muộn và lưu ảnh bằng chứng.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        aria-label="Lọc theo ngày"
                    />
                    <select
                        value={selectedSemester}
                        onChange={(event) => setSelectedSemester(event.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        aria-label="Lọc theo học kỳ"
                    >
                        <option value="all">Tất cả học kỳ</option>
                        {semesters.map(semester => (
                            <option key={semester} value={semester}>{semester}</option>
                        ))}
                    </select>
                    <select
                        value={selectedSubjectCode}
                        onChange={(event) => {
                            setSelectedSubjectCode(event.target.value);
                            setSelectedClassId('');
                            setRows([]);
                            setSelectedAdministrativeClass('');
                        }}
                        className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        aria-label="Lọc theo môn học"
                    >
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(subject => (
                            <option key={subject.code} value={subject.code}>
                                {subject.code} - {subject.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={selectedAdministrativeClass}
                        onChange={(event) => setSelectedAdministrativeClass(event.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        aria-label="Lọc theo lớp hành chính"
                    >
                        <option value="">Tất cả lớp</option>
                        {administrativeClassOptions.map(className => (
                            <option key={className} value={className}>{className}</option>
                        ))}
                    </select>
                    <button type="button" onClick={refresh} className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-slate-blue flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Làm mới
                    </button>
                </div>
            </div>

            {loadError && (
                <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">
                    <AlertCircle className="w-4 h-4" /> {loadError}
                </div>
            )}

            {mode === 'teacher' && !selectedClassId ? (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-platinum-tint bg-cloud-mist/20">
                        <div className="flex items-center gap-3">
                            <Users className="w-7 h-7 text-action-blue" />
                            <div>
                                <h2 className="text-base font-bold text-midnight-indigo">Các lớp được phân công</h2>
                                <p className="mt-1 text-xs text-slate-blue">Lớp học phần đồng bộ từ UEL; lịch và phòng theo buổi học của ngày đang chọn. Chọn lớp để xem danh sách sinh viên và điểm danh.</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {visibleClassOptions.length === 0 ? (
                            <p className="md:col-span-2 px-3 py-8 text-center text-sm text-slate-blue">Chưa có lớp được phân công.</p>
                        ) : visibleClassOptions.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedClassId(item.id)}
                                className={`p-4 rounded-xl border text-left hover:border-action-blue hover:bg-blue-50/40 transition-colors ${item.session ? 'border-blue-200 bg-blue-50/20' : 'border-platinum-tint bg-white'}`}
                            >
                                <p className="text-sm font-bold text-midnight-indigo">{item.subjectCode} - {item.code}</p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-blue">
                                    <span><strong className="text-midnight-indigo">Môn:</strong> {item.subject || 'Chưa cập nhật'}</span>
                                    <span><strong className="text-midnight-indigo">Lớp HP:</strong> {item.code}</span>
                                    <span><strong className="text-midnight-indigo">Giảng viên:</strong> {item.teacher || 'Chưa cập nhật'}</span>
                                    <span><strong className="text-midnight-indigo">Lịch:</strong> {item.schedule}</span>
                                    <span><strong className="text-midnight-indigo">Phòng:</strong> {item.room}</span>
                                    <span><strong className="text-midnight-indigo">Học kỳ:</strong> {item.semester || 'Chưa cập nhật'}</span>
                                </div>
                                <p className="mt-2 text-xs font-semibold text-action-blue">Sĩ số: {item.studentCount ?? 0} sinh viên</p>
                            </button>
                        ))}
                    </div>
                    {classPageCount > 1 && (
                        <div className="px-5 py-3 border-t border-platinum-tint flex items-center justify-start gap-3">
                            <span className="text-xs font-semibold text-slate-blue">Trang {classPage}/{classPageCount}</span>
                            <button
                                type="button"
                                onClick={() => setClassPage(page => Math.max(1, page - 1))}
                                disabled={classPage === 1}
                                className="p-2 rounded-lg text-slate-blue hover:bg-cloud-mist disabled:opacity-40"
                                aria-label="Trang lớp trước"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setClassPage(page => Math.min(classPageCount, page + 1))}
                                disabled={classPage === classPageCount}
                                className="p-2 rounded-lg text-slate-blue hover:bg-cloud-mist disabled:opacity-40"
                                aria-label="Trang lớp sau"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            ) : <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Sĩ số" value={filteredSummary.total} helper={selectedAdministrativeClass || selectedClass?.code || 'Chưa chọn lớp'} />
                <StatCard label="Đã vào lớp" value={filteredSummary.checkedIn} helper={`Bắt đầu ${settings.classStartTime}`} />
                <StatCard label="Đi muộn" value={filteredSummary.late} helper={`Ngưỡng ${settings.lateThresholdMinutes} phút`} />
                <StatCard label="Đã rời lớp" value={filteredSummary.left} helper={selectedClass?.semester || selectedSemester} />
            </div>

            {canOperateCamera && (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-platinum-tint flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide flex items-center gap-2">
                                <Camera className="w-5 h-5 text-action-blue" />
                                Camera FaceID lớp học
                            </h2>
                            <p className="text-xs text-slate-blue mt-1">Bật webcam rồi quét; mỗi lượt quét gửi khung hình lên máy chủ để nhận diện.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={toggleWebcam} className="px-4 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                                {webcamEnabled ? 'Tắt webcam' : 'Bật webcam'}
                            </button>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                                {scanDirection === 'in' ? <LogIn className="w-4 h-4 text-emerald-600" /> : <LogOut className="w-4 h-4 text-orange-600" />}
                                <select
                                    value={scanDirection}
                                    onChange={(event) => setScanDirection(event.target.value)}
                                    className="bg-transparent outline-none"
                                >
                                    <option value="in">Quét vào</option>
                                    <option value="out">Quét ra</option>
                                </select>
                            </label>
                            <button type="button" onClick={() => setAutoScan(v => !v)} className={`px-4 py-2 rounded-xl text-xs font-bold ${autoScan ? 'bg-red-600 text-white' : 'bg-action-blue text-white'}`}>
                                {autoScan ? 'Dừng tự động' : 'Bật tự động quét'}
                            </button>
                        </div>
                    </div>
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
                        <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center text-white text-sm font-bold relative">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            {autoScan && <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-white/90 text-midnight-indigo text-[11px]">Đang quét {scanDirection === 'in' ? 'vào' : 'ra'}</span>}
                        </div>
                        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4">
                            <p className="text-sm font-bold text-midnight-indigo">
                                {selectedClass?.subject} · {selectedClass?.code}{selectedAdministrativeClass ? ` · ${selectedAdministrativeClass}` : ''}
                            </p>
                            <p className="text-xs text-slate-blue mt-1">{selectedSession.schedule} · {selectedSession.room} · {selectedClass?.teacher}</p>
                            <p className="mt-4 text-xs text-slate-blue">Camera sẽ tự nhận diện sinh viên, đối chiếu FaceID đã đăng ký, ghi nhận giờ vào/ra và lưu ảnh bằng chứng tại thời điểm quét.</p>
                        </div>
                    </div>
                </div>
            )}

            {canOperateCamera && (
                <ClassScanPopup notice={scanNotice} onClose={() => setScanNotice(null)} />
            )}

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách sinh viên lớp {selectedClass?.code || 'đã chọn'}{selectedAdministrativeClass ? ` · ${selectedAdministrativeClass}` : ''}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => exportClassAttendanceCsv(filteredRows, selectedClass, selectedDate)} disabled={!filteredRows.length} className="px-3 py-2 rounded-xl disabled:opacity-50 bg-action-blue text-white text-xs font-bold flex items-center gap-2">
                            <Download className="w-4 h-4" /> Xuất CSV
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr>
                                <th className="text-left px-5 py-4">Sinh viên</th>
                                <th className="text-left px-5 py-4">Giờ vào</th>
                                <th className="text-left px-5 py-4">Giờ ra</th>
                                <th className="text-left px-5 py-4">Trạng thái</th>
                                <th className="text-left px-5 py-4">Ảnh bằng chứng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map(row => (
                                <tr key={row.id} className="border-t border-platinum-tint/70">
                                    <td className="px-5 py-4">
                                        <p className="font-bold text-midnight-indigo">{row.name}</p>
                                        <p className="text-xs text-slate-blue">{row.code}</p>
                                    </td>
                                    <td className="px-5 py-4 font-semibold text-midnight-indigo">{row.checkInText}</td>
                                    <td className="px-5 py-4 font-semibold text-midnight-indigo">{row.checkOutText}</td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[row.status] || statusClass.not_checked}`}>
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        {row.evidenceImage ? (
                                            <img src={row.evidenceImage} alt="Bằng chứng điểm danh" className="w-28 h-16 object-cover rounded-lg border border-platinum-tint" />
                                        ) : (
                                            <span className="text-xs text-steel-gray">Chưa có ảnh</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-5 py-10 text-center text-sm text-slate-blue">Không có dữ liệu phù hợp với bộ lọc.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Nhật ký vào/ra lớp</h2>
                    </div>
                    <span className="text-xs font-semibold text-slate-blue">{attendanceEvents.length} lượt ghi nhận</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr><th className="text-left px-5 py-3">Thời gian</th><th className="text-left px-5 py-3">Sinh viên</th><th className="text-left px-5 py-3">Sự kiện</th><th className="text-left px-5 py-3">Nguồn</th><th className="text-left px-5 py-3">Camera / zone</th><th className="text-left px-5 py-3">Ghi chú</th></tr>
                        </thead>
                        <tbody>
                            {visibleAttendanceEvents.map(event => (
                                <tr key={event.id} className="border-t border-platinum-tint/70">
                                    <td className="px-5 py-3 text-xs font-semibold text-midnight-indigo">{event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}</td>
                                    <td className="px-5 py-3"><p className="font-bold text-midnight-indigo">{event.studentName}</p><p className="text-xs text-slate-blue">{event.studentCode}</p></td>
                                    <td className="px-5 py-3 font-semibold text-midnight-indigo">{event.direction === 'out' ? 'Đã rời lớp' : 'Đã vào lớp'}</td>
                                    <td className="px-5 py-3"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${event.source === 'manual' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{event.sourceLabel || (event.source === 'manual' ? 'Thủ công' : 'Tự động')}</span>{event.actorName && <p className="text-[11px] text-slate-blue mt-1">{event.actorName}</p>}</td>
                                    <td className="px-5 py-3 text-xs text-slate-blue">{event.cameraGroupId || event.cameraId || event.zoneId ? `${event.cameraGroupId || '—'} / ${event.cameraId || '—'} / ${event.zoneId || '—'}` : 'Chưa có dữ liệu camera'}</td>
                                    <td className="px-5 py-3 text-xs text-slate-blue">{event.reason || '—'}</td>
                                </tr>
                            ))}
                            {!attendanceEvents.length && <tr><td colSpan="6" className="px-5 py-8 text-center text-sm text-slate-blue">Chưa có lượt vào/ra được ghi nhận trong ngày.</td></tr>}
                        </tbody>
                    </table>
                </div>
                {attendanceEvents.length > 0 && (
                    <div className="flex items-center justify-between gap-3 border-t border-platinum-tint px-5 py-3">
                        <span className="text-xs text-slate-blue">
                            Hiển thị {(eventPage - 1) * eventsPerPage + 1}–{Math.min(eventPage * eventsPerPage, attendanceEvents.length)} trong {attendanceEvents.length} lượt ghi nhận
                        </span>
                        {eventPageCount > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEventPage(page => Math.max(1, page - 1))}
                                    disabled={eventPage === 1}
                                    className="inline-flex items-center gap-1 rounded-lg border border-platinum-tint px-3 py-1.5 text-xs font-semibold text-midnight-indigo disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    Trước
                                </button>
                                <span className="min-w-[70px] text-center text-xs font-semibold text-slate-blue">
                                    Trang {eventPage}/{eventPageCount}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setEventPage(page => Math.min(eventPageCount, page + 1))}
                                    disabled={eventPage === eventPageCount}
                                    className="inline-flex items-center gap-1 rounded-lg border border-platinum-tint px-3 py-1.5 text-xs font-semibold text-midnight-indigo disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Sau
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            </>}
        </div>
    );
};

export default ClassAttendanceDashboard;
