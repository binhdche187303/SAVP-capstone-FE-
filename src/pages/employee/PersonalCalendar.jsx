import { AlertTriangle, Award, Calendar as CalendarIcon, CheckCircle, ChevronLeft, ChevronRight, Clock, Filter, Grid, Info, List, MapPin, PlusCircle, Radio, User, UserCheck, XCircle } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { MEETING_BOOKING_ENABLED, MEETING_CALENDAR_MOCK_ENABLED } from '../../config/featureFlags';
import StatCard from '../../components/common/StatCard';
import { ATTENDANCE_STATUS, CALENDAR_TYPES, getMockMySchedule } from '../../mocks/meetingCalendarMock';
import { getMySchedule } from '../../service/employeeServices';
import { isForbiddenError } from '../../utils/permissionUtils';
import MockMyMeetingAttendance from './MockMyMeetingAttendance';
import MyMeetingAttendance from './MyMeetingAttendance';

const STATUS_CONFIG = {
    draft: { label: 'Bản nháp', bg: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: Clock },
    pending_approval: { label: 'Chờ duyệt', bg: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500', icon: Clock },
    scheduled: { label: 'Đã lên lịch', bg: 'bg-blue-50 text-action-blue border-blue-150', dot: 'bg-blue-500', icon: Clock },
    in_progress: { label: 'Đang diễn ra', bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: CheckCircle },
    completed: { label: 'Đã kết thúc', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle },
    cancelled: { label: 'Đã huỷ', bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500', icon: XCircle }
};

const getEffectiveStatus = (meeting, nowTs = Date.now()) => {
    const status = (meeting?.status || '').toLowerCase();
    const endTime = meeting?.endTime || meeting?.end_time;
    if (['scheduled', 'in_progress'].includes(status) && endTime && new Date(endTime).getTime() < nowTs) {
        return 'completed';
    }
    return status || 'scheduled';
};

// Chưa có API lịch VPĐT → dùng dữ liệu giả; tắt cờ là gọi GET /me/schedule thật, không sửa gì khác.
const fetchMySchedule = MEETING_CALENDAR_MOCK_ENABLED ? getMockMySchedule : getMySchedule;

const ROLE_LABEL = { host: 'Chủ trì', secretary: 'Thư ký', organizer: 'Người tổ chức' };
const typeOf = (m) => CALENDAR_TYPES[m.calendarType];

const PersonalCalendar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') === 'attendance' ? 'attendance' : 'calendar';
    const setTab = (key) => setSearchParams(key === 'attendance' ? { tab: key } : {}, { replace: true });
    const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
    // Quay lại từ trang chi tiết: mở đúng ngày đang xem trước đó.
    const [currentDate, setCurrentDate] = useState(() => (location.state?.date ? new Date(location.state.date) : new Date()));
    const [selectedDate, setSelectedDate] = useState(() => (location.state?.date ? new Date(location.state.date) : new Date()));
    const [meetings, setMeetings] = useState([]);
    const [nowTs, setNowTs] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState(''); // all, scheduled, in_progress, cancelled
    const [typeFilter, setTypeFilter] = useState(''); // '' | leadership | other | unit

    const openMeeting = (id, date = selectedDate) => {
        const basePath = location.pathname.split('/')[1];
        navigate(`/${basePath}/meeting/${id}`, {
            state: { from: `${location.pathname}${location.search}`, date: new Date(date).toISOString() },
        });
    };

    const mapEventToMeeting = (dto) => ({
        id: dto.meetingId || dto.id,
        title: dto.title || dto.meetingCode || 'Cuộc họp',
        room: { roomName: dto.room?.roomName || dto.roomName || 'N/A', location: dto.room?.location || dto.roomLocation || dto.location },
        startTime: dto.startTime || dto.start_time,
        endTime: dto.endTime || dto.end_time,
        myRole: dto.userRole || dto.user_role,
        status: (dto.status || (dto.isCurrent ? 'in_progress' : dto.isPast ? 'completed' : 'scheduled')).toLowerCase(),
        calendarType: dto.calendarType || dto.calendar_type,
        hostName: dto.hostName || dto.host?.fullName,
        attendanceEnabled: dto.attendanceEnabled,
        myAttendance: dto.myAttendance || null,
    });

    const fetchSchedule = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch meetings for the current month context
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            // Calculate last day of month
            const lastDay = new Date(year, currentDate.getMonth() + 1, 0).getDate();

            const fromStr = `${year}-${month}-01T00:00:00+07:00`;
            const toStr = `${year}-${month}-${lastDay}T23:59:59+07:00`;

            let dataList = [];
            let isSuccess = false;

            const res = await fetchMySchedule({
                from: fromStr,
                to: toStr,
                view: 'month',
                status: statusFilter ? [statusFilter, statusFilter] : ['scheduled', 'in_progress', 'completed', 'pending_approval', ...(MEETING_CALENDAR_MOCK_ENABLED ? ['cancelled'] : [])]
            });

            if (res?.success) {
                isSuccess = true;
                dataList = res.data?.items || res.data || [];
            } else {
                throw new Error(res?.error?.message || 'Lỗi khi tải lịch trình');
            }

            if (isSuccess) {
                const mappedMeetings = dataList.map(mapEventToMeeting);
                setMeetings(mappedMeetings);
                setError(null);
            }
        } catch (err) {
            setMeetings([]);
            // A permission-denial (e.g. role lost `schedule.read.self` mid-session while this
            // screen was already open) should land the user on the real 403 page, not an inline
            // retry banner — the route guard only checks at navigation time.
            if (isForbiddenError(err)) {
                navigate('/403', { replace: true });
                return;
            }
            const errorMsg = err?.error?.message || err?.message || 'Lỗi kết nối máy chủ';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, [currentDate, statusFilter, navigate]);

    useEffect(() => {
        fetchSchedule();
    }, [fetchSchedule]);

    useEffect(() => {
        const timer = setInterval(() => setNowTs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const effectiveMeetings = useMemo(
        () => meetings
            .filter((meeting) => !typeFilter || meeting.calendarType === typeFilter)
            .map((meeting) => ({
                ...meeting,
                rawStatus: meeting.rawStatus || meeting.status,
                status: getEffectiveStatus(meeting, nowTs),
            })),
        [meetings, nowTs, typeFilter],
    );

    // Số liệu tháng đang xem (điểm danh lấy từ myAttendance nếu API trả về).
    const monthStats = useMemo(() => {
        const active = effectiveMeetings.filter((m) => m.status !== 'cancelled');
        const done = active.filter((m) => m.status === 'completed' && m.myAttendance && m.myAttendance.status !== 'not_required');
        return {
            total: active.length,
            live: active.filter((m) => m.status === 'in_progress').length,
            upcoming: active.filter((m) => ['scheduled', 'pending_approval'].includes(m.status) && new Date(m.startTime).getTime() > nowTs).length,
            attended: done.filter((m) => m.myAttendance.status !== 'absent').length,
            checked: done.length,
            violations: done.filter((m) => m.myAttendance.points < 0).length,
            points: done.reduce((sum, m) => sum + (m.myAttendance.points || 0), 0),
        };
    }, [effectiveMeetings, nowTs]);

    // Calendar generation helpers
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];
        // Add padding days from previous month
        const firstDayIndex = (firstDay.getDay() + 6) % 7; // Monday starting
        for (let i = firstDayIndex; i > 0; i--) {
            days.push({
                date: new Date(year, month, 1 - i),
                isCurrentMonth: false
            });
        }

        // Current month days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push({
                date: new Date(year, month, i),
                isCurrentMonth: true
            });
        }

        // Add padding days for next month to complete 6 weeks grid
        const remainingCells = 42 - days.length;
        for (let i = 1; i <= remainingCells; i++) {
            days.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false
            });
        }

        return days;
    };

    const getDaysInWeek = (date) => {
        const currentDay = date.getDay();
        const distanceToMonday = (currentDay + 6) % 7;
        const monday = new Date(date);
        monday.setDate(date.getDate() - distanceToMonday);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            days.push(day);
        }
        return days;
    };

    const isSameDay = (date1, date2) => {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    };

    // Filters meetings by day
    const getMeetingsForDay = (day) => {
        return effectiveMeetings.filter(m => isSameDay(new Date(m.startTime), day));
    };

    const handlePrev = () => {
        if (viewMode === 'month') {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        } else {
            const nextWeek = new Date(currentDate);
            nextWeek.setDate(currentDate.getDate() - 7);
            setCurrentDate(nextWeek);
        }
    };

    const handleNext = () => {
        if (viewMode === 'month') {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        } else {
            const nextWeek = new Date(currentDate);
            nextWeek.setDate(currentDate.getDate() + 7);
            setCurrentDate(nextWeek);
        }
    };

    const formatHeaderDate = () => {
        if (viewMode === 'month') {
            return currentDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
        } else {
            const weekDays = getDaysInWeek(currentDate);
            const startStr = weekDays[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const endStr = weekDays[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return `Tuần: ${startStr} - ${endStr}`;
        }
    };

    const selectedDayMeetings = getMeetingsForDay(selectedDate);

    // Week time slots hours definition (07:00 to 18:00) — UEL có giao ban 7h30
    const hours = Array.from({ length: 12 }, (_, i) => 7 + i);

    const tabBar = (
        <div className="flex items-center bg-white p-1 rounded-xl border border-platinum-tint shadow-sm w-fit">
            {[['calendar', 'Lịch'], ['attendance', 'Lịch sử tham dự']].map(([key, label]) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === key ? 'bg-action-blue text-white shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    if (tab === 'attendance') {
        return (
            <div className="space-y-6">
                {tabBar}
                {MEETING_CALENDAR_MOCK_ENABLED ? <MockMyMeetingAttendance onOpen={openMeeting} /> : <MyMeetingAttendance />}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {tabBar}
            {/* Header: tiêu đề bên trái, nút Đăng ký họp bên phải; thanh công cụ riêng 1 hàng bên dưới */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Lịch trình
                        </span>
                        {MEETING_CALENDAR_MOCK_ENABLED && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                                Dữ liệu minh họa – chưa tích hợp API VPĐT
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Lịch cá nhân</h1>
                    <p className="text-slate-blue text-sm mt-0.5">Lịch họp đồng bộ từ Văn phòng điện tử (VPĐT) — xem lịch, điểm danh và theo dõi ra vào phòng họp.</p>
                </div>
                {MEETING_BOOKING_ENABLED && (
                    <button
                        type="button"
                        onClick={() => navigate(`/${location.pathname.split('/')[1]}/book`)}
                        className="h-10 shrink-0 inline-flex items-center gap-2 px-4 rounded-xl bg-action-blue text-white text-sm font-bold shadow-sm hover:bg-blue-700"
                    >
                        <PlusCircle className="w-4 h-4" /> Đăng ký họp
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Tháng / Tuần */}
                    <div className="h-9 bg-white rounded-xl border border-platinum-tint shadow-sm flex items-center p-1">
                        {[['month', 'Tháng', Grid], ['week', 'Tuần', List]].map(([key, label, Icon]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setViewMode(key)}
                                className={`h-full flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-bold transition-all ${viewMode === key
                                    ? 'bg-action-blue text-white shadow-sm'
                                    : 'text-slate-blue hover:text-midnight-indigo'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {label}
                            </button>
                        ))}
                    </div>

                    {/* Điều hướng thời gian */}
                    <div className="h-9 bg-white rounded-xl border border-platinum-tint shadow-sm flex items-stretch">
                        <button type="button" onClick={handlePrev} className="px-2.5 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50 rounded-l-xl border-r border-platinum-tint">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="flex items-center justify-center px-4 text-xs font-bold text-midnight-indigo min-w-[150px] select-none">
                            {formatHeaderDate()}
                        </span>
                        <button type="button" onClick={handleNext} className="px-2.5 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50 rounded-r-xl border-l border-platinum-tint">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                        className="h-9 bg-white rounded-xl border border-platinum-tint shadow-sm px-3.5 text-xs font-bold text-slate-blue hover:text-action-blue"
                    >
                        Hôm nay
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Lọc trạng thái */}
                    <label className="h-9 bg-white rounded-xl border border-platinum-tint shadow-sm flex items-center gap-1.5 px-3">
                        <Filter className="w-3.5 h-3.5 text-slate-blue" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-transparent border-0 text-xs font-bold text-midnight-indigo focus:outline-none cursor-pointer"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="pending_approval">Chờ duyệt</option>
                            <option value="scheduled">Đã lên lịch</option>
                            {/* <option value="in_progress">Đang diễn ra</option> */}
                            <option value="completed">Đã kết thúc</option>
                            {MEETING_CALENDAR_MOCK_ENABLED && <option value="cancelled">Đã huỷ</option>}
                        </select>
                    </label>

                    {/* Lọc loại lịch (VPĐT) */}
                    <label className="h-9 bg-white rounded-xl border border-platinum-tint shadow-sm flex items-center gap-1.5 px-3">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-blue" />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="bg-transparent border-0 text-xs font-bold text-midnight-indigo focus:outline-none cursor-pointer"
                        >
                            <option value="">Tất cả loại lịch</option>
                            {Object.entries(CALENDAR_TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
                        </select>
                    </label>
                </div>
            </div>

            {/* Số liệu tháng */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Cuộc họp trong tháng" value={loading ? undefined : monthStats.total} loading={loading} icon={CalendarIcon} hint={`${monthStats.upcoming} cuộc sắp diễn ra`} />
                <StatCard label="Đang diễn ra" value={loading ? undefined : monthStats.live} loading={loading} icon={Radio} tone={monthStats.live ? 'violet' : 'neutral'} hint={monthStats.live ? 'Bấm cuộc họp để xem ra vào real-time' : 'Không có cuộc họp nào'} />
                <StatCard label="Đã tham dự" value={loading ? undefined : `${monthStats.attended}/${monthStats.checked}`} loading={loading} icon={UserCheck} tone="green" hint="Cuộc họp có điểm danh đã kết thúc" />
                <StatCard label="Điểm trừ tháng" value={loading ? undefined : monthStats.points} loading={loading} icon={Award} tone={monthStats.points < 0 ? 'red' : 'neutral'} hint={`${monthStats.violations} lần vi phạm (trễ / về sớm / vắng)`} />
            </div>

            {/* Chú thích loại lịch */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-blue">
                {Object.values(CALENDAR_TYPES).map((t) => (
                    <span key={t.label} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />{t.label}</span>
                ))}
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Đã hủy</span>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar Body (2/3 width) */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden flex flex-col">
                    {error && (
                        <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="text-sm font-semibold">{error}</span>
                            </div>
                            <button
                                onClick={fetchSchedule}
                                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded-lg transition-colors"
                            >
                                Thử lại
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-20 min-h-[400px]">
                            <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                            <p className="mt-3 text-slate-blue text-xs font-semibold">Đang tải lịch trình...</p>
                        </div>
                    ) : viewMode === 'month' ? (
                        /* Month Grid View */
                        <div className="p-4 flex-1">
                            {/* Days of week titles */}
                            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-blue uppercase mb-2">
                                <div>Th 2</div>
                                <div>Th 3</div>
                                <div>Th 4</div>
                                <div>Th 5</div>
                                <div>Th 6</div>
                                <div>Th 7</div>
                                <div>CN</div>
                            </div>

                            {/* Calendar Days cells */}
                            <div className="grid grid-cols-7 gap-1.5">
                                {getDaysInMonth(currentDate).map((dayCell, idx) => {
                                    const dayMeetings = getMeetingsForDay(dayCell.date);
                                    const isSelected = isSameDay(dayCell.date, selectedDate);
                                    const isToday = isSameDay(dayCell.date, new Date());

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => setSelectedDate(dayCell.date)}
                                            className={`min-h-[72px] p-2 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${isSelected
                                                ? 'border-action-blue bg-blue-50/20 shadow-inner'
                                                : 'border-platinum-tint/40 hover:border-platinum-tint'
                                                } ${!dayCell.isCurrentMonth ? 'opacity-40' : ''}`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className={`text-xs font-bold ${isToday
                                                    ? 'bg-action-blue text-white w-5 h-5 rounded-full flex items-center justify-center'
                                                    : isSelected
                                                        ? 'text-action-blue'
                                                        : 'text-midnight-indigo'
                                                    }`}>
                                                    {dayCell.date.getDate()}
                                                </span>
                                            </div>

                                            {/* Meeting dots/indicators */}
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {dayMeetings.slice(0, 3).map(m => (
                                                    <span
                                                        key={m.id}
                                                        className={`w-2 h-2 rounded-full ${m.status === 'cancelled' ? 'bg-red-500' : typeOf(m)?.dot || STATUS_CONFIG[m.status]?.dot || 'bg-slate-400'} ${m.status === 'in_progress' ? 'ring-2 ring-purple-300 animate-pulse' : ''}`}
                                                        title={m.title}
                                                    />
                                                ))}
                                                {dayMeetings.length > 3 && (
                                                    <span className="text-[9px] font-bold text-slate-blue">+{dayMeetings.length - 3}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Week Grid View with Time Slots */
                        <div className="overflow-x-auto flex-1">
                            <div className="min-w-[700px] divide-y divide-platinum-tint/60">
                                {/* Week Days Header Row */}
                                <div className="grid grid-cols-8 bg-cloud-mist/30 text-center py-3">
                                    <div className="text-[10px] font-bold text-slate-blue uppercase flex items-center justify-center">Giờ</div>
                                    {getDaysInWeek(currentDate).map((day, idx) => {
                                        const isSelected = isSameDay(day, selectedDate);
                                        const isToday = isSameDay(day, new Date());
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedDate(day)}
                                                className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer rounded-lg py-1 ${isSelected ? 'bg-blue-50/50 border border-blue-150' : ''
                                                    }`}
                                            >
                                                <span className="text-[9px] font-bold text-slate-blue uppercase">
                                                    {day.toLocaleDateString('vi-VN', { weekday: 'short' })}
                                                </span>
                                                <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-action-blue text-white' : 'text-midnight-indigo'
                                                    }`}>
                                                    {day.getDate()}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Hours & Slots Grid */}
                                <div className="max-h-[500px] overflow-y-auto divide-y divide-platinum-tint/40">
                                    {hours.map(hour => {
                                        const hourStr = `${String(hour).padStart(2, '0')}:00`;
                                        return (
                                            <div key={hour} className="grid grid-cols-8 min-h-[52px]">
                                                {/* Hour label */}
                                                <div className="text-[11px] font-bold text-slate-blue flex items-center justify-center border-r border-platinum-tint/40 bg-cloud-mist/10">
                                                    {hourStr}
                                                </div>

                                                {/* Week days columns */}
                                                {getDaysInWeek(currentDate).map((day, idx) => {
                                                    const dayMeetings = getMeetingsForDay(day);
                                                    // Find if there is a meeting that starts in this hour slot
                                                    const slotMeeting = dayMeetings.find(m => {
                                                        const mStart = new Date(m.startTime);
                                                        return mStart.getHours() === hour;
                                                    });

                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setSelectedDate(day)}
                                                            className="p-1 border-r border-platinum-tint/30 relative hover:bg-cloud-mist/10 transition-colors flex flex-col justify-center cursor-pointer"
                                                        >
                                                            {slotMeeting && (
                                                                <div
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedDate(day); openMeeting(slotMeeting.id, day); }}
                                                                    className={`rounded-lg p-1.5 text-[10px] font-semibold border leading-tight ${slotMeeting.status === 'cancelled'
                                                                        ? 'bg-red-50/80 text-red-700 border-red-200 line-through'
                                                                        : typeOf(slotMeeting)?.block
                                                                            || (slotMeeting.status === 'in_progress'
                                                                                ? 'bg-purple-50/80 text-purple-800 border-purple-200'
                                                                                : 'bg-blue-50/80 text-action-blue border-blue-200')
                                                                        } ${slotMeeting.status === 'in_progress' ? 'ring-2 ring-purple-300' : ''}`}
                                                                >
                                                                    <div className="truncate font-bold">{slotMeeting.title}</div>
                                                                    <div className="flex items-center gap-1 mt-0.5 text-[9px] opacity-80">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        <span className="truncate">{slotMeeting.room?.roomName}</span>
                                                                    </div>
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
                    )}
                </div>

                {/* Right Side: Selected Day Detailed Panel (1/3 width) */}
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm p-6 flex flex-col justify-between">
                    <div>
                        <div className="pb-4 border-b border-platinum-tint">
                            <h3 className="text-base font-extrabold text-midnight-indigo flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-action-blue" />
                                Lịch trình chi tiết
                            </h3>
                            <p className="text-xs text-slate-blue mt-1">
                                Ngày {selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </p>
                        </div>

                        <div className="mt-4 space-y-4 max-h-[450px] overflow-y-auto pr-1">
                            {selectedDayMeetings.length === 0 ? (
                                <div className="text-center py-12 text-slate-blue">
                                    <Info className="w-8 h-8 mx-auto text-platinum-tint mb-2" />
                                    <p className="text-xs font-medium italic">Không có cuộc họp nào được xếp lịch trong ngày này.</p>
                                </div>
                            ) : (
                                selectedDayMeetings.map(meet => {
                                    const StatusIcon = STATUS_CONFIG[meet.status]?.icon || Clock;
                                    const statusStyle = STATUS_CONFIG[meet.status] || { label: 'Không xác định', bg: 'bg-slate-50 text-slate-500 border-platinum-tint' };
                                    const startTimeStr = new Date(meet.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                    const endTimeStr = new Date(meet.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                                    return (
                                        <div
                                            key={meet.id}
                                            onClick={() => openMeeting(meet.id)}
                                            className="p-4 rounded-xl border border-platinum-tint/60 bg-cloud-mist/5 hover:shadow-md transition-all space-y-3 cursor-pointer hover:border-action-blue/30"
                                            style={typeOf(meet) ? { borderLeft: `4px solid ${typeOf(meet).color}` } : undefined}
                                        >
                                            {typeOf(meet) && (
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${typeOf(meet).chip}`}>{typeOf(meet).label}</span>
                                            )}
                                            <div className="flex items-start justify-between gap-3">
                                                <h4 className="font-bold text-midnight-indigo text-sm sm:text-base leading-snug">
                                                    {meet.title}
                                                </h4>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 flex items-center gap-1 ${statusStyle.bg}`}>
                                                    <StatusIcon className="w-3.5 h-3.5" />
                                                    {statusStyle.label}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-blue font-medium">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-slate-blue" />
                                                    <span>{startTimeStr} - {endTimeStr}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="w-3.5 h-3.5 text-slate-blue" />
                                                    <span className="truncate">{meet.room?.roomName || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5 text-slate-blue" />
                                                    <span className="truncate">Vai trò: {ROLE_LABEL[meet.myRole] || 'Người tham dự'}</span>
                                                </div>
                                                {meet.hostName && (
                                                    <div className="flex items-center gap-1.5 col-span-2">
                                                        <User className="w-3.5 h-3.5 text-slate-blue" />
                                                        <span className="truncate">Chủ trì: {meet.hostName}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {meet.myAttendance && meet.myAttendance.status !== 'upcoming' && (
                                                <div className="flex items-center gap-2 text-[11px]">
                                                    <UserCheck className="w-3.5 h-3.5 text-slate-blue" />
                                                    <span className={`px-2 py-0.5 rounded-full font-bold border ${ATTENDANCE_STATUS[meet.myAttendance.status]?.cls || ''}`}>
                                                        {ATTENDANCE_STATUS[meet.myAttendance.status]?.label}{meet.myAttendance.excused ? ' (có lý do)' : ''}
                                                    </span>
                                                    {meet.myAttendance.checkInAt && <span className="text-slate-blue">vào {new Date(meet.myAttendance.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                    {meet.myAttendance.points < 0 && <span className="font-bold text-red-600">{meet.myAttendance.points} điểm</span>}
                                                </div>
                                            )}

                                            {meet.room?.location && (
                                                <p className="text-xs text-slate-blue italic leading-relaxed pt-2 border-t border-platinum-tint/40 flex items-start gap-1">
                                                    <MapPin className="w-3 h-3 mt-0.5" />
                                                    {meet.room.location}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-platinum-tint mt-6 text-[10.5px] text-slate-blue font-medium leading-relaxed bg-cloud-mist/20 p-3 rounded-xl">
                        Mẹo: Chọn ngày trên lịch để xem các cuộc họp; bấm vào cuộc họp để xem chi tiết, điểm danh, log ra vào và báo cáo.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonalCalendar;
