import { AlertCircle, ArrowRight, Award, BarChart2, BookOpen, Calendar, Car, CheckCircle, Clock, LogIn, PlusCircle, ShieldAlert, TrendingUp, User, Video } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

import DashboardBanner from '../../components/common/DashboardBanner';
import { getEmployeeSummary } from '../../service/campusService';
import { getMySchedule, getMyAttendanceStats } from '../../service/employeeServices';

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

const EmployeeHomePage = () => {
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

    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'analytics'

    // Overview states
    const [upcomingMeetings, setUpcomingMeetings] = useState([]);

    // Campus summary (CDB-RS-001: GET /campus-dashboard/employee-summary)
    const [campusSummary, setCampusSummary] = useState(null);
    const [campusSummaryLoading, setCampusSummaryLoading] = useState(true);

    // Analytics tab state
    const [analyticsPreset, setAnalyticsPreset] = useState('month');
    const [analyticsData, setAnalyticsData] = useState(null);
    // Bắt đầu ở trạng thái loading để tab thống kê không nhấp nháy khoảng trắng trước khi fetch xong.
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState(null);



    // Load campus dashboard summary (gate access, vehicle status, meetings today)
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
                        .filter(m => new Date(m.startTime) >= now)
                        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                        .slice(0, 5);

                    setUpcomingMeetings(upcoming);
                }
            })
            .catch(err => {
                console.error("Failed to fetch upcoming meetings", err);
            });

        return () => { isMounted = false; };
    }, []);

    // Lazy-load analytics khi chuyển sang tab analytics
    useEffect(() => {
        if (activeTab !== 'analytics') return;
        let isMounted = true;
        setAnalyticsLoading(true);
        setAnalyticsError(null);
        getMyAttendanceStats({ preset: analyticsPreset })
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
    }, [activeTab, analyticsPreset]);

    // Derived analytics values
    const rateDiff = useMemo(() => {
        const avg = analyticsData?.departmentAvg?.onTimeRate;
        if (avg == null || analyticsData?.onTimeRate == null) return null;
        return Math.round((analyticsData.onTimeRate - avg) * 10) / 10;
    }, [analyticsData]);

    const analyticsPieData = useMemo(() => {
        if (!analyticsData) return [];
        return [
            { name: 'Đúng giờ', value: analyticsData.onTimeCount ?? 0 },
            { name: 'Đi muộn', value: analyticsData.lateCount ?? 0 },
            { name: 'Vắng mặt', value: analyticsData.absentCount ?? 0 },
        ].filter(d => d.value > 0);
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
                <DashboardBanner roleName="Employee" />
            </motion.div>

            {/* Custom Tab Selector */}
            <motion.div variants={itemVariants} className="flex justify-between items-center border-b border-platinum-tint pb-px">
                <div className="flex gap-1 bg-white p-1.5 rounded-xl border border-platinum-tint/80 shadow-sm">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'overview'
                            ? 'bg-action-blue text-white shadow-sm'
                            : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50'
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Lịch họp & Lối tắt
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'analytics'
                            ? 'bg-action-blue text-white shadow-sm'
                            : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50'
                            }`}
                    >
                        <BarChart2 className="w-4 h-4" />
                        Thống kê cá nhân
                    </button>
                </div>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card: Họp trong ngày */}
                            <div className="bg-white px-4 py-4 rounded-2xl border border-platinum-tint shadow-sm flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center shrink-0">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wide leading-none">Họp trong ngày</p>
                                    <p className="text-2xl font-extrabold text-midnight-indigo leading-tight mt-1">
                                        {campusSummaryLoading ? '—' : (campusSummary?.meetingsToday ?? 0)}
                                    </p>
                                    <p className="text-[11px] text-slate-blue leading-none mt-0.5">cuộc họp</p>
                                </div>
                            </div>

                            {/* Card: Lượt vào cổng */}
                            <div className="bg-white px-4 py-4 rounded-2xl border border-platinum-tint shadow-sm flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <LogIn className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wide leading-none">Vào cổng hôm nay</p>
                                    <p className="text-2xl font-extrabold text-midnight-indigo leading-tight mt-1">
                                        {campusSummaryLoading ? '—' : (() => {
                                            const g = campusSummary?.gateAccessToday;
                                            if (g == null) return 0;
                                            if (typeof g === 'number') return g;
                                            if (Array.isArray(g)) return g.length;
                                            if (typeof g === 'object') return g.count ?? g.total ?? g.value ?? 1;
                                            return 0;
                                        })()}
                                    </p>
                                    <p className="text-[11px] text-slate-blue leading-none mt-0.5">lượt</p>
                                </div>
                            </div>

                            {/* Card: Phương tiện */}
                            <div className="bg-white px-4 py-4 rounded-2xl border border-platinum-tint shadow-sm flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                    <Car className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wide leading-none">Phương tiện</p>
                                    {campusSummaryLoading ? (
                                        <p className="text-2xl font-extrabold text-midnight-indigo leading-tight mt-1">—</p>
                                    ) : campusSummary?.vehicleStatus ? (
                                        <>
                                            <p className="text-base font-extrabold text-midnight-indigo font-mono leading-tight mt-1 truncate">
                                                {campusSummary.vehicleStatus.plateNumber}
                                            </p>
                                            <span className={`mt-1 inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                campusSummary.vehicleStatus.status === 'active'
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {campusSummary.vehicleStatus.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm font-bold text-steel-gray leading-tight mt-1">Chưa đăng ký</p>
                                            <button
                                                type="button"
                                                onClick={() => navigate('/employee/my-vehicles')}
                                                className="mt-0.5 text-[11px] font-bold text-action-blue hover:underline leading-none"
                                            >
                                                Đăng ký ngay →
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick Shortcuts */}
                        <div className="space-y-4">
                            <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                Lối tắt chức năng nhanh
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                                    <div className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
                                        Tạo lịch họp ngay <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>

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
                                    <div className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
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
                                    <div className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
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
                                    <div className="flex items-center gap-1 text-xs font-bold mt-auto group-hover:gap-2 transition-all">
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
                                    <span 
                                        onClick={() => navigate('/employee/schedule')}
                                        className="text-xs font-bold text-action-blue hover:underline cursor-pointer"
                                    >
                                        Xem tất cả
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {upcomingMeetings.length > 0 ? (
                                        upcomingMeetings.map(meet => (
                                            <div
                                                key={meet.id}
                                                onClick={() => navigate(`/employee/meeting/${meet.id}`)}
                                                className="p-4 rounded-xl border border-platinum-tint/60 hover:bg-cloud-mist/10 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:border-action-blue/30"
                                            >
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-action-blue">
                                                            {meet.room}
                                                        </span>
                                                        {meet.status === 'pending_approval' && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                                                Chờ duyệt
                                                            </span>
                                                        )}
                                                        {meet.status === 'draft' && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                                                Bản nháp
                                                            </span>
                                                        )}
                                                        {meet.status === 'in_progress' && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                                                Đang diễn ra
                                                            </span>
                                                        )}
                                                        {meet.recordingEnabled && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 flex items-center gap-1">
                                                                <Video className="w-3 h-3" /> Ghi hình
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-bold text-midnight-indigo text-sm sm:text-base">
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
                                        ))
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
                                <div className="pt-4 border-t border-white/10 mt-6 text-[10px] text-indigo-300 font-mono">
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
                        {/* Preset filter */}
                        <div className="flex items-center gap-2">
                            {[
                                { key: 'week', label: 'Tuần này' },
                                { key: 'month', label: 'Tháng này' },
                                { key: 'quarter', label: 'Quý này' },
                            ].map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setAnalyticsPreset(opt.key)}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                        analyticsPreset === opt.key
                                            ? 'bg-action-blue text-white shadow-sm'
                                            : 'bg-white border border-platinum-tint text-slate-blue hover:border-action-blue/50'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {analyticsLoading ? (
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm animate-pulse">
                                            <div className="h-2.5 w-24 bg-slate-100 rounded mb-3" />
                                            <div className="h-7 w-16 bg-slate-100 rounded" />
                                        </div>
                                    ))}
                                </div>
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
                                {/* Ngưỡng “đúng giờ” của trang này (graceMinutes) khác với báo cáo cấp
                                    phòng ban, nên phải nói rõ để người dùng không tưởng số liệu bị sai. */}
                                {analyticsData.graceMinutes != null && (
                                    <p className="text-[11px] text-slate-blue bg-cloud-mist/60 border border-platinum-tint rounded-xl px-3 py-2">
                                        Cách tính: được xem là <b>đúng giờ</b> nếu điểm danh muộn không quá{' '}
                                        <b>{analyticsData.graceMinutes} phút</b> so với giờ bắt đầu cuộc họp.
                                        {analyticsData.period && (
                                            <> · Kỳ thống kê: {analyticsData.period.from} → {analyticsData.period.to}</>
                                        )}
                                    </p>
                                )}

                                {/* Row 1 — 4 KPI cards */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-1">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Tỷ lệ đúng giờ</p>
                                        <p className="text-2xl font-black text-midnight-indigo">{analyticsData.onTimeRate ?? 0}%</p>
                                        {rateDiff !== null && (
                                            <p className={`text-[10px] font-semibold ${rateDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {rateDiff >= 0 ? '▲' : '▼'} {Math.abs(rateDiff)}% so với trung bình phòng ban
                                            </p>
                                        )}
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-1">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Tổng lượt bắt buộc</p>
                                        <p className="text-2xl font-black text-midnight-indigo">{analyticsData.totalRequired ?? 0}</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-1">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Lần đi muộn</p>
                                        <p className={`text-2xl font-black ${(analyticsData.lateCount ?? 0) > 0 ? 'text-amber-500' : 'text-midnight-indigo'}`}>
                                            {analyticsData.lateCount ?? 0}
                                        </p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-1">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Lần vắng mặt</p>
                                        <p className={`text-2xl font-black ${(analyticsData.absentCount ?? 0) > 0 ? 'text-red-500' : 'text-midnight-indigo'}`}>
                                            {analyticsData.absentCount ?? 0}
                                        </p>
                                    </div>
                                </div>

                                {/* Row 2 — Pie + Recent late */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    {/* Pie chart */}
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                                        <h3 className="text-sm font-bold text-midnight-indigo">Phân bố trạng thái chuyên cần</h3>
                                        {analyticsPieData.length === 0 ? (
                                            <p className="text-xs text-slate-blue italic text-center py-8">Không có dữ liệu</p>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={220}>
                                                <PieChart>
                                                    <Pie data={analyticsPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                                                        {analyticsPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>

                                    {/* 5 lần đi muộn gần nhất */}
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                                        <h3 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-amber-500" />
                                            5 lần đi muộn gần nhất
                                        </h3>
                                        {!analyticsData.recentLate?.length ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                                                <p className="text-xs text-slate-blue">Không có lần đi muộn nào trong kỳ này</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-platinum-tint">
                                                {analyticsData.recentLate.slice(0, 5).map((item, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-midnight-indigo truncate">{item.meetingTitle}</p>
                                                            <p className="text-[10px] text-slate-blue font-mono mt-0.5">
                                                                {toVNTime(item.scheduledTime)} → {toVNTime(item.checkinTime)}
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 whitespace-nowrap">
                                                            +{item.lateMinutes} phút
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Row 3 — Trend bar chart (full width) */}
                                {analyticsData.trend?.length > 0 && (
                                    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                                        <h3 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-action-blue" />
                                            Xu hướng chuyên cần theo kỳ
                                        </h3>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <BarChart data={analyticsData.trend} margin={{ left: -15, right: 8, top: 4, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="period"
                                                    tickFormatter={(v) => { try { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; } catch { return v; } }}
                                                    tick={{ fontSize: 9, fill: '#64748b' }}
                                                />
                                                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} allowDecimals={false} />
                                                <Tooltip
                                                    labelFormatter={(l) => { try { return new Date(l).toLocaleDateString('vi-VN'); } catch { return l; } }}
                                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                                <Bar dataKey="onTimeCount" name="Đúng giờ" stackId="a" fill="#22c55e" />
                                                <Bar dataKey="lateCount" name="Đi muộn" stackId="a" fill="#f59e0b" />
                                                <Bar dataKey="absentCount" name="Vắng mặt" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[360px] bg-white rounded-2xl border border-platinum-tint shadow-sm p-10 text-center">
                                <BarChart2 className="w-10 h-10 text-slate-blue/30 mb-3" />
                                <h3 className="text-sm font-bold text-midnight-indigo mb-1">Chưa có dữ liệu thống kê</h3>
                                <p className="text-xs text-slate-blue max-w-xs leading-relaxed">Chọn một kỳ khác hoặc quay lại sau khi bạn đã tham dự cuộc họp.</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default EmployeeHomePage;
