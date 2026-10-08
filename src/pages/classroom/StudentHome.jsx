import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, CheckCircle2, Clock, UserCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getClassAttendanceSettings, getStudentAttendanceReport, mockClassrooms } from '../../service/classAttendanceService';

const attendanceChartColors = {
    onTime: '#059669',
    late: '#D97706',
    absent: '#DC2626'
};

const StudentHome = () => {
    const settings = getClassAttendanceSettings();
    const report = getStudentAttendanceReport({ mode: 'week' });
    const summary = report.summary || {};
    const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const attendanceChartData = [
        { name: 'Đúng giờ', value: summary.onTime || 0, color: attendanceChartColors.onTime },
        { name: 'Đi muộn', value: summary.late || 0, color: attendanceChartColors.late },
        { name: 'Vắng', value: summary.absent || 0, color: attendanceChartColors.absent }
    ];
    const hasAttendanceData = attendanceChartData.some(item => item.value > 0);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <BookOpen className="w-4 h-4" />
                    Trang chủ sinh viên
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Tổng quan học tập</h1>
                <p className="text-xs text-slate-blue mt-1">Hôm nay là {today}. Theo dõi nhanh lịch học và tình trạng chuyên cần trong tuần.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CalendarDays className="w-8 h-8 p-2 rounded-xl bg-blue-50 text-action-blue" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{mockClassrooms.length}</p>
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
                    <Clock className="w-8 h-8 p-2 rounded-xl bg-amber-50 text-amber-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{settings.classStartTime}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Giờ vào học chuẩn</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-action-blue" />
                        Lịch học gần nhất
                    </h2>
                    <div className="mt-4 space-y-3">
                        {mockClassrooms.map(klass => (
                            <div key={klass.id} className="rounded-xl border border-platinum-tint p-4">
                                <p className="text-sm font-bold text-midnight-indigo">{klass.subject}</p>
                                <p className="text-sm text-slate-blue mt-1">{klass.schedule} · {klass.room}</p>
                                <p className="text-xs text-steel-gray mt-1">Giảng viên: {klass.teacher}</p>
                            </div>
                        ))}
                    </div>
                    <Link to="/student/schedule" className="inline-flex mt-4 text-xs font-bold text-action-blue no-underline">Xem lịch học</Link>
                </div>

                <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-action-blue" />
                        Chuyên cần tuần này
                    </h2>
                    <p className="text-xs text-slate-blue mt-2">Bạn có {summary.totalSessions || 0} buổi học trong tuần, đã điểm danh {summary.attended || 0} buổi.</p>
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
                                    <p className="text-xs text-slate-blue mt-1">Tuần này chưa có buổi học.</p>
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
