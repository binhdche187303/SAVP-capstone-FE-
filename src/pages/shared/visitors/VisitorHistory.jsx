import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, History, Search } from 'lucide-react';
import { listVisits, listVisitsOfVisitor, getVisitorLookups } from '../../../service/visitorService';
import { exportReport } from '../../../service/reportCenterService';
import { formatDuration } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import Pagination from '../../../components/common/Pagination';
import SimpleModal from '../../../components/common/SimpleModal';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { fmtDateTime, fmtTimeRange, fmtScore } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, inputCls, searchInputCls, labelCls, btnGhost, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// S6 (2.10): tra cứu lịch sử khách đến theo khách, đơn vị, người gặp, thời gian.
const PAGE_SIZE = 15;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const last30Days = () => {
    const today = new Date();
    return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: ymd(today) };
};
const staySeconds = (visit) => (visit.checkInAt && visit.checkOutAt ? (new Date(visit.checkOutAt) - new Date(visit.checkInAt)) / 1000 : null);

const VisitorHistory = () => {
    const [lookups, setLookups] = useState({ departments: [], zones: [] });
    const [filters, setFilters] = useState(() => ({ q: '', departmentId: '', ...last30Days() }));
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [profile, setProfile] = useState(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { setPage(1); setFilters((f) => (f.q === query ? f : { ...f, q: query })); }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const load = useCallback(async () => {
        const res = await listVisits({ ...filters, page, limit: PAGE_SIZE });
        if (res?.success) {
            setData(res.data);
            setError(null);
        } else {
            setError(res?.message || 'Không tải được lịch sử khách');
        }
    }, [filters, page]);

    useEffect(() => { load(); }, [load]);

    const change = (patch) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };

    const openProfile = async (visit) => {
        const res = await listVisitsOfVisitor(visit.id);
        if (res?.success) setProfile({ visitor: visit.visitor, visits: res.data });
        else toast.error(res?.message || 'Không tải được các lượt của khách');
    };

    const exportExcel = async () => {
        if (!filters.from || !filters.to) {
            toast.warning('Chọn đủ từ ngày và đến ngày trước khi xuất');
            return;
        }
        setExporting(true);
        const res = await exportReport('visitor', { format: 'xlsx', from: filters.from, to: filters.to, departmentId: filters.departmentId });
        setExporting(false);
        if (res?.success) toast.success(`Đã xuất ${res.data.fileName}`);
        else toast.error(res?.message || 'Không xuất được file');
    };

    const items = data?.items || [];

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <History className="w-6 h-6 text-action-blue" />
                        Lịch sử khách đến
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Tra cứu mọi lượt khách theo người, đơn vị và thời gian, kèm các mốc camera ghi nhận.</p>
                </div>
                <button type="button" className={btnGhost} onClick={exportExcel} disabled={exporting}>
                    <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
                </button>
            </div>

            <div className={`${cardCls} p-4 flex flex-wrap gap-4 items-end`}>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vh-q">Tìm kiếm</label>
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                        <input id="vh-q" className={`${searchInputCls} w-72`} placeholder="Tên, số giấy tờ, điện thoại, đơn vị, mã lượt…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vh-dep">Đơn vị tiếp</label>
                    <select id="vh-dep" className={inputCls} value={filters.departmentId} onChange={(e) => change({ departmentId: e.target.value })}>
                        <option value="">Tất cả</option>
                        {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vh-from">Từ ngày</label>
                    <input id="vh-from" type="date" className={inputCls} value={filters.from} onChange={(e) => change({ from: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vh-to">Đến ngày</label>
                    <input id="vh-to" type="date" className={inputCls} value={filters.to} onChange={(e) => change({ to: e.target.value })} />
                </div>
            </div>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Giờ hẹn', 'Khách', 'Đơn vị công tác', 'Người gặp / Đơn vị tiếp', 'Mục đích', 'Giờ vào', 'Giờ ra', 'Lưu trú', 'Độ khớp', 'Trạng thái', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr><td colSpan={11} className="px-4 py-10 text-center text-xs text-slate-blue">{data ? 'Không có lượt khách nào trong khoảng đã chọn' : 'Đang tải dữ liệu…'}</td></tr>
                            ) : items.map((visit) => (
                                <tr key={visit.id} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40">
                                    <td className={tdCls}>{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}</td>
                                    <td className={tdCls}>
                                        <button type="button" aria-label={`Xem các lượt của ${visit.visitor.fullName}`} className="font-semibold text-action-blue hover:underline" onClick={() => openProfile(visit)}>{visit.visitor.fullName}</button>
                                    </td>
                                    <td className={tdCls}>{visit.visitor.organization || '—'}</td>
                                    <td className={tdCls}>
                                        <p className="font-semibold">{visit.hostName}</p>
                                        <p className="text-[11px] text-slate-blue">{visit.departmentName}</p>
                                    </td>
                                    <td className={tdCls}>{visit.purpose}</td>
                                    <td className={tdCls}>{fmtDateTime(visit.checkInAt)}</td>
                                    <td className={tdCls}>{fmtDateTime(visit.checkOutAt)}</td>
                                    <td className={tdCls}>{formatDuration(staySeconds(visit))}</td>
                                    <td className={tdCls}>{fmtScore(visit.faceScore)}</td>
                                    <td className={tdCls}><VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} /></td>
                                    <td className={`${tdCls} text-right`}>
                                        <button type="button" className="text-action-blue font-semibold hover:underline" onClick={() => setDetailId(visit.id)}>Chi tiết</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-platinum-tint flex items-center justify-between">
                    <span className="text-xs text-slate-blue">{data ? `${data.total} lượt khách` : ''}</span>
                    <Pagination currentPage={page} totalPages={Math.ceil((data?.total || 0) / PAGE_SIZE)} onPageChange={setPage} />
                </div>
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
                        <ul className="divide-y divide-pale-gray">
                            {profile.visits.map((visit) => (
                                <li key={visit.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div>
                                        <p className="font-semibold text-midnight-indigo">{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)} · {visit.code}</p>
                                        <p className="text-slate-blue">Gặp {visit.hostName} · {visit.departmentName} · {visit.purpose}</p>
                                    </div>
                                    <VisitStatusBadge status={visit.status} overstay={visit.overstay} />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </SimpleModal>

            {detailId && <VisitDetailDrawer visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />}
        </div>
    );
};

export default VisitorHistory;
