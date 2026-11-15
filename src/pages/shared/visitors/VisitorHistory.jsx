import CalendarRangePresets from '../../../components/common/CalendarRangePresets';
import PaginatedCollection from '../../../components/common/PaginatedCollection';
import ReportExportButton from '../../../components/common/ReportExportButton';
import FilterBar from '../../../components/common/FilterBar';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { useCallback, useEffect, useState } from 'react';
import { Download, Filter, History, Search } from 'lucide-react';
import { listVisits, listVisitsOfVisitor, getVisitorLookups } from '../../../service/visitorService';
import { exportReport } from '../../../service/reportCenterService';
import { formatDuration } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import './VisitorHistory.css';
import './VisitorListFilters.css';

import SimpleModal from '../../../components/common/SimpleModal';
import ExportModeDialog from '../../../components/report/ExportModeDialog';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { fmtDateTime, fmtTimeRange, fmtScore } from '../../../components/visitor/visitLabels';
import { cardCls, inputCls, searchInputCls, labelCls, btnGhost, errorBoxCls } from '../../../components/common/uiClasses';

// S6 (2.10): tra cứu lịch sử khách đến theo khách, đơn vị, người gặp, thời gian.

const historyThCls = 'px-2 py-3 text-left text-[10px] font-bold text-slate-blue uppercase whitespace-normal';
const historyTdCls = 'px-2 py-3 text-xs text-midnight-indigo whitespace-normal break-words align-top';
const formatVisitDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};
const formatVisitTime = (from, to) => {
    if (!from || !to) return '—';
    const start = new Date(from);
    const end = new Date(to);
    return `${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}`;
};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const last30Days = () => {
    const today = new Date();
    return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: ymd(today) };
};
const staySeconds = (visit) => (visit.checkInAt && visit.checkOutAt ? (new Date(visit.checkOutAt) - new Date(visit.checkInAt)) / 1000 : null);

