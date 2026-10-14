import { useMemo, useState } from 'react';
import { CalendarDays, FileText, Film, Info, MapPin } from 'lucide-react';
import { mockClassrooms } from '../../service/classAttendanceService';

// MOCKUP — ghi hình & biên bản buổi học cho TEACHER.
// BE hiện chỉ ghi hình gắn với cuộc họp (recording_sessions.meeting_id NOT NULL), buổi học chưa có
// liên kết nên mọi buổi đều hiện "Chưa có ghi hình". Việc BE cần làm: xem docs/MOCK_CHO_BE.md.
const WEEKS_BACK = 6;

const formatDate = (d) => d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

// Các buổi đã dạy trong WEEKS_BACK tuần gần nhất, suy từ thứ trong tuần của lịch lớp.
const pastSessions = (klass) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = new Date(today);
    last.setDate(today.getDate() - ((today.getDay() - klass.scheduleWeekday + 7) % 7));
    return Array.from({ length: WEEKS_BACK }, (_, i) => {
        const d = new Date(last);
        d.setDate(last.getDate() - i * 7);
        return { no: WEEKS_BACK - i, date: d };
    });
};

const TeacherRecordings = () => {
    const [classId, setClassId] = useState(mockClassrooms[0]?.id);
    const klass = mockClassrooms.find(c => c.id === classId) || mockClassrooms[0];
    const sessions = useMemo(() => (klass ? pastSessions(klass) : []), [klass]);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <Film className="w-4 h-4" />
                    Ghi hình buổi học
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Ghi hình & biên bản buổi học</h1>
                <p className="text-xs text-slate-blue mt-1">Xem lại video và biên bản các buổi đã dạy theo từng lớp.</p>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <p>Tính năng đang hoàn thiện: hệ thống chưa ghi hình phòng học theo buổi học. Danh sách dưới đây là các buổi đã dạy; video và biên bản sẽ hiển thị khi được bật.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {mockClassrooms.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setClassId(c.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border ${c.id === klass?.id ? 'bg-action-blue text-white border-action-blue' : 'bg-white text-slate-blue border-platinum-tint hover:text-midnight-indigo'}`}
                    >
                        {c.code} · {c.subject}
                    </button>
                ))}
            </div>

            {klass && (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex flex-wrap gap-4 text-xs text-slate-blue">
                        <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-action-blue" />{klass.schedule}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-action-blue" />{klass.room}</span>
                    </div>
                    <div className="divide-y divide-platinum-tint">
                        {sessions.map(s => (
                            <div key={s.no} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Buổi {s.no}</p>
                                    <p className="text-xs text-slate-blue mt-1 capitalize">{formatDate(s.date)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold text-slate-blue">
                                        <Film className="w-3.5 h-3.5" /> Chưa có ghi hình
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold text-slate-blue">
                                        <FileText className="w-3.5 h-3.5" /> Chưa có biên bản
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherRecordings;
