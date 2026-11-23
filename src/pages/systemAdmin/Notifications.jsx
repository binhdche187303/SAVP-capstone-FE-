import FilterBar from '../../components/common/FilterBar';
import DateInput from '../../components/common/DateInput';
import PaginationFooter from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import ReportActions from '../../components/common/ReportActions';
import { AlertTriangle, Bell, Calendar, Camera, Car, CheckCircle, CheckSquare, ChevronDown, ChevronRight, Clock, Eye, EyeOff, Info, Layers, List, RefreshCw, Loader2, Search, Users } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getNotifications,
    getNotificationGroups,
    markNotificationGroupRead,
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

// Nhóm loại thông báo cho bộ lọc "Loại thông báo" (giá trị gửi BE: type=a,b,c).
const VEHICLE_TYPES = ['unknown_vehicle_alert', 'vehicle_unauthorized_alert', 'vehicle_control_list_match'];
const TYPE_CATEGORIES = [
    { key: 'vehicle', label: 'Xe ra vào', types: VEHICLE_TYPES },
    { key: 'camera', label: 'Camera & an ninh', types: ['device_offline_alert', 'security_alert', 'unknown_face_alert', 'person_watchlist_match'] },
    { key: 'attendance', label: 'Chuyên cần', types: ['no_show_alert', 'late_checkin_alert', 'late_checkin_host_summary', 'attendance_excuse_submitted', 'attendance_excuse_reviewed'] },
    {
        key: 'meeting', label: 'Cuộc họp', types: [
            'meeting_invite', 'reminder', 'cancellation', 'meeting_report_requested', 'minutes_signoff_requested', 'minutes_signoff_result',
            'room_early_vacancy', 'minutes_distribution', 'meeting_request_created', 'meeting_request_approved', 'meeting_request_rejected',
            'meeting_request_expired', 'meeting_request_approval_reminder', 'meeting_time_updated', 'meeting_room_updated',
            'meeting_participant_removed', 'meeting_time_warning', 'meeting_time_conflict_warning', 'transcript_ready',
            'minutes_deleted_by_admin', 'meeting_room_removed', 'audio_track_upload_requested',
        ],
    },
    { key: 'visitor', label: 'Khách', types: ['visitor_pending_approval', 'visitor_registered', 'visitor_arrived', 'visitor_left', 'visitor_overstay', 'visitor_must_leave', 'visitor_zone_violation'] },
    { key: 'equipment', label: 'Thiết bị', types: ['equipment_fault_reported', 'equipment_fault_confirmed', 'equipment_fault_resolved', 'equipment_auto_unassigned'] },
];

// Tên nhóm hiển thị (gom theo loại); loại khác dùng tiêu đề thông báo mới nhất.
const TYPE_LABEL = {
    unknown_vehicle_alert: 'Biển số không xác định',
    vehicle_unauthorized_alert: 'Xe đang chờ duyệt / bị từ chối',
    vehicle_control_list_match: 'Xe trong danh sách giám sát',
    device_offline_alert: 'Camera mất kết nối',
    security_alert: 'Cảnh báo an ninh',
    unknown_face_alert: 'Người lạ',
    person_watchlist_match: 'Người trong danh sách giám sát',
    no_show_alert: 'Vắng mặt cuộc họp',
    late_checkin_alert: 'Đi muộn cuộc họp',
    late_checkin_host_summary: 'Tổng hợp đi muộn (chủ trì)',
    meeting_invite: 'Mời họp',
    reminder: 'Nhắc lịch họp',
    cancellation: 'Hủy cuộc họp',
    meeting_request_created: 'Yêu cầu đặt phòng mới',
    meeting_request_approved: 'Yêu cầu đặt phòng được duyệt',
    meeting_request_rejected: 'Yêu cầu đặt phòng bị từ chối',
    minutes_distribution: 'Phân phối biên bản',
    account_welcome: 'Chào mừng tài khoản mới',
};


const groupLabelOf = (group) => TYPE_LABEL[group.type]
    || String(group.latest?.subject || group.type).replace(/^(Cảnh báo|Thông báo):\s*/i, '');

