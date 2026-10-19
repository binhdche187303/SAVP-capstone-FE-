import { AlertTriangle, Calendar, CheckCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, Info, LayoutGrid, List, MapPin, RefreshCw, Search, UserX, Users, X, XCircle } from 'lucide-react';
import { htmlToPlainText } from '../../utils/richText';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';


import {
    getPendingMeetingRequests,
    approveMeetingRequest,
    rejectMeetingRequest
} from '../../service/managerServices';
import { subscribeToMeetingRequestUpdates } from '../../utils/socket';

// Lịch tuần UEL: nhãn nhóm lịch của yêu cầu
const CALENDAR_TYPE_BADGES = {
    UNIT: { label: 'Lịch đơn vị', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    SCHOOL_LEADERSHIP: { label: 'Lịch lãnh đạo trường', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
    SCHOOL_OTHER: { label: 'Lịch hoạt động khác', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const CalendarTypeBadge = ({ type }) => {
    const b = CALENDAR_TYPE_BADGES[type];
    if (!b) return null;
    return <span className={`px-2 py-0.5 rounded border text-[10px] font-bold w-max ${b.cls}`}>{b.label}</span>;
};

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
};

/**
 * Mức độ xung đột PHÒNG (không tính xung đột người — xem
 * getParticipantConflictInfo, hiển thị bằng badge riêng).
 *
 * 'conflict'  — trùng với booking đã APPROVED/ACTIVE (đỏ, nghiêm trọng: nếu duyệt
 *               sẽ bị BE chặn ROOM_CONFLICT).
 * 'pending'   — trùng với 1 request PENDING khác (vàng/cam, chỉ cảnh báo mềm:
 *               Manager là người chọn duyệt cái nào, duyệt vẫn được).
 * 'none'      — không phát hiện trùng phòng.
 *
 * MKM-PCONF-01: trước đây `conflictCheckStatus === 'warning'` (= trùng NGƯỜI,
 * ghi lúc create()) cũng bị tính là 'conflict' nên card hiện badge đỏ "Bị trùng
 * lịch" y hệt trùng phòng — sai mức độ nghiêm trọng vì trùng người KHÔNG chặn
 * duyệt. 'blocked' thì vẫn giữ (đó là cờ trùng phòng ghi lúc approve()).
 */
const getRoomConflictLevel = (req) => {
    const hasRoomConflict = req.conflictDetails && req.conflictDetails.length > 0;
    if (hasRoomConflict || req.conflictCheckStatus === 'blocked') return 'conflict';
    if (req.pendingConflictDetails && req.pendingConflictDetails.length > 0) return 'pending';
    return 'none';
};

/**
 * MKM-PCONF-01 (2026-08-22) — xung đột NGƯỜI THAM DỰ.
 *
 * Khác xung đột PHÒNG (đỏ, BE chặn approve bằng ROOM_CONFLICT), xung đột
 * người CHỈ là cảnh báo mềm: Manager được phép duyệt CẢ HAI cuộc họp, người
 * tham dự tự sắp xếp. Vì vậy màn chi tiết phải đưa đủ dữ liệu để Manager tự
 * quyết (trùng với cuộc họp nào, ai trùng, có bắt buộc không) thay vì chỉ một
 * câu "trùng lịch với một hoặc nhiều người tham dự bắt buộc" như trước.
 *
 * `participantConflictDetails` là check TƯƠI từ BE. `conflictCheckStatus ===
 * 'warning'` là cờ cũ ghi lúc create() — giữ lại làm fallback để request tạo
 * trước khi có API mới vẫn hiện cảnh báo (dù không liệt kê được ai).
 */
const MEETING_STATUS_LABELS = {
    draft: 'Nháp',
    pending_approval: 'Chờ duyệt',
    scheduled: 'Đã lên lịch',
    in_progress: 'Đang diễn ra',
};

const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');

const getInitials = (name) => (name || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const getParticipantConflictInfo = (req) => {
    const details = Array.isArray(req?.participantConflictDetails) ? req.participantConflictDetails : [];
    // Cờ cũ: có trùng người nhưng BE chưa trả chi tiết (request tạo trước API mới).
    const legacyOnly = details.length === 0 && req?.conflictCheckStatus === 'warning';
    const summary = req?.participantConflictSummary || {
        conflictedUserCount: 0,
        requiredUserCount: 0,
        meetingCount: details.length,
    };
    return {
        details,
        summary,
        legacyOnly,
        hasConflict: details.length > 0 || legacyOnly,
    };
};

/** Thẻ mô tả 1 cuộc họp đang chiếm người — dùng chung modal chi tiết & modal duyệt. */
const ConflictMeetingCard = ({ meeting, compact = false }) => (
    <div className={`bg-white/70 rounded-lg border border-amber-200 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-midnight-indigo text-xs leading-snug">
                {meeting.meetingTitle || 'Cuộc họp khác'}
            </span>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                {MEETING_STATUS_LABELS[meeting.meetingStatus] || meeting.meetingStatus || 'Khác'}
            </span>
        </div>
        {meeting.meetingCode && (
            <span className="block mt-0.5 text-[9.5px] font-mono font-bold text-amber-700/80">#{meeting.meetingCode}</span>
        )}
        <div className={`mt-1.5 grid ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-x-3 gap-y-1 text-[10.5px] text-amber-900/90`}>
            <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3 h-3 shrink-0 opacity-70" />
                {fmtDate(meeting.startTime)} · {fmtTime(meeting.startTime)} - {fmtTime(meeting.endTime)}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0 opacity-70" />
                {meeting.roomName || 'Chưa gán phòng'}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <Users className="w-3 h-3 shrink-0 opacity-70" />
                Chủ trì: {meeting.hostName || 'Không rõ'}
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold">
                <UserX className="w-3 h-3 shrink-0 opacity-70" />
                {meeting.participants?.length || 0} người bị trùng
            </span>
        </div>
    </div>
);

/**
 * Panel cảnh báo trùng người ở modal Chi tiết yêu cầu.
 * Chỉ DANH SÁCH NGƯỜI có thanh cuộn riêng (max-h) — modal chi tiết không bị
 * dài thêm khi cuộc họp có hàng chục người trùng.
 */
const ParticipantConflictPanel = ({ info }) => {
    const { details, summary, legacyOnly } = info;
    const [meetingFilter, setMeetingFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [requiredOnly, setRequiredOnly] = useState(false);

    // 1 dòng / (người × cuộc họp gây trùng) — 1 người bận ở 2 cuộc họp khác
    // nhau thì hiện 2 dòng, mỗi dòng nói rõ đang bận ở đâu.
    const rows = useMemo(
        () => details.flatMap((m) => (m.participants || []).map((p) => ({ ...p, meeting: m }))),
        [details],
    );

    const filteredRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (meetingFilter !== 'all' && r.meeting.meetingId !== meetingFilter) return false;
            if (requiredOnly && !r.isRequired) return false;
            if (!q) return true;
            return [r.fullName, r.email, r.employeeCode, r.departmentName]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [rows, query, meetingFilter, requiredOnly]);

    if (legacyOnly) {
        return (
            <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                <div className="text-xs space-y-1">
                    <p className="font-bold">Cảnh báo trùng lịch người tham dự</p>
                    <p className="leading-relaxed opacity-90">
                        Khung giờ này trùng lịch với một hoặc nhiều người tham dự. Yêu cầu được tạo trước khi hệ thống
                        lưu chi tiết nên không liệt kê được danh sách — bạn vẫn có thể duyệt bình thường.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 space-y-3">
            <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                <div className="text-xs space-y-1 flex-1">
                    <p className="font-bold">Cảnh báo trùng lịch người tham dự</p>
                    <p className="opacity-90 leading-relaxed">
                        <strong>{summary.conflictedUserCount}</strong> người tham dự của cuộc họp này đang bận ở{' '}
                        <strong>{summary.meetingCount}</strong> cuộc họp khác trong khung giờ được yêu cầu
                        {summary.requiredUserCount > 0 && (
                            <> — trong đó <strong>{summary.requiredUserCount}</strong> người thuộc diện bắt buộc</>
                        )}.
                    </p>
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-800/90 bg-amber-100/60 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>
                            Đây chỉ là <strong>cảnh báo mềm</strong>, không chặn phê duyệt. Bạn vẫn có thể duyệt cả hai
                            cuộc họp — người tham dự sẽ tự sắp xếp hoặc cử người thay.
                        </span>
                    </p>
                </div>
            </div>

            {/* Thông tin đầy đủ của các cuộc họp gây trùng */}
            <div className="space-y-1.5">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Cuộc họp gây trùng ({details.length})
                </h5>
                <div className="space-y-1.5">
                    {details.map((m) => (
                        <ConflictMeetingCard key={m.meetingId} meeting={m} />
                    ))}
                </div>
            </div>

            {/* Danh sách người — có filter + vùng cuộn RIÊNG */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Người bị trùng lịch ({filteredRows.length}/{rows.length})
                    </h5>
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Lọc theo tên, email, mã NV, phòng ban..."
                            className="w-56 pl-8 pr-2.5 py-1.5 rounded-lg border border-amber-200 bg-white/80 text-[11px] text-midnight-indigo placeholder:text-amber-500/70 focus:outline-none focus:border-amber-400"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setMeetingFilter('all')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${meetingFilter === 'all'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white/70 text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                    >
                        Tất cả ({rows.length})
                    </button>
                    {details.map((m) => (
                        <button
                            key={m.meetingId}
                            type="button"
                            onClick={() => setMeetingFilter(m.meetingId)}
                            title={m.meetingTitle || 'Cuộc họp khác'}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border max-w-[14rem] truncate transition-colors ${meetingFilter === m.meetingId
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white/70 text-amber-800 border-amber-200 hover:bg-amber-100'
                                }`}
                        >
                            {m.meetingTitle || 'Cuộc họp khác'} ({m.participants?.length || 0})
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setRequiredOnly((v) => !v)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${requiredOnly
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white/70 text-rose-700 border-rose-200 hover:bg-rose-50'
                            }`}
                    >
                        Chỉ người bắt buộc
                    </button>
                </div>

                {/* CHỈ vùng này cuộn — modal chi tiết giữ nguyên chiều cao */}
                <div className="max-h-52 overflow-y-auto rounded-lg border border-amber-200 bg-white/60 divide-y divide-amber-100">
                    {filteredRows.length === 0 ? (
                        <p className="px-3 py-6 text-[11px] text-center text-amber-700/80">
                            Không có người nào khớp bộ lọc.
                        </p>
                    ) : (
                        filteredRows.map((r) => (
                            <div key={`${r.meeting.meetingId}-${r.userId}`} className="flex items-start gap-2.5 px-3 py-2">
                                <div className="w-7 h-7 shrink-0 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[10px] font-extrabold text-amber-700 overflow-hidden">
                                    {r.avatarUrl
                                        ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                                        : getInitials(r.fullName)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[11.5px] font-bold text-midnight-indigo truncate">
                                            {r.fullName || 'Không rõ tên'}
                                        </span>
                                        {r.isRequired && (
                                            <span className="px-1.5 py-px rounded text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                                Bắt buộc
                                            </span>
                                        )}
                                        {r.conflictingRole === 'host' && (
                                            <span className="px-1.5 py-px rounded text-[9px] font-bold bg-blue-50 text-action-blue border border-blue-200">
                                                Chủ trì bên kia
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-blue truncate">
                                        {[r.employeeCode, r.departmentName, r.email].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                    <p className="text-[10px] text-amber-700 truncate">
                                        Bận ở: <strong>{r.meeting.meetingTitle || 'Cuộc họp khác'}</strong>{' '}
                                        ({fmtTime(r.meeting.startTime)} - {fmtTime(r.meeting.endTime)}
                                        {r.meeting.roomName ? ` · ${r.meeting.roomName}` : ''})
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const MeetingApprovals = () => {


    // List & pagination states
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    // View state
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    // Filter states
    const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'expired' | 'all'
    const [searchQuery, setSearchQuery] = useState('');
    const [searchVal, setSearchVal] = useState(''); // Triggered on search submit
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const limit = 10;

    // Modal states
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [approvalModalOpen, setApprovalModalOpen] = useState(false);
    const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
    const [decisionNote, setDecisionNote] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [submittingAction, setSubmittingAction] = useState(false);
    // MKM-PCONF-01: Manager phải tick chấp nhận trước khi duyệt 1 yêu cầu
    // trùng lịch NGƯỜI (trùng phòng thì BE chặn thẳng, không cần tick).
    const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

    // Fetch meeting requests
    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                approvalStatus: statusFilter === 'all' ? 'all' : statusFilter,
                page: currentPage,
                limit: limit,
                q: searchVal.trim() || undefined,
                from: fromDate || undefined,
                to: toDate || undefined
            };
            const res = await getPendingMeetingRequests(params);
            if (res?.success) {
                const dataItems = Array.isArray(res.data) ? res.data : (res.data?.items || []);
                setRequests(dataItems);

                // Read pagination meta
                const meta = res.meta || res.data?.meta;
                if (meta) {
                    setTotalPages(meta.totalPages || Math.ceil((meta.total || 0) / limit) || 1);
                    setTotalCount(meta.total || 0);
                } else {
                    setTotalPages(1);
                    setTotalCount(dataItems.length);
                }
            } else {
                setRequests([]);
                setError(res?.message || 'Không thể tải danh sách yêu cầu.');
            }
        } catch (err) {
            setRequests([]);
            setError(err?.error?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, currentPage, searchVal, fromDate, toDate]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    // Realtime: BE bắn `meeting_request.updated` khi có yêu cầu mới/được
    // duyệt/từ chối/hết hạn (room user:{userId}, chỉ join được nếu có quyền
    // meeting_request.read). Dùng ref để giữ fetchRequests mới nhất mà không
    // phải subscribe/unsubscribe lại mỗi khi filter đổi.
    const fetchRequestsRef = useRef(fetchRequests);
    fetchRequestsRef.current = fetchRequests;

    useEffect(() => {
        const unsubscribe = subscribeToMeetingRequestUpdates(() => {
            fetchRequestsRef.current();
        });
        return unsubscribe;
    }, []);

    // Mỗi lần mở/đổi yêu cầu trong modal duyệt phải tick lại từ đầu.
    useEffect(() => {
        setConflictAcknowledged(false);
    }, [approvalModalOpen, selectedRequest?.id]);

    // Close toast messages
    useEffect(() => {
        if (successMsg) {
            const t = setTimeout(() => setSuccessMsg(null), 4000);
            return () => clearTimeout(t);
        }
    }, [successMsg]);

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);

    // Handle tab change
    const handleTabChange = (status) => {
        setStatusFilter(status);
        setCurrentPage(1); // Reset page on tab change
    };

    // Apply Search
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearchVal(searchQuery);
        setCurrentPage(1);
    };

    // Reset Filters
    const handleResetFilters = () => {
        setSearchQuery('');
        setSearchVal('');
        setFromDate('');
        setToDate('');
        setCurrentPage(1);
    };

    // BE PermissionsGuard trả error.code === 'FORBIDDEN' khi thiếu quyền
    // (meeting_request.approve/reject) — tách riêng để không nhầm với lỗi hệ thống thật.
    const getActionErrorMessage = (err, fallback) => {
        if (err?.error?.code === 'FORBIDDEN') {
            return 'Bạn chưa có quyền thực hiện thao tác này. Vui lòng liên hệ quản trị viên hệ thống để được cấp quyền.';
        }
        return err?.error?.message || err?.message || fallback;
    };

    // Actions
    const handleApprove = async () => {
        if (!selectedRequest) return;
        setSubmittingAction(true);
        setError(null);
        try {
            const res = await approveMeetingRequest(selectedRequest.id, decisionNote);
            if (res?.success) {
                setSuccessMsg('Phê duyệt yêu cầu đặt phòng họp thành công!');
                setApprovalModalOpen(false);
                setDetailModalOpen(false);
                setDecisionNote('');
                setConflictAcknowledged(false);
                setSelectedRequest(null);
                fetchRequests();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Thao tác phê duyệt thất bại.');
            }
        } catch (err) {
            setError(getActionErrorMessage(err, 'Thao tác phê duyệt thất bại, vui lòng thử lại.'));
        } finally {
            setSubmittingAction(false);
        }
    };

    const handleReject = async () => {
        if (!selectedRequest) return;
        if (!rejectionReason.trim()) {
            setError('Lý do từ chối là bắt buộc.');
            return;
        }
        setSubmittingAction(true);
        setError(null);
        try {
            const res = await rejectMeetingRequest(selectedRequest.id, rejectionReason);
            if (res?.success) {
                setSuccessMsg('Đã từ chối yêu cầu đặt phòng họp.');
                setRejectionModalOpen(false);
                setDetailModalOpen(false);
                setRejectionReason('');
                setSelectedRequest(null);
                fetchRequests();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Thao tác từ chối thất bại.');
            }
        } catch (err) {
            setError(getActionErrorMessage(err, 'Thao tác từ chối thất bại, vui lòng thử lại.'));
        } finally {
            setSubmittingAction(false);
        }
    };

    // Format durations
    const formatDuration = (start, end) => {
        if (!start || !end) return '';
        const durationMs = new Date(end) - new Date(start);
        const mins = Math.floor(durationMs / 60000);
        const hours = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        if (hours > 0) {
            return `${hours} giờ ${remainingMins > 0 ? `${remainingMins} phút` : ''}`;
        }
        return `${mins} phút`;
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-platinum-tint pb-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Phê duyệt
                    </span>
                    <h1 className="text-xl md:text-2xl font-extrabold text-midnight-indigo leading-tight">
                        Phê duyệt cuộc họp
                    </h1>
                    <p className="text-xs text-slate-blue mt-1 leading-relaxed">
                        Danh sách đầy đủ và chi tiết các yêu cầu phê duyệt đặt phòng họp của phòng ban.
                    </p>
                </div>
                <button
                    onClick={() => fetchRequests()}
                    className="p-2.5 bg-white border border-platinum-tint hover:bg-cloud-mist rounded-xl text-slate-blue hover:text-midnight-indigo transition-all shadow-sm flex items-center justify-center gap-2 text-xs font-bold self-stretch sm:self-auto shrink-0"
                >
                    <RefreshCw className="w-4 h-4" /> Tải lại danh sách
                </button>
            </div>

            {/* Toasts / Alert Messages */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center justify-between shadow-sm animate-pulse-soft"
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            <span className="font-semibold">{successMsg}</span>
                        </div>
                        <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 font-bold hover:text-emerald-700 p-1">✕</button>
                    </motion.div>
                )}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center justify-between shadow-sm"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <span className="font-semibold">{error}</span>
                        </div>
                        <button onClick={() => setError(null)} className="text-rose-500 font-bold hover:text-rose-700 p-1">✕</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Filters panel */}
            <motion.div variants={itemVariants} className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-1">
                        {/* Search keyword */}
                        <div className="relative">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Từ khóa tìm kiếm</label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-blue/60" />
                                <input
                                    type="text"
                                    placeholder="Tên cuộc họp, người tạo..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-medium"
                                />
                            </div>
                        </div>

                        {/* From Date */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Từ ngày</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="w-full px-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-medium"
                            />
                        </div>

                        {/* To Date */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Đến ngày</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="w-full px-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-medium"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2.5 justify-end shrink-0">
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            className="px-4 py-2 border border-platinum-tint hover:bg-cloud-mist rounded-xl text-xs font-bold text-slate-blue transition-all"
                        >
                            Đặt lại bộ lọc
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 bg-action-blue hover:bg-action-blue/90 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                            <Search className="w-3.5 h-3.5" /> Tìm kiếm
                        </button>
                    </div>
                </form>
            </motion.div>

            {/* Status tabs */}
            <motion.div variants={itemVariants} className="flex border-b border-platinum-tint gap-1 bg-white p-1 rounded-xl border border-platinum-tint/80 shadow-sm w-max">
                {[
                    { key: 'pending', label: 'Chờ phê duyệt' },
                    { key: 'approved', label: 'Đã phê duyệt' },
                    { key: 'rejected', label: 'Đã từ chối' },
                    { key: 'expired', label: 'Hết hạn' },
                    { key: 'all', label: 'Tất cả yêu cầu' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === tab.key
                            ? 'bg-action-blue text-white shadow-sm'
                            : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </motion.div>

            {/* View Mode Toggle */}
            <motion.div variants={itemVariants} className="flex justify-end mb-2">
                <div className="flex bg-cloud-mist/30 p-1 rounded-xl border border-platinum-tint shadow-sm">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'grid'
                            ? 'bg-white text-action-blue shadow-sm'
                            : 'text-slate-blue hover:text-midnight-indigo hover:bg-white/50'
                            }`}
                    >
                        <LayoutGrid className="w-4 h-4" /> Grid
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'list'
                            ? 'bg-white text-action-blue shadow-sm'
                            : 'text-slate-blue hover:text-midnight-indigo hover:bg-white/50'
                            }`}
                    >
                        <List className="w-4 h-4" /> Danh sách
                    </button>
                </div>
            </motion.div>

            {/* Main Requests Container */}
            <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className={viewMode === 'list' ? 'overflow-x-auto' : ''}>
                    {loading ? (
                        <div className="p-16 flex flex-col items-center justify-center text-slate-blue gap-3">
                            <div className="w-9 h-9 border-3 border-action-blue border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold">Đang tải danh sách yêu cầu đặt lịch họp...</span>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="p-16 text-center text-slate-blue font-medium flex flex-col items-center gap-2.5">
                            <FileText className="w-10 h-10 text-platinum-tint" />
                            <span className="text-sm">Không tìm thấy yêu cầu đặt lịch họp nào phù hợp với bộ lọc hiện tại.</span>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-cloud-mist/10">
                            {requests.map(req => {
                                const conflictLevel = getRoomConflictLevel(req);
                                const participantInfo = getParticipantConflictInfo(req);
                                return (
                                    <div key={req.id} className="bg-white border border-platinum-tint/60 hover:border-action-blue/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 h-full">
                                        {/* Header: Request Code & Status */}
                                        <div className="flex justify-between items-start gap-2 border-b border-platinum-tint/40 pb-3">
                                            <div className="flex flex-col gap-1.5">
                                                <span className="font-mono text-[10px] font-extrabold text-action-blue bg-blue-50/50 px-2.5 py-0.5 rounded border border-blue-100 w-max tracking-wider">
                                                    #{req.requestCode}
                                                </span>
                                                <h4 className="font-bold text-sm text-midnight-indigo line-clamp-1" title={req.meeting?.title}>{req.meeting?.title || 'Đặt lịch phòng họp'}</h4>
                                                <CalendarTypeBadge type={req.meeting?.calendarType} />
                                            </div>
                                            <div className="flex shrink-0">
                                                {req.approvalStatus === 'pending' && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-wider">
                                                        Chờ duyệt
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'approved' && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wider">
                                                        Đã duyệt
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'rejected' && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider">
                                                        Từ chối
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'expired' && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-300 uppercase tracking-wider">
                                                        Hết hạn
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'cancelled' && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-200 uppercase tracking-wider">
                                                        Đã hủy
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Body: Info details */}
                                        <div className="flex flex-col gap-3 text-xs text-slate-blue flex-grow">
                                            <div className="flex items-start gap-2.5">
                                                <div className="w-6 h-6 rounded-full bg-cloud-mist/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Users className="w-3.5 h-3.5 text-slate-blue" />
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-midnight-indigo block">{req.requestedBy?.fullName || 'Nhân viên'}</span>
                                                    <span className="text-[10px] opacity-80">{req.requestedBy?.email}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-2.5">
                                                <div className="w-6 h-6 rounded-full bg-cloud-mist/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Info className="w-3.5 h-3.5 text-slate-blue" />
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-midnight-indigo block">{req.targetRoom?.roomName || 'N/A'}</span>
                                                    <span className="text-[10px] opacity-80">{req.targetRoom?.siteName || 'Khu vực'}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-2.5">
                                                <div className="w-6 h-6 rounded-full bg-cloud-mist/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-blue" />
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-midnight-indigo block">
                                                        {new Date(req.requestedStartTime).toLocaleDateString('vi-VN')}
                                                        {new Date(req.requestedStartTime).toLocaleDateString('vi-VN') !== new Date(req.requestedEndTime).toLocaleDateString('vi-VN') 
                                                            ? ` - ${new Date(req.requestedEndTime).toLocaleDateString('vi-VN')}` 
                                                            : ''}
                                                    </span>
                                                    <span className="text-[10px] font-medium mt-0.5 block text-slate-blue">
                                                        <Clock className="w-3 h-3 inline mr-1 opacity-70" />
                                                        {new Date(req.requestedStartTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(req.requestedEndTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer: Conflict Status & Actions */}
                                        <div className="mt-auto pt-3 border-t border-platinum-tint/40 flex items-center justify-between">
                                            <div>
                                                {conflictLevel === 'conflict' ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200" title="Bị trùng lịch">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" /> Bị trùng lịch
                                                    </span>
                                                ) : conflictLevel === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200" title="Trùng với yêu cầu khác đang chờ duyệt">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Trùng yêu cầu chờ duyệt
                                                    </span>
                                                ) : participantInfo.hasConflict ? null : (
                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Không trùng
                                                    </span>
                                                )}
                                                {/* MKM-PCONF-01: badge RIÊNG cho trùng người — 1 yêu cầu có thể
                                                    vừa trùng phòng vừa trùng người, không được nuốt mất cái nào. */}
                                                {participantInfo.hasConflict && (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200"
                                                        title="Có người tham dự bận ở cuộc họp khác — vẫn duyệt được"
                                                    >
                                                        <UserX className="w-3.5 h-3.5 text-amber-600" />
                                                        Trùng người{participantInfo.summary.conflictedUserCount > 0 ? ` (${participantInfo.summary.conflictedUserCount})` : ''}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        setSelectedRequest(req);
                                                        setDetailModalOpen(true);
                                                    }}
                                                    className="p-2 text-slate-blue hover:text-action-blue bg-cloud-mist/30 hover:bg-cloud-mist/80 rounded-lg transition-colors border border-transparent hover:border-platinum-tint/50"
                                                    title="Xem chi tiết"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>

                                                {req.approvalStatus === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setError(null);
                                                                setSelectedRequest(req);
                                                                setApprovalModalOpen(true);
                                                            }}
                                                            className="p-2 text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 rounded-lg transition-colors border border-emerald-100 hover:border-emerald-600 shadow-sm"
                                                            title="Phê duyệt"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setError(null);
                                                                setSelectedRequest(req);
                                                                setRejectionModalOpen(true);
                                                            }}
                                                            className="p-2 text-red-600 hover:text-white bg-red-50 hover:bg-red-600 rounded-lg transition-colors border border-red-100 hover:border-red-600 shadow-sm"
                                                            title="Từ chối"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="border-b border-platinum-tint bg-cloud-mist/20 text-xs font-bold text-slate-blue uppercase">
                                    <th className="p-4 w-32">Mã yêu cầu</th>
                                    <th className="p-4">Tiêu đề cuộc họp</th>
                                    <th className="p-4">Người tạo</th>
                                    <th className="p-4">Phòng họp</th>
                                    <th className="p-4">Thời gian họp</th>
                                    <th className="p-4 w-32">Độ trùng lịch</th>
                                    <th className="p-4 w-32">Trạng thái</th>
                                    <th className="p-4 text-right w-44">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map(req => {
                                    const conflictLevel = getRoomConflictLevel(req);
                                    const participantInfo = getParticipantConflictInfo(req);
                                    return (
                                        <tr key={req.id} className="border-b border-platinum-tint/60 text-sm hover:bg-cloud-mist/10 transition-colors">
                                            {/* Code */}
                                            <td className="p-4 font-mono text-xs text-midnight-indigo font-bold whitespace-nowrap">
                                                {req.requestCode}
                                            </td>

                                            {/* Title */}
                                            <td className="p-4 font-semibold text-midnight-indigo max-w-xs truncate" title={req.meeting?.title || 'Đăt lịch phòng họp'}>
                                                {req.meeting?.title || 'Đăt lịch phòng họp'}
                                                <div className="mt-1"><CalendarTypeBadge type={req.meeting?.calendarType} /></div>
                                            </td>

                                            {/* Requester */}
                                            <td className="p-4 text-slate-blue font-medium whitespace-nowrap">
                                                {req.requestedBy?.fullName || 'Nhân viên'}
                                                <span className="block text-[10px] opacity-75">{req.requestedBy?.email}</span>
                                            </td>

                                            {/* Room */}
                                            <td className="p-4 font-medium text-midnight-indigo whitespace-nowrap">
                                                {req.targetRoom?.roomName || 'N/A'}
                                                <span className="block text-[10px] text-slate-blue font-normal">{req.targetRoom?.siteName || 'Khu vực'}</span>
                                            </td>

                                            {/* Time */}
                                            <td className="p-4 text-xs text-slate-blue font-medium whitespace-nowrap">
                                                <span className="block font-bold text-midnight-indigo/90">
                                                    {new Date(req.requestedStartTime).toLocaleDateString('vi-VN')}
                                                    {new Date(req.requestedStartTime).toLocaleDateString('vi-VN') !== new Date(req.requestedEndTime).toLocaleDateString('vi-VN') 
                                                        ? ` - ${new Date(req.requestedEndTime).toLocaleDateString('vi-VN')}` 
                                                        : ''}
                                                </span>
                                                <span className="block text-[10px] mt-0.5 text-slate-blue font-semibold">
                                                    {new Date(req.requestedStartTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(req.requestedEndTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>

                                            {/* Conflict Indicator */}
                                            <td className="p-4 whitespace-nowrap">
                                                {conflictLevel === 'conflict' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                                                        <AlertTriangle className="w-3 h-3 text-red-600 animate-pulse" />
                                                        Bị trùng lịch
                                                    </span>
                                                ) : conflictLevel === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                        Trùng yêu cầu chờ duyệt
                                                    </span>
                                                ) : participantInfo.hasConflict ? null : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-250">
                                                        Không trùng
                                                    </span>
                                                )}
                                                {participantInfo.hasConflict && (
                                                    <span
                                                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"
                                                        title="Có người tham dự bận ở cuộc họp khác — vẫn duyệt được"
                                                    >
                                                        <UserX className="w-3 h-3 text-amber-600" />
                                                        Trùng người{participantInfo.summary.conflictedUserCount > 0 ? ` (${participantInfo.summary.conflictedUserCount})` : ''}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="p-4 whitespace-nowrap">
                                                {req.approvalStatus === 'pending' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-wider">
                                                        Chờ duyệt
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'approved' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wider">
                                                        Đã duyệt
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'rejected' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider">
                                                        Từ chối
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'expired' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-red-50 text-red-600 border border-red-300 uppercase tracking-wider">
                                                        Hết hạn
                                                    </span>
                                                )}
                                                {req.approvalStatus === 'cancelled' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-gray-50 text-gray-600 border border-gray-200 uppercase tracking-wider">
                                                        Đã hủy
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="p-4 text-right flex justify-end gap-1.5 items-center">
                                                {/* View Detail icon always */}
                                                <button
                                                    onClick={() => {
                                                        setSelectedRequest(req);
                                                        setDetailModalOpen(true);
                                                    }}
                                                    className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-cloud-mist/50 rounded-lg transition-colors"
                                                    title="Chi tiết yêu cầu"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>

                                                {req.approvalStatus === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setError(null);
                                                                setSelectedRequest(req);
                                                                setApprovalModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Phê duyệt"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setError(null);
                                                                setSelectedRequest(req);
                                                                setRejectionModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Từ chối"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="p-4 bg-cloud-mist/20 border-t border-platinum-tint flex items-center justify-between text-xs font-semibold text-slate-blue select-none">
                        <span>Hiển thị kết quả từ {((currentPage - 1) * limit) + 1} - {Math.min(currentPage * limit, totalCount)} trên {totalCount} yêu cầu</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 bg-white border border-platinum-tint rounded-lg flex items-center gap-1 hover:bg-cloud-mist hover:text-midnight-indigo disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-blue transition-all"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Trang trước
                            </button>
                            <span className="flex items-center px-2">Trang {currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 bg-white border border-platinum-tint rounded-lg flex items-center gap-1 hover:bg-cloud-mist hover:text-midnight-indigo disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-blue transition-all"
                            >
                                Trang sau <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* MODALS */}
            {/* 1. Detail Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {detailModalOpen && selectedRequest && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
                            >
                                {/* Modal Header */}
                                <div className="p-5 border-b border-platinum-tint flex justify-between items-center bg-cloud-mist/40 shrink-0">
                                    <div>
                                        <span className="text-[10px] font-mono font-extrabold text-action-blue tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-150">
                                            YÊU CẦU: {selectedRequest.requestCode}
                                        </span>
                                        <h3 className="text-base font-bold text-midnight-indigo mt-1">Chi tiết yêu cầu đặt phòng họp</h3>
                                    </div>
                                    <button
                                        onClick={() => setDetailModalOpen(false)}
                                        className="p-1 rounded-full text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/60 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Modal Content - Scrollable */}
                                <div className="p-6 overflow-y-auto space-y-6 text-left">
                                    {/* Basic Info Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 bg-cloud-mist/20 rounded-xl border border-platinum-tint/60 space-y-2">
                                            <h4 className="text-[11px] font-bold text-slate-blue uppercase tracking-wider">Thông tin chung cuộc họp</h4>
                                            <div className="text-xs space-y-1 text-midnight-indigo">
                                                <p className="font-semibold text-sm">{selectedRequest.meeting?.title || 'Cuộc họp nội bộ'}</p>
                                                {selectedRequest.meeting?.description && (
                                                    <p className="text-[11px] text-slate-blue italic line-clamp-2 mt-1">{htmlToPlainText(selectedRequest.meeting?.description)}</p>
                                                )}
                                                <p className="pt-1 flex items-center gap-1.5 text-slate-blue">
                                                    <Calendar className="w-3.5 h-3.5 text-action-blue" />
                                                    <span>Ngày {new Date(selectedRequest.requestedStartTime).toLocaleDateString('vi-VN')} {new Date(selectedRequest.requestedStartTime).toLocaleDateString('vi-VN') !== new Date(selectedRequest.requestedEndTime).toLocaleDateString('vi-VN') ? `- ${new Date(selectedRequest.requestedEndTime).toLocaleDateString('vi-VN')}` : ''}</span>
                                                </p>
                                                <p className="flex items-center gap-1.5 text-slate-blue">
                                                    <Clock className="w-3.5 h-3.5 text-action-blue" />
                                                    <span>
                                                        {new Date(selectedRequest.requestedStartTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedRequest.requestedEndTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ({formatDuration(selectedRequest.requestedStartTime, selectedRequest.requestedEndTime)})
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-cloud-mist/20 rounded-xl border border-platinum-tint/60 space-y-2">
                                            <h4 className="text-[11px] font-bold text-slate-blue uppercase tracking-wider">Phòng họp & Sức chứa</h4>
                                            <div className="text-xs space-y-1.5 text-midnight-indigo">
                                                <p className="font-bold text-sm text-action-blue">{selectedRequest.targetRoom?.roomName}</p>
                                                <p className="text-[11px] text-slate-blue">{selectedRequest.targetRoom?.siteName || 'Khu vực chính'}</p>
                                                <p className="font-semibold">Sức chứa tối đa: <span className="text-midnight-indigo font-bold">{selectedRequest.targetRoom?.capacity} người</span></p>
                                                <p className="text-[10px] text-slate-blue">Camera: {selectedRequest.targetRoom?.hasCamera ? 'Có' : 'Không'} • Micro: {selectedRequest.targetRoom?.hasMicrophone ? 'Có' : 'Không'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Requester Details */}
                                    <div className="p-4 bg-blue-50/10 rounded-xl border border-blue-100/60 space-y-2">
                                        <h4 className="text-[11px] font-bold text-action-blue uppercase tracking-wider">Người tạo yêu cầu</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-midnight-indigo">
                                            <p><strong className="text-slate-blue font-semibold">Họ tên:</strong> {selectedRequest.requestedBy?.fullName}</p>
                                            <p><strong className="text-slate-blue font-semibold">Hòm thư:</strong> {selectedRequest.requestedBy?.email}</p>
                                            {selectedRequest.requestedBy?.employeeCode && (
                                                <p><strong className="text-slate-blue font-semibold">Mã nhân viên:</strong> {selectedRequest.requestedBy?.employeeCode}</p>
                                            )}
                                            {selectedRequest.requestedBy?.department?.departmentName && (
                                                <p><strong className="text-slate-blue font-semibold">Phòng ban:</strong> {selectedRequest.requestedBy?.department?.departmentName}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Conflict Alerts */}
                                    {selectedRequest.approvalStatus === 'pending' && (() => {
                                        // Nhóm E: conflictDetails (check TƯƠI, luôn đáng tin cho xung đột
                                        // PHÒNG) là nguồn quyết định chính — conflictCheckStatus cũ chỉ còn
                                        // đúng cho xung đột PARTICIPANT (ghi lúc tạo), với xung đột phòng nó
                                        // luôn là 'clear' vì lần ghi duy nhất nằm trong transaction bị
                                        // rollback ở approve(). Dùng field sai sẽ khiến banner đỏ không bao
                                        // giờ hiện dù conflictDetails có dữ liệu thật.
                                        //
                                        // MKM-PCONF-01: 'warning' (= trùng NGƯỜI) KHÔNG còn kéo banner đỏ
                                        // "trùng phòng" nữa — nó có panel vàng riêng bên dưới với đầy đủ
                                        // cuộc họp + danh sách người.
                                        const hasRoomConflict = selectedRequest.conflictDetails && selectedRequest.conflictDetails.length > 0;
                                        const hasBlockedFlag = selectedRequest.conflictCheckStatus === 'blocked';
                                        // Nhóm F (2026-08-16): trùng với request PENDING khác (không phải booking
                                        // đã duyệt) — chỉ cảnh báo mềm, KHÔNG dùng chung banner đỏ với
                                        // hasRoomConflict để Manager không nhầm mức độ nghiêm trọng (duyệt vẫn
                                        // được, không bị BE chặn như trường hợp trùng booking đã APPROVED/ACTIVE).
                                        const hasPendingConflict = !hasRoomConflict && !hasBlockedFlag && selectedRequest.pendingConflictDetails && selectedRequest.pendingConflictDetails.length > 0;
                                        const showAlert = hasRoomConflict || hasBlockedFlag;
                                        const participantInfo = getParticipantConflictInfo(selectedRequest);
                                        return (
                                            <div className="space-y-3">
                                                <div className={`p-4 rounded-xl border flex gap-3 ${showAlert
                                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                                    : hasPendingConflict
                                                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                                                        : 'bg-emerald-50 border-emerald-250 text-emerald-800'
                                                    }`}>
                                                    <AlertTriangle className={`w-5 h-5 shrink-0 ${showAlert ? 'text-red-600 animate-pulse' : hasPendingConflict ? 'text-amber-600' : 'text-emerald-600'
                                                        }`} />
                                                    <div className="text-xs space-y-2 flex-1">
                                                        <p className="font-bold">
                                                            {showAlert ? 'Cảnh báo trùng lịch phòng họp!' : hasPendingConflict ? 'Trùng với yêu cầu khác đang chờ duyệt' : 'Phòng họp trống trong khung giờ này'}
                                                        </p>
                                                        {hasRoomConflict ? (
                                                            <div className="space-y-1.5">
                                                                <p className="opacity-90">Khung giờ này đã trùng với {selectedRequest.conflictDetails.length} cuộc họp khác đã được duyệt tại cùng phòng:</p>
                                                                <ul className="space-y-1">
                                                                    {selectedRequest.conflictDetails.map((c, idx) => (
                                                                        <li key={c.bookingId || idx} className="bg-white/60 rounded-lg px-2.5 py-1.5 border border-rose-100">
                                                                            <span className="font-semibold">{c.meetingTitle || 'Cuộc họp khác'}</span>
                                                                            {' — '}{c.roomName || 'phòng đã chọn'}
                                                                            {' · '}{fmtTime(c.startTime)}-{fmtTime(c.endTime)}
                                                                            {c.hostName ? ` · Chủ trì: ${c.hostName}` : ''}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                                <p className="opacity-80 italic">Vui lòng cân nhắc từ chối yêu cầu này hoặc yêu cầu khác cho phù hợp.</p>
                                                            </div>
                                                        ) : hasBlockedFlag ? (
                                                            <p className="leading-relaxed opacity-90">Lần duyệt trước đã bị hệ thống chặn vì trùng phòng. Vui lòng kiểm tra lại lịch phòng trước khi duyệt.</p>
                                                        ) : hasPendingConflict ? (
                                                            <div className="space-y-1.5">
                                                                <p className="opacity-90">Khung giờ này đang trùng với {selectedRequest.pendingConflictDetails.length} yêu cầu khác cũng đang chờ duyệt tại cùng phòng — chưa có booking nào được duyệt nên hệ thống KHÔNG chặn bạn duyệt, nhưng chỉ 1 trong các yêu cầu này nên được giữ phòng:</p>
                                                                <ul className="space-y-1">
                                                                    {selectedRequest.pendingConflictDetails.map((c, idx) => (
                                                                        <li key={c.bookingId || idx} className="bg-white/60 rounded-lg px-2.5 py-1.5 border border-amber-100">
                                                                            <span className="font-semibold">{c.meetingTitle || 'Cuộc họp khác'}</span>
                                                                            {' — '}{c.roomName || 'phòng đã chọn'}
                                                                            {' · '}{fmtTime(c.startTime)}-{fmtTime(c.endTime)}
                                                                            {c.hostName ? ` · Chủ trì: ${c.hostName}` : ''}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                                <p className="opacity-80 italic">Nếu bạn duyệt yêu cầu này, các yêu cầu PENDING trùng giờ ở trên sẽ không tự động bị từ chối — khi có người duyệt tiếp yêu cầu đó, hệ thống sẽ báo lỗi trùng phòng (ROOM_CONFLICT) và cần từ chối thủ công.</p>
                                                            </div>
                                                        ) : (
                                                            <p className="leading-relaxed opacity-90">Không phát hiện bất kì lịch họp trùng nào cho phòng họp này trong khung giờ được yêu cầu.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* MKM-PCONF-01 — xung đột NGƯỜI: panel riêng, đầy đủ thông tin
                                                    cuộc họp gây trùng + danh sách người (lọc được, cuộn riêng). */}
                                                {participantInfo.hasConflict ? (
                                                    <ParticipantConflictPanel info={participantInfo} />
                                                ) : (
                                                    <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-250 text-emerald-800 flex gap-3">
                                                        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                                                        <div className="text-xs space-y-1">
                                                            <p className="font-bold">Người tham dự đều rảnh trong khung giờ này</p>
                                                            <p className="leading-relaxed opacity-90">Không có người tham dự nào của cuộc họp đang bận ở một cuộc họp khác.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Approval/Rejection Log (For approved/rejected status) */}
                                    {selectedRequest.approvalStatus !== 'pending' && (
                                        <div className={`p-4 rounded-xl border space-y-2 ${selectedRequest.approvalStatus === 'approved'
                                            ? 'bg-emerald-50/20 border-emerald-100 text-emerald-850'
                                            : selectedRequest.approvalStatus === 'rejected'
                                                ? 'bg-rose-50/20 border-rose-100 text-rose-850'
                                                : selectedRequest.approvalStatus === 'expired'
                                                    ? 'bg-red-50/40 border-red-200 text-red-800'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                            }`}>
                                            <h4 className="text-[11px] font-bold uppercase tracking-wider">
                                                Lịch sử xét duyệt ({{ approved: 'Đã duyệt', rejected: 'Đã từ chối', expired: 'Hết hạn', cancelled: 'Đã hủy' }[selectedRequest.approvalStatus] || selectedRequest.approvalStatus})
                                            </h4>
                                            <div className="text-xs space-y-1 text-midnight-indigo">
                                                {selectedRequest.decisionDate && (
                                                    <p><strong className="opacity-75">Ngày xử lý:</strong> {new Date(selectedRequest.decisionDate).toLocaleString('vi-VN')}</p>
                                                )}
                                                {selectedRequest.approvedBy?.fullName && (
                                                    <p><strong className="opacity-75">Người xử lý:</strong> {selectedRequest.approvedBy?.fullName}</p>
                                                )}
                                                {selectedRequest.approvalStatus === 'approved' && selectedRequest.decisionNote && (
                                                    <p className="bg-white/60 p-2.5 rounded-lg mt-1 border border-emerald-100/50"><strong className="opacity-80">Ghi chú duyệt:</strong> {selectedRequest.decisionNote}</p>
                                                )}
                                                {selectedRequest.approvalStatus === 'expired' && (
                                                    <p className="bg-white/60 p-2.5 rounded-lg mt-1 border border-red-100">Yêu cầu không được duyệt trước giờ họp nên đã tự hết hạn.</p>
                                                )}
                                                {selectedRequest.approvalStatus === 'rejected' && selectedRequest.rejectionReason && (
                                                    <p className="bg-white/60 p-2.5 rounded-lg mt-1 border border-rose-100/50"><strong className="opacity-80">Lý do từ chối:</strong> {selectedRequest.rejectionReason}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-4 border-t border-platinum-tint bg-cloud-mist/20 flex justify-end gap-2.5 shrink-0">
                                    <button
                                        onClick={() => setDetailModalOpen(false)}
                                        className="px-4 py-2 border border-platinum-tint hover:bg-cloud-mist text-xs font-bold text-midnight-indigo rounded-xl transition-all"
                                    >
                                        Đóng
                                    </button>

                                    {selectedRequest.approvalStatus === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => { setError(null); setRejectionModalOpen(true); }}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                                            >
                                                <XCircle className="w-4 h-4" /> Từ chối yêu cầu
                                            </button>
                                            <button
                                                onClick={() => { setError(null); setApprovalModalOpen(true); }}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Phê duyệt yêu cầu
                                            </button>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 2. Approve Confirmation Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {approvalModalOpen && selectedRequest && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-lg w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
                            >
                                <h3 className="text-base font-bold text-midnight-indigo mb-2">Xác nhận phê duyệt đặt phòng</h3>
                                <p className="text-xs text-slate-blue mb-4 leading-relaxed">
                                    Bạn chuẩn bị phê duyệt yêu cầu <strong className="text-midnight-indigo font-mono">{selectedRequest.requestCode}</strong> cho cuộc họp <strong>"{selectedRequest.meeting?.title}"</strong>.
                                </p>

                                {/* MKM-PCONF-01 — trùng NGƯỜI không chặn duyệt, nhưng Manager phải
                                    thấy rõ đang duyệt chồng lên cuộc họp nào rồi mới xác nhận. Chi
                                    tiết từng người xem ở modal Chi tiết yêu cầu (có filter + cuộn). */}
                                {(() => {
                                    const participantInfo = getParticipantConflictInfo(selectedRequest);
                                    if (!participantInfo.hasConflict) return null;
                                    const { details, summary, legacyOnly } = participantInfo;
                                    return (
                                        <div className="mb-4 p-3.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 space-y-2.5 text-left">
                                            <div className="flex gap-2.5">
                                                <AlertTriangle className="w-[18px] h-[18px] shrink-0 text-amber-600 mt-px" />
                                                <div className="text-xs space-y-1">
                                                    <p className="font-bold">Cuộc họp này trùng lịch người tham dự</p>
                                                    {legacyOnly ? (
                                                        <p className="opacity-90 leading-relaxed">
                                                            Có người tham dự đang bận ở một cuộc họp khác trong khung giờ này.
                                                        </p>
                                                    ) : (
                                                        <p className="opacity-90 leading-relaxed">
                                                            <strong>{summary.conflictedUserCount}</strong> người tham dự đang bận ở{' '}
                                                            <strong>{summary.meetingCount}</strong> cuộc họp khác
                                                            {summary.requiredUserCount > 0 && (
                                                                <> (<strong>{summary.requiredUserCount}</strong> người bắt buộc)</>
                                                            )}.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {details.length > 0 && (
                                                <div className="space-y-1.5">
                                                    {details.map((m) => (
                                                        <ConflictMeetingCard key={m.meetingId} meeting={m} compact />
                                                    ))}
                                                </div>
                                            )}

                                            <p className="text-[11px] leading-relaxed bg-amber-100/60 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                                Hệ thống <strong>vẫn cho phép duyệt cả hai cuộc họp</strong> — trùng người không
                                                chặn phê duyệt. Danh sách chi tiết từng người bị trùng xem ở màn{' '}
                                                <strong>Chi tiết yêu cầu đặt phòng</strong>.
                                            </p>

                                            <label className="flex items-start gap-2 text-[11px] font-semibold cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={conflictAcknowledged}
                                                    onChange={(e) => setConflictAcknowledged(e.target.checked)}
                                                    className="mt-0.5 w-3.5 h-3.5 accent-amber-600 shrink-0"
                                                />
                                                <span>Tôi đã xem và chấp nhận duyệt dù có trùng lịch người tham dự.</span>
                                            </label>
                                        </div>
                                    );
                                })()}

                                {error && (
                                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                <div className="space-y-4 text-left">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Ghi chú phê duyệt (Tùy chọn)</label>
                                        <textarea
                                            value={decisionNote}
                                            onChange={(e) => setDecisionNote(e.target.value)}
                                            rows={3}
                                            placeholder="Nhập ghi chú phê duyệt gửi tới người yêu cầu..."
                                            className="w-full p-3 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2.5 pt-2 border-t border-platinum-tint/40">
                                        <button
                                            onClick={() => {
                                                setApprovalModalOpen(false);
                                                setDecisionNote('');
                                                setConflictAcknowledged(false);
                                            }}
                                            className="px-4 py-2 border border-platinum-tint hover:bg-cloud-mist rounded-xl text-xs font-bold text-slate-blue transition-colors"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={handleApprove}
                                            disabled={submittingAction || (getParticipantConflictInfo(selectedRequest).hasConflict && !conflictAcknowledged)}
                                            title={getParticipantConflictInfo(selectedRequest).hasConflict && !conflictAcknowledged ? 'Vui lòng tích xác nhận chấp nhận trùng lịch người tham dự' : undefined}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                                        >
                                            {submittingAction && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                            Xác nhận phê duyệt
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 3. Reject Confirmation Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {rejectionModalOpen && selectedRequest && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-lg w-full max-w-md p-6"
                            >
                                <h3 className="text-base font-bold text-red-600 mb-2">Từ chối yêu cầu đặt phòng</h3>
                                <p className="text-xs text-slate-blue mb-4 leading-relaxed">
                                    Vui lòng nhập lý do từ chối cụ thể cho yêu cầu <strong className="text-midnight-indigo font-mono">{selectedRequest.requestCode}</strong>.
                                </p>

                                {error && (
                                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                <div className="space-y-4 text-left">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Lý do từ chối (Bắt buộc)</label>
                                        <textarea
                                            value={rejectionReason}
                                            onChange={(e) => setRejectionReason(e.target.value)}
                                            rows={3}
                                            placeholder="Nhập lý do từ chối..."
                                            className="w-full p-3 border border-red-200 focus:border-red-500 rounded-xl text-xs focus:outline-none text-midnight-indigo font-medium"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2.5 pt-2 border-t border-platinum-tint/40">
                                        <button
                                            onClick={() => {
                                                setRejectionModalOpen(false);
                                                setRejectionReason('');
                                            }}
                                            className="px-4 py-2 border border-platinum-tint hover:bg-cloud-mist rounded-xl text-xs font-bold text-slate-blue transition-colors"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={handleReject}
                                            disabled={submittingAction || !rejectionReason.trim()}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-750 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                                        >
                                            {submittingAction && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                            Xác nhận từ chối
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </motion.div>
    );
};

export default MeetingApprovals;
