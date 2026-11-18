import PersonalAttendancePoints, { usePersonalAttendancePoints } from './PersonalAttendancePoints';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import CalendarRangePresets, { calendarRange } from '../../components/common/CalendarRangePresets';
import './PersonalStatistics.css';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard from '../../components/common/StatisticCard';
import { AlertCircle, ArrowRight, BarChart2, Award, Calendar, CheckCircle, ClipboardCheck, Clock, PlusCircle, ShieldAlert, TrendingUp, User, Video } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Label } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

import DashboardBanner from '../../components/common/DashboardBanner';
import { getEmployeeSummary } from '../../service/campusService';
import { getPendingMeetingRequests } from '../../service/managerServices';
import { getCurrentUser } from '../../service/authService';
import { getMySchedule, getMyAttendanceStats } from '../../service/employeeServices';
import { MEETING_BOOKING_ENABLED } from '../../config/featureFlags';

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

const toVNTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }); }
    catch { return '—'; }
};

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
};

const EmployeeHomePage = ({ view = 'overview' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [successToast, setSuccessToast] = useState('');
    useEffect(() => {
        if (location.state?.successMessage) {
            setSuccessToast(location.state.successMessage);
            // Clear the state so it doesn't show again on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    useEffect(() => {
        if (successToast) {
            const timer = setTimeout(() => {
                setSuccessToast('');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successToast]);

    const activeTab = view;

    // Overview states
    const [upcomingMeetings, setUpcomingMeetings] = useState([]);
    const [upcomingCount, setUpcomingCount] = useState(null);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    // Văn thư đơn vị (quyền meeting_request.read cấp theo cờ is_unit_clerk): đếm lịch đơn vị đang chờ duyệt.
    const [pendingApprovals, setPendingApprovals] = useState(null); // null = không phải văn thư
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const me = await getCurrentUser();
                if (!alive || !me?.data?.permissions?.includes('meeting_request.read')) return;
                const res = await getPendingMeetingRequests({ approvalStatus: 'pending' });
                if (alive) setPendingApprovals(res?.success ? (res.meta?.total ?? (res.data || []).length) : 0);
            } catch {
                // bỏ qua: không hiện thẻ
            }
        })();
        return () => { alive = false; };
    }, []);
    const [scheduleError, setScheduleError] = useState(false);

    // Campus summary (CDB-RS-001: GET /campus-dashboard/employee-summary)
    const [campusSummary, setCampusSummary] = useState(null);
    const [campusSummaryLoading, setCampusSummaryLoading] = useState(true);

    // Analytics tab state
    const [analyticsRange, setAnalyticsRange] = useState(() => calendarRange('month'));
    const analyticsRangeError = !analyticsRange.from || !analyticsRange.to
        ? 'Vui lòng chọn đủ từ ngày và đến ngày.'
        : analyticsRange.from > analyticsRange.to ? 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.' : null;
    const [analyticsData, setAnalyticsData] = useState(null);
    // Bắt đầu ở trạng thái loading để tab thống kê không nhấp nháy khoảng trắng trước khi fetch xong.
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState(null);
    const pointsReport = usePersonalAttendancePoints(analyticsRange.from, analyticsRange.to, activeTab === 'analytics' && !analyticsRangeError);



    // Load the number of meetings today.
    useEffect(() => {
        let isMounted = true;
        setCampusSummaryLoading(true);
        getEmployeeSummary()
            .then((res) => {
                if (isMounted && res?.success) {
                    setCampusSummary(res.data);
                }
            })
            .catch(() => {
                // Giữ campusSummary = null, UI tự hiện fallback/empty-state bên dưới
            })
            .finally(() => {
                if (isMounted) setCampusSummaryLoading(false);
            });
        return () => { isMounted = false; };
    }, []);

    // Load Overview Data
    useEffect(() => {
        let isMounted = true;
        const now = new Date();

        // Tính ngày 7 ngày sau (dùng setDate chuẩn hơn cộng ms)
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + 7);

        // Hàm format thành ISO 8601 Full Timestamp (Local Timezone)
        const formatFullTimestamp = (d, setEndOfDay = false) => {
            const targetDate = new Date(d);

            if (setEndOfDay) {
                targetDate.setHours(23, 59, 59, 0);
            } else {
                targetDate.setHours(0, 0, 0, 0);
            }

            const pad = (n) => String(n).padStart(2, '0');

            const year = targetDate.getFullYear();
            const month = pad(targetDate.getMonth() + 1);
            const day = pad(targetDate.getDate());
            const hours = pad(targetDate.getHours());
            const minutes = pad(targetDate.getMinutes());
            const seconds = pad(targetDate.getSeconds());

            // Lấy offset múi giờ thiết bị (ví dụ: UTC+7 sẽ ra '+07:00')
            const tzo = -targetDate.getTimezoneOffset();
            const diffSign = tzo >= 0 ? '+' : '-';
            const tzHours = pad(Math.floor(Math.abs(tzo) / 60));
            const tzMinutes = pad(Math.abs(tzo) % 60);
            const timezone = `${diffSign}${tzHours}:${tzMinutes}`;

            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timezone}`;
        };

        // Gọi hàm getMySchedule
        getMySchedule({
            from: formatFullTimestamp(now, false),      // "2026-08-03T00:00:00+07:00"
            to: formatFullTimestamp(nextWeek, true),     // "2026-08-10T23:59:59+07:00"
            view: 'month',
            status: ['scheduled', 'in_progress']
        })
            .then(res => {
                if (isMounted && res?.success && res.data) {
                    const dataList = Array.isArray(res.data) ? res.data : (res.data.items || []);
                    const mapped = dataList.map(m => {
                        const hostName = m.host?.fullName || m.host?.full_name || m.hostName || m.host_name || 'Người tổ chức';
                        return {
                            id: m.meetingId || m.id || m._id,
                            title: m.title || m.meetingTitle || 'Không có tiêu đề',
                            room: m.room?.roomName || m.room?.name || 'Phòng trực tuyến',
                            host: hostName,
                            startTime: m.startTime || m.start_time,
                            endTime: m.endTime || m.end_time,
                            recordingEnabled: m.recordingEnabled || m.is_recording_enabled || false,
                            consentStatus: m.myConsentStatus || m.consentStatus || null,
                            status: m.status?.toLowerCase() || 'scheduled'
                        };
                    });

                    const now = new Date();
                    const upcoming = mapped
                        .filter(m => new Date(m.startTime) >= now && new Date(m.startTime) <= nextWeek)
                        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

                    setUpcomingCount(upcoming.length);
                    setUpcomingMeetings(upcoming.slice(0, 5));
                } else if (isMounted) {
                    setScheduleError(true);
                }
            })
            .catch(err => {
                console.error("Failed to fetch upcoming meetings", err);
                if (isMounted) setScheduleError(true);
            })
            .finally(() => {
                if (isMounted) setScheduleLoading(false);
            });

        return () => { isMounted = false; };
    }, []);

    // Lazy-load analytics khi chuyển sang tab analytics
    useEffect(() => {
        if (activeTab !== 'analytics' || analyticsRangeError) return;
        let isMounted = true;
        setAnalyticsLoading(true);
        setAnalyticsError(null);
        getMyAttendanceStats({ preset: 'custom', from: analyticsRange.from, to: analyticsRange.to })
            .then(res => {
                if (!isMounted) return;
                if (res?.success && res.data) {
                    // BE trả KPI lồng trong `summary` (xem PersonalStatsResponseDto),
                    // và tên field lệch với FE cho recentLate — chuẩn hóa về flat shape
                    // mà phần render bên dưới đang dùng.
                    const d = res.data;
                    const summary = d.summary || {};
                    setAnalyticsData({
                        ...d,
                        onTimeRate: summary.onTimeRate ?? 0,
                        totalRequired: summary.totalRequired ?? 0,
                        onTimeCount: summary.onTimeCount ?? 0,
                        lateCount: summary.lateCount ?? 0,
                        absentCount: summary.absentCount ?? 0,
                        recentLate: (d.recentLate || []).map(item => ({
                            meetingTitle: item.meetingTitle,
                            scheduledTime: item.scheduledStartTime,
                            checkinTime: item.checkInTime,
                            lateMinutes: item.lateMinutes,
                        })),
                    });
                } else {
                    setAnalyticsData(null);
                    setAnalyticsError(res?.message || 'Không thể tải dữ liệu thống kê.');
                }
            })
            .catch(err => {
                if (!isMounted) return;
                setAnalyticsData(null);
                setAnalyticsError(err?.error?.message || err?.message || 'Lỗi kết nối khi tải thống kê.');
            })
            .finally(() => { if (isMounted) setAnalyticsLoading(false); });
        return () => { isMounted = false; };
    }, [activeTab, analyticsRange.from, analyticsRange.to, analyticsRangeError]);

    // Derived analytics values
    const analyticsPieData = useMemo(() => {
        if (!analyticsData) return [];
        return [
            { name: 'Đúng giờ', value: analyticsData.onTimeCount ?? 0, color: PIE_COLORS[0] },
            { name: 'Đi muộn', value: analyticsData.lateCount ?? 0, color: PIE_COLORS[1] },
            { name: 'Vắng mặt', value: analyticsData.absentCount ?? 0, color: PIE_COLORS[2] },
        ];
    }, [analyticsData]);

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-8"
        >
            {/* Success Toast */}
            <AnimatePresence>
                {successToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -50, scale: 0.9, x: '-50%' }}
                        animate={{ opacity: 1, y: 16, scale: 1, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, scale: 0.9, x: '-50%' }}
                        className="fixed top-4 left-1/2 z-50 px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xl flex items-center gap-3 text-emerald-800 text-sm font-semibold"
                    >
                        <CheckCircle className="w-5 h-5 text-emerald-600 animate-bounce" />
                        <span>{successToast}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Banner Greeting */}
            <motion.div variants={itemVariants}>
                {activeTab === 'analytics' ? <div className="personal-stats-header">
                    <h1 data-page-title className="text-midnight-indigo">Thống kê cá nhân</h1>
                    <p data-page-description className="text-slate-blue">Theo dõi việc tham dự, đi muộn và vắng mặt trong các cuộc họp bắt buộc của bạn.</p>
                </div> : <DashboardBanner roleName="Employee" compact titleAs="h1" />}
            </motion.div>

            <AnimatePresence mode="wait">
                {activeTab === 'overview' ? (
                    <motion.div
                        key="overview-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-8"
                    >
                        {/* Quick Status Bar */}
                        <StatisticGrid columns={pendingApprovals === null ? 3 : 4} className={`grid grid-cols-1 gap-4 ${pendingApprovals === null ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
                            {/* Card: Lịch chờ duyệt — chỉ văn thư đơn vị */}
                            {pendingApprovals !== null && (
                                <StatisticCard label="Lịch chờ duyệt" value={pendingApprovals} icon={ClipboardCheck}
                                    helper={pendingApprovals > 0 ? 'lịch họp đơn vị đang chờ bạn duyệt' : 'Không có lịch nào đang chờ'}
                                    to="/employee/meeting-approvals" />
                            )}
                            {/* Card: Họp trong ngày */}
                            <StatisticCard label="Họp trong ngày" value={campusSummaryLoading ? '—' : (campusSummary?.meetingsToday ?? 0)} icon={Clock} helper="cuộc họp" />

                            <StatisticCard
                                label="Họp trong 7 ngày tới"
                                value={scheduleError ? '—' : upcomingCount}
                                loading={scheduleLoading}
                                icon={Calendar}
                                helper={scheduleError ? 'Chưa tải được lịch họp' : 'cuộc họp sắp bắt đầu'}
                                to="/employee/schedule"
                            />
                            <StatisticCard
                                label="Cuộc họp kế tiếp"
                                compactValue
                                loading={scheduleLoading}
                                icon={Clock}
                                value={scheduleError ? 'Chưa tải được lịch họp' : upcomingMeetings[0]?.title || 'Chưa có lịch họp'}
                                helper={upcomingMeetings[0]
                                    ? `${new Date(upcomingMeetings[0].startTime).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · ${toVNTime(upcomingMeetings[0].startTime)} · ${upcomingMeetings[0].room}`
                                    : 'Trong 7 ngày tới'}
                                to={upcomingMeetings[0]?.id ? `/employee/meeting/${upcomingMeetings[0].id}` : '/employee/schedule'}
                            />
                        </StatisticGrid>

                        {/* Quick Shortcuts */}
                        <div className="space-y-4">
                            <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                Lối tắt chức năng nhanh
                            </h2>
                            <div className={`grid grid-cols-1 sm:grid-cols-2 ${MEETING_BOOKING_ENABLED ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
                                {MEETING_BOOKING_ENABLED && (
                                <div
                                    onClick={() => navigate('/employee/book')}
                                    className="group bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-2xl text-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                            <PlusCircle className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base mb-1">Đăng ký họp</h3>
                                    <p className="text-xs text-blue-100 mb-4">Lên lịch cuộc họp mới và đặt phòng họp theo kế hoạch.</p>
                                    <div data-ui-text="primary" className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
                                        Tạo lịch họp ngay <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                                )}

                                <div
                                    onClick={() => navigate('/employee/schedule')}
                                    className="group bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-2xl text-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                            <Calendar className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base mb-1">Lịch họp cá nhân</h3>
                                    <p className="text-xs text-indigo-100 mb-4">Theo dõi và quản lý lịch trình các cuộc họp cá nhân của bạn.</p>
                                    <div data-ui-text="primary" className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
                                        Xem lịch trình <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>

                                <div
                                    onClick={() => navigate('/employee/face-register')}
                                    className="group bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl text-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                            <User className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base mb-1">Đăng ký khuôn mặt</h3>
                                    <p className="text-xs text-emerald-100 mb-4">Cập nhật dữ liệu khuôn mặt phục vụ điểm danh thông minh bằng Camera AI.</p>
                                    <div data-ui-text="primary" className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
                                        Đăng ký ngay <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>

                                <div
                                    onClick={() => navigate('/employee/recordings')}
                                    className="group bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                            <Video className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-base mb-1">Bản ghi & Tài liệu</h3>
                                    <p className="text-xs text-amber-100 mb-4">Tra cứu video ghi âm, ghi hình và tài liệu tóm tắt cuộc họp.</p>
                                    <div data-ui-text="primary" className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
                                        Xem bản ghi <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Upcoming Meetings & Consents */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-base font-bold text-midnight-indigo">Cuộc họp sắp tới</h2>
                                        <p className="text-xs text-slate-blue">Các lịch họp được lên lịch sắp tới của bạn</p>
                                    </div>
                                    <span data-ui-text="primary"
                                        onClick={() => navigate('/employee/schedule')}
                                        className="text-xs font-bold text-action-blue hover:underline cursor-pointer"
                                    >
                                        Xem tất cả
                                    </span>
                                </div>

                                <PaginatedCollection items={upcomingMeetings} itemLabel="cuộc họp">
{(camaiPageItems, camaiStartIndex) => (
<div className="space-y-4">
                                    {upcomingMeetings.length > 0 ? (
                                        camaiPageItems.map((camaiRecord, camaiIndex) => (meet => (
                                            <div
                                                key={meet.id}
                                                onClick={() => navigate(`/employee/meeting/${meet.id}`)}
                                                className="p-4 rounded-xl border border-platinum-tint/60 hover:bg-cloud-mist/10 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:border-action-blue/30"
                                            >
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span data-ui-text="badge" className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-action-blue">
                                                            {meet.room}
                                                        </span>
                                                        {meet.status === 'pending_approval' && (
                                                            <span data-ui-text="badge" className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                                                Chờ duyệt
                                                            </span>
                                                        )}
                                                        {meet.status === 'draft' && (
                                                            <span data-ui-text="badge" className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                                                Bản nháp
                                                            </span>
                                                        )}
                                                        {meet.status === 'in_progress' && (
                                                            <span data-ui-text="badge" className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                                                Đang diễn ra
                                                            </span>
                                                        )}
                                                        {meet.recordingEnabled && (
                                                            <span data-ui-text="badge" className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 flex items-center gap-1">
                                                                <Video className="w-3 h-3" /> Ghi hình
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 data-ui-text="primary" className="font-bold text-midnight-indigo text-sm sm:text-base">
                                                        {meet.title}
                                                    </h4>
                                                    <div className="flex items-center gap-4 text-xs text-slate-blue font-medium">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {new Date(meet.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(meet.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ({new Date(meet.startTime).toLocaleDateString('vi-VN')})
                                                        </span>
                                                        <span>Chủ trì: <strong>{meet.host}</strong></span>
                                                    </div>
                                                </div>
                                                {/* Nút Consent ghi hình đã ẩn tạm: FE chưa có API/bảng lưu trạng thái
                                                    consent theo participant ở BE, bấm chỉ set local state rồi mất khi
                                                    reload. Bật lại khi có endpoint thật. */}
                                            </div>
                                        ))(camaiRecord, camaiStartIndex + camaiIndex, (upcomingMeetings)))
                                    ) : (
                                        <div className="py-12 flex flex-col items-center justify-center text-center bg-cloud-mist/30 rounded-xl border border-dashed border-outline-gray/60">
                                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                                                <Calendar className="w-8 h-8 text-action-blue/50" />
                                            </div>
                                            <h4 className="text-sm font-extrabold text-midnight-indigo mb-1">Không có cuộc họp nào</h4>
                                            <p className="text-xs text-slate-blue max-w-xs leading-relaxed">
                                                Tuyệt vời! Bạn không có lịch họp nào sắp tới. Hãy dành thời gian này để tập trung hoàn thành các công việc quan trọng nhé.
                                            </p>
                                        </div>
                                    )}
                                </div>
)}
</PaginatedCollection>
                            </div>

                            <div className="bg-gradient-to-br from-indigo-900 to-purple-950 p-6 rounded-2xl text-white shadow-sm flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-base mb-2 flex items-center gap-2">
                                        <ShieldAlert className="w-5 h-5 text-amber-400" />
                                        Chính sách quyền riêng tư (PDPA)
                                    </h3>
                                    <p className="text-xs text-indigo-200 leading-relaxed mb-4">
                                        Hệ thống VISMA IVA cam kết bảo mật thông tin cá nhân của người dùng. Mọi video cuộc họp (Recording) sẽ chỉ được kích hoạt ghi hình khi có sự đồng ý (Consent) của tất cả thành viên bắt buộc tham dự.
                                    </p>
                                    <ul className="text-xs text-indigo-200 space-y-2 list-disc list-inside">
                                        <li>Face data gốc KHÔNG được lưu trên hệ thống backend VISMA IVA.</li>
                                        <li>Lịch sử điểm danh được mã hóa và lưu trữ vì mục đích thống kê.</li>
                                        <li>Bản ghi hình cuộc họp được tự động xóa sau 90 ngày.</li>
                                    </ul>
                                </div>
                                <div data-ui-text="secondary" className="pt-4 border-t border-white/10 mt-6 text-[10px] text-indigo-300 font-mono">
                                    Quy định bảo vệ dữ liệu cá nhân VN áp dụng
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="analytics-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-5"
                    >
                        <FilterBar variant="card" className="personal-stats-filters">
                            <CalendarRangePresets from={analyticsRange.from} to={analyticsRange.to} onChange={setAnalyticsRange} />
                            <FilterField label="Từ ngày"><input type="date" value={analyticsRange.from} max={analyticsRange.to || undefined}
                                onChange={e => setAnalyticsRange(prev => ({ ...prev, from: e.target.value }))} /></FilterField>
                            <FilterField label="Đến ngày"><input type="date" value={analyticsRange.to} min={analyticsRange.from || undefined}
                                onChange={e => setAnalyticsRange(prev => ({ ...prev, to: e.target.value }))} /></FilterField>
                        </FilterBar>
                        {analyticsRangeError && <p role="alert" className="text-sm text-red-600">{analyticsRangeError}</p>}

                        {!analyticsRangeError && <div className="space-y-4">
                            <div className="personal-stats-section-heading">
                                <h2>Tổng quan tham dự</h2>
                                <p data-ui-text="secondary">Số liệu trong khoảng thời gian đang chọn.</p>
                            </div>
                            <StatisticGrid columns={4}>
                                <StatisticCard label="Cuộc họp đã tham gia" icon={Calendar} loading={analyticsLoading}
                                    value={analyticsData ? analyticsData.onTimeCount + analyticsData.lateCount : '—'}
                                    helper={analyticsData ? `Trên ${analyticsData.totalRequired} cuộc họp bắt buộc` : 'Chưa tải được dữ liệu tham dự'} />
                                <StatisticCard label="Tổng điểm chuyên cần" icon={Award} loading={pointsReport.loading}
                                    value={pointsReport.data?.summary?.totalPoints ?? '—'}
                                    tone={pointsReport.data?.summary?.totalPoints < 0 ? 'danger' : 'default'}
                                    helper={pointsReport.error ? 'Chưa tải được điểm' : 'Theo quy định chuyên cần cuộc họp'} />
                                <StatisticCard label="Lần đi muộn" icon={Clock} loading={analyticsLoading}
                                    value={analyticsData?.lateCount ?? '—'} tone="warning" />
                                <StatisticCard label="Lần vắng mặt" icon={User} loading={analyticsLoading}
                                    value={analyticsData?.absentCount ?? '—'} tone="danger" />
                            </StatisticGrid>
                        </div>}

                        {analyticsRangeError ? null : analyticsLoading ? (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    <div className="bg-white rounded-2xl border border-platinum-tint h-64 animate-pulse" />
                                    <div className="bg-white rounded-2xl border border-platinum-tint h-64 animate-pulse" />
                                </div>
                                <div className="bg-white rounded-2xl border border-platinum-tint h-56 animate-pulse" />
                            </div>
                        ) : analyticsError ? (
                            <div className="flex flex-col items-center justify-center min-h-[360px] bg-white rounded-2xl border border-platinum-tint shadow-sm p-10 text-center">
                                <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                                <h3 className="text-sm font-bold text-midnight-indigo mb-1">Không thể tải thống kê</h3>
                                <p className="text-xs text-slate-blue max-w-xs leading-relaxed mb-5">{analyticsError}</p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/employee/recordings')}
                                    className="px-5 py-2.5 bg-action-blue text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
                                >
                                    <Video className="w-4 h-4" />
                                    Xem bản ghi cuộc họp
                                </button>
                            </div>
                        ) : analyticsData?.totalRequired === 0 ? (
                            <div className="flex flex-col items-center justify-center min-h-[360px] bg-white rounded-2xl border border-platinum-tint shadow-sm p-10 text-center">
                                <BarChart2 className="w-10 h-10 text-slate-blue/30 mb-3" />
                                <h3 className="text-sm font-bold text-midnight-indigo mb-1">Chưa có dữ liệu trong kỳ này</h3>
                                <p className="text-xs text-slate-blue max-w-xs leading-relaxed">Bạn chưa có cuộc họp bắt buộc nào trong kỳ được chọn.</p>
                            </div>
                        ) : analyticsData ? (
                            <div className="space-y-5">
                                {analyticsData.graceMinutes != null && (
                                    <p data-ui-text="secondary" className="personal-stats-method">
                                        Tỷ lệ đúng giờ tính theo thời gian điểm danh, cho phép muộn tối đa {analyticsData.graceMinutes} phút.
                                        Điểm chuyên cần bên dưới được tính theo quy định và kết quả điểm danh đã ghi nhận.
                                    </p>
                                )}
                                <div className="personal-stats-charts">
                                    <section className="personal-stats-chart">
                                        <h3>Kết quả tham dự của bạn</h3>
                                        <p data-ui-text="secondary">Số lượt đúng giờ, đi muộn và vắng mặt trong khoảng đã chọn.</p>
                                        <ResponsiveContainer width="100%" height={220} minWidth={0} debounce={100}>
                                            <PieChart>
                                                <Pie isAnimationActive={false} data={analyticsPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85}
                                                    paddingAngle={analyticsPieData.filter(item => item.value > 0).length > 1 ? 2 : 0} dataKey="value" stroke="none">
                                                    {analyticsPieData.map(item => <Cell key={item.name} fill={item.color} />)}
                                                    <Label position="center" value={`${analyticsData.totalRequired} lượt họp`} style={{ fill: '#0B3558', fontSize: 16, fontWeight: 600 }} />
                                                </Pie>
                                                <Tooltip formatter={(value, name) => [`${value} lượt`, name]} contentStyle={{ fontSize: 14, borderRadius: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="personal-stats-legend">
                                            {analyticsPieData.map(item => <div key={item.name}>
                                                <span><i style={{ background: item.color }} />{item.name}</span>
                                                <strong>{item.value} lượt · {analyticsData.totalRequired ? Math.round(item.value / analyticsData.totalRequired * 100) : 0}%</strong>
                                            </div>)}
                                        </div>
                                    </section>
                                {/* Weekly attendance within the selected range */}
                                {analyticsData.trend?.length > 0 ? (
                                    <section className="personal-stats-chart">
                                        <h3 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-action-blue" />
                                            Chuyên cần của bạn theo tuần
                                        </h3>
                                        <p data-ui-text="secondary">Mỗi cột là một tuần, chỉ tính các cuộc họp trong khoảng đã chọn.</p>
                                        <ResponsiveContainer width="100%" height={280} minWidth={0} debounce={100}>
                                            <BarChart data={analyticsData.trend} margin={{ left: 0, right: 16, top: 16, bottom: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="period"
                                                    tickFormatter={(v) => { try { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; } catch { return v; } }}
                                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                                />
                                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} label={{ value: 'Lượt họp', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }} />
                                                <Tooltip formatter={(value, name) => [`${value} lượt`, name]}
                                                    labelFormatter={(l) => { try { return `Tuần bắt đầu ${new Date(l).toLocaleDateString('vi-VN')}`; } catch { return l; } }}
                                                    contentStyle={{ fontSize: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                                <Bar isAnimationActive={false} dataKey="onTimeCount" name="Đúng giờ" stackId="a" fill="#22c55e" />
                                                <Bar isAnimationActive={false} dataKey="lateCount" name="Đi muộn" stackId="a" fill="#f59e0b" />
                                                <Bar isAnimationActive={false} dataKey="absentCount" name="Vắng mặt" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </section>
                                ) : <section className="personal-stats-chart"><h3>Chuyên cần của bạn theo tuần</h3><p data-ui-text="body">Chưa có dữ liệu theo tuần trong khoảng đã chọn.</p></section>}
                                </div>

                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[360px] bg-white rounded-2xl border border-platinum-tint shadow-sm p-10 text-center">
                                <BarChart2 className="w-10 h-10 text-slate-blue/30 mb-3" />
                                <h3 className="text-sm font-bold text-midnight-indigo mb-1">Chưa có dữ liệu thống kê</h3>
                                <p className="text-xs text-slate-blue max-w-xs leading-relaxed">Chọn một kỳ khác hoặc quay lại sau khi bạn đã tham dự cuộc họp.</p>
                            </div>
                        )}
                        {!analyticsRangeError && <PersonalAttendancePoints from={analyticsRange.from} to={analyticsRange.to} report={pointsReport} />}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default EmployeeHomePage;