const formatDay = (day) => {
    const [y, m, d] = String(day || '').split('-');
    return y && m && d ? `${d}/${m}/${y}` : day;
};

const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('vi-VN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

const formatTime = (isoString) => (isoString
    ? new Date(isoString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '');

const plainText = (html) => removePriorityText(sanitizeBody(html)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// [FIX] Key cũ (APPROVAL_REQUEST/NO_SHOW_ALERT/DEVICE_FAULT/SECURITY_ALERT) là
// SCREAMING_CASE — enum thật của BE (NotificationType, notification.entity.ts) toàn bộ
// là snake_case. Gom theo ý nghĩa gần nhất (chờ duyệt / cảnh báo thiết bị-vắng mặt / an ninh).
const getIcon = (type) => {
    switch (type) {
        case 'meeting_request_created':
            return <Clock className="w-5 h-5 text-action-blue" />;
        case 'no_show_alert':
        case 'equipment_fault_reported':
        case 'equipment_fault_confirmed':
            return <AlertTriangle className="w-5 h-5 text-sunset-gold" />;
        case 'unknown_vehicle_alert':
        case 'vehicle_control_list_match':
        case 'vehicle_unauthorized_alert':
            return <Car className="w-5 h-5 text-red-600" />;
        case 'device_offline_alert':
            return <Camera className="w-5 h-5 text-red-600" />;
        case 'unknown_face_alert':
        case 'person_watchlist_match':
            return <Info className="w-5 h-5 text-red-600" />;
        case 'late_checkin_alert':
        case 'late_checkin_host_summary':
            return <Users className="w-5 h-5 text-sunset-gold" />;
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
        case 'device_offline_alert':
            return 'bg-red-50/40 border-red-150';
        default:
            return 'bg-cloud-mist/40 border-outline-gray';
    }
};

const mapItem = (item) => ({
    ...item,
    title: item.subject,
    body: item.content,
    type: item.notificationType,
    read: !!item.isRead // BE NotificationListItemDto.isRead (notification-list-item.dto.ts)
});

const NotificationItem = ({ noti, onMarkRead }) => {
    const priorityMeta = getNotificationPriority(noti);
    return (
        <motion.div
            layout
            className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all duration-200 ${getBgColor(noti.type, noti.read)}`}
        >
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="mt-0.5 p-2 bg-white rounded-lg shadow-sm border border-platinum-tint/50">
                    {getIcon(noti.type)}
                </div>
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 data-ui-text="primary" className={`text-sm font-bold text-midnight-indigo ${!noti.read ? 'font-extrabold' : ''}`}>{noti.title}</h4>
                        {!noti.read && <span className="w-2 h-2 rounded-full bg-red-500" />}
                    </div>
                    <p
                        className="text-xs text-slate-blue leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: removePriorityText(sanitizeBody(noti.body)) }}
                    />
                    {priorityMeta && (
                        <span data-ui-text="secondary" className={`inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full border text-[10px] font-bold ${priorityMeta.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${priorityMeta.dotClassName}`} />
                            Mức độ: {priorityMeta.label}
                        </span>
                    )}
                    {/* [Fix 2026-08-21, Bug 2] Cùng component NoShowInlineAction với NotificationBell.jsx. */}
                    <NoShowInlineAction item={noti} />
                    {noti.payloadJson?.conflictDetails?.length > 0 && (
                        <div data-ui-text="secondary" className="bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2 text-[11px] text-rose-800 space-y-1 mt-1">
                            <p className="font-semibold">Xung đột với:</p>
                            {noti.payloadJson.conflictDetails.map((c, idx) => (
                                <p key={c.bookingId || idx}>
                                    {c.meetingTitle || 'Cuộc họp khác'} — {c.roomName || ''}
                                    {' · '}{formatTime(c.startTime)}-{formatTime(c.endTime)}
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
                    <div data-ui-text="secondary" className="flex items-center gap-1 text-[10px] text-steel-gray pt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(noti.createdAt)}</span>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0">
                {!noti.read ? (
                    <button
                        onClick={() => onMarkRead(noti)}
                        className="p-1.5 hover:bg-white border border-transparent hover:border-platinum-tint rounded-lg text-slate-blue hover:text-green-700 transition-colors"
                        title="Đánh dấu đã đọc"
                        aria-label="Đánh dấu đã đọc"
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
    );
};

/** Danh sách thông báo có phân trang theo bộ lọc (dùng cho chế độ "Từng thông báo" và khi mở 1 nhóm). */
const NotificationPagedList = ({ filters, reloadKey, onChanged, pageSizeDefault = 10, emptyText }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(pageSizeDefault);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const filterKey = JSON.stringify(filters);

    useEffect(() => { setPage(1); }, [filterKey]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getNotifications({ ...JSON.parse(filterKey), page, limit });
            if (!res?.success) throw new Error();
            const mapped = (res.data || []).map(mapItem);
            setItems(mapped);
            setTotalPages(res.meta?.totalPages || 1);
            setTotalItems(res.meta?.total || mapped.length);
        } catch {
            setItems([]);
            setTotalPages(1);
            setTotalItems(0);
        } finally {
            setLoading(false);
        }
    }, [filterKey, page, limit]);

    useEffect(() => { load(); }, [load, reloadKey]);

    const handleMarkRead = async (noti) => {
        try {
            await markNotificationRead(noti.id);
        } catch {
            // BE lỗi — vẫn cập nhật UI để không chặn thao tác
        }
        setItems(prev => prev.map(n => (n.id === noti.id ? { ...n, read: true } : n)));
        onChanged?.();
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-platinum-tint min-h-[120px]">
                <Loader2 className="w-6 h-6 text-action-blue animate-spin" />
                <p data-ui-text="primary" className="text-slate-blue text-xs font-semibold mt-3">Đang tải danh sách thông báo...</p>
            </div>
        );
    }
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-platinum-tint text-center min-h-[120px]">
                <Bell className="w-8 h-8 text-platinum-tint mb-2" />
                <p className="text-slate-blue text-xs">{emptyText || 'Không tìm thấy thông báo nào khớp với bộ lọc.'}</p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {items.map(noti => <NotificationItem key={noti.id} noti={noti} onMarkRead={handleMarkRead} />)}
            <PaginationFooter
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={limit}
                onPageChange={setPage}
                itemLabel="thông báo"
                loading={loading}
                onPageSizeChange={size => { setLimit(size); setPage(1); }}
            />
        </div>
    );
};

const NotificationGroupRow = ({ group, filters, anprPath, reloadKey, onChanged }) => {
    const [open, setOpen] = useState(false);
    const label = groupLabelOf(group);
    const allRead = group.unread === 0;
    const latestText = plainText(group.latest?.content);

    const markGroupRead = async () => {
        try {
            await markNotificationGroupRead(group.type, group.day);
        } finally {
            onChanged?.();
        }
    };

    return (
        <li aria-label={label} className={`rounded-xl border ${getBgColor(group.type, allRead)}`}>
            <div className="p-4 flex items-start gap-3">
                <div className="mt-0.5 p-2 bg-white rounded-lg shadow-sm border border-platinum-tint/50">
                    {getIcon(group.type)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 data-ui-text="primary" className={`text-sm text-midnight-indigo ${allRead ? 'font-bold' : 'font-extrabold'}`}>{label}</h4>
                        {!allRead && <span className="w-2 h-2 rounded-full bg-red-500" />}
                        <span data-ui-text="secondary" className="inline-flex items-center gap-1 text-[11px] text-steel-gray">
                            <Calendar className="w-3.5 h-3.5" />{formatDay(group.day)}
                        </span>
                    </div>
                    <p data-ui-text="secondary" className="text-xs font-semibold text-slate-blue">
                        {allRead ? `${group.total} thông báo · đã đọc hết` : `${group.total} thông báo · ${group.unread} chưa đọc`}
                    </p>
                    {latestText && (
                        <p className="text-xs text-slate-blue truncate" title={latestText}>
                            Mới nhất{group.latestAt ? ` (${formatTime(group.latestAt)})` : ''}: {latestText}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setOpen(o => !o)}
                            aria-expanded={open}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-action-blue bg-blue-50 hover:bg-blue-100"
                        >
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            {open ? 'Thu gọn' : `Xem ${group.total} thông báo`}
                        </button>
                        {!allRead && (
                            <button
                                type="button"
                                onClick={markGroupRead}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-blue border border-platinum-tint bg-white hover:bg-cloud-mist"
                            >
                                <CheckSquare className="w-3.5 h-3.5 text-green-600" />Đánh dấu đã đọc cả nhóm
                            </button>
                        )}
                        {anprPath && VEHICLE_TYPES.includes(group.type) && (
                            <Link to={anprPath} className="text-xs font-semibold text-action-blue hover:underline">
                                Tra cứu tại trang Xe ra vào →
                            </Link>
                        )}
                    </div>
                </div>
            </div>
            {open && (
                <div className="px-4 pb-4">
                    <NotificationPagedList
                        filters={{ ...filters, type: group.type, from: group.day, to: group.day }}
                        reloadKey={reloadKey}
                        onChanged={onChanged}
                    />
                </div>
            )}
        </li>
    );
};

const Notifications = () => {
    const { pathname } = useLocation();
    // Trang tra cứu biển số chỉ có ở khu System Admin.
    const anprPath = pathname.startsWith('/system-admin') ? '/system-admin/anpr-management' : null;

    const [viewMode, setViewMode] = useState('group'); // 'group' | 'list'
    const [readTab, setReadTab] = useState(''); // '', 'unread', 'read'
    const [category, setCategory] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [successMessage, setSuccessMessage] = useState(null);

    const [groups, setGroups] = useState([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [groupPage, setGroupPage] = useState(1);
    const [groupLimit, setGroupLimit] = useState(10);
    const [groupTotalPages, setGroupTotalPages] = useState(1);
    const [groupTotal, setGroupTotal] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const filters = {
        isRead: readTab === 'unread' ? false : readTab === 'read' ? true : undefined,
        type: category ? TYPE_CATEGORIES.find(c => c.key === category)?.types.join(',') : undefined,
        from: from || undefined,
        to: to || undefined,
        search: search || undefined,
    };
    const filterKey = JSON.stringify(filters);

    useEffect(() => { setGroupPage(1); }, [filterKey]);

    const fetchGroups = useCallback(async () => {
        setGroupsLoading(true);
        try {
            const res = await getNotificationGroups({ ...JSON.parse(filterKey), page: groupPage, limit: groupLimit });
            if (!res?.success) throw new Error();
            setGroups(res.data || []);
            setGroupTotalPages(res.meta?.totalPages || 1);
            setGroupTotal(res.meta?.total || 0);
        } catch {
            setGroups([]);
            setGroupTotalPages(1);
            setGroupTotal(0);
        } finally {
            setGroupsLoading(false);
        }
    }, [filterKey, groupPage, groupLimit]);

    useEffect(() => {
        if (viewMode === 'group') fetchGroups();
    }, [viewMode, fetchGroups, reloadKey]);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    const refresh = () => setReloadKey(k => k + 1);

    // Mark all notifications as read — PATCH /notifications/read-all
    const handleMarkAllAsRead = async () => {
        try {
            const res = await markAllNotificationsRead();
            if (res?.success !== false) setSuccessMessage('Đã đánh dấu đọc toàn bộ thông báo.');
        } catch {
            // giữ nguyên, tải lại để hiện trạng thái thật
        }
        refresh();
    };

    const resetFilters = () => {
        setCategory(''); setFrom(''); setTo(''); setSearchInput(''); setSearch('');
    };
    const hasFilters = Boolean(category || from || to || searchInput);

    const inputCls = 'h-9 w-full rounded-xl border border-platinum-tint bg-white px-3 text-xs text-midnight-indigo focus:border-action-blue focus:outline-none focus:ring-1 focus:ring-action-blue';

    return (
        <div data-page-surface="wide" className="space-y-4 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <span data-ui-text="badge" className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue !mb-2">
                        <Bell className="w-3.5 h-3.5" />
                        Trung tâm thông báo
                    </span>
                    <h1 className="!m-0 text-2xl font-extrabold text-midnight-indigo tracking-tight">Thông báo hệ thống</h1>
                </div>

                <ReportActions className="!self-start sm:mt-7">
                    <button
                        onClick={handleMarkAllAsRead}
                        className="inline-flex h-9 items-center justify-center px-4 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-bold shadow-sm transition-all duration-200"
                    >
                        <CheckSquare className="w-4 h-4 mr-2 text-green-600" />
                        Đọc tất cả
                    </button>
                    <RefreshButton
                        forceStandard
                        onClick={refresh}
                        legacyClassName="p-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl hover:bg-cloud-mist transition-colors duration-200"
                        title="Làm mới thông báo"
                        busy={viewMode === 'group' && groupsLoading}
                    >
                        <RefreshCw className="w-4 h-4" />
                    </RefreshButton>
                </ReportActions>
            </div>

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

            {/* Trạng thái đọc + cách xem */}
            <FilterBar variant="card" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex flex-wrap rounded-xl border border-platinum-tint bg-white p-1 shadow-sm">
                        {[
                            { key: '', label: 'Tất cả thông báo' },
                            { key: 'unread', label: 'Chưa đọc' },
                            { key: 'read', label: 'Đã đọc' }
                        ].map(tab => (
                            <button data-filter-preset
                                key={tab.key}
                                type="button"
                                aria-pressed={readTab === tab.key}
                                onClick={() => setReadTab(tab.key)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${readTab === tab.key
                                    ? 'bg-action-blue text-white shadow-sm'
                                    : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="inline-flex rounded-xl border border-platinum-tint bg-white p-0.5">
                        {[
                            { key: 'group', label: 'Theo nhóm', Icon: Layers },
                            { key: 'list', label: 'Từng thông báo', Icon: List },
                        ].map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={viewMode === key}
                                onClick={() => setViewMode(key)}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${viewMode === key ? 'bg-action-blue text-white shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                <Icon className="w-3.5 h-3.5" />{label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <select aria-label="Loại thông báo" value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                        <option value="">Tất cả loại</option>
                        {TYPE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <DateInput forceStandard aria-label="Từ ngày" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className={inputCls} />
                    <DateInput forceStandard aria-label="Đến ngày" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className={inputCls} />
                    <div className="relative order-first sm:col-span-2">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel-gray" />
                        <input
                            aria-label="Tìm kiếm"
                            type="search"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Biển số, tên camera, nội dung..."
                            className={`${inputCls} !pl-9`}
                        />
                    </div>
                </div>
                {hasFilters && (
                    <button type="button" onClick={resetFilters} className="text-xs font-semibold text-action-blue hover:underline">
                        Xóa bộ lọc
                    </button>
                )}
            </FilterBar>

            {viewMode === 'list' ? (
                <NotificationPagedList filters={filters} reloadKey={reloadKey} />
            ) : groupsLoading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-platinum-tint min-h-[200px]">
                    <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
                    <p data-ui-text="primary" className="text-slate-blue text-xs font-semibold mt-3">Đang tải thông báo...</p>
                </div>
            ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-platinum-tint text-center min-h-[200px]">
                    <Bell className="w-10 h-10 text-platinum-tint mb-2" />
                    <h3 className="text-sm font-bold text-midnight-indigo">Hộp thư thông báo trống</h3>
                    <p className="text-slate-blue text-xs mt-0.5">Không tìm thấy thông báo nào khớp với bộ lọc.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <ul className="space-y-3">
                        {groups.map(g => (
                            <NotificationGroupRow
                                key={`${g.type}|${g.day}`}
                                group={g}
                                filters={filters}
                                anprPath={anprPath}
                                reloadKey={reloadKey}
                                onChanged={refresh}
                            />
                        ))}
                    </ul>
                    <PaginationFooter
                        currentPage={groupPage}
                        totalPages={groupTotalPages}
                        totalItems={groupTotal}
                        pageSize={groupLimit}
                        onPageChange={setGroupPage}
                        itemLabel="nhóm"
                        loading={groupsLoading}
                        onPageSizeChange={size => { setGroupLimit(size); setGroupPage(1); }}
                    />
                </div>
            )}
        </div>
    );
};

export default Notifications;
