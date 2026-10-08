import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ShieldAlert, BellRing } from 'lucide-react';
import { getNotifications } from '../../service/sysAdminServices';
import { getSecurityAlerts } from '../../service/securityAlertService';
import NoShowInlineAction from './NoShowInlineAction';

import { subscribeToNotificationUpdates } from '../../utils/socket';
import { emitNotificationBanner } from '../../utils/notificationBanner';
import { getAlertTypeLabel } from '../../constants/alertType';

const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
};

const SEVERITY_DOT = {
    critical: 'bg-red-600',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500',
};

/**
 * Gộp GET /notifications + GET /security-alerts (status=new) ở phía client — BE dứt khoát
 * không xây "unified notification feed" (xem Plan.md mục 2.B), nên FE tự gộp 2 API sẵn có.
 * Badge số đếm CHỈ tính security alerts mới, vì /notifications chưa có field is-read thật từ BE
 * (xem src/pages/systemAdmin/Notifications.jsx — read luôn hardcode false phía client).
 */
const NotificationBell = ({
    basePath,
    dark = false,
    dropdownAlign = 'right',
    dropUp = false,
    isOpen: isOpenControlled,
    onIsOpenChange,
}) => {
    const navigate = useNavigate();
    const isControlled = isOpenControlled !== undefined;
    const [isOpenInternal, setIsOpenInternal] = useState(false);
    const isOpen = isControlled ? isOpenControlled : isOpenInternal;

    const setIsOpen = useCallback((value) => {
        const newValue = typeof value === 'function' ? value(isOpen) : value;
        if (isControlled) {
            onIsOpenChange?.(newValue);
        } else {
            setIsOpenInternal(newValue);
        }
    }, [isControlled, isOpen, onIsOpenChange]);

    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [feedItems, setFeedItems] = useState([]);
    const containerRef = useRef(null);

    // EMPLOYEE không có permission security_alert.read (đúng thiết kế BE, xem Plan.md mục 1)
    // — gọi /security-alerts ở role này chỉ gây 403 vô ích, nên bỏ qua hẳn lời gọi.
    const canReadSecurityAlerts = !['/employee', '/teacher', '/student', '/guard'].includes(basePath);

    const fetchFeed = useCallback(async () => {
        setLoading(true);
        try {
            const [notiRes, alertsRes] = await Promise.allSettled([
                getNotifications({ page: 1, limit: 5 }),
                canReadSecurityAlerts
                    ? getSecurityAlerts({ status: 'new', limit: 5 })
                    : Promise.resolve(null),
            ]);

            const notiItems = (notiRes.status === 'fulfilled' && notiRes.value?.success)
                ? (notiRes.value.data || []).map((item) => ({
                    id: `noti-${item.id}`,
                    source: 'notification',
                    notificationType: item.notificationType,
                    title: item.subject,
                    body: item.content,
                    timestamp: item.createdAt,
                    // [Nhóm E] payloadJson.conflictDetails/suggestedAlternatives — chỉ
                    // dùng cho notificationType = meeting_request_rejected khi có xung
                    // đột phòng, xem render phía dưới.
                    payloadJson: item.payloadJson ?? null,
                    // [Fix 2026-08-21, Bug 1/2] Trạng thái SỐNG của no_show_cases (BE tra
                    // lại mỗi lần fetch — notification-list-item.dto.ts) — dùng để quyết
                    // định hiện/ẩn nút "Tôi vẫn đến" trong NoShowInlineAction, KHÔNG dùng
                    // payloadJson.kind tĩnh nữa (bug cũ: reload trang lại hiện nút dù đã bấm).
                    noShowLiveStatus: item.noShowLiveStatus ?? null,
                    noShowSnoozeUntil: item.noShowSnoozeUntil ?? null,
                }))
                : [];

            const alertItems = (alertsRes.status === 'fulfilled' && alertsRes.value?.success)
                ? (alertsRes.value.data || []).map((item) => ({
                    id: `alert-${item.id}`,
                    source: 'alert',
                    title: getAlertTypeLabel(item.alert_type),
                    body: item.zone_name || 'Không xác định khu vực',
                    timestamp: item.created_at,
                    severity: item.severity,
                }))
                : [];

            const alertsTotal = (alertsRes.status === 'fulfilled' && alertsRes.value?.success)
                ? (alertsRes.value.meta?.total ?? alertItems.length)
                : 0;

            const merged = [...notiItems, ...alertItems].sort(
                (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
            );

            // Filter unread notifications using localStorage
            const readIds = (() => {
                try {
                    return JSON.parse(localStorage.getItem('readNotificationIds') || '[]');
                } catch {
                    return [];
                }
            })();
            const unreadNotisCount = notiItems.filter(item => !readIds.includes(item.id)).length;

            setFeedItems(merged);
            setUnreadCount(alertsTotal + unreadNotisCount);
        } catch {
            setFeedItems([]);
        } finally {
            setLoading(false);
        }
    }, [canReadSecurityAlerts]);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    // Realtime: BE đẩy 'notification.created' qua WS (NotificationsService.createNotification)
    // ngay khi tạo notification mới cho user hiện tại — cập nhật badge + feed tại chỗ,
    // không cần load lại trang, cộng thêm banner góc màn hình (NotificationBanner ở App.js).
    useEffect(() => {
        const unsubscribe = subscribeToNotificationUpdates((item) => {
            const feedItem = {
                id: `noti-${item.id}`,
                source: 'notification',
                title: item.subject,
                body: item.content,
                timestamp: item.createdAt,
                payloadJson: item.payloadJson ?? null,
            };
            setFeedItems((prev) => (
                prev.some((it) => it.id === feedItem.id) ? prev : [feedItem, ...prev].slice(0, 8)
            ));
            setUnreadCount((prev) => prev + 1);
            emitNotificationBanner({
                id: feedItem.id,
                title: item.subject,
                body: stripHtml(item.content),
                basePath,
            });
        });
        return unsubscribe;
    }, [basePath]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const nextOpen = !isOpen;
        if (nextOpen) {
            try {
                const readIds = JSON.parse(localStorage.getItem('readNotificationIds') || '[]');
                const notiIdsToMark = feedItems
                    .filter(item => item.source === 'notification' && !readIds.includes(item.id))
                    .map(item => item.id);
                if (notiIdsToMark.length > 0) {
                    localStorage.setItem('readNotificationIds', JSON.stringify([...readIds, ...notiIdsToMark]));
                    setUnreadCount(prev => Math.max(0, prev - notiIdsToMark.length));
                }
            } catch (e) {
                console.error(e);
            }
        }
        setIsOpen(nextOpen);
    };

    const handleViewAll = () => {
        setIsOpen(false);
        navigate(`${basePath}/notifications`);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-label="Thông báo & cảnh báo"
                onClick={handleToggle}
                className={`relative p-2 rounded-lg transition-colors duration-200 ${dark ? 'text-white/70 hover:text-white hover:bg-white/[0.08]' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'}`}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className={`absolute ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'} ${dropdownAlign === 'left' ? 'left-0' : 'right-0'} w-80 bg-white border border-outline-gray rounded-xl shadow-sm-2 z-50 flex flex-col overflow-hidden`}>
                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist flex items-center gap-2 flex-shrink-0">
                        <BellRing className="w-4 h-4 text-slate-blue" />
                        <p className="text-sm font-bold text-midnight-indigo">Thông báo & Cảnh báo an ninh</p>
                    </div>

                    <div className="py-1 max-h-64 overflow-y-auto flex-1">
                        {loading ? (
                            <p className="px-4 py-6 text-sm text-slate-blue text-center">Đang tải...</p>
                        ) : feedItems.length === 0 ? (
                            <p className="px-4 py-6 text-sm text-slate-blue text-center">Không có thông báo nào.</p>
                        ) : (
                            feedItems.map((item) => (
                                <div 
                                    key={item.id} 
                                    onClick={handleViewAll}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-cloud-mist/60 border-b border-outline-gray/50 last:border-0 cursor-pointer"
                                >
                                    {item.source === 'alert' ? (
                                        <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${SEVERITY_DOT[item.severity]?.replace('bg-', 'text-') || 'text-slate-400'}`} />
                                    ) : (
                                        <Bell className="w-4 h-4 mt-0.5 text-action-blue flex-shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-midnight-indigo truncate">{item.title}</p>
                                        <p className="text-xs text-slate-blue truncate">
                                            {stripHtml(item.body)}
                                            {item.payloadJson?.conflictDetails?.[0] && (
                                                <span className="text-rose-600 font-medium"> — trùng với "{item.payloadJson.conflictDetails[0].meetingTitle}"</span>
                                            )}
                                        </p>
                                        <NoShowInlineAction item={item} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleViewAll}
                        className="w-full px-4 py-2.5 text-center text-sm font-bold text-action-blue hover:bg-cloud-mist border-t border-outline-gray flex-shrink-0"
                    >
                        Xem tất cả
                    </button>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
