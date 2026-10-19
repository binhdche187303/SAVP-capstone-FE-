import { AlertCircle, Calendar, CheckCircle, Clock, Home, Plus, RefreshCw, Search, Users, XCircle } from 'lucide-react';
import { htmlToPlainText } from '../../utils/richText';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    getMeetings,
    createMeeting,
    updateMeeting,
    updateMeetingTime,
    updateMeetingRoom,
    cancelMeeting,
    approveMeeting,
    getRooms,
} from '../../service/businessAdminServices';

const STATUS_BADGE = {
    draft:            { label: 'Bản nháp',    className: 'bg-slate-100 text-slate-600' },
    pending_approval: { label: 'Chờ duyệt',   className: 'bg-amber-50 text-amber-700' },
    scheduled:        { label: 'Đã lên lịch', className: 'bg-blue-50 text-blue-700' },
    in_progress:      { label: 'Đang họp',    className: 'bg-emerald-50 text-emerald-700' },
    completed:        { label: 'Hoàn thành',  className: 'bg-green-50 text-green-700' },
    cancelled:        { label: 'Đã huỷ',      className: 'bg-red-50 text-red-700' },
};

const EDITABLE_STATUSES = new Set(['draft', 'scheduled']);

const MeetingManagement = () => {
    const [meetingsList, setMeetingsList] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [confirm, setConfirm] = useState(null);

    // Filters & pagination
    const [search, setSearch] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Create / Edit title+description modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [formData, setFormData] = useState({ title: '', roomId: '', startTime: '', endTime: '', description: '' });

    // Time edit modal — PATCH /meetings/:id/time
    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [timeTarget, setTimeTarget] = useState(null);
    const [timeForm, setTimeForm] = useState({ startTime: '', endTime: '' });
    const [savingTime, setSavingTime] = useState(false);

    // Room edit modal — PATCH /meetings/:id/room
    const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
    const [roomTarget, setRoomTarget] = useState(null);
    const [roomForm, setRoomForm] = useState({ roomId: '' });
    const [savingRoom, setSavingRoom] = useState(false);

    const loadRooms = useCallback(async () => {
        try {
            const res = await getRooms({ limit: 100 });
            if (res?.success) setRooms(res.data || []);
        } catch {
            setRooms([]);
        }
    }, []);

    const fetchMeetingsList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page,
                limit,
                search: search.trim() || undefined,
                roomId: selectedRoom || undefined,
                status: selectedStatus || undefined,
            };
            const res = await getMeetings(params);
            if (res?.success) {
                setMeetingsList(res.data || []);
                setTotalPages(res.meta?.totalPages || 1);
                setTotalItems(res.meta?.total ?? (res.data?.length ?? 0));
            } else {
                setMeetingsList([]);
                setError(res?.message || 'Không thể tải danh sách cuộc họp.');
            }
        } catch (err) {
            setMeetingsList([]);
            setError(err?.message || err?.error?.message || 'Lỗi kết nối khi tải danh sách cuộc họp.');
        } finally {
            setLoading(false);
        }
    }, [search, selectedRoom, selectedStatus, page, limit]);

    useEffect(() => { loadRooms(); }, [loadRooms]);
    useEffect(() => { fetchMeetingsList(); }, [fetchMeetingsList]);

    useEffect(() => {
        if (successMessage) {
            const t = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(t);
        }
    }, [successMessage]);

    // Reset to page 1 when filters change
    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };

    // ── Create / Edit (title + description) ──────────────────────────────────
    const handleOpenModal = (mode, meeting = null) => {
        setModalMode(mode);
        if (mode === 'edit' && meeting) {
            setSelectedMeeting(meeting);
            setFormData({ title: meeting.title, description: meeting.description || '' });
        } else {
            setSelectedMeeting(null);
            setFormData({ title: '', roomId: '', startTime: '', endTime: '', description: '' });
        }
        setIsModalOpen(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            let res;
            if (modalMode === 'create') {
                res = await createMeeting({
                    title: formData.title,
                    roomId: formData.roomId,
                    startTime: new Date(formData.startTime).toISOString(),
                    endTime: new Date(formData.endTime).toISOString(),
                    description: formData.description,
                });
            } else {
                // PATCH /meetings/:id — chỉ nhận title + description
                res = await updateMeeting(selectedMeeting.id, {
                    title: formData.title,
                    description: formData.description,
                });
            }
            if (res?.success) {
                setSuccessMessage(modalMode === 'create' ? 'Tạo cuộc họp thành công!' : 'Cập nhật cuộc họp thành công!');
                setIsModalOpen(false);
                fetchMeetingsList();
            } else {
                setError(res?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
            }
        } catch (err) {
            if (err?.error?.code === 'ROOM_HAS_FAULTY_EQUIPMENT') {
                const faultyNames = (err.error.details?.faultyEquipments || [])
                    .map(eq => `${eq.equipmentName} (${eq.healthStatus === 'faulty' ? 'Lỗi' : 'Ngoại tuyến'})`)
                    .join(', ');
                setConfirm({
                    message: `Phòng họp này đang có thiết bị gặp sự cố: ${faultyNames}. Bạn có muốn tiếp tục đặt phòng?`,
                    onConfirm: async () => {
                        setError(null);
                        try {
                            const res = await createMeeting({
                                title: formData.title,
                                roomId: formData.roomId,
                                startTime: new Date(formData.startTime).toISOString(),
                                endTime: new Date(formData.endTime).toISOString(),
                                description: formData.description,
                                equipmentWarningConfirmed: true,
                            });
                            if (res?.success) {
                                setSuccessMessage('Tạo cuộc họp thành công!');
                                setIsModalOpen(false);
                                fetchMeetingsList();
                            } else {
                                setError(res?.message || 'Có lỗi xảy ra.');
                            }
                        } catch (retryErr) {
                            setError(retryErr?.message || retryErr?.error?.message || 'Có lỗi xảy ra khi lưu cuộc họp.');
                        }
                    }
                });
            } else {
                setError(err?.message || err?.error?.message || 'Có lỗi xảy ra khi lưu cuộc họp.');
            }
        }
    };

    // ── Approve ───────────────────────────────────────────────────────────────
    const handleApprove = (meeting) => {
        setConfirm({
            message: `Duyệt cuộc họp "${meeting.title}"? Cuộc họp sẽ chuyển sang trạng thái "Đã lên lịch".`,
            onConfirm: async () => {
                setError(null);
                try {
                    const res = await approveMeeting(meeting.id);
                    if (res?.success) {
                        setSuccessMessage('Đã duyệt cuộc họp thành công!');
                        fetchMeetingsList();
                    } else {
                        setError(res?.message || 'Không thể duyệt cuộc họp.');
                    }
                } catch (err) {
                    setError(err?.message || err?.error?.message || 'Có lỗi xảy ra khi duyệt.');
                }
            },
        });
    };

    // ── Cancel ────────────────────────────────────────────────────────────────
    const handleCancel = (meeting) => {
        setConfirm({
            message: `Huỷ cuộc họp "${meeting.title}"? Thao tác không thể hoàn tác.`,
            onConfirm: async () => {
                setError(null);
                try {
                    const res = await cancelMeeting(meeting.id);
                    if (res?.success) {
                        setSuccessMessage('Huỷ cuộc họp thành công!');
                        fetchMeetingsList();
                    } else {
                        setError(res?.message || 'Không thể huỷ cuộc họp.');
                    }
                } catch (err) {
                    setError(err?.message || err?.error?.message || 'Có lỗi xảy ra khi huỷ cuộc họp.');
                }
            },
        });
    };

    // ── Time edit ─────────────────────────────────────────────────────────────
    const openTimeModal = (meeting) => {
        setTimeTarget(meeting);
        setTimeForm({
            startTime: meeting.startTime?.substring(0, 16) ?? '',
            endTime: meeting.endTime?.substring(0, 16) ?? '',
        });
        setIsTimeModalOpen(true);
    };

    const handleTimeSave = async (e) => {
        e.preventDefault();
        setSavingTime(true);
        setError(null);
        try {
            const res = await updateMeetingTime(timeTarget.id, {
                startTime: new Date(timeForm.startTime).toISOString(),
                endTime: new Date(timeForm.endTime).toISOString(),
            });
            if (res?.success) {
                setSuccessMessage('Đã cập nhật thời gian cuộc họp!');
                setIsTimeModalOpen(false);
                fetchMeetingsList();
            } else {
                setError(res?.message || 'Không thể đổi thời gian.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Có lỗi xảy ra khi đổi thời gian.');
        } finally {
            setSavingTime(false);
        }
    };

    // ── Room edit ─────────────────────────────────────────────────────────────
    const openRoomModal = (meeting) => {
        setRoomTarget(meeting);
        setRoomForm({ roomId: meeting.roomId ?? '' });
        setIsRoomModalOpen(true);
    };

    const handleRoomSave = async (e) => {
        e.preventDefault();
        setSavingRoom(true);
        setError(null);
        try {
            const res = await updateMeetingRoom(roomTarget.id, { roomId: roomForm.roomId });
            if (res?.success) {
                setSuccessMessage('Đã cập nhật phòng họp!');
                setIsRoomModalOpen(false);
                fetchMeetingsList();
            } else {
                setError(res?.message || 'Không thể đổi phòng họp.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Có lỗi xảy ra khi đổi phòng họp.');
        } finally {
            setSavingRoom(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <ConfirmDialog
                isOpen={!!confirm}
                message={confirm?.message}
                confirmLabel="Xác nhận"
                onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
                onCancel={() => setConfirm(null)}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Users className="w-3.5 h-3.5" />
                        Cuộc họp
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý cuộc họp</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Theo dõi lịch đặt họp, duyệt yêu cầu và quản trị thông tin cuộc họp.
                    </p>
                </div>
                <div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleOpenModal('create')}
                        className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Đặt lịch họp
                    </motion.button>
                </div>
            </div>

            {/* Notifications */}
            {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-1 flex flex-col md:flex-row gap-3 justify-between">
                <div className="flex flex-col sm:flex-row gap-3 flex-1">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-blue" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm chủ đề cuộc họp..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-9 pr-4 py-2 w-full border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                        />
                    </div>
                    <select
                        value={selectedRoom}
                        onChange={handleFilterChange(setSelectedRoom)}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả phòng họp</option>
                        {rooms.map(r => (
                            <option key={r.id ?? r.roomId} value={r.id ?? r.roomId}>{r.roomName}</option>
                        ))}
                    </select>
                    <select
                        value={selectedStatus}
                        onChange={handleFilterChange(setSelectedStatus)}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả trạng thái</option>
                        {Object.entries(STATUS_BADGE).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={fetchMeetingsList}
                    className="inline-flex items-center justify-center px-4 py-2 border border-platinum-tint rounded-xl text-sm font-semibold bg-white text-slate-blue hover:bg-cloud-mist"
                >
                    <RefreshCw className="w-4 h-4 mr-2" /> Tải lại
                </button>
            </div>

            {/* Meetings Table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12">
                        <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-blue text-sm">Đang tải danh sách cuộc họp...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-platinum-tint bg-cloud-mist/50">
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Chủ đề cuộc họp</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Phòng họp</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Thời gian</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Người tổ chức</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Trạng thái</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase text-right">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {meetingsList.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-12 text-center text-slate-blue text-sm">
                                            Không có cuộc họp nào được tìm thấy.
                                        </td>
                                    </tr>
                                ) : (
                                    meetingsList.map((m) => (
                                        <tr key={m.id} className="border-b border-platinum-tint/40 hover:bg-cloud-mist/30 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="font-bold text-midnight-indigo">{m.title}</div>
                                                <div className="text-xs text-slate-blue truncate max-w-[240px]">{htmlToPlainText(m.description) || 'Không có mô tả'}</div>
                                            </td>
                                            <td className="py-4 px-6 text-sm text-slate-blue font-semibold">
                                                <span className="flex items-center gap-1.5">
                                                    <Home className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                                    {m.roomName}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-xs text-slate-blue space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                    {new Date(m.startTime).toLocaleDateString('vi-VN')}
                                                    {new Date(m.startTime).toLocaleDateString('vi-VN') !== new Date(m.endTime).toLocaleDateString('vi-VN')
                                                        ? ` – ${new Date(m.endTime).toLocaleDateString('vi-VN')}`
                                                        : ''}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                                    {new Date(m.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} – {new Date(m.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-sm text-midnight-indigo font-medium">
                                                {m.organizerName || m.organizer || '—'}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(STATUS_BADGE[m.status] || STATUS_BADGE.cancelled).className}`}>
                                                    {(STATUS_BADGE[m.status] || { label: m.status }).label}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right space-x-1">
                                                {/* Duyệt — chỉ cho pending_approval */}
                                                {m.status === 'pending_approval' && (
                                                    <button
                                                        onClick={() => handleApprove(m)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
                                                        title="Duyệt cuộc họp"
                                                    >
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                        Duyệt
                                                    </button>
                                                )}

                                                {/* Sửa tiêu đề/mô tả */}
                                                {EDITABLE_STATUSES.has(m.status) && (
                                                    <button
                                                        onClick={() => handleOpenModal('edit', m)}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        title="Sửa tiêu đề / mô tả"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                )}

                                                {/* Đổi giờ */}
                                                {EDITABLE_STATUSES.has(m.status) && (
                                                    <button
                                                        onClick={() => openTimeModal(m)}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        title="Đổi thời gian"
                                                    >
                                                        <Clock className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Đổi phòng */}
                                                {EDITABLE_STATUSES.has(m.status) && (
                                                    <button
                                                        onClick={() => openRoomModal(m)}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        title="Đổi phòng họp"
                                                    >
                                                        <Home className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Huỷ */}
                                                {(m.status === 'scheduled' || m.status === 'draft' || m.status === 'pending_approval') && (
                                                    <button
                                                        onClick={() => handleCancel(m)}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        title="Huỷ cuộc họp"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!loading && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                        <span className="text-xs text-slate-blue">
                            Hiển thị {meetingsList.length} trên tổng số {totalItems} cuộc họp
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
                                Tiếp
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Create / Edit modal (title + description) ────────────────────── */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-lg w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">
                                {modalMode === 'create' ? 'Đặt lịch họp mới' : 'Chỉnh sửa cuộc họp'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo text-lg font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Chủ đề cuộc họp</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Ví dụ: Họp Sprint Review"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>

                            {/* Phòng + thời gian chỉ hiện khi tạo mới */}
                            {modalMode === 'create' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Phòng họp</label>
                                        <select
                                            required
                                            value={formData.roomId}
                                            onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                        >
                                            <option value="">Chọn phòng</option>
                                            {rooms.map(r => (
                                                <option key={r.id} value={r.id}>
                                                    {r.roomName}
                                                    {r.hasFaultyEquipment || r.has_faulty_equipment ? ' (Có thiết bị hỏng)' : r.hasEquipmentWarning || r.has_equipment_warning ? ' (Thiết bị lỗi nhẹ)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Bắt đầu</label>
                                            <input
                                                type="datetime-local"
                                                required
                                                value={formData.startTime}
                                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue font-semibold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Kết thúc</label>
                                            <input
                                                type="datetime-local"
                                                required
                                                value={formData.endTime}
                                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue font-semibold"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Khi edit: thông báo rõ scope */}
                            {modalMode === 'edit' && (
                                <p className="text-[11px] text-slate-blue bg-cloud-mist/60 border border-platinum-tint rounded-xl px-3 py-2">
                                    Để đổi <strong>thời gian</strong> hoặc <strong>phòng họp</strong>, dùng nút <Clock className="w-3 h-3 inline" /> / <Home className="w-3 h-3 inline" /> trên bảng danh sách.
                                </p>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Nội dung / Mô tả</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows="3"
                                    placeholder="Nội dung thảo luận..."
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist">
                                    Huỷ bỏ
                                </button>
                                <button type="submit" className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue">
                                    {modalMode === 'create' ? 'Đặt lịch' : 'Cập nhật'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Time edit modal ───────────────────────────────────────────────── */}
            {isTimeModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-sm w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo">Đổi thời gian</h3>
                                <p className="text-[10px] text-slate-blue mt-0.5 truncate max-w-[240px]">{timeTarget?.title}</p>
                            </div>
                            <button onClick={() => setIsTimeModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo text-lg font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleTimeSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Bắt đầu</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={timeForm.startTime}
                                    onChange={(e) => setTimeForm({ ...timeForm, startTime: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Kết thúc</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={timeForm.endTime}
                                    onChange={(e) => setTimeForm({ ...timeForm, endTime: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsTimeModalOpen(false)} className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist">
                                    Huỷ
                                </button>
                                <button type="submit" disabled={savingTime} className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue disabled:opacity-50">
                                    {savingTime ? 'Đang lưu...' : 'Lưu thời gian'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Room edit modal ───────────────────────────────────────────────── */}
            {isRoomModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-sm w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo">Đổi phòng họp</h3>
                                <p className="text-[10px] text-slate-blue mt-0.5 truncate max-w-[240px]">{roomTarget?.title}</p>
                            </div>
                            <button onClick={() => setIsRoomModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo text-lg font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleRoomSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Phòng họp mới</label>
                                <select
                                    required
                                    value={roomForm.roomId}
                                    onChange={(e) => setRoomForm({ roomId: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                >
                                    <option value="">Chọn phòng</option>
                                    {rooms.map(r => (
                                        <option key={r.id} value={r.id}>
                                            {r.roomName}
                                            {r.hasFaultyEquipment || r.has_faulty_equipment ? ' (Có thiết bị hỏng)' : r.hasEquipmentWarning || r.has_equipment_warning ? ' (Thiết bị lỗi nhẹ)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {roomTarget?.roomName && (
                                    <p className="text-[10px] text-slate-blue mt-1">Phòng hiện tại: <strong>{roomTarget.roomName}</strong></p>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsRoomModalOpen(false)} className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist">
                                    Huỷ
                                </button>
                                <button type="submit" disabled={savingRoom} className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue disabled:opacity-50">
                                    {savingRoom ? 'Đang lưu...' : 'Lưu phòng họp'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default MeetingManagement;
