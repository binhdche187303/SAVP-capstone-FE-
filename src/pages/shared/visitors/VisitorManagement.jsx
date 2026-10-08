import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { listVisits, getVisitorLookups, approveVisit } from '../../../service/visitorService';
import toast from '../../../utils/toast';
import Pagination from '../../../components/common/Pagination';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { VISIT_CHANNEL_LABELS, fmtTimeRange } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, inputCls, searchInputCls, labelCls, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// S3 (2.10): duyệt và quản lý lượt khách theo trạng thái.
const TABS = [
    ['pending_approval', 'Chờ duyệt'],
    ['approved', 'Đã duyệt'],
    ['checked_in', 'Đang trong khuôn viên'],
    ['checked_out', 'Hoàn tất'],
    ['closed', 'Từ chối / Hết hạn / Khác'],
];
const PAGE_SIZE = 10;

const VisitorManagement = () => {
    const [lookups, setLookups] = useState({ departments: [], zones: [] });
    const [tab, setTab] = useState('pending_approval');
    const [filters, setFilters] = useState({ q: '', departmentId: '', from: '', to: '' });
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
    }, []);

    // Ô tìm kiếm: chờ 300 ms sau lần gõ cuối rồi mới lọc.
    useEffect(() => {
        const timer = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, q: query })); }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listVisits({ ...filters, status: tab, page, limit: PAGE_SIZE });
        if (res?.success) {
            setData(res.data);
            setError(null);
        } else {
            setError(res?.message || 'Không tải được danh sách khách');
        }
        setLoading(false);
    }, [filters, tab, page]);

    useEffect(() => { load(); }, [load]);

    const changeFilter = (patch) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };
    const changeTab = (key) => { setPage(1); setTab(key); };

    const quickApprove = async (event, visit) => {
        event.stopPropagation();
        const res = await approveVisit(visit.id, {});
        if (res?.success) {
            toast.success(`Đã duyệt ${visit.visitor.fullName} với quyền ra vào mặc định`);
            load();
        } else {
            toast.error(res?.message || 'Không duyệt được lượt khách');
        }
    };

    const counts = data?.counts || {};
    const items = data?.items || [];

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <ClipboardList className="w-6 h-6 text-action-blue" />
                    Quản lý khách đến làm việc
                </h2>
                <p className="text-xs text-slate-blue mt-1">Duyệt đăng ký, cấp quyền ra vào theo thời gian và theo dõi trạng thái từng lượt khách.</p>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist">
                {TABS.map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => changeTab(key)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold border ${tab === key ? 'bg-action-blue text-white border-action-blue' : 'bg-white text-slate-blue border-platinum-tint hover:bg-cloud-mist'}`}
                    >
                        {label}
                        <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${tab === key ? 'bg-white/20' : 'bg-pale-gray'}`}>{counts[key] ?? 0}</span>
                    </button>
                ))}
            </div>

            <div className={`${cardCls} p-4 flex flex-wrap gap-4 items-end`}>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vm-q">Tìm kiếm</label>
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                        <input id="vm-q" className={`${searchInputCls} w-64`} placeholder="Tên, số giấy tờ, điện thoại, mã lượt…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vm-dep">Đơn vị tiếp</label>
                    <select id="vm-dep" className={inputCls} value={filters.departmentId} onChange={(e) => changeFilter({ departmentId: e.target.value })}>
                        <option value="">Tất cả</option>
                        {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vm-from">Từ ngày</label>
                    <input id="vm-from" type="date" className={inputCls} value={filters.from} onChange={(e) => changeFilter({ from: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <label className={labelCls} htmlFor="vm-to">Đến ngày</label>
                    <input id="vm-to" type="date" className={inputCls} value={filters.to} onChange={(e) => changeFilter({ to: e.target.value })} />
                </div>
            </div>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Khách', 'Mã lượt', 'Người gặp / Đơn vị tiếp', 'Giờ hẹn', 'Kênh', 'Trạng thái', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className={loading ? 'opacity-60' : ''}>
                            {items.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-blue">{data ? 'Không có lượt khách nào phù hợp' : 'Đang tải dữ liệu…'}</td></tr>
                            ) : items.map((visit) => (
                                <tr key={visit.id} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40 cursor-pointer" onClick={() => setSelectedId(visit.id)}>
                                    <td className={tdCls}>
                                        <div className="flex items-center gap-3">
                                            <VisitorAvatar visitor={visit.visitor} size={36} />
                                            <div>
                                                <p className="font-semibold">{visit.visitor.fullName}</p>
                                                <p className="text-[11px] text-slate-blue">{visit.visitor.organization || '—'}{visit.visitor.hasPhoto ? '' : ' · Chưa có ảnh'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`${tdCls} font-mono`}>{visit.code}</td>
                                    <td className={tdCls}>
                                        <p className="font-semibold">{visit.hostName}</p>
                                        <p className="text-[11px] text-slate-blue">{visit.departmentName}</p>
                                    </td>
                                    <td className={tdCls}>{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}</td>
                                    <td className={tdCls}>{VISIT_CHANNEL_LABELS[visit.channel]}</td>
                                    <td className={tdCls}><VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} /></td>
                                    <td className={`${tdCls} text-right`}>
                                        {visit.status === 'pending_approval' && (
                                            <button type="button" aria-label="Duyệt nhanh" onClick={(e) => quickApprove(e, visit)} className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-semibold hover:bg-glacier-blue">
                                                Duyệt
                                            </button>
                                        )}
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

            {selectedId && (
                <VisitDetailDrawer visitId={selectedId} zones={lookups.zones} onClose={() => setSelectedId(null)} onChanged={load} />
            )}
        </div>
    );
};

export default VisitorManagement;