const VisitorHistory = () => {
    const [PAGE_SIZE, setPageSize] = useState(10);
    const [lookups, setLookups] = useState({ departments: [], zones: [] });
    const [filters, setFilters] = useState(() => ({ q: '', departmentId: '', ...last30Days() }));
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [profile, setProfile] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [askMode, setAskMode] = useState(false);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
    }, []);

    useEffect(() => {
        if (query === filters.q) return undefined;
        const timer = setTimeout(() => { setPage(1); setFilters((f) => (f.q === query ? f : { ...f, q: query })); }, 300);
        return () => clearTimeout(timer);
    }, [query, filters.q]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listVisits({ ...filters, page, limit: PAGE_SIZE });
            if (res?.success) {
                setData(res.data);
                setError(null);
            } else {
                setError(res?.message || 'Không tải được lịch sử khách');
            }
        } finally {
            setLoading(false);
        }
    }, [filters, page, PAGE_SIZE]);

    useEffect(() => { load(); }, [load]);

    const change = (patch) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };

    const openProfile = async (visit) => {
        const res = await listVisitsOfVisitor(visit.id);
        if (res?.success) setProfile({ visitor: visit.visitor, visits: res.data });
        else toast.error(res?.message || 'Không tải được các lượt của khách');
    };

    // Hỏi bản thường / bản quy chuẩn trước khi xuất.
    const exportExcel = () => {
        if (!filters.from || !filters.to) {
            toast.warning('Chọn đủ từ ngày và đến ngày trước khi xuất');
            return;
        }
        setAskMode(true);
    };

    const runExport = async (extra, options) => {
        setExporting(true);
        const res = await exportReport('visitor', { ...filters, format: options.format, ...extra }, { autoDownload: false });
        setExporting(false);
        if (res?.success) { toast.success(`Đã xuất ${res.data.fileName}`); if (!res.data?.downloadUrl) setAskMode(false); }
        else toast.error(res?.message || 'Không xuất được file');
        return res;
    };

    const items = data?.items || [];

    return (
        <div className="w-full min-w-0 space-y-5">
            <ExportModeDialog isOpen={askMode} formats={['xlsx', 'pdf', 'docx']} reportType="visitor" initialRange={{ from: filters.from, to: filters.to }} filterSummary={[filters.q ? `Tìm kiếm: ${filters.q}` : 'Tất cả khách', filters.departmentId ? `Đơn vị: ${lookups.departments.find(item => item.id === filters.departmentId)?.name || filters.departmentId}` : 'Tất cả đơn vị']} onClose={() => setAskMode(false)} onConfirm={runExport} />
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <History className="w-6 h-6 text-action-blue" />
                        Lịch sử khách đến
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Tra cứu mọi lượt khách theo người, đơn vị và thời gian, kèm các mốc camera ghi nhận.</p>
                </div>
                <ReportExportButton label="Xuất báo cáo" busy={exporting} type="button" legacyClassName={btnGhost} onClick={exportExcel} disabled={exporting}>
                    <Download className="w-4 h-4" /> {exporting ? 'Đang xuất…' : 'Xuất báo cáo'}
                </ReportExportButton>
            </div>

            <FilterBar variant="card" className="visitor-list-filters">
                <div className="visitor-list-filter-main">
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="vh-q">Tìm kiếm</label>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                            <input id="vh-q" className={searchInputCls} placeholder="Tên, SĐT hoặc mã lượt" title="Tìm theo tên, số giấy tờ, điện thoại hoặc mã lượt" value={query} onChange={(e) => setQuery(e.target.value)} />
                        </div>
                    </div>
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="vh-dep">Đơn vị tiếp</label>
                        <select id="vh-dep" className={inputCls} value={filters.departmentId} onChange={(e) => change({ departmentId: e.target.value })}>
                            <option value="">Tất cả</option>
                            {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="visitor-list-filter-time">
                    <CalendarRangePresets from={filters.from} to={filters.to} onChange={range => { change(range); }} />
                    <div className="visitor-list-filter-dates">
                        <div className="camai-filter-field space-y-1">
                            <label className={labelCls} htmlFor="vh-from">Từ ngày</label>
                            <input id="vh-from" type="date" className={inputCls} value={filters.from} onChange={(e) => change({ from: e.target.value })} />
                        </div>
                        <div className="camai-filter-field space-y-1">
                            <label className={labelCls} htmlFor="vh-to">Đến ngày</label>
                            <input id="vh-to" type="date" className={inputCls} value={filters.to} onChange={(e) => change({ to: e.target.value })} />
                        </div>
                    </div>
                    <button type="button" data-filter-action
                        className="visitor-list-filter-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                        onClick={() => {
                            setQuery('');
                            setFilters({ q: '', departmentId: '', ...last30Days() });
                            setPage(1);
                        }}>
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
            </FilterBar>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="visitor-history-results">
                    <table className="visitor-history-table w-full table-fixed">
                        <colgroup>
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[17%]" />
                            <col className="w-[8%]" />
                            <col className="w-[9%]" />
                            <col className="w-[9%]" />
                            <col className="w-[5%]" />
                            <col className="w-[5%]" />
                            <col className="w-[14%]" />
                            <col className="w-[6%]" />
                        </colgroup>
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Giờ hẹn', 'Khách', 'Đơn vị công tác', 'Người gặp / Đơn vị tiếp', 'Mục đích', 'Giờ vào', 'Giờ ra', 'Lưu trú', 'Độ khớp', 'Trạng thái', ''].map((h) => <th key={h} title={h} className={historyThCls}>{h === 'Người gặp / Đơn vị tiếp' ? <><span className="block whitespace-nowrap">Người gặp /</span>{' '}<span className="block whitespace-nowrap">Đơn vị tiếp</span></> : h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr><td colSpan={11} className="px-4 py-10 text-center text-xs text-slate-blue">{data ? 'Không có lượt khách nào trong khoảng đã chọn' : 'Đang tải dữ liệu…'}</td></tr>
                            ) : items.map((visit) => (
                                <tr key={visit.id} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40">
                                    <td data-label="Giờ hẹn" className={historyTdCls}>
                                        <div>
                                            <p className="whitespace-nowrap">{formatVisitDate(visit.scheduledFrom)}</p>
                                            <p data-ui-text="secondary" className="text-[11px] text-slate-blue mt-0.5">{formatVisitTime(visit.scheduledFrom, visit.scheduledTo)}</p>
                                        </div>
                                    </td>
                                    <td data-label="Khách" className={historyTdCls}>
                                        <button data-ui-text="primary" type="button" title={visit.visitor.fullName} aria-label={`Xem các lượt của ${visit.visitor.fullName}`} className="font-semibold text-action-blue hover:underline" onClick={() => openProfile(visit)}>{visit.visitor.fullName}</button>
                                    </td>
                                    <td data-label="Đơn vị công tác" title={visit.visitor.organization} className={historyTdCls}>{visit.visitor.organization || '—'}</td>
                                    <td data-label="Người gặp / Đơn vị tiếp" className={historyTdCls}>
                                        <p className="font-semibold">{visit.hostName}</p>
                                        <p data-ui-text="secondary" className="text-[11px] text-slate-blue">{visit.departmentName}</p>
                                    </td>
                                    <td data-label="Mục đích" title={visit.purpose} className={historyTdCls}>{visit.purpose}</td>
                                    <td data-label="Giờ vào" className={historyTdCls}>{fmtDateTime(visit.checkInAt)}</td>
                                    <td data-label="Giờ ra" className={historyTdCls}>{fmtDateTime(visit.checkOutAt)}</td>
                                    <td data-label="Lưu trú" className={historyTdCls}>{formatDuration(staySeconds(visit))}</td>
                                    <td data-label="Độ khớp" className={historyTdCls}>{fmtScore(visit.faceScore)}</td>
                                    <td data-label="Trạng thái" className={historyTdCls}><VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} /></td>
                                    <td data-label="Thao tác" className={`${historyTdCls} text-right`}>
                                        <button type="button" className="text-action-blue font-semibold hover:underline" onClick={() => setDetailId(visit.id)}>Chi tiết</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <PaginationFooter
                    loading={loading}
                    currentPage={page}
                    totalPages={Math.ceil((data?.total || 0) / PAGE_SIZE)}
                    totalItems={data?.total || 0}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    itemLabel={"lượt khách"}
                 onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
            </div>

            <SimpleModal isOpen={Boolean(profile)} title={profile ? `Các lượt của ${profile.visitor.fullName}` : ''} onClose={() => setProfile(null)}>
                {profile && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="rounded-xl bg-cloud-mist p-3">
                                <p className="text-slate-blue">Tổng số lượt</p>
                                <p className="text-lg font-bold text-midnight-indigo">{profile.visits.length}</p>
                            </div>
                            <div className="rounded-xl bg-cloud-mist p-3">
                                <p className="text-slate-blue">Lần gần nhất</p>
                                <p className="text-sm font-bold text-midnight-indigo">{fmtDateTime(profile.visits[0]?.scheduledFrom)}</p>
                            </div>
                            <div className="rounded-xl bg-cloud-mist p-3">
                                <p className="text-slate-blue">Đơn vị công tác</p>
                                <p className="text-sm font-bold text-midnight-indigo">{profile.visitor.organization || '—'}</p>
                            </div>
                        </div>
                        <PaginatedCollection items={profile?.visits} itemLabel="lượt khách">
{(camaiPageItems, camaiStartIndex) => (
<ul className="divide-y divide-pale-gray">
                            {camaiPageItems.map((camaiRecord, camaiIndex) => ((visit) => (
                                <li key={visit.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div>
                                        <p className="font-semibold text-midnight-indigo">{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)} · {visit.code}</p>
                                        <p className="text-slate-blue">Gặp {visit.hostName} · {visit.departmentName} · {visit.purpose}</p>
                                    </div>
                                    <VisitStatusBadge status={visit.status} overstay={visit.overstay} />
                                </li>
                            ))(camaiRecord, camaiStartIndex + camaiIndex, (profile.visits)))}
                        </ul>
)}
</PaginatedCollection>
                    </div>
                )}
            </SimpleModal>

            {detailId && <VisitDetailDrawer visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />}
        </div>
    );
};

export default VisitorHistory;
