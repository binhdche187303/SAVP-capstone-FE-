import {
    AlertCircle, ArrowLeft, Calendar, CheckCircle,
    ChevronLeft, ChevronRight, Clock, DoorOpen, Edit2, Eye,
    Home, MapPin, Mic, Monitor, Plus, RefreshCw,
    Trash2, Users, Video, Wrench, X
} from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    getRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    getRoomDeletionImpact,
    getMeetings,
    getRoomDetail,
    updateRoomAdministrativeStatus
} from '../../service/businessAdminServices';

const ROOM_TYPE_LABELS = {
    meeting_room: 'Phòng họp',
    board_room: 'Phòng họp ban',
    conference_room: 'Hội trường',
    training_room: 'Phòng đào tạo',
    other: 'Khác'
};

const ADMIN_STATUS_LABELS = {
    available: 'Sẵn sàng',
    occupied: 'Đang họp',
    reserved: 'Đã đặt trước',
    maintenance: 'Bảo trì',
    inactive: 'Không hoạt động'
};

const getNoShowBadge = (status) => {
    switch (status) {
        case 'risk':
            return { label: 'Nguy cơ No-show', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
        case 'confirmed':
            return { label: 'Xác nhận No-show', cls: 'bg-red-50 text-red-700 border-red-200' };
        case 'warning_sent':
            return { label: 'Đã gửi cảnh báo', cls: 'bg-orange-50 text-orange-700 border-orange-200' };
        case 'released':
            return { label: 'Đã giải phóng', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        case 'dismissed':
            return { label: 'Đã bỏ qua', cls: 'bg-gray-50 text-gray-600 border-gray-200' };
        case 'resolved':
            return { label: 'Đã xử lý', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
        default:
            return { label: 'Bình thường', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
    }
};

const formatTimeRange = (startStr, endStr) => {
    if (!startStr) return '—';
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : null;
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const dateOpts = { day: '2-digit', month: '2-digit', year: 'numeric' };

    const timePart = start.toLocaleTimeString('vi-VN', timeOpts) + (end ? ` - ${end.toLocaleTimeString('vi-VN', timeOpts)}` : '');
    const datePart = start.toLocaleDateString('vi-VN', dateOpts);
    return `${timePart} (${datePart})`;
};

const MEETING_STATUS_CONFIG = {
    scheduled: { label: 'Đã lên lịch', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: 'Đang diễn ra', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    completed: { label: 'Hoàn thành', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    cancelled: { label: 'Đã huỷ', cls: 'bg-red-50 text-red-700 border-red-200' },
    pending: { label: 'Chờ xác nhận', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const STATUS_CONFIG = {
    available: { label: 'Đang trống', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    occupied: { label: 'Đang họp', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    reserved: { label: 'Đã đặt trước', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    maintenance: { label: 'Bảo trì', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    inactive: { label: 'Ngừng hoạt động', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
};

const getStatus = (room) => room.currentStatus || room.roomStatus || 'available';

const AmenityBadge = ({ active, icon: Icon, label }) => (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${active ? 'bg-blue-50 text-action-blue border-blue-200' : 'bg-gray-50 text-steel-gray border-gray-200 opacity-40'
        }`}>
        <Icon className="w-2.5 h-2.5" />
        {label}
    </span>
);

const EMPTY_FORM = {
    roomCode: 'RM-',
    roomName: '',
    capacity: '',
    roomType: 'meeting_room',
    siteName: '',
    areaName: '',
    description: '',
    hasCamera: false,
    hasMicrophone: false,
    hasDisplay: false,
    allowRecording: false
};

// Backend contract: /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 3-80 ky tu (create-room.dto.ts).
// FE further constrains to a mandatory "RM-" prefix, ex: RM-BE312, RM-AL234.
const ROOM_CODE_REGEX = /^RM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

const sanitizeRoomCode = (raw) => {
    let val = raw.toUpperCase();
    if (!val.startsWith('RM-')) {
        val = 'RM-' + val.replace(/^RM-?/, '');
    }
    const suffix = val.slice(3).replace(/[^A-Z0-9-]/g, '');
    return 'RM-' + suffix;
};

const RoomManagement = ({ readOnly = false }) => {
    const [roomsList, setRoomsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [deleteImpactModal, setDeleteImpactModal] = useState(null);
    const [checkingDeleteImpactId, setCheckingDeleteImpactId] = useState(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const LIMIT = 12;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // Chi tiết phòng
    const [detailRoom, setDetailRoom] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [savingAdminStatus, setSavingAdminStatus] = useState(false);

    const openRoomDetail = async (room) => {
        const roomId = room.id || room.roomId;
        setDetailRoom(room);
        setLoadingDetail(true);
        setError(null);
        try {
            const res = await getRoomDetail(roomId);
            if (res?.success && res.data) {
                setDetailRoom(res.data);
            }
        } catch (err) {
            console.error("Lỗi tải thông tin chi tiết phòng:", err);
        } finally {
            setLoadingDetail(false);
        }
    };

    // Dat/go trang thai chu dong (bao tri / ngung hoat dong) cho phong dang xem chi tiet.
    const handleSetAdministrativeStatus = async (status) => {
        if (!detailRoom) return;
        const roomId = detailRoom.id || detailRoom.roomId;
        setSavingAdminStatus(true);
        setError(null);
        try {
            const res = await updateRoomAdministrativeStatus(roomId, { status });
            if (res?.success) {
                setDetailRoom(prev => ({ ...prev, administrativeStatus: res.data?.administrativeStatus ?? status }));
                setSuccessMessage('Đã cập nhật trạng thái phòng họp!');
                fetchRoomsList();
            } else {
                setError(res?.error?.message || 'Không thể cập nhật trạng thái phòng.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể cập nhật trạng thái phòng.');
        } finally {
            setSavingAdminStatus(false);
        }
    };

    const fetchRoomsList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page,
                limit: LIMIT,
                ...(search.trim() && { q: search.trim() }),
                ...(statusFilter && { status: statusFilter })
            };
            const res = await getRooms(params);
            if (res?.success) {
                setRoomsList(res.data || []);
                setTotalPages(res.meta?.totalPages || 1);
                setTotalItems(res.meta?.total || (res.data?.length || 0));
            } else {
                throw new Error(res?.error?.message || 'Không thể tải danh sách phòng.');
            }
        } catch (err) {
            setError(err?.message || 'Không thể tải danh sách phòng họp.');
            setRoomsList([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => { fetchRoomsList(); }, [fetchRoomsList]);

    useEffect(() => {
        if (successMessage) {
            const t = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(t);
        }
    }, [successMessage]);

    // Reset page on filter change
    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const handleOpenModal = (mode, room = null) => {
        setModalMode(mode);
        setError(null);
        if (mode === 'edit' && room) {
            setSelectedRoom(room);
            setFormData({
                roomCode: room.roomCode || '',
                roomName: room.roomName || '',
                capacity: room.capacity ?? '',
                roomType: room.roomType || 'meeting_room',
                siteName: room.siteName || '',
                areaName: room.areaName || '',
                description: room.description || '',
                hasCamera: room.hasCamera ?? false,
                hasMicrophone: room.hasMicrophone ?? false,
                hasDisplay: room.hasDisplay ?? false,
                allowRecording: room.allowRecording ?? false
            });
        } else {
            setSelectedRoom(null);
            setFormData(EMPTY_FORM);
        }
        setIsModalOpen(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (modalMode === 'create' && !ROOM_CODE_REGEX.test(formData.roomCode.trim())) {
            setError('Mã phòng không hợp lệ. Định dạng bắt buộc: RM-XXXX (chữ hoa/số sau dấu -), ví dụ RM-BE312.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = {
                ...(modalMode === 'create' && { roomCode: formData.roomCode.trim() }),
                roomName: formData.roomName.trim(),
                capacity: parseInt(formData.capacity, 10),
                roomType: formData.roomType,
                ...(formData.siteName.trim() && { siteName: formData.siteName.trim() }),
                ...(formData.areaName.trim() && { areaName: formData.areaName.trim() }),
                ...(formData.description.trim() && { locationDescription: formData.description.trim() }),
                hasCamera: formData.hasCamera,
                hasMicrophone: formData.hasMicrophone,
                hasDisplay: formData.hasDisplay,
                allowRecording: formData.allowRecording
            };
            const res = modalMode === 'create'
                ? await createRoom(payload)
                : await updateRoom(selectedRoom.id || selectedRoom.roomId, payload);

            if (res?.success) {
                setSuccessMessage(modalMode === 'create' ? 'Thêm phòng họp thành công!' : 'Cập nhật phòng họp thành công!');
                setIsModalOpen(false);
                fetchRoomsList();
            } else {
                setError(res?.error?.message || res?.message || 'Có lỗi xảy ra.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Có lỗi xảy ra khi lưu phòng họp.');
        } finally {
            setSaving(false);
        }
    };

    // Xoá phòng: PHẢI kiểm tra tác động trước (GET .../deletion-impact) — nếu
    // còn cuộc họp tương lai đã duyệt (status=scheduled), chặn xoá hoàn toàn
    // và hiện danh sách cuộc họp đang chặn (không có ngoại lệ force-delete).
    const handleDelete = async (room) => {
        const roomId = room.id || room.roomId;
        setError(null);
        setCheckingDeleteImpactId(roomId);
        try {
            const res = await getRoomDeletionImpact(roomId);
            if (!res?.success) {
                setError(res?.error?.message || 'Không thể kiểm tra tác động xoá phòng.');
                return;
            }
            const impact = res.data || {};
            if (!impact.canDelete) {
                setDeleteImpactModal({
                    room,
                    blockingMeetings: impact.blockingMeetings || [],
                    blockedByInProgressMeeting: impact.blockedByInProgressMeeting,
                });
                return;
            }
            const pendingNote = impact.pendingMeetingCount > 0
                ? ` Lưu ý: ${impact.pendingMeetingCount} cuộc họp chưa duyệt tại phòng này sẽ bị gỡ địa điểm và người liên quan sẽ được thông báo.`
                : '';
            setConfirm({
                message: `Bạn có chắc chắn muốn xoá phòng "${room.roomName}"? Thao tác không thể hoàn tác.${pendingNote}`,
                onConfirm: async () => {
                    try {
                        const res = await deleteRoom(roomId);
                        if (res?.success) {
                            setSuccessMessage('Đã xoá phòng họp thành công!');
                            fetchRoomsList();
                        } else {
                            setError(res?.error?.message || 'Không thể xoá phòng họp.');
                        }
                    } catch (err) {
                        setError(err?.error?.message || err?.message || 'Không thể xoá phòng họp.');
                    }
                }
            });
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể kiểm tra tác động xoá phòng.');
        } finally {
            setCheckingDeleteImpactId(null);
        }
    };

    const setField = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

    return (
        <div className="space-y-6 animate-fade-in-up">
            <ConfirmDialog
                isOpen={!!confirm}
                message={confirm?.message}
                confirmLabel="Xoá phòng họp"
                onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
                onCancel={() => setConfirm(null)}
            />

            {/* Chặn xoá phòng khi còn cuộc họp tương lai đã duyệt (EX2) */}
            {deleteImpactModal && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl border border-platinum-tint max-w-md w-full p-6 space-y-4 animate-fade-in-up">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-red-100 text-red-600">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-base">Không thể xoá phòng "{deleteImpactModal.room?.roomName}"</h3>
                                <p className="text-sm text-slate-blue mt-1 leading-relaxed">
                                    Phòng này còn {deleteImpactModal.blockingMeetings.length} cuộc họp đã được duyệt trong tương lai. Vui lòng đổi phòng hoặc huỷ các cuộc họp dưới đây trước khi xoá.
                                </p>
                            </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-platinum-tint divide-y divide-platinum-tint">
                            {deleteImpactModal.blockingMeetings.map((m) => (
                                <div key={m.id} className="p-3 text-xs">
                                    <p className="font-bold text-midnight-indigo">{m.title}</p>
                                    <p className="text-slate-blue mt-0.5">{formatTimeRange(m.startTime, m.endTime)}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setDeleteImpactModal(null)}
                                className="px-4 py-2 rounded-xl border border-platinum-tint text-sm font-semibold text-slate-blue hover:bg-cloud-mist transition-colors"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <DoorOpen className="w-3.5 h-3.5" />
                        Phòng họp
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý phòng họp</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Cấu hình cơ sở vật chất, sức chứa và kiểm tra trạng thái khả dụng của các phòng họp thông minh.
                    </p>
                </div>
                {!readOnly && (
                    <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => handleOpenModal('create')}
                        className="inline-flex items-center justify-center px-4 py-2.5 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Thêm phòng họp
                    </motion.button>
                )}
            </div>

            {/* Alerts */}
            {successMessage && (
                <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
                </div>
            )}

                <>
                    {/* Filters */}
                    <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-1 flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo tên phòng, mã phòng, toà nhà..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="px-4 py-2 flex-1 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                        />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-slate-blue font-medium min-w-[160px]"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="available">Đang trống</option>
                            <option value="occupied">Đang họp</option>
                            <option value="reserved">Đã đặt trước</option>
                            <option value="maintenance">Bảo trì</option>
                            <option value="inactive">Ngừng hoạt động</option>
                        </select>
                        <button
                            onClick={() => fetchRoomsList()}
                            className="inline-flex items-center justify-center px-4 py-2 border border-platinum-tint rounded-xl text-sm font-semibold bg-white text-slate-blue hover:bg-cloud-mist"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" /> Tải lại
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-12 min-h-[240px]">
                                <div className="w-9 h-9 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                                <p className="mt-4 text-slate-blue text-sm">Đang tải danh sách phòng họp...</p>
                            </div>
                        ) : roomsList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 min-h-[240px] text-center">
                                <Home className="w-10 h-10 text-platinum-tint mb-2" />
                                <p className="text-sm font-bold text-midnight-indigo">Không tìm thấy phòng họp nào</p>
                                <p className="text-xs text-slate-blue mt-1">Thử thay đổi bộ lọc hoặc thêm phòng mới.</p>
                            </div>
                        ) : (
                            <div className="w-full">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-platinum-tint bg-cloud-mist/50">
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide whitespace-nowrap">Phòng họp</th>
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide whitespace-nowrap">Vị trí</th>
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide whitespace-nowrap">Sức chứa</th>
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide whitespace-nowrap">Thiết bị</th>
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide whitespace-nowrap">Trạng thái</th>
                                            <th className="py-3 px-3 text-[11px] font-bold text-slate-blue uppercase tracking-wide text-right whitespace-nowrap">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {roomsList.map((room, idx) => {
                                            const status = getStatus(room);
                                            const sc = STATUS_CONFIG[status] || STATUS_CONFIG.available;
                                            return (
                                                <tr key={room.id || room.roomId || idx} className="border-b border-platinum-tint/40 hover:bg-cloud-mist/30 transition-colors">
                                                    {/* Phòng họp */}
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-1 bg-blue-50 rounded-lg shrink-0">
                                                                <Home className="w-3.5 h-3.5 text-action-blue" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-midnight-indigo leading-tight whitespace-nowrap">{room.roomName}</p>
                                                                <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
                                                                    {room.roomCode && (
                                                                        <span className="text-[9px] font-mono font-bold text-slate-blue bg-cloud-mist px-1.5 py-0.5 rounded border border-platinum-tint shrink-0">
                                                                            {room.roomCode}
                                                                        </span>
                                                                    )}
                                                                    {room.roomType && (
                                                                        <span className="text-[9px] text-steel-gray shrink-0">
                                                                            {ROOM_TYPE_LABELS[room.roomType] || room.roomType}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {/* Vị trí */}
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        {(room.siteName || room.areaName) ? (
                                                            <div className="flex items-center gap-1.5 text-xs text-midnight-indigo whitespace-nowrap">
                                                                <MapPin className="w-3.5 h-3.5 text-steel-gray shrink-0" />
                                                                <span className="font-semibold">{room.siteName || '—'}</span>
                                                                {room.areaName && <span className="text-steel-gray text-[11px]">({room.areaName})</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-steel-gray/50">—</span>
                                                        )}
                                                    </td>
                                                    {/* Sức chứa */}
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-blue whitespace-nowrap">
                                                            <Users className="w-3.5 h-3.5 shrink-0" />
                                                            {room.capacity} người
                                                        </span>
                                                    </td>
                                                    {/* Trang thiết bị */}
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                                            <Video className={`w-3.5 h-3.5 shrink-0 ${room.hasCamera ? 'text-action-blue' : 'text-slate-300'}`} title={room.hasCamera ? "Có Camera" : "Không có Camera"} />
                                                            <Mic className={`w-3.5 h-3.5 shrink-0 ${room.hasMicrophone ? 'text-action-blue' : 'text-slate-300'}`} title={room.hasMicrophone ? "Có Microphone" : "Không có Microphone"} />
                                                            <Monitor className={`w-3.5 h-3.5 shrink-0 ${room.hasDisplay ? 'text-action-blue' : 'text-slate-300'}`} title={room.hasDisplay ? "Có Màn hình" : "Không có Màn hình"} />
                                                        </div>
                                                    </td>
                                                    {/* Trạng thái */}
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${sc.cls}`}>
                                                            {sc.label}
                                                        </span>
                                                    </td>
                                                    {/* Hành động */}
                                                    <td className="py-3 px-3 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
                                                            <button
                                                                onClick={() => openRoomDetail(room)}
                                                                className="p-1 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                                title="Xem chi tiết"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            {!readOnly && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleOpenModal('edit', room)}
                                                                        className="p-1 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                                        title="Chỉnh sửa"
                                                                    >
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(room)}
                                                                        disabled={checkingDeleteImpactId === (room.id || room.roomId)}
                                                                        className="p-1 rounded-lg text-slate-blue hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                                                        title="Xoá phòng"
                                                                    >
                                                                        {checkingDeleteImpactId === (room.id || room.roomId)
                                                                            ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                                                            : <Trash2 className="w-4 h-4" />}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {!loading && totalPages > 1 && (
                            <div className="px-5 py-3.5 border-t border-platinum-tint flex items-center justify-between bg-cloud-mist/30">
                                <span className="text-xs text-slate-blue">
                                    Hiển thị {roomsList.length} / {totalItems} phòng
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setPage(p => Math.max(p - 1, 1))}
                                        disabled={page === 1}
                                        className="p-1.5 border border-platinum-tint rounded-lg bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-3 py-1 text-xs font-bold text-midnight-indigo">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                        disabled={page === totalPages}
                                        className="p-1.5 border border-platinum-tint rounded-lg bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>

            {/* Add/Edit Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-lg w-full overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
                            <h3 className="font-bold text-midnight-indigo">
                                {modalMode === 'create' ? 'Thêm phòng họp mới' : `Cập nhật: ${selectedRoom?.roomName}`}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo text-xl font-bold leading-none">&times;</button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto">
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                                </div>
                            )}

                            {/* Mã phòng */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã phòng họp <span className="text-red-500">*</span></label>
                                <input
                                    type="text" required
                                    disabled={modalMode === 'edit'}
                                    value={formData.roomCode}
                                    onChange={e => setField('roomCode', sanitizeRoomCode(e.target.value))}
                                    placeholder="RM-BE312"
                                    className={`w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue ${modalMode === 'edit' ? 'bg-cloud-mist/60 text-slate-blue cursor-not-allowed' : ''
                                        }`}
                                />
                                <p className="text-[10px] text-slate-blue/70 mt-1">
                                    {modalMode === 'edit'
                                        ? 'Mã phòng không thể thay đổi sau khi tạo.'
                                        : 'Định dạng bắt buộc: RM-XXXX (chữ hoa và số sau dấu gạch ngang). Ví dụ: RM-BE312, RM-AL234.'}
                                </p>
                            </div>

                            {/* Tên & loại phòng */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên phòng họp <span className="text-red-500">*</span></label>
                                <input
                                    type="text" required
                                    value={formData.roomName}
                                    onChange={e => setField('roomName', e.target.value)}
                                    placeholder="Ví dụ: Phòng Apollo 101"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Sức chứa <span className="text-red-500">*</span></label>
                                    <input
                                        type="number" required min="1"
                                        value={formData.capacity}
                                        onChange={e => setField('capacity', e.target.value)}
                                        placeholder="Số người"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại phòng</label>
                                    <select
                                        value={formData.roomType}
                                        onChange={e => setField('roomType', e.target.value)}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue font-medium"
                                    >
                                        <option value="meeting_room">Phòng họp</option>
                                        <option value="board_room">Phòng họp ban</option>
                                        <option value="conference_room">Hội trường</option>
                                        <option value="training_room">Phòng đào tạo</option>
                                        <option value="other">Khác</option>
                                    </select>
                                </div>
                            </div>

                            {/* Vị trí */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Toà nhà / Cơ sở</label>
                                    <input
                                        type="text"
                                        value={formData.siteName}
                                        onChange={e => setField('siteName', e.target.value)}
                                        placeholder="Ví dụ: Toà A"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Khu vực / Tầng</label>
                                    <input
                                        type="text"
                                        value={formData.areaName}
                                        onChange={e => setField('areaName', e.target.value)}
                                        placeholder="Ví dụ: Tầng 3"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            {/* Trang thiết bị */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-2">Trang thiết bị</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { key: 'hasCamera', Icon: Video, label: 'Camera ghi hình' },
                                        { key: 'hasMicrophone', Icon: Mic, label: 'Microphone' },
                                        { key: 'hasDisplay', Icon: Monitor, label: 'Màn hình chiếu' },
                                        { key: 'allowRecording', Icon: Video, label: 'Cho phép ghi hình' }
                                    ].map(({ key, Icon, label }) => (
                                        <label
                                            key={key}
                                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${formData[key] ? 'border-action-blue bg-blue-50' : 'border-platinum-tint bg-white hover:bg-cloud-mist'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData[key]}
                                                onChange={e => setField(key, e.target.checked)}
                                                className="w-3.5 h-3.5 accent-action-blue"
                                            />
                                            <Icon className={`w-3.5 h-3.5 ${formData[key] ? 'text-action-blue' : 'text-steel-gray'}`} />
                                            <span className={`text-xs font-semibold ${formData[key] ? 'text-action-blue' : 'text-slate-blue'}`}>{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Mô tả */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setField('description', e.target.value)}
                                    rows="2"
                                    placeholder="Thông tin thêm về phòng họp..."
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue resize-none"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist"
                                >
                                    Huỷ bỏ
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue disabled:opacity-60 transition-colors"
                                >
                                    {saving ? 'Đang lưu...' : modalMode === 'create' ? 'Tạo mới' : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Room Detail Modal with backdrop blur */}
            {detailRoom && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-fade-in-up flex flex-col relative min-h-[300px]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-midnight-indigo text-lg flex items-center gap-2">
                                    <DoorOpen className="w-5 h-5 text-action-blue" />
                                    {detailRoom.roomName}
                                </h3>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${detailRoom.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                    {detailRoom.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                                </span>
                            </div>
                            {/* <button onClick={() => setDetailRoom(null)} className="text-slate-blue hover:text-midnight-indigo">
                                <X className="w-5 h-5" />
                            </button> */}
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-5 relative min-h-[200px]">
                            {loadingDetail && (
                                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-10 animate-fade-in">
                                    <div className="w-8 h-8 border-3 border-action-blue border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Info Panel */}
                                <div className="bg-slate-50/50 rounded-2xl border border-platinum-tint p-5 space-y-3.5">
                                    <h4 className="text-xs font-extrabold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint pb-2">Thông tin phòng</h4>
                                    {[
                                        { label: 'Tên phòng', value: detailRoom.roomName },
                                        { label: 'Mã phòng họp', value: detailRoom.roomCode || '—' },
                                        { label: 'Loại phòng', value: ROOM_TYPE_LABELS[detailRoom.roomType] || detailRoom.roomType },
                                        { label: 'Sức chứa tối đa', value: detailRoom.capacity ? `${detailRoom.capacity} người` : '—' },
                                        { label: 'Tòa nhà / Cơ sở', value: detailRoom.siteName || '—' },
                                        { label: 'Tầng / Khu vực', value: detailRoom.areaName || '—' },
                                        { label: 'Vị trí chi tiết', value: detailRoom.locationDescription || '—' },
                                        { label: 'Trạng thái hành chính', value: ADMIN_STATUS_LABELS[detailRoom.administrativeStatus] || detailRoom.administrativeStatus || '—' }
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex justify-between text-xs">
                                            <span className="font-bold text-slate-blue uppercase">{label}</span>
                                            <span className="font-semibold text-midnight-indigo">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Equipment Panel */}
                                <div className="bg-slate-50/50 rounded-2xl border border-platinum-tint p-5 space-y-4">
                                    <h4 className="text-xs font-extrabold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint pb-2">Trang thiết bị khả dụng</h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { key: 'hasCamera', Icon: Video, label: 'Cảm biến Camera ghi hình' },
                                            { key: 'hasMicrophone', Icon: Mic, label: 'Hệ thống Microphone họp trực tuyến' },
                                            { key: 'hasDisplay', Icon: Monitor, label: 'Màn hình chiếu/TV hiển thị' },
                                            { key: 'allowRecording', Icon: Video, label: 'Cho phép ghi hình cuộc họp' },
                                        ].map(({ key, Icon, label }) => {
                                            const active = detailRoom[key];
                                            return (
                                                <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border text-xs transition-colors ${active ? 'border-action-blue bg-blue-50/50' : 'border-platinum-tint bg-white opacity-60'}`}>
                                                    <Icon className={`w-4 h-4 ${active ? 'text-action-blue' : 'text-steel-gray opacity-50'}`} />
                                                    <div>
                                                        <p className="font-bold text-midnight-indigo leading-tight">{label}</p>
                                                        <p className="text-[10px] text-slate-blue mt-0.5">{active ? 'Tích hợp sẵn' : 'Không hỗ trợ'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Upcoming Meetings Panel */}
                            <div className="bg-slate-50/50 rounded-2xl border border-platinum-tint p-5 space-y-3.5">
                                <h4 className="text-xs font-extrabold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint pb-2 flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-action-blue" />
                                    Lịch họp sắp tới
                                </h4>

                                {detailRoom.occupancyStatus?.currentBooking && (
                                    <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/60">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-0.5">Đang diễn ra</p>
                                            <p className="font-bold text-midnight-indigo text-xs truncate">{detailRoom.occupancyStatus.currentBooking.title || 'Cuộc họp'}</p>
                                            <p className="text-[11px] text-slate-blue mt-0.5">
                                                {detailRoom.occupancyStatus.currentBooking.hostName ? `Chủ trì: ${detailRoom.occupancyStatus.currentBooking.hostName} · ` : ''}
                                                {formatTimeRange(detailRoom.occupancyStatus.currentBooking.reservedStartTime, detailRoom.occupancyStatus.currentBooking.reservedEndTime)}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${MEETING_STATUS_CONFIG.in_progress.cls}`}>
                                            {MEETING_STATUS_CONFIG.in_progress.label}
                                        </span>
                                    </div>
                                )}

                                {detailRoom.upcomingBookings && detailRoom.upcomingBookings.length > 0 ? (
                                    <div className="space-y-2">
                                        {detailRoom.upcomingBookings.map((booking) => (
                                            <div key={booking.bookingId} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-platinum-tint bg-white">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-midnight-indigo text-xs truncate">{booking.title || 'Cuộc họp'}</p>
                                                    <p className="text-[11px] text-slate-blue mt-0.5">
                                                        {booking.hostName ? `Chủ trì: ${booking.hostName} · ` : ''}
                                                        {formatTimeRange(booking.reservedStartTime, booking.reservedEndTime)}
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${MEETING_STATUS_CONFIG.scheduled.cls}`}>
                                                    {MEETING_STATUS_CONFIG.scheduled.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    !detailRoom.occupancyStatus?.currentBooking && (
                                        <p className="text-xs text-slate-blue text-center py-4">Chưa có lịch họp nào sắp tới cho phòng này.</p>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex items-center justify-between gap-2 shrink-0">
                            <div className="flex items-center gap-2">
                                {readOnly ? null : detailRoom.administrativeStatus && detailRoom.administrativeStatus !== 'available' ? (
                                    <button
                                        onClick={() => handleSetAdministrativeStatus('available')}
                                        disabled={savingAdminStatus}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                                    >
                                        <Wrench className="w-3.5 h-3.5" /> Gỡ trạng thái đặc biệt
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleSetAdministrativeStatus('maintenance')}
                                            disabled={savingAdminStatus}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                        >
                                            <Wrench className="w-3.5 h-3.5" /> Đặt bảo trì
                                        </button>
                                        <button
                                            onClick={() => handleSetAdministrativeStatus('inactive')}
                                            disabled={savingAdminStatus}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                                        >
                                            Ngừng hoạt động
                                        </button>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => setDetailRoom(null)}
                                className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default RoomManagement;
