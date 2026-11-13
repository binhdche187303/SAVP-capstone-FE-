import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, BookOpen, CalendarDays, ChevronDown, ChevronRight, Download, Filter, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportSemesterClassAttendanceCsv, fetchClassAttendanceClasses, fetchTeacherClassAttendanceReport } from '../../service/classAttendanceService';
import SharedStatCard from '../../components/common/StatCard';
import ClassStudentAttendanceModal from './ClassStudentAttendanceModal';
import AttendanceWarningsPanel from './AttendanceWarningsPanel';
import Pagination from '../../components/common/Pagination';

// Bảng "Danh sách chuyên cần" phân trang theo môn học (mỗi môn là một nút cha của cây).
const SUBJECTS_PER_PAGE = 10;

const RateBar = ({ rate, hasData, strong = false }) => (
    hasData ? (
        <div className="flex items-center gap-2">
            <div className="w-28 h-2 rounded-full bg-cloud-mist overflow-hidden">
                <div className={`h-full ${strong ? 'bg-midnight-indigo' : 'bg-action-blue'}`} style={{ width: `${rate}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-blue">{rate}%</span>
        </div>
    ) : (
        <span className="text-xs text-steel-gray">Chưa có dữ liệu</span>
    )
);

const groupRowsBySubject = (rows) => {
    const groups = new Map();
    rows.forEach(item => {
        const key = item.subjectCode || item.subject || item.code || item.id;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                subject: item.subject,
                subjectCode: item.subjectCode,
                semesters: new Set(),
                adminClasses: new Set(),
                rows: [],
                enrolled: 0,
                totalSessions: 0,
                sessionsHeld: 0,
                unmarkedSessions: 0,
                attended: 0,
                late: 0,
                absent: 0
            });
        }
        const group = groups.get(key);
        group.rows.push(item);
        if (item.semester) group.semesters.add(item.semester);
        const adminNames = item.administrativeClassStats?.length
            ? item.administrativeClassStats.map(stat => stat.name)
            : (item.administrativeClasses || []);
        adminNames.filter(Boolean).forEach(name => group.adminClasses.add(name));
        group.enrolled += Number(item.enrolled ?? item.studentCount ?? 0);
        group.totalSessions += Number(item.totalSessions || 0);
        group.sessionsHeld += Number(item.sessionsHeld || 0);
        group.unmarkedSessions += Number(item.unmarkedSessions || 0);
        group.attended += Number(item.attended || 0);
        group.late += Number(item.late || 0);
        group.absent += Number(item.absent || 0);
    });
    return [...groups.values()].map(group => ({
        ...group,
        semesters: [...group.semesters],
        adminClassCount: group.adminClasses.size,
        rate: group.totalSessions > 0 ? Math.round((group.attended / group.totalSessions) * 100) : 0
    }));
};

const RANGE_OPTIONS = [
    { value: 'day', label: 'Ngày' },
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'year', label: 'Năm' },
    { value: 'semester', label: 'Cả học kỳ' }
];

// Ngưỡng tỷ lệ có mặt mong muốn (vạch đỏ trên biểu đồ) — tạm 80% tới khi UEL chốt quy chế.
const ATTENDANCE_TARGET = 80;
// Số lớp hiện mặc định trong biểu đồ "Lớp cần chú ý".
const ATTENTION_LIMIT = 8;

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
    if (mode === 'semester') return `Cả học kỳ (${formatDate(start)} - ${formatDate(end)})`;
    return `${formatDate(start)} - ${formatDate(end)}`;
};

const EMPTY_REPORT = {
    rows: [],
    period: null,
    totals: { totalSessions: 0, attended: 0, onTime: 0, late: 0, absent: 0, sessionsHeld: 0, rate: 0 }
};

const StatCard = ({ label, value, helper, tone }) => (
    <SharedStatCard label={label} value={value} hint={helper} tone={tone} />
);

// Mỗi lớp HP tách thành các dòng con theo lớp hành chính (đã lọc 1 lớp HC thì giữ 1 dòng).
const splitByAdminClass = (item) => {
    if (item.administrativeClass) return [{ item, adminClass: item.administrativeClass, stats: item }];
    const breakdown = item.administrativeClassBreakdown || [];
    if (breakdown.length > 1) return breakdown.map(part => ({ item, adminClass: part.name, stats: part }));
    const names = item.administrativeClassStats?.length
        ? item.administrativeClassStats.map(entry => ({ name: entry.name, enrolled: entry.count }))
        : (item.administrativeClasses || []).map(name => ({ name, enrolled: null }));
    if (names.length > 1) return names.map(part => ({ item, adminClass: part.name, stats: { enrolled: part.enrolled, pending: true } }));
    const only = breakdown[0]?.name || names[0]?.name || null;
    return [{ item, adminClass: only, stats: item }];
};

const SessionCountCell = ({ totalSessions, sessionsHeld, unmarkedSessions }) => (
    <td className="px-4 py-3 text-right whitespace-nowrap">
        <p className="font-semibold text-midnight-indigo">{totalSessions}</p>
        <p className="text-[10px] text-steel-gray">{sessionsHeld ?? 0} buổi</p>
        {unmarkedSessions > 0 && (
            <p className="text-[10px] font-semibold text-amber-700" title="Buổi đã diễn ra nhưng cả lớp chưa có bản ghi điểm danh — không tính vắng">
                +{unmarkedSessions} chưa ĐD
            </p>
        )}
    </td>
);

// Một nút cha (môn học, số liệu cộng dồn) + các nút con (lớp học phần × lớp hành chính, bấm để mở modal chi tiết).
const SubjectTreeRows = ({ group, expanded, onToggle, onOpenClass }) => {
    const Chevron = expanded ? ChevronDown : ChevronRight;
    return (
        <>
            <tr
                tabIndex={0}
                aria-expanded={expanded}
                onClick={onToggle}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } }}
                className="border-t border-platinum-tint align-top cursor-pointer bg-cloud-mist/40 hover:bg-cloud-mist/70 focus:outline-none focus:bg-cloud-mist/70"
            >
                <td className="px-5 py-3 min-w-[280px]">
                    <div className="flex items-start gap-2">
                        <Chevron className="w-4 h-4 mt-0.5 shrink-0 text-slate-blue" />
                        <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-action-blue" />
                        <div>
                            <p className="font-bold text-midnight-indigo">{group.subject || 'Chưa rõ môn học'}</p>
                            <p className="text-xs text-slate-blue mt-0.5">
                                {group.subjectCode && <span className="font-mono font-semibold text-action-blue">{group.subjectCode} · </span>}
                                {group.rows.length} lớp học phần
                            </p>
                            {group.semesters.length > 0 && <p className="text-[11px] text-steel-gray mt-0.5">{group.semesters.join(', ')}</p>}
                        </div>
                    </div>
                </td>
                <td className="px-5 py-3 text-xs font-semibold text-slate-blue whitespace-nowrap">
                    {group.adminClassCount > 0 ? `${group.adminClassCount} lớp HC` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-bold text-midnight-indigo">{group.enrolled}</td>
                <SessionCountCell totalSessions={group.totalSessions} sessionsHeld={group.sessionsHeld} unmarkedSessions={group.unmarkedSessions} />
                <td className="px-4 py-3 text-right font-bold text-emerald-700">{group.attended}</td>
                <td className="px-4 py-3 text-right font-bold text-amber-700">{group.late}</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">{group.absent}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                    <RateBar rate={group.rate} hasData={group.totalSessions > 0} strong />
                </td>
            </tr>
            {expanded && (() => {
                const childRows = group.rows.flatMap(splitByAdminClass);
                return childRows.map(({ item, adminClass, stats }, index) => {
                    const isLast = index === childRows.length - 1;
                    const isSplit = stats !== item;
                    const open = () => onOpenClass(item, isSplit ? adminClass : null);
                    const show = (value) => value ?? '—';
                    return (
                        <tr
                            key={`${item.id}::${adminClass || ''}`}
                            tabIndex={0}
                            onClick={open}
                            onKeyDown={(event) => { if (event.key === 'Enter') open(); }}
                            className="border-t border-platinum-tint/50 align-top cursor-pointer hover:bg-blue-50/40 focus:outline-none focus:bg-blue-50/40"
                        >
                            <td className="py-3 pr-5 pl-7 min-w-[280px]">
                                <div className="flex items-start">
                                    <span aria-hidden="true" className="relative w-6 shrink-0 self-stretch">
                                        <span className={`absolute left-1.5 top-0 border-l border-platinum-tint ${isLast ? 'h-3' : 'h-full'}`} />
                                        <span className="absolute left-1.5 top-3 w-3 border-t border-platinum-tint" />
                                    </span>
                                    <div>
                                        <p className="font-semibold text-midnight-indigo">
                                            <span className="font-mono text-action-blue">{item.code}</span>
                                            {item.room ? <span className="font-normal text-slate-blue"> · {item.room}</span> : ''}
                                        </p>
                                        {item.semester && group.semesters.length > 1 && <p className="text-[11px] text-steel-gray mt-0.5">{item.semester}</p>}
                                    </div>
                                </div>
                            </td>
                            <td className="px-5 py-3">
                                {adminClass
                                    ? <span className="px-1.5 py-0.5 rounded-md bg-cloud-mist text-[11px] font-semibold text-midnight-indigo whitespace-nowrap">{adminClass}</span>
                                    : <span className="text-xs text-steel-gray">{item.administrativeClassStats?.length > 1 ? `${item.administrativeClassStats.length} lớp HC` : 'Chưa xác định'}</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-midnight-indigo">{isSplit ? show(stats.enrolled) : (item.enrolled ?? item.studentCount ?? '—')}</td>
                            {isSplit
                                ? (
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        <p className="font-semibold text-midnight-indigo">{show(stats.totalSessions)}</p>
                                        <p className="text-[10px] text-steel-gray">{item.sessionsHeld ?? 0} buổi</p>
                                    </td>
                                )
                                : <SessionCountCell totalSessions={item.totalSessions} sessionsHeld={item.sessionsHeld} unmarkedSessions={item.unmarkedSessions} />}
                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">{show(stats.attended)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-700">{show(stats.late)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">{show(stats.absent)}</td>
                            <td className="px-5 py-3 whitespace-nowrap">
                                <RateBar rate={stats.rate} hasData={stats.totalSessions > 0} />
                            </td>
                        </tr>
                    );
                });
            })()}
        </>
    );
};

const ClassAttendanceAnalytics = ({ mode = 'admin' }) => {
    const canExport = mode === 'teacher';
    // Tab "SV cảnh báo" hiện mới mở cho GV (lớp mình dạy); bản toàn trường cho admin làm sau.
    const showWarnings = mode === 'teacher';
    const [tab, setTab] = useState('overview');
    const [classCatalog, setClassCatalog] = useState([]);
    const [apiReport, setApiReport] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [selectedAdministrativeClass, setSelectedAdministrativeClass] = useState('all');
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [rangeMode, setRangeMode] = useState('month');
    const [anchorDate, setAnchorDate] = useState(() => todayKey());
    const [dateText, setDateText] = useState(() => formatDateKey(todayKey()));
    const datePickerRef = useRef(null);
    const [selectedClass, setSelectedClass] = useState(null);
    // Mở từ tab cảnh báo thì modal luôn xem cả học kỳ (cảnh báo tính theo cả kỳ).
    const [modalMode, setModalMode] = useState(null);
    // Lớp hành chính của dòng con được bấm — chỉ áp cho modal, không đổi bộ lọc chung.
    const [modalAdminClass, setModalAdminClass] = useState(null);
    const [classPage, setClassPage] = useState(1);
    useEffect(() => {
        let cancelled = false;
        fetchClassAttendanceClasses()
            .then(classes => {
                if (!cancelled) setClassCatalog(Array.isArray(classes) ? classes : []);
            })
            .catch(error => {
                if (!cancelled) setLoadError(error?.message || 'Không tải được danh sách lớp.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchTeacherClassAttendanceReport({
            classId: 'all',
            subjectCode: selectedSubjectCode,
            administrativeClass: selectedAdministrativeClass,
            semester: selectedSemester,
            mode: rangeMode,
            anchorDate,
            // trend = tỷ lệ có mặt theo tuần cả học kỳ (biểu đồ xu hướng).
            include: 'trend'
        })
            .then(data => {
                if (cancelled) return;
                setApiReport(data || null);
                setLoadError('');
            })
            .catch(error => {
                if (!cancelled) {
                    setApiReport(null);
                    setLoadError(error?.message || 'Không tải được báo cáo chuyên cần.');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [anchorDate, rangeMode, selectedAdministrativeClass, selectedSemester, selectedSubjectCode]);

    // BE đã giới hạn phạm vi lớp theo vai trò (GV chỉ thấy lớp mình phụ trách).
    const teacherClassrooms = classCatalog;

    const subjectOptions = useMemo(() => {
        const options = new Map();
        teacherClassrooms.forEach(item => {
            const code = item.subjectCode || item.code;
            if (!options.has(code)) options.set(code, { code, name: item.subject });
        });
        return [...options.values()];
    }, [teacherClassrooms]);

    const administrativeClassOptions = useMemo(() => {
        const classes = teacherClassrooms
            .filter(item => selectedSubjectCode === 'all' || (item.subjectCode || item.code) === selectedSubjectCode)
            .flatMap(item => item.administrativeClasses || [])
            .filter(Boolean);
        return [...new Set(classes)].sort((a, b) => a.localeCompare(b, 'vi'));
    }, [selectedSubjectCode, teacherClassrooms]);

    const semesters = useMemo(() => Array.from(new Set(teacherClassrooms.map(item => item.semester).filter(Boolean))), [teacherClassrooms]);

    useEffect(() => {
        if (selectedAdministrativeClass !== 'all' && !administrativeClassOptions.includes(selectedAdministrativeClass)) {
            setSelectedAdministrativeClass('all');
        }
    }, [administrativeClassOptions, selectedAdministrativeClass]);

    const report = apiReport?.rows ? { ...EMPTY_REPORT, ...apiReport, totals: { ...EMPTY_REPORT.totals, ...apiReport.totals } } : EMPTY_REPORT;

    // Cây Môn học → Lớp học phần cho bảng "Danh sách chuyên cần"; phân trang theo môn.
    // Biểu đồ / tổng số vẫn dùng toàn bộ lớp.
    const subjectGroups = useMemo(() => groupRowsBySubject(report.rows), [report.rows]);
    const classPageCount = Math.max(1, Math.ceil(subjectGroups.length / SUBJECTS_PER_PAGE));
    const visibleSubjectGroups = subjectGroups.slice((classPage - 1) * SUBJECTS_PER_PAGE, classPage * SUBJECTS_PER_PAGE);
    // Mặc định thu gọn tất cả các môn; lưu những môn người dùng đã mở.
    const [expandedSubjects, setExpandedSubjects] = useState(() => new Set());
    const toggleSubject = (key) => setExpandedSubjects(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    const openClassRow = (item, adminClass = null) => {
        setModalMode(null);
        setModalAdminClass(adminClass);
        setSelectedClass(item);
    };
    // Dữ liệu báo cáo đổi (đổi bộ lọc / khoảng ngày) → về trang 1.
    useEffect(() => { setClassPage(1); }, [apiReport]);
    useEffect(() => { if (classPage > classPageCount) setClassPage(classPageCount); }, [classPage, classPageCount]);

    // Cột ngang theo % lượt điểm danh của từng lớp (lớp đông không đè bẹp lớp ít);
    // ẩn lớp chưa có lượt nào trong khoảng; lớp có tỷ lệ có mặt thấp nhất lên đầu.
    const pct = (value, total) => Math.round((Number(value || 0) / total) * 1000) / 10;
    const barData = report.rows
        .filter(item => Number(item.totalSessions) > 0)
        .map(item => ({
            id: item.id,
            name: item.code || item.subjectCode,
            subject: `${item.subject} (${item.subjectCode || ''})`,
            total: Number(item.totalSessions),
            'Đúng giờ': pct(item.onTime, item.totalSessions),
            'Đi muộn': pct(item.late, item.totalSessions),
            'Vắng': pct(item.absent, item.totalSessions)
        }))
        .map(entry => ({ ...entry, rate: Math.round(entry['Đúng giờ'] + entry['Đi muộn']) }))
        .sort((a, b) => a.rate - b.rate);
    const hiddenBarCount = report.rows.length - barData.length;
    const belowTargetCount = barData.filter(entry => entry.rate < ATTENDANCE_TARGET).length;
    // Mặc định chỉ hiện các lớp thấp nhất; "Xem tất cả" mở toàn bộ (cuộn trong khung).
    const [showAllClasses, setShowAllClasses] = useState(false);
    const visibleBarData = showAllClasses ? barData : barData.slice(0, ATTENTION_LIMIT);
    const barChartHeight = Math.max(160, visibleBarData.length * 30 + 48);

    // Xu hướng theo tuần cả học kỳ (BE: include=trend).
    const trendData = (apiReport?.trend || []).map((week, index) => ({
        ...week,
        label: `T${index + 1}`,
        range: `${formatDateKey(week.weekStart).slice(0, 5)} – ${formatDateKey(week.weekEnd).slice(0, 5)}`
    }));
    const trendMin = trendData.length ? Math.min(...trendData.map(week => week.rate), ATTENDANCE_TARGET) : 0;
    const trendFloor = Math.max(0, Math.floor((trendMin - 10) / 10) * 10);
    const trendDelta = trendData.length >= 2 ? trendData[trendData.length - 1].rate - trendData[trendData.length - 2].rate : null;

    const openClass = (entry) => {
        const row = report.rows.find(item => item.id === entry?.id);
        if (row) {
            setModalMode(null);
            setSelectedClass(row);
        }
    };

    const openWarningClass = (classId) => {
        const klass = report.rows.find(item => item.id === classId) || classCatalog.find(item => item.id === classId);
        if (!klass) return;
        setModalMode('semester');
        setSelectedClass(klass);
    };

    const handleDateTextChange = (event) => {
        const nextValue = event.target.value;
        setDateText(nextValue);
        const parsedDate = parseDisplayDate(nextValue);
        if (parsedDate) setAnchorDate(parsedDate);
    };

    const handleDatePick = (event) => {
        const nextKey = event.target.value;
        if (!nextKey) return;
        setAnchorDate(nextKey);
        setDateText(formatDateKey(nextKey));
    };

    const openDatePicker = () => {
        const input = datePickerRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
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
                {canExport && (
                    <button
                        type="button"
                        onClick={() => exportSemesterClassAttendanceCsv({
                            classId: 'all',
                            semester: selectedSemester,
                            subjectCode: selectedSubjectCode,
                            administrativeClass: selectedAdministrativeClass,
                            mode: tab === 'warnings' ? 'semester' : rangeMode,
                            anchorDate
                        }).catch(error => setLoadError(error?.message || 'Không xuất được file chuyên cần.'))}
                        title={`Xuất bảng SV × buổi theo bộ lọc đang chọn (${tab === 'warnings' || rangeMode === 'semester' ? 'cả học kỳ' : formatPeriod(rangeMode, report.period)}), kèm cột vắng cả kỳ và cảnh báo`}
                        className="self-start sm:self-auto shrink-0 px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:bg-action-blue/90"
                    >
                        <Download className="w-4 h-4" />
                        Xuất chuyên cần
                    </button>
                )}
            </div>

            {showWarnings && (
                <div className="flex items-center gap-1 bg-cloud-mist/70 rounded-xl p-1 w-fit">
                    {[
                        { value: 'overview', label: 'Tổng quan theo lớp', icon: BarChart3 },
                        { value: 'warnings', label: 'SV cảnh báo', icon: AlertTriangle }
                    ].map(item => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setTab(item.value)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${tab === item.value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </button>
                    ))}
                </div>
            )}

            {loadError && (
                <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            <div className="bg-white rounded-2xl border border-platinum-tint p-4 shadow-sm">
            <div className="flex flex-wrap xl:flex-nowrap gap-3 items-end">
                <div className="flex flex-col gap-1 w-[150px] shrink-0">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Lớp hành chính</label>
                    <div className="relative">
                        <Users className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                        <select
                            value={selectedAdministrativeClass}
                            onChange={(event) => setSelectedAdministrativeClass(event.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                        >
                            <option value="all">Tất cả lớp</option>
                            {administrativeClassOptions.map(className => (
                                <option key={className} value={className}>{className}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Môn học</label>
                    <select
                        value={selectedSubjectCode}
                        onChange={(event) => setSelectedSubjectCode(event.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                    >
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(subject => (
                            <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 w-[150px] shrink-0">
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

                {tab === 'overview' && (<>
                <div className="flex flex-col gap-1 shrink-0">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Khoảng thời gian</label>
                    <div className="flex items-center gap-1 bg-cloud-mist/70 rounded-xl p-1">
                        {RANGE_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setRangeMode(option.value)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${rangeMode === option.value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={`flex flex-col gap-1 w-[140px] shrink-0 ${rangeMode === 'semester' ? 'opacity-40 pointer-events-none' : ''}`} title={rangeMode === 'semester' ? 'Cả học kỳ lấy theo ngày bắt đầu/kết thúc học kỳ' : undefined}>
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
                        <button
                            type="button"
                            onClick={openDatePicker}
                            title="Chọn ngày"
                            className="absolute right-2 top-1.5 p-1 rounded-md text-slate-blue hover:text-action-blue hover:bg-cloud-mist"
                        >
                            <CalendarDays className="w-4 h-4" />
                        </button>
                        <input
                            ref={datePickerRef}
                            type="date"
                            value={anchorDate}
                            onChange={handleDatePick}
                            tabIndex={-1}
                            aria-hidden="true"
                            className="absolute right-2 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
                        />
                    </div>
                </div>
                </>)}

            </div>
            {tab === 'overview' && report.period && (
                <p className="mt-3 pt-3 border-t border-platinum-tint/70 text-xs text-slate-blue flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-action-blue" />
                    Khoảng thống kê: <span className="font-bold text-midnight-indigo">{formatPeriod(rangeMode, report.period)}</span>
                </p>
            )}
            </div>

            {tab === 'warnings' && (
                <AttendanceWarningsPanel
                    semester={selectedSemester}
                    subjectCode={selectedSubjectCode}
                    administrativeClass={selectedAdministrativeClass}
                    onOpenClass={openWarningClass}
                />
            )}

            {tab === 'overview' && (<>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <StatCard
                    label="Lượt cần điểm danh"
                    value={report.totals.totalSessions}
                    helper={`Sĩ số × buổi đã diễn ra (${report.totals.sessionsHeld} buổi)${report.totals.unmarkedSessions ? ` · ${report.totals.unmarkedSessions} buổi chưa điểm danh, không tính` : ''}`}
                />
                <StatCard label="Có mặt" value={report.totals.attended} helper={`${report.totals.rate}% số lượt`} tone="green" />
                <StatCard label="Đúng giờ" value={report.totals.onTime} tone="green" />
                <StatCard label="Đi muộn" value={report.totals.late} tone="amber" />
                <StatCard label="Vắng" value={report.totals.absent} helper="Không có lượt quét/điểm danh" tone="red" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm flex flex-col">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Lớp cần chú ý</h2>
                        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-blue">
                            {[['Đúng giờ', STATUS_COLORS.onTime], ['Đi muộn', STATUS_COLORS.late], ['Vắng', STATUS_COLORS.absent]].map(([name, color]) => (
                                <span key={name} className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                    <p className="text-[11px] text-steel-gray mt-1">
                        {barData.length > 0
                            ? <><span className={belowTargetCount ? 'font-bold text-red-600' : 'font-bold text-emerald-700'}>{belowTargetCount}/{barData.length} lớp</span> dưới ngưỡng {ATTENDANCE_TARGET}% có mặt · thấp nhất ở trên · bấm cột để xem chi tiết</>
                            : 'Theo khoảng thời gian đang chọn'}
                        {hiddenBarCount > 0 ? ` · ẩn ${hiddenBarCount} lớp chưa có buổi` : ''}
                    </p>
                    {barData.length > 0 ? (
                        <>
                            <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
                                <div style={{ height: barChartHeight }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={visibleBarData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap={6}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={96}
                                                interval={0}
                                                tick={({ x, y, payload }) => {
                                                    const entry = visibleBarData.find(item => item.name === payload.value);
                                                    const low = entry && entry.rate < ATTENDANCE_TARGET;
                                                    return (
                                                        <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fontWeight={low ? 700 : 400} fill={low ? '#DC2626' : '#475569'}>
                                                            {payload.value}
                                                        </text>
                                                    );
                                                }}
                                            />
                                            <Tooltip
                                                formatter={(value, name) => [`${value}%`, name]}
                                                labelFormatter={(label, payload) => {
                                                    const entry = payload?.[0]?.payload;
                                                    return entry ? `${label} · ${entry.subject} · có mặt ${entry.rate}% / ${entry.total} lượt` : label;
                                                }}
                                            />
                                            <Bar dataKey="Đúng giờ" stackId="a" cursor="pointer" onClick={openClass} fill={STATUS_COLORS.onTime} />
                                            <Bar dataKey="Đi muộn" stackId="a" cursor="pointer" onClick={openClass} fill={STATUS_COLORS.late} />
                                            <Bar dataKey="Vắng" stackId="a" cursor="pointer" onClick={openClass} fill={STATUS_COLORS.absent} radius={[0, 4, 4, 0]} />
                                            <ReferenceLine x={ATTENDANCE_TARGET} stroke="#1E1B4B" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `${ATTENDANCE_TARGET}%`, position: 'top', fontSize: 10, fill: '#1E1B4B' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {barData.length > ATTENTION_LIMIT && (
                                <button type="button" onClick={() => setShowAllClasses(value => !value)} className="mt-2 self-center text-[11px] font-semibold text-action-blue hover:underline flex items-center gap-1">
                                    {showAllClasses ? 'Thu gọn' : `Xem tất cả ${barData.length} lớp`}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllClasses ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 min-h-[160px] flex items-center justify-center text-sm text-slate-blue">Không có dữ liệu trong khoảng này</div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm flex flex-col">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Xu hướng tỷ lệ có mặt theo tuần</h2>
                        {trendDelta !== null && (
                            <span className={`text-[11px] font-bold ${trendDelta < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                Tuần gần nhất {trendData[trendData.length - 1].rate}% ({trendDelta > 0 ? '+' : ''}{trendDelta} điểm)
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-steel-gray mt-1">Cả học kỳ tới hôm nay, theo bộ lọc lớp/môn/học kỳ · vạch đứt = ngưỡng {ATTENDANCE_TARGET}%</p>
                    {trendData.length > 0 ? (
                        <div className="mt-3 flex-1 min-h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData} margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                                    <YAxis domain={[trendFloor, 100]} ticks={Array.from({ length: (100 - trendFloor) / 10 + 1 }, (_, i) => trendFloor + i * 10)} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        formatter={(value) => [`${value}%`, 'Có mặt']}
                                        labelFormatter={(label, payload) => {
                                            const week = payload?.[0]?.payload;
                                            return week ? `Tuần ${label.slice(1)} (${week.range}) · ${week.attended}/${week.totalSessions} lượt · vắng ${week.absent}` : label;
                                        }}
                                    />
                                    <ReferenceLine y={ATTENDANCE_TARGET} stroke="#DC2626" strokeDasharray="4 3" />
                                    <Line
                                        type="monotone"
                                        dataKey="rate"
                                        stroke="#2563EB"
                                        strokeWidth={2.5}
                                        dot={({ cx, cy, payload }) => (
                                            <circle key={payload.weekStart} cx={cx} cy={cy} r={3.5} fill={payload.rate < ATTENDANCE_TARGET ? '#DC2626' : '#2563EB'} stroke="#fff" strokeWidth={1.5} />
                                        )}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-[160px] flex items-center justify-center text-sm text-slate-blue">Chưa có buổi học nào trong học kỳ</div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách chuyên cần
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-blue">Bấm vào môn học để mở/thu gọn; bấm vào một lớp để xem chuyên cần từng sinh viên theo từng buổi.</p>
                        {subjectGroups.length > 1 && (
                            <div className="flex items-center gap-3 text-[11px] font-semibold text-action-blue">
                                <button type="button" className="hover:underline" onClick={() => setExpandedSubjects(new Set(subjectGroups.map(group => group.key)))}>Mở tất cả</button>
                                <button type="button" className="hover:underline" onClick={() => setExpandedSubjects(new Set())}>Thu gọn tất cả</button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr className="text-left whitespace-nowrap">
                                <th className="px-5 py-3">Môn học / Lớp học phần</th>
                                <th className="px-5 py-3">Lớp hành chính</th>
                                <th className="w-px px-4 py-3 text-right">Sĩ số</th>
                                <th className="w-px px-4 py-3 text-right" title="Sĩ số × số buổi đã diễn ra trong khoảng">Lượt ĐD</th>
                                <th className="w-px px-4 py-3 text-right">Có mặt</th>
                                <th className="w-px px-4 py-3 text-right">Đi muộn</th>
                                <th className="w-px px-4 py-3 text-right">Vắng</th>
                                <th className="w-px px-5 py-3">Tỷ lệ có mặt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.rows.length === 0 && (
                                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-blue">Không có lớp học phần nào khớp bộ lọc.</td></tr>
                            )}
                            {visibleSubjectGroups.map(group => {
                                const expanded = expandedSubjects.has(group.key);
                                return (
                                    <SubjectTreeRows
                                        key={group.key}
                                        group={group}
                                        expanded={expanded}
                                        onToggle={() => toggleSubject(group.key)}
                                        onOpenClass={openClassRow}
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {report.rows.length > 0 && (
                    <div className="px-5 py-3 border-t border-platinum-tint flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-blue">
                            Hiển thị môn {(classPage - 1) * SUBJECTS_PER_PAGE + 1}–{Math.min(classPage * SUBJECTS_PER_PAGE, subjectGroups.length)} trong {subjectGroups.length} môn học · {report.rows.length} lớp học phần
                        </span>
                        <Pagination currentPage={classPage} totalPages={classPageCount} onPageChange={setClassPage} />
                    </div>
                )}
            </div>
            </>)}

            <ClassStudentAttendanceModal
                classItem={selectedClass}
                mode={modalMode || rangeMode}
                anchorDate={anchorDate}
                semester={selectedSemester}
                administrativeClass={modalAdminClass || selectedAdministrativeClass}
                periodLabel={modalMode ? 'Cả học kỳ' : formatPeriod(rangeMode, report.period)}
                onClose={() => { setSelectedClass(null); setModalMode(null); setModalAdminClass(null); }}
            />
        </div>
    );
};

export default ClassAttendanceAnalytics;
