import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, UserRound } from 'lucide-react';
import { fetchClassAttendanceClasses, getClassSession, mockClassrooms } from '../../service/classAttendanceService';

const toDateKey = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const startOfWeek = date => {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    result.setHours(0, 0, 0, 0);
    return result;
};

const weekdaySort = weekday => Number(weekday) === 0 ? 7 : Number(weekday);
const getStartMinutes = schedule => {
    const match = String(schedule || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
};
const getClassNames = klass => klass.classNames || klass.administrativeClasses || [...new Set((klass.students || []).map(student => student.administrativeClass).filter(Boolean))] || ['Chưa cập nhật'];

const StudentSchedule = () => {
    const [classrooms, setClassrooms] = useState(mockClassrooms);
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchClassAttendanceClasses()
            .then(classes => {
                if (cancelled) return;
                const apiClasses = classes?.length ? classes : [];
                setClassrooms(apiClasses.length ? [
                    ...apiClasses.map(klass => {
                        const mockClass = mockClassrooms.find(item => item.subjectCode === klass.subjectCode);
                        return mockClass
                            ? { ...klass, classNames: mockClass.classNames, classSchedules: mockClass.classSchedules }
                            : klass;
                    }),
                    ...mockClassrooms.filter(mockClass => !apiClasses.some(item => item.subjectCode === mockClass.subjectCode))
                ] : mockClassrooms);
            })
            .catch(() => {
                if (!cancelled) setClassrooms(mockClassrooms);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [refreshKey]);

    const semesters = useMemo(() => [...new Set(classrooms.map(klass => klass.semester).filter(Boolean))], [classrooms]);
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
        if (selectedSubjectCode !== 'all' && !subjectOptions.some(subject => subject.code === selectedSubjectCode)) setSelectedSubjectCode('all');
    }, [selectedSubjectCode, subjectOptions]);

    const scheduleItems = useMemo(() => classrooms.flatMap(klass => getClassNames(klass).map(className => ({
        ...klass,
        ...getClassSession(klass, className),
        className,
        subjectCode: klass.subjectCode || klass.code,
        itemId: `${klass.id}-${className}`
    }))).filter(item => (
        (selectedSemester === 'all' || item.semester === selectedSemester)
        && (selectedSubjectCode === 'all' || item.subjectCode === selectedSubjectCode)
    )).sort((a, b) => {
        const dayDiff = weekdaySort(a.scheduleWeekday) - weekdaySort(b.scheduleWeekday);
        return dayDiff || getStartMinutes(a.schedule) - getStartMinutes(b.schedule) || a.itemId.localeCompare(b.itemId);
    }), [classrooms, selectedSemester, selectedSubjectCode]);

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        return date;
    }), [weekStart]);
    const weekLabel = `${weekDays[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - ${weekDays[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
    const todayKey = toDateKey(new Date());

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold"><CalendarDays className="w-4 h-4" /> Lịch học</span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">Lịch học của tôi</h1>
                    <p className="text-xs text-slate-blue mt-1">Xem các tiết học theo từng ngày trong tuần.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select value={selectedSemester} onChange={event => setSelectedSemester(event.target.value)} aria-label="Lọc theo học kỳ" className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo">
                        <option value="all">Tất cả học kỳ</option>
                        {semesters.map(semester => <option key={semester} value={semester}>{semester}</option>)}
                    </select>
                    <select value={selectedSubjectCode} onChange={event => setSelectedSubjectCode(event.target.value)} aria-label="Lọc theo môn học" className="h-10 px-3 bg-white border border-platinum-tint rounded-lg text-sm font-semibold text-midnight-indigo">
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(subject => <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading} aria-label="Làm mới lịch học" className="h-10 px-3 inline-flex items-center gap-2 bg-white border border-platinum-tint rounded-lg text-xs font-bold text-slate-blue hover:text-action-blue disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
                </div>
            </div>

            <div className="flex items-center justify-between bg-white border border-platinum-tint rounded-xl px-3 py-2">
                <button type="button" onClick={() => setWeekStart(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))} className="p-2 text-slate-blue hover:text-action-blue" aria-label="Tuần trước"><ChevronLeft className="w-5 h-5" /></button>
                <p className="text-sm font-bold text-midnight-indigo">Tuần {weekLabel}</p>
                <button type="button" onClick={() => setWeekStart(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))} className="p-2 text-slate-blue hover:text-action-blue" aria-label="Tuần sau"><ChevronRight className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
                {weekDays.map((date, index) => {
                    const dateKey = toDateKey(date);
                    const dayItems = scheduleItems.filter(item => weekdaySort(item.scheduleWeekday) === index + 1);
                    return (
                        <section key={dateKey} className={`bg-white border rounded-xl overflow-hidden min-h-[250px] ${dateKey === todayKey ? 'border-action-blue shadow-sm' : 'border-platinum-tint'}`}>
                            <div className={`px-3 py-3 border-b border-platinum-tint ${dateKey === todayKey ? 'bg-blue-50' : 'bg-cloud-mist/30'}`}>
                                <p className="text-xs font-bold text-midnight-indigo">{dayLabels[index]}</p>
                                <p className="text-[11px] text-slate-blue mt-0.5">{date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</p>
                            </div>
                            <div className="p-2 space-y-2">
                                {dayItems.map(item => (
                                    <div key={item.itemId} className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                                        <p className="text-xs font-bold text-midnight-indigo">{item.subjectCode} - {item.className}</p>
                                        <p className="text-[11px] text-action-blue font-semibold mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {item.schedule}</p>
                                        <p className="text-[11px] text-slate-blue mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {item.room}</p>
                                        <p className="text-[11px] text-slate-blue mt-1 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" /> {item.teacher}</p>
                                    </div>
                                ))}
                                {dayItems.length === 0 && <p className="text-[11px] text-slate-blue text-center py-8">Không có tiết</p>}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

export default StudentSchedule;
