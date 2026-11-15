import CalendarRangePresets from '../../../components/common/CalendarRangePresets';
import './VisitorListFilters.css';
import ResponsiveTable from '../../../components/common/ResponsiveTable';
import StatisticGrid from '../../../components/common/StatisticGrid';
import StatisticCard from '../../../components/common/StatisticCard';
import FilterBar from '../../../components/common/FilterBar';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Filter, LogIn, LogOut, Search, XCircle } from 'lucide-react';
import { listVisits, getVisitorLookups } from '../../../service/visitorService';

import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { VISIT_CHANNEL_LABELS, fmtTimeRange } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, inputCls, searchInputCls, labelCls, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';
import { subscribeToVisitorAlertChanges } from '../../../utils/visitorRealtime';

// S3 (2.10): duyệt và quản lý lượt khách theo trạng thái.
const TABS = [
    ['pending_approval', 'Chờ duyệt'],
    ['approved', 'Đã duyệt'],
    ['checked_in', 'Đang trong khuôn viên'],
    ['checked_out', 'Hoàn tất'],
    ['closed', 'Từ chối / Hết hạn / Khác'],
];
const STATUS_CARDS = {
    pending_approval: { icon: Clock, tone: 'warning' },
    approved: { icon: CheckCircle2, tone: 'success' },
    checked_in: { icon: LogIn, tone: 'default' },
    checked_out: { icon: LogOut, tone: 'success' },
    closed: { icon: XCircle, tone: 'danger' },
};


const VisitorManagement = () => {
    const [PAGE_SIZE, setPageSize] = useState(10);
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
        if (query === filters.q) return undefined;
        const timer = setTimeout(() => { setPage(1); setFilters((f) => ({ ...f, q: query })); }, 300);
        return () => clearTimeout(timer);
    }, [query, filters.q]);

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
    }, [filters, tab, page, PAGE_SIZE]);

    useEffect(() => { load(); }, [load]);

    // Đồng bộ ngay khi đăng ký khách ở tab/cửa sổ khác, không cần F5.
    useEffect(() => {
        const unsubscribe = subscribeToVisitorAlertChanges(load);
        const onStorage = (event) => {
            if (event.key === 'savp.visitorReportMock') load();
        };
        const onFocus = () => load();
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') load();
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            unsubscribe();
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [load]);

    const changeFilter = (patch) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };
    const changeTab = (key) => { setPage(1); setTab(key); };

    const counts = data?.counts || {};
    const items = data?.items || [];

    return (
        <div data-page-surface="wide" className={pageCls}>
            <div className="border-b border-platinum-tint pb-5">
                <h2 data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <ClipboardList className="w-6 h-6 text-action-blue" />
                    Quản lý khách đến làm việc
                </h2>
                <p className="text-xs text-slate-blue mt-1">Theo dõi đăng ký (người được gặp tự duyệt), quyền ra vào theo thời gian và theo dõi trạng thái từng lượt khách.</p>
            </div>

            <StatisticGrid columns={5} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4" data-stat-grid role="group" aria-label="Thống kê trạng thái khách">
                {TABS.map(([key, label]) => (
                    <StatisticCard
                        key={key}
                        label={label}
                        value={counts[key] ?? 0}
                        icon={STATUS_CARDS[key].icon}
                        tone={STATUS_CARDS[key].tone}
                        selected={tab === key}
                        onClick={() => changeTab(key)}
                    />
                ))}
            </StatisticGrid>

            <FilterBar variant="card" className="visitor-list-filters">
                <div className="visitor-list-filter-main">
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="vm-q">Tìm kiếm</label>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                            <input id="vm-q" className={searchInputCls} placeholder="Tên, SĐT hoặc mã lượt" title="Tìm theo tên, số giấy tờ, điện thoại hoặc mã lượt" value={query} onChange={(e) => setQuery(e.target.value)} />
                        </div>
                    </div>
                    <div className="camai-filter-field space-y-1">
                        <label className={labelCls} htmlFor="vm-dep">Đơn vị tiếp</label>
                        <select id="vm-dep" className={inputCls} value={filters.departmentId} onChange={(e) => changeFilter({ departmentId: e.target.value })}>
                            <option value="">Tất cả</option>
                            {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="visitor-list-filter-time">
                    <CalendarRangePresets from={filters.from} to={filters.to} onChange={range => { changeFilter(range); }} />
                    <div className="visitor-list-filter-dates">
                        <div className="camai-filter-field space-y-1">
                            <label className={labelCls} htmlFor="vm-from">Từ ngày</label>
                            <input id="vm-from" type="date" className={inputCls} value={filters.from} onChange={(e) => changeFilter({ from: e.target.value })} />
                        </div>
                        <div className="camai-filter-field space-y-1">
                            <label className={labelCls} htmlFor="vm-to">Đến ngày</label>
                            <input id="vm-to" type="date" className={inputCls} value={filters.to} onChange={(e) => changeFilter({ to: e.target.value })} />
                        </div>
                    </div>
                    <button type="button" data-filter-action
                        className="visitor-list-filter-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                        onClick={() => {
                            setQuery('');
                            setFilters({ q: '', departmentId: '', from: '', to: '' });
                            setTab('pending_approval');
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
<col style={{ width: '21%' }} />
<col style={{ width: '13%' }} />
<col style={{ width: '25%' }} />
<col style={{ width: '16%' }} />
<col style={{ width: '7%' }} />
<col style={{ width: '11%' }} />
<col style={{ width: '7%' }} />
</colgroup>
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
                                                <p data-ui-text="secondary" className="text-[11px] text-slate-blue">{visit.visitor.organization || '—'}{visit.visitor.hasPhoto ? '' : ' · Chưa có ảnh'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`${tdCls} font-mono`}>{visit.code}</td>
                                    <td className={tdCls}>
                                        <p className="font-semibold">{visit.hostName}</p>
                                        <p data-ui-text="secondary" className="text-[11px] text-slate-blue">{visit.departmentName}</p>
                                    </td>
                                    <td className={tdCls}>{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}</td>
                                    <td className={tdCls}>{VISIT_CHANNEL_LABELS[visit.channel]}</td>
                                    <td className={tdCls}><VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} /></td>
                                    <td className={`${tdCls} text-right`}>
                                        {visit.status === 'pending_approval' && (
                                            <button data-ui-text="action"
                                                type="button"
                                                className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-semibold hover:bg-glacier-blue"
                                                onClick={(event) => { event.stopPropagation(); setSelectedId(visit.id); }}
                                            >
                                                Duyệt
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
                    itemLabel={"lượt khách"}
                 onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
            </div>

            {selectedId && (
                <VisitDetailDrawer canManage canReassign visitId={selectedId} zones={lookups.zones} onClose={() => setSelectedId(null)} onChanged={load} />
            )}
        </div>
    );
};

export default VisitorManagement;
