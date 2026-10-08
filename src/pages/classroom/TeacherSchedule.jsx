import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { mockClassrooms } from '../../service/classAttendanceService';

const TeacherSchedule = () => {
    return (
        <div className="space-y-5 animate-fade-in-up">
            <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <CalendarDays className="w-4 h-4" />
                    Lịch dạy
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Lịch dạy của tôi</h1>
                <p className="text-xs text-slate-blue mt-1">Danh sách lớp học, phòng học và thời gian giảng dạy trong học kỳ hiện tại.</p>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Học kỳ HK1 2026-2027</h2>
                    <p className="text-xs text-slate-blue mt-1">Dữ liệu hiện dùng cho kiểm thử luồng điểm danh lớp học.</p>
                </div>
                <div className="divide-y divide-platinum-tint">
                    {mockClassrooms.map(klass => (
                        <div key={klass.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-midnight-indigo">{klass.subject}</p>
                                <p className="text-sm text-slate-blue mt-1">Mã lớp: <span className="font-bold text-midnight-indigo">{klass.code}</span></p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:min-w-[620px]">
                                <div className="rounded-xl border border-platinum-tint p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-action-blue" />
                                        Thời gian
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{klass.schedule}</p>
                                </div>
                                <div className="rounded-xl border border-platinum-tint p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-action-blue" />
                                        Phòng học
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{klass.room}</p>
                                </div>
                                <div className="rounded-xl border border-platinum-tint p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue flex items-center gap-2">
                                        <Users className="w-4 h-4 text-action-blue" />
                                        Sĩ số
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{klass.students.length} sinh viên</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TeacherSchedule;
