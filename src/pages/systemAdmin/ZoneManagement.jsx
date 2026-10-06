import { Activity, AlertTriangle, BarChart3, Calendar, Camera, CheckCircle, ChevronLeft, ChevronRight, Edit2, Eye, History, Info, LogIn, LogOut, Map, MapPin, Monitor, Plus, RefreshCw, Search, Server, Shield, ShieldCheck, ShieldQuestion, Trash2, Users, Video, X } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createPortal } from 'react-dom';
import {
    getZones, getZoneById, createZone, updateZone,
    deleteZone
} from '../../service/zoneServices';
import { getZoneAccessLog, getZonePresenceTimeline } from '../../service/sysAdminServices';
import { subscribeToZonePresence } from '../../utils/socket';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import ZoneLocationPicker, { parseZoneCoordinates } from '../../components/campus/ZoneLocationPicker';


// ─── helpers ────────────────────────────────────────────────────────────────

const getTodayVN = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const fmtEventTime = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
        });
    } catch { return '—'; }
};

// ─── inline badges ───────────────────────────────────────────────────────────

const ZoneDirectionBadge = ({ direction }) => {
    if (direction === 'enter')
        return <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 whitespace-nowrap"><LogIn className="w-2.5 h-2.5" />Vào</span>;
    if (direction === 'leave')
        return <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 whitespace-nowrap"><LogOut className="w-2.5 h-2.5" />Ra</span>;
    return <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap"><Eye className="w-2.5 h-2.5" />Thấy</span>;
};

const ZoneStatusBadge = ({ isStranger }) => {
    if (isStranger)
        return <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 whitespace-nowrap"><AlertTriangle className="w-2.5 h-2.5" />Người lạ</span>;
    return <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 whitespace-nowrap"><ShieldCheck className="w-2.5 h-2.5" />Khớp</span>;
};

// ─── ZoneAccessLogCard ───────────────────────────────────────────────────────

const ZONE_LOG_LIMIT = 20;

