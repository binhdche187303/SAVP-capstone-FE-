import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Download, Filter, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportSemesterClassAttendanceCsv, getStudentAttendanceReport, mockClassrooms } from '../../service/classAttendanceService';

const RANGE_OPTIONS = [
    { value: 'day', label: 'Ngày' },
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'year', label: 'Năm' }
];

const STATUS_COLORS = {
    onTime: '#059669',
    late: '#D97706',
    absent: '#DC2626'
};

const todayKey = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDate = (date) => date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

const formatDateKey = (dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey || '';
    return formatDate(date);
};

const parseDisplayDate = (value) => {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
        date.getFullYear() !== Number(year)
        || date.getMonth() !== Number(month) - 1
        || date.getDate() !== Number(day)
    ) {
        return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatPeriod = (mode, period) => {
    if (!period?.start || !period?.end) return '';
    const start = new Date(`${period.start}T00:00:00`);
    const end = new Date(`${period.end}T00:00:00`);
    if (mode === 'day') return formatDate(start);
    if (mode === 'month') return `${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;
    if (mode === 'year') return `Năm ${start.getFullYear()}`;
    return `${formatDate(start)} - ${formatDate(end)}`;
};

const normalizeText = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getStoredUser = () => {
    try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const buildClassReport = ({ selectedClassId, selectedSemester, rangeMode, anchorDate, classrooms = mockClassrooms }) => {
    const classes = (selectedClassId === 'all'
        ? classrooms
        : classrooms.filter(item => item.id === selectedClassId))
        .filter(item => selectedSemester === 'all' || item.semester === selectedSemester);
    let period = null;

    const rows = classes.map(klass => {
        const entries = klass.students.flatMap(student => {
            const report = getStudentAttendanceReport({
                studentId: student.id,
                mode: rangeMode,
                anchorDate
            });
            if (!period) period = report.period;
            return (report.entries || []).filter(entry => entry.classId === klass.id);
        });

        const totalSessions = entries.length;
        const attended = entries.filter(item => item.checkInAt).length;
        const late = entries.filter(item => item.status === 'late').length;
        const absent = entries.filter(item => !item.checkInAt || item.status === 'absent').length;
        const onTime = entries.filter(item => item.status === 'on_time' || item.status === 'left').length;

        return {
            ...klass,
            totalSessions,
            attended,
            onTime,
            late,
            absent,
            rate: totalSessions ? Math.round((attended / totalSessions) * 100) : 0
        };
    });

    const totals = rows.reduce((acc, item) => ({
        totalSessions: acc.totalSessions + item.totalSessions,
        attended: acc.attended + item.attended,
        onTime: acc.onTime + item.onTime,
        late: acc.late + item.late,
        absent: acc.absent + item.absent
    }), { totalSessions: 0, attended: 0, onTime: 0, late: 0, absent: 0 });

    return {
        rows,
        period,
        totals: {
            ...totals,
            rate: totals.totalSessions ? Math.round((totals.attended / totals.totalSessions) * 100) : 0
        }
    };
};

const StatCard = ({ label, value, helper }) => (
    <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">{label}</p>
        <p className="text-2xl font-bold text-midnight-indigo mt-1">{value}</p>
        {helper && <p className="text-xs text-steel-gray mt-1">{helper}</p>}
    </div>
);

const ClassAttendanceAnalytics = ({ mode = 'admin' }) => {
    const canExport = mode === 'teacher';
    const [currentUser, setCurrentUser] = useState(() => getStoredUser());
    const [selectedClassId, setSelectedClassId] = useState(canExport ? mockClassrooms[0]?.id : 'all');
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [rangeMode, setRangeMode] = useState('month');
    const [anchorDate, setAnchorDate] = useState(() => todayKey());
    const [dateText, setDateText] = useState(() => formatDateKey(todayKey()));
    useEffect(() => {
        setCurrentUser(getStoredUser());
    }, []);

    const teacherClassrooms = useMemo(() => {
        if (!canExport) return mockClassrooms;

        const teacherName = normalizeText(currentUser?.fullName || currentUser?.full_name || currentUser?.name);
        const ownedClasses = mockClassrooms.filter(item => normalizeText(item.teacher) === teacherName);

        return ownedClasses.length > 0 ? ownedClasses : mockClassrooms;
    }, [canExport, currentUser]);

    const semesters = useMemo(() => Array.from(new Set(teacherClassrooms.map(item => item.semester))), [teacherClassrooms]);

    useEffect(() => {
        if (!canExport) return;
        if (!teacherClassrooms.some(item => item.id === selectedClassId)) {
            setSelectedClassId(teacherClassrooms[0]?.id || '');
        }
    }, [canExport, selectedClassId, teacherClassrooms]);

    const report = useMemo(
        () => buildClassReport({
            selectedClassId,
            selectedSemester,
            rangeMode,
            anchorDate,
            classrooms: teacherClassrooms
        }),
        [anchorDate, rangeMode, selectedClassId, selectedSemester, teacherClassrooms]
    );

    const pieData = [
        { name: 'Đúng giờ', value: report.totals.onTime, color: STATUS_COLORS.onTime },
        { name: 'Đi muộn', value: report.totals.late, color: STATUS_COLORS.late },
        { name: 'Vắng', value: report.totals.absent, color: STATUS_COLORS.absent }
    ];
    const hasPieData = pieData.some(item => item.value > 0);
    const barData = report.rows.map(item => ({
        name: item.code,
        subject: item.subject,
        'Đúng giờ': item.onTime,
        'Đi muộn': item.late,
        'Vắng': item.absent
    }));

    const handleDateTextChange = (event) => {
        const nextValue = event.target.value;
        setDateText(nextValue);
        const parsedDate = parseDisplayDate(nextValue);
        if (parsedDate) setAnchorDate(parsedDate);
    };

    const normalizeDateText = () => {
        const parsedDate = parseDisplayDate(dateText);
        setDateText(formatDateKey(parsedDate || anchorDate));
    };

    return (
        <div className="p-6 space-y-5 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <Activity className="w-5 h-5 text-action-blue" />
                        {canExport ? 'Bảng chuyên cần lớp học' : 'Thống kê chuyên cần lớp học'}
                    </h1>
                    <p className="text-xs text-slate-blue mt-0.5">Lọc theo lớp, môn học và khoảng thời gian để xem tỷ lệ chuyên cần</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint p-4 shadow-sm flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1 min-w-[260px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Lớp / môn học</label>
                    <div className="relative">
                        <Users className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                        <select
                            value={selectedClassId}
                            onChange={(event) => setSelectedClassId(event.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                        >
                            {!canExport && <option value="all">Tất cả lớp / môn học</option>}
                            {teacherClassrooms.map(item => (
                                <option key={item.id} value={item.id}>{item.code} - {item.subject}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-1 min-w-[180px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Học kỳ</label>
                    <select
                        value={selectedSemester}
                        onChange={(event) => setSelectedSemester(event.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                    >
                        <option value="all">Tất cả học kỳ</option>
                        {semesters.map(semester => (
                            <option key={semester} value={semester}>{semester}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[220px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Khoảng thời gian</label>
                    <div className="flex items-center gap-1 bg-cloud-mist/70 rounded-xl p-1">
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
                </div>

                <div className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Ngày mốc</label>
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="numeric"
                            value={dateText}
                            onChange={handleDateTextChange}
                            onBlur={normalizeDateText}
                            placeholder="dd/mm/yyyy"
                            className="w-full pl-9 pr-9 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue bg-cloud-mist/20 placeholder:text-steel-gray"
                        />
                        <Filter className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                        <CalendarDays className="w-4 h-4 text-slate-blue absolute right-3 top-2.5" />
                    </div>
                </div>

                {canExport && (
                    <button
                        type="button"
                        onClick={() => exportSemesterClassAttendanceCsv({
                            classId: selectedClassId,
                            semester: selectedSemester
                        })}
                        className="px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        Xuất chuyên cần
                    </button>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">Khoảng thống kê</p>
                    <p className="text-base font-bold text-midnight-indigo mt-1">{formatPeriod(rangeMode, report.period)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-action-blue">
                    <CalendarDays className="w-4 h-4" />
                    {selectedClassId === 'all' ? 'Toàn bộ lớp học' : teacherClassrooms.find(item => item.id === selectedClassId)?.subject}
                    {selectedSemester !== 'all' ? ` · ${selectedSemester}` : ''}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <StatCard label="Tổng buổi học" value={report.totals.totalSessions} helper="Theo lịch lớp" />
                <StatCard label="Đã điểm danh" value={report.totals.attended} helper={`${report.totals.rate}%`} />
                <StatCard label="Đúng giờ" value={report.totals.onTime} />
                <StatCard label="Đi muộn" value={report.totals.late} />
                <StatCard label="Vắng" value={report.totals.absent} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.4fr] gap-5">
                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Tỷ trọng chuyên cần</h2>
                    <div className="h-72 mt-3">
                        {hasPieData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
                                        {pieData.map(item => <Cell key={item.name} fill={item.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(value, name) => [`${value} buổi`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-slate-blue">Không có dữ liệu trong khoảng này</div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {pieData.map(item => (
                            <div key={item.name} className="rounded-xl bg-cloud-mist p-3">
                                <span className="block w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                <p className="text-[11px] font-bold text-midnight-indigo mt-2">{item.name}</p>
                                <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">So sánh theo lớp / môn học</h2>
                    <div className="h-80 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 8, right: 16, left: -18, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="Đúng giờ" stackId="a" fill={STATUS_COLORS.onTime} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Đi muộn" stackId="a" fill={STATUS_COLORS.late} />
                                <Bar dataKey="Vắng" stackId="a" fill={STATUS_COLORS.absent} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách lớp / môn học
                    </h3>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                        <tr>
                            <th className="text-left px-5 py-4">Lớp / môn học</th>
                            <th className="text-left px-5 py-4">Học kỳ</th>
                            <th className="text-left px-5 py-4">Tổng buổi</th>
                            <th className="text-left px-5 py-4">Đã điểm danh</th>
                            <th className="text-left px-5 py-4">Đi muộn</th>
                            <th className="text-left px-5 py-4">Vắng</th>
                            <th className="text-left px-5 py-4">Tỷ lệ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.rows.map(item => (
                            <tr key={item.id} className="border-t border-platinum-tint/70">
                                <td className="px-5 py-4">
                                    <p className="font-bold text-midnight-indigo">{item.subject}</p>
                                    <p className="text-xs text-slate-blue">{item.code} · {item.room}</p>
                                </td>
                                <td className="px-5 py-4 text-slate-blue">{item.semester}</td>
                                <td className="px-5 py-4 font-semibold text-midnight-indigo">{item.totalSessions}</td>
                                <td className="px-5 py-4 font-semibold text-midnight-indigo">{item.attended}</td>
                                <td className="px-5 py-4 text-amber-700 font-semibold">{item.late}</td>
                                <td className="px-5 py-4 text-red-600 font-semibold">{item.absent}</td>
                                <td className="px-5 py-4">
                                    <div className="w-40 h-2 rounded-full bg-cloud-mist overflow-hidden">
                                        <div className="h-full bg-action-blue" style={{ width: `${item.rate}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-blue">{item.rate}%</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClassAttendanceAnalytics;
