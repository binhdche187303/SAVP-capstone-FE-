import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, FileBarChart } from 'lucide-react';
import { getVisitorStats, getVisitorLookups } from '../../../service/visitorService';
import { formatCell } from '../../../utils/reportFormat';
import useAreaBase from '../../../hooks/useAreaBase';
import KpiTiles from '../../../components/report/KpiTiles';
import ReportChart from '../../../components/report/ReportChart';
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
const CHARTS = [
    { key: 'byPeriod', title: 'Lượt khách theo thời gian', kind: 'line', xKey: 'bucket', series, wide: true },
    { key: 'byDepartment', title: 'Theo đơn vị tiếp', kind: 'bar', xKey: 'name', series },
    { key: 'byPurpose', title: 'Theo mục đích', kind: 'pie', xKey: 'purpose', series },
    { key: 'byHour', title: 'Phân bố giờ đến', kind: 'bar', xKey: 'hour', series },
    { key: 'topOrganizations', title: 'Đơn vị công tác của khách (top 8)', kind: 'bar', xKey: 'organization', series },
];

const VisitorStats = () => {
    const base = useAreaBase();
    const [departments, setDepartments] = useState([]);
    const [filters, setFilters] = useState(() => ({ preset: 'quarter', ...rangeOf('quarter'), departmentId: '', groupBy: 'week' }));
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

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

    const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
    const choosePreset = (preset) => set(preset === 'custom' ? { preset } : { preset, ...rangeOf(preset) });
    const isCustom = filters.preset === 'custom';

    const kpiItems = useMemo(() => (stats ? KPIS.map(([key, label, format]) => ({ key, label, value: formatCell(stats.kpis[key], format) })) : []), [stats]);

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
                    <KpiTiles items={kpiItems} />
                    <div className="grid lg:grid-cols-2 gap-6">
                        {CHARTS.map((config) => (
                            <div key={config.key} className={config.wide ? 'lg:col-span-2' : ''}>
                                <ReportChart config={config} data={stats[config.key].filter((item) => config.key === 'byPeriod' || config.key === 'byHour' || item.count > 0)} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default VisitorStats;
