import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, RefreshCw, UserRound } from 'lucide-react';
import { fetchClassAttendanceClasses, mockClassrooms } from '../../service/classAttendanceService';

const toLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const StudentSchedule = () => {
    const [classrooms, setClassrooms] = useState(mockClassrooms);
    const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey());
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetchClassAttendanceClasses()
            .then(classes => {
                if (!cancelled) setClassrooms(classes?.length ? classes : mockClassrooms);
            })
            .catch(() => {
                if (!cancelled) setClassrooms(mockClassrooms);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const semesters = useMemo(
        () => [...new Set(classrooms.map(klass => klass.semester).filter(Boolean))],
        [classrooms]
    );

    const subjectOptions = useMemo(() => {
        const subjects = new Map();
        classrooms
            .filter(klass => selectedSemester === 'all' || klass.semester === selectedSemester)
            .forEach(klass => {
                const code = klass.subjectCode || klass.code;
                if (code && !subjects.has(code)) subjects.set(code, klass.subject);
            });
        return [...subjects.entries()].map(([code, name]) => ({ code, name }));
    }, [classrooms, selectedSemester]);

    useEffect(() => {
        if (selectedSubjectCode !== 'all'
            && !subjectOptions.some(subject => subject.code === selectedSubjectCode)) {
            setSelectedSubjectCode('all');
        }
    }, [selectedSubjectCode, subjectOptions]);

    const filteredClassrooms = useMemo(() => {
        const selectedWeekday = selectedDate
            ? new Date(`${selectedDate}T00:00:00`).getDay()
            : null;

        return classrooms.filter(klass => {
            const subjectCode = klass.subjectCode || klass.code;
            const matchesDate = selectedWeekday === null
                || Number(klass.scheduleWeekday) === selectedWeekday;
            const matchesSemester = selectedSemester === 'all' || klass.semester === selectedSemester;
            const matchesSubject = selectedSubjectCode === 'all' || subjectCode === selectedSubjectCode;
            return matchesDate && matchesSemester && matchesSubject;
        });
    }, [classrooms, selectedDate, selectedSemester, selectedSubjectCode]);

    const semesterLabel = selectedSemester === 'all'
        ? (filteredClassrooms[0]?.semester || classrooms[0]?.semester || 'Hiện tại')
        : selectedSemester;

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                        <CalendarDays className="w-4 h-4" />
                        Lịch học
                    </span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Lịch học của tôi</h1>
                    <p className="text-xs text-slate-blue mt-1">Danh sách môn học, phòng học và thời gian trong học kỳ hiện tại.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[160px_190px_280px_44px] gap-2 w-full xl:w-auto">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={event => setSelectedDate(event.target.value)}
                        aria-label="Lọc lịch học theo ngày"
                        className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo outline-none focus:border-action-blue"
                    />
                    <select
                        value={selectedSemester}
                        onChange={event => setSelectedSemester(event.target.value)}
                        aria-label="Lọc lịch học theo học kỳ"
                        className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo outline-none focus:border-action-blue"
                    >
                        <option value="all">Tất cả học kỳ</option>
                        {semesters.map(semester => (
                            <option key={semester} value={semester}>{semester}</option>
                        ))}
                    </select>
                    <select
                        value={selectedSubjectCode}
                        onChange={event => setSelectedSubjectCode(event.target.value)}
                        aria-label="Lọc lịch học theo môn học"
                        className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo outline-none focus:border-action-blue"
                    >
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(subject => (
                            <option key={subject.code} value={subject.code}>
                                {subject.code} - {subject.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setRefreshKey(value => value + 1)}
                        disabled={loading}
                        title="Làm mới"
                        aria-label="Làm mới lịch học"
                        className="h-10 inline-flex items-center justify-center bg-white border border-platinum-tint rounded-lg text-slate-blue hover:text-action-blue hover:border-action-blue disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Học kỳ {semesterLabel}</h2>
                    <p className="text-xs text-slate-blue mt-1">Danh sách lịch học phù hợp với bộ lọc đã chọn.</p>
                </div>
                <div className="divide-y divide-platinum-tint">
                    {filteredClassrooms.map(klass => (
                        <div key={klass.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-midnight-indigo">{klass.subject}</p>
                                <p className="text-sm text-slate-blue mt-1">Mã môn học: <span className="font-bold text-midnight-indigo">{klass.subjectCode || 'Chưa có'}</span></p>
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
                                        <UserRound className="w-4 h-4 text-action-blue" />
                                        Giảng viên
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{klass.teacher}</p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {!loading && filteredClassrooms.length === 0 && (
                        <div className="px-5 py-14 text-center">
                            <CalendarDays className="w-8 h-8 text-steel-gray mx-auto" />
                            <p className="text-sm font-semibold text-midnight-indigo mt-3">Không có lịch học phù hợp</p>
                            <p className="text-xs text-slate-blue mt-1">Hãy chọn ngày, học kỳ hoặc môn học khác.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentSchedule;
