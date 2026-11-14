import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { fetchClassAttendanceClasses, fetchClassSessions, fetchStudentAttendanceReport } from '../../service/classAttendanceService';
import DashboardBanner from '../../components/common/DashboardBanner';

const attendanceChartColors = {
    onTime: '#059669',
    late: '#D97706',
    absent: '#DC2626'
};

const SCHEDULES_PER_PAGE = 3;
const UPCOMING_DAYS = 14;

const toDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatSessionDay = dateKey => new Date(`${dateKey}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });

const StudentHome = () => {
    const [summary, setSummary] = useState({});
    const [classes, setClasses] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [schedulePage, setSchedulePage] = useState(1);

    const todayKey = toDateKey(new Date());

    useEffect(() => {
        let cancelled = false;
        const until = new Date();
        until.setDate(until.getDate() + UPCOMING_DAYS - 1);
        Promise.all([
            fetchStudentAttendanceReport({ mode: 'week', self: true }).catch(() => null),
            fetchClassAttendanceClasses(),
            fetchClassSessions(todayKey, toDateKey(until))
        ])
            .then(([report, apiClasses, apiSessions]) => {
                if (cancelled) return;
                setSummary(report?.summary || {});
                setClasses(Array.isArray(apiClasses) ? apiClasses : []);
                setSessions(Array.isArray(apiSessions) ? apiSessions : []);
                setLoadError('');
            })
            .catch(error => {
                if (!cancelled) setLoadError(error?.message || 'Không tải được dữ liệu học tập. Vui lòng thử lại.');
            });
        return () => {
            cancelled = true;
        };
    }, [todayKey]);

    const subjectCount = useMemo(() => new Set(classes.map(klass => klass.subjectCode).filter(Boolean)).size, [classes]);
    const upcomingSessions = useMemo(() => sessions.filter(session => session.status !== 'cancelled'), [sessions]);
    const todayClassCount = upcomingSessions.filter(session => session.date === todayKey).length;
    const schedulePageCount = Math.max(1, Math.ceil(upcomingSessions.length / SCHEDULES_PER_PAGE));
    const visibleSchedules = upcomingSessions.slice(
        (schedulePage - 1) * SCHEDULES_PER_PAGE,
        schedulePage * SCHEDULES_PER_PAGE
    );
    const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const attendanceChartData = [
        { name: 'Đúng giờ', value: summary.onTime || 0, color: attendanceChartColors.onTime },
        { name: 'Đi muộn', value: summary.late || 0, color: attendanceChartColors.late },
        { name: 'Vắng', value: summary.absent || 0, color: attendanceChartColors.absent }
    ];
    const hasAttendanceData = attendanceChartData.some(item => item.value > 0);

    useEffect(() => {
        setSchedulePage(currentPage => Math.min(currentPage, schedulePageCount));
    }, [schedulePageCount]);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <DashboardBanner roleName="Sinh viên" />
            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <BookOpen className="w-4 h-4" />
                    Trang chủ sinh viên
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Tổng quan học tập</h1>
                <p className="text-xs text-slate-blue mt-1">Hôm nay là {today}. Theo dõi nhanh lịch học và tình trạng chuyên cần trong tuần.</p>
            </div>

            {loadError && (
                <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CalendarDays className="w-8 h-8 p-2 rounded-xl bg-blue-50 text-action-blue" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{subjectCount}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Môn đang học</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <UserCheck className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{summary.attended || 0}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Đã điểm danh tuần này</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CheckCircle2 className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{summary.attendanceRate || 0}%</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Tỷ lệ chuyên cần</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CalendarDays className="w-8 h-8 p-2 rounded-xl bg-amber-50 text-amber-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{todayClassCount}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Buổi học hôm nay</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-action-blue" />
                        Lịch học sắp tới
                    </h2>
                    <div className="mt-4 space-y-3">
                        {visibleSchedules.length === 0 && (
                            <p className="rounded-xl border border-dashed border-platinum-tint p-6 text-center text-sm text-slate-blue">
                                Không có buổi học nào trong {UPCOMING_DAYS} ngày tới.
                            </p>
                        )}
                        {visibleSchedules.map(session => (
                            <div key={session.id} className="rounded-xl border border-platinum-tint p-4">
                                <p className="text-sm font-bold text-midnight-indigo">{session.subject || session.subjectCode}</p>
                                <p className="text-xs text-slate-blue mt-1">Mã môn học: {session.subjectCode} · Lớp HP: {session.classCode}</p>
                                <p className="text-sm text-slate-blue mt-1">{formatSessionDay(session.date)} {session.startTime} - {session.endTime} · {session.room || 'Chưa có phòng'}</p>
                                <p className="text-xs text-steel-gray mt-1">Giảng viên: {session.teacher || 'Chưa có giảng viên'}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setSchedulePage(currentPage => Math.max(1, currentPage - 1))}
                                disabled={schedulePage === 1}
                                aria-label="Lịch trước"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-platinum-tint text-slate-blue hover:text-action-blue hover:border-action-blue disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-medium text-slate-blue min-w-[58px] text-center">
                                Trang {schedulePage}/{schedulePageCount}
                            </span>
                            <button
                                type="button"
                                onClick={() => setSchedulePage(currentPage => Math.min(schedulePageCount, currentPage + 1))}
                                disabled={schedulePage === schedulePageCount}
                                aria-label="Lịch tiếp theo"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-platinum-tint text-slate-blue hover:text-action-blue hover:border-action-blue disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <Link to="/student/schedule" className="text-xs font-bold text-action-blue no-underline">Xem lịch học</Link>
                    </div>
                </div>

                <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-action-blue" />
                        Chuyên cần tuần này
                    </h2>
                    <p className="text-xs text-slate-blue mt-2">Bạn có {summary.totalSessions || 0} buổi đã ghi nhận điểm danh trong tuần, có mặt {summary.attended || 0} buổi.</p>
                    <div className="mt-4 rounded-xl bg-cloud-mist p-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-center">
                        <div className="h-48 relative">
                            {hasAttendanceData ? (
                                <>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={attendanceChartData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={54}
                                                outerRadius={78}
                                                paddingAngle={3}
                                                stroke="#fff"
                                                strokeWidth={4}
                                            >
                                                {attendanceChartData.map(item => (
                                                    <Cell key={item.name} fill={item.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value, name) => [`${value} buổi`, name]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-2xl font-bold text-midnight-indigo">{summary.attendanceRate || 0}%</span>
                                        <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Chuyên cần</span>
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <UserCheck className="w-10 h-10 text-platinum-tint" />
                                    <p className="text-sm font-bold text-midnight-indigo mt-2">Chưa có dữ liệu</p>
                                    <p className="text-xs text-slate-blue mt-1">Tuần này chưa có buổi nào được điểm danh.</p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-3">
                            {attendanceChartData.map(item => (
                                <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 border border-platinum-tint">
                                    <div className="flex items-center gap-3">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-xs font-bold text-midnight-indigo">{item.name}</span>
                                    </div>
                                    <span className="text-base font-bold" style={{ color: item.color }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Link to="/student/attendance" className="inline-flex mt-4 text-xs font-bold text-action-blue no-underline">Xem thống kê chuyên cần</Link>
                </div>
            </div>
        </div>
    );
};

export default StudentHome;
