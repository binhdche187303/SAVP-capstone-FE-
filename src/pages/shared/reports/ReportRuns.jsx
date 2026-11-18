import { totalOf, useFacetCounts } from '../../../hooks/useFilterCounts';
import PageHeading from '../../../components/common/PageHeading';
import FilterMultiSelect from '../../../components/common/FilterMultiSelect';
import './ReportRunsFilters.css';
import CalendarRangePresets from '../../../components/common/CalendarRangePresets';
import ResponsiveTable from '../../../components/common/ResponsiveTable';
import FilterBar from '../../../components/common/FilterBar';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Filter, History, RotateCcw } from 'lucide-react';
import { listScheduleRuns, listSchedules, retryScheduleRun, downloadRunFile } from '../../../service/reportCenterService';
import { formatDateTime } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';

import { FORMAT_LABELS } from '../../../components/report/scheduleLabels';
import { pageCls, cardCls, inputCls, labelCls, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// S11 (2.13): lịch sử các lần gửi báo cáo (theo lịch và gửi thử).

const dmy = (ymd) => String(ymd || '').split('-').reverse().join('/');

const ReportRuns = () => {
    const [PAGE_SIZE, setPageSize] = useState(10);
    const base = useAreaBase();
    const [searchParams] = useSearchParams();
    const [schedules, setSchedules] = useState([]);
    const [filters, setFilters] = useState({ scheduleId: searchParams.get('scheduleId') || '', status: '', from: '', to: '' });
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    // Số đếm cạnh lựa chọn ô "Lịch gửi" / "Trạng thái" (mỗi ô đếm theo các bộ lọc khác).
    const runTotal = (f) => listScheduleRuns({ ...f, page: 1, limit: 1 }).then(totalOf);
    const scheduleCounts = useFacetCounts(filters, 'scheduleId', schedules.map((s) => s.id), runTotal);
    const runStatusCounts = useFacetCounts(filters, 'status', ['success', 'failed'], runTotal);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listScheduleRuns({ ...filters, page, limit: PAGE_SIZE });
            if (res?.success) {
                setData(res.data);
                setError(null);
            } else {
                setError(res?.message || 'Không tải được lịch sử gửi');
            }
        } finally {
            setLoading(false);
        }
    }, [filters, page, PAGE_SIZE]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        listSchedules().then((res) => { if (res?.success) setSchedules(res.data); });
    }, []);

    const change = (patch) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };

    const retry = async (run) => {
        setBusyId(run.id);
        const res = await retryScheduleRun(run.id);
        setBusyId(null);
        if (res?.success) {
            toast.success('Đã gửi lại báo cáo');
            load();
        } else {
            toast.error(res?.message || 'Không gửi lại được');
        }
    };

    const download = async (run, format) => {
        const res = await downloadRunFile(run.id, format);
        if (res?.success) toast.success(`Đã tải ${res.data.fileName}`);
        else toast.error(res?.message || 'Không tải được file');
    };

    const items = data?.items || [];

    return (
        <div data-page-surface="wide" className={pageCls}>
            <div className="border-b border-platinum-tint pb-5">
                <Link to={`${base}/report-schedules`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-blue hover:text-action-blue mb-2">
                    <ArrowLeft className="w-3.5 h-3.5" /> Lịch gửi báo cáo
                </Link>
                <PageHeading badge="Báo cáo" icon={<History className="w-6 h-6 text-action-blue" />} data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    Lịch sử gửi báo cáo
                </PageHeading>
                <p data-page-description className="text-xs text-slate-blue mt-1">Từng lần hệ thống tạo và gửi báo cáo: kết quả, người nhận, file đính kèm.</p>
            </div>

            <FilterBar variant="card" className="report-runs-filters">
                <div className="report-runs-filter-main">
                <div className="camai-filter-field space-y-1">
                    <label className={labelCls} htmlFor="rr-schedule">Lịch gửi</label>
                    <FilterMultiSelect id="rr-schedule" counts={scheduleCounts} className={inputCls} value={filters.scheduleId} onChange={(e) => change({ scheduleId: e.target.value })}>
                        <option value="">Tất cả</option>
                        {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </FilterMultiSelect>
                </div>
                <div className="camai-filter-field space-y-1">
                    <label className={labelCls} htmlFor="rr-status">Trạng thái</label>
                    <FilterMultiSelect singleSelect id="rr-status" counts={runStatusCounts} className={inputCls} value={filters.status} onChange={(e) => change({ status: e.target.value })}>
                        <option value="">Tất cả</option>
                        <option value="success">Thành công</option>
                        <option value="failed">Thất bại</option>
                    </FilterMultiSelect>
                </div>
                </div>
                <div className="report-runs-filter-time">
                <CalendarRangePresets from={filters.from} to={filters.to} onChange={range => { change(range); }} />
                <div className="report-runs-filter-dates">
                <div className="camai-filter-field space-y-1">
                    <label className={labelCls} htmlFor="rr-from">Từ ngày</label>
                    <input id="rr-from" type="date" className={inputCls} value={filters.from} onChange={(e) => change({ from: e.target.value })} />
                </div>
                <div className="camai-filter-field space-y-1">
                    <label className={labelCls} htmlFor="rr-to">Đến ngày</label>
                    <input id="rr-to" type="date" className={inputCls} value={filters.to} onChange={(e) => change({ to: e.target.value })} />
                </div>
                </div>
                <button type="button" data-filter-action
                    className="report-runs-filter-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                    onClick={() => {
                        setFilters({ scheduleId: '', status: '', from: '', to: '' });
                        setPage(1);
                    }}>
                    <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                </button>
                </div>
            </FilterBar>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full">
<colgroup>
<col style={{ width: '12%' }} />
<col style={{ width: '14%' }} />
<col style={{ width: '14%' }} />
<col style={{ width: '13%' }} />
<col style={{ width: '7%' }} />
<col style={{ width: '15%' }} />
<col style={{ width: '11%' }} />
<col style={{ width: '6%' }} />
<col style={{ width: '8%' }} />
</colgroup>
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Thời điểm chạy', 'Lịch gửi', 'Báo cáo', 'Kỳ dữ liệu', 'Loại', 'Người nhận', 'Trạng thái', 'File', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-blue">{data ? 'Không có lần chạy nào phù hợp' : 'Đang tải dữ liệu...'}</td></tr>
                            ) : items.map((run) => (
                                <tr key={run.id} className="border-b border-pale-gray last:border-0 align-top">
                                    <td className={tdCls}>{formatDateTime(run.ranAt)}</td>
                                    <td className={`${tdCls} font-semibold`}>{run.scheduleName}</td>
                                    <td className={tdCls}>{run.reportTitle}</td>
                                    <td className={tdCls}>{dmy(run.from)} – {dmy(run.to)}</td>
                                    <td className={tdCls}>{run.trigger === 'manual' ? 'Gửi thử' : 'Theo lịch'}</td>
                                    <td className={tdCls}>{run.recipientCount} người</td>
                                    <td className={`${tdCls} whitespace-normal`}>
                                        {run.status === 'success' ? (
                                            <span data-ui-text="badge" className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-green-700 bg-green-50">Thành công</span>
                                        ) : (
                                            <div className="space-y-1">
                                                <span data-ui-text="badge" className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-red-700 bg-red-50">Thất bại</span>
                                                <p data-ui-text="secondary" className="text-[11px] text-red-700">{run.error}</p>
                                                {run.retriedByRunId && <p data-ui-text="primary" className="text-[11px] font-semibold text-slate-blue">Đã gửi lại</p>}
                                            </div>
                                        )}
                                    </td>
                                    <td className={tdCls}>
                                        {run.status === 'success' ? (
                                            <span className="flex gap-1">
                                                {run.formats.map((format) => (
                                                    <button data-ui-text="action" key={format} type="button" onClick={() => download(run, format)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-platinum-tint text-[11px] font-semibold text-midnight-indigo hover:bg-cloud-mist">
                                                        <Download className="w-3 h-3" /> {FORMAT_LABELS[format]}
                                                    </button>
                                                ))}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className={`${tdCls} text-right`}>
                                        {run.status === 'failed' && !run.retriedByRunId && (
                                            <button type="button" aria-label="Gửi lại" disabled={busyId === run.id} onClick={() => retry(run)} className="inline-flex items-center gap-1 text-action-blue font-semibold hover:underline disabled:opacity-50">
                                                <RotateCcw className="w-3.5 h-3.5" /> Gửi lại
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </ResponsiveTable>
                </div>
                <PaginationFooter
                    loading={loading}
                    currentPage={page}
                    totalPages={Math.ceil((data?.total || 0) / PAGE_SIZE)}
                    totalItems={data?.total || 0}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    itemLabel={"lần chạy"}
                 onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
            </div>
        </div>
    );
};

export default ReportRuns;
