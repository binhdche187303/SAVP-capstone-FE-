import FilterBar, { FilterField } from '../../components/common/FilterBar';
import PaginationFooter from '../../components/common/PaginationFooter';
import Pagination from '../../components/common/Pagination';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import ReportExportAction from '../../components/common/ReportExportAction';
import StatisticCard from '../../components/common/StatisticCard';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportSemesterClassAttendanceCsv, fetchClassAttendanceClasses, fetchTeacherClassAttendanceReport } from '../../service/classAttendanceService';

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

const CARD_FILTERS = [
    { key: 'all', label: 'Tổng buổi học', field: 'totalSessions' },
    { key: 'attended', label: 'Đã điểm danh', field: 'attended' },
    { key: 'onTime', label: 'Đúng giờ', field: 'onTime' },
    { key: 'late', label: 'Đi muộn', field: 'late' },
    { key: 'absent', label: 'Vắng', field: 'absent' },
];

const STATUS_SERIES = [
    { key: 'onTime', name: 'Đúng giờ' },
    { key: 'late', name: 'Đi muộn' },
    { key: 'absent', name: 'Vắng' },
];

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

const formatPeriod = (mode, period) => {
    if (!period?.start || !period?.end) return '';
    const start = new Date(`${period.start}T00:00:00`);
    const end = new Date(`${period.end}T00:00:00`);
    if (mode === 'day') return formatDate(start);
    if (mode === 'month') return `${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;
    if (mode === 'year') return `Năm ${start.getFullYear()}`;
    return `${formatDate(start)} - ${formatDate(end)}`;
};

const EMPTY_REPORT = {
    rows: [],
    period: null,
    totals: { totalSessions: 0, attended: 0, onTime: 0, late: 0, absent: 0, rate: 0 }
};

const LegacyStatCard = ({ label, value, helper, onClick, selected }) => (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={selected}
        className={`w-full text-left bg-white border rounded-2xl p-4 shadow-sm hover:border-action-blue ${selected ? 'border-action-blue ring-1 ring-action-blue' : 'border-platinum-tint'}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">{label}</p>
        <p className="text-2xl font-bold text-midnight-indigo mt-1">{value}</p>
        {helper && <p className="text-xs text-steel-gray mt-1">{helper}</p>}
    </button>
);

const StatCard = (props) => <StatisticCard {...props} aria-label={props.label} legacy={<LegacyStatCard {...props} />} />;

