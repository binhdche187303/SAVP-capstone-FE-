import { AlertTriangle, Bell, Clock, Cpu, History, MapPin, MapPinOff, Mic, Monitor, Package, Plus, RefreshCw, Search, Speaker, Trash2, Video, Wrench, Check } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';

import { createPortal } from 'react-dom';
import { getEquipments, createEquipment, reportEquipmentFault, assignEquipment, unassignEquipment, deleteEquipment, confirmEquipmentFault, resolveEquipmentFault, getEquipmentFaultHistory, getRoomsMissingEquipment } from '../../service/equipmentServices';
import { getRooms } from '../../service/businessAdminServices';

const GAP_POLL_INTERVAL_MS = 30000;


const EquipmentManagement = () => {
    // Data states
    const [equipmentList, setEquipmentList] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters & Pagination
    const [search, setSearch] = useState('');
    const [equipmentType, setEquipmentType] = useState('');
    const [healthStatus, setHealthStatus] = useState('');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
    const [isConfirmFaultModalOpen, setIsConfirmFaultModalOpen] = useState(false);
    const [isResolveFaultModalOpen, setIsResolveFaultModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [equipmentToDelete, setEquipmentToDelete] = useState(null);
    const [isDeletingEquipment, setIsDeletingEquipment] = useState(false);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyEquipment, setHistoryEquipment] = useState(null);
    const [historyList, setHistoryList] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);

    const [isUnassignModalOpen, setIsUnassignModalOpen] = useState(false);
    const [equipmentToUnassign, setEquipmentToUnassign] = useState(null);
    const [isUnassigning, setIsUnassigning] = useState(false);

    // Banner "phòng thiếu thiết bị" — cập nhật gần-thời-gian-thực bằng polling
    const [gapRooms, setGapRooms] = useState([]);
    const [gapLoading, setGapLoading] = useState(false);
    const [isGapPanelOpen, setIsGapPanelOpen] = useState(false);
    const gapPollRef = useRef(null);

    // Form states
    const [createForm, setCreateForm] = useState({
        equipmentName: '',
        equipmentType: 'camera',
        equipmentCode: '',
        serialNumber: '',
        brand: '',
        model: '',
        purchaseDate: '',
        roomId: '',
        assignmentNote: ''
    });

    const [faultForm, setFaultForm] = useState({
        healthStatus: 'faulty',
        assetStatus: 'maintenance',
        issueNote: ''
    });

    const [confirmFaultForm, setConfirmFaultForm] = useState({
        confirmationNote: ''
    });

    const [resolveFaultForm, setResolveFaultForm] = useState({
        healthStatus: 'healthy',
        assetStatus: 'active',
        resolutionNote: ''
    });

    const [assignForm, setAssignForm] = useState({
        roomId: '',
        assignmentNote: ''
    });

    const fetchEquipments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = { page, limit, search, equipmentType, healthStatus };
            const res = await getEquipments(params);
            if (res?.success) {
                setEquipmentList(res.data || []);
                if (res.meta) {
                    setTotalPages(res.meta.totalPages || 1);
                    setTotalItems(res.meta.total || 0);
                }
            } else {
                setError(res?.message || 'Không thể lấy danh sách thiết bị.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi lấy danh sách thiết bị.');
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, equipmentType, healthStatus]);

    const fetchRooms = async () => {
        try {
            const res = await getRooms({ limit: 100 });
            if (res?.success) {
                setRooms(res.data || []);
            }
        } catch (err) {
            console.error('Lỗi tải danh sách phòng', err);
        }
    };

    const fetchGapRooms = useCallback(async () => {
        setGapLoading(true);
        try {
            const res = await getRoomsMissingEquipment();
            if (res?.success) {
                setGapRooms(res.data || []);
            }
        } catch (err) {
            console.error('Lỗi tải danh sách phòng thiếu thiết bị', err);
        } finally {
            setGapLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEquipments();
        fetchRooms();
    }, [fetchEquipments]);

    // Banner real-time: tải ngay khi vào trang + polling định kỳ để BA luôn thấy
    // phòng mới phát sinh thiếu thiết bị (vd: phòng khác vừa được đăng ký có mic/cam/tivi).
    useEffect(() => {
        fetchGapRooms();
        gapPollRef.current = setInterval(fetchGapRooms, GAP_POLL_INTERVAL_MS);
        return () => clearInterval(gapPollRef.current);
    }, [fetchGapRooms]);

    // Handle Create
    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            // Format lại equipmentCode: loại bỏ khoảng trắng thừa và thay các ký tự không hợp lệ bằng dấu gạch ngang
            let safeCode = createForm.equipmentCode.toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-');
            // Loại bỏ dấu gạch ngang ở đầu và cuối nếu có
            safeCode = safeCode.replace(/^-+|-+$/g, '');
            const formToSubmit = { ...createForm, equipmentCode: safeCode };

            // Loại bỏ các trường rỗng (đặc biệt là purchaseDate) để tránh lỗi Validate của DTO
            const payload = Object.fromEntries(
                Object.entries(formToSubmit).filter(([_, v]) => v !== '')
            );
            const res = await createEquipment(payload);
            if (res?.success) {
                setSuccessMessage(
                    payload.roomId
                        ? 'Tạo mới thiết bị và gán vào phòng thành công!'
                        : 'Tạo mới thiết bị thành công!'
                );
                setIsCreateModalOpen(false);
                fetchEquipments();
                fetchGapRooms();
                setCreateForm({
                    equipmentName: '', equipmentType: 'camera', equipmentCode: '',
                    serialNumber: '', brand: '', model: '', purchaseDate: '',
                    roomId: '', assignmentNote: ''
                });
            } else {
                setError(res?.message || 'Tạo thiết bị thất bại.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi tạo thiết bị.');
        }
    };

    // Handle Report Fault
    const handleFaultSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await reportEquipmentFault(selectedEquipment.id, faultForm);
            if (res?.success) {
                setSuccessMessage('Đã ghi nhận báo hỏng thiết bị!');
                setIsFaultModalOpen(false);
                fetchEquipments();
            } else {
                setError(res?.message || 'Báo hỏng thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi báo hỏng thiết bị.');
        }
    };

    // Handle Confirm Fault
    const handleConfirmFaultSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await confirmEquipmentFault(selectedEquipment.id, confirmFaultForm);
            if (res?.success) {
                setSuccessMessage('Đã xác nhận lỗi thiết bị thành công!');
                setIsConfirmFaultModalOpen(false);
                fetchEquipments();
            } else {
                setError(res?.message || 'Xác nhận lỗi thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi xác nhận lỗi thiết bị.');
        }
    };

    // Handle Resolve Fault
    const handleResolveFaultSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await resolveEquipmentFault(selectedEquipment.id, resolveFaultForm);
            if (res?.success) {
                setSuccessMessage('Đã cập nhật khắc phục lỗi thiết bị thành công!');
                setIsResolveFaultModalOpen(false);
                fetchEquipments();
            } else {
                setError(res?.message || 'Khắc phục lỗi thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi khắc phục lỗi thiết bị.');
        }
    };

    // Handle Assign
    const handleAssignSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await assignEquipment(selectedEquipment.id, assignForm);
            if (res?.success) {
                setSuccessMessage('Gán thiết bị vào phòng thành công!');
                setIsAssignModalOpen(false);
                fetchEquipments();
                fetchGapRooms();
            } else {
                setError(res?.message || 'Gán thiết bị thất bại.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi gán thiết bị.');
        }
    };

    // Handle Unassign
    const handleUnassignClick = (equipment) => {
        setEquipmentToUnassign(equipment);
        setIsUnassignModalOpen(true);
    };

    const handleConfirmUnassign = async () => {
        if (!equipmentToUnassign) return;
        setIsUnassigning(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await unassignEquipment(equipmentToUnassign.id);
            if (res?.success) {
                setSuccessMessage(`Đã gỡ thiết bị ${equipmentToUnassign.equipmentName} khỏi phòng.`);
                setIsUnassignModalOpen(false);
                fetchEquipments();
                fetchGapRooms();
            } else {
                setError(res?.message || 'Gỡ thiết bị khỏi phòng thất bại.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi gỡ thiết bị khỏi phòng.');
        } finally {
            setIsUnassigning(false);
            setEquipmentToUnassign(null);
        }
    };

    // Handle Delete
    const handleDeleteClick = (equipment) => {
        setEquipmentToDelete(equipment);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!equipmentToDelete) return;
        setIsDeletingEquipment(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await deleteEquipment(equipmentToDelete.id);
            if (res?.success) {
                setSuccessMessage(`Đã xoá thiết bị ${equipmentToDelete.equipmentName} thành công.`);
                setIsDeleteModalOpen(false);
                fetchEquipments();
                fetchGapRooms();
            } else {
                setError(res?.message || 'Không thể xoá thiết bị này.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi xoá thiết bị.');
        } finally {
            setIsDeletingEquipment(false);
            setEquipmentToDelete(null);
        }
    };

    const openHistoryModal = async (eq) => {
        setHistoryEquipment(eq);
        setIsHistoryModalOpen(true);
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const res = await getEquipmentFaultHistory(eq.id);
            if (res?.success) {
                setHistoryList(res.data || []);
            } else {
                setHistoryError(res?.message || 'Không thể tải lịch sử báo hỏng.');
            }
        } catch (err) {
            setHistoryError(err?.message || 'Lỗi khi tải lịch sử báo hỏng.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const getHistoryEventMeta = (eventType) => {
        switch (eventType) {
            case 'reported': return { label: 'Báo hỏng', icon: <AlertTriangle className="w-4 h-4" />, cls: 'bg-red-50 text-red-600 border-red-100' };
            case 'confirmed': return { label: 'Xác nhận lỗi', icon: <Check className="w-4 h-4" />, cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
            case 'resolved': return { label: 'Đã khắc phục', icon: <RefreshCw className="w-4 h-4" />, cls: 'bg-blue-50 text-blue-600 border-blue-100' };
            default: return { label: eventType, icon: <Clock className="w-4 h-4" />, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
    };

    const fmtDateTime = (iso) =>
        iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

    const getEquipmentIcon = (type) => {
        switch(type) {
            case 'camera': return <Video className="w-5 h-5 text-action-blue" />;
            case 'microphone': return <Mic className="w-5 h-5 text-orange-500" />;
            case 'display': return <Monitor className="w-5 h-5 text-purple-500" />;
            case 'speaker': return <Speaker className="w-5 h-5 text-green-500" />;
            case 'capture_agent': return <Cpu className="w-5 h-5 text-red-500" />;
            default: return <Package className="w-5 h-5 text-slate-blue" />;
        }
    };

    const getTypeLabel = (type) => {
        const labels = {
            'camera': 'Camera',
            'microphone': 'Microphone',
            'display': 'Màn hình/Tivi',
            'speaker': 'Loa',
            'capture_agent': 'Bộ xử lý (Agent)',
            'sensor': 'Cảm biến',
            'other': 'Khác'
        };
        return labels[type] || type;
    };

    // Thiết bị mới tạo mặc định healthStatus = 'unknown' (chưa từng kiểm tra) — KHÔNG
    // phải là lỗi. Trước đây badge coi mọi giá trị khác 'healthy'/'warning' là "Lỗi"
    // (đỏ), khiến thiết bị vừa đăng ký hiển thị nhầm là hỏng.
    const getHealthStatusMeta = (status) => {
        switch (status) {
            case 'healthy': return { label: 'Tốt', cls: 'bg-green-100 text-green-700' };
            case 'warning': return { label: 'Cảnh báo', cls: 'bg-yellow-100 text-yellow-700' };
            case 'faulty': return { label: 'Lỗi', cls: 'bg-red-100 text-red-700' };
            case 'offline': return { label: 'Mất kết nối', cls: 'bg-red-100 text-red-700' };
            default: return { label: 'Chưa xác định', cls: 'bg-gray-100 text-gray-600' };
        }
    };

    // Chỉ coi la co "loi dang cho xu ly" (hien nut Xac nhan hong / Cap nhat sua xong)
    // voi 3 trang thai that su bat thuong — KHONG bao gom 'unknown' (thiet bi moi,
    // chua tung bao loi; backend cung tu choi 409 EQUIPMENT_NO_ACTIVE_FAULT neu bam).
    const hasActiveFault = (status) => ['warning', 'faulty', 'offline'].includes(status);

    return (
        <div className="p-6 h-full flex flex-col bg-snow-white">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 animate-fade-in-up">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Monitor className="w-3.5 h-3.5" />
                        Thiết bị
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý Trang thiết bị</h1>
                    <p className="text-sm text-slate-blue mt-1">Quản lý danh sách, điều phối phòng và theo dõi tình trạng thiết bị.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsGapPanelOpen(true)}
                        className={`relative inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all shadow-sm hover:shadow hover:-translate-y-0.5 ${
                            gapRooms.length > 0
                                ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                                : 'bg-white border-platinum-tint text-slate-blue hover:bg-cloud-mist'
                        }`}
                        title="Phòng đã đăng ký thiết bị nhưng chưa được gán đủ"
                    >
                        <Bell className={`w-4 h-4 mr-2 ${gapRooms.length > 0 ? 'animate-pulse' : ''}`} />
                        Phòng thiếu thiết bị
                        {gapRooms.length > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold shadow-sm">
                                {gapRooms.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center px-4 py-2.5 bg-action-blue text-white rounded-xl text-sm font-semibold hover:bg-glacier-blue transition-all shadow-sm hover:shadow hover:-translate-y-0.5"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Thêm thiết bị
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-xl flex items-start animate-fade-in-up">
                    <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}
            
            {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium animate-fade-in-up">
                    {successMessage}
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm-1 border border-platinum-tint flex flex-col flex-1 overflow-hidden animate-fade-in-up delay-100">
                <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[250px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue" />
                        <input 
                            type="text" 
                            placeholder="Tìm theo tên, mã thiết bị..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchEquipments()}
                            className="w-full pl-9 pr-4 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                        />
                    </div>
                    <select
                        value={equipmentType}
                        onChange={(e) => { setEquipmentType(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả loại thiết bị</option>
                        <option value="camera">Camera</option>
                        <option value="microphone">Microphone</option>
                        <option value="display">Màn hình</option>
                        <option value="speaker">Loa</option>
                        <option value="capture_agent">Bộ xử lý</option>
                    </select>
                    <select
                        value={healthStatus}
                        onChange={(e) => { setHealthStatus(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả tình trạng</option>
                        <option value="healthy">Tốt</option>
                        <option value="warning">Cảnh báo</option>
                        <option value="faulty">Lỗi</option>
                        <option value="offline">Mất kết nối (Offline)</option>
                    </select>
                    <button 
                        onClick={fetchEquipments}
                        className="p-2 border border-platinum-tint rounded-xl hover:bg-cloud-mist text-slate-blue transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left min-w-[900px]">
                        <thead className="sticky top-0 bg-white shadow-sm z-10">
                            <tr className="border-b border-platinum-tint text-xs font-bold text-slate-blue uppercase tracking-wider">
                                <th className="p-4">Thiết bị</th>
                                <th className="p-4">Mã định danh</th>
                                <th className="p-4">Loại</th>
                                <th className="p-4">Tình trạng</th>
                                <th className="p-4">Phòng gắn</th>
                                <th className="p-4 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint/50">
                            {loading ? (
                                Array(5).fill(0).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-32"></div></td>
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-20"></div></td>
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-cloud-mist rounded w-12 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : equipmentList.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-blue">
                                            <Package className="w-12 h-12 mb-3 opacity-50" />
                                            <p className="text-sm font-medium">Không tìm thấy thiết bị nào.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                equipmentList.map(eq => {
                                    const assignedRoom = rooms.find(r => r.roomId === eq.currentRoomId);
                                    return (
                                    <tr key={eq.id} className="hover:bg-cloud-mist/20 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-cloud-mist flex items-center justify-center flex-shrink-0">
                                                    {getEquipmentIcon(eq.equipmentType)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm text-midnight-indigo">{eq.equipmentName}</p>
                                                    <p className="text-xs text-slate-blue line-clamp-1">{eq.brand || 'N/A'} - {eq.model || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <p className="text-sm font-medium text-midnight-indigo">{eq.equipmentCode}</p>
                                            <p className="text-xs text-slate-blue">SN: {eq.serialNumber || 'N/A'}</p>
                                        </td>
                                        <td className="p-4 text-sm text-slate-blue">
                                            {getTypeLabel(eq.equipmentType)}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${getHealthStatusMeta(eq.healthStatus).cls}`}>
                                                {getHealthStatusMeta(eq.healthStatus).label}
                                            </span>
                                            {eq.assetStatus === 'maintenance' && (
                                                <span className="inline-flex items-center px-2 py-1 ml-2 rounded-md text-xs font-semibold bg-gray-100 text-gray-700">
                                                    Bảo trì
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {assignedRoom ? (
                                                <div className="flex items-center text-sm text-midnight-indigo">
                                                    <MapPin className="w-4 h-4 mr-1 text-slate-blue" />
                                                    {assignedRoom.roomName}
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-blue italic">Chưa gán</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => { setSelectedEquipment(eq); setAssignForm({ roomId: eq.currentRoomId || '', assignmentNote: '' }); setIsAssignModalOpen(true); }}
                                                className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors mr-1"
                                                title="Gán vào phòng"
                                            >
                                                <MapPin className="w-4 h-4" />
                                            </button>
                                            {eq.currentRoomId && (
                                                <button
                                                    onClick={() => handleUnassignClick(eq)}
                                                    className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-red-500 hover:bg-red-50 transition-colors mr-1"
                                                    title="Gỡ khỏi phòng"
                                                >
                                                    <MapPinOff className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setSelectedEquipment(eq); setIsFaultModalOpen(true); }}
                                                className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-orange-500 hover:bg-orange-50 transition-colors mr-1"
                                                title="Báo hỏng / Bảo trì"
                                            >
                                                <Wrench className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => openHistoryModal(eq)}
                                                className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-purple-500 hover:bg-purple-50 transition-colors mr-1"
                                                title="Lịch sử báo hỏng"
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                            {hasActiveFault(eq.healthStatus) && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedEquipment(eq);
                                                            setConfirmFaultForm({ confirmationNote: '' });
                                                            setIsConfirmFaultModalOpen(true);
                                                        }}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-emerald-500 hover:bg-emerald-50 transition-colors mr-1"
                                                        title="Xác nhận hỏng"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedEquipment(eq);
                                                            const defaultAction = ['maintenance', 'retired'].includes(eq.assetStatus) ? eq.assetStatus : 'active';
                                                            setResolveFaultForm({ healthStatus: 'healthy', assetStatus: defaultAction, resolutionNote: '' });
                                                            setIsResolveFaultModalOpen(true);
                                                        }}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-blue-500 hover:bg-blue-50 transition-colors mr-1"
                                                        title="Cập nhật sửa xong"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => handleDeleteClick(eq)}
                                                className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-red-500 hover:bg-red-50 transition-colors"
                                                title="Xoá thiết bị"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                        <span className="text-xs text-slate-blue">
                            Hiển thị {equipmentList.length} trên tổng số {totalItems} thiết bị
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(p - 1, 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <span className="px-3 py-1.5 text-xs font-bold text-midnight-indigo">
                                Trang {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Tiếp
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CREATE MODAL */}
            {isCreateModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Đăng ký thiết bị mới</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên thiết bị <span className="text-red-500">*</span></label>
                                <input required type="text" value={createForm.equipmentName} onChange={e => setCreateForm({...createForm, equipmentName: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Camera góc trái" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã thiết bị <span className="text-red-500">*</span></label>
                                    <input required type="text" value={createForm.equipmentCode} onChange={e => setCreateForm({...createForm, equipmentCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="CAM-01" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại thiết bị</label>
                                    <select value={createForm.equipmentType} onChange={e => setCreateForm({...createForm, equipmentType: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm">
                                        <option value="camera">Camera</option>
                                        <option value="microphone">Microphone</option>
                                        <option value="display">Màn hình</option>
                                        <option value="speaker">Loa</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Hãng sản xuất</label>
                                    <input type="text" value={createForm.brand} onChange={e => setCreateForm({...createForm, brand: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Model</label>
                                    <input type="text" value={createForm.model} onChange={e => setCreateForm({...createForm, model: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" />
                                </div>
                            </div>
                            <div className="pt-3 border-t border-platinum-tint">
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Gán vào phòng ngay (không bắt buộc)</label>
                                <select
                                    value={createForm.roomId}
                                    onChange={e => setCreateForm({...createForm, roomId: e.target.value})}
                                    className="w-full px-3 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue bg-white text-midnight-indigo cursor-pointer shadow-sm"
                                >
                                    <option value="">-- Chưa gán phòng --</option>
                                    {rooms.map(r => (
                                        <option key={r.roomId} value={r.roomId}>{r.roomName}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-blue mt-1">Hệ thống sẽ chặn nếu phòng chưa đăng ký loại thiết bị này.</p>
                            </div>
                            {createForm.roomId && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Ghi chú cài đặt</label>
                                    <input type="text" value={createForm.assignmentNote} onChange={e => setCreateForm({...createForm, assignmentNote: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Gắn trên trần nhà" />
                                </div>
                            )}
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue">Tạo mới</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ASSIGN MODAL */}
            {isAssignModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Gán phòng cho thiết bị</h3>
                            <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">✕</button>
                        </div>
                        <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue">Mã: {selectedEquipment.equipmentCode}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Chọn phòng họp <span className="text-red-500">*</span></label>
                                <select 
                                    required 
                                    value={assignForm.roomId} 
                                    onChange={e => setAssignForm({...assignForm, roomId: e.target.value})} 
                                    className="w-full px-3 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue bg-white text-midnight-indigo cursor-pointer shadow-sm"
                                >
                                    <option value="" disabled>-- Chọn phòng --</option>
                                    {rooms.map(r => (
                                        <option key={r.roomId} value={r.roomId}>{r.roomName}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Ghi chú cài đặt</label>
                                <input type="text" value={assignForm.assignmentNote} onChange={e => setAssignForm({...assignForm, assignmentNote: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Gắn trên trần nhà" />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue">Xác nhận</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* FAULT MODAL */}
            {isFaultModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-red-50">
                            <h3 className="font-bold text-red-700">Báo hỏng / Bảo trì thiết bị</h3>
                            <button onClick={() => setIsFaultModalOpen(false)} className="text-red-700 hover:text-red-900">✕</button>
                        </div>
                        <form onSubmit={handleFaultSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue">Mã: {selectedEquipment.equipmentCode}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tình trạng</label>
                                    <select value={faultForm.healthStatus} onChange={e => setFaultForm({...faultForm, healthStatus: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm">
                                        <option value="warning">Cảnh báo</option>
                                        <option value="faulty">Lỗi</option>
                                        <option value="offline">Mất kết nối</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Hành động</label>
                                    <select value={faultForm.assetStatus} onChange={e => setFaultForm({...faultForm, assetStatus: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm">
                                        <option value="active">Tiếp tục sử dụng</option>
                                        <option value="maintenance">Đưa vào bảo trì</option>
                                        <option value="retired">Thanh lý</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Ghi chú lỗi <span className="text-red-500">*</span></label>
                                <textarea required rows="3" value={faultForm.issueNote} onChange={e => setFaultForm({...faultForm, issueNote: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Mô tả tình trạng lỗi..." />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsFaultModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700">Lưu thông tin</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* CONFIRM FAULT MODAL */}
            {isConfirmFaultModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-emerald-50">
                            <h3 className="font-bold text-emerald-700 flex items-center gap-1.5">
                                <Check className="w-5 h-5" /> Xác nhận lỗi thiết bị
                            </h3>
                            <button onClick={() => setIsConfirmFaultModalOpen(false)} className="text-emerald-700 hover:text-emerald-900">✕</button>
                        </div>
                        <form onSubmit={handleConfirmFaultSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4 text-xs">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue mt-0.5">Mã: {selectedEquipment.equipmentCode} • Trạng thái lỗi: <span className="text-red-500 font-semibold">{getHealthStatusMeta(selectedEquipment.healthStatus).label}</span></p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Ghi chú xác nhận lỗi (Không bắt buộc)</label>
                                <textarea rows="3" value={confirmFaultForm.confirmationNote} onChange={e => setConfirmFaultForm({confirmationNote: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Nhập ghi chú kiểm tra thực tế..." />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsConfirmFaultModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Xác nhận lỗi thật</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* RESOLVE FAULT MODAL */}
            {isResolveFaultModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-blue-50">
                            <h3 className="font-bold text-blue-700 flex items-center gap-1.5">
                                <RefreshCw className="w-4 h-4" /> Cập nhật kết quả sửa chữa
                            </h3>
                            <button onClick={() => setIsResolveFaultModalOpen(false)} className="text-blue-700 hover:text-blue-900">✕</button>
                        </div>
                        <form onSubmit={handleResolveFaultSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue mt-0.5">Mã: {selectedEquipment.equipmentCode}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tình trạng sức khỏe <span className="text-red-500">*</span></label>
                                    <select required value={resolveFaultForm.healthStatus} onChange={e => setResolveFaultForm({...resolveFaultForm, healthStatus: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white">
                                        <option value="healthy">Tốt (Healthy)</option>
                                        <option value="warning">Cảnh báo (Warning)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Trạng thái vận hành</label>
                                    <select value={resolveFaultForm.assetStatus} onChange={e => setResolveFaultForm({...resolveFaultForm, assetStatus: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white">
                                        <option value="active">Hoạt động (Active)</option>
                                        <option value="maintenance">Bảo trì (Maintenance)</option>
                                        <option value="retired">Thanh lý (Retired)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Ghi chú khắc phục lỗi <span className="text-red-500">*</span></label>
                                <textarea required rows="3" value={resolveFaultForm.resolutionNote} onChange={e => setResolveFaultForm({...resolveFaultForm, resolutionNote: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Nhập chi tiết đã sửa chữa hoặc thay thế những gì..." />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsResolveFaultModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700">Lưu thông tin</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* DELETE EQUIPMENT MODAL */}
            {isDeleteModalOpen && equipmentToDelete && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-sm w-full flex flex-col overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-midnight-indigo mb-2">Xác nhận xoá thiết bị</h3>
                            <p className="text-sm text-slate-blue mb-1">
                                Bạn có chắc chắn muốn xoá thiết bị <span className="font-bold text-midnight-indigo">{equipmentToDelete.equipmentName}</span>?
                            </p>
                            <p className="text-[11px] text-red-500 bg-red-50 p-2 rounded-lg mt-3 text-left">
                                Lưu ý: Thao tác này sẽ xoá hoàn toàn thiết bị khỏi hệ thống và không thể khôi phục. Hãy chắc chắn thiết bị không còn được sử dụng.
                            </p>
                        </div>
                        <div className="p-4 bg-cloud-mist/30 border-t border-platinum-tint flex justify-end gap-3">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                disabled={isDeletingEquipment}
                                className="px-4 py-2 bg-white border border-platinum-tint text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeletingEquipment}
                                className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white font-semibold rounded-xl text-sm shadow-sm hover:bg-red-700 disabled:opacity-50 min-w-[100px]"
                            >
                                {isDeletingEquipment ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Xoá vĩnh viễn'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* UNASSIGN CONFIRM MODAL */}
            {isUnassignModalOpen && equipmentToUnassign && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-sm w-full flex flex-col overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MapPinOff className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-midnight-indigo mb-2">Gỡ thiết bị khỏi phòng</h3>
                            <p className="text-sm text-slate-blue mb-1">
                                Gỡ thiết bị <span className="font-bold text-midnight-indigo">{equipmentToUnassign.equipmentName}</span> khỏi phòng đang gán?
                            </p>
                            <p className="text-[11px] text-slate-blue bg-cloud-mist/50 p-2 rounded-lg mt-3 text-left">
                                Thiết bị sẽ trở về trạng thái chưa gán phòng. Bạn có thể gán lại vào phòng khác bất cứ lúc nào.
                            </p>
                        </div>
                        <div className="p-4 bg-cloud-mist/30 border-t border-platinum-tint flex justify-end gap-3">
                            <button
                                onClick={() => { setIsUnassignModalOpen(false); setEquipmentToUnassign(null); }}
                                disabled={isUnassigning}
                                className="px-4 py-2 bg-white border border-platinum-tint text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleConfirmUnassign}
                                disabled={isUnassigning}
                                className="inline-flex items-center justify-center px-4 py-2 bg-orange-500 text-white font-semibold rounded-xl text-sm shadow-sm hover:bg-orange-600 disabled:opacity-50 min-w-[100px]"
                            >
                                {isUnassigning ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Gỡ khỏi phòng'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ROOMS MISSING EQUIPMENT PANEL */}
            {isGapPanelOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-lg w-full flex flex-col max-h-[85vh]">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-orange-50">
                            <div>
                                <h3 className="font-bold text-orange-700 flex items-center gap-1.5">
                                    <Bell className="w-4 h-4" /> Phòng thiếu thiết bị
                                </h3>
                                <p className="text-xs text-slate-blue mt-0.5">
                                    Phòng đã đăng ký có camera/microphone/tivi nhưng chưa được gán đủ thiết bị thực tế
                                </p>
                            </div>
                            <button onClick={() => setIsGapPanelOpen(false)} className="text-orange-700 hover:text-orange-900">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {gapLoading && gapRooms.length === 0 ? (
                                <div className="space-y-3">
                                    {Array(3).fill(0).map((_, idx) => (
                                        <div key={idx} className="h-16 rounded-xl bg-cloud-mist animate-pulse" />
                                    ))}
                                </div>
                            ) : gapRooms.length === 0 ? (
                                <div className="text-center py-8">
                                    <Check className="w-10 h-10 mb-3 mx-auto text-green-500" />
                                    <p className="text-sm text-slate-blue">Tất cả phòng đã đăng ký thiết bị đều đã được gán đủ.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {gapRooms.map((room) => (
                                        <li key={room.roomId} className="p-3 rounded-xl border border-orange-100 bg-orange-50/60">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold text-midnight-indigo">{room.roomName}</span>
                                                <span className="text-[11px] text-slate-blue">{room.roomCode}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(room.missingTypeLabels || []).map((label) => (
                                                    <span key={label} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                                        Thiếu {label}
                                                    </span>
                                                ))}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* FAULT HISTORY MODAL */}
            {isHistoryModalOpen && historyEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-lg w-full flex flex-col max-h-[85vh]">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo flex items-center gap-1.5">
                                    <History className="w-4 h-4" /> Lịch sử báo hỏng
                                </h3>
                                <p className="text-xs text-slate-blue mt-0.5">{historyEquipment.equipmentName} • {historyEquipment.equipmentCode}</p>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {historyLoading ? (
                                <div className="space-y-3">
                                    {Array(3).fill(0).map((_, idx) => (
                                        <div key={idx} className="h-16 rounded-xl bg-cloud-mist animate-pulse" />
                                    ))}
                                </div>
                            ) : historyError ? (
                                <div className="p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-xl flex items-start">
                                    <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm">{historyError}</p>
                                </div>
                            ) : historyList.length === 0 ? (
                                <div className="text-center py-8">
                                    <History className="w-10 h-10 mb-3 mx-auto text-slate-blue opacity-50" />
                                    <p className="text-sm text-slate-blue">Thiết bị này chưa từng được báo hỏng.</p>
                                </div>
                            ) : (
                                <ol className="space-y-4">
                                    {historyList.map((item) => {
                                        const meta = getHistoryEventMeta(item.eventType);
                                        return (
                                            <li key={item.id} className={`p-3 rounded-xl border ${meta.cls}`}>
                                                <div className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                                                        {meta.icon} {meta.label}
                                                    </span>
                                                    <span className="text-[11px] text-slate-blue">{fmtDateTime(item.createdAt)}</span>
                                                </div>
                                                <p className="text-sm text-midnight-indigo mt-1.5">
                                                    <span className="font-semibold">{item.actorName || 'Không rõ người thực hiện'}</span>
                                                </p>
                                                {item.location && (
                                                    <p className="text-xs text-midnight-indigo mt-1 flex items-center gap-1">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-blue" />
                                                        {[item.location.roomName, item.location.areaName, item.location.siteName].filter(Boolean).join(' • ')}
                                                    </p>
                                                )}
                                                {item.note && (
                                                    <p className="text-xs text-slate-blue mt-1 whitespace-pre-wrap">{item.note}</p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default EquipmentManagement;
