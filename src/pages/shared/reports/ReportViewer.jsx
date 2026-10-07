import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, FileBarChart } from 'lucide-react';
import { getReportDefinition } from '../../../config/reportDefinitions';
import { getReportLookups, getReportPreview, exportReport } from '../../../service/reportCenterService';
import { formatCell } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import ReportFilterBar, { defaultFilterValue } from '../../../components/report/ReportFilterBar';
import KpiTiles from '../../../components/report/KpiTiles';
import ReportChart from '../../../components/report/ReportChart';
import ReportTable from '../../../components/report/ReportTable';
import ExportMenu from '../../../components/report/ExportMenu';
import ScheduleFormModal from '../../../components/report/ScheduleFormModal';
import { pageCls, cardCls, btnPrimary, btnGhost, errorBoxCls } from '../../../components/common/uiClasses';

// S9 (2.13): một trang dùng chung cho 7 loại báo cáo, dựng từ config/reportDefinitions.
const PAGE_SIZE = 20;

// Bỏ `preset` (chỉ phục vụ giao diện) trước khi gửi cho service.
const toParams = ({ preset, ...rest }) => rest;

// Bộ lọc riêng của báo cáo (không kèm kỳ và ô tìm kiếm) để điền sẵn vào lịch gửi.
const ownFilters = ({ preset, from, to, q, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v));

const ReportViewer = () => {
    const { type } = useParams();
    const base = useAreaBase();
    const definition = getReportDefinition(type);

    const [lookups, setLookups] = useState({});
    const [draft, setDraft] = useState(defaultFilterValue);
    const [applied, setApplied] = useState(defaultFilterValue);
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ key: null, dir: 'asc' });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyFormat, setBusyFormat] = useState(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    // Manager chỉ xem và xuất, không có màn lịch gửi.
    const canSchedule = base !== '/manager';

    useEffect(() => {
        getReportLookups().then((res) => { if (res?.success) setLookups(res.data); });
    }, []);

    // Đổi loại báo cáo trên URL: quay về bộ lọc mặc định.
    useEffect(() => {
        const fresh = defaultFilterValue();
        setDraft(fresh);
        setApplied(fresh);
        setPage(1);
        setSort({ key: null, dir: 'asc' });
        setData(null);
    }, [type]);

    const load = useCallback(async () => {
        if (!definition) return;
        setLoading(true);
        setError(null);
        const res = await getReportPreview(type, {
            ...toParams(applied), page, limit: PAGE_SIZE, sortKey: sort.key || undefined, sortDir: sort.dir,
        });
        if (res?.success) {
            setData(res.data);
        } else {
            setData(null);
            setError(res?.message || 'Không tải được báo cáo');
        }
        setLoading(false);
    }, [definition, type, applied, page, sort]);

    useEffect(() => { load(); }, [load]);

    const scheduleInitial = useMemo(() => ({ reportType: type, filters: ownFilters(applied) }), [type, applied]);

    const kpiItems = useMemo(() => (definition && data ? definition.kpis.map((k) => ({
        key: k.key,
        label: k.label,
        value: formatCell(data.kpis.find((item) => item.key === k.key)?.value, k.format),
    })) : []), [definition, data]);

    if (!definition) {
        return (
            <div className={pageCls}>
                <div className={`${cardCls} p-10 text-center space-y-4`}>
                    <FileBarChart className="w-10 h-10 text-steel-gray mx-auto" />
                    <h2 className="text-lg font-bold text-midnight-indigo">Không tìm thấy báo cáo</h2>
                    <p className="text-xs text-slate-blue">Loại báo cáo "{type}" không tồn tại hoặc đã bị gỡ.</p>
                    <Link to={`${base}/reports`} className={btnPrimary}>Về Trung tâm báo cáo</Link>
                </div>
            </div>
        );
    }

    const Icon = definition.icon;
    const apply = () => { setPage(1); setApplied(draft); };
    const toggleSort = (key) => {
        setPage(1);
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    };
    const handleExport = async (format) => {
        setBusyFormat(format);
        const res = await exportReport(type, { ...toParams(applied), format });
        if (res?.success) toast.success(`Đã xuất ${res.data.fileName}`);
        else toast.error(res?.message || 'Không xuất được báo cáo');
        setBusyFormat(null);
    };

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link to={`${base}/reports`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-blue hover:text-action-blue mb-2">
                        <ArrowLeft className="w-3.5 h-3.5" /> Trung tâm báo cáo
                    </Link>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <Icon className="w-6 h-6 text-action-blue" />
                        Báo cáo {definition.title.toLowerCase()}
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">{definition.description}</p>
                </div>
                <div className="flex items-center gap-2">
                    {canSchedule && (
                        <button type="button" className={btnGhost} onClick={() => setScheduleOpen(true)}>
                            <CalendarClock className="w-4 h-4" /> Đặt lịch gửi
                        </button>
                    )}
                    <ExportMenu onExport={handleExport} disabled={loading || Boolean(error)} busyFormat={busyFormat} />
                </div>
            </div>

            <ReportFilterBar definition={definition} lookups={lookups} value={draft} onChange={setDraft} onApply={apply} loading={loading} />

            {error && <div className={errorBoxCls}>{error}</div>}

            {!error && !data && (
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {!error && data && (
                <>
                    <KpiTiles items={kpiItems} />
                    <div className="grid lg:grid-cols-2 gap-6">
                        {definition.charts.map((config) => (
                            <ReportChart key={config.key} config={config} data={data.charts.find((c) => c.key === config.key)?.data || []} />
                        ))}
                    </div>
                    <ReportTable
                        columns={definition.columns}
                        rows={data.rows}
                        total={data.total}
                        page={page}
                        limit={PAGE_SIZE}
                        sortKey={sort.key}
                        sortDir={sort.dir}
                        onSort={toggleSort}
                        onPageChange={setPage}
                        loading={loading}
                    />
                </>
            )}

            {canSchedule && (
                <ScheduleFormModal
                    isOpen={scheduleOpen}
                    initial={scheduleOpen ? scheduleInitial : null}
                    lookups={lookups}
                    onClose={() => setScheduleOpen(false)}
                    onSaved={(saved) => {
                        setScheduleOpen(false);
                        toast.success(`Đã lưu lịch gửi "${saved.name}". Xem tại mục Lịch gửi báo cáo.`);
                    }}
                />
            )}
        </div>
    );
};

export default ReportViewer;
