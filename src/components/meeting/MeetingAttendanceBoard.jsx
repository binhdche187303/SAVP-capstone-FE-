import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Clock, CheckCircle, AlertTriangle, AlertCircle, XCircle, Edit3, Save, X, RotateCcw
} from 'lucide-react';
import UserAvatar from '../common/UserAvatar';
import {
    getMeetingAttendance,
    updateAttendanceStatus,
    invalidateAttendanceRecord,
    manualAttendanceCheckIn,
    submitAttendanceExcuse,
    reviewAttendanceExcuse
} from '../../service/managerServices';
import { getSocket, subscribeToMeeting } from '../../utils/socket';

const CHECK_IN_METHOD_MAP = {
    door_camera: 'Nhận diện khuôn mặt',
    room_camera: 'Camera trong phòng',
    manual:      'Điểm danh thủ công',
    qr:          'Quét mã QR',
    system:      'Hệ thống',
};

const ATTENDANCE_SOURCE_MAP = {
    manual:            'Thủ công',
    camera:            'Camera AI',
    presence_snapshot: 'Ảnh chụp hiện diện',
    mixed:             'Kết hợp nhiều nguồn',
};

const EXCUSE_STATUS_MAP = {
    pending:  { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700' },
    approved: { label: 'Đã duyệt', cls: 'bg-emerald-50 text-emerald-700' },
    rejected: { label: 'Bị từ chối', cls: 'bg-rose-50 text-rose-700' },
};

const getMyUserId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id || null; } catch { return null; }
};

