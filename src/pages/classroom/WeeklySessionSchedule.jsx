import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CalendarClock, CheckCircle2, XCircle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, School, UserRound, Users } from 'lucide-react';
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

// Xem tuần dạng lưới thời gian (kiểu Google Calendar): cột trái là mốc giờ, thẻ đặt đúng giờ bắt đầu và cao theo
// thời lượng. Thẻ đủ cao hiện đủ thông tin; thẻ thấp tự gọn dòng (không cắt ngang chữ), đầy đủ ở tooltip.
const HOUR_HEIGHT = 40;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22; // buổi tối UEL kết thúc 21:05–21:35 → lưới luôn tới 22:00
const CARD_LINE = 16;
const CARD_PADDING = 14;
// Khung tiết UEL (suy từ dữ liệu TKB đã đồng bộ): mỗi tiết 50 phút, nghỉ 15 phút sau tiết 3, 6, 9.
// UEL tính cả nửa tiết (VD 07:00–11:00 = "Tiết 1–4.5") nhưng chỉ trả số tiết làm tròn → tiết kết thúc tính lại từ giờ thật.
const PERIOD_STARTS = ['07:00', '07:50', '08:40', '09:45', '10:35', '11:25', '12:30', '13:20', '14:10', '15:15', '16:05', '16:55', '17:45', '18:35', '19:25', '20:15', '21:05'];
const PERIOD_MINUTES = 50;
const toMinutes = time => {
    const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const PERIOD_START_MINUTES = PERIOD_STARTS.map(toMinutes);
// Tiết chứa một mốc giờ (tiết cuối cùng bắt đầu trước hoặc đúng mốc đó).
const periodAt = minutes => {
    let period = 1;
    PERIOD_START_MINUTES.forEach((start, index) => { if (minutes >= start) period = index + 1; });
    return period;
};
// Tiết kết thúc (bội 0.5) từ giờ kết thúc: 11:00 nằm giữa tiết 5 → 4.5; 11:25 hết tiết 5 → 5.
const periodEndAt = minutes => {
    const period = periodAt(minutes - 1);
    const used = (minutes - PERIOD_START_MINUTES[period - 1]) / PERIOD_MINUTES;
    return period - 1 + Math.max(0.5, Math.min(1, Math.round(used * 2) / 2));
};
// [tiết đầu, tiết cuối] của buổi: tiết đầu ưu tiên periodStart của UEL; tiết cuối tính từ giờ kết thúc thật
// (không có giờ thì dùng periodCount).
const periodSpan = session => {
    const start = Number(session.periodStart);
    const from = start > 0 ? start : periodAt(toMinutes(session.startTime) ?? 0);
    const endMinutes = toMinutes(session.endTime);
    if (endMinutes !== null) return [from, Math.max(from, periodEndAt(endMinutes))];
    const count = Number(session.periodCount);
    return [from, from + Math.max(1, count || 1) - 1];
};
// Xếp các buổi trùng giờ trong 1 ngày thành các làn song song (hiếm gặp).
const layoutDay = items => {
    const placed = items
        .map(item => {
            const start = toMinutes(item.startTime);
            const end = toMinutes(item.endTime);
            return start === null ? null : { item, start, end: end !== null && end > start ? end : start + 60 };
        })
        .filter(Boolean)
        .sort((x, y) => x.start - y.start || y.end - x.end);
    const laneEnds = [];
    placed.forEach(entry => {
        let lane = laneEnds.findIndex(end => end <= entry.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(entry.end); } else laneEnds[lane] = entry.end;
        entry.lane = lane;
    });
    return { placed, lanes: Math.max(1, laneEnds.length) };
};
const formatPeriod = value => String(value); // giữ dấu chấm như app UEL ("Tiết 1–4.5")
const periodRange = session => {
    const [from, to] = periodSpan(session);
    return from === to ? `Tiết ${formatPeriod(from)}` : `Tiết ${formatPeriod(from)}–${formatPeriod(to)}`;
};
// "A.310 - Cơ sở chính" → { name: 'A.310', campus: 'Cơ sở chính' }.
const splitRoom = room => {
    const text = String(room || '').trim();
    const index = text.lastIndexOf(' - ');
    return index > 0 ? { name: text.slice(0, index), campus: text.slice(index + 3) } : { name: text, campus: '' };
};

// Mỗi môn một màu cố định (theo mã môn) để nhìn lịch tháng dễ phân biệt.
const SUBJECT_COLORS = [
    'bg-blue-100/80 text-blue-800 border-blue-200 border-l-blue-600',
    'bg-emerald-100/80 text-emerald-800 border-emerald-200 border-l-emerald-600',
    'bg-amber-100/80 text-amber-900 border-amber-200 border-l-amber-500',
    'bg-violet-100/80 text-violet-800 border-violet-200 border-l-violet-600',
    'bg-rose-100/80 text-rose-800 border-rose-200 border-l-rose-600',
    'bg-cyan-100/80 text-cyan-800 border-cyan-200 border-l-cyan-600',
    'bg-orange-100/80 text-orange-800 border-orange-200 border-l-orange-500',
    'bg-lime-100/80 text-lime-900 border-lime-200 border-l-lime-600'
];
const subjectColor = code => {
    const text = String(code || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
};

const SUBJECT_ACCENTS = ['border-l-rose-400', 'border-l-cyan-400', 'border-l-violet-400', 'border-l-amber-400', 'border-l-emerald-400', 'border-l-blue-400', 'border-l-orange-400', 'border-l-lime-500'];
const subjectAccent = code => {
    const text = String(code || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return SUBJECT_ACCENTS[hash % SUBJECT_ACCENTS.length];
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
    // Giờ hiện tại (cập nhật mỗi phút) để tô buổi đang diễn ra và vạch "bây giờ" trên lịch tuần.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);

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
    const todayKey = toDateKey(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
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

    // Thẻ: tên môn → tiết · giờ → phòng · cơ sở → lớp · sĩ số (sinh viên: giảng viên) → trạng thái.
    // lines = số dòng vừa chiều cao thẻ: ≥ 5 mỗi mục 1 dòng (≥ 6 thì tên môn dài được 2 dòng);
    // 3–4 gộp phòng + lớp, trạng thái thu về icon; ≤ 2 chỉ tên môn + giờ.
    // floating: bản đầy đủ bung ra khi rê chuột / bấm vào thẻ ngắn (bản sao để xem, ẩn với trình đọc màn hình).
    const renderSessionCard = (s, dateKey, lines = 7, floating = false) => {
        const cancelled = s.status === 'cancelled';
        const start = toMinutes(s.startTime);
        const end = toMinutes(s.endTime) ?? (start ?? 0) + 60;
        const isNow = !cancelled && dateKey === todayKey && start !== null && nowMinutes >= start && nowMinutes < end;
        const isPast = !cancelled && !isNow && (dateKey < todayKey || (dateKey === todayKey && nowMinutes >= end));
        const isDone = !cancelled && (isPast || s.status === 'completed');
        // Mọi thẻ đều có trạng thái: Đang dạy / Đã xong / Đã hủy / Sắp diễn ra (tính theo giờ vì UEL không cập nhật).
        const statusLabel = isNow ? (isTeacher ? 'Đang dạy' : 'Đang học') : isDone ? STATUS_BADGE.completed.label : cancelled ? STATUS_BADGE.cancelled.label : 'Sắp diễn ra';
        const statusTone = isNow ? 'text-action-blue' : isDone ? 'text-emerald-600' : cancelled ? 'text-red-600' : 'text-violet-600'; // Sắp diễn ra: tím (đỏ đã dùng cho Đã hủy, cam cho dòng giờ)
        const statusIcon = isNow
            ? <span className="w-1.5 h-1.5 mx-[3px] rounded-full bg-action-blue animate-pulse" />
            : isDone ? <CheckCircle2 className="w-3 h-3" /> : cancelled ? <XCircle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />;
        const subject = s.subject || s.subjectCode;
        const { name: roomName, campus } = splitRoom(s.room);
        // Cơ sở viết gọn để phòng luôn nằm 1 dòng: "Trường Cán bộ quản lý NN và PTNN II (DMA)" → mã "DMA"; phòng đã
        // mang mã đó ("DMA B3.2") thì khỏi lặp. Cả tuần chung 1 cơ sở → bỏ (đã ghi ở thanh tuần). Đủ tên ở tooltip.
        const campusShort = campus.match(/\(([^)]+)\)\s*$/)?.[1] || campus;
        const showCampus = campus && campus !== sharedCampus && !roomName.toUpperCase().startsWith(`${campusShort.toUpperCase()} `);
        const place = !s.room ? 'Chưa có phòng' : showCampus ? `${roomName} · ${campusShort}` : roomName;
        // Tên môn dài (> ~24 ký tự) được 2 dòng khi thẻ ≥ 5 dòng; thẻ đúng 5 dòng thì nhường dòng trạng thái
        // (trạng thái thu về icon cuối dòng giờ) để tên môn không bị cắt.
        const titleTwoLines = lines >= 5 && subject.length > 24;
        const statusInline = lines <= 2 || (lines === 5 && titleTwoLines);
        // Còn dư dòng (thẻ dài) thì cho phòng xuống 2 dòng thay vì cắt "…" (VD "Phòng học online 016 · Cơ sở chính").
        const placeTwoLines = lines >= 6 + (titleTwoLines ? 1 : 0) && place.length > 22;
        const people = isTeacher ? `${s.classCode} · ${s.studentCount} SV` : (s.teacher || 'Chưa có giảng viên');
        const row = 'flex items-center gap-1 min-w-0 whitespace-nowrap';
        return (
            <div
                key={s.id}
                aria-current={isNow && !floating ? 'time' : undefined}
                title={floating ? undefined : [periodRange(s), `${s.startTime} - ${s.endTime}`, subject, s.classCode, s.room || 'Chưa có phòng', statusLabel].filter(Boolean).join(' · ')}
                className={`${floating ? 'shadow-xl' : 'h-full overflow-hidden'} rounded-md border border-platinum-tint border-l-4 px-2 py-1.5 text-[11px] leading-[16px] ${cancelled ? 'border-l-red-400 bg-red-50/60' : `${subjectAccent(s.subjectCode)} ${isNow ? 'bg-blue-50' : 'bg-white'}`} ${isNow ? 'ring-2 ring-action-blue shadow-sm' : ''}`}
            >
                <p className={`${titleTwoLines ? 'line-clamp-2 break-words' : 'truncate'} font-bold ${cancelled ? 'text-red-600 line-through' : 'text-action-blue'}`}>{subject}</p>
                <p className={`${row} font-semibold`}>
                    <Clock className="w-3 h-3 shrink-0 text-slate-blue" />
                    <span className={`truncate ${cancelled ? 'text-red-500' : 'text-amber-600'}`}>{periodRange(s)} · {s.startTime}–{s.endTime}</span>
                    {statusInline && <span className={`ml-auto shrink-0 ${statusTone}`} title={statusLabel}>{statusIcon}</span>}
                </p>
                {lines >= 5 && (
                    <>
                        <p className={`${placeTwoLines ? 'flex items-start gap-1 min-w-0' : row} font-semibold text-slate-blue`}>
                            <MapPin className={`w-3 h-3 shrink-0 ${placeTwoLines ? 'mt-0.5' : ''}`} />
                            <span className={placeTwoLines ? 'min-w-0 line-clamp-2 break-words' : 'truncate'}>{place}</span>
                        </p>
                        <p className={`${row} font-semibold text-slate-blue`}>
                            {isTeacher ? <Users className="w-3 h-3 shrink-0" /> : <UserRound className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{people}</span>
                        </p>
                        {!statusInline && <p className={`${row} font-bold ${statusTone}`}>{statusIcon}<span className="truncate">{statusLabel}</span></p>}
                    </>
                )}
                {lines >= 3 && lines <= 4 && (
                    <>
                        <p className={`${row} font-semibold text-slate-blue`}>
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{place} · {people}</span>
                            {lines === 3 && <span className={`ml-auto shrink-0 ${statusTone}`} title={statusLabel}>{statusIcon}</span>}
                        </p>
                        {lines === 4 && <p className={`${row} font-bold ${statusTone}`}>{statusIcon}<span className="truncate">{statusLabel}</span></p>}
                    </>
                )}
            </div>
        );
    };

    // Lưới thời gian: cột giờ bên trái (mỗi giờ HOUR_HEIGHT px), 7 cột ngày; thẻ đặt tuyệt đối theo phút.
    const renderWeek = () => {
        const minutes = visible.flatMap(item => [toMinutes(item.startTime), toMinutes(item.endTime)]).filter(value => value !== null);
        const startHour = Math.min(DEFAULT_START_HOUR, ...minutes.map(value => Math.floor(value / 60)));
        const endHour = Math.min(24, Math.max(DEFAULT_END_HOUR, ...minutes.map(value => Math.ceil(value / 60))));
        const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
        const gridHeight = hours.length * HOUR_HEIGHT;
        const columns = { gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' };
        const showNowLine = days.some(date => toDateKey(date) === todayKey) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;
        return (
            <div className="bg-white border border-platinum-tint rounded-xl overflow-x-auto">
                <div className="min-w-[960px]">
                    <div className="grid" style={columns}>
                        <span className="bg-blue-50 border-b border-blue-100" />
                        {days.map((date, index) => {
                            const dateKey = toDateKey(date);
                            const isToday = dateKey === todayKey;
                            const count = (byDate.get(dateKey) || []).length;
                            return (
                                // Khung thứ có màu: ngày thường nền xanh nhạt, hôm nay nền xanh đậm chữ trắng.
                                <header key={dateKey} className={`px-2 py-2.5 text-center border-b border-l ${isToday ? 'bg-action-blue border-action-blue' : 'bg-blue-50 border-blue-100'}`}>
                                    <p className={`text-[13px] font-bold ${isToday ? 'text-white' : 'text-midnight-indigo'}`}>{DAY_LABELS[index]}</p>
                                    <p className={`text-[11px] font-semibold ${isToday ? 'text-white/90' : 'text-action-blue'}`}>{formatDayMonth(date)}{count > 0 && ` · ${count} buổi`}</p>
                                </header>
                            );
                        })}
                    </div>
                    <div className="grid" style={{ ...columns, height: gridHeight }}>
                        <div className="relative">
                            {/* Mốc cuối (22:00) nằm sát đáy bảng → đặt chữ phía trên đường đáy, không nới thêm khoảng trống. */}
                            {[...hours, endHour].map((hour, index) => (
                                <span key={hour} className="absolute right-2 text-[11px] font-semibold text-slate-blue" style={{ top: index * HOUR_HEIGHT + (index === 0 ? 2 : index === hours.length ? -16 : -7) }}>
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
                                        <span key={hour} className="absolute inset-x-0 border-t border-platinum-tint/70" style={{ top: index * HOUR_HEIGHT }} />
                                    ))}
                                    {isToday && showNowLine && (
                                        <div aria-hidden="true" className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT }}>
                                            <span className="absolute -left-1 -top-[4px] w-2 h-2 rounded-full bg-red-500" />
                                            <span className="block border-t-2 border-red-500" />
                                        </div>
                                    )}
                                    {placed.map(({ item, start, end, lane }) => {
                                        const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
                                        const height = Math.max(24, ((end - start) / 60) * HOUR_HEIGHT - 3);
                                        const lines = Math.max(1, Math.floor((height - CARD_PADDING) / CARD_LINE));
                                        return (
                                            // Thẻ ngắn (< 6 dòng, thiếu thông tin): rê chuột / bấm (Tab) thì bung bản đầy đủ đè lên ô bên dưới;
                                            // thẻ gần cuối bảng thì bung lên trên để không bị khung bảng che.
                                            <div
                                                key={item.id}
                                                tabIndex={lines < 6 ? 0 : undefined}
                                                className={`group absolute z-10 hover:z-30 focus:z-30 outline-none ${lines < 6 ? 'cursor-pointer' : ''}`}
                                                style={{ top: top + 1, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                                            >
                                                {renderSessionCard(item, dateKey, lines)}
                                                {lines < 6 && (
                                                    <div aria-hidden="true" className={`hidden group-hover:block group-focus:block absolute inset-x-0 min-w-[200px] ${top + 150 > gridHeight ? 'bottom-0' : 'top-0'}`}>
                                                        {renderSessionCard(item, dateKey, 9, true)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
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
                    {subtitle && <p className="text-xs text-slate-blue mt-1">{subtitle}</p>}
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
                    {loading ? 'Đang tải...' : `${activeCount} buổi ${isTeacher ? 'dạy' : 'học'}`}
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
