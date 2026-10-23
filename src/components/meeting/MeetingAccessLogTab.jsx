import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Database, LogIn, LogOut, RefreshCw, Search, ShieldQuestion } from 'lucide-react';
import { getMeetingAccessEvents } from '../../service/managerServices';

const formatTime = (value) => value
    ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

const eventStatus = (event) => {
    if (event.isStranger) return { label: 'Chưa xác định', className: 'bg-red-50 text-red-700 border-red-200' };
    if (event.isUnmatched) return { label: 'Cần kiểm tra', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'Đã xác minh', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

const buildMockEvents = () => {
    const now = Date.now();
    return [
        {
            id: 'mock-enter-1', eventTime: new Date(now - 4 * 60 * 1000).toISOString(),
            fullName: 'Nguyễn Hoàng Nam', userId: 'mock-user-1', direction: 'enter',
            zoneName: 'Tòa AI - Phòng AI01', cameraName: 'Camera cửa phòng AI01',
            cameraId: 'CAM-AI01-01', cameraGroupName: 'Nhóm camera phòng họp',
            similarity: 0.96, isStranger: false, isUnmatched: false,
        },
        {
            id: 'mock-enter-2', eventTime: new Date(now - 2 * 60 * 1000).toISOString(),
            fullName: 'Trần Minh Anh', userId: 'mock-user-2', direction: 'enter',
            zoneName: 'Tòa AI - Phòng AI01', cameraName: 'Camera cửa phòng AI01',
            cameraId: 'CAM-AI01-01', cameraGroupName: 'Nhóm camera phòng họp',
            similarity: 0.93, isStranger: false, isUnmatched: false,
        },
        {
            id: 'mock-leave-1', eventTime: new Date(now - 45 * 1000).toISOString(),
            fullName: 'Trần Minh Anh', userId: 'mock-user-2', direction: 'leave',
            zoneName: 'Tòa AI - Phòng AI01', cameraName: 'Camera cửa phòng AI01',
            cameraId: 'CAM-AI01-01', cameraGroupName: 'Nhóm camera phòng họp',
            similarity: 0.91, isStranger: false, isUnmatched: false,
        },
    ];
};

const MeetingAccessLogTab = ({ meetingId }) => {
    const [data, setData] = useState({ events: [], roomName: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mockEnabled, setMockEnabled] = useState(false);
    const [search, setSearch] = useState('');
    const [directionFilter, setDirectionFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const pageSize = 5;

    const refresh = useCallback(async () => {
        setError('');
        try {
            const response = await getMeetingAccessEvents(meetingId);
            setData(response?.data || { events: [], roomName: null });
        } catch (err) {
            setError(err?.message || 'Không thể tải nhật ký ra vào phòng họp.');
        } finally {
            setLoading(false);
        }
    }, [meetingId]);

    useEffect(() => {
        if (!meetingId) return undefined;
        refresh();
        const timer = setInterval(refresh, 5000);
        return () => clearInterval(timer);
    }, [meetingId, refresh]);

    const events = useMemo(() => (mockEnabled ? buildMockEvents() : data.events || []), [data.events, mockEnabled]);

    const currentPeople = useMemo(() => {
        const state = new Map();
        [...events].reverse().forEach((event) => {
            if (!event.userId) return;
            if (event.direction === 'enter') state.set(event.userId, event);
            if (event.direction === 'leave') state.delete(event.userId);
        });
        return [...state.values()];
    }, [events]);

    const filteredEvents = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
        return events.filter((event) => {
            const matchesSearch = !normalizedSearch || (event.fullName || 'Chưa rõ').toLocaleLowerCase('vi-VN').includes(normalizedSearch);
            const matchesDirection = directionFilter === 'all' || event.direction === directionFilter;
            const eventStatusKey = event.isStranger ? 'stranger' : event.isUnmatched ? 'review' : 'verified';
            const matchesStatus = statusFilter === 'all' || eventStatusKey === statusFilter;
            return matchesSearch && matchesDirection && matchesStatus;
        });
    }, [directionFilter, events, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
    const paginatedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        setPage(1);
    }, [directionFilter, search, statusFilter, mockEnabled]);

    useEffect(() => {
        setPage((currentPage) => Math.min(currentPage, totalPages));
    }, [totalPages]);

    if (loading) return <div className="p-8 text-center text-sm text-slate-blue">Đang tải nhật ký phòng họp...</div>;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-midnight-indigo">Nhật ký ra/vào phòng họp</h3>
                </div>
                <button onClick={refresh} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-platinum-tint text-xs font-bold text-slate-blue hover:text-action-blue hover:border-action-blue">
                    <RefreshCw className="w-3.5 h-3.5" /> Làm mới
                </button>
                {process.env.NODE_ENV !== 'production' && (
                    <button
                        onClick={() => setMockEnabled((enabled) => !enabled)}
                        title="Bật hoặc tắt dữ liệu mẫu giao diện"
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold ${mockEnabled ? 'border-action-blue bg-blue-50 text-action-blue' : 'border-platinum-tint text-slate-blue hover:text-action-blue hover:border-action-blue'}`}
                    >
                        <Database className="w-3.5 h-3.5" /> {mockEnabled ? 'Tắt dữ liệu mẫu' : 'Dữ liệu mẫu'}
                    </button>
                )}
            </div>

            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-platinum-tint bg-white p-3">
                <label className="relative min-w-[180px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-blue" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên người" className="w-full rounded-lg border border-platinum-tint py-2 pl-9 pr-3 text-xs text-midnight-indigo outline-none focus:border-action-blue" />
                </label>
                <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} className="rounded-lg border border-platinum-tint bg-white px-3 py-2 text-xs font-semibold text-slate-blue outline-none focus:border-action-blue">
                    <option value="all">Tất cả sự kiện</option>
                    <option value="enter">Vào phòng</option>
                    <option value="leave">Ra khỏi phòng</option>
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-platinum-tint bg-white px-3 py-2 text-xs font-semibold text-slate-blue outline-none focus:border-action-blue">
                    <option value="all">Tất cả trạng thái</option>
                    <option value="verified">Đã xác minh</option>
                    <option value="review">Cần kiểm tra</option>
                    <option value="stranger">Chưa xác định</option>
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60">
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Đang trong phòng</p>
                    <p className="text-2xl font-bold text-emerald-800 mt-1">{currentPeople.length} <span className="text-xs font-medium">người</span></p>
                </div>
                <div className="p-4 rounded-xl border border-platinum-tint bg-white">
                    <p className="text-[10px] font-bold uppercase text-slate-blue">Tổng sự kiện</p>
                    <p className="text-2xl font-bold text-midnight-indigo mt-1">{events.length}</p>
                </div>
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                    <p className="text-[10px] font-bold uppercase text-amber-700">Cần kiểm tra</p>
                    <p className="text-2xl font-bold text-amber-800 mt-1">{events.filter((e) => e.isStranger || e.isUnmatched).length}</p>
                </div>
            </div>

            <div className="border border-platinum-tint rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-cloud-mist text-slate-blue font-bold text-[11px]">
                            <tr><th className="p-3">Thời gian</th><th className="p-3">Người</th><th className="p-3">Sự kiện</th><th className="p-3">Zone / phòng</th><th className="p-3">Camera</th><th className="p-3">Trạng thái</th></tr>
                        </thead>
                        <tbody>
                            {paginatedEvents.map((event) => {
                                const status = eventStatus(event);
                                const entering = event.direction === 'enter';
                                return <tr key={event.id} className="border-t border-platinum-tint hover:bg-cloud-mist/30">
                                    <td className="p-3 whitespace-nowrap font-medium text-midnight-indigo">{formatTime(event.eventTime)}</td>
                                    <td className="p-3 font-semibold text-midnight-indigo">{event.fullName || 'Chưa rõ'}</td>
                                    <td className="p-3"><span className={`inline-flex items-center gap-1 font-bold ${entering ? 'text-emerald-700' : 'text-orange-700'}`}>{entering ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}{entering ? 'Vào phòng' : event.direction === 'leave' ? 'Ra khỏi phòng' : 'Ghi nhận'}</span></td>
                                    <td className="p-3 text-slate-blue">{event.zoneName || data.roomName || 'Chưa xác định'}</td>
                                    <td className="p-3 text-slate-blue">{event.cameraName || event.cameraId || 'Chưa xác định'}{event.cameraGroupName && <div className="text-[10px]">Nhóm: {event.cameraGroupName}</div>}</td>
                                    <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold ${status.className}`}>{event.isStranger ? <ShieldQuestion className="w-3 h-3" /> : event.isUnmatched ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}{status.label}</span></td>
                                </tr>;
                            })}
                            {!paginatedEvents.length && <tr><td colSpan="6" className="p-8 text-center text-slate-blue">Không có sự kiện phù hợp.</td></tr>}
                        </tbody>
                    </table>
                </div>
                {filteredEvents.length > 0 && (
                    <div className="flex items-center justify-between border-t border-platinum-tint px-3 py-2">
                        <span className="text-[11px] text-slate-blue">Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredEvents.length)} / {filteredEvents.length}</span>
                        <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page === 1} aria-label="Trang trước" className="rounded-md border border-platinum-tint p-1.5 text-slate-blue hover:text-action-blue disabled:cursor-not-allowed disabled:opacity-40">
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-12 text-center text-[11px] font-semibold text-midnight-indigo">{page} / {totalPages}</span>
                            <button type="button" onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page === totalPages} aria-label="Trang sau" className="rounded-md border border-platinum-tint p-1.5 text-slate-blue hover:text-action-blue disabled:cursor-not-allowed disabled:opacity-40">
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MeetingAccessLogTab;
