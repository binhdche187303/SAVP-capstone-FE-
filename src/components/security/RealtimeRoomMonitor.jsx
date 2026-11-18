import TableColumns from '../common/TableColumns';
import PaginationFooter from '../common/PaginationFooter';
import ResponsiveTable from '../common/ResponsiveTable';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    getRoomRealtimeStatus, 
    getNoShowByRoom, 
    handleNoShowCase, 
    releaseNoShowRoom,
    getAllNoShowCases
} from '../../service/businessAdminServices';
import { Users, AlertTriangle, CheckCircle, XCircle, Clock, Video, Eye, Unlock, RefreshCw, WifiOff, LayoutGrid, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const RealtimeRoomMonitor = () => {
    const [realtimeData, setRealtimeData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    
    // All No-Shows state
    const [allNoShows, setAllNoShows] = useState([]);
    const [isNoShowsLoading, setIsNoShowsLoading] = useState(false);
    const [noShowPage, setNoShowPage] = useState(1);
    const [noShowTotalPages, setNoShowTotalPages] = useState(1);
    const [noShowHasMore, setNoShowHasMore] = useState(false);
    const [noShowTableError, setNoShowTableError] = useState(null);
    const noShowPageRef = useRef(1);
    const [NO_SHOW_LIMIT, setNoShowLimit] = useState(10);
    const [noShowTotal, setNoShowTotal] = useState(undefined);

    // Modal state for No-Show handling
    const [selectedNoShow, setSelectedNoShow] = useState(null);
    const [noShowDetail, setNoShowDetail] = useState(null);
    const [noShowError, setNoShowError] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Confirmation modal state (replaces window.confirm)
    const [confirmAction, setConfirmAction] = useState(null); // { type: 'release' | 'ignore', caseId }
    const [releaseReason, setReleaseReason] = useState('');

    const fetchRealtimeStatus = useCallback(async () => {
        try {
            const res = await getRoomRealtimeStatus();
            if (res?.success) {
                setRealtimeData(res.data || []);
                setError(null);
            }
        } catch (err) {
            setError('Lỗi kết nối khi lấy dữ liệu thời gian thực.');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchAllNoShows = useCallback(async (page) => {
        const targetPage = page ?? noShowPageRef.current;
        setIsNoShowsLoading(true);
        setNoShowTableError(null);
        try {
            const res = await getAllNoShowCases({ limit: NO_SHOW_LIMIT, page: targetPage });
            if (res?.success) {
                // BE có thể trả: array thẳng | { items, meta } | { data, meta } | { data, pagination }
                const items = Array.isArray(res.data)
                    ? res.data
                    : (res.data?.items ?? res.data?.data ?? []);
                setAllNoShows(items);

                // Tính hasMore và totalPages từ meta (nhiều field name khác nhau)
                const pag = res.data?.meta ?? res.data?.pagination ?? res.meta ?? {};
                const total = pag.total ?? pag.totalItems ?? pag.totalCount;
                setNoShowTotal(total == null || !Number.isFinite(Number(total)) ? undefined : Number(total));
                const tp = pag.totalPages ?? pag.total_pages
                    ?? (total > 0 ? Math.ceil(total / NO_SHOW_LIMIT) : 0);
                setNoShowTotalPages(tp > 0 ? tp : 1);
                // Fallback: nếu không có meta, dùng heuristic — nếu trả đủ limit thì còn trang sau
                setNoShowHasMore(
                    tp > 0 ? tp > targetPage : items.length >= NO_SHOW_LIMIT
                );
            } else {
                setNoShowTableError(res?.message || 'Không thể tải danh sách vi phạm.');
            }
        } catch (err) {
            console.error(err);
            setNoShowTableError('Lỗi kết nối khi tải danh sách vi phạm.');
        } finally {
            setIsNoShowsLoading(false);
        }
    }, [NO_SHOW_LIMIT]);

    const changeNoShowPage = useCallback((newPage) => {
        noShowPageRef.current = newPage;
        setNoShowPage(newPage);
        fetchAllNoShows(newPage);
    }, [fetchAllNoShows]);

    // Initial load and polling every 10 seconds
    useEffect(() => {
        fetchRealtimeStatus();
        fetchAllNoShows();
        const interval = setInterval(() => {
            fetchRealtimeStatus();
            fetchAllNoShows();
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchRealtimeStatus, fetchAllNoShows]);

    // Auto-hide success message
    useEffect(() => {
        if (successMsg) {
            const timer = setTimeout(() => setSuccessMsg(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMsg]);

    const handleOpenNoShow = async (room) => {
        setSelectedNoShow(room);
        setIsProcessing(true);
        setNoShowError(null);
        setNoShowDetail(null);
        setReleaseReason('');
        try {
            // truyền noShowStatus (= detectionStatus enum thật) để filter đúng — bỏ &status=DETECTED cũ
            const res = await getNoShowByRoom(room.roomId, room.noShowStatus);
            if (res?.success && res.data?.length > 0) {
                // Lấy case mới nhất — dùng field `id` làm caseId
                const latestCase = res.data[0];
                setNoShowDetail({
                    caseId: latestCase.id,
                    roomId: latestCase.roomId,
                    roomName: latestCase.roomName,
                    meetingId: latestCase.meetingId,
                    status: latestCase.status,
                    detectedAt: latestCase.detectedAt,
                    warningSentAt: latestCase.warningSentAt,
                    releasedAt: latestCase.releasedAt
                });
            } else if (res?.success && (!res.data || res.data.length === 0)) {
                setNoShowError('Không tìm thấy vi phạm No-show nào cho phòng này.');
            } else {
                setNoShowError('Không thể tải thông tin No-show.');
            }
        } catch {
            setNoShowError('Lỗi kết nối khi tải thông tin vi phạm No-show. Vui lòng thử lại.');
        } finally {
            setIsProcessing(false);
        }
    };

    const onReleaseRoom = async () => {
        if (!noShowDetail?.caseId) return;
        setIsProcessing(true);
        try {
            const res = await releaseNoShowRoom(noShowDetail.caseId, releaseReason.trim() || 'Giải phóng thủ công bởi quản trị viên');
            if (res?.success) {
                setSuccessMsg(`Đã giải phóng phòng ${selectedNoShow?.roomName || ''} thành công.`);
                setSelectedNoShow(null);
                setNoShowDetail(null);
                setConfirmAction(null);
                fetchRealtimeStatus();
                noShowPageRef.current = 1; setNoShowPage(1);
                fetchAllNoShows(1);
            } else {
                throw new Error(res?.message || 'Không thể giải phóng phòng.');
            }
        } catch (err) {
            setNoShowError(err?.message || 'Không thể giải phóng phòng. Vui lòng thử lại.');
            setConfirmAction(null);
        } finally {
            setIsProcessing(false);
        }
    };

    const onIgnoreNoShow = async () => {
        if (!noShowDetail?.caseId) return;
        setIsProcessing(true);
        try {
            const res = await handleNoShowCase(noShowDetail.caseId, { detectionStatus: 'dismissed', note: 'Bỏ qua bởi quản trị viên' });
            if (res?.success) {
                setSuccessMsg('Đã bỏ qua cảnh báo No-show thành công.');
                setSelectedNoShow(null);
                setNoShowDetail(null);
                setConfirmAction(null);
                fetchRealtimeStatus();
                noShowPageRef.current = 1; setNoShowPage(1);
                fetchAllNoShows(1);
            } else {
                throw new Error(res?.message || 'Không thể bỏ qua cảnh báo.');
            }
        } catch (err) {
            setNoShowError(err?.message || 'Không thể bỏ qua cảnh báo. Vui lòng thử lại.');
            setConfirmAction(null);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmExecute = () => {
        if (confirmAction?.type === 'release') {
            onReleaseRoom();
        } else if (confirmAction?.type === 'ignore') {
            onIgnoreNoShow();
        }
    };

    // ──────────────────────────── LOADING STATE ────────────────────────────
    if (loading && realtimeData.length === 0) {
        return (
            <div className="space-y-6">
                {/* Skeleton header */}
                <div className="flex items-center justify-between bg-cloud-mist/50 p-4 rounded-xl border border-platinum-tint animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-slate-300" />
                        <div className="h-4 w-40 bg-slate-200 rounded" />
                    </div>
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                </div>
                {/* Skeleton grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="p-5 rounded-2xl border border-platinum-tint bg-white shadow-sm-1 animate-pulse">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-2 flex-1">
                                    <div className="h-5 w-32 bg-slate-200 rounded" />
                                    <div className="h-3 w-20 bg-slate-100 rounded" />
                                </div>
                                <div className="w-12 h-12 bg-slate-100 rounded-xl" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header bar */}
            <div className="flex items-center justify-between bg-cloud-mist/50 p-4 rounded-xl border border-platinum-tint">
                <div className="flex items-center gap-3">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </div>
                    <span className="text-sm font-bold text-midnight-indigo">Camera & IVSS Live Sync</span>
                </div>
                <button 
                    onClick={fetchRealtimeStatus}
                    className="text-xs font-semibold text-action-blue hover:text-glacier-blue transition-colors flex items-center gap-1"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Cập nhật ngay
                </button>
            </div>

            {/* Success message */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl flex items-center gap-2"
                    >
                        <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error state */}
            {error && (
                <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center gap-3 text-center">
                    <WifiOff className="w-8 h-8 text-red-400" />
                    <p className="text-red-700 text-sm font-semibold">{error}</p>
                    <button
                        onClick={fetchRealtimeStatus}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                    </button>
                </div>
            )}

            {/* Room grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {realtimeData.map((room) => (
                    <motion.div 
                        key={room.roomId}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-5 rounded-2xl border shadow-sm-1 transition-all ${
                            room.noShowStatus && ['risk', 'warning_sent', 'confirmed'].includes(room.noShowStatus) ? 'bg-red-50/50 border-red-200' :
                            room.noShowStatus === 'snoozed' ? 'bg-sky-50/50 border-sky-200' :
                            room.currentStatus === 'occupied' ? 'bg-blue-50/50 border-blue-200' :
                            'bg-white border-platinum-tint'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-lg">{room.roomName}</h3>
                                <div className="flex items-center gap-1 mt-1 text-xs font-semibold">
                                    {room.noShowStatus && ['risk', 'warning_sent', 'confirmed'].includes(room.noShowStatus) ? (
                                        <span className="text-red-600 flex items-center gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5"/> Cảnh báo No-show ({
                                                room.noShowStatus === 'risk' ? 'Rủi ro' :
                                                room.noShowStatus === 'warning_sent' ? 'Đã gửi cảnh báo' :
                                                'Đã xác nhận'
                                            })
                                        </span>
                                    ) : room.noShowStatus === 'snoozed' ? (
                                        <span className="text-sky-600 flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5"/> Đã gia hạn{room.noShowSnoozeUntil ? ` — chờ tới ${new Date(room.noShowSnoozeUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                        </span>
                                    ) : (
                                        <>
                                            {room.currentStatus === 'available' && <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5"/> Sẵn sàng</span>}
                                            {room.currentStatus === 'occupied' && <span className="text-action-blue flex items-center gap-1"><Video className="w-3.5 h-3.5"/> Đang sử dụng</span>}
                                            {room.currentStatus === 'reserved' && <span className="text-amber-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Được đặt trước</span>}
                                            {room.currentStatus === 'maintenance' && <span className="text-gray-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/> Bảo trì</span>}
                                            {room.currentStatus === 'inactive' && <span className="text-gray-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/> Không hoạt động</span>}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white p-2 rounded-xl shadow-sm border border-platinum-tint/50 flex flex-col items-center justify-center min-w-[50px]">
                                <Users className="w-4 h-4 text-slate-blue mb-0.5" />
                                <span className="text-sm font-extrabold text-midnight-indigo">{room.occupancyCount ?? 0}</span>
                            </div>
                        </div>

                        {room.noShowStatus && ['risk', 'warning_sent', 'confirmed'].includes(room.noShowStatus) && (
                            <button
                                onClick={() => handleOpenNoShow({ roomId: room.roomId, roomName: room.roomName, noShowStatus: room.noShowStatus })}
                                className="w-full mt-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Eye className="w-4 h-4" />
                                Kiểm tra vi phạm No-show
                            </button>
                        )}
                        {room.noShowStatus === 'snoozed' && (
                            <button
                                onClick={() => handleOpenNoShow({ roomId: room.roomId, roomName: room.roomName, noShowStatus: room.noShowStatus })}
                                className="w-full mt-2 py-2 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Eye className="w-4 h-4" />
                                Xem chi tiết gia hạn
                            </button>
                        )}
                    </motion.div>
                ))}

                {/* Empty state */}
                {realtimeData.length === 0 && !loading && !error && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-platinum-tint rounded-2xl bg-white">
                        <LayoutGrid className="w-10 h-10 text-platinum-tint mx-auto mb-3" />
                        <h3 className="text-sm font-bold text-midnight-indigo">Không có dữ liệu phòng</h3>
                        <p className="text-xs text-slate-blue mt-1 max-w-sm mx-auto">Hệ thống chưa ghi nhận trạng thái phòng nào. Vui lòng kiểm tra kết nối camera.</p>
                        <button
                            onClick={fetchRealtimeStatus}
                            className="mt-4 px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue transition-colors"
                        >
                            Tải lại dữ liệu
                        </button>
                    </div>
                )}
            </div>

            {/* Tổng hợp danh sách No-show */}
            <div className="mt-8 bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                <div className="p-4 border-b border-outline-gray bg-cloud-mist/30 flex justify-between items-center">
                    <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        Danh sách vi phạm No-show gần đây
                    </h3>
                    <button onClick={() => changeNoShowPage(noShowPage)} className="text-xs font-semibold text-action-blue hover:text-glacier-blue transition-colors flex items-center gap-1">
                        <RefreshCw className={`w-3.5 h-3.5 ${isNoShowsLoading ? 'animate-spin' : ''}`} />
                        Làm mới
                    </button>
                </div>

                {/* Table error */}
                {noShowTableError && (
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-red-700 text-xs flex items-center gap-2">
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                        {noShowTableError}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full text-left text-sm">
<TableColumns widths={[18, 26, 18, 14, 10, 14]} />
                        <thead className="bg-cloud-mist/50 text-slate-blue text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">Mã Case</th>
                                <th className="px-4 py-3 font-semibold">Phòng</th>
                                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">Ngày</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">Giờ</th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-gray">
                            {allNoShows.length === 0 && !isNoShowsLoading && !noShowTableError && (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-slate-blue italic">Không có dữ liệu vi phạm.</td>
                                </tr>
                            )}
                            {isNoShowsLoading && allNoShows.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-4 py-6 text-center">
                                        <div className="flex items-center justify-center gap-2 text-slate-blue text-xs">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {allNoShows.map(caseItem => {
                                const dt = caseItem.detectedAt ? new Date(caseItem.detectedAt) : null;
                                return (
                                    <tr key={caseItem.id} className="hover:bg-cloud-mist/20 transition-colors">
                                        <td className="px-4 py-3 font-mono text-[10px] text-slate-blue max-w-[200px]" title={caseItem.id}>
                                            {caseItem.id}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-midnight-indigo whitespace-nowrap">{caseItem.roomName || caseItem.roomId}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase whitespace-nowrap ${
                                                caseItem.status === 'risk' ? 'bg-red-100 text-red-700' :
                                                caseItem.status === 'confirmed' ? 'bg-orange-100 text-orange-700' :
                                                caseItem.status === 'warning_sent' ? 'bg-yellow-100 text-yellow-700' :
                                                caseItem.status === 'released' ? 'bg-green-100 text-green-700' :
                                                caseItem.status === 'dismissed' ? 'bg-slate-200 text-slate-700' :
                                                caseItem.status === 'snoozed' ? 'bg-sky-100 text-sky-700' :
                                                caseItem.status === 'resolved' ? 'bg-teal-100 text-teal-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {caseItem.status === 'risk' ? 'Có rủi ro' :
                                                 caseItem.status === 'confirmed' ? 'Đã xác nhận' :
                                                 caseItem.status === 'warning_sent' ? 'Đã gửi cảnh báo' :
                                                 caseItem.status === 'released' ? 'Đã giải phóng' :
                                                 caseItem.status === 'dismissed' ? 'Đã bỏ qua' :
                                                 caseItem.status === 'snoozed' ? 'Đã gia hạn' :
                                                 caseItem.status === 'resolved' ? 'Đã giải quyết' :
                                                 caseItem.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                                            {dt ? dt.toLocaleDateString('vi-VN') : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                                            {dt ? dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleOpenNoShow({ roomId: caseItem.roomId, roomName: caseItem.roomName, noShowStatus: caseItem.status })}
                                                className="px-3 py-1 bg-white border border-platinum-tint hover:bg-cloud-mist rounded-lg text-xs font-semibold text-action-blue transition-colors"
                                            >
                                                Chi tiết
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </ResponsiveTable>
                </div>

                {/* Phân trang danh sách vi phạm */}
                <PaginationFooter currentPage={noShowPage} totalPages={Number.isFinite(noShowTotal) ? noShowTotalPages : undefined} totalItems={noShowTotal} pageSize={NO_SHOW_LIMIT} itemLabel="trường hợp" onPageChange={changeNoShowPage} onPageSizeChange={size => { setNoShowLimit(size); noShowPageRef.current = 1; setNoShowPage(1); }} loading={isNoShowsLoading} hasNextPage={noShowHasMore} visibleCount={allNoShows.length} />

            </div>

            {/* ─────────── No-Show Detail Modal ─────────── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {selectedNoShow && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/50 backdrop-blur-md">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl w-full max-w-md border border-platinum-tint shadow-2xl overflow-hidden"
                        >
                            <div className="bg-red-50 p-6 text-center border-b border-red-100">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h2 className="text-lg font-bold text-red-900">Xử lý vi phạm No-show</h2>
                                <p className="text-xs text-red-600/80 mt-1">Phòng {selectedNoShow.roomName}</p>
                            </div>
                            
                            <div className="p-6 space-y-4">
                                {isProcessing && !noShowDetail && !noShowError ? (
                                    /* Loading skeleton for detail */
                                    <div className="space-y-3 animate-pulse">
                                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                                        <div className="h-4 bg-slate-200 rounded w-1/2" />
                                        <div className="h-4 bg-slate-200 rounded w-2/3" />
                                        <div className="h-4 bg-slate-200 rounded w-1/3" />
                                    </div>
                                ) : noShowError ? (
                                    /* Error state */
                                    <div className="text-center space-y-3">
                                        <XCircle className="w-8 h-8 text-red-400 mx-auto" />
                                        <p className="text-sm text-red-600 font-medium">{noShowError}</p>
                                        <button
                                            onClick={() => handleOpenNoShow(selectedNoShow)}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors"
                                        >
                                            Thử lại
                                        </button>
                                    </div>
                                ) : noShowDetail ? (
                                    <>
                                        <div className="space-y-2 text-sm text-slate-blue bg-cloud-mist/30 p-4 rounded-xl border border-platinum-tint/50">
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-midnight-indigo">Mã Case:</span>
                                                <span className="font-mono text-xs">{noShowDetail.caseId?.substring(0, 8)}...</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-midnight-indigo">Phòng:</span>
                                                <span>{noShowDetail.roomName || selectedNoShow.roomName}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-midnight-indigo">Trạng thái:</span>
                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold text-xs">
                                                    {noShowDetail.status === 'risk' ? 'Có rủi ro' :
                                                     noShowDetail.status === 'confirmed' ? 'Đã xác nhận' :
                                                     noShowDetail.status === 'warning_sent' ? 'Đã gửi cảnh báo' :
                                                     noShowDetail.status === 'released' ? 'Đã giải phóng' :
                                                     noShowDetail.status === 'dismissed' ? 'Đã bỏ qua' :
                                                     noShowDetail.status === 'snoozed' ? 'Đã gia hạn' :
                                                     noShowDetail.status === 'resolved' ? 'Đã giải quyết' :
                                                     noShowDetail.status}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-midnight-indigo">Phát hiện lúc:</span>
                                                <span>{noShowDetail.detectedAt ? new Date(noShowDetail.detectedAt).toLocaleString('vi-VN') : '—'}</span>
                                            </div>
                                            {noShowDetail.warningSentAt && (
                                                <div className="flex justify-between items-center pt-2 mt-2 border-t border-platinum-tint/50">
                                                    <span className="font-semibold text-midnight-indigo">Đã gửi cảnh báo lúc:</span>
                                                    <span className="text-xs">{new Date(noShowDetail.warningSentAt).toLocaleTimeString('vi-VN')}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-blue text-center bg-blue-50/50 p-3 rounded-lg text-action-blue border border-blue-100">
                                            Camera không phát hiện có người trong phòng quá thời gian quy định. Bạn có thể giải phóng phòng để người khác sử dụng hoặc bỏ qua.
                                        </div>
                                    </>
                                ) : null}
                            </div>

                            <div className="p-4 border-t border-platinum-tint bg-cloud-mist/20 flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => { setSelectedNoShow(null); setNoShowDetail(null); setNoShowError(null); }}
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist disabled:opacity-50"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={() => setConfirmAction({ type: 'ignore', caseId: noShowDetail?.caseId })}
                                    disabled={isProcessing || !noShowDetail || ['resolved', 'dismissed', 'released'].includes(noShowDetail.status)}
                                    className="flex-1 px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-midnight-indigo bg-white hover:bg-cloud-mist disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    <XCircle className="w-4 h-4" /> Bỏ qua
                                </button>
                                <button
                                    onClick={() => setConfirmAction({ type: 'release', caseId: noShowDetail?.caseId })}
                                    disabled={isProcessing || !noShowDetail || ['resolved', 'dismissed', 'released'].includes(noShowDetail.status)}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    <Unlock className="w-4 h-4" /> Giải phóng
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )}

            {/* ─────────── Confirmation Modal (replaces window.confirm) ─────────── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {confirmAction && (
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-midnight-indigo/50 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-2xl w-full max-w-sm border border-platinum-tint shadow-2xl p-6 text-center"
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                                    confirmAction.type === 'release' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                                }`}>
                                    {confirmAction.type === 'release' ? <Unlock className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                                </div>
                                <h3 className="font-bold text-midnight-indigo text-base mb-2">
                                    {confirmAction.type === 'release' ? 'Xác nhận giải phóng phòng?' : 'Xác nhận bỏ qua cảnh báo?'}
                                </h3>
                                <p className="text-xs text-slate-blue mb-4">
                                    {confirmAction.type === 'release'
                                        ? 'Phòng sẽ được đánh dấu trống và có thể được đặt lại bởi người khác.'
                                        : 'Cảnh báo No-show sẽ bị đánh dấu bỏ qua, không ảnh hưởng đến cuộc họp hiện tại.'}
                                </p>
                                {confirmAction.type === 'release' && (
                                    <div className="mb-4 text-left">
                                        <label className="block text-xs font-bold text-slate-blue mb-1">
                                            Lý do giải phóng <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            rows={2}
                                            maxLength={500}
                                            placeholder="Nhập lý do giải phóng phòng..."
                                            value={releaseReason}
                                            onChange={(e) => setReleaseReason(e.target.value)}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs text-midnight-indigo resize-none focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/10"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-0.5 text-right">{releaseReason.length}/500</p>
                                    </div>
                                )}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setConfirmAction(null); setReleaseReason(''); }}
                                        disabled={isProcessing}
                                        className="flex-1 px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist disabled:opacity-50"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleConfirmExecute}
                                        disabled={isProcessing}
                                        className={`flex-1 px-4 py-2 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                                            confirmAction.type === 'release' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                                        }`}
                                    >
                                        {isProcessing ? (
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        ) : (
                                            'Xác nhận'
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default RealtimeRoomMonitor;
