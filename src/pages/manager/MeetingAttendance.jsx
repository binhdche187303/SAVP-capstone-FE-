import { Activity, AlertTriangle, ArrowLeft, Calendar, Clock, RefreshCw, Search, Users, MapPin, ArrowRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { getMeetings } from '../../service/businessAdminServices';
import MeetingPresenceIVSS from '../../components/meeting/MeetingPresenceIVSS';
import Pagination from '../../components/common/Pagination';

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

const ITEMS_PER_PAGE = 10;

const MeetingAttendance = () => {
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

    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const fetchMeetings = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                status: 'completed',
                page,
                limit: ITEMS_PER_PAGE,
            };
            // BE so sanh start_time >= from / <= to theo dung timestamp truyen len
            // (khong tu suy ra ca ngay) — phai gui du gio, neu khong "to" se bi hieu
            // la 00:00:00 va cat mat toan bo cuoc hop trong ngay hom do.
            if (fromDate) params.from = `${fromDate}T00:00:00+07:00`;
            if (toDate) params.to = `${toDate}T23:59:59+07:00`;
            if (search.trim()) params.search = search.trim();

            const res = await getMeetings(params);
            if (res?.success) {
                setMeetings(res.data?.items || res.data || []);
                const meta = res.data?.meta || res.meta;
                if (meta?.totalPages) setTotalPages(meta.totalPages);
                else if (meta?.total && meta?.limit) setTotalPages(Math.ceil(meta.total / meta.limit));
                else setTotalPages(1);
            } else {
                throw new Error(res?.message || 'Không thể tải danh sách cuộc họp.');
            }
        } catch (err) {
            setError(err.message || 'Lỗi hệ thống khi tải danh sách cuộc họp.');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, search, page]);

    useEffect(() => {
        fetchMeetings();
    }, [fetchMeetings]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchMeetings();
    };

    if (selectedMeeting) {
        return (
            <div className="p-6 space-y-5">
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
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Đã kết thúc
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-blue mt-1">
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
        <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <Activity className="w-5 h-5 text-action-blue" />
                        Chuyên cần phòng ban
                    </h1>
                    <p className="text-xs text-slate-blue mt-0.5">Xem thời lượng tham dự thực tế của nhân viên theo từng cuộc họp</p>
                </div>
            </div>

            {/* Filters */}
            <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-platinum-tint p-4 shadow-sm flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Từ ngày</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                    />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Đến ngày</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                    />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                    <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wide">Tìm kiếm</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tên cuộc họp..."
                            className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                        />
                        <Search className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                    </div>
                </div>
                <button
                    type="submit"
                    className="px-4 py-2 bg-action-blue hover:bg-action-blue/90 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
                >
                    Áp dụng
                </button>
            </form>

            {/* Meeting list */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">
                        Danh sách cuộc họp đã kết thúc
                    </h3>
                    <button
                        onClick={() => { setPage(1); fetchMeetings(); }}
                        className="p-2 hover:bg-cloud-mist rounded-lg text-slate-blue hover:text-midnight-indigo transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs text-slate-blue font-semibold">Đang tải danh sách cuộc họp...</span>
                    </div>
                ) : error ? (
                    <div className="p-8 flex flex-col items-center gap-3 text-center">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                        <p className="text-xs text-red-700 font-semibold">{error}</p>
                        <button onClick={fetchMeetings} className="text-xs font-bold text-action-blue hover:underline">Thử lại</button>
                    </div>
                ) : meetings.length === 0 ? (
                    <div className="p-10 flex flex-col items-center gap-2 text-center">
                        <Calendar className="w-10 h-10 text-steel-gray" />
                        <p className="text-sm font-semibold text-midnight-indigo">Không có cuộc họp nào</p>
                        <p className="text-xs text-slate-blue">Thử thay đổi bộ lọc ngày hoặc từ khoá tìm kiếm</p>
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-platinum-tint">
                            {meetings.map((m) => (
                                <div
                                    key={m.id}
                                    className="px-5 py-4 hover:bg-cloud-mist/30 transition-colors flex items-start gap-4"
                                >
                                    {/* Left accent */}
                                    <div className="w-1 self-stretch rounded-full bg-purple-300 flex-shrink-0 mt-0.5" />

                                    {/* Content */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                        {/* Title row */}
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-bold text-midnight-indigo leading-snug">
                                                {m.title || m.name || 'Cuộc họp không tên'}
                                            </p>
                                        </div>

                                        {/* Time */}
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-blue font-medium">
                                            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span>{formatDateTime(m.startTime || m.start_time)}</span>
                                            <span className="text-steel-gray">–</span>
                                            <span>{formatDateTime(m.endTime || m.end_time)}</span>
                                        </div>

                                        {/* Badges */}
                                        <div className="flex flex-wrap gap-2">
                                            {(m.room?.name || m.roomName) && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                                    <MapPin className="w-3 h-3" />
                                                    {m.room?.name || m.roomName}
                                                </span>
                                            )}
                                            {(m.participantCount != null || m.participants?.length != null) && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-100">
                                                    <Users className="w-3 h-3" />
                                                    {m.participantCount ?? m.participants?.length} người tham dự
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* CTA */}
                                    <div className="flex-shrink-0 self-center flex flex-col items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                            Đã kết thúc
                                        </span>
                                        <button
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

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-5 py-3 border-t border-platinum-tint flex items-center justify-between">
                                <span className="text-[11px] text-slate-blue">Trang {page} / {totalPages}</span>
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={(p) => setPage(p)}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MeetingAttendance;
