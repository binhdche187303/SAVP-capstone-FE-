import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Film, Info, MapPin } from 'lucide-react';
import { fetchClassSessions } from '../../service/classAttendanceService';

// Ghi hình & biên bản buổi học cho TEACHER — danh sách buổi lấy từ lịch thật (/class-attendance/sessions).
// BE hiện chỉ ghi hình gắn với cuộc họp (recording_sessions.meeting_id NOT NULL), buổi học chưa có
// liên kết nên mọi buổi đều hiện "Chưa có ghi hình". Việc BE cần làm: xem docs/MOCK_CHO_BE.md.
const DAYS_BACK = 60;

const toDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDate = dateKey => new Date(`${dateKey}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

const TeacherRecordings = () => {
    const [sessions, setSessions] = useState([]);
    const [classId, setClassId] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - DAYS_BACK);
        fetchClassSessions(toDateKey(from), toDateKey(today))
            .then(data => {
                if (cancelled) return;
                const now = Date.now();
                const past = (Array.isArray(data) ? data : [])
                    .filter(session => session.status !== 'cancelled' && new Date(session.startAt || `${session.date}T${session.startTime}`).getTime() <= now);
                setSessions(past);
                setLoadError('');
            })
            .catch(error => { if (!cancelled) setLoadError(error?.message || 'Không tải được danh sách buổi đã dạy.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => {
            cancelled = true;
        };
    }, []);

    const classes = useMemo(() => {
        const map = new Map();
        sessions.forEach(session => {
            if (!map.has(session.classId)) {
                map.set(session.classId, { id: session.classId, code: session.classCode, subjectCode: session.subjectCode, subject: session.subject });
            }
        });
        return [...map.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    }, [sessions]);

    const activeClassId = classes.some(item => item.id === classId) ? classId : classes[0]?.id;
    const klass = classes.find(item => item.id === activeClassId);
    const classSessions = useMemo(() => sessions
        .filter(session => session.classId === activeClassId)
        .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)), [sessions, activeClassId]);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <Film className="w-4 h-4" />
                    Ghi hình buổi học
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Ghi hình & biên bản buổi học</h1>
                <p className="text-xs text-slate-blue mt-1">Xem lại video và biên bản các buổi đã dạy trong {DAYS_BACK} ngày gần nhất.</p>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <p>Tính năng đang hoàn thiện: hệ thống chưa ghi hình phòng học theo buổi học. Danh sách dưới đây là các buổi đã dạy; video và biên bản sẽ hiển thị khi được bật.</p>
            </div>

            {loadError && (
                <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            {!loading && classes.length === 0 && !loadError && (
                <p className="rounded-2xl border border-dashed border-platinum-tint bg-white p-8 text-center text-sm text-slate-blue">
                    Chưa có buổi dạy nào trong {DAYS_BACK} ngày gần nhất.
                </p>
            )}
            {loading && <p className="text-sm text-slate-blue">Đang tải…</p>}

            <div className="flex flex-wrap gap-2">
                {classes.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setClassId(c.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border ${c.id === activeClassId ? 'bg-action-blue text-white border-action-blue' : 'bg-white text-slate-blue border-platinum-tint hover:text-midnight-indigo'}`}
                    >
                        {c.code} - {c.subject}
                    </button>
                ))}
            </div>

            {klass && (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 text-xs text-slate-blue">
                        <span className="font-bold text-midnight-indigo">{klass.subjectCode} - {klass.subject}</span> · {classSessions.length} buổi đã dạy
                    </div>
                    <div className="divide-y divide-platinum-tint">
                        {classSessions.map((s, index) => (
                            <div key={s.id} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Buổi {classSessions.length - index}</p>
                                    <p className="text-xs text-slate-blue mt-1 capitalize">{formatDate(s.date)}</p>
                                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-blue">
                                        <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-action-blue" />{s.startTime} - {s.endTime}</span>
                                        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-action-blue" />{s.room || 'Chưa có phòng'}</span>
                                    </div>
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
