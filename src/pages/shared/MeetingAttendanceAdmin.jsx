import PageHeading from '../../components/common/PageHeading';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import './MeetingAttendanceAdmin.css';
import StatisticCard from '../../components/common/StatisticCard';
import StatisticGrid from '../../components/common/StatisticGrid';
import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import FilterBar from '../../components/common/FilterBar';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { Activity, AlertTriangle, ArrowLeft, Calendar, Clock, Search, Users, MapPin, ArrowRight, CheckCircle2, Filter, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getMeetings, getDepartments } from '../../service/businessAdminServices';
import MeetingPresenceIVSS from '../../components/meeting/MeetingPresenceIVSS';


const formatDateTime = (iso) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    } catch { return '—'; }
};

const toLocalDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};



// Chế độ GIÁM SÁT (chỉ đọc): admin xem điểm danh cuộc họp đã kết thúc/đang diễn ra qua IVSS,
// không mở trang chi tiết cuộc họp (biên bản, ghi chú riêng), không tham gia, không sửa.
const STATUS_TABS = [
    { value: 'completed', label: 'Đã kết thúc', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'in_progress', label: 'Đang diễn ra', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

const meetingTotal = response => {
    const value = response?.data?.meta?.total ?? response?.meta?.total ?? response?.data?.total;
    return value != null && Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const MeetingAttendanceAdmin = () => {
    const [ITEMS_PER_PAGE, setItemsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(undefined);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState(toLocalDateStr(firstOfMonth));
    const [toDate, setToDate] = useState(toLocalDateStr(now));
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [departments, setDepartments] = useState([]);
    const [selectedDeptId, setSelectedDeptId] = useState('');

    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [statusFilter, setStatusFilter] = useState('completed');
    const statusTab = STATUS_TABS.find(t => t.value === statusFilter);
    const [statusCounts, setStatusCounts] = useState({});
    const [countsLoading, setCountsLoading] = useState(true);
    const [countRefresh, setCountRefresh] = useState(0);
    const listRequestId = useRef(0);

    // Totals cover every page in the same date/search scope as the list.
    useEffect(() => {
        let cancelled = false;
        setCountsLoading(true);
        setStatusCounts({});
        const params = { page: 1, limit: 1 };
        if (fromDate) params.from = `${fromDate}T00:00:00+07:00`;
        if (toDate) params.to = `${toDate}T23:59:59+07:00`;
        if (search.trim()) params.search = search.trim();
        if (selectedDeptId) params.departmentId = selectedDeptId;
        Promise.all(STATUS_TABS.map(async tab => {
            try {
                const response = await getMeetings({ ...params, status: tab.value });
                return [tab.value, response?.success ? meetingTotal(response) : undefined];
            } catch { return [tab.value, undefined]; }
        })).then(counts => {
            if (!cancelled) { setStatusCounts(Object.fromEntries(counts)); setCountsLoading(false); }
        });
        return () => { cancelled = true; };
    }, [fromDate, toDate, search, selectedDeptId, countRefresh]);

    useEffect(() => {
        getDepartments({ limit: 100 }).then((res) => {
            if (res?.success) {
                const items = res.data?.items || res.data || [];
                setDepartments(items);
            }
        }).catch(() => {});
    }, []);

    const fetchMeetings = useCallback(async () => {
        const requestId = ++listRequestId.current;
        setLoading(true);
        setError(null);
        try {
            const params = {
                status: statusFilter,
                page,
                limit: ITEMS_PER_PAGE,
            };
            // BE so sanh start_time >= from / <= to theo dung timestamp truyen len
            // (khong tu suy ra ca ngay) — phai gui du gio, neu khong "to" se bi hieu
            // la 00:00:00 va cat mat toan bo cuoc hop trong ngay hom do.
            if (fromDate) params.from = `${fromDate}T00:00:00+07:00`;
            if (toDate) params.to = `${toDate}T23:59:59+07:00`;
            if (search.trim()) params.search = search.trim();
            if (selectedDeptId) params.departmentId = selectedDeptId;

            const res = await getMeetings(params);
            if (requestId !== listRequestId.current) return;
            if (res?.success) {
                setMeetings(res.data?.items || res.data || []);
                const meta = res.data?.meta || res.meta;
                setTotalItems(meta?.total ?? res.data?.total);
                if (meta?.totalPages) setTotalPages(meta.totalPages);
                else if (meta?.total && meta?.limit) setTotalPages(Math.ceil(meta.total / meta.limit));
                else setTotalPages(1);
            } else {
                throw new Error(res?.message || 'Không thể tải danh sách cuộc họp.');
            }
        } catch (err) {
            if (requestId === listRequestId.current) setError(err.message || 'Lỗi hệ thống khi tải danh sách cuộc họp.');
        } finally {
            if (requestId === listRequestId.current) setLoading(false);
        }
    }, [fromDate, toDate, search, selectedDeptId, page, statusFilter, ITEMS_PER_PAGE]);

    useEffect(() => {
        fetchMeetings();
        return () => { listRequestId.current += 1; };
    }, [fetchMeetings]);

    const clearFilters = () => {
        setSearch('');
        setSelectedDeptId('');
        setFromDate('');
        setToDate('');
        setStatusFilter('completed');
        setPage(1);
    };

    if (selectedMeeting) {
        return (
            <div data-page-surface="wide" className="p-6 space-y-5">
                <button
                    onClick={() => setSelectedMeeting(null)}
                    className="inline-flex items-center gap-2 text-sm font-bold text-slate-blue hover:text-midnight-indigo transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại danh sách
                </button>

                <div className="bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <h2 className="text-base font-bold text-midnight-indigo">{selectedMeeting.title || selectedMeeting.name || 'Cuộc họp'}</h2>
                        <span data-ui-text="badge" className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusTab.badge}`}>
                            {statusTab.label}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-xs text-slate-blue">
                        <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDateTime(selectedMeeting.startTime || selectedMeeting.start_time)}
                            {' – '}
                            {formatDateTime(selectedMeeting.endTime || selectedMeeting.end_time)}
                        </span>
                        {(selectedMeeting.room?.name || selectedMeeting.roomName) && (
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {selectedMeeting.room?.name || selectedMeeting.roomName}
                            </span>
                        )}
                        {(selectedMeeting.department?.name || selectedMeeting.departmentName) && (
                            <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {selectedMeeting.department?.name || selectedMeeting.departmentName}
                            </span>
                        )}
                    </div>
                </div>

                <MeetingPresenceIVSS
                    meetingId={selectedMeeting.id}
                    meetingStartTime={selectedMeeting.startTime || selectedMeeting.start_time}
                    meetingEndTime={selectedMeeting.endTime || selectedMeeting.end_time}
                />
            </div>
        );
    }

    return (
        <div data-page-surface="wide" className="p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <PageHeading as="h1" badge="Chuyên cần" icon={<Activity className="w-5 h-5 text-action-blue" />} className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        Chuyên cần phòng ban
                    </PageHeading>
                    <p data-page-description className="text-xs text-slate-blue mt-0.5">Xem thời lượng tham dự thực tế của nhân viên theo từng cuộc họp</p>
                </div>
            </div>

            <StatisticGrid columns={2} role="group" aria-label="Trạng thái cuộc họp" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STATUS_TABS.map(tab => (
                    <StatisticCard key={tab.value} label={tab.label} value={statusCounts[tab.value]}
                        icon={tab.value === 'completed' ? CheckCircle2 : Activity}
                        tone={tab.value === 'in_progress' ? 'success' : 'default'} loading={countsLoading}
                        selected={statusFilter === tab.value}
                        onClick={() => { setStatusFilter(tab.value); setPage(1); }} />
                ))}
            </StatisticGrid>
            <p data-ui-text="secondary" className="text-xs text-slate-blue">Chế độ giám sát — chỉ xem, không chỉnh sửa.</p>

            {/* Filters */}
            <FilterBar as="form" variant="card" onSubmit={event => event.preventDefault()} className="meeting-attendance-filters bg-white rounded-2xl border border-platinum-tint p-4 shadow-sm">
                <div className="meeting-attendance-filter-main">
                    <div data-filter-search className="camai-filter-field">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Tìm kiếm</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Tên cuộc họp..."
                                className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                            />
                            <Search className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                        </div>
                    </div>
                    <div className="camai-filter-field">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Phòng ban</label>
                        <FilterMultiSelect
                            value={selectedDeptId}
                            onChange={(e) => { setSelectedDeptId(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                        >
                            <option value="">Tất cả phòng ban</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name || d.departmentName}</option>
                            ))}
                        </FilterMultiSelect>
                    </div>
                </div>
                <div className="meeting-attendance-filter-time">
                    <CalendarRangePresets from={fromDate} to={toDate} onChange={range => { setFromDate(range.from); setToDate(range.to); setPage(1); }} />
                    <div className="meeting-attendance-filter-dates">
                        <div className="camai-filter-field">
                            <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Từ ngày</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                            />
                        </div>
                        <div className="camai-filter-field">
                            <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Đến ngày</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                            />
                        </div>
                    </div>
                    <button data-filter-action
                        type="button"
                        onClick={clearFilters}
                        className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                    >
                        <Filter className="w-4 h-4 inline mr-2" />
                        Xóa bộ lọc
                    </button>
                </div>
            </FilterBar>

            {/* Meeting list */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách cuộc họp {statusTab.label.toLowerCase()}
                    </h3>
                    <RefreshButton
                        onClick={() => { setPage(1); setCountRefresh(value => value + 1); if (page === 1) fetchMeetings(); }}
                        title="Làm mới"
                        busy={loading}
                    />
                </div>

                {loading ? (
                    <div className="p-8 flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
                        <span data-ui-text="primary" className="text-xs text-slate-blue font-semibold">Đang tải danh sách cuộc họp...</span>
                    </div>
                ) : error ? (
                    <div className="p-8 flex flex-col items-center gap-3 text-center">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                        <p data-ui-text="primary" className="text-xs text-red-700 font-semibold">{error}</p>
                        <button onClick={fetchMeetings} className="text-xs font-bold text-action-blue hover:underline">Thử lại</button>
                    </div>
                ) : meetings.length === 0 ? (
                    <div className="p-10 flex flex-col items-center gap-2 text-center">
                        <Calendar className="w-10 h-10 text-steel-gray" />
                        <p className="text-sm font-semibold text-midnight-indigo">Không có cuộc họp nào</p>
                        <p className="text-xs text-slate-blue">Thử thay đổi bộ lọc ngày, phòng ban hoặc từ khoá tìm kiếm</p>
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-platinum-tint">
                            {meetings.map((m) => (
                                <div
                                    key={m.id}
                                    className="px-5 py-4 hover:bg-cloud-mist/30 transition-colors flex items-start gap-4 group"
                                >
                                    {/* Left accent */}
                                    <div className="w-1 self-stretch rounded-full bg-purple-300 flex-shrink-0 mt-0.5" />

                                    {/* Content */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                        {/* Title row */}
                                        <div className="flex items-start justify-between gap-3">
                                            <p data-ui-text="primary" className="text-sm font-bold text-midnight-indigo leading-snug">
                                                {m.title || m.name || 'Cuộc họp không tên'}
                                            </p>
                                        </div>

                                        {/* Time */}
                                        <div data-ui-text="secondary" className="flex items-center gap-1.5 text-[11px] text-slate-blue font-medium">
                                            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span>{formatDateTime(m.startTime || m.start_time)}</span>
                                            <span className="text-steel-gray">–</span>
                                            <span>{formatDateTime(m.endTime || m.end_time)}</span>
                                        </div>

                                        {/* Badges row */}
                                        <div className="flex flex-wrap gap-2">
                                            {(m.room?.name || m.roomName) && (
                                                <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                                    <MapPin className="w-3 h-3" />
                                                    {m.room?.name || m.roomName}
                                                </span>
                                            )}
                                            {(m.department?.name || m.departmentName) && (
                                                <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                    <Users className="w-3 h-3" />
                                                    {m.department?.name || m.departmentName}
                                                </span>
                                            )}
                                            {(m.participantCount != null || m.participants?.length != null) && (
                                                <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
                                                    <Users className="w-3 h-3" />
                                                    {m.participantCount ?? m.participants?.length} người tham dự
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* CTA button */}
                                    <div className="flex-shrink-0 self-center flex flex-col items-center gap-2">
                                        <span data-ui-text="badge" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusTab.badge}`}>
                                            {statusTab.label}
                                        </span>
                                        <button data-ui-text="action"
                                            onClick={() => setSelectedMeeting(m)}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-action-blue/10 hover:bg-action-blue text-action-blue hover:text-white text-[11px] font-bold border border-action-blue/20 hover:border-action-blue transition-all active:scale-95"
                                        >
                                            Xem chuyên cần
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>


                    </>
                )}
{<PaginationRegion legacyVisible={totalPages > 1}><PaginationFooter
                                currentPage={page}
                                totalItems={totalItems}
                                visibleCount={meetings.length}
                                pageSize={ITEMS_PER_PAGE}
                                onPageSizeChange={size => { setItemsPerPage(size); setPage(1); }}
                                totalPages={totalPages}
                                onPageChange={setPage}
                                itemLabel={"cuộc họp"}
                                loading={loading}
                            /></PaginationRegion>}
            </div>
        </div>
    );
};

export default MeetingAttendanceAdmin;