const ZoneAccessLogCard = ({ zoneId }) => {
    const [date, setDate] = useState(getTodayVN);
    const [page, setPage] = useState(1);
    const [events, setEvents] = useState([]);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [matchedCount, setMatchedCount] = useState(0);
    const [unmatchedCount, setUnmatchedCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

    // reset page when zone or date changes
    const prevZoneRef = useRef(zoneId);
    useEffect(() => {
        if (prevZoneRef.current !== zoneId) {
            prevZoneRef.current = zoneId;
            setPage(1);
        }
    }, [zoneId]);

    useEffect(() => { setPage(1); }, [date]);

    const fetchLog = useCallback(async (silent = false) => {
        if (!zoneId) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await getZoneAccessLog(zoneId, date, { page, limit: ZONE_LOG_LIMIT });
            if (res?.success && res.data) {
                const evList = res.data.events || res.data.items || [];
                const sorted = [...evList].sort((a, b) =>
                    new Date(b.eventTime || b.timestamp) - new Date(a.eventTime || a.timestamp)
                );
                setEvents(sorted);
                const pag = res.data.pagination || {};
                const tp = pag.totalPages ?? Math.max(1, Math.ceil((pag.total ?? evList.length) / ZONE_LOG_LIMIT));
                setTotalPages(tp);
                setTotal(res.data.totalEvents ?? pag.total ?? pag.totalItems ?? evList.length);
                setMatchedCount(res.data.matchedCount ?? 0);
                setUnmatchedCount(res.data.unmatchedCount ?? 0);
            } else {
                throw new Error(res?.message || 'Không thể tải nhật ký.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi tải nhật ký ra vào.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [zoneId, date, page]);

    useEffect(() => { fetchLog(); }, [fetchLog]);

    // silent polling — tự động cập nhật nhật ký ra/vào mỗi 2s
    useEffect(() => {
        const id = setInterval(() => fetchLog(true), 2000);
        return () => clearInterval(id);
    }, [fetchLog]);

    // B2 (Zone realtime, gate ZONE_REALTIME_ENABLED ở BE — mặc định OFF): khi BE
    // bật, nhận 'zone.presence.updated' để refetch ngay thay vì đợi vòng poll kế
    // tiếp. Polling 2s ở trên VẪN CHẠY SONG SONG không đổi — lưới an toàn khi
    // socket rớt/lỡ event hoặc lúc flag đang tắt. Ref giữ fetchLog mới nhất
    // (có date/page hiện tại) để effect chỉ resubscribe khi ĐỔI ZONE, không phải
    // mỗi lần đổi ngày/trang.
    const fetchLogRef = useRef(fetchLog);
    useEffect(() => { fetchLogRef.current = fetchLog; }, [fetchLog]);
    useEffect(() => {
        if (!zoneId) return;
        return subscribeToZonePresence(zoneId, () => fetchLogRef.current(true));
    }, [zoneId]);

    const openSnapshot = (eventId) => {
        setSnapshotEventId(eventId);
        setIsSnapshotOpen(true);
    };

    return (
        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-blue uppercase tracking-wider flex items-center gap-2">
                        <History className="w-4 h-4 text-action-blue" />
                        Nhật ký ra vào khu vực
                    </h3>
                    {!loading && total > 0 && (
                        <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">{total} sự kiện</span>
                            {matchedCount > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">{matchedCount} khớp</span>}
                            {/* Tạm ẩn badge "lượt người lạ" theo yêu cầu, giữ nguyên code để bật lại khi cần */}
                            {/* {unmatchedCount > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">{unmatchedCount} lượt người lạ</span>} */}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-action-blue pointer-events-none" />
                        <input
                            type="date"
                            value={date}
                            max={getTodayVN()}
                            onChange={(e) => setDate(e.target.value)}
                            className="pl-8 pr-3 py-1.5 border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo bg-white hover:border-action-blue/50 focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/10 transition-all cursor-pointer"
                        />
                    </div>
                    <span className="text-[10px] text-slate-400">Tự động cập nhật mỗi 2s</span>
                    <button
                        onClick={() => fetchLog()}
                        className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded-lg transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Event grid */}
            <div className="p-4">
                {loading ? (
                    <div className="grid grid-cols-3 gap-2.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="rounded-xl border border-platinum-tint overflow-hidden animate-pulse">
                                <div className="w-full aspect-video bg-slate-100" />
                                <div className="p-3 space-y-2">
                                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                                    <div className="flex gap-1.5 mt-1">
                                        <div className="h-4 w-10 bg-slate-100 rounded-full" />
                                        <div className="h-4 w-14 bg-slate-100 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="py-10 text-center text-slate-400">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">Không có sự kiện nào trong ngày này</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2.5">
                        {events.map((ev) => {
                            const time = fmtEventTime(ev.eventTime || ev.timestamp);
                            const name = ev.fullName || (ev.isStranger ? 'Người lạ' : 'Không nhận diện được');
                            const cardStyle = ev.isStranger
                                ? 'border-red-300 ring-1 ring-red-200'
                                : 'border-platinum-tint';
                            return (
                                <div key={ev.id} className={`rounded-xl border overflow-hidden bg-white hover:shadow-md transition-shadow ${cardStyle}`}>
                                    {/* Thumbnail — full width, 16:9 */}
                                    <div className="relative w-full">
                                        <ThumbnailImage
                                            eventId={ev.id}
                                            onClick={() => openSnapshot(ev.id)}
                                            className="w-full aspect-video cursor-pointer"
                                        />
                                        {/* Time overlay */}
                                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono leading-none">
                                            {time}
                                        </span>
                                        {/* Direction badge overlay */}
                                        <span className="absolute top-1.5 right-1.5">
                                            <ZoneDirectionBadge direction={ev.direction} />
                                        </span>
                                    </div>
                                    {/* Info row */}
                                    <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                                        <p className={`text-xs font-bold truncate ${ev.isStranger ? 'text-red-700' : 'text-midnight-indigo'}`}>
                                            {name}
                                        </p>
                                        <ZoneStatusBadge isStranger={ev.isStranger} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {!loading && events.length > 0 && (
                <div className="px-5 py-3 border-t border-platinum-tint flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                        Trang {page}/{totalPages} · {total} sự kiện
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="p-1.5 rounded-lg text-slate-blue hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-semibold text-midnight-indigo px-1">{page}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                            className="p-1.5 rounded-lg text-slate-blue hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Snapshot modal */}
            <EventSnapshotModal
                isOpen={isSnapshotOpen}
                onClose={() => { setIsSnapshotOpen(false); setSnapshotEventId(null); }}
                eventId={snapshotEventId}
            />
        </div>
    );
};

// ─── ZoneTimelineCard ────────────────────────────────────────────────────────
// UC-110: GET /campus-dashboard/zones/:zoneId/timeline
// BE trả event log thô (appear/disappear/count) — FE tự aggregate theo giờ VN

const toVnHour = (isoStr) => {
    try {
        return parseInt(
            new Date(isoStr).toLocaleString('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false
            }),
            10
        ) % 24;
    } catch { return 0; }
};

const buildIso = (dateStr, isEnd) =>
    isEnd ? `${dateStr}T23:59:59+07:00` : `${dateStr}T00:00:00+07:00`;

const MAX_TIMELINE_DAYS = 31;

const EVENT_TYPE_BADGE = {
    appear: (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
            <Eye className="w-2.5 h-2.5" />Xuất hiện
        </span>
    ),
    disappear: (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200 whitespace-nowrap">
            <X className="w-2.5 h-2.5" />Rời đi
        </span>
    ),
};

const ZoneTimelineCard = ({ zoneId }) => {
    const [fromDate, setFromDate] = useState(getTodayVN);
    const [toDate, setToDate] = useState(getTodayVN);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchTimeline = useCallback(async (silent = false) => {
        if (!zoneId) return;
        const fromMs = new Date(fromDate).getTime();
        const toMs = new Date(toDate).getTime();
        if (toMs < fromMs) {
            setError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
            return;
        }
        if ((toMs - fromMs) > MAX_TIMELINE_DAYS * 86400000) {
            setError(`Khoảng thời gian tối đa ${MAX_TIMELINE_DAYS} ngày.`);
            return;
        }
        if (!silent) {
            setLoading(true);
            setData(null);
        }
        setError(null);
        try {
            const res = await getZonePresenceTimeline(zoneId, {
                from: buildIso(fromDate, false),
                to: buildIso(toDate, true),
            });
            if (res?.success) {
                setData(res.data);
            } else {
                throw new Error(res?.message || 'Không thể tải dữ liệu timeline.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi tải timeline.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [zoneId, fromDate, toDate]);

    // Reset + refetch khi đổi zone
    useEffect(() => {
        setData(null);
        setError(null);
        fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoneId]);

    // silent polling — tự động cập nhật timeline mỗi 6s
    useEffect(() => {
        const id = setInterval(() => fetchTimeline(true), 6000);
        return () => clearInterval(id);
    }, [fetchTimeline]);

    // B2 (Zone realtime, gate ZONE_REALTIME_ENABLED ở BE — mặc định OFF): khi BE
    // bật, nhận 'zone.presence.updated' để refetch ngay thay vì đợi vòng poll kế
    // tiếp. Polling 6s ở trên VẪN CHẠY SONG SONG không đổi — lưới an toàn khi
    // socket rớt/lỡ event hoặc lúc flag đang tắt. Ref giữ fetchTimeline mới nhất
    // (có fromDate/toDate hiện tại) để effect chỉ resubscribe khi ĐỔI ZONE.
    const fetchTimelineRef = useRef(fetchTimeline);
    useEffect(() => { fetchTimelineRef.current = fetchTimeline; }, [fetchTimeline]);
    useEffect(() => {
        if (!zoneId) return;
        return subscribeToZonePresence(zoneId, () => fetchTimelineRef.current(true));
    }, [zoneId]);

    // Aggregate events by VN hour (0–23) cho BarChart
    const hourlyData = useMemo(() => {
        if (!data?.events?.length) return [];
        const buckets = Array.from({ length: 24 }, (_, h) => ({
            hour: h, appear: 0, disappear: 0,
        }));
        data.events.forEach(ev => {
            const h = toVnHour(ev.eventTime);
            if (ev.eventType === 'appear') buckets[h].appear++;
            if (ev.eventType === 'disappear') buckets[h].disappear++;
        });
        return buckets;
    }, [data]);

    const appearTotal = useMemo(() => data?.events?.filter(e => e.eventType === 'appear').length ?? 0, [data]);
    const recentEvents = useMemo(() => [...(data?.events ?? [])].filter(e => e.eventType !== 'count').reverse().slice(0, 30), [data]);
    const hasChart = hourlyData.some(b => b.appear > 0 || b.disappear > 0);

    return (
        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-blue uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-action-blue" />
                    Dòng thời gian hiện diện
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-blue font-medium">Từ</span>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            className="px-2 py-1 border border-platinum-tint rounded-lg text-xs text-midnight-indigo focus:outline-none focus:border-action-blue"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-blue font-medium">Đến</span>
                        <input
                            type="date"
                            value={toDate}
                            min={fromDate}
                            onChange={e => setToDate(e.target.value)}
                            className="px-2 py-1 border border-platinum-tint rounded-lg text-xs text-midnight-indigo focus:outline-none focus:border-action-blue"
                        />
                    </div>
                    <span className="text-[10px] text-slate-400">Tự động cập nhật mỗi 6s</span>
                    <button
                        onClick={() => fetchTimeline()}
                        disabled={loading}
                        title="Tải lại"
                        className="p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {loading ? (
                <div className="flex items-center justify-center h-36 text-slate-blue text-sm gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang tải timeline...</span>
                </div>
            ) : error ? (
                <div className="p-5 flex items-center gap-2 text-sm text-red-600 bg-red-50 border-t border-red-100">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            ) : !data || data.events.length === 0 ? (
                <div className="p-10 text-center text-slate-blue">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">{data?.message || 'Không có sự kiện trong khoảng thời gian này.'}</p>
                    <p className="text-xs mt-1">Camera khu vực cần ghi nhận sự kiện hiện diện để hiển thị dữ liệu.</p>
                </div>
            ) : (
                <div className="p-5 space-y-5">
                    {/* KPI chips */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <div className="bg-cloud-mist/40 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-slate-blue font-medium uppercase">Tổng sự kiện</p>
                            <p className="text-lg font-bold text-midnight-indigo mt-0.5">{data.events.length}</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-blue-600 font-medium uppercase">Lượt xuất hiện</p>
                            <p className="text-lg font-bold text-blue-700 mt-0.5">{appearTotal}</p>
                        </div>
                    </div>

                    {/* personDataAvailable warning */}
                    {data.personDataAvailable === false && (
                        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Khu vực chưa có dữ liệu nhận diện khuôn mặt — tất cả sự kiện không gắn danh tính người dùng.</span>
                        </div>
                    )}

                    {/* Bar chart — appear events by VN hour */}
                    {hasChart && (
                        <div>
                            <p className="text-[10px] font-bold text-midnight-indigo uppercase mb-3 flex items-center gap-1.5">
                                <BarChart3 className="w-3.5 h-3.5 text-action-blue" />
                                Phân bố lượt xuất hiện theo giờ (giờ VN)
                            </p>
                            <div className="h-44">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hourlyData} barSize={10} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="hour"
                                            tickLine={false}
                                            axisLine={false}
                                            style={{ fontSize: 9, fill: '#64748b' }}
                                            tickFormatter={h => `${h}h`}
                                            interval={2}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            style={{ fontSize: 9, fill: '#64748b' }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            labelFormatter={h => `${h}:00 – ${h}:59`}
                                            formatter={(v, name) => [v, name === 'appear' ? 'Xuất hiện' : 'Rời đi']}
                                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
                                        <Bar dataKey="appear" radius={[3, 3, 0, 0]} name="appear">
                                            {hourlyData.map((entry, i) => (
                                                <Cell key={i} fill={entry.appear === 0 ? '#e2e8f0' : '#3b82f6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Recent events list (30 sự kiện gần nhất) */}
                    <div>
                        <p className="text-[10px] font-bold text-midnight-indigo uppercase mb-3 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-slate-blue" />
                            {recentEvents.length < (data?.events?.length ?? 0)
                                ? `${recentEvents.length} sự kiện gần nhất (tổng ${data.events.length})`
                                : `${recentEvents.length} sự kiện`}
                        </p>
                        <div className="border border-platinum-tint rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-platinum-tint text-[10px] font-bold text-slate-blue uppercase">
                                        <th className="px-3 py-2">Thời điểm</th>
                                        <th className="px-3 py-2">Loại</th>
                                        <th className="px-3 py-2">Danh tính</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint">
                                    {recentEvents.map((ev, i) => (
                                        <tr key={i} className="hover:bg-cloud-mist/30 transition-colors">
                                            <td className="px-3 py-2 font-mono text-[10px] text-midnight-indigo whitespace-nowrap">
                                                {fmtEventTime(ev.eventTime)}
                                            </td>
                                            <td className="px-3 py-2">
                                                {EVENT_TYPE_BADGE[ev.eventType] ?? (
                                                    <span className="text-[10px] text-slate-blue">{ev.eventType}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {ev.isStranger ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-red-700 font-medium">
                                                        <AlertTriangle className="w-2.5 h-2.5" />Người lạ
                                                    </span>
                                                ) : ev.userId ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                                                        <CheckCircle className="w-2.5 h-2.5" />Đã nhận dạng
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-steel-gray">
                                                        <Shield className="w-2.5 h-2.5" />Chưa xác định
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── main component ───────────────────────────────────────────────────────────

const ZoneManagement = () => {
    // Data states
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);

    // UI states
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState('log'); // 'log' | 'timeline'
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [zoneToDelete, setZoneToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        zone_code: '',
        zone_name: '',
        zone_type: 'gate',
        status: 'active',
        building: '',
        floor: '',
        description: '',
        metadata_json: '',
        latitude: '',
        longitude: ''
    });

    const ZONE_TYPE_LABELS = {
        gate: 'Cổng ra vào',
        corridor: 'Hành lang',
        lobby: 'Sảnh lễ tân',
        parking: 'Bãi đỗ xe',
        room: 'Phòng họp'
    };

    const [createForm, setCreateForm] = useState({
        zone_code: '',
        zone_name: '',
        zone_type: 'gate',
        building: '',
        floor: '',
        description: '',
        latitude: '',
        longitude: ''
    });


    const fetchZones = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await getZones({ limit: 100 });
            if (res?.success) {
                setZones(res.data || []);
            } else {
                setError('Không thể tải danh sách khu vực.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi tải dữ liệu hệ thống.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchZones();
    }, [fetchZones]);

    // silent polling — tự động cập nhật danh sách khu vực mỗi 2s
    useEffect(() => {
        const id = setInterval(() => fetchZones(true), 2000);
        return () => clearInterval(id);
    }, [fetchZones]);

    useEffect(() => {
        if (successMessage || error) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, error]);

    const handleSelectZone = async (zone) => {
        setDetailLoading(true);
        setDetailTab('log');
        setError(null);
        try {
            const res = await getZoneById(zone.id);
            if (res?.success) {
                setSelectedZone(res.data);
            } else {
                setSelectedZone(zone); // Fallback
            }
        } catch (err) {
            setSelectedZone(zone);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        // Client-side validations
        if (createForm.zone_code.trim().length > 80) {
            setError("Mã khu vực tối đa 80 ký tự.");
            return;
        }
        if (createForm.zone_name.trim().length > 150) {
            setError("Tên khu vực tối đa 150 ký tự.");
            return;
        }
        if (createForm.building && createForm.building.trim().length > 100) {
            setError("Tên tòa nhà tối đa 100 ký tự.");
            return;
        }
        if (createForm.floor && createForm.floor.trim().length > 30) {
            setError("Tầng tối đa 30 ký tự.");
            return;
        }
        if (createForm.description && createForm.description.trim().length > 255) {
            setError("Mô tả tối đa 255 ký tự.");
            return;
        }
        const createCoords = parseZoneCoordinates(createForm.latitude, createForm.longitude);
        if (createCoords.error) {
            setError(createCoords.error);
            return;
        }

        try {
            const res = await createZone({ ...createForm, ...createCoords });
            if (res?.success) {
                setSuccessMessage('Tạo khu vực mới thành công!');
                setIsCreateModalOpen(false);
                setCreateForm({ zone_code: '', zone_name: '', zone_type: 'gate', building: '', floor: '', description: '', latitude: '', longitude: '' });
                fetchZones();
            } else {
                setError(res?.message || 'Tạo khu vực thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tạo.');
        }
    };

    const handleDeleteClick = (zone, e) => {
        e.stopPropagation();
        setZoneToDelete(zone);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!zoneToDelete) return;
        setIsDeleting(true);
        try {
            const res = await deleteZone(zoneToDelete.id);
            if (res?.success) {
                setSuccessMessage(`Đã xoá khu vực ${zoneToDelete.zone_name} thành công.`);
                setIsDeleteModalOpen(false);
                if (selectedZone?.id === zoneToDelete.id) {
                    setSelectedZone(null);
                }
                fetchZones();
            } else {
                setError(res?.message || 'Không thể xoá khu vực.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi xoá.');
        } finally {
            setIsDeleting(false);
            setZoneToDelete(null);
        }
    };

    const handleEditClick = (zone, e) => {
        if (e) e.stopPropagation();
        setEditForm({
            zone_code: zone.zone_code || '',
            zone_name: zone.zone_name || '',
            zone_type: zone.zone_type || 'gate',
            status: zone.status || 'active',
            building: zone.building || '',
            floor: zone.floor || '',
            description: zone.description || '',
            metadata_json: zone.metadata_json ? JSON.stringify(zone.metadata_json, null, 2) : '',
            latitude: zone.latitude != null ? String(zone.latitude) : '',
            longitude: zone.longitude != null ? String(zone.longitude) : ''
        });
        setSelectedZone(zone);
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        // Client-side validations
        if (editForm.zone_code.trim().length > 80) {
            setError("Mã khu vực tối đa 80 ký tự.");
            return;
        }
        if (editForm.zone_name.trim().length > 150) {
            setError("Tên khu vực tối đa 150 ký tự.");
            return;
        }
        if (editForm.building && editForm.building.trim().length > 100) {
            setError("Tên tòa nhà tối đa 100 ký tự.");
            return;
        }
        if (editForm.floor && editForm.floor.trim().length > 30) {
            setError("Tầng tối đa 30 ký tự.");
            return;
        }
        if (editForm.description && editForm.description.trim().length > 255) {
            setError("Mô tả tối đa 255 ký tự.");
            return;
        }

        const payload = {};
        if (editForm.zone_code.trim() !== selectedZone.zone_code) {
            payload.zone_code = editForm.zone_code.trim();
        }
        if (editForm.zone_name.trim() !== selectedZone.zone_name) {
            payload.zone_name = editForm.zone_name.trim();
        }
        if (editForm.zone_type !== selectedZone.zone_type) {
            payload.zone_type = editForm.zone_type;
        }
        if (editForm.status !== selectedZone.status) {
            payload.status = editForm.status;
        }

        const oldBuilding = selectedZone.building || '';
        if (editForm.building.trim() !== oldBuilding) {
            payload.building = editForm.building.trim() === '' ? null : editForm.building.trim();
        }

        const oldFloor = selectedZone.floor || '';
        if (editForm.floor.trim() !== oldFloor) {
            payload.floor = editForm.floor.trim() === '' ? null : editForm.floor.trim();
        }

        const oldDesc = selectedZone.description || '';
        if (editForm.description.trim() !== oldDesc) {
            payload.description = editForm.description.trim() === '' ? null : editForm.description.trim();
        }

        const editCoords = parseZoneCoordinates(editForm.latitude, editForm.longitude);
        if (editCoords.error) {
            setError(editCoords.error);
            return;
        }
        if (editCoords.latitude !== (selectedZone.latitude ?? null) || editCoords.longitude !== (selectedZone.longitude ?? null)) {
            payload.latitude = editCoords.latitude;
            payload.longitude = editCoords.longitude;
        }

        let parsedMetadata = null;
        if (editForm.metadata_json.trim()) {
            try {
                parsedMetadata = JSON.parse(editForm.metadata_json);
            } catch (err) {
                setError("Định dạng JSON của metadata không hợp lệ.");
                return;
            }
        }
        const oldMetadataStr = selectedZone.metadata_json ? JSON.stringify(selectedZone.metadata_json) : '';
        const newMetadataStr = parsedMetadata ? JSON.stringify(parsedMetadata) : '';
        if (newMetadataStr !== oldMetadataStr) {
            payload.metadata_json = parsedMetadata;
        }

        if (Object.keys(payload).length === 0) {
            setSuccessMessage("Không có thay đổi nào được thực hiện.");
            setIsEditModalOpen(false);
            return;
        }

        try {
            const res = await updateZone(selectedZone.id, payload);
            if (res?.success) {
                setSuccessMessage('Cập nhật khu vực thành công!');
                setIsEditModalOpen(false);
                setSelectedZone(res.data || { ...selectedZone, ...payload });
                fetchZones();
            } else {
                setError(res?.message || 'Cập nhật khu vực thất bại.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi gửi yêu cầu cập nhật.');
        }
    };

        const filteredZones = zones.filter(z => {
            const searchLower = searchTerm.toLowerCase();
            const loc = [z.building, z.floor].filter(Boolean).join(' - ').toLowerCase();
            return z.zone_name?.toLowerCase().includes(searchLower) || loc.includes(searchLower);
        });

        return (
            <div className="h-full flex flex-col space-y-4">
                {/* HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm-1 border border-platinum-tint">
                    <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                            <MapPin className="w-3.5 h-3.5" />
                            Khu vực
                        </span>
                        <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý khu vực</h1>
                        <p className="text-slate-blue text-sm mt-1">
                            Thiết lập các khu vực giám sát và gán camera AI để quản lý hiện diện.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-glacier-blue transition-all"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Tạo khu vực
                    </button>
                </div>

                {/* MESSAGES */}
                {(error || successMessage) && (
                    <div className={`p-4 rounded-xl border flex items-center ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                        {error ? <AlertTriangle className="w-5 h-5 mr-3 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-3 shrink-0" />}
                        <p className="text-sm font-medium">{error || successMessage}</p>
                    </div>
                )}

                {/* MAIN CONTENT PANES */}
                <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
                    {/* ZONES LIST PANE */}
                    <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-2xl shadow-sm-1 border border-platinum-tint overflow-hidden">
                        <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm khu vực..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2">Tự động cập nhật mỗi 2s</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-blue">
                                    <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                                    <p className="text-sm">Đang tải danh sách...</p>
                                </div>
                            ) : filteredZones.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-blue opacity-70">
                                    <Map className="w-8 h-8 mb-3" />
                                    <p className="text-sm">Không tìm thấy khu vực nào</p>
                                </div>
                            ) : (
                                filteredZones.map((zone) => (
                                    <div
                                        key={zone.id}
                                        onClick={() => handleSelectZone(zone)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer group ${selectedZone?.id === zone.id
                                            ? 'border-action-blue bg-blue-50/50 shadow-sm'
                                            : 'border-platinum-tint bg-white hover:border-action-blue/50 hover:bg-cloud-mist/20'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="font-bold text-sm text-midnight-indigo">{zone.zone_name}</h3>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => handleEditClick(zone, e)}
                                                    className="p-1 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded transition-colors"
                                                    title="Sửa khu vực"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteClick(zone, e)}
                                                    className="p-1 text-slate-blue hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Xoá khu vực"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-blue flex items-center mt-1">
                                            <MapPin className="w-3 h-3 mr-1" />
                                            {[zone.building, zone.floor].filter(Boolean).join(' - ') || 'Chưa cập nhật vị trí'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ZONE DETAIL PANE */}
                    <div className="w-full lg:w-2/3 flex flex-col bg-white rounded-2xl shadow-sm-1 border border-platinum-tint overflow-hidden">
                        {selectedZone ? (
                            <>
                                <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Map className="w-5 h-5 text-action-blue shrink-0" />
                                        <h2 className="font-bold text-midnight-indigo">{selectedZone.zone_name}</h2>
                                        <button
                                            onClick={() => setIsInfoModalOpen(true)}
                                            className="p-1 rounded-full text-action-blue hover:bg-blue-50 transition-colors"
                                            title="Xem thông tin chi tiết khu vực"
                                        >
                                            <Info className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Tab bar */}
                                <div className="border-b border-platinum-tint bg-white px-4 flex gap-0">
                                    <button
                                        onClick={() => setDetailTab('log')}
                                        className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                            detailTab === 'log'
                                                ? 'border-action-blue text-action-blue'
                                                : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                        }`}
                                    >
                                        <History className="w-3.5 h-3.5" />
                                        Nhật ký ra/vào
                                    </button>
                                    <button
                                        onClick={() => setDetailTab('timeline')}
                                        className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                            detailTab === 'timeline'
                                                ? 'border-action-blue text-action-blue'
                                                : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                        }`}
                                    >
                                        <Activity className="w-3.5 h-3.5" />
                                        Dòng thời gian
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                                    {detailLoading ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-slate-blue">
                                            <RefreshCw className="w-6 h-6 animate-spin mb-3" />
                                            <p className="text-sm">Đang tải chi tiết...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {detailTab === 'log' && (
                                                <ZoneAccessLogCard zoneId={selectedZone.id} />
                                            )}
                                            {detailTab === 'timeline' && (
                                                <ZoneTimelineCard zoneId={selectedZone.id} />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-blue">
                                <Map className="w-16 h-16 mb-4 opacity-20" />
                                <p className="font-medium text-midnight-indigo mb-1">Chưa chọn khu vực</p>
                                <p className="text-sm">Vui lòng chọn một khu vực bên danh sách để xem và cấu hình.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* CREATE MODAL */}
                {isCreateModalOpen && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                            <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                                <h3 className="font-bold text-midnight-indigo">Tạo khu vực mới</h3>
                                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">✕</button>
                            </div>
                            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã khu vực <span className="text-red-500">*</span></label>
                                    <input required type="text" value={createForm.zone_code} onChange={e => setCreateForm({ ...createForm, zone_code: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: ROOM-101" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên khu vực <span className="text-red-500">*</span></label>
                                    <input required type="text" value={createForm.zone_name} onChange={e => setCreateForm({ ...createForm, zone_name: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Phòng họp 1" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại khu vực <span className="text-red-500">*</span></label>
                                    <select required value={createForm.zone_type} onChange={e => setCreateForm({ ...createForm, zone_type: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm">
                                        <option value="gate">Cổng ra vào</option>
                                        <option value="corridor">Hành lang</option>
                                        <option value="lobby">Sảnh lễ tân</option>
                                        <option value="parking">Bãi đỗ xe</option>
                                    </select>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tòa nhà</label>
                                        <input type="text" value={createForm.building} onChange={e => setCreateForm({ ...createForm, building: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Toà nhà A" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tầng</label>
                                        <input type="text" value={createForm.floor} onChange={e => setCreateForm({ ...createForm, floor: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Tầng 1" />
                                    </div>
                                </div>
                                <ZoneLocationPicker
                                    latitude={createForm.latitude}
                                    longitude={createForm.longitude}
                                    onChange={(latitude, longitude) => setCreateForm({ ...createForm, latitude, longitude })}
                                />
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả</label>
                                    <textarea rows="3" value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Mô tả chức năng khu vực..." />
                                </div>
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                    <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                    <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue">Tạo mới</button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

                {/* EDIT MODAL */}
                {isEditModalOpen && selectedZone && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                            <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                                <h3 className="font-bold text-midnight-indigo">Cập nhật khu vực</h3>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">✕</button>
                            </div>
                            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã khu vực <span className="text-red-500">*</span></label>
                                    <input required type="text" value={editForm.zone_code} onChange={e => setEditForm({ ...editForm, zone_code: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: ROOM-101" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên khu vực <span className="text-red-500">*</span></label>
                                    <input required type="text" value={editForm.zone_name} onChange={e => setEditForm({ ...editForm, zone_name: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Phòng họp 1" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại khu vực <span className="text-red-500">*</span></label>
                                        <select required value={editForm.zone_type} onChange={e => setEditForm({ ...editForm, zone_type: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white">
                                            <option value="gate">Cổng ra vào</option>
                                            <option value="corridor">Hành lang</option>
                                            <option value="lobby">Sảnh lễ tân</option>
                                            <option value="parking">Bãi đỗ xe</option>
                                            <option value="room">Phòng họp</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Trạng thái <span className="text-red-500">*</span></label>
                                        <select required value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white">
                                            <option value="active">Đang hoạt động</option>
                                            <option value="inactive">Không hoạt động</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tòa nhà</label>
                                        <input type="text" value={editForm.building} onChange={e => setEditForm({ ...editForm, building: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Toà nhà A" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tầng</label>
                                        <input type="text" value={editForm.floor} onChange={e => setEditForm({ ...editForm, floor: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Tầng 1" />
                                    </div>
                                </div>
                                <ZoneLocationPicker
                                    latitude={editForm.latitude}
                                    longitude={editForm.longitude}
                                    onChange={(latitude, longitude) => setEditForm({ ...editForm, latitude, longitude })}
                                />
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả</label>
                                    <textarea rows="2" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Mô tả chức năng khu vực..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Metadata (JSON format)</label>
                                    <textarea rows="3" value={editForm.metadata_json} onChange={e => setEditForm({ ...editForm, metadata_json: e.target.value })} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono resize-none" placeholder='VD: { "note": "Ghi chú thêm" }' />
                                </div>
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                    <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue">Lưu thay đổi</button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

                {/* INFO MODAL */}
                {isInfoModalOpen && selectedZone && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setIsInfoModalOpen(false)}>
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Info className="w-4 h-4 text-action-blue" />
                                    <h3 className="font-bold text-midnight-indigo">Thông tin khu vực</h3>
                                </div>
                                <button onClick={() => setIsInfoModalOpen(false)} className="p-1.5 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-lg transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center shrink-0">
                                        <Map className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-midnight-indigo text-base">{selectedZone.zone_name}</p>
                                        <p className="text-xs font-mono text-slate-400 mt-0.5">{selectedZone.zone_code || selectedZone.id}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5 pt-2">
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Loại khu vực</p>
                                        <p className="text-sm font-semibold text-midnight-indigo">
                                            {ZONE_TYPE_LABELS[selectedZone.zone_type] || selectedZone.zone_type || '—'}
                                        </p>
                                    </div>
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Trạng thái</p>
                                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${selectedZone.status === 'active' || !selectedZone.status ? 'text-emerald-700' : 'text-slate-500'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${selectedZone.status === 'inactive' ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                                            {selectedZone.status === 'inactive' ? 'Không hoạt động' : 'Đang hoạt động'}
                                        </span>
                                    </div>
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Tòa nhà</p>
                                        <p className="text-sm font-semibold text-midnight-indigo">{selectedZone.building || '—'}</p>
                                    </div>
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Tầng</p>
                                        <p className="text-sm font-semibold text-midnight-indigo">{selectedZone.floor || '—'}</p>
                                    </div>
                                </div>
                                {selectedZone.description && (
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Mô tả</p>
                                        <p className="text-sm text-midnight-indigo">{selectedZone.description}</p>
                                    </div>
                                )}
                                {selectedZone.createdAt && (
                                    <div className="bg-cloud-mist/40 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Ngày tạo</p>
                                        <p className="text-sm font-semibold text-midnight-indigo">
                                            {new Date(selectedZone.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* DELETE MODAL */}
                {isDeleteModalOpen && zoneToDelete && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-sm w-full flex flex-col overflow-hidden">
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-midnight-indigo mb-2">Xác nhận xoá khu vực</h3>
                                <p className="text-sm text-slate-blue mb-1">
                                    Bạn có chắc chắn muốn xoá khu vực <span className="font-bold text-midnight-indigo">{zoneToDelete.zone_name}</span>?
                                </p>
                            </div>
                            <div className="p-4 bg-cloud-mist/30 border-t border-platinum-tint flex justify-end gap-3">
                                <button onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} className="px-4 py-2 bg-white border border-platinum-tint text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist">Hủy</button>
                                <button onClick={handleConfirmDelete} disabled={isDeleting} className="inline-flex items-center px-4 py-2 bg-red-600 text-white font-semibold rounded-xl text-sm hover:bg-red-700">
                                    {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Xoá vĩnh viễn'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    };

export default ZoneManagement;
