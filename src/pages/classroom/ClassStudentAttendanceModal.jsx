import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import SimpleModal from '../../components/common/SimpleModal';
import StatCard from '../../components/common/StatCard';
import { fetchClassStudentReport } from '../../service/classAttendanceService';
import { ThresholdNote, WARNING_LEVELS, WarningBadge } from './AttendanceWarningsPanel';

// Màu chấm trong ma trận SV × buổi.
const DAY_STATUS = {
    on_time: { label: 'Đúng giờ', dot: 'bg-emerald-500' },
    late: { label: 'Đi muộn', dot: 'bg-amber-400' },
    absent: { label: 'Vắng', dot: 'bg-red-500' },
    unmarked: { label: 'Chưa điểm danh (không tính)', dot: 'bg-white ring-1 ring-inset ring-slate-400' },
    none: { label: 'Không có buổi', dot: 'bg-slate-200' }
};

const FILTERS = {
    all: { label: 'Tất cả', test: () => true },
    warning: { label: 'Vượt/gần ngưỡng', test: (s) => Boolean(s.warning) && s.warning.level !== 'ok' },
    absent: { label: 'Có buổi vắng', test: (s) => s.absent > 0 },
    late: { label: 'Có đi muộn', test: (s) => s.late > 0 },
    full: { label: 'Đủ buổi', test: (s) => s.totalSessions > 0 && s.absent === 0 }
};

const SORTERS = {
    code: (s) => s.code,
    name: (s) => (s.name || '').split(' ').pop(),
    administrativeClass: (s) => s.administrativeClass || '',
    attended: (s) => s.attended,
    late: (s) => s.late,
    absent: (s) => s.absent,
    rate: (s) => s.rate,
    warning: (s) => s.warning?.absentPercent ?? -1
};

const fmtDay = (key) => {
    const [, m, d] = key.split('-');
    return `${d}/${m}`;
};
const fmtFullDate = (key) => {
    const [y, m, d] = (key || '').split('-');
    return d ? `${d}/${m}/${y}` : '';
};
const fmtTime = (value) => (value
    ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '');

const SortTh = ({ label, k, sort, onSort, className = '' }) => (
    <th className={`px-3 py-2.5 whitespace-nowrap ${className}`}>
        <button
            type="button"
            onClick={() => onSort(k)}
            className={`inline-flex items-center gap-1 font-bold uppercase hover:text-action-blue ${sort.key === k ? 'text-action-blue' : ''}`}
        >
            {label}
            <span className="text-[9px]">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
    </th>
);

