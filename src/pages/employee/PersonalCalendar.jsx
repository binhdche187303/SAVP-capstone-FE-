import { countBy, useProbeCounts } from '../../hooks/useFilterCounts';
import { matchesFilter, filterValues } from '../../utils/filterSelection';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import TimeRangeButtons from '../../components/common/TimeRangeButtons';
import './PersonalCalendarFilters.css';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import StatisticGrid from '../../components/common/StatisticGrid';
import { AlertTriangle, Award, Calendar as CalendarIcon, CheckCircle, Clock, Filter, Info, MapPin, PlusCircle, Radio, User, UserCheck, XCircle, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { MEETING_BOOKING_ENABLED, MEETING_CALENDAR_MOCK_ENABLED } from '../../config/featureFlags';
import StatCard from '../../components/common/StatCard';
import { ATTENDANCE_STATUS, CALENDAR_TYPES, getMockMySchedule } from '../../mocks/meetingCalendarMock';
import { getMySchedule } from '../../service/employeeServices';
import { isForbiddenError } from '../../utils/permissionUtils';
import { calendarViewRange, dateKey } from '../../utils/calendarRange';
import { toCalendarTypeKey } from '../../utils/calendarType';
import MockMyMeetingAttendance from './MockMyMeetingAttendance';
import MyMeetingAttendance from './MyMeetingAttendance';

const STATUS_CONFIG = {
    draft: { label: 'Bản nháp', bg: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: Clock },
    pending_approval: { label: 'Chờ duyệt', bg: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500', icon: Clock },
    scheduled: { label: 'Đã lên lịch', bg: 'bg-blue-50 text-action-blue border-blue-150', dot: 'bg-blue-500', icon: Clock },
    in_progress: { label: 'Đang diễn ra', bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: CheckCircle },
    completed: { label: 'Đã kết thúc', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle },
    cancelled: { label: 'Đã hủy', bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500', icon: XCircle }
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

// Dùng chung với tab "Lịch sử tham dự" — giữ export cũ cho test/import hiện có.
export { calendarViewRange };

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
    const scheduleVersion = useRef(0);
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
        room: { roomName: dto.room?.roomName || dto.roomName || 'Chưa cung cấp', location: dto.room?.location || dto.roomLocation || dto.location },
        startTime: dto.startTime || dto.start_time,
        endTime: dto.endTime || dto.end_time,
        myRole: dto.userRole || dto.user_role,
        status: (dto.status || (dto.isCurrent ? 'in_progress' : dto.isPast ? 'completed' : 'scheduled')).toLowerCase(),
        calendarType: toCalendarTypeKey(dto.calendarType || dto.calendar_type),
        hostName: dto.hostName || dto.host?.fullName,
        attendanceEnabled: dto.attendanceEnabled,
        myAttendance: dto.myAttendance || null,
    });

    const fetchSchedule = useCallback(async () => {
        const version = ++scheduleVersion.current;
        setLoading(true);
        try {
            const range = calendarViewRange(currentDate, viewMode);

            let dataList = [];
            let isSuccess = false;

            const res = await fetchMySchedule({
                from: range.from,
                to: range.to,
                view: viewMode,
                status: filterValues(statusFilter).length ? filterValues(statusFilter) : ['scheduled', 'in_progress', 'completed', 'pending_approval', ...(MEETING_CALENDAR_MOCK_ENABLED ? ['cancelled'] : [])]
            });

            if (version !== scheduleVersion.current) return;
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
            if (version !== scheduleVersion.current) return;
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
            if (version === scheduleVersion.current) setLoading(false);
        }
    }, [currentDate, viewMode, statusFilter, navigate]);

    useEffect(() => {
        fetchSchedule();
        return () => { scheduleVersion.current += 1; };
    }, [fetchSchedule]);

    useEffect(() => {
        const timer = setInterval(() => setNowTs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const effectiveMeetings = useMemo(
        () => meetings
            .filter((meeting) => matchesFilter(typeFilter, meeting.calendarType))
            .map((meeting) => ({
                ...meeting,
                rawStatus: meeting.rawStatus || meeting.status,
                status: getEffectiveStatus(meeting, nowTs),
            })),
        [meetings, nowTs, typeFilter],
    );

    // Số đếm cạnh lựa chọn các ô lọc.
    // - Loại lịch: đếm tại chỗ trên các cuộc họp đã tải (đã áp trạng thái).
    // - Trạng thái: BE lọc theo trạng thái nên đếm qua API (cùng khoảng ngày), rồi áp loại lịch tại chỗ.
    const typeCounts = useMemo(() => countBy(meetings, (meeting) => meeting.calendarType), [meetings]);
    const allScheduleStatuses = ['scheduled', 'in_progress', 'completed', 'pending_approval', ...(MEETING_CALENDAR_MOCK_ENABLED ? ['cancelled'] : [])];
    const scheduleRange = calendarViewRange(currentDate, viewMode);
    const statusCounts = useProbeCounts(
        ['pending_approval', 'scheduled', 'completed', ...(MEETING_CALENDAR_MOCK_ENABLED ? ['cancelled'] : [])],
        async (value) => {
            const res = await fetchMySchedule({ from: scheduleRange.from, to: scheduleRange.to, view: viewMode, status: value ? [value] : allScheduleStatuses });
            const items = res?.data?.items || res?.data || [];
            return Array.isArray(items)
                ? items.filter((item) => matchesFilter(typeFilter, toCalendarTypeKey(item.calendarType || item.calendar_type))).length
                : undefined;
        },
        `${scheduleRange.from}|${scheduleRange.to}|${viewMode}|${JSON.stringify(typeFilter)}`,
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

    const selectedDayMeetings = getMeetingsForDay(selectedDate);

    // Week time slots hours definition (07:00 to 18:00) — UEL có giao ban 7h30
    const hours = Array.from({ length: 12 }, (_, i) => 7 + i);

    const visibleDays = viewMode === 'day' ? [currentDate] : getDaysInWeek(currentDate);
    const periodName = viewMode === 'day' ? 'ngày' : viewMode === 'week' ? 'tuần' : 'tháng';
    const tabBar = (
        <div className="flex items-center bg-white p-1 rounded-xl border border-platinum-tint shadow-sm w-fit">
            {[['calendar', 'Lịch'], ['attendance', 'Lịch sử tham dự']].map(([key, label]) => (
                <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === key ? 'bg-action-blue text-white shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}>
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

            <FilterBar forceStandard variant="card" className="personal-calendar-filters">
                <div className="personal-calendar-filter-main">
                    <FilterField label="Trạng thái cuộc họp">
                        <FilterMultiSelect counts={statusCounts} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                            <option value="">Tất cả trạng thái</option>
                            <option value="pending_approval">Chờ duyệt</option>
                            <option value="scheduled">Đã lên lịch</option>
                            <option value="completed">Đã kết thúc</option>
                            {MEETING_CALENDAR_MOCK_ENABLED && <option value="cancelled">Đã hủy</option>}
                        </FilterMultiSelect>
                    </FilterField>
                    <FilterField label="Loại lịch">
                        <FilterMultiSelect counts={typeCounts} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="">Tất cả loại lịch</option>
                            {Object.entries(CALENDAR_TYPES).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}
                        </FilterMultiSelect>
                    </FilterField>
                </div>
                <div className="personal-calendar-filter-time">
                    <TimeRangeButtons label="Khoảng thời gian"
                        value={viewMode === 'day' ? (isSameDay(currentDate, new Date()) ? 'today' : '') : viewMode}
                        onChange={mode => {
                            if (mode === 'today') { const today = new Date(); setViewMode('day'); setCurrentDate(today); setSelectedDate(today); }
                            else setViewMode(mode);
                        }} options={[["today", "Hôm nay"], ["week", "Tuần"], ["month", "Tháng"]]} />
                    <FilterField label="Ngày xem lịch">
                        <input type="date" value={dateKey(currentDate)} onChange={event => {
                            if (!event.target.value) return;
                            const date = new Date(`${event.target.value}T00:00:00`);
                            setCurrentDate(date); setSelectedDate(date);
                        }} />
                    </FilterField>
                    <button type="button" data-filter-action className="personal-calendar-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                        onClick={() => { const today = new Date(); setStatusFilter(''); setTypeFilter(''); setViewMode('month'); setCurrentDate(today); setSelectedDate(today); }}>
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
            </FilterBar>

            {/* Số liệu tháng */}
            <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label={`Cuộc họp trong ${periodName}`} value={loading ? undefined : monthStats.total} loading={loading} icon={CalendarIcon} hint={`${monthStats.upcoming} cuộc sắp diễn ra`} />
                <StatCard label="Đang diễn ra" value={loading ? undefined : monthStats.live} loading={loading} icon={Radio} tone={monthStats.live ? 'violet' : 'neutral'} hint={monthStats.live ? 'Bấm cuộc họp để xem ra vào real-time' : 'Không có cuộc họp nào'} />
                <StatCard label="Đã tham dự" value={loading ? undefined : `${monthStats.attended}/${monthStats.checked}`} loading={loading} icon={UserCheck} tone="green" hint="Cuộc họp có điểm danh đã kết thúc" />
                <StatCard label={`Điểm trừ trong ${periodName}`} value={loading ? undefined : monthStats.points} loading={loading} icon={Award} tone={monthStats.points < 0 ? 'red' : 'neutral'} hint={`${monthStats.violations} lần vi phạm (trễ / về sớm / vắng)`} />
            </StatisticGrid>

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
                            <Loader2 className="w-10 h-10 text-action-blue animate-spin" />
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
                            <div className={`${viewMode === 'week' ? 'min-w-[700px]' : 'min-w-0'} divide-y divide-platinum-tint/60`}>
                                {/* Week Days Header Row */}
                                <div className={`grid ${viewMode === 'day' ? 'grid-cols-[64px_1fr]' : 'grid-cols-8'} bg-cloud-mist/30 text-center py-3`}>
                                    <div className="text-[10px] font-bold text-slate-blue uppercase flex items-center justify-center">Giờ</div>
                                    {visibleDays.map((day, idx) => {
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
                                            <div key={hour} className={`grid ${viewMode === 'day' ? 'grid-cols-[64px_1fr]' : 'grid-cols-8'} min-h-[52px]`}>
                                                {/* Hour label */}
                                                <div className="text-[11px] font-bold text-slate-blue flex items-center justify-center border-r border-platinum-tint/40 bg-cloud-mist/10">
                                                    {hourStr}
                                                </div>

                                                {/* Week days columns */}
                                                {visibleDays.map((day, idx) => {
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

                        <PaginatedCollection items={selectedDayMeetings} itemLabel="cuộc họp">
{(camaiPageItems, camaiStartIndex) => (
<div className="mt-4 space-y-4 max-h-[450px] overflow-y-auto pr-1">
                            {selectedDayMeetings.length === 0 ? (
                                <div className="text-center py-12 text-slate-blue">
                                    <Info className="w-8 h-8 mx-auto text-platinum-tint mb-2" />
                                    <p className="text-xs font-medium italic">Không có cuộc họp nào được xếp lịch trong ngày này.</p>
                                </div>
                            ) : (
                                camaiPageItems.map((camaiRecord, camaiIndex) => (meet => {
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
                                                    <span className="truncate">{meet.room?.roomName || 'Chưa cung cấp'}</span>
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
                                })(camaiRecord, camaiStartIndex + camaiIndex, (selectedDayMeetings)))
                            )}
                        </div>
)}
</PaginatedCollection>
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
