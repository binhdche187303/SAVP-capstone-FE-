import { totalOf, useFacetCounts } from '../../hooks/useFilterCounts';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import TimeRangeButtons from '../../components/common/TimeRangeButtons';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Filter, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { getMyMeetingHistory } from '../../service/employeeServices';
import { getUserPresence } from '../../service/managerServices';
import { CALENDAR_TYPES } from '../../mocks/meetingCalendarMock';
import { filterValues } from '../../utils/filterSelection';
import { calendarViewRange, dateKey, isSameDay } from '../../utils/calendarRange';
import { toCalendarTypeApi } from '../../utils/calendarType';
import './PersonalCalendarFilters.css';

// Bộ lọc giống tab Lịch: trạng thái chỉ gồm cuộc họp đã/đang diễn ra (mới có dữ liệu có mặt).
const STATUS_OPTIONS = [
    { value: 'in_progress', label: 'Đang diễn ra' },
    { value: 'completed', label: 'Đã kết thúc' },
];
const ALL_STATUSES = STATUS_OPTIONS.map(o => o.value);

// "Lịch sử tham dự" — điểm danh họp của CHÍNH MÌNH: lịch sử họp đã kết thúc (/me/meetings/history)
// + thời lượng có mặt IVSS của user hiện tại (BE chỉ cho EMPLOYEE xem bản thân — SELF_ONLY).

const formatDateTime = (v) => (v ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '--');
const formatMinutes = (ms) => `${Math.round((ms || 0) / 60000)} phút`;

const statusOf = (presence) => {
    if (!presence) return { label: 'Chưa có dữ liệu', cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: AlertTriangle };
    const ratio = presence.duration?.presentRatio ?? 0;
    if (ratio >= 0.8) return { label: 'Có mặt', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle };
    if (ratio > 0) return { label: 'Có mặt một phần', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock };
    return { label: 'Vắng', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle };
};

const getMyId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return undefined; }
};

