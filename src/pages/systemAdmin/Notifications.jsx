import { AlertTriangle, Bell, Calendar, CheckCircle, CheckSquare, Clock, Eye, EyeOff, Info, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead
} from '../../service/sysAdminServices';
import NoShowInlineAction from '../../components/common/NoShowInlineAction';


// Render notification body as HTML (BE intentionally sends <b>, <br/> markup).
// Strips any <script> tags as a basic safeguard.
const sanitizeBody = (html) => {
    if (!html) return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\s*\(visitor_[a-z0-9_]+\)/gi, '');
};

const NOTIFICATION_PRIORITY_META = {
    critical: { label: 'Nghiêm trọng', className: 'bg-red-50 text-red-700 border-red-200', dotClassName: 'bg-red-500' },
    urgent: { label: 'Cao', className: 'bg-red-50 text-red-700 border-red-200', dotClassName: 'bg-red-500' },
    high: { label: 'Cao', className: 'bg-red-50 text-red-700 border-red-200', dotClassName: 'bg-red-500' },
    warning: { label: 'Trung bình', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' },
    medium: { label: 'Trung bình', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' },
    low: { label: 'Thấp', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' },
    info: { label: 'Thấp', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' }
};

const getNotificationPriority = (notification) => {
    const priority = String(notification?.priority || '').toLowerCase();
    if (NOTIFICATION_PRIORITY_META[priority]) return NOTIFICATION_PRIORITY_META[priority];

    const body = String(notification?.body || '');
    if (/mức\s+(nghiêm trọng|cao)/i.test(body)) return NOTIFICATION_PRIORITY_META.high;
    if (/mức\s+trung bình/i.test(body)) return NOTIFICATION_PRIORITY_META.medium;
    if (/mức\s+thấp/i.test(body)) return NOTIFICATION_PRIORITY_META.low;
    return null;
};

const removePriorityText = (html) => html
    .replace(/\s*[-–—·]?\s*mức\s+(nghiêm trọng|cao|trung bình|thấp)\.?/gi, '');

const Notifications = () => {
    const [notificationsList, setNotificationsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters & Pagination
    const [filterType, setFilterType] = useState(''); // '', 'unread', 'read'
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const fetchNotificationsList = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit
            };
            const res = await getNotifications(params);
            if (res?.success) {
                // Map BE data to FE expected properties
                const mappedData = (res.data || []).map(item => ({
                    ...item,
                    title: item.subject,
                    body: item.content,
                    type: item.notificationType,
                    read: !!item.isRead // BE NotificationListItemDto.isRead (notification-list-item.dto.ts)
                }));
                setNotificationsList(mappedData);
                setTotalPages(res.meta?.totalPages || 1);
                setTotalItems(res.meta?.total || (mappedData.length || 0));
            } else {
                throw new Error();
            }
        } catch {
            setNotificationsList([]);
            setTotalPages(1);
            setTotalItems(0);
        } finally {
            setLoading(false);
        }
    }, [page, limit, filterType]);

    useEffect(() => {
        fetchNotificationsList();
    }, [fetchNotificationsList]);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    // Mark single notification as read — PATCH /notifications/:id/read (notifications.controller.ts:179)
    const handleMarkAsRead = async (noti) => {
        try {
            const res = await markNotificationRead(noti.id);
            if (res?.success !== false) {
                setNotificationsList(prev => prev.map(n => n.id === noti.id ? { ...n, read: true } : n));
                setSuccessMessage(`Đã đánh dấu đọc thông báo: ${noti.title}`);
            }
        } catch {
            // BE chưa trả về (vd môi trường mock) — vẫn cập nhật UI để không chặn thao tác
            setNotificationsList(prev => prev.map(n => n.id === noti.id ? { ...n, read: true } : n));
        }
    };

    // Mark all notifications as read — PATCH /notifications/read-all (notifications.controller.ts:171)
    const handleMarkAllAsRead = async () => {
        try {
            const res = await markAllNotificationsRead();
            if (res?.success !== false) {
                setNotificationsList(prev => prev.map(n => ({ ...n, read: true })));
                setSuccessMessage('Đã đánh dấu đọc toàn bộ thông báo.');
            }
        } catch {
            setNotificationsList(prev => prev.map(n => ({ ...n, read: true })));
        }
    };

    // [FIX] Key cũ (APPROVAL_REQUEST/NO_SHOW_ALERT/DEVICE_FAULT/SECURITY_ALERT) là
    // SCREAMING_CASE — enum thật của BE (NotificationType, notification.entity.ts) toàn bộ
    // là snake_case, không khớp key nào → icon/màu luôn rơi vào default. Đổi sang đúng giá
    // trị thật, gom nhóm theo ý nghĩa gần nhất với 4 nhóm UI cũ (chờ duyệt / cảnh báo thiết
    // bị-vắng mặt / cảnh báo an ninh):
    const getIcon = (type) => {
        switch (type) {
            case 'meeting_request_created':
                return <Clock className="w-5 h-5 text-action-blue" />;
            case 'no_show_alert':
            case 'equipment_fault_reported':
            case 'equipment_fault_confirmed':
                return <AlertTriangle className="w-5 h-5 text-sunset-gold" />;
            case 'unknown_face_alert':
            case 'vehicle_control_list_match':
            case 'unknown_vehicle_alert':
            case 'vehicle_unauthorized_alert':
            case 'person_watchlist_match':
                return <Info className="w-5 h-5 text-red-600" />;
            default:
                return <Bell className="w-5 h-5 text-slate-blue" />;
        }
    };

    const getBgColor = (type, read) => {
        if (read) return 'bg-white border-platinum-tint';
        switch (type) {
            case 'meeting_request_created':
                return 'bg-blue-50/40 border-blue-150';
            case 'no_show_alert':
            case 'equipment_fault_reported':
            case 'equipment_fault_confirmed':
                return 'bg-yellow-50/40 border-yellow-150';
            case 'unknown_face_alert':
            case 'vehicle_control_list_match':
            case 'unknown_vehicle_alert':
            case 'vehicle_unauthorized_alert':
            case 'person_watchlist_match':
                return 'bg-red-50/40 border-red-150';
            default:
                return 'bg-cloud-mist/40 border-outline-gray';
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        const d = new Date(isoString);
        return d.toLocaleDateString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Bell className="w-3.5 h-3.5" />
                        Trung tâm thông báo
                    </span>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Thông báo hệ thống</h1>
                    <p className="text-slate-blue text-sm">Xem lịch sử thông báo, cập nhật trạng thái lịch họp, cảnh báo phòng họp và tình trạng thiết bị.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleMarkAllAsRead}
                        className="inline-flex items-center justify-center px-4 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-bold shadow-sm transition-all duration-200"
                    >
                        <CheckSquare className="w-4 h-4 mr-2 text-green-600" />
                        Đọc tất cả
                    </button>
                    <button
                        onClick={fetchNotificationsList}
                        className="p-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl hover:bg-cloud-mist transition-colors duration-200"
                        title="Tải lại thông báo"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Alert Message */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2"
                    >
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-semibold">{successMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Filter buttons */}
            <div className="flex gap-2 border-b border-platinum-tint pb-2">
                {[
                    { key: '', label: 'Tất cả thông báo' },
                    { key: 'unread', label: 'Chưa đọc' },
                    { key: 'read', label: 'Đã đọc' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setFilterType(tab.key); setPage(1); }}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                            filterType === tab.key 
                                ? 'bg-action-blue text-white shadow-sm' 
                                : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-platinum-tint min-h-[200px]">
                        <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-blue text-xs font-semibold mt-3">Đang tải danh sách thông báo...</p>
                    </div>
                ) : notificationsList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-platinum-tint text-center min-h-[200px]">
                        <Bell className="w-10 h-10 text-platinum-tint mb-2" />
                        <h3 className="text-sm font-bold text-midnight-indigo">Hộp thư thông báo trống</h3>
                        <p className="text-slate-blue text-xs mt-0.5">Không tìm thấy thông báo nào khớp với trạng thái chọn.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notificationsList.map(noti => (
                            <motion.div
                                layout
                                key={noti.id}
                                className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all duration-200 ${getBgColor(noti.type, noti.read)}`}
                            >
                                {(() => {
                                    const priorityMeta = getNotificationPriority(noti);
                                    return (
                                <div className="flex items-start gap-3 flex-1">
                                    <div className="mt-0.5 p-2 bg-white rounded-lg shadow-sm border border-platinum-tint/50">
                                        {getIcon(noti.type)}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className={`text-sm font-bold text-midnight-indigo ${!noti.read ? 'font-extrabold' : ''}`}>{noti.title}</h4>
                                            {!noti.read && (
                                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                            )}
                                        </div>
                                        <p
                                            className="text-xs text-slate-blue leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: removePriorityText(sanitizeBody(noti.body)) }}
                                        />
                                        {priorityMeta && (
                                            <span className={`inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full border text-[10px] font-bold ${priorityMeta.className}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${priorityMeta.dotClassName}`} />
                                                Mức độ: {priorityMeta.label}
                                            </span>
                                        )}
                                        {/* [Fix 2026-08-21, Bug 2] Cùng component NoShowInlineAction với
                                            NotificationBell.jsx — trước fix, trang đầy đủ này KHÔNG có bất kỳ
                                            xử lý riêng nào cho notificationType='no_show_alert', chỉ hiện text thô. */}
                                        <NoShowInlineAction item={noti} />
                                        {noti.payloadJson?.conflictDetails?.length > 0 && (
                                            <div className="bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2 text-[11px] text-rose-800 space-y-1 mt-1">
                                                <p className="font-semibold">Xung đột với:</p>
                                                {noti.payloadJson.conflictDetails.map((c, idx) => (
                                                    <p key={c.bookingId || idx}>
                                                        {c.meetingTitle || 'Cuộc họp khác'} — {c.roomName || ''}
                                                        {' · '}{new Date(c.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}-{new Date(c.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                        {c.hostName ? ` · Chủ trì: ${c.hostName}` : ''}
                                                    </p>
                                                ))}
                                                {noti.payloadJson?.suggestedAlternatives?.length > 0 && (
                                                    <p className="pt-1 text-rose-700">
                                                        Phòng còn trống gợi ý: {noti.payloadJson.suggestedAlternatives.map(r => r.roomName).join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 text-[10px] text-steel-gray pt-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>{formatDate(noti.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>
                                    );
                                })()}

                                <div className="flex-shrink-0">
                                    {!noti.read ? (
                                        <button
                                            onClick={() => handleMarkAsRead(noti)}
                                            className="p-1.5 hover:bg-white border border-transparent hover:border-platinum-tint rounded-lg text-slate-blue hover:text-green-700 transition-colors"
                                            title="Đánh dấu đã đọc"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <span className="p-1.5 text-steel-gray/60 block" title="Đã đọc">
                                            <EyeOff className="w-4 h-4" />
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        ))}

                        {/* Pagination footer */}
                        <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-1 flex items-center justify-between">
                            <span className="text-xs text-slate-blue">
                                Hiển thị {notificationsList.length} trên tổng số {totalItems} thông báo
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                                >
                                    Trước
                                </button>
                                <span className="px-3 py-1.5 text-xs font-bold text-midnight-indigo">
                                    Trang {page} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                    disabled={page === totalPages}
                                    className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                                >
                                    Sau
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;
