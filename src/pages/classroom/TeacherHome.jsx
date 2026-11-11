import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, CheckCircle2, Clock, Users } from 'lucide-react';
import { fetchClassAttendanceClasses, fetchClassAttendanceSummary, fetchClassSessions } from '../../service/classAttendanceService';
import DashboardBanner from '../../components/common/DashboardBanner';

const toDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const EMPTY_SUMMARY = { total: 0, checkedIn: 0, late: 0, left: 0, missing: 0 };

/** Trang chủ GV: lớp thật (/classes), buổi dạy thật trong ngày (/sessions), số điểm danh thật (/summary). */
const TeacherHome = () => {
    const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
    const [classes, setClasses] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [summaries, setSummaries] = useState({});
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchClassAttendanceClasses()
            .then(data => { if (!cancelled) setClasses(Array.isArray(data) ? data : []); })
            .catch(error => { if (!cancelled) setLoadError(error?.message || 'Không tải được danh sách lớp.'); });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchClassSessions(selectedDate, selectedDate)
            .then(async data => {
                const daySessions = Array.isArray(data) ? data : [];
                const classIds = [...new Set(daySessions.map(session => session.classId))];
                const results = await Promise.all(classIds.map(classId => (
                    fetchClassAttendanceSummary(classId, selectedDate).catch(() => null)
                )));
                if (cancelled) return;
                setSessions(daySessions);
                setSummaries(Object.fromEntries(classIds.map((classId, index) => [classId, results[index] || EMPTY_SUMMARY])));
                setLoadError('');
            })
            .catch(error => {
                if (cancelled) return;
                setSessions([]);
                setSummaries({});
                setLoadError(error?.message || 'Không tải được lịch dạy.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => {
            cancelled = true;
        };
    }, [selectedDate]);

    const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const activeSessions = useMemo(() => sessions.filter(session => session.status !== 'cancelled'), [sessions]);
    const totalStudents = useMemo(() => classes.reduce((sum, klass) => sum + Number(klass.studentCount || 0), 0), [classes]);
    const checkedInToday = Object.values(summaries).reduce((sum, item) => sum + Number(item?.checkedIn || 0), 0);
    const firstStart = activeSessions[0]?.startTime || '—';

    return (
        <div className="space-y-5 animate-fade-in-up">
            <DashboardBanner roleName="Giảng viên" />
            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                    <BookOpen className="w-4 h-4" />
                    Trang chủ giảng viên
                </span>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Tổng quan lớp học</h1>
                <p className="text-xs text-slate-blue mt-1">Theo dõi nhanh lịch dạy, sĩ số và tình trạng điểm danh trong ngày.</p>
            </div>

            {loadError && (
                <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CalendarDays className="w-8 h-8 p-2 rounded-xl bg-blue-50 text-action-blue" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{activeSessions.length}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Buổi dạy trong ngày</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Users className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{totalStudents}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Tổng sĩ số {classes.length} lớp phụ trách</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <CheckCircle2 className="w-8 h-8 p-2 rounded-xl bg-emerald-50 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{checkedInToday}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Đã điểm danh trong ngày</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Clock className="w-8 h-8 p-2 rounded-xl bg-amber-50 text-amber-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{firstStart}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Giờ bắt đầu buổi đầu tiên</p>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo">Buổi dạy ngày {selectedDateLabel}</h2>
                        <p className="text-xs text-slate-blue mt-1">Chọn buổi để mở màn điểm danh bằng camera FaceID.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={event => event.target.value && setSelectedDate(event.target.value)}
                            aria-label="Lọc buổi dạy theo ngày"
                            className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        />
                        <Link to="/teacher/attendance" className="px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold no-underline">
                            Mở điểm danh
                        </Link>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {sessions.length === 0 ? (
                        <p className="lg:col-span-2 rounded-xl border border-dashed border-platinum-tint p-8 text-center text-sm text-slate-blue">
                            {loading ? 'Đang tải…' : 'Ngày này không có buổi dạy.'}
                        </p>
                    ) : sessions.map(session => {
                        const summary = summaries[session.classId] || EMPTY_SUMMARY;
                        const cancelled = session.status === 'cancelled';
                        return (
                            <Link
                                key={session.id}
                                to={`/teacher/attendance?classId=${encodeURIComponent(session.classId)}`}
                                className={`block rounded-xl border p-4 no-underline transition-colors ${cancelled ? 'border-red-100 bg-red-50/30 opacity-70' : 'border-platinum-tint hover:border-action-blue hover:bg-blue-50/30'}`}
                            >
                                <p className="text-sm font-bold text-midnight-indigo">{session.subjectCode} - {session.classCode}{cancelled ? ' (Đã hủy)' : ''}</p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-blue">
                                    <span><strong className="text-midnight-indigo">Môn học:</strong> {session.subject}</span>
                                    <span><strong className="text-midnight-indigo">Lớp HP:</strong> {session.classCode}</span>
                                    <span><strong className="text-midnight-indigo">Giảng viên:</strong> {session.teacher || 'Chưa có'}</span>
                                    <span><strong className="text-midnight-indigo">Học kỳ:</strong> {session.semester}</span>
                                    <span><strong className="text-midnight-indigo">Giờ học:</strong> {session.startTime} - {session.endTime}</span>
                                    <span><strong className="text-midnight-indigo">Phòng học:</strong> {session.room || 'Chưa có phòng'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-action-blue">Sĩ số {session.studentCount}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">Đã vào {summary.checkedIn}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Muộn {summary.late}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TeacherHome;
