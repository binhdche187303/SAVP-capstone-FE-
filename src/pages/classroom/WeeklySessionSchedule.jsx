import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, UserRound, Users } from 'lucide-react';
import { fetchClassSessions } from '../../service/classAttendanceService';

const toDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const startOfWeek = date => {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    result.setHours(0, 0, 0, 0);
    return result;
};

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_CHIP_LIMIT = 3;
const STATUS_BADGE = {
    cancelled: { label: 'Đã hủy', className: 'bg-red-50 text-red-600' },
    ongoing: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-600' },
    completed: { label: 'Đã xong', className: 'bg-slate-100 text-slate-500' }
};

// Mỗi môn một màu cố định (theo mã môn) để nhìn lịch tháng dễ phân biệt.
const SUBJECT_COLORS = [
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-amber-50 text-amber-800 border-amber-200',
    'bg-violet-50 text-violet-700 border-violet-200',
    'bg-rose-50 text-rose-700 border-rose-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
    'bg-orange-50 text-orange-700 border-orange-200',
    'bg-lime-50 text-lime-800 border-lime-200'
];
const subjectColor = code => {
    const text = String(code || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
};

const VIEW_OPTIONS = [
    { value: 'week', label: 'Tuần', icon: CalendarDays },
    { value: 'month', label: 'Tháng', icon: CalendarRange }
];

/**
 * Lịch tuần / tháng từ buổi học thật (BE /class-attendance/sessions). Không dùng dữ liệu mock.
 * variant "student": lọc học kỳ + môn, thẻ hiện giảng viên. variant "teacher": lọc môn + lớp HP, thẻ hiện sĩ số.
 * Xem tháng: bấm vào một ngày để phóng to sang tuần chứa ngày đó.
 */
const WeeklySessionSchedule = ({ variant, badge, title, subtitle }) => {
    const isTeacher = variant === 'teacher';
    const [sessions, setSessions] = useState([]);
    const [view, setView] = useState('week');
    const [anchor, setAnchor] = useState(() => new Date());
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [selectedClassCode, setSelectedClassCode] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isMonth = view === 'month';
    // Tuần: 7 ngày từ thứ 2. Tháng: lưới 6 tuần bắt đầu từ thứ 2 của tuần chứa ngày 1.
    const days = useMemo(() => {
        const start = isMonth
            ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
            : startOfWeek(anchor);
        return Array.from({ length: isMonth ? 42 : 7 }, (_, index) => addDays(start, index));
    }, [anchor, isMonth]);
    const fromKey = toDateKey(days[0]);
    const toKey = toDateKey(days[days.length - 1]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetchClassSessions(fromKey, toKey)
            .then(data => { if (!cancelled) setSessions(Array.isArray(data) ? data : []); })
            .catch(err => {
                if (cancelled) return;
                setSessions([]);
                setError(err?.message || 'Không tải được lịch. Vui lòng thử lại.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [fromKey, toKey, refreshKey]);

    const semesters = useMemo(() => [...new Set(sessions.map(s => s.semester).filter(Boolean))], [sessions]);
    const subjectOptions = useMemo(() => {
        const subjects = new Map();
        sessions
            .filter(s => selectedSemester === 'all' || s.semester === selectedSemester)
            .forEach(s => { if (s.subjectCode && !subjects.has(s.subjectCode)) subjects.set(s.subjectCode, s.subject); });
        return [...subjects.entries()].map(([code, name]) => ({ code, name }));
    }, [sessions, selectedSemester]);
    const classOptions = useMemo(() => [...new Set(
        sessions
            .filter(s => selectedSubjectCode === 'all' || s.subjectCode === selectedSubjectCode)
            .map(s => s.classCode)
            .filter(Boolean)
    )].sort(), [sessions, selectedSubjectCode]);

    // Bỏ lựa chọn lọc không còn trong khoảng đang xem.
    useEffect(() => {
        if (selectedSemester !== 'all' && !semesters.includes(selectedSemester)) setSelectedSemester('all');
    }, [semesters, selectedSemester]);
    useEffect(() => {
        if (selectedSubjectCode !== 'all' && !subjectOptions.some(s => s.code === selectedSubjectCode)) setSelectedSubjectCode('all');
    }, [subjectOptions, selectedSubjectCode]);
    useEffect(() => {
        if (selectedClassCode !== 'all' && !classOptions.includes(selectedClassCode)) setSelectedClassCode('all');
    }, [classOptions, selectedClassCode]);

    const visible = useMemo(() => sessions.filter(s => (
        (selectedSemester === 'all' || s.semester === selectedSemester)
        && (selectedSubjectCode === 'all' || s.subjectCode === selectedSubjectCode)
        && (selectedClassCode === 'all' || s.classCode === selectedClassCode)
    )), [sessions, selectedSemester, selectedSubjectCode, selectedClassCode]);

    const byDate = useMemo(() => {
        const map = new Map();
        [...visible]
            .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
            .forEach(s => {
                if (!map.has(s.date)) map.set(s.date, []);
                map.get(s.date).push(s);
            });
        return map;
    }, [visible]);

    const periodLabel = isMonth
        ? `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`
        : `Tuần ${days[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - ${days[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    const activeCount = isMonth
        ? visible.filter(s => s.status !== 'cancelled' && new Date(`${s.date}T00:00:00`).getMonth() === anchor.getMonth()).length
        : visible.filter(s => s.status !== 'cancelled').length;
    const todayKey = toDateKey(new Date());
    const shift = direction => setAnchor(date => (isMonth
        ? new Date(date.getFullYear(), date.getMonth() + direction, 1)
        : addDays(date, 7 * direction)));
    const zoomToWeek = date => {
        setAnchor(date);
        setView('week');
    };
    const selectClass = 'h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo';
    const unit = isMonth ? 'Tháng' : 'Tuần';

    const renderWeek = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
            {days.map((date, index) => {
                const dateKey = toDateKey(date);
                const dayItems = byDate.get(dateKey) || [];
                const isToday = dateKey === todayKey;
                return (
                    <section key={dateKey} className={`bg-white border rounded-xl overflow-hidden min-h-[250px] ${isToday ? 'border-action-blue shadow-sm' : 'border-platinum-tint'}`}>
                        <div className={`px-3 py-3 border-b border-platinum-tint ${isToday ? 'bg-blue-50' : 'bg-cloud-mist/30'}`}>
                            <p className="text-xs font-bold text-midnight-indigo">{DAY_LABELS[index]}</p>
                            <p className="text-[11px] text-slate-blue mt-0.5">{date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</p>
                        </div>
                        <div className="p-2 space-y-2">
                            {dayItems.map(s => {
                                const badgeInfo = STATUS_BADGE[s.status];
                                return (
                                    <div key={s.id} className={`rounded-lg border p-3 ${s.status === 'cancelled' ? 'border-red-100 bg-red-50/30 opacity-70' : 'border-blue-100 bg-blue-50/40'}`}>
                                        <p className="text-xs font-bold text-midnight-indigo">{s.subject || s.subjectCode}</p>
                                        <p className="text-[11px] text-slate-blue mt-0.5">{s.classCode}</p>
                                        {badgeInfo && <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeInfo.className}`}>{badgeInfo.label}</span>}
                                        <p className="text-[11px] text-action-blue font-semibold mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.startTime} - {s.endTime}</p>
                                        <p className="text-[11px] text-slate-blue mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {s.room || 'Chưa có phòng'}</p>
                                        {isTeacher
                                            ? <p className="text-[11px] text-slate-blue mt-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {s.studentCount} sinh viên</p>
                                            : <p className="text-[11px] text-slate-blue mt-1 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" /> {s.teacher || 'Chưa có giảng viên'}</p>}
                                    </div>
                                );
                            })}
                            {dayItems.length === 0 && <p className="text-[11px] text-slate-blue text-center py-8">{loading ? 'Đang tải…' : 'Không có lịch'}</p>}
                        </div>
                    </section>
                );
            })}
        </div>
    );

    const renderMonth = () => (
        <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-platinum-tint bg-cloud-mist/30">
                {DAY_LABELS.map((label, index) => (
                    <p key={label} className="px-2 py-2 text-center text-[11px] font-bold text-midnight-indigo">
                        <span className="hidden md:inline">{label}</span>
                        <span className="md:hidden">{DAY_SHORT[index]}</span>
                    </p>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {days.map((date, index) => {
                    const dateKey = toDateKey(date);
                    const dayItems = byDate.get(dateKey) || [];
                    const inMonth = date.getMonth() === anchor.getMonth();
                    const isToday = dateKey === todayKey;
                    const hidden = dayItems.length - MONTH_CHIP_LIMIT;
                    return (
                        <button
                            key={dateKey}
                            type="button"
                            onClick={() => zoomToWeek(date)}
                            title="Xem tuần này"
                            className={`min-h-[96px] md:min-h-[120px] p-1.5 text-left align-top border-platinum-tint hover:bg-blue-50/40 transition-colors ${index % 7 !== 6 ? 'border-r' : ''} ${index < 35 ? 'border-b' : ''} ${inMonth ? 'bg-white' : 'bg-cloud-mist/20'}`}
                        >
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${isToday ? 'bg-action-blue text-white' : inMonth ? 'text-midnight-indigo' : 'text-slate-blue/50'}`}>
                                {date.getDate()}
                            </span>
                            <div className="mt-1 space-y-1">
                                {dayItems.slice(0, MONTH_CHIP_LIMIT).map(s => (
                                    <p
                                        key={s.id}
                                        title={`${s.startTime} - ${s.endTime} · ${s.subject || s.subjectCode} · ${s.classCode} · ${s.room || 'Chưa có phòng'}`}
                                        className={`truncate rounded border px-1 py-0.5 text-[10px] font-semibold ${s.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100 line-through' : subjectColor(s.subjectCode)} ${inMonth ? '' : 'opacity-60'}`}
                                    >
                                        <span className="font-bold">{s.startTime}</span>
                                        <span className="hidden md:inline"> {s.subject || s.subjectCode}</span>
                                    </p>
                                ))}
                                {hidden > 0 && <p className="text-[10px] font-bold text-action-blue px-1">+{hidden} buổi</p>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold"><CalendarDays className="w-4 h-4" /> {badge}</span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">{title}</h1>
                    <p className="text-xs text-slate-blue mt-1">{subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-cloud-mist rounded-lg p-1" role="group" aria-label="Chế độ xem lịch">
                        {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setView(value)}
                                aria-pressed={view === value}
                                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-bold transition-all ${view === value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                <Icon className="w-4 h-4" /> {label}
                            </button>
                        ))}
                    </div>
                    {!isTeacher && (
                        <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value)} aria-label="Lọc theo học kỳ" className={selectClass}>
                            <option value="all">Tất cả học kỳ</option>
                            {semesters.map(semester => <option key={semester} value={semester}>{semester}</option>)}
                        </select>
                    )}
                    <select value={selectedSubjectCode} onChange={e => setSelectedSubjectCode(e.target.value)} aria-label="Lọc theo môn học" className={selectClass}>
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                    </select>
                    {isTeacher && (
                        <select value={selectedClassCode} onChange={e => setSelectedClassCode(e.target.value)} aria-label="Lọc theo lớp học phần" className={selectClass}>
                            <option value="all">Tất cả lớp</option>
                            {classOptions.map(code => <option key={code} value={code}>{code}</option>)}
                        </select>
                    )}
                    <button type="button" onClick={() => setRefreshKey(v => v + 1)} disabled={loading} aria-label="Làm mới lịch" className="h-10 px-3 inline-flex items-center gap-2 bg-white border border-platinum-tint rounded-lg text-xs font-bold text-slate-blue hover:text-action-blue disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
                </div>
            </div>

            <div className="flex items-center justify-between bg-white border border-platinum-tint rounded-xl px-3 py-2">
                <button type="button" onClick={() => shift(-1)} className="p-2 text-slate-blue hover:text-action-blue" aria-label={`${unit} trước`}><ChevronLeft className="w-5 h-5" /></button>
                <div className="text-center">
                    <p className="text-sm font-bold text-midnight-indigo">{periodLabel}</p>
                    <p className="text-[11px] text-slate-blue">{loading ? 'Đang tải…' : `${activeCount} buổi ${isTeacher ? 'dạy' : 'học'}`}</p>
                    <button type="button" onClick={() => setAnchor(new Date())} className="text-[11px] font-semibold text-action-blue hover:underline">Về {unit.toLowerCase()} này</button>
                </div>
                <button type="button" onClick={() => shift(1)} className="p-2 text-slate-blue hover:text-action-blue" aria-label={`${unit} sau`}><ChevronRight className="w-5 h-5" /></button>
            </div>

            {error && (
                <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {isMonth && <p className="text-[11px] text-slate-blue -mt-2">Bấm vào một ngày để xem chi tiết tuần đó.</p>}
            {isMonth ? renderMonth() : renderWeek()}
        </div>
    );
};

export default WeeklySessionSchedule;
