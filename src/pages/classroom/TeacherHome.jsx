import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Users } from 'lucide-react';
import { fetchClassAttendanceClasses, fetchClassAttendanceSummary, fetchClassSessions } from '../../service/classAttendanceService';
import DashboardBanner from '../../components/common/DashboardBanner';
import SharedStatCard from '../../components/common/StatCard';

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
            <h1 className="sr-only">Trang chủ giảng viên</h1>
            <DashboardBanner roleName="Giảng viên" compact />

            {loadError && (
                <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SharedStatCard icon={CalendarDays} label="Buổi dạy trong ngày" value={activeSessions.length} tone="blue" />
                <SharedStatCard icon={Users} label="Sĩ số phụ trách" value={totalStudents} hint={`SV · ${classes.length} lớp`} tone="violet" />
                <SharedStatCard icon={CheckCircle2} label="Đã điểm danh trong ngày" value={checkedInToday} tone="green" />
                <SharedStatCard icon={Clock} label="Giờ bắt đầu buổi đầu tiên" value={firstStart} tone="amber" />
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo">Buổi dạy ngày {selectedDateLabel}</h2>
                        <p className="text-xs text-slate-blue mt-1">Chọn buổi để mở màn điểm danh bằng camera FaceID.</p>
                    </div>
                    <input
                            type="date"
                            value={selectedDate}
                            onChange={event => event.target.value && setSelectedDate(event.target.value)}
                            aria-label="Lọc buổi dạy theo ngày"
                            className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                        />
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sessions.length === 0 ? (
                        <p className="col-span-full rounded-xl border border-dashed border-platinum-tint p-8 text-center text-sm text-slate-blue">
                            {loading ? 'Đang tải…' : 'Ngày này không có buổi dạy.'}
                        </p>
                    ) : sessions.map(session => {
                        const summary = summaries[session.classId] || EMPTY_SUMMARY;
                        const cancelled = session.status === 'cancelled';
                        return (
                            <div
                                key={session.id}
                                className={`flex flex-col rounded-xl border p-4 ${cancelled ? 'border-red-100 bg-red-50/30 opacity-70' : 'border-platinum-tint'}`}
                            >
                                <p className="text-sm font-bold text-midnight-indigo">{session.subjectCode} - {session.classCode}{cancelled ? ' (Đã hủy)' : ''}</p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-blue">
                                    <span><strong className="text-midnight-indigo">Môn học:</strong> {session.subject}</span>
                                    <span><strong className="text-midnight-indigo">Lớp HP:</strong> {session.classCode}</span>
                                    <span><strong className="text-midnight-indigo">Học kỳ:</strong> {session.semester}</span>
                                    <span><strong className="text-midnight-indigo">Giờ học:</strong> {session.startTime} - {session.endTime}</span>
                                    <span><strong className="text-midnight-indigo">Phòng học:</strong> {session.room || 'Chưa có phòng'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-action-blue">Sĩ số {session.studentCount}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">Đã vào {summary.checkedIn}</span>
                                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Muộn {summary.late}</span>
                                </div>
                                {!cancelled && (
                                    <Link
                                        to={`/teacher/attendance?classId=${encodeURIComponent(session.classId)}`}
                                        className="mt-auto pt-4 self-start no-underline"
                                    >
                                        <span className="inline-block px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-bold hover:opacity-90">Mở điểm danh</span>
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TeacherHome;
