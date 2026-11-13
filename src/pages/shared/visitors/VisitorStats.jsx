import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, FileBarChart, Filter, X } from 'lucide-react';
import { getVisitorStats, getVisitorLookups } from '../../../service/visitorService';
import { formatCell } from '../../../utils/reportFormat';
import useAreaBase from '../../../hooks/useAreaBase';
import KpiTiles from '../../../components/report/KpiTiles';
import CrossFilterChart from './CrossFilterChart';
import { pageCls, cardCls, inputCls, labelCls, btnGhost, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';

// S7 (2.10): thống kê khách theo đơn vị và theo thời gian.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const rangeOf = (preset) => {
    const today = new Date();
    const back = (days) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
    if (preset === 'week') return { from: ymd(back((today.getDay() + 6) % 7)), to: ymd(today) };
    if (preset === 'month') return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    return { from: ymd(back(89)), to: ymd(today) };
};

const PRESETS = [['week', 'Tuần này'], ['month', 'Tháng này'], ['quarter', '90 ngày'], ['custom', 'Tùy chọn']];
const GROUPS = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']];

const KPIS = [
    ['totalVisits', 'Tổng lượt', 'number'],
    ['uniqueVisitors', 'Khách duy nhất', 'number'],
    ['avgStayMinutes', 'Lưu trú TB', 'minutes'],
    ['overstayCount', 'Lượt quá giờ', 'number'],
    ['noShowRate', 'Tỷ lệ không đến', 'percent'],
];

const series = [{ key: 'count', label: 'Lượt khách' }];
// dim + keyOf: chiều lọc chéo gửi lên BE (tham số `cross`) và khóa của từng mục để ghép dữ liệu đã lọc.
const CHARTS = [
    { key: 'byPeriod', title: 'Lượt khách theo thời gian', kind: 'line', xKey: 'bucket', series, wide: true, dim: 'period', keyOf: (r) => r.key },
    { key: 'byDepartment', title: 'Theo đơn vị tiếp', kind: 'bar', xKey: 'name', series, dim: 'department', keyOf: (r) => r.departmentId ?? '' },
    { key: 'byPurpose', title: 'Theo mục đích', kind: 'pie', xKey: 'purpose', series, dim: 'purpose', keyOf: (r) => r.purpose },
    { key: 'byHour', title: 'Phân bố giờ đến', kind: 'bar', xKey: 'hour', series, dim: 'hour', keyOf: (r) => String(parseInt(r.hour, 10)) },
    { key: 'topOrganizations', title: 'Đơn vị công tác của khách (top 8)', kind: 'bar', xKey: 'organization', series, dim: 'organization', keyOf: (r) => r.organization },
];
const chartOf = (key) => CHARTS.find((c) => c.key === key);
const baseRows = (stats, config) => stats[config.key].filter((item) => config.key === 'byPeriod' || config.key === 'byHour' || item.count > 0);

