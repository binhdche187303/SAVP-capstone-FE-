import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, Filter, TrendingUp, UserCheck, XCircle } from 'lucide-react';
import { getClassAttendanceSettings, getStudentAttendanceReport } from '../../service/classAttendanceService';

const RANGE_OPTIONS = [
    { value: 'day', label: 'Ngày' },
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'year', label: 'Năm' }
];

const statusClass = {
    on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    late: 'bg-amber-50 text-amber-700 border-amber-200',
    left: 'bg-blue-50 text-action-blue border-blue-200',
    absent: 'bg-red-50 text-red-700 border-red-200'
};

const formatPeriod = (mode, period) => {
    const start = new Date(`${period.start}T00:00:00`);
    const end = new Date(`${period.end}T00:00:00`);
    if (mode === 'day') {
        return start.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (mode === 'month') {
        return start.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    }
    if (mode === 'year') {
        return `Năm ${start.getFullYear()}`;
    }
    return `${start.toLocaleDateString('vi-VN')} - ${end.toLocaleDateString('vi-VN')}`;
};

const StatCard = ({ icon: Icon, label, value, helper, tone = 'blue' }) => {
    const colors = {
        blue: 'bg-blue-50 text-action-blue',
        green: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        red: 'bg-red-50 text-red-600'
    };

    return (
        <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colors[tone] || colors.blue}`}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-midnight-indigo mt-3">{value}</p>
            <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">{label}</p>
            {helper && <p className="text-xs text-steel-gray mt-1">{helper}</p>}
        </div>
    );
};

const StudentClassDashboard = () => {
    const settings = getClassAttendanceSettings();
    const [rangeMode, setRangeMode] = useState('week');
    const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [report, setReport] = useState(() => ({ period: { start: anchorDate, end: anchorDate }, entries: [], summary: {} }));
    const studentId = useMemo(() => {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user.employeeCode || user.employee_code || 'SV001';
        } catch {
            return 'SV001';
        }
    }, []);

    const refresh = useCallback(() => {
        setReport(getStudentAttendanceReport({ studentId, mode: rangeMode, anchorDate }));
    }, [anchorDate, rangeMode, studentId]);

    useEffect(() => {
        refresh();
        const handler = () => refresh();
        window.addEventListener('class-attendance-updated', handler);
        return () => window.removeEventListener('class-attendance-updated', handler);
    }, [refresh]);

    const { summary = {}, entries = [], period } = report;

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                        <UserCheck className="w-4 h-4" />
                        Sinh viên
                    </span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Thống kê chuyên cần của tôi</h1>
                    <p className="text-xs text-slate-blue mt-1">Theo dõi điểm danh theo ngày, tuần, tháng hoặc năm.</p>
                </div>

                <div className="bg-white border border-platinum-tint rounded-2xl p-2 shadow-sm flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-cloud-mist rounded-xl p-1">
                        {RANGE_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setRangeMode(option.value)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${rangeMode === option.value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-platinum-tint text-xs font-semibold text-midnight-indigo bg-white">
                        <Filter className="w-4 h-4 text-slate-blue" />
                        <input
                            type="date"
                            value={anchorDate}
                            onChange={(event) => setAnchorDate(event.target.value)}
                            className="bg-transparent outline-none"
                        />
                    </label>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">Khoảng thống kê</p>
                    <p className="text-base font-bold text-midnight-indigo mt-1">{formatPeriod(rangeMode, period)}</p>
                </div>
                <div className="text-xs text-slate-blue">
                    Giờ vào học chuẩn: <span className="font-bold text-midnight-indigo">{settings.classStartTime}</span>
                    <span className="mx-2 text-platinum-tint">|</span>
                    Ngưỡng đi muộn: <span className="font-bold text-midnight-indigo">{settings.lateThresholdMinutes} phút</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <StatCard icon={CalendarDays} label="Buổi học" value={summary.totalSessions || 0} helper="Theo lịch lớp" />
                <StatCard icon={UserCheck} label="Đã điểm danh" value={summary.attended || 0} helper={`${summary.attendanceRate || 0}%`} tone="green" />
                <StatCard icon={CheckCircle2} label="Đúng giờ" value={summary.onTime || 0} tone="green" />
                <StatCard icon={Clock} label="Đi muộn" value={summary.late || 0} tone="amber" />
                <StatCard icon={XCircle} label="Vắng" value={summary.absent || 0} tone="red" />
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-action-blue" />
                        Chi tiết chuyên cần
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Dữ liệu hiển thị theo bộ lọc đang chọn.</p>
                </div>

                {entries.length === 0 ? (
                    <div className="py-16 text-center">
                        <CalendarDays className="w-10 h-10 text-platinum-tint mx-auto" />
                        <p className="mt-3 text-sm font-bold text-midnight-indigo">Không có buổi học trong khoảng này</p>
                        <p className="text-xs text-slate-blue mt-1">Hãy chọn khoảng thời gian khác để xem thống kê.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                                <tr>
                                    <th className="text-left px-5 py-4">Ngày</th>
                                    <th className="text-left px-5 py-4">Môn học</th>
                                    <th className="text-left px-5 py-4">Giờ vào</th>
                                    <th className="text-left px-5 py-4">Giờ ra</th>
                                    <th className="text-left px-5 py-4">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(item => (
                                    <tr key={item.id} className="border-t border-platinum-tint/70">
                                        <td className="px-5 py-4 font-bold text-midnight-indigo">{item.dateText}</td>
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-midnight-indigo">{item.className}</p>
                                            <p className="text-xs text-slate-blue">{item.schedule} · {item.room}</p>
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-midnight-indigo">{item.checkInText}</td>
                                        <td className="px-5 py-4 font-semibold text-midnight-indigo">{item.checkOutText}</td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[item.status] || statusClass.absent}`}>
                                                {item.statusLabel}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentClassDashboard;
