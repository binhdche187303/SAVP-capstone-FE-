import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, School, UserRound, Users } from 'lucide-react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
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

// Tự định dạng dd/MM: toLocaleDateString('vi-VN') chỉ có ngày + tháng ra "02-11" trên Chrome.
const formatDayMonth = date => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_CHIP_LIMIT = 3;
const STATUS_BADGE = {
    cancelled: { label: 'Đã hủy', className: 'bg-red-50 text-red-600' },
    ongoing: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-600' },
    completed: { label: 'Đã xong', className: 'bg-slate-200 text-slate-700' }
};

// Lưới giờ của xem tuần: px cho mỗi giờ; khung mặc định 7h–17h, nới ra nếu có buổi ngoài khung.
const HOUR_HEIGHT = 64;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 17;
const toMinutes = time => {
    const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

// "A.310 - Cơ sở chính" → { name: 'A.310', campus: 'Cơ sở chính' }.
const splitRoom = room => {
    const text = String(room || '').trim();
    const index = text.lastIndexOf(' - ');
    return index > 0 ? { name: text.slice(0, index), campus: text.slice(index + 3) } : { name: text, campus: '' };
};

// Xếp các buổi trùng giờ trong 1 ngày thành các làn song song.
const layoutDay = items => {
    const placed = items
        .map(s => {
            const start = toMinutes(s.startTime);
            const end = toMinutes(s.endTime);
            return start === null ? null : { s, start, end: end !== null && end > start ? end : start + 60 };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start || b.end - a.end);
    const laneEnds = [];
    placed.forEach(item => {
        let lane = laneEnds.findIndex(end => end <= item.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.end); } else laneEnds[lane] = item.end;
        item.lane = lane;
    });
    return { placed, lanes: Math.max(1, laneEnds.length) };
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
    const [selectedSubjectCodes, setSelectedSubjectCodes] = useState([]);
    const [selectedClassCodes, setSelectedClassCodes] = useState([]);
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
    // Lựa chọn của bộ lọc: label = tên, hint = mã, count = số buổi trong khoảng đang xem; sắp theo mã.
    const subjectOptions = useMemo(() => {
        const subjects = new Map();
        sessions
            .filter(s => s.subjectCode && (selectedSemester === 'all' || s.semester === selectedSemester))
            .forEach(s => {
                const item = subjects.get(s.subjectCode) || { value: s.subjectCode, label: s.subject || s.subjectCode, hint: s.subjectCode, count: 0 };
                item.count += 1;
                subjects.set(s.subjectCode, item);
            });
        return [...subjects.values()].sort((a, b) => a.value.localeCompare(b.value, 'vi', { numeric: true }));
    }, [sessions, selectedSemester]);
    const classOptions = useMemo(() => {
        const classes = new Map();
        sessions
            .filter(s => s.classCode && (selectedSubjectCodes.length === 0 || selectedSubjectCodes.includes(s.subjectCode)))
            .forEach(s => {
                const item = classes.get(s.classCode) || { value: s.classCode, label: s.classCode, hint: s.subject || s.subjectCode, count: 0 };
                item.count += 1;
                classes.set(s.classCode, item);
            });
        return [...classes.values()].sort((a, b) => a.value.localeCompare(b.value, 'vi', { numeric: true }));
    }, [sessions, selectedSubjectCodes]);

    // Bỏ lựa chọn lọc không còn trong khoảng đang xem.
    useEffect(() => {
        if (selectedSemester !== 'all' && !semesters.includes(selectedSemester)) setSelectedSemester('all');
    }, [semesters, selectedSemester]);
    useEffect(() => {
        setSelectedSubjectCodes(prev => (prev.every(code => subjectOptions.some(o => o.value === code)) ? prev : prev.filter(code => subjectOptions.some(o => o.value === code))));
    }, [subjectOptions]);
    useEffect(() => {
        setSelectedClassCodes(prev => (prev.every(code => classOptions.some(o => o.value === code)) ? prev : prev.filter(code => classOptions.some(o => o.value === code))));
    }, [classOptions]);

    const visible = useMemo(() => sessions.filter(s => (
        (selectedSemester === 'all' || s.semester === selectedSemester)
        && (selectedSubjectCodes.length === 0 || selectedSubjectCodes.includes(s.subjectCode))
        && (selectedClassCodes.length === 0 || selectedClassCodes.includes(s.classCode))
    )), [sessions, selectedSemester, selectedSubjectCodes, selectedClassCodes]);

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
        : `Tuần ${formatDayMonth(days[0])} - ${formatDayMonth(days[6])}/${days[6].getFullYear()}`;
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
    const selectClass = 'h-10 w-full sm:w-52 min-w-0 truncate px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo';
    const unit = isMonth ? 'Tháng' : 'Tuần';

    // Cả khoảng đang xem cùng 1 cơ sở → không lặp tên cơ sở trên từng thẻ, chỉ ghi 1 lần ở thanh tuần.
    const campuses = [...new Set(visible.map(s => splitRoom(s.room).campus).filter(Boolean))];
    const sharedCampus = campuses.length === 1 ? campuses[0] : '';
    const roomLabel = room => {
        if (!room) return 'Chưa có phòng';
        const { name, campus } = splitRoom(room);
        return sharedCampus && campus === sharedCampus ? name : room;
    };

    const renderWeek = () => {
        const minutes = visible.flatMap(s => [toMinutes(s.startTime), toMinutes(s.endTime)]).filter(value => value !== null);
        const startHour = Math.min(DEFAULT_START_HOUR, ...minutes.map(value => Math.floor(value / 60)));
        const endHour = Math.max(DEFAULT_END_HOUR, ...minutes.map(value => Math.ceil(value / 60)));
        const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
        const gridHeight = hours.length * HOUR_HEIGHT;
        return (
            <div className="bg-white border border-platinum-tint rounded-xl overflow-x-auto">
                <div className="min-w-[960px]">
                    <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-platinum-tint bg-cloud-mist/30 sticky top-0 z-10">
                        <span />
                        {days.map((date, index) => {
                            const isToday = toDateKey(date) === todayKey;
                            return (
                                <div key={toDateKey(date)} className={`px-2 py-2 text-center border-l border-platinum-tint ${isToday ? 'bg-blue-50' : ''}`}>
                                    <p className={`text-xs font-bold ${isToday ? 'text-action-blue' : 'text-midnight-indigo'}`}>{DAY_LABELS[index]}</p>
                                    <p className={`text-[11px] ${isToday ? 'text-action-blue font-semibold' : 'text-slate-blue'}`}>{formatDayMonth(date)}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] relative" style={{ height: gridHeight }}>
                        <div className="relative">
                            {hours.map((hour, index) => (
                                <span key={hour} className={`absolute right-2 text-[10px] font-semibold text-slate-blue ${index === 0 ? 'mt-1' : '-translate-y-1/2'}`} style={{ top: index * HOUR_HEIGHT }}>
                                    {`${String(hour).padStart(2, '0')}:00`}
                                </span>
                            ))}
                        </div>
                        {days.map(date => {
                            const dateKey = toDateKey(date);
                            const isToday = dateKey === todayKey;
                            const { placed, lanes } = layoutDay(byDate.get(dateKey) || []);
                            return (
                                <div key={dateKey} className={`relative border-l border-platinum-tint ${isToday ? 'bg-blue-50/30' : ''}`}>
                                    {hours.map((hour, index) => (
                                        <span key={hour} className="absolute inset-x-0 border-t border-platinum-tint/60" style={{ top: index * HOUR_HEIGHT }} />
                                    ))}
                                    {placed.map(({ s, start, end, lane }) => {
                                        const badgeInfo = STATUS_BADGE[s.status];
                                        const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
                                        const height = Math.max(28, ((end - start) / 60) * HOUR_HEIGHT - 2);
                                        const cancelled = s.status === 'cancelled';
                                        return (
                                            <div
                                                key={s.id}
                                                title={`${s.startTime} - ${s.endTime} · ${s.subject || s.subjectCode} · ${s.classCode} · ${s.room || 'Chưa có phòng'}`}
                                                className={`absolute rounded-lg border px-2 py-1.5 overflow-hidden ${cancelled ? 'border-red-200 bg-red-50 opacity-70' : subjectColor(s.subjectCode)}`}
                                                style={{ top: top + 1, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <p className={`text-[11px] font-bold leading-tight line-clamp-2 text-midnight-indigo ${cancelled ? 'line-through' : ''}`}>{s.subject || s.subjectCode}</p>
                                                    {badgeInfo && <span className={`shrink-0 px-1 py-px rounded text-[9px] font-bold ${badgeInfo.className}`}>{badgeInfo.label}</span>}
                                                </div>
                                                <p className="text-[10px] font-semibold mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" /> {s.startTime} - {s.endTime}</p>
                                                <p className="text-[10px] text-slate-blue mt-0.5 truncate">{s.classCode}</p>
                                                <p className="text-[10px] text-slate-blue mt-0.5 flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{roomLabel(s.room)}</span></p>
                                                {isTeacher
                                                    ? <p className="text-[10px] text-slate-blue mt-0.5 flex items-center gap-1"><Users className="w-3 h-3 shrink-0" /> {s.studentCount} SV</p>
                                                    : <p className="text-[10px] text-slate-blue mt-0.5 flex items-center gap-1 min-w-0"><UserRound className="w-3 h-3 shrink-0" /><span className="truncate">{s.teacher || 'Chưa có giảng viên'}</span></p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {!loading && visible.length === 0 && (
                            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-blue pointer-events-none">Không có lịch trong tuần này</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

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
                <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:shrink-0">
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
                    <MultiSelectDropdown
                        options={subjectOptions}
                        selected={selectedSubjectCodes}
                        onChange={setSelectedSubjectCodes}
                        allLabel="Tất cả môn học"
                        unitLabel="môn học"
                        searchPlaceholder="Tìm theo tên hoặc mã môn…"
                        ariaLabel="Lọc theo môn học"
                        icon={BookOpen}
                    />
                    {isTeacher && (
                        <MultiSelectDropdown
                            options={classOptions}
                            selected={selectedClassCodes}
                            onChange={setSelectedClassCodes}
                            allLabel="Tất cả lớp"
                            unitLabel="lớp"
                            searchPlaceholder="Tìm theo mã lớp hoặc môn…"
                            ariaLabel="Lọc theo lớp học phần"
                            icon={School}
                            widthClass="w-44"
                            panelWidthClass="w-[300px]"
                        />
                    )}
                    <button type="button" onClick={() => setRefreshKey(v => v + 1)} disabled={loading} aria-label="Làm mới lịch" className="h-10 px-3 inline-flex items-center gap-2 bg-white border border-platinum-tint rounded-lg text-xs font-bold text-slate-blue hover:text-action-blue disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white border border-platinum-tint rounded-xl px-2 py-1">
                <button type="button" onClick={() => shift(-1)} className="p-1.5 rounded-md text-slate-blue hover:text-action-blue hover:bg-cloud-mist" aria-label={`${unit} trước`}><ChevronLeft className="w-4 h-4" /></button>
                <p className="text-sm font-bold text-midnight-indigo">{periodLabel}</p>
                <button type="button" onClick={() => shift(1)} className="p-1.5 rounded-md text-slate-blue hover:text-action-blue hover:bg-cloud-mist" aria-label={`${unit} sau`}><ChevronRight className="w-4 h-4" /></button>
                <span className="text-[11px] text-slate-blue">
                    {loading ? 'Đang tải…' : `${activeCount} buổi ${isTeacher ? 'dạy' : 'học'}`}
                    {sharedCampus && <> · <MapPin className="inline w-3 h-3 -mt-0.5" /> {sharedCampus}</>}
                </span>
                <button type="button" onClick={() => setAnchor(new Date())} className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-semibold text-action-blue hover:bg-blue-50">Về {unit.toLowerCase()} này</button>
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