const VisitorStats = () => {
    const base = useAreaBase();
    const [departments, setDepartments] = useState([]);
    const [filters, setFilters] = useState(() => ({ preset: 'quarter', ...rangeOf('quarter'), departmentId: '', groupBy: 'week' }));
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    // Lọc chéo kiểu Power BI: chọn nhiều mục trong 1 biểu đồ (bấm 1 lần chọn, bấm lại bỏ chọn).
    // { chart, values: [{ key, label }] } — bấm sang biểu đồ khác thì bắt đầu lựa chọn mới ở biểu đồ đó.
    const [selection, setSelection] = useState(null);
    const [crossStats, setCrossStats] = useState(null);
    const [crossError, setCrossError] = useState(null);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setDepartments(res.data.departments); });
    }, []);

    const load = useCallback(async () => {
        const { preset, ...params } = filters;
        const res = await getVisitorStats(params);
        if (res?.success) {
            setStats(res.data);
            setError(null);
        } else {
            setStats(null);
            setError(res?.message || 'Không tải được thống kê');
        }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    // Đổi bộ lọc trên → lựa chọn cũ không còn ý nghĩa.
    useEffect(() => { setSelection(null); }, [filters]);

    const crossParam = useMemo(() => {
        if (!selection?.values.length) return null;
        return JSON.stringify({ dim: chartOf(selection.chart).dim, values: selection.values.map((v) => v.key) });
    }, [selection]);

    useEffect(() => {
        setCrossStats(null);
        setCrossError(null);
        if (!crossParam) return undefined;
        let cancelled = false;
        const { preset, ...params } = filters;
        getVisitorStats({ ...params, cross: crossParam }).then((res) => {
            if (cancelled) return;
            if (res?.success) setCrossStats(res.data);
            else setCrossError(res?.message || 'Không lọc được theo lựa chọn');
        });
        return () => { cancelled = true; };
    }, [crossParam, filters]);

    const toggleValue = useCallback((chartKey, key, label) => {
        setSelection((prev) => {
            if (!prev || prev.chart !== chartKey) return { chart: chartKey, values: [{ key, label }] };
            const exists = prev.values.some((v) => v.key === key);
            const values = exists ? prev.values.filter((v) => v.key !== key) : [...prev.values, { key, label }];
            return values.length ? { ...prev, values } : null;
        });
    }, []);

    const toggleSelect = useCallback((config, row) => {
        const key = config.keyOf(row);
        if (key === undefined || key === null) return; // dữ liệu chưa có khóa (vd. mock không trả `key` của kỳ)
        toggleValue(config.key, key, String(row[config.xKey]));
    }, [toggleValue]);

    const chartViews = useMemo(() => {
        if (!stats) return [];
        return CHARTS.map((config) => {
            const rows = baseRows(stats, config);
            if (!selection) return { config, mode: 'none', rows };
            if (selection.chart === config.key) {
                const picked = new Set(selection.values.map((v) => v.key));
                return { config, mode: 'source', rows: rows.map((r) => ({ ...r, selected: picked.has(config.keyOf(r)) })) };
            }
            if (!crossStats) return { config, mode: 'none', rows };
            const related = new Map(crossStats[config.key].map((r) => [config.keyOf(r), r.count]));
            return { config, mode: 'highlight', rows: rows.map((r) => ({ ...r, hl: related.get(config.keyOf(r)) || 0 })) };
        });
    }, [stats, selection, crossStats]);

    const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
    const choosePreset = (preset) => set(preset === 'custom' ? { preset } : { preset, ...rangeOf(preset) });
    const isCustom = filters.preset === 'custom';

    const kpiSource = selection && crossStats ? crossStats : stats;
    const kpiItems = useMemo(() => (kpiSource ? KPIS.map(([key, label, format]) => ({ key, label, value: formatCell(kpiSource.kpis[key], format) })) : []), [kpiSource]);

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <BarChart3 className="w-6 h-6 text-action-blue" />
                        Thống kê khách đến làm việc
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Lượt khách theo đơn vị tiếp và theo thời gian, mục đích, giờ cao điểm.</p>
                </div>
                <Link to={`${base}/reports/visitor`} className={btnGhost}>
                    <FileBarChart className="w-4 h-4" /> Mở báo cáo để xuất
                </Link>
            </div>

            <div className={`${cardCls} p-4 flex flex-wrap gap-4 items-end`}>
                <div className="space-y-1">
                    <span className={labelCls}>Kỳ thống kê</span>
                    <div className="flex rounded-xl border border-platinum-tint overflow-hidden">
                        {PRESETS.map(([key, label]) => (
                            <button key={key} type="button" onClick={() => choosePreset(key)} className={`px-3 py-2 text-xs font-semibold ${filters.preset === key ? 'bg-action-blue text-white' : 'bg-white text-slate-blue hover:bg-cloud-mist'}`}>{label}</button>
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vs-from">Từ ngày</label>
                    <input id="vs-from" type="date" className={`${inputCls} disabled:opacity-60`} disabled={!isCustom} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vs-to">Đến ngày</label>
                    <input id="vs-to" type="date" className={`${inputCls} disabled:opacity-60`} disabled={!isCustom} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vs-dep">Đơn vị tiếp</label>
                    <select id="vs-dep" className={inputCls} value={filters.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
                        <option value="">Tất cả</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vs-group">Nhóm theo</label>
                    <select id="vs-group" className={inputCls} value={filters.groupBy} onChange={(e) => set({ groupBy: e.target.value })}>
                        {GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </div>
            </div>

            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !stats && <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>}

            {stats && (
                <>
                    {selection ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-midnight-indigo">
                            <Filter className="w-4 h-4 text-action-blue shrink-0" />
                            <span className="font-semibold">{chartOf(selection.chart).title}:</span>
                            {selection.values.map((v) => (
                                <span key={v.key} className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-2.5 py-0.5 font-semibold text-action-blue">
                                    {v.label}
                                    <button type="button" aria-label={`Bỏ chọn ${v.label}`} onClick={() => toggleValue(selection.chart, v.key, v.label)}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                            {!crossStats && !crossError && <span className="text-slate-blue">Đang lọc…</span>}
                            {crossError && <span className="text-red-600">{crossError}</span>}
                            <button type="button" onClick={() => setSelection(null)} className="ml-auto font-bold text-action-blue hover:underline">
                                Bỏ lọc
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-blue">Bấm vào cột, điểm hoặc lát biểu đồ để lọc các biểu đồ còn lại; bấm thêm mục khác để chọn nhiều, bấm lại để bỏ chọn.</p>
                    )}
                    <KpiTiles items={kpiItems} />
                    <div className="grid lg:grid-cols-2 gap-6">
                        {chartViews.map(({ config, mode, rows }) => (
                            <div key={config.key} className={config.wide ? 'lg:col-span-2' : ''}>
                                <CrossFilterChart config={config} rows={rows} mode={mode} onSelect={(row) => toggleSelect(config, row)} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default VisitorStats;