const ClassAttendanceAnalytics = ({ mode = 'admin' }) => {
    const canExport = mode === 'teacher';
    const [classCatalog, setClassCatalog] = useState([]);
    const [apiReport, setApiReport] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
    const [selectedAdministrativeClass, setSelectedAdministrativeClass] = useState('all');
    const [selectedSemester, setSelectedSemester] = useState('all');
    const [rangeMode, setRangeMode] = useState('month');
    const [anchorDate, setAnchorDate] = useState(() => todayKey());
    const [cardFilter, setCardFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        fetchClassAttendanceClasses({ source: 'uel_api' })
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
        setLoading(true);
        fetchTeacherClassAttendanceReport({
            classId: 'all',
            subjectCode: selectedSubjectCode,
            administrativeClass: selectedAdministrativeClass,
            semester: selectedSemester,
            mode: rangeMode,
            anchorDate,
            source: 'uel_api',
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
            })
            .finally(() => { if (!cancelled) setLoading(false); });
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

    const filteredRows = cardFilter === 'all' ? report.rows : report.rows.filter(row => Number(row[cardFilter]) > 0);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
    const changePageSize = size => { setPageSize(size); setPage(1); };
    useEffect(() => {
        setPage(1);
    }, [cardFilter, selectedSubjectCode, selectedAdministrativeClass, selectedSemester, rangeMode, anchorDate]);
    const visibleSeries = STATUS_SERIES.filter(series => cardFilter === 'all'
        || (cardFilter === 'attended' ? series.key !== 'absent' : series.key === cardFilter));
    const pieData = visibleSeries.map(series => ({
        name: series.name, value: report.totals[series.key], color: STATUS_COLORS[series.key],
    }));
    const hasPieData = pieData.some(item => item.value > 0);
    const barData = filteredRows.map(item => ({
        name: item.subjectCode || item.code,
        subject: item.subject,
        'Đúng giờ': item.onTime,
        'Đi muộn': item.late,
        'Vắng': item.absent
    }));

    return (
        <div data-page-surface="wide" className="p-6 space-y-5 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <Activity className="w-5 h-5 text-action-blue" />
                        {canExport ? 'Bảng chuyên cần lớp học' : 'Thống kê chuyên cần lớp học'}
                    </h1>
                    <p className="text-xs text-slate-blue mt-0.5">Lọc theo lớp, môn học và khoảng thời gian để xem tỷ lệ chuyên cần</p>
                </div>
                {canExport && (
                    <ReportExportAction format="csv" label="Xuất chuyên cần"
                        type="button"
                        onClick={() => exportSemesterClassAttendanceCsv({
                            classId: 'all',
                            semester: selectedSemester,
                            subjectCode: selectedSubjectCode,
                            source: 'uel_api',
                            administrativeClass: selectedAdministrativeClass
                        }).catch(error => setLoadError(error?.message || 'Không xuất được file chuyên cần.'))}
                        legacyClassName="px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        Xuất chuyên cần
                    </ReportExportAction>
                )}
            </div>

            {loadError && (
                <div data-ui-text="badge" role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{loadError}</div>
            )}

            <FilterBar forceStandard variant="card" data-filter-grid className="grid gap-4" style={{ '--filter-column-min': '11rem' }}>
                <FilterField label="Lớp hành chính">
                    <select value={selectedAdministrativeClass} onChange={event => setSelectedAdministrativeClass(event.target.value)}>
                        <option value="all">Tất cả lớp</option>
                        {administrativeClassOptions.map(className => <option key={className} value={className}>{className}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Môn học">
                    <select value={selectedSubjectCode} onChange={event => setSelectedSubjectCode(event.target.value)}>
                        <option value="all">Tất cả môn học</option>
                        {subjectOptions.map(subject => <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Học kỳ">
                    <select value={selectedSemester} onChange={event => setSelectedSemester(event.target.value)}>
                        <option value="all">Tất cả học kỳ</option>
                        {semesters.map(semester => <option key={semester} value={semester}>{semester}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Khoảng thời gian">
                    <select value={rangeMode} onChange={event => setRangeMode(event.target.value)}>
                        {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Ngày mốc">
                    <input type="date" value={anchorDate} onChange={event => event.target.value && setAnchorDate(event.target.value)} />
                </FilterField>
            </FilterBar>

            <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p data-ui-text="label" className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">Khoảng thống kê</p>
                    <p className="text-base font-bold text-midnight-indigo mt-1">{formatPeriod(rangeMode, report.period)}</p>
                </div>

            </div>

            <StatisticGrid columns={5} className="grid grid-cols-1 md:grid-cols-5 gap-4" role="group" aria-label="Lọc chuyên cần theo thẻ">
                {CARD_FILTERS.map(filter => <StatCard key={filter.key} label={filter.label}
                    value={report.totals[filter.field]}
                    helper={filter.key === 'all' ? 'Theo lịch lớp' : filter.key === 'attended' ? `${report.totals.rate}%` : undefined}
                    selected={cardFilter === filter.key}
                    loading={loading}
                    onClick={() => setCardFilter(current => current === filter.key ? 'all' : filter.key)}
                />)}
            </StatisticGrid>

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
                            <div className="h-full flex items-center justify-center text-sm text-slate-blue">Không có dữ liệu phù hợp với bộ lọc.</div>
                        )}
                    </div>
                    <div data-ui-legend-grid className="grid grid-cols-3 gap-2">
                        {pieData.map(item => (
                            <div key={item.name} className="rounded-xl bg-cloud-mist p-3">
                                <span className="block w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                <p data-ui-text="label" className="text-[11px] font-bold text-midnight-indigo mt-2">{item.name}</p>
                                <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">So sánh theo môn học</h2>
                    <div className="h-80 mt-4">
                        {barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 8, right: 16, left: -18, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                <Tooltip />
                                {visibleSeries.map((series, index) => <Bar key={series.key} dataKey={series.name} stackId="a" fill={STATUS_COLORS[series.key]} radius={index === 0 ? [4, 4, 0, 0] : undefined} />)}
                            </BarChart>
                        </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-sm text-slate-blue">Không có dữ liệu phù hợp với bộ lọc.</div>}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách chuyên cần{cardFilter !== 'all' ? ` · ${CARD_FILTERS.find(filter => filter.key === cardFilter)?.label}` : ''}
                    </h3>
                </div>
                <ResponsiveTable className="w-full text-sm">
                    {mode === 'admin' && <colgroup>
                        {[20, 25, 10, 9, 10, 8, 8, 10].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
                    </colgroup>}
                    <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                        <tr>
                            <th className="text-left px-5 py-4">Lớp hành chính</th>
                            <th className="text-left px-5 py-4">Môn học</th>
                            <th className="text-left px-5 py-4">Học kỳ</th>
                            <th className="text-left px-5 py-4">Tổng buổi</th>
                            <th className="text-left px-5 py-4">Đã điểm danh</th>
                            <th className="text-left px-5 py-4">Đi muộn</th>
                            <th className="text-left px-5 py-4">Vắng</th>
                            <th className="text-left px-5 py-4">Tỷ lệ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-blue">
                            {loading ? 'Đang tải dữ liệu…' : report.rows.length === 0
                                ? 'Chưa có lớp học thực tế đã đồng bộ phù hợp với bộ lọc hiện tại.'
                                : 'Không có lớp/môn học phù hợp với bộ lọc hiện tại.'}
                        </td></tr>}
                        {pageRows.map(item => (
                            <tr key={item.id} className="border-t border-platinum-tint/70">
                                <td className="px-5 py-4">
                                    <p className="font-bold text-midnight-indigo">
                                        {item.administrativeClass || (item.administrativeClasses || []).join(', ') || 'Chưa xác định'}
                                    </p>
                                </td>
                                <td className="px-5 py-4">
                                    <p className="font-bold text-midnight-indigo">{item.subject}</p>
                                    <p className="text-xs text-slate-blue">{item.subjectCode || item.code} · {item.room}</p>
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
                                    <span data-ui-text="primary" className="text-xs font-bold text-slate-blue">{item.rate}%</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </ResponsiveTable>
                <PaginationFooter currentPage={safePage} totalPages={totalPages} totalItems={filteredRows.length}
                    pageSize={pageSize} onPageSizeChange={changePageSize} onPageChange={setPage} loading={loading} itemLabel="lớp/môn học"
                    legacy={<div className="flex flex-wrap items-center justify-between gap-3 border-t border-platinum-tint p-4 text-xs text-slate-blue">
                        <label className="flex items-center gap-2">Số dòng/trang<select aria-label="Số dòng/trang" value={pageSize}
                            disabled={loading} onChange={event => changePageSize(Number(event.target.value))}
                            className="rounded-lg border border-platinum-tint bg-white px-2 py-1">
                            {[5, 10, 20, 50].map(size => <option key={size} value={size}>{size} dòng</option>)}
                        </select></label>
                        <span>{loading ? 'Đang tải dữ liệu…' : `Hiển thị ${filteredRows.length ? (safePage - 1) * pageSize + 1 : 0}–${Math.min(safePage * pageSize, filteredRows.length)} / ${filteredRows.length} lớp/môn học`}</span>
                        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
                    </div>}
                />
            </div>
        </div>
    );
};

export default ClassAttendanceAnalytics;