const MeetingAttendanceBoard = ({ meetingId }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorCode, setErrorCode] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [attendanceData, setAttendanceData] = useState(null);

    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [editingRecord, setEditingRecord] = useState(null);
    const [invalidateRecord, setInvalidateRecord] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    // { mode: 'submit' | 'review', item, text, approve }
    const [excuseModal, setExcuseModal] = useState(null);
    const myUserId = getMyUserId();

    // Filtered internal items, as API pagination might not be fully working or we just want local search
    // But we will use the API pagination pattern
    const fetchAttendance = useCallback(async () => {
        setLoading(true);
        setError(null);
        setErrorCode(null);
        try {
            const params = {
                page,
                pageSize,
                ...(search && { search }),
                ...(statusFilter && { status: statusFilter })
            };
            const res = await getMeetingAttendance(meetingId, params);
            if (res?.success) {
                setAttendanceData(res.data);
            } else {
                throw new Error(res?.message || 'Không thể tải dữ liệu điểm danh.');
            }
        } catch (err) {
            const code = err?.error?.code || 'UNKNOWN_ERROR';
            const msg = err?.error?.message || err?.message || 'Lỗi hệ thống khi tải điểm danh.';
            setError(msg);
            setErrorCode(code);
        } finally {
            setLoading(false);
        }
    }, [meetingId, page, pageSize, search, statusFilter]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    // [FIX 2026-08-16] Điểm danh mới qua Face Terminal (meeting.attendance.updated,
    // BE emit tại face-attendance.service.ts) → tự refetch bảng điểm danh, KHÔNG cần F5.
    // Payload BE chỉ tối thiểu {meetingId, userId, attendanceStatus, checkInTime} — không
    // đủ để patch trực tiếp 1 dòng (thiếu fullName/avatarUrl/...), nên refetch nguyên trang
    // hiện tại là cách an toàn nhất, mirror đúng pattern subscribeToMeeting đã dùng ở
    // InMeetingRoom.jsx (join/leave room qua meeting:subscribe, KHÔNG tự nghĩ cách mới).
    useEffect(() => {
        if (!meetingId) return;
        const cleanup = subscribeToMeeting(meetingId);
        const s = getSocket();
        const onAttendanceUpdated = (payload) => {
            if (payload?.meetingId && payload.meetingId !== meetingId) return;
            fetchAttendance();
        };
        s.on('meeting.attendance.updated', onAttendanceUpdated);
        return () => {
            s.off('meeting.attendance.updated', onAttendanceUpdated);
            cleanup();
        };
    }, [meetingId, fetchAttendance]);

    // Auto-hide success
    useEffect(() => {
        if (successMsg) {
            const timer = setTimeout(() => setSuccessMsg(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMsg]);

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            let res;
            if (editingRecord.attendanceStatus === 'not_checked_in' || !editingRecord.id) {
                // If not checked in yet, we must create a manual check-in record
                res = await manualAttendanceCheckIn(meetingId, { 
                    userId: editingRecord.userId,
                    checkInTime: new Date().toISOString()
                });
            } else {
                // If record exists, update the status using its record ID
                if (editingRecord.newStatus === 'left_early' && !editingRecord.note?.trim()) {
                    throw new Error('Vui lòng nhập ghi chú khi ghi nhận Về sớm.');
                }
                res = await updateAttendanceStatus(meetingId, editingRecord.id, { 
                    attendanceStatus: editingRecord.newStatus,
                    ...(editingRecord.note?.trim() ? { reason: editingRecord.note.trim() } : {}),
                });
            }
            if (res?.success) {
                setSuccessMsg('Đã cập nhật trạng thái điểm danh.');
                setEditingRecord(null);
                fetchAttendance();
            } else {
                throw new Error(res?.message || 'Không thể cập nhật trạng thái.');
            }
        } catch (err) {
            setError(err.message || 'Có lỗi xảy ra khi cập nhật.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExcuse = async () => {
        const { mode, item, text, approve } = excuseModal;
        const value = (text || '').trim();
        if (mode === 'submit' && value.length < 5) {
            setError('Lý do phải có ít nhất 5 ký tự.');
            return;
        }
        if (mode === 'review' && !approve && value.length < 3) {
            setError('Vui lòng nhập lý do từ chối.');
            return;
        }
        setIsSaving(true);
        try {
            const res = mode === 'submit'
                ? await submitAttendanceExcuse(meetingId, { reason: value })
                : await reviewAttendanceExcuse(meetingId, item.userId, { approve, ...(value ? { note: value } : {}) });
            if (!res?.success) throw new Error(res?.message || 'Không thể xử lý lý do.');
            setSuccessMsg(res.message || 'Đã cập nhật lý do.');
            setExcuseModal(null);
            fetchAttendance();
        } catch (err) {
            setError(err.message || 'Có lỗi xảy ra.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInvalidate = async () => {
        setIsSaving(true);
        try {
            const res = await invalidateAttendanceRecord(meetingId, invalidateRecord.id, { reason: 'Hủy hiệu lực bởi Quản trị viên/Chủ trì' });
            if (res?.success) {
                setSuccessMsg('Đã hủy hiệu lực bản ghi điểm danh.');
                setInvalidateRecord(null);
                fetchAttendance();
            } else {
                throw new Error(res?.message || 'Không thể hủy hiệu lực bản ghi.');
            }
        } catch (err) {
            setError(err.message || 'Có lỗi xảy ra khi hủy hiệu lực.');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && !attendanceData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-slate-blue text-xs font-semibold">Đang tải bảng điểm danh...</p>
            </div>
        );
    }

    if (error && !attendanceData) {
        if (errorCode === 'MEETING_NOT_ACTIVE') {
            return (
                <div className="p-8 bg-blue-50/40 border border-blue-100 rounded-2xl flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-action-blue flex items-center justify-center">
                        <Clock className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-midnight-indigo font-bold text-sm">Điểm danh chưa khả dụng</h3>
                        <p className="text-xs text-slate-blue mt-1.5 leading-relaxed">
                            Danh sách điểm danh sẽ hiển thị sau khi cuộc họp được bắt đầu. Vui lòng quay lại sau.
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center">
                <AlertTriangle className="w-10 h-10 text-red-500 mb-2" />
                <h3 className="text-red-700 font-bold mb-1">Không thể tải dữ liệu</h3>
                <p className="text-sm text-red-600 mb-4">{error}</p>
                <button 
                    onClick={fetchAttendance}
                    className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors"
                >
                    Thử lại
                </button>
            </div>
        );
    }

    const { summary, items, permissions } = attendanceData || {};
    const canManage = permissions?.canViewAttendanceSource;

    const renderStatusBadge = (status, isLate, lateMinutes) => {
        switch (status) {
            case 'present':
                return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isLate ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                        {isLate ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                        {isLate ? `Đến muộn (${lateMinutes}p)` : 'Có mặt'}
                    </span>
                );
            case 'late':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600">
                        <AlertCircle className="w-3 h-3" />
                        {lateMinutes ? `Đến muộn (${lateMinutes}p)` : 'Đến muộn'}
                    </span>
                );
            case 'left_early':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600">
                        <AlertCircle className="w-3 h-3" /> Về sớm
                    </span>
                );
            case 'pending_review':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        <AlertTriangle className="w-3 h-3" /> Chờ duyệt
                    </span>
                );
            case 'absent':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600">
                        <XCircle className="w-3 h-3" /> Vắng mặt
                    </span>
                );
            case 'not_checked_in':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                        <Clock className="w-3 h-3" /> Chưa điểm danh
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cloud-mist text-slate-blue">
                        <Clock className="w-3 h-3" /> {status || 'Không xác định'}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <AnimatePresence>
                {successMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs font-medium flex items-center gap-2"
                    >
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        {successMsg}
                    </motion.div>
                )}
                {error && attendanceData && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Metrics Header */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-action-blue flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-blue">Đã Check-in</p>
                            <p className="text-xl font-black text-midnight-indigo">{summary.checkedInCount} <span className="text-sm font-semibold text-slate-blue">/ {summary.totalParticipants}</span></p>
                        </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-blue">Tỷ lệ điểm danh</p>
                            <p className="text-xl font-black text-midnight-indigo">{Math.round(summary.attendanceRate || 0)}%</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-amber-700">Đến muộn</p>
                            <p className="text-xl font-black text-amber-700">{summary.lateCount}</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-red-200 bg-red-50/20 shadow-sm-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            <XCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-red-700">Vắng mặt</p>
                            <p className="text-xl font-black text-red-700">{summary.absentCount}</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-blue">Tổng điểm trừ</p>
                            <p className="text-xl font-black text-rose-700">{summary.totalPenaltyPoints ?? 0}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters & Table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <h3 className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                        <Users className="w-4.5 h-4.5 text-action-blue" />
                        Chi tiết điểm danh
                    </h3>
                    <div className="flex gap-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold text-midnight-indigo focus:outline-none focus:border-action-blue"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="present">Có mặt</option>
                            <option value="absent">Vắng mặt</option>
                            <option value="not_checked_in">Chưa điểm danh</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-platinum-tint bg-white text-[10px] font-bold text-slate-blue uppercase tracking-wider whitespace-nowrap">
                                <th className="px-5 py-3">Người tham dự</th>
                                <th className="px-5 py-3">Vai trò</th>
                                <th className="px-5 py-3">Trạng thái</th>
                                <th className="px-5 py-3">Điểm trừ</th>
                                <th className="px-5 py-3">Lý do</th>
                                <th className="px-5 py-3">Check-in lúc</th>
                                {canManage && <th className="px-5 py-3">Nguồn / Phương thức</th>}
                                {canManage && <th className="px-5 py-3 text-right">Thao tác</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint text-sm bg-white">
                            {items?.length > 0 ? items.map((item) => (
                                <tr key={item.userId} className="hover:bg-cloud-mist/20 transition-colors">
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <UserAvatar user={{ avatarUrl: item.avatarUrl, fullName: item.fullName }} className="w-8 h-8 rounded-full" />
                                            <div>
                                                <p className="font-bold text-midnight-indigo text-xs">{item.fullName}</p>
                                                <p className="text-[10px] text-slate-blue">{item.departmentName || 'N/A'} • {item.positionTitle || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            item.participantRole === 'host' ? 'bg-blue-50 text-action-blue' : item.participantRole === 'secretary' ? 'bg-violet-50 text-violet-700' : 'bg-cloud-mist text-slate-blue'
                                        }`}>
                                            {item.participantRole === 'host' ? 'Chủ trì' : item.participantRole === 'secretary' ? 'Thư ký' : 'Thành viên'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        {renderStatusBadge(item.attendanceStatus, item.isLate, item.lateMinutes)}
                                    </td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        {item.penaltyPoints == null ? (
                                            <span className="text-[11px] text-slate-400">--</span>
                                        ) : (
                                            <div className="flex flex-col">
                                                <span className={`text-sm font-black ${item.penaltyPoints < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {item.penaltyPoints > 0 ? `+${item.penaltyPoints}` : item.penaltyPoints}
                                                </span>
                                                {item.violationRuleName && (
                                                    <span className="text-[9px] text-slate-400">{item.violationRuleName}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 max-w-[220px]">
                                        {item.excuseStatus ? (
                                            <div className="flex flex-col gap-1">
                                                <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded ${EXCUSE_STATUS_MAP[item.excuseStatus]?.cls || ''}`}>
                                                    {EXCUSE_STATUS_MAP[item.excuseStatus]?.label || item.excuseStatus}
                                                </span>
                                                {item.excuseReason && (
                                                    <span className="text-[11px] text-slate-600 break-words" title={item.excuseReason}>"{item.excuseReason}"</span>
                                                )}
                                                {item.excuseStatus === 'rejected' && item.excuseReviewNote && (
                                                    <span className="text-[10px] text-rose-600 break-words">Từ chối: {item.excuseReviewNote}</span>
                                                )}
                                                {canManage && item.excuseStatus === 'pending' && item.userId !== myUserId && (
                                                    <div className="flex gap-1.5 pt-0.5">
                                                        <button
                                                            onClick={() => setExcuseModal({ mode: 'review', item, approve: true, text: '' })}
                                                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                                                        >
                                                            Duyệt
                                                        </button>
                                                        <button
                                                            onClick={() => setExcuseModal({ mode: 'review', item, approve: false, text: '' })}
                                                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-600 text-white hover:bg-rose-700"
                                                        >
                                                            Từ chối
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[11px] text-slate-400">--</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                                        {item.checkInTime ? (
                                            <div className="flex flex-col">
                                                <span>{new Date(item.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                <span className="text-[9px] text-slate-400 font-normal">{new Date(item.checkInTime).toLocaleDateString('vi-VN')}</span>
                                            </div>
                                        ) : '--:--'}
                                    </td>
                                    {canManage && (
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <div className="flex flex-col gap-0.5">
                                                {item.checkInMethod && (
                                                    <span className="text-[10px] font-semibold text-slate-700">
                                                        Phương thức: {CHECK_IN_METHOD_MAP[item.checkInMethod] ?? item.checkInMethod}
                                                    </span>
                                                )}
                                                {item.attendanceSource && (
                                                    <span className="text-[10px] text-slate-500">Nguồn: {ATTENDANCE_SOURCE_MAP[item.attendanceSource] ?? item.attendanceSource}</span>
                                                )}
                                                {!item.checkInMethod && !item.attendanceSource && <span className="text-[10px] text-slate-400">Không có thông tin</span>}
                                            </div>
                                        </td>
                                    )}
                                    {canManage && (
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setEditingRecord({ ...item, newStatus: item.attendanceStatus })}
                                                    className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Đổi trạng thái"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                {item.attendanceStatus !== 'not_checked_in' && (
                                                    <button
                                                        onClick={() => setInvalidateRecord(item)}
                                                        className="p-1.5 text-slate-blue hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                        title="Hủy hiệu lực check-in"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={canManage ? 8 : 6} className="px-5 py-8 text-center text-slate-blue text-sm">
                                        Không có dữ liệu điểm danh nào phù hợp.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination placeholder if needed */}
            </div>

            {/* Edit Status Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {editingRecord && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-sm w-full p-6 space-y-4"
                            >
                                <div className="flex items-center justify-between border-b border-platinum-tint pb-3">
                                    <h3 className="text-sm font-bold text-midnight-indigo">Cập nhật điểm danh</h3>
                                    <button onClick={() => setEditingRecord(null)} className="text-slate-blue hover:text-midnight-indigo">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs text-slate-blue">
                                        Người tham dự: <span className="font-bold text-midnight-indigo">{editingRecord.fullName}</span>
                                    </p>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Trạng thái mới</label>
                                        <select
                                            value={editingRecord.newStatus}
                                            onChange={(e) => setEditingRecord({ ...editingRecord, newStatus: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo font-medium"
                                        >
                                            <option value="present">Có mặt</option>
                                            <option value="absent">Vắng mặt</option>
                                            <option value="late">Đến muộn</option>
                                            <option value="left_early">Về sớm</option>
                                            <option value="pending_review">Chờ duyệt</option>
                                        </select>
                                    </div>
                                    {editingRecord.newStatus === 'left_early' && editingRecord.id && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Ghi chú <span className="text-rose-500">*</span></label>
                                            <textarea
                                                rows={3}
                                                value={editingRecord.note || ''}
                                                onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                                                placeholder="VD: Rời phòng lúc 14:20, không báo trước"
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        onClick={() => setEditingRecord(null)}
                                        className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue hover:bg-cloud-mist transition-colors"
                                        disabled={isSaving}
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Đang lưu...' : <><Save className="w-3.5 h-3.5" /> Lưu trạng thái</>}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Excuse Modal: gửi lý do / duyệt / từ chối */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {excuseModal && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-sm w-full p-6 space-y-4"
                            >
                                <div className="flex items-center justify-between border-b border-platinum-tint pb-3">
                                    <h3 className="text-sm font-bold text-midnight-indigo">
                                        {excuseModal.mode === 'submit' ? 'Gửi lý do vắng / trễ / về sớm'
                                            : excuseModal.approve ? 'Duyệt lý do' : 'Từ chối lý do'}
                                    </h3>
                                    <button onClick={() => setExcuseModal(null)} className="text-slate-blue hover:text-midnight-indigo">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                {excuseModal.mode === 'submit' ? (
                                    <p className="text-xs text-slate-blue">Mỗi cuộc họp chỉ gửi được 1 lần. Nếu được chủ trì / thư ký duyệt, bạn được ghi nhận <b>0 điểm trừ</b>.</p>
                                ) : (
                                    <div className="text-xs text-slate-blue space-y-1">
                                        <p>Người gửi: <span className="font-bold text-midnight-indigo">{excuseModal.item.fullName}</span></p>
                                        <p className="italic">"{excuseModal.item.excuseReason}"</p>
                                        <p>{excuseModal.approve ? 'Duyệt ⇒ ghi nhận "Có lý do", 0 điểm trừ.' : 'Từ chối ⇒ giữ nguyên điểm trừ, người gửi được thông báo.'}</p>
                                    </div>
                                )}
                                {(excuseModal.mode === 'submit' || !excuseModal.approve) && (
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">
                                            {excuseModal.mode === 'submit' ? 'Lý do' : 'Lý do từ chối'} <span className="text-rose-500">*</span>
                                        </label>
                                        <textarea
                                            rows={4}
                                            maxLength={1000}
                                            value={excuseModal.text}
                                            onChange={(e) => setExcuseModal({ ...excuseModal, text: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                        />
                                    </div>
                                )}
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        onClick={() => setExcuseModal(null)}
                                        className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue hover:bg-cloud-mist transition-colors"
                                        disabled={isSaving}
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleExcuse}
                                        className={`px-4 py-2 text-white rounded-xl text-xs font-bold transition-colors ${
                                            excuseModal.mode === 'review' && !excuseModal.approve ? 'bg-rose-600 hover:bg-rose-700' : 'bg-action-blue hover:bg-glacier-blue'
                                        }`}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Đang gửi...' : excuseModal.mode === 'submit' ? 'Gửi lý do' : excuseModal.approve ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Invalidate Confirm Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {invalidateRecord && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-sm w-full p-6 space-y-4"
                            >
                                <div className="flex flex-col items-center text-center space-y-3">
                                    <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <RotateCcw className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-midnight-indigo">Hủy hiệu lực điểm danh?</h3>
                                        <p className="text-xs text-slate-blue mt-1.5 leading-relaxed">
                                            Bạn có chắc chắn muốn hủy kết quả check-in của <span className="font-bold text-midnight-indigo">{invalidateRecord.fullName}</span>? Người này sẽ được đánh dấu lại thành "Chưa điểm danh".
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-center gap-3 pt-3 border-t border-platinum-tint">
                                    <button
                                        onClick={() => setInvalidateRecord(null)}
                                        className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue hover:bg-cloud-mist transition-colors"
                                        disabled={isSaving}
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        onClick={handleInvalidate}
                                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Đang xử lý...' : 'Đồng ý hủy'}
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

export default MeetingAttendanceBoard;