const MyMeetingAttendance = () => {
    const [PAGE_SIZE, setPageSize] = useState(10);
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [viewMode, setViewMode] = useState('month'); // 'day' | 'week' | 'month'
    const [currentDate, setCurrentDate] = useState(() => new Date());

    // Đổi bộ lọc thì quay về trang 1.
    const applyFilter = (fn) => { fn(); setPage(1); };
    const resetFilters = () => applyFilter(() => {
        setStatusFilter('');
        setTypeFilter('');
        setViewMode('month');
        setCurrentDate(new Date());
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const range = calendarViewRange(currentDate, viewMode);
            const statuses = filterValues(statusFilter);
            const calendarTypes = filterValues(typeFilter).map(toCalendarTypeApi).filter(Boolean);
            const res = await getMyMeetingHistory({
                status: statuses.length ? statuses : ALL_STATUSES,
                ...(calendarTypes.length ? { calendarType: calendarTypes } : {}),
                from: range.from,
                to: range.to,
                page,
                limit: PAGE_SIZE,
            });
            if (!res?.success) throw new Error(res?.message || 'Không tải được lịch sử họp.');
            const meetings = res.data?.items || res.data || [];
            const totalPages = res.data?.totalPages ?? res.meta?.totalPages;
            setHasMore(totalPages ? page < totalPages : meetings.length === PAGE_SIZE);
            const myId = getMyId();
            const withPresence = await Promise.all(meetings.map(async (m) => {
                const mid = m.meetingId || m.id;
                try {
                    const p = await getUserPresence(mid, myId);
                    return { ...m, presence: p?.success ? p.data : null };
                } catch {
                    return { ...m, presence: null };
                }
            }));
            setRows(withPresence);
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải lịch sử tham dự.');
        } finally {
            setLoading(false);
        }
    }, [page, PAGE_SIZE, statusFilter, typeFilter, viewMode, currentDate]);

    useEffect(() => { load(); }, [load]);

    // Số đếm cạnh lựa chọn ô Trạng thái / Loại lịch (mỗi ô đếm theo các bộ lọc khác, cùng khoảng ngày).
    const historyRange = calendarViewRange(currentDate, viewMode);
    const historyFilters = { status: statusFilter, type: typeFilter, from: historyRange.from, to: historyRange.to };
    const historyTotal = (f) => {
        const statuses = filterValues(f.status);
        const types = filterValues(f.type).map(toCalendarTypeApi).filter(Boolean);
        return getMyMeetingHistory({
            status: statuses.length ? statuses : ALL_STATUSES,
            ...(types.length ? { calendarType: types } : {}),
            from: f.from,
            to: f.to,
            page: 1,
            limit: 1,
        }).then(totalOf);
    };
    const statusCounts = useFacetCounts(historyFilters, 'status', ALL_STATUSES, historyTotal);
    const typeCounts = useFacetCounts(historyFilters, 'type', Object.keys(CALENDAR_TYPES), historyTotal);

    return (
        <div className="space-y-4">
            {/* Tiêu đề nằm ngoài card — chỉ danh sách cuộc họp có khung */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Lịch sử tham dự họp</h2>
                    <p className="text-xs text-slate-blue mt-1">Thời gian có mặt của bạn trong các cuộc họp đang diễn ra hoặc đã kết thúc (camera nhận diện).</p>
                </div>
                <RefreshButton
                    type="button"
                    onClick={load}
                    disabled={loading}
                    legacyClassName="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-slate-blue hover:text-midnight-indigo disabled:opacity-60"
                    busy={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </RefreshButton>
            </div>

            <FilterBar forceStandard variant="card" className="personal-calendar-filters">
                <div className="personal-calendar-filter-main">
                    <FilterField label="Trạng thái cuộc họp">
                        <FilterMultiSelect singleSelect counts={statusCounts} value={statusFilter} onChange={e => applyFilter(() => setStatusFilter(e.target.value))}>
                            <option value="">Tất cả trạng thái</option>
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </FilterMultiSelect>
                    </FilterField>
                    <FilterField label="Loại lịch">
                        <FilterMultiSelect counts={typeCounts} value={typeFilter} onChange={e => applyFilter(() => setTypeFilter(e.target.value))}>
                            <option value="">Tất cả loại lịch</option>
                            {Object.entries(CALENDAR_TYPES).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}
                        </FilterMultiSelect>
                    </FilterField>
                </div>
                <div className="personal-calendar-filter-time">
                    <TimeRangeButtons label="Khoảng thời gian"
                        value={viewMode === 'day' ? (isSameDay(currentDate, new Date()) ? 'today' : '') : viewMode}
                        onChange={mode => applyFilter(() => {
                            if (mode === 'today') { setViewMode('day'); setCurrentDate(new Date()); }
                            else setViewMode(mode);
                        })} options={[["today", "Hôm nay"], ["week", "Tuần"], ["month", "Tháng"]]} />
                    <FilterField label="Ngày xem lịch">
                        <input type="date" value={dateKey(currentDate)} onChange={event => {
                            if (!event.target.value) return;
                            const date = new Date(`${event.target.value}T00:00:00`);
                            applyFilter(() => setCurrentDate(date));
                        }} />
                    </FilterField>
                    <button type="button" data-filter-action onClick={resetFilters}
                        className="personal-calendar-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors">
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
            </FilterBar>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">

            {error && <div className="m-5 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            {!error && !loading && rows.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-blue">Không có cuộc họp nào khớp với bộ lọc trong khoảng thời gian này.</p>
            )}

            <div className="divide-y divide-platinum-tint">
                {rows.map((m) => {
                    const st = statusOf(m.presence);
                    const Icon = st.icon;
                    return (
                        <div key={m.meetingId || m.id} className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="min-w-0">
                                <p data-ui-text="primary" className="text-sm font-bold text-midnight-indigo truncate">{m.title || 'Cuộc họp'}</p>
                                <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-blue">
                                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDateTime(m.startTime)} – {formatDateTime(m.endTime)}</span>
                                    {m.room?.roomName && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{m.room.roomName}</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {m.presence && (
                                    <span className="text-xs text-slate-blue">
                                        Có mặt <span className="font-bold text-midnight-indigo">{formatMinutes(m.presence.duration?.durationMs)}</span>
                                        {' '}({Math.round((m.presence.duration?.presentRatio || 0) * 100)}%)
                                    </span>
                                )}
                                <span data-ui-text="secondary" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${st.cls}`}>
                                    <Icon className="w-3.5 h-3.5" /> {st.label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {<PaginationRegion legacyVisible={page > 1 || hasMore}><PaginationFooter
                    currentPage={page}
                    pageSize={PAGE_SIZE}
                    onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                    onPageChange={setPage}
                    itemLabel={"cuộc họp"}
                    loading={loading}
                    hasNextPage={hasMore}
                    visibleCount={rows.length}
                    legacy={<div className="p-4 flex justify-end gap-2 border-t border-platinum-tint">
                    <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold disabled:opacity-50">Trước</button>
                    <span className="self-center text-xs text-slate-blue">Trang {page}</span>
                    <button type="button" disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold disabled:opacity-50">Sau</button>
                </div>}
                /></PaginationRegion>}
            </div>
        </div>
    );
};

export default MyMeetingAttendance;
