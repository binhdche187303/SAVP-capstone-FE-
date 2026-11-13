import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2, Search } from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Pagination from '../../components/common/Pagination';
import { fetchAttendanceWarnings } from '../../service/classAttendanceService';

export const WARNING_LEVELS = {
    exceeded: { label: 'Vượt ngưỡng', badge: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-50/60' },
    near: { label: 'Gần ngưỡng', badge: 'bg-amber-100 text-amber-800 border-amber-200', row: 'bg-amber-50/60' },
    ok: { label: 'Bình thường', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', row: '' }
};

const LEVEL_FILTERS = {
    all: { label: 'Tất cả', test: () => true },
    exceeded: { label: 'Vượt ngưỡng', test: (r) => r.level === 'exceeded' },
    near: { label: 'Gần ngưỡng', test: (r) => r.level === 'near' }
};

const ROWS_PER_PAGE = 10;

export const WarningBadge = ({ level }) => {
    const item = WARNING_LEVELS[level] || WARNING_LEVELS.ok;
    return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${item.badge}`}>{item.label}</span>;
};

/** Ghi chú ngưỡng: luôn nói rõ đây là mức tạm cho tới khi chốt quy chế UEL. */
export const ThresholdNote = ({ threshold, provisional }) => (
    <p className="flex items-start gap-1.5 text-[11px] text-slate-blue">
        <Info className="w-3.5 h-3.5 mt-px shrink-0 text-action-blue" />
        <span>
            Vượt ngưỡng = số buổi vắng &gt; {threshold}% số buổi theo thời khóa biểu cả học kỳ; gần ngưỡng = vắng từ {threshold / 2}%.
            {provisional && <b className="text-amber-700"> Mức {threshold}% là mức tạm, chưa chốt theo quy chế UEL.</b>}
            {' '}Buổi cả lớp chưa có bản ghi điểm danh không tính vắng.
        </span>
    </p>
);

const AttendanceWarningsPanel = ({ semester, subjectCode, administrativeClass, onOpenClass }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetchAttendanceWarnings({ semester, subjectCode, administrativeClass })
            .then((res) => { if (!cancelled) setData(res || null); })
            .catch((err) => { if (!cancelled) setError(err?.message || 'Không tải được danh sách SV cảnh báo.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [administrativeClass, semester, subjectCode]);

    const allRows = useMemo(() => data?.rows || [], [data]);
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allRows
            .filter(LEVEL_FILTERS[filter].test)
            .filter((r) => !q
                || r.code.toLowerCase().includes(q)
                || (r.name || '').toLowerCase().includes(q)
                || (r.classCode || '').toLowerCase().includes(q));
    }, [allRows, filter, query]);
    const summary = data?.summary;
    const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    const visibleRows = useMemo(
        () => rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE),
        [rows, page]
    );

    // Đổi bộ lọc / tìm kiếm / dữ liệu → về trang 1.
    useEffect(() => { setPage(1); }, [allRows, filter, query]);
    useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

    return (
        <div className="space-y-4">
            {error && <div role="alert" className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600">{error}</div>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Vượt ngưỡng" value={summary?.exceeded ?? '—'} hint="Nguy cơ không đủ điều kiện dự thi" tone="red" />
                <StatCard label="Gần ngưỡng" value={summary?.near ?? '—'} hint="Cần nhắc nhở sớm" tone="amber" />
                <StatCard label="SV được xét" value={summary?.studentsChecked ?? '—'} hint={`Trong ${summary?.classes ?? 0} lớp học phần`} />
                <StatCard
                    label="Lớp TKB chưa đủ kỳ"
                    value={summary?.incompleteClasses ?? '—'}
                    hint="Tổng tiết đồng bộ < tín chỉ × 15 — % vắng có thể chưa chính xác"
                />
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide flex items-center gap-2 mr-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" /> Sinh viên cần cảnh báo
                        </h3>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-blue absolute left-2.5 top-2.5" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Tìm MSSV, họ tên, mã lớp"
                                className="pl-8 pr-3 py-2 w-60 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue"
                            />
                        </div>
                        {Object.entries(LEVEL_FILTERS).map(([key, f]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setFilter(key)}
                                className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${filter === key ? 'border-action-blue bg-blue-50 text-action-blue' : 'border-platinum-tint text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                {f.label} <span className="font-semibold opacity-70">{allRows.filter(f.test).length}</span>
                            </button>
                        ))}
                    </div>
                    {data && <ThresholdNote threshold={data.threshold} provisional={data.provisional} />}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr className="text-left whitespace-nowrap">
                                <th className="px-5 py-3">Sinh viên</th>
                                <th className="px-4 py-3">Lớp HC</th>
                                <th className="px-4 py-3">Lớp học phần</th>
                                <th className="w-px px-4 py-3 text-right" title="Số buổi vắng / số buổi theo TKB cả học kỳ">Vắng cả kỳ</th>
                                <th className="w-px px-4 py-3 text-right">% vắng</th>
                                <th className="w-px px-4 py-3 text-right" title="Số buổi còn được vắng trước khi vượt ngưỡng">Còn được vắng</th>
                                <th className="w-px px-5 py-3">Mức</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-blue">
                                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Đang tính cảnh báo…
                                </td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-blue">
                                    {allRows.length === 0 ? 'Chưa có sinh viên nào vượt hoặc gần ngưỡng vắng.' : 'Không có sinh viên nào khớp bộ lọc.'}
                                </td></tr>
                            )}
                            {!loading && visibleRows.map((r) => (
                                <tr
                                    key={`${r.classId}|${r.code}`}
                                    tabIndex={0}
                                    onClick={() => onOpenClass?.(r.classId)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') onOpenClass?.(r.classId); }}
                                    title="Xem chuyên cần cả lớp theo từng buổi"
                                    className={`border-t border-platinum-tint/70 cursor-pointer hover:bg-blue-50/40 focus:outline-none focus:bg-blue-50/40 ${WARNING_LEVELS[r.level]?.row || ''}`}
                                >
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <p className="font-bold text-midnight-indigo">{r.name}</p>
                                        <p className="text-xs font-mono text-slate-blue">{r.code}</p>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-blue whitespace-nowrap">{r.administrativeClass || '—'}</td>
                                    <td className="px-4 py-3 min-w-[220px]">
                                        <p className="text-xs font-semibold text-midnight-indigo">{r.subject}</p>
                                        <p className="text-[11px] text-slate-blue">
                                            <span className="font-mono font-semibold text-action-blue">{r.classCode}</span>
                                            {r.scheduleIncomplete && <span className="ml-1.5 px-1.5 py-px rounded bg-amber-50 text-amber-700 text-[10px] font-bold" title="TKB đồng bộ chưa đủ cả kỳ">TKB chưa đủ</span>}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">{r.absent}/{r.plannedSessions}</td>
                                    <td className="px-4 py-3 text-right font-bold text-midnight-indigo">{r.absentPercent}%</td>
                                    <td className="px-4 py-3 text-right text-slate-blue">{r.level === 'exceeded' ? '—' : r.remaining}</td>
                                    <td className="px-5 py-3"><WarningBadge level={r.level} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && rows.length > 0 && (
                    <div className="px-5 py-3 border-t border-platinum-tint flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-blue">
                            Hiển thị {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, rows.length)} trong {rows.length} sinh viên
                        </span>
                        <Pagination currentPage={page} totalPages={pageCount} onPageChange={setPage} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceWarningsPanel;
