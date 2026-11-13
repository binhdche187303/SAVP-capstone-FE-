import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    getMeetingPresence,
    getUserPresence,
    getMeetingPresenceReport,
    getMeetingAttendance
} from '../../service/managerServices';
import ThumbnailImage from '../common/ThumbnailImage';
import EventSnapshotModal from '../security/EventSnapshotModal';
import {
    Users,
    Clock,
    AlertTriangle,
    Search,
    FileText,
    Activity,
    CheckCircle2,
    XCircle,
    ArrowUpDown,
    RefreshCw,
    X,
    ChevronLeft,
    ChevronRight,
    Eye,
    UserCheck,
    UserX,
    BarChart2
} from 'lucide-react';
import SharedStatCard from '../../components/common/StatCard';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0 giây';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min} phút ${sec} giây` : `${sec} giây`;
};

const formatVietnameseTime = (isoString) => {
    if (!isoString) return '—';
    try {
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        });
    } catch { return '—'; }
};

const ATTENDANCE_STATUS_MAP = {
    not_checked_in: { label: 'Chưa điểm danh', className: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
    present: { label: 'Đã điểm danh', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    late: { label: 'Điểm danh trễ', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    left_early: { label: 'Về sớm', className: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
    absent: { label: 'Vắng mặt', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    pending_review: { label: 'Chờ xác minh', className: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};

const getAttendanceStatusInfo = (status) =>
    ATTENDANCE_STATUS_MAP[status] || { label: 'Chưa điểm danh', className: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };

const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-violet-100 text-violet-700 border-violet-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-teal-100 text-teal-700 border-teal-200',
];

const getAvatarColor = (userId = '') => {
    const sum = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

// ─── Avatar Component ───────────────────────────────────────────────────────

const Avatar = ({ user, size = 'md' }) => {
    const [imgError, setImgError] = useState(false);
    const sizeClass = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';

    if (user?.avatarUrl && !imgError) {
        return (
            <img
                src={user.avatarUrl}
                alt={user.fullName}
                onError={() => setImgError(true)}
                className={`${sizeClass} rounded-full object-cover border-2 border-platinum-tint flex-shrink-0`}
            />
        );
    }
    return (
        <div className={`${sizeClass} ${getAvatarColor(user?.userId)} rounded-full border flex items-center justify-center font-bold flex-shrink-0`}>
            {getInitials(user?.fullName)}
        </div>
    );
};

// ─── User Detail Modal ──────────────────────────────────────────────────────

const UserDetailModal = ({ user, meetingId, meetingStartTime, meetingEndTime, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeline, setTimeline] = useState(null);

    // States for snapshot fullscreen viewing
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [snapshotEventIds, setSnapshotEventIds] = useState([]);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
    const [logPage, setLogPage] = useState(1);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        getUserPresence(meetingId, user.userId)
            .then((res) => {
                if (res?.success && res.data) setTimeline(res.data);
                else throw new Error(res?.error?.message || res?.message || 'Không thể tải tiến trình chi tiết.');
            })
            .catch((err) => setError(err.message || 'Lỗi khi tải tiến trình.'))
            .finally(() => setLoading(false));
    }, [meetingId, user.userId]);

    const logItemsPerPage = 5;
    const events = timeline?.timeline?.events || [];
    const logTotalPages = Math.ceil(events.length / logItemsPerPage);
    const currentEvents = events.slice((logPage - 1) * logItemsPerPage, logPage * logItemsPerPage);

    const isPresent = user.durationMs > 0;
    const ratio = ((user.presentRatio ?? 0) * 100).toFixed(1);

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-platinum-tint bg-cloud-mist/20 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Avatar user={user} size="lg" />
                        <div>
                            <h2 className="text-base font-bold text-midnight-indigo">{user.fullName || 'Không tên'}</h2>
                            <p className="text-[11px] text-slate-blue font-mono mt-0.5">ID: {user.userId}</p>
                            {user.email && <p className="text-[11px] text-slate-blue">{user.email}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            isPresent
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                            {isPresent ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            {isPresent ? 'Có mặt' : 'Vắng mặt'}
                        </span>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cloud-mist text-slate-blue hover:text-midnight-indigo transition-colors"
                        >
                            <X className="w-4.5 h-4.5" />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <RefreshCw className="w-7 h-7 text-action-blue animate-spin" />
                            <span className="text-xs text-slate-blue font-semibold">Đang tải dữ liệu tiến trình từ IVSS...</span>
                        </div>
                    ) : error ? (
                        <div className="p-5 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-xs font-medium">{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-cloud-mist/40 rounded-xl border border-platinum-tint text-center">
                                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Thời gian có mặt</p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{formatDuration(timeline?.duration?.durationMs)}</p>
                                </div>
                                <div className="p-3 bg-cloud-mist/40 rounded-xl border border-platinum-tint text-center">
                                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Số lần nhận diện</p>
                                    <p className="text-sm font-bold text-midnight-indigo mt-1">{timeline?.duration?.segmentCount ?? 0} đoạn</p>
                                </div>
                                <div className="p-3 bg-cloud-mist/40 rounded-xl border border-platinum-tint text-center">
                                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Tỉ lệ tham dự</p>
                                    <p className={`text-sm font-bold mt-1 ${Number(ratio) >= 80 ? 'text-emerald-600' : Number(ratio) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {((timeline?.duration?.presentRatio ?? 0) * 100).toFixed(1)}%
                                    </p>
                                </div>
                                <div className="p-3 bg-cloud-mist/40 rounded-xl border border-platinum-tint text-center">
                                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Sự kiện ngoài lịch</p>
                                    <p className={`text-sm font-bold mt-1 ${(timeline?.unmatchedCount ?? 0) > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                                        {timeline?.unmatchedCount ?? 0} lần
                                    </p>
                                </div>
                            </div>

                            {/* Timeline chart */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-blue uppercase tracking-wide flex items-center gap-1.5">
                                    <BarChart2 className="w-3.5 h-3.5" />
                                    Biểu đồ trục thời gian họp
                                </h4>

                                <div className="flex justify-between text-[10px] text-slate-blue font-bold pb-2 border-b border-platinum-tint">
                                    <span>Bắt đầu: {new Date(meetingStartTime).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span>Kết thúc: {new Date(meetingEndTime).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>

                                <div className="relative h-9 bg-slate-100 rounded-lg border border-platinum-tint overflow-hidden">
                                    {timeline?.timeline?.segments?.map((seg, idx) => {
                                        const startMs = new Date(meetingStartTime).getTime();
                                        const endMs = new Date(meetingEndTime).getTime();
                                        const meetingLength = endMs - startMs;
                                        if (meetingLength <= 0) return null;
                                        const left = Math.max(0, Math.min(100, ((new Date(seg.start).getTime() - startMs) / meetingLength) * 100));
                                        const width = Math.max(0.5, Math.min(100 - left, ((new Date(seg.end).getTime() - new Date(seg.start).getTime()) / meetingLength) * 100));
                                        return (
                                            <div
                                                key={idx}
                                                style={{ left: `${left}%`, width: `${width}%` }}
                                                className="absolute top-0 bottom-0 bg-emerald-500/80 border-x border-emerald-600/30 group cursor-pointer"
                                                title={`Có mặt: ${formatVietnameseTime(seg.start)} – ${formatVietnameseTime(seg.end)}`}
                                            >
                                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1.5 bg-slate-900 text-white text-[9.5px] rounded-lg shadow-md whitespace-nowrap z-30">
                                                    Có mặt: {formatVietnameseTime(seg.start)} – {formatVietnameseTime(seg.end)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {timeline?.timeline?.events?.map((ev, idx) => {
                                        const startMs = new Date(meetingStartTime).getTime();
                                        const endMs = new Date(meetingEndTime).getTime();
                                        const meetingLength = endMs - startMs;
                                        if (meetingLength <= 0) return null;
                                        const left = Math.max(0, Math.min(100, ((new Date(ev.at).getTime() - startMs) / meetingLength) * 100));
                                        const isEnter = ev.direction === 'enter';
                                        return (
                                            <div
                                                key={idx}
                                                style={{ left: `${left}%` }}
                                                className="absolute top-0 bottom-0 w-0.5 z-20 group cursor-pointer"
                                            >
                                                <div className={`w-px h-full ${isEnter ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                                                <span className={`absolute -top-1.5 -translate-x-1/2 text-[9px] font-bold ${isEnter ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                    {isEnter ? '▲' : '▼'}
                                                </span>
                                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 p-1.5 bg-slate-900 text-white text-[9.5px] rounded-lg shadow-md whitespace-nowrap z-30">
                                                    {isEnter ? 'VÀO CỬA' : 'RA CỬA'}: {formatVietnameseTime(ev.at)}
                                                    {ev.similarity != null ? ` (${(ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity).toFixed(0)}%)` : ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex flex-wrap gap-4 text-[10.5px] text-slate-blue font-semibold">
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500/80 rounded-sm" />Có mặt trong phòng</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-100 border border-platinum-tint rounded-sm" />Vắng mặt</span>
                                    <span className="flex items-center gap-1"><span className="text-emerald-700 font-bold">▲</span>Vào cửa</span>
                                    <span className="flex items-center gap-1"><span className="text-amber-700 font-bold">▼</span>Ra cửa</span>
                                </div>
                            </div>

                            {/* Events table */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-xs font-bold text-slate-blue uppercase tracking-wide">Chi tiết các mốc quét camera</h4>
                                    {logTotalPages > 1 && (
                                        <span className="text-[10px] text-slate-blue font-bold">Trang {logPage}/{logTotalPages}</span>
                                    )}
                                </div>
                                <div className="border border-platinum-tint rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-cloud-mist/50 border-b border-platinum-tint text-slate-blue font-bold text-center">
                                                <th className="p-3 text-left">Thời điểm</th>
                                                <th className="p-3 text-center">Hướng di chuyển</th>
                                                <th className="p-3 text-center">Ảnh camera</th>
                                                <th className="p-3 text-center">Độ tin cậy nhận diện</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentEvents.length > 0 ? (
                                                currentEvents.map((ev, idx) => {
                                                    const simValue = ev.similarity != null ? (ev.similarity <= 1 ? ev.similarity * 100 : ev.similarity) : null;
                                                    return (
                                                        <tr key={idx} className="border-b border-platinum-tint hover:bg-cloud-mist/20 text-center transition-colors">
                                                            <td className="p-3 text-left font-medium text-midnight-indigo">{formatVietnameseTime(ev.at)}</td>
                                                            <td className="p-3 text-center">
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                                                    ev.direction === 'enter'
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                }`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${ev.direction === 'enter' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                    {ev.direction === 'enter' ? 'Vào phòng' : 'Ra khỏi phòng'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                {ev.id ? (
                                                                    <div className="w-16 h-10 overflow-hidden rounded border border-slate-200 mx-auto flex items-center justify-center bg-slate-50 transition-all hover:scale-105">
                                                                        <ThumbnailImage
                                                                            eventId={ev.id}
                                                                            className="w-full h-full object-cover border-0"
                                                                            onClick={() => {
                                                                                const evImages = events.map(e => e.id).filter(Boolean);
                                                                                setSnapshotEventIds(evImages);
                                                                                setSnapshotEventId(ev.id);
                                                                                setIsSnapshotOpen(true);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 font-medium italic">Không ảnh</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                {simValue !== null ? (
                                                                    <span className={`inline-flex px-2 py-0.5 rounded font-bold text-[10px] border ${
                                                                        simValue >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                        simValue >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                        'bg-red-50 text-red-700 border-red-200'
                                                                    }`}>
                                                                        {simValue.toFixed(0)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400 font-medium">—</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="p-8 text-center text-slate-blue italic text-[11px] bg-slate-50/55">
                                                        Không ghi nhận sự kiện quẹt camera nào.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Inner Log Pagination */}
                                {logTotalPages > 1 && (
                                    <div className="flex justify-between items-center pt-2 px-1">
                                        <span className="text-[10px] text-slate-blue font-bold">
                                            Hiển thị {(logPage - 1) * logItemsPerPage + 1}–{Math.min(logPage * logItemsPerPage, events.length)} trong {events.length} mốc quét
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                disabled={logPage === 1}
                                                onClick={() => setLogPage(p => p - 1)}
                                                className="px-2 py-1 text-[10px] border border-platinum-tint rounded-lg hover:bg-cloud-mist disabled:opacity-40 text-slate-blue transition-colors font-bold"
                                            >
                                                ‹ Trước
                                            </button>
                                            <button
                                                type="button"
                                                disabled={logPage === logTotalPages}
                                                onClick={() => setLogPage(p => p + 1)}
                                                className="px-2 py-1 text-[10px] border border-platinum-tint rounded-lg hover:bg-cloud-mist disabled:opacity-40 text-slate-blue transition-colors font-bold"
                                            >
                                                Sau ›
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-3 border-t border-platinum-tint bg-cloud-mist/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 text-xs font-bold bg-midnight-indigo text-white rounded-xl hover:bg-midnight-indigo/90 transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>

            {/* Event Snapshot Modal for viewing fullscreen camera images */}
            <EventSnapshotModal
                isOpen={isSnapshotOpen}
                onClose={() => setIsSnapshotOpen(false)}
                eventId={snapshotEventId}
                eventIds={snapshotEventIds}
            />
        </div>,
        document.body
    );
};

// ─── User Profile Modal ─────────────────────────────────────────────────────

const UserProfileModal = ({ user, onClose }) => {
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-platinum-tint flex flex-col animate-in fade-in zoom-in-95 duration-200 p-6 items-center text-center">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-cloud-mist text-slate-blue hover:text-midnight-indigo transition-colors"
                >
                    <X className="w-4.5 h-4.5" />
                </button>

                {/* Profile Avatar */}
                <div className="mt-4 mb-4">
                    <Avatar user={user} size="lg" />
                </div>

                {/* Profile Info */}
                <h3 className="text-base font-bold text-midnight-indigo">{user.fullName || 'Chưa rõ'}</h3>
                
                <div className="w-full mt-4 space-y-3 text-left border-t border-platinum-tint pt-4">
                    {user.employeeCode && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-blue font-semibold">Mã nhân viên:</span>
                            <span className="font-bold text-midnight-indigo font-mono bg-slate-100 px-2 py-0.5 rounded">{user.employeeCode}</span>
                        </div>
                    )}
                    
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-blue font-semibold">Phòng ban:</span>
                        <span className="font-bold text-midnight-indigo">{user.departmentName || 'Chưa cập nhật'}</span>
                    </div>

                    {user.email && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-blue font-semibold">Email:</span>
                            <a href={`mailto:${user.email}`} className="font-bold text-action-blue hover:underline">{user.email}</a>
                        </div>
                    )}

                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-blue font-semibold">Mã ID hệ thống:</span>
                        <span className="font-medium text-slate-500 font-mono select-all text-[10px]" title={user.userId}>{user.userId?.substring(0, 8)}...</span>
                    </div>
                </div>

                {/* Action button */}
                <button
                    onClick={onClose}
                    className="w-full mt-6 py-2 bg-midnight-indigo text-white font-bold rounded-xl text-xs hover:bg-midnight-indigo/90 transition-colors"
                >
                    Đóng
                </button>
            </div>
        </div>,
        document.body
    );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const MeetingPresenceIVSS = ({ meetingId, meetingStartTime, meetingEndTime }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [presenceSummary, setPresenceSummary] = useState(null);
    const [attendanceByUserId, setAttendanceByUserId] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState('fullName');
    const [sortOrder, setSortOrder] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedUser, setSelectedUser] = useState(null);
    const [profileUser, setProfileUser] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    const itemsPerPage = 8;

    const triggerToast = (msg, isSuccess = true) => {
        setToastMessage({ text: msg, isSuccess });
        setTimeout(() => setToastMessage(null), 3500);
    };

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSelectedUser(null);
        try {
            const res = await getMeetingPresence(meetingId);
            if (res?.success && res.data) setPresenceSummary(res.data);
            else throw new Error(res?.error?.message || res?.message || 'Không có dữ liệu hiện diện từ IVSS.');
        } catch (err) {
            setError(err.message || 'Lỗi hệ thống khi tải dữ liệu hiện diện camera.');
        } finally {
            setLoading(false);
        }

        // Tình trạng điểm danh chính thức đến từ attendance_records (module attendance,
        // UC-APM-02), KHÔNG phải meeting_participants.attendance_status (cột này không
        // bao giờ được ghi bởi luồng điểm danh thủ công/camera — luôn giữ giá trị mặc định).
        // Tải riêng, lỗi ở đây không chặn phần hiện diện camera phía trên.
        try {
            const attRes = await getMeetingAttendance(meetingId, { pageSize: 100 });
            const items = attRes?.data?.items || [];
            const map = {};
            items.forEach((it) => { map[it.userId] = it.attendanceStatus; });
            setAttendanceByUserId(map);
        } catch {
            setAttendanceByUserId({});
        }
    }, [meetingId]);

    useEffect(() => {
        if (meetingId) fetchSummary();
    }, [meetingId, fetchSummary]);

    const handleDownloadPDF = async () => {
        setPdfLoading(true);
        try {
            const res = await getMeetingPresenceReport(meetingId);
            const blobData = res?.data || res;
            const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: 'application/pdf' });
            if (blob.size === 0) throw new Error('File PDF trống.');
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-hien-dien-${meetingId.substring(0, 8)}.pdf`;
            link.click();
            window.URL.revokeObjectURL(url);
            triggerToast('Đã tải xuống báo cáo hiện diện PDF thành công!');
        } catch (err) {
            triggerToast(err.message || 'Không thể xuất báo cáo PDF. Vui lòng thử lại.', false);
        } finally {
            setPdfLoading(false);
        }
    };

    const handleSort = (field) => {
        if (sortField === field) setSortOrder(s => s === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('asc'); }
    };

    // ── Loading / Error states ──
    if (loading) {
        return (
            <div className="space-y-6 animate-pulse p-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-28 bg-white rounded-2xl border border-platinum-tint p-5 shadow-sm">
                            <div className="h-4 bg-pale-gray rounded w-1/2 mb-3" />
                            <div className="h-8 bg-pale-gray rounded w-1/4" />
                        </div>
                    ))}
                </div>
                <div className="bg-white rounded-2xl border border-platinum-tint p-6 space-y-3 shadow-sm">
                    <div className="h-6 bg-pale-gray rounded w-1/3" />
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-pale-gray rounded" />)}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 text-red-700 rounded-2xl border border-red-200 flex flex-col items-center gap-3 text-center max-w-xl mx-auto shadow-sm">
                <AlertTriangle className="w-10 h-10 text-red-500" />
                <h4 className="text-sm font-bold uppercase tracking-wider">Lỗi tải dữ liệu IVSS</h4>
                <p className="text-xs max-w-md">{error}</p>
                <button onClick={fetchSummary} className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95">
                    <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                </button>
            </div>
        );
    }

    const participants = (presenceSummary?.participants || []).map((p) => ({
        ...p,
        attendanceStatus: attendanceByUserId[p.userId] || 'not_checked_in',
    }));
    const unmatchedCount = presenceSummary?.meetingUnmatchedIdentityCount ?? 0;
    const countPresent = participants.filter(p => p.durationMs > 0).length;
    const countAbsent = participants.filter(p => p.durationMs === 0).length;

    const nameCounts = {};
    participants.forEach(p => { nameCounts[p.fullName || 'Chưa rõ'] = (nameCounts[p.fullName || 'Chưa rõ'] || 0) + 1; });

    const filteredParticipants = participants.filter(p => {
        const term = searchTerm.toLowerCase();
        return p.fullName?.toLowerCase().includes(term) || p.userId?.toLowerCase().includes(term);
    });

    const sortedParticipants = [...filteredParticipants].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedParticipants.length / itemsPerPage);
    const indexOfFirst = (currentPage - 1) * itemsPerPage;
    const currentItems = sortedParticipants.slice(indexOfFirst, indexOfFirst + itemsPerPage);

    const SortHeader = ({ field, label }) => (
        <th className="p-3.5 cursor-pointer select-none hover:text-midnight-indigo transition-colors" onClick={() => handleSort(field)}>
            <span className="flex items-center gap-1">
                {label}
                <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-action-blue' : 'text-steel-gray'}`} />
            </span>
        </th>
    );

    return (
        <div className="space-y-5">
            {/* Toast */}
            {toastMessage && (
                <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 ${
                    toastMessage.isSuccess ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                    {toastMessage.isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {toastMessage.text}
                </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SharedStatCard icon={UserCheck} tone="green" label="Có mặt thực tế" value={<>{countPresent} <span className="text-xs font-medium">người</span></>} hint="Camera nhận diện được" />
                <SharedStatCard icon={UserX} tone="slate" label="Đăng ký nhưng vắng" value={<>{countAbsent} <span className="text-xs font-medium">người</span></>} hint="Không xuất hiện trước camera" />
                <SharedStatCard icon={AlertTriangle} tone={unmatchedCount > 0 ? 'amber' : 'neutral'} label="Sự kiện chưa khớp" value={<>{unmatchedCount} <span className="text-xs font-medium">lần</span></>} hint="Người lạ hoặc ngoài lịch" />
            </div>

            {/* Presence table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                {/* Table header */}
                <div className="p-5 border-b border-platinum-tint flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-cloud-mist/10">
                    <div>
                        <h3 className="text-sm font-bold text-midnight-indigo flex items-center gap-2 uppercase tracking-wide">
                            <Activity className="w-4 h-4 text-action-blue" />
                            Danh sách đối soát hiện diện phòng họp
                        </h3>
                        <p className="text-[11px] text-slate-blue mt-0.5">
                            So sánh giữa đăng ký tham gia và thực tế camera ghi nhận — click nhân viên để xem chi tiết
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={pdfLoading || participants.length === 0}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-action-blue hover:bg-action-blue/90 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        {pdfLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        Tải báo cáo PDF
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Search */}
                    <div className="relative max-w-sm">
                        <input
                            type="text"
                            placeholder="Tìm nhân viên theo tên hoặc ID..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-4 py-2.5 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue bg-cloud-mist/20"
                        />
                        <Search className="w-4 h-4 text-slate-blue absolute left-3 top-2.5" />
                    </div>

                    {/* Table */}
                    <div className="border border-platinum-tint rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-cloud-mist border-b border-platinum-tint text-slate-blue font-bold text-[11px]">
                                    <SortHeader field="fullName" label="Nhân viên" />
                                    <SortHeader field="durationMs" label="Trạng thái" />
                                    <SortHeader field="attendanceStatus" label="Tình trạng điểm danh" />
                                    <SortHeader field="durationMs" label="Thời lượng có mặt" />
                                    <SortHeader field="presentRatio" label="Tỉ lệ hiện diện" />
                                    <th className="p-3.5 text-center">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentItems.length > 0 ? currentItems.map((user) => {
                                    const hasDuplicateName = nameCounts[user.fullName || 'Chưa rõ'] > 1;
                                    const displayName = hasDuplicateName
                                        ? `${user.fullName} (${user.userId?.substring(0, 8)})`
                                        : (user.fullName || 'Không tên');
                                    const isPresent = user.durationMs > 0;
                                    const ratio = (user.presentRatio ?? 0) * 100;

                                    return (
                                        <tr
                                            key={user.userId}
                                            className="border-b border-platinum-tint hover:bg-cloud-mist/40 transition-colors"
                                        >
                                            {/* Avatar + Name */}
                                            <td className="p-3.5">
                                                <div 
                                                    className="flex items-center gap-3 cursor-pointer group"
                                                    onClick={() => setProfileUser(user)}
                                                    title="Bấm để xem thông tin nhân sự"
                                                >
                                                    <div className="transition-transform duration-200 group-hover:scale-105">
                                                        <Avatar user={user} size="md" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-midnight-indigo group-hover:text-action-blue group-hover:underline truncate max-w-[140px] transition-all">{displayName}</p>
                                                        {user.email && <p className="text-[10px] text-slate-blue truncate max-w-[140px]">{user.email}</p>}
                                                        {user.departmentName && <p className="text-[10px] text-slate-blue/80">{user.departmentName}</p>}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="p-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                                    isPresent
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                    {isPresent ? 'Có mặt' : 'Vắng mặt'}
                                                </span>
                                            </td>

                                            {/* Tình trạng điểm danh — nguồn attendance_records (module attendance), khác Trạng thái camera ở trên */}
                                            <td className="p-3.5">
                                                {(() => {
                                                    const info = getAttendanceStatusInfo(user.attendanceStatus);
                                                    return (
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${info.className}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
                                                            {info.label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>

                                            {/* Duration */}
                                            <td className="p-3.5 font-medium text-midnight-indigo whitespace-nowrap">
                                                {formatDuration(user.durationMs)}
                                            </td>

                                            {/* Ratio with progress bar */}
                                            <td className="p-3.5">
                                                <div className="flex flex-col gap-1 min-w-[80px]">
                                                    <span className={`text-xs font-bold ${ratio >= 80 ? 'text-emerald-600' : ratio >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                                                        {ratio.toFixed(1)}%
                                                    </span>
                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${ratio >= 80 ? 'bg-emerald-500' : ratio >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                                            style={{ width: `${Math.min(100, ratio)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Action */}
                                            <td className="p-3.5 text-center">
                                                <button
                                                    onClick={() => setSelectedUser(user)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-action-blue/10 hover:bg-action-blue text-action-blue hover:text-white text-[10px] font-bold border border-action-blue/20 hover:border-action-blue transition-all active:scale-95"
                                                >
                                                    <Eye className="w-3 h-3" />
                                                    Xem chi tiết
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="6" className="p-10 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Users className="w-8 h-8 text-steel-gray" />
                                                <p className="text-sm font-semibold text-midnight-indigo">Không tìm thấy người dùng phù hợp</p>
                                                <p className="text-[11px] text-slate-blue">Vui lòng thay đổi từ khoá tìm kiếm</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-[11px] text-slate-blue">
                                {indexOfFirst + 1}–{Math.min(indexOfFirst + itemsPerPage, sortedParticipants.length)} / {sortedParticipants.length} nhân viên
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-platinum-tint rounded-lg hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                                    const page = i + 1;
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-7 h-7 rounded-lg text-[10.5px] font-bold transition-all border ${
                                                currentPage === page
                                                    ? 'bg-action-blue text-white border-action-blue'
                                                    : 'border-platinum-tint hover:bg-cloud-mist text-slate-blue'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 border border-platinum-tint rounded-lg hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* User detail modal */}
            {selectedUser && (
                <UserDetailModal
                    user={selectedUser}
                    meetingId={meetingId}
                    meetingStartTime={meetingStartTime}
                    meetingEndTime={meetingEndTime}
                    onClose={() => setSelectedUser(null)}
                />
            )}

            {/* User profile modal */}
            {profileUser && (
                <UserProfileModal
                    user={profileUser}
                    onClose={() => setProfileUser(null)}
                />
            )}
        </div>
    );
};

export default MeetingPresenceIVSS;
