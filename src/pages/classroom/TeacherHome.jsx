import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, CheckCircle2, Clock, Users } from 'lucide-react';
import { getClassAttendanceSettings, getClassAttendanceSummary, mockClassrooms } from '../../service/classAttendanceService';

const TeacherHome = () => {
    const settings = getClassAttendanceSettings();
    const summaries = mockClassrooms.map(klass => ({
        ...klass,
        summary: getClassAttendanceSummary(klass.id)
    }));
    const totals = summaries.reduce((acc, item) => ({
        students: acc.students + item.students.length,
        checkedIn: acc.checkedIn + item.summary.checkedIn,
        late: acc.late + item.summary.late,
        left: acc.left + item.summary.left
    }), { students: 0, checkedIn: 0, late: 0, left: 0 });

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <BookOpen className="w-4 h-4" />
                    Trang chủ giảng viên
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Tổng quan lớp học</h1>
                <p className="text-xs text-slate-blue mt-1">Theo dõi nhanh lịch dạy, sĩ số và tình trạng điểm danh trong ngày.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CalendarDays className="w-8 h-8 p-2 rounded-xl bg-blue-50 text-action-blue" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{mockClassrooms.length}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Lớp đang dạy</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Users className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{totals.students}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Sinh viên phụ trách</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CheckCircle2 className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{totals.checkedIn}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Đã điểm danh hôm nay</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Clock className="w-8 h-8 p-2 rounded-xl bg-amber-50 text-amber-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{settings.classStartTime}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Giờ vào học chuẩn</p>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo">Lớp học hôm nay</h2>
                        <p className="text-xs text-slate-blue mt-1">Chọn lớp để mở màn điểm danh bằng camera FaceID.</p>
                    </div>
                    <Link to="/teacher/attendance" className="px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold no-underline">
                        Mở điểm danh
                    </Link>
                </div>
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {summaries.map(klass => (
                        <div key={klass.id} className="rounded-xl border border-platinum-tint p-4">
                            <p className="text-sm font-bold text-midnight-indigo">{klass.subject}</p>
                            <p className="text-sm text-slate-blue mt-1">{klass.schedule} · {klass.room}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                                <span className="px-2.5 py-1 rounded-full bg-blue-50 text-action-blue">Sĩ số {klass.summary.total}</span>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">Đã vào {klass.summary.checkedIn}</span>
                                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Muộn {klass.summary.late}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TeacherHome;
