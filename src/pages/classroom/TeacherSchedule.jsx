import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, RefreshCw, Users } from 'lucide-react';
import { fetchClassAttendanceClasses, mockClassrooms } from '../../service/classAttendanceService';

const toLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getAdministrativeClasses = (klass) => {
    const values = klass.administrativeClasses
        || (klass.students || []).map(student => student.administrativeClass);
    return [...new Set(values.filter(Boolean))];
};

const TeacherSchedule = () => {
    const [classrooms, setClassrooms] = useState(mockClassrooms);
    const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey());
    const [selectedAdministrativeClass, setSelectedAdministrativeClass] = useState('all');
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

    const subjectOptions = useMemo(() => {
        const subjects = new Map();
        classrooms.forEach(klass => {
            const code = klass.subjectCode || klass.code;
            if (code && !subjects.has(code)) subjects.set(code, klass.subject);
        });
        return [...subjects.entries()].map(([code, name]) => ({ code, name }));
    }, [classrooms]);

    const administrativeClassOptions = useMemo(() => {
        const values = classrooms
            .filter(klass => selectedSubjectCode === 'all'
                || (klass.subjectCode || klass.code) === selectedSubjectCode)
            .flatMap(getAdministrativeClasses);
        return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'vi'));
    }, [classrooms, selectedSubjectCode]);

    useEffect(() => {
        if (selectedAdministrativeClass !== 'all'
            && !administrativeClassOptions.includes(selectedAdministrativeClass)) {
            setSelectedAdministrativeClass('all');
        }
    }, [administrativeClassOptions, selectedAdministrativeClass]);

    const filteredClassrooms = useMemo(() => {
        const selectedWeekday = selectedDate
            ? new Date(`${selectedDate}T00:00:00`).getDay()
            : null;

        return classrooms.filter(klass => {
            const subjectCode = klass.subjectCode || klass.code;
            const matchesSubject = selectedSubjectCode === 'all' || subjectCode === selectedSubjectCode;
            const matchesAdministrativeClass = selectedAdministrativeClass === 'all'
                || getAdministrativeClasses(klass).includes(selectedAdministrativeClass);
            const matchesDate = selectedWeekday === null
                || Number(klass.scheduleWeekday) === selectedWeekday;

            return matchesSubject && matchesAdministrativeClass && matchesDate;
        });
    }, [classrooms, selectedAdministrativeClass, selectedDate, selectedSubjectCode]);

    const semesterLabel = filteredClassrooms[0]?.semester || classrooms[0]?.semester || 'Hiện tại';

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                        <CalendarDays className="w-4 h-4" />
                        Lịch dạy
                    </span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Lịch dạy của tôi</h1>
                    <p className="text-xs text-slate-blue mt-1">Danh sách lớp học, phòng học và thời gian giảng dạy trong học kỳ hiện tại.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[160px_170px_280px_44px] gap-2 w-full xl:w-auto">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={event => setSelectedDate(event.target.value)}
                        aria-label="Lọc theo ngày"
                        className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo outline-none focus:border-action-blue"
                    />
                    <select
                        value={selectedAdministrativeClass}
                        onChange={event => setSelectedAdministrativeClass(event.target.value)}
                        aria-label="Lọc theo lớp"
                        className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo outline-none focus:border-action-blue"
                    >
                        <option value="all">Tất cả lớp</option>
                        {administrativeClassOptions.map(className => (
                            <option key={className} value={className}>{className}</option>
                        ))}
                    </select>
                    <select
                        value={selectedSubjectCode}
                        onChange={event => setSelectedSubjectCode(event.target.value)}
                        aria-label="Lọc theo môn học"
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
                        aria-label="Làm mới lịch dạy"
                        className="h-10 inline-flex items-center justify-center bg-white border border-platinum-tint rounded-lg text-slate-blue hover:text-action-blue hover:border-action-blue disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Học kỳ {semesterLabel}</h2>
                    <p className="text-xs text-slate-blue mt-1">Danh sách lịch dạy phù hợp với ngày, lớp và môn học đã chọn.</p>
                </div>
                <div className="divide-y divide-platinum-tint">
                    {filteredClassrooms.map(klass => (
                        <div key={klass.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-midnight-indigo">{klass.subject}</p>
                                <p className="text-sm text-slate-blue mt-1">Mã môn học: <span className="font-bold text-midnight-indigo">{klass.subjectCode || 'Chưa có'}</span></p>
                                {getAdministrativeClasses(klass).length > 0 && (
                                    <p className="text-xs text-slate-blue mt-1">Lớp: {getAdministrativeClasses(klass).join(', ')}</p>
                                )}
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
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">
                                        {klass.studentCount ?? klass.students?.length ?? 0} sinh viên
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {!loading && filteredClassrooms.length === 0 && (
                        <div className="px-5 py-14 text-center">
                            <CalendarDays className="w-8 h-8 text-steel-gray mx-auto" />
                            <p className="text-sm font-semibold text-midnight-indigo mt-3">Không có lịch dạy phù hợp</p>
                            <p className="text-xs text-slate-blue mt-1">Hãy chọn ngày, lớp hoặc môn học khác.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherSchedule;
