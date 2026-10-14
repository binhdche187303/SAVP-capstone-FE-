import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { getMyMeetingHistory } from '../../service/employeeServices';
import { getUserPresence } from '../../service/managerServices';

// "Lịch sử tham dự" — điểm danh họp của CHÍNH MÌNH: lịch sử họp đã kết thúc (/me/meetings/history)
// + thời lượng có mặt IVSS của user hiện tại (BE chỉ cho EMPLOYEE xem bản thân — SELF_ONLY).
const PAGE_SIZE = 10;

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
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getMyMeetingHistory({ status: ['completed'], page, limit: PAGE_SIZE });
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
    }, [page]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
            <div className="p-5 border-b border-platinum-tint flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Lịch sử tham dự họp</h2>
                    <p className="text-xs text-slate-blue mt-1">Thời gian có mặt của bạn trong các cuộc họp đã kết thúc (camera nhận diện).</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-slate-blue hover:text-midnight-indigo disabled:opacity-60">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </button>
            </div>

            {error && <div className="m-5 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            {!error && !loading && rows.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-blue">Bạn chưa có cuộc họp nào đã kết thúc.</p>
            )}

            <div className="divide-y divide-platinum-tint">
                {rows.map((m) => {
                    const st = statusOf(m.presence);
                    const Icon = st.icon;
                    return (
                        <div key={m.meetingId || m.id} className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-midnight-indigo truncate">{m.title || 'Cuộc họp'}</p>
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
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${st.cls}`}>
                                    <Icon className="w-3.5 h-3.5" /> {st.label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {(page > 1 || hasMore) && (
                <div className="p-4 flex justify-end gap-2 border-t border-platinum-tint">
                    <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold disabled:opacity-50">Trước</button>
                    <span className="self-center text-xs text-slate-blue">Trang {page}</span>
                    <button type="button" disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold disabled:opacity-50">Sau</button>
                </div>
            )}
        </div>
    );
};

export default MyMeetingAttendance;