const ClassStudentAttendanceModal = ({ classItem, mode, anchorDate, semester, administrativeClass, periodLabel, onClose }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState({ key: 'absent', dir: 'desc' }); // vắng nhiều nhất lên đầu

    useEffect(() => {
        if (!classItem) return undefined;
        let cancelled = false;
        setLoading(true);
        setError('');
        setData(null);
        setQuery('');
        setFilter('all');
        fetchClassStudentReport({ classId: classItem.id, mode, anchorDate, semester, administrativeClass })
            .then((res) => { if (!cancelled) setData(res || null); })
            .catch((err) => { if (!cancelled) setError(err?.message || 'Không tải được chuyên cần của lớp.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [administrativeClass, anchorDate, classItem, mode, semester]);

    const students = useMemo(() => data?.students || [], [data]);
    const dates = data?.dates || [];
    const totals = data?.totals;
    const warningInfo = data?.warning;
    const plan = warningInfo?.plan;
    const unmarkedCount = data?.unmarkedDates?.length || 0;
    const unmarkedSet = useMemo(() => new Set(data?.unmarkedDates || []), [data]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return students
            .filter(FILTERS[filter].test)
            .filter((s) => !q || s.code.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))
            .sort((a, b) => {
                const va = SORTERS[sort.key](a);
                const vb = SORTERS[sort.key](b);
                const d = typeof va === 'string' ? va.localeCompare(vb, 'vi') : va - vb;
                return (sort.dir === 'asc' ? d : -d) || a.code.localeCompare(b.code);
            });
    }, [filter, query, sort, students]);

    const toggleSort = (key) => setSort((prev) => ({
        key,
        dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : (['code', 'name', 'administrativeClass'].includes(key) ? 'asc' : 'desc')
    }));

    if (!classItem) return null;
    const period = data?.period ? `${fmtFullDate(data.period.start)} – ${fmtFullDate(data.period.end)}` : periodLabel;

    return (
        <SimpleModal isOpen title={`Chuyên cần lớp ${classItem.code}`} size="xl" onClose={onClose}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-base font-bold text-midnight-indigo">{classItem.subject}</p>
                        <p className="text-xs text-slate-blue mt-0.5">
                            <span className="font-mono font-semibold text-action-blue">{classItem.code}</span>
                            {classItem.room ? ` · ${classItem.room}` : ''}
                            {classItem.semester ? ` · ${classItem.semester}` : ''}
                            {administrativeClass && administrativeClass !== 'all' ? ` · chỉ SV lớp ${administrativeClass}` : ''}
                        </p>
                    </div>
                    <div className="text-right text-xs text-slate-blue">
                        <p>Khoảng thống kê: <b className="text-midnight-indigo">{period}</b></p>
                        {totals && (
                            <p className="mt-0.5">
                                <b className="text-midnight-indigo">{students.length}</b> SV · <b className="text-midnight-indigo">{totals.sessionsHeld}</b> buổi đã điểm danh
                                {unmarkedCount > 0 && <span className="text-amber-700"> · {unmarkedCount} buổi chưa điểm danh</span>}
                            </p>
                        )}
                        {plan && (
                            <p className="mt-0.5">
                                TKB cả kỳ: <b className="text-midnight-indigo">{plan.plannedSessions}</b> buổi
                                {plan.scheduleIncomplete && <span className="ml-1 px-1.5 py-px rounded bg-amber-50 text-amber-700 text-[10px] font-bold" title="Tổng tiết đồng bộ < tín chỉ × 15">TKB chưa đủ kỳ</span>}
                            </p>
                        )}
                    </div>
                </div>

                {loading && (
                    <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-blue">
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải chuyên cần…
                    </div>
                )}
                {error && <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{error}</div>}

                {totals && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <StatCard label="Lượt cần điểm danh" value={totals.totalSessions} hint={`${students.length} SV × ${totals.sessionsHeld} buổi`} />
                            <StatCard label="Có mặt" value={totals.attended} hint={`${totals.rate}% số lượt`} tone="green" />
                            <StatCard label="Đi muộn" value={totals.late} tone="amber" />
                            <StatCard label="Vắng" value={totals.absent} hint="Không có lượt quét/điểm danh" tone="red" />
                        </div>

                        {warningInfo && (
                            <div className={`px-3 py-2.5 rounded-xl border space-y-1 ${warningInfo.exceeded > 0 ? 'border-red-200 bg-red-50/60' : warningInfo.near > 0 ? 'border-amber-200 bg-amber-50/60' : 'border-platinum-tint bg-cloud-mist/30'}`}>
                                <p className="text-xs font-bold text-midnight-indigo">
                                    Cảnh báo vắng cả học kỳ: <span className="text-red-600">{warningInfo.exceeded} vượt ngưỡng</span> · <span className="text-amber-700">{warningInfo.near} gần ngưỡng</span>
                                </p>
                                <ThresholdNote threshold={warningInfo.threshold} provisional={warningInfo.provisional} />
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-slate-blue absolute left-2.5 top-2.5" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Tìm MSSV, họ tên"
                                    className="pl-8 pr-3 py-2 w-56 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            {Object.entries(FILTERS).map(([key, f]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setFilter(key)}
                                    className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${filter === key ? 'border-action-blue bg-blue-50 text-action-blue' : 'border-platinum-tint text-slate-blue hover:text-midnight-indigo'}`}
                                >
                                    {f.label} <span className="font-semibold opacity-70">{students.filter(f.test).length}</span>
                                </button>
                            ))}
                            <div className="ml-auto flex flex-wrap gap-3 text-[11px] text-slate-blue">
                                {Object.entries(DAY_STATUS).map(([key, st]) => (
                                    <span key={key} className="inline-flex items-center gap-1"><i className={`inline-block w-2.5 h-2.5 rounded-full ${st.dot}`} />{st.label}</span>
                                ))}
                            </div>
                        </div>

                        <div className="border border-platinum-tint rounded-xl overflow-auto max-h-[55vh]">
                            <table className="w-full text-xs">
                                <thead className="bg-cloud-mist text-[10px] text-slate-blue text-left sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                                        <SortTh label="MSSV" k="code" sort={sort} onSort={toggleSort} />
                                        <SortTh label="Họ tên" k="name" sort={sort} onSort={toggleSort} />
                                        <SortTh label="Lớp HC" k="administrativeClass" sort={sort} onSort={toggleSort} />
                                        <SortTh label="Có mặt" k="attended" sort={sort} onSort={toggleSort} className="text-right" />
                                        <SortTh label="Muộn" k="late" sort={sort} onSort={toggleSort} className="text-right" />
                                        <SortTh label="Vắng" k="absent" sort={sort} onSort={toggleSort} className="text-right" />
                                        <SortTh label="Tỷ lệ" k="rate" sort={sort} onSort={toggleSort} />
                                        {warningInfo && <SortTh label="Vắng cả kỳ" k="warning" sort={sort} onSort={toggleSort} />}
                                        {dates.map((d) => (
                                            <th
                                                key={d}
                                                className={`px-1 py-2.5 text-center font-semibold whitespace-nowrap ${unmarkedSet.has(d) ? 'text-steel-gray line-through' : ''}`}
                                                title={unmarkedSet.has(d) ? `${fmtFullDate(d)} · cả lớp chưa có bản ghi điểm danh — không tính vắng` : fmtFullDate(d)}
                                            >
                                                {fmtDay(d)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint/60">
                                    {rows.length === 0 && (
                                        <tr><td colSpan={(warningInfo ? 9 : 8) + dates.length} className="px-3 py-8 text-center text-slate-blue">Không có sinh viên nào khớp.</td></tr>
                                    )}
                                    {rows.map((s, i) => (
                                        <tr key={s.code} className={`hover:bg-cloud-mist/30 ${WARNING_LEVELS[s.warning?.level]?.row || ''}`}>
                                            <td className="px-3 py-2 text-center text-slate-blue">{i + 1}</td>
                                            <td className="px-3 py-2 font-mono text-slate-blue whitespace-nowrap">{s.code}</td>
                                            <td className="px-3 py-2 font-semibold text-midnight-indigo whitespace-nowrap">{s.name}</td>
                                            <td className="px-3 py-2 text-slate-blue whitespace-nowrap">{s.administrativeClass || '—'}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">{s.attended}/{s.totalSessions}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-amber-700">{s.late}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-red-600">{s.absent}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {s.totalSessions > 0 ? (
                                                    <span className={`font-bold ${s.rate >= 80 ? 'text-emerald-700' : s.rate >= 50 ? 'text-amber-700' : 'text-red-600'}`}>{s.rate}%</span>
                                                ) : <span className="text-steel-gray">—</span>}
                                            </td>
                                            {warningInfo && (
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {s.warning ? (
                                                        <span className="inline-flex items-center gap-1.5" title={`Vắng ${s.warning.absent}/${s.warning.plannedSessions} buổi theo TKB cả kỳ · được vắng tối đa ${s.warning.allowedAbsences} buổi`}>
                                                            <b className="text-midnight-indigo">{s.warning.absent}/{s.warning.plannedSessions}</b>
                                                            <span className="text-slate-blue">({s.warning.absentPercent}%)</span>
                                                            {s.warning.level !== 'ok' && <WarningBadge level={s.warning.level} />}
                                                        </span>
                                                    ) : <span className="text-steel-gray">—</span>}
                                                </td>
                                            )}
                                            {s.days.map((day) => {
                                                const st = DAY_STATUS[day.status] || DAY_STATUS.none;
                                                const time = day.checkInAt ? ` · vào ${fmtTime(day.checkInAt)}${day.checkOutAt ? `, ra ${fmtTime(day.checkOutAt)}` : ''}` : '';
                                                return (
                                                    <td key={day.date} className="px-1 py-2 text-center">
                                                        <i className={`inline-block w-3 h-3 rounded-full ${st.dot}`} title={`${fmtFullDate(day.date)} · ${st.label}${time}`} />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-steel-gray">
                            Vắng = buổi đã diễn ra theo thời khóa biểu nhưng không có lượt camera quét hoặc điểm danh tay của SV. Buổi bị hủy, buổi chưa tới giờ và buổi cả lớp chưa có bản ghi điểm danh (camera chưa quét/GV chưa điểm danh) không tính.
                        </p>
                    </>
                )}
            </div>
        </SimpleModal>
    );
};

export default ClassStudentAttendanceModal;
