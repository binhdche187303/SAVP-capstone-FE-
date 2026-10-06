import { AlertTriangle, CheckCircle, CheckSquare, Clock, Download, Edit3, Eye, Filter, RefreshCw, Search, Shield, ShieldAlert, Image as ImageIcon, Users, Car, Tag, User, AlertCircle } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';

import {
    getSecurityAlerts, acknowledgeSecurityAlert,
    resolveSecurityAlert, bulkAcknowledgeSecurityAlerts
} from '../../service/securityAlertService';
import ExportReportModal from '../../components/common/ExportReportModal';
import { getZones } from '../../service/zoneServices';
import { getUserById } from '../../service/sysAdminServices';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import Pagination from '../../components/common/Pagination';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';

const FALLBACK_POLL_MS = 30000;
const WS_BATCH_MS = 1500;
const SOUND_THROTTLE_MS = 5000;
const HIGH_SEVERITIES = new Set(['high', 'critical']);

// Tiếng "ting" ngắn bằng WebAudio (không cần file âm thanh). Trình duyệt có thể chặn
// khi người dùng chưa tương tác với trang — bỏ qua lỗi, không ảnh hưởng hiển thị.
const playAlertSound = () => {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
        osc.onended = () => ctx.close();
    } catch {
        // ignore
    }
};

// Biển số nằm ở payload_json gốc (được lưu ngay từ lần vi phạm đầu tiên, occurrence_count=1),
// KHÔNG chỉ trong payload_json.occurrences[] (chỉ có từ lần vi phạm thứ 2 trở đi).
const getAlertPlateNumber = (alert) => alert?.payload_json?.plateNumber || null;

// Extract all valid event snapshot IDs from an alert's payload and source.
// [FIX] Loại trùng sourceEventId — BE (bumpOccurrence()) có thể ghi 2 entry trùng hệt
// {userId, occurredAt, sourceEventId} cho CÙNG 1 sự kiện thật khi occurrence không có
// userId (người lạ hoàn toàn — debounce chống trùng ở BE chỉ so khớp khi userId khác
// null, xem AlertsService.bumpOccurrence(), KHÔNG sửa ở đây — ngoài phạm vi FE). Chưa
// dedupe khiến cùng 1 ảnh hiện lặp lại trong stack + số đếm ở badge bị thổi phồng so
// với số ảnh THẬT SỰ khác nhau.
const getAlertImages = (alert) => {
    if (!alert) return [];
    const occurrences = alert.payload_json?.occurrences || [];
    const ids = occurrences.map(occ => occ.sourceEventId).filter(Boolean);
    if (alert.source_event_id && !ids.includes(alert.source_event_id)) {
        ids.unshift(alert.source_event_id);
    }
    return [...new Set(ids)];
};

// Stack component to display stacked event snapshots
const AlertImagesStack = ({ alert, onClick }) => {
    const ids = getAlertImages(alert);

    if (ids.length === 0) {
        return (
            <div className="w-32 md:w-40 aspect-video bg-slate-100 rounded-lg flex flex-col items-center justify-center border border-slate-200 mx-auto select-none">
                <ImageIcon className="w-4.5 h-4.5 text-slate-400" />
                <span className="text-[8px] text-slate-400 mt-1 uppercase font-bold tracking-wider">Không ảnh</span>
            </div>
        );
    }

    if (ids.length === 1) {
        return (
            <div className="relative w-32 md:w-40 aspect-video mx-auto">
                <ThumbnailImage
                    eventId={ids[0]}
                    onClick={onClick}
                    className="w-full h-full object-cover rounded-lg"
                />
            </div>
        );
    }

    return (
        <div 
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
            className="relative w-32 md:w-40 aspect-video mx-auto cursor-pointer group select-none"
        >
            {/* Third photo (bottom-most) */}
            {ids.length > 2 && (
                <div 
                    className="absolute inset-0 rounded-lg shadow-sm transition-all duration-300 group-hover:-translate-y-2 group-hover:translate-x-2 group-hover:rotate-[6deg]"
                    style={{
                        transform: 'translate(8px, -8px) rotate(4deg)',
                        zIndex: 10,
                        opacity: 0.7
                    }}
                >
                    <ThumbnailImage
                        eventId={ids[2]}
                        className="w-full h-full object-cover rounded-lg border-0 pointer-events-none"
                    />
                </div>
            )}
            
            {/* Second photo (middle) */}
            <div 
                className="absolute inset-0 rounded-lg shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:rotate-[3deg]"
                style={{
                    transform: 'translate(4px, -4px) rotate(-3deg)',
                    zIndex: 20,
                    opacity: 0.9
                }}
            >
                <ThumbnailImage
                    eventId={ids[1]}
                    className="w-full h-full object-cover rounded-lg border-0 pointer-events-none"
                />
            </div>

            {/* Top photo (main) */}
            <div 
                className="absolute inset-0 bg-white rounded-lg shadow-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:rotate-0 z-30 overflow-hidden"
            >
                <ThumbnailImage
                    eventId={ids[0]}
                    className="w-full h-full object-cover rounded-lg pointer-events-none"
                />
                
                {/* Count badge */}
                <div className="absolute bottom-1.5 right-1.5 bg-slate-950/80 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md border border-white/10">
                    <ImageIcon className="w-3.5 h-3.5 text-white/90" />
                    <span>{ids.length}</span>
                </div>
            </div>
        </div>
    );
};

const SecurityAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [searchParams] = useSearchParams();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Pagination & Filters
    const [filters, setFilters] = useState({
        page: 1,
        limit: 10,
        status: '',
        alert_type: '',
        // Bản đồ khuôn viên mở trang này kèm ?zone_id=… để lọc sẵn theo khu vực.
        zone_id: searchParams.get('zone_id') || ''
    });
    const [meta, setMeta] = useState(null);

    // Bulk selection
    const [selectedIds, setSelectedIds] = useState([]);

    // Modals
    const [resolveModal, setResolveModal] = useState({ open: false, alert: null });
    const [resolutionNote, setResolutionNote] = useState('');

    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [snapshotEventIds, setSnapshotEventIds] = useState([]);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

    const [isExportOpen, setIsExportOpen] = useState(false);

    // FE-AC: Occurrences detail modal
    const [occurrencesModal, setOccurrencesModal] = useState({ open: false, alert: null });

    // FE-AC: modal xem lịch sử xử lý (tiếp nhận/đóng) của alert đã resolved
    const [historyModal, setHistoryModal] = useState({ open: false, alert: null });
    const [userNamesCache, setUserNamesCache] = useState({});

    const resolveUserName = useCallback(async (userId) => {
        if (!userId || userNamesCache[userId]) return;
        try {
            const res = await getUserById(userId);
            if (res?.success && res.data) {
                const name = res.data.fullName || res.data.email || userId;
                setUserNamesCache(prev => ({ ...prev, [userId]: name }));
            }
        } catch (e) {
            console.error(e);
        }
    }, [userNamesCache]);

    const getUserDisplay = (userId) => userId ? (userNamesCache[userId] || userId) : null;

    const fetchZones = async () => {
        try {
            const res = await getZones({ limit: 100 });
            if (res?.success) setZones(res.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchAlerts = useCallback(async (currentFilters = filters, silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await getSecurityAlerts(currentFilters);
            if (res?.success) {
                setAlerts(res.data || []);
                setMeta(res.meta);
            } else {
                setError(res?.message || 'Không thể tải danh sách cảnh báo.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchZones();
    }, []);

    useEffect(() => {
        fetchAlerts(filters);

        // Polling dự phòng 30s (khi mất WS) — nguồn cập nhật chính là WS bên dưới.
        const intervalId = setInterval(() => {
            fetchAlerts(filters, true);
        }, FALLBACK_POLL_MS);

        return () => clearInterval(intervalId);
    }, [filters, fetchAlerts]);

    // Realtime: BE phát `security.alert.new` khi có cảnh báo MỚI. Gom lô (nhiều camera
    // báo cùng lúc → chỉ tải lại 1 lần); banner góc màn hình đã có sẵn qua
    // notification.created, ở đây thêm âm thanh cho mức cao (giới hạn tần suất).
    useEffect(() => {
        let batchTimer = null;
        let lastSoundAt = 0;
        const unsubscribe = subscribeToSecurityAlerts((evt) => {
            if (HIGH_SEVERITIES.has(evt?.severity) && Date.now() - lastSoundAt > SOUND_THROTTLE_MS) {
                lastSoundAt = Date.now();
                playAlertSound();
            }
            if (batchTimer) return;
            batchTimer = setTimeout(() => {
                batchTimer = null;
                fetchAlerts(filters, true);
            }, WS_BATCH_MS);
        });
        return () => {
            unsubscribe();
            if (batchTimer) clearTimeout(batchTimer);
        };
    }, [filters, fetchAlerts]);

    useEffect(() => {
        if (successMessage || error) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, error]);

    const handleFilterChange = (key, value) => {
        // [FIX] Object literal { ...prev, [key]: value, page: 1 } — khi key='page' (đổi
        // trang), 'page: 1' viết SAU '[key]: value' trong CÙNG object literal nên đè mất
        // giá trị page vừa set (JS: key trùng trong 1 literal, giá trị SAU CÙNG thắng) →
        // bấm "Sau"/số trang nào cũng bị kéo về trang 1. Chỉ ép page=1 khi đổi filter KHÁC
        // page (status/alert_type/zone_id) — đổi chính page thì giữ nguyên giá trị mới.
        setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
        setSelectedIds([]); // reset selection when filter changes
    };

    const handleAcknowledge = async (id) => {
        setActionLoading(true);
        try {
            const res = await acknowledgeSecurityAlert(id);
            if (res?.success) {
                setSuccessMessage('Đã xác nhận cảnh báo.');
                fetchAlerts();
            } else {
                setError(res?.message || 'Lỗi khi xác nhận.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleBulkAcknowledge = async () => {
        if (selectedIds.length === 0) return;
        setActionLoading(true);
        try {
            const res = await bulkAcknowledgeSecurityAlerts({ ids: selectedIds });
            if (res?.success) {
                setSuccessMessage(`Đã xác nhận ${selectedIds.length} cảnh báo.`);
                setSelectedIds([]);
                fetchAlerts();
            } else {
                setError(res?.message || 'Lỗi xác nhận hàng loạt.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        } finally {
            setActionLoading(false);
        }
    };

    const openResolveModal = (alert) => {
        setResolveModal({ open: true, alert });
        setResolutionNote('');
        resolveUserName(alert.acknowledged_by);
    };

    const openHistoryModal = (alert) => {
        setHistoryModal({ open: true, alert });
        resolveUserName(alert.acknowledged_by);
        resolveUserName(alert.resolved_by);
    };

    const handleResolve = async (e) => {
        e.preventDefault();
        if (!resolutionNote.trim()) {
            setError('Vui lòng nhập ghi chú xử lý.');
            return;
        }
        setActionLoading(true);
        try {
            const res = await resolveSecurityAlert(resolveModal.alert.id, { resolution_note: resolutionNote });
            if (res?.success) {
                setSuccessMessage('Đã xử lý cảnh báo thành công.');
                setResolveModal({ open: false, alert: null });
                fetchAlerts();
            } else {
                setError(res?.message || 'Lỗi khi xử lý.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        } finally {
            setActionLoading(false);
        }
    };

    const toggleSelect = (id, status) => {
        if (status !== 'new') return; // Chỉ cho phép chọn status 'new'
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        const newAlerts = alerts.filter(a => a.status === 'new');
        if (selectedIds.length === newAlerts.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(newAlerts.map(a => a.id));
        }
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return 'N/A';
        const d = new Date(isoString);
        return d.toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        const d = new Date(isoString);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatTime = (isoString) => {
        if (!isoString) return 'N/A';
        const d = new Date(isoString);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const SEVERITY_VI = {
        // [FIX] 'critical' là mức mặc định của alert_type='intrusion' (BE DEFAULT_SEVERITY_BY_TYPE) —
        // trước đây KHÔNG có key này, mọi alert critical rơi vào fallback "Bình thường" màu xám dù
        // đây là mức nghiêm trọng nhất. Dùng nền đỏ ĐẶC (không phải đỏ nhạt như 'high'/'urgent') để
        // nổi bật rõ rệt hơn các mức khác trong cùng thang màu, không lẫn vào 2 mức đỏ nhạt kia.
        critical: { label: 'Nghiêm trọng', cls: 'bg-red-600 text-white border-red-700' },
        high:   { label: 'Cao',       cls: 'bg-red-50 text-red-700 border-red-200' },
        urgent: { label: 'Khẩn cấp',  cls: 'bg-red-50 text-red-700 border-red-200' },
        medium: { label: 'Trung bình', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
        low:    { label: 'Thấp',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    };

    const getSeverityMeta = (severity) => SEVERITY_VI[severity?.toLowerCase()] || { label: 'Bình thường', cls: 'bg-slate-50 text-slate-700 border-slate-200' };

    const getSeverityStyle = (severity) => getSeverityMeta(severity).cls;

    const getStatusBadge = (status) => {
        switch (status) {
            case 'new': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200"><span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />Mới</span>;
            case 'acknowledged': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200"><Clock className="w-3 h-3 mr-1" />Đã tiếp nhận</span>;
            case 'resolved': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Đã xử lý</span>;
            default: return <span className="text-xs bg-slate-100 px-2 py-1 rounded">{status}</span>;
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4 animate-fade-in-up">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-platinum-tint">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        An ninh
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight flex items-center">
                        <ShieldAlert className="w-7 h-7 mr-3 text-red-500" />
                        Trung tâm Cảnh báo An ninh
                    </h1>
                    <p className="text-slate-blue text-sm mt-1 ml-10">
                        Giám sát và xử lý các sự kiện an ninh, bất thường trong hệ thống.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsExportOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors"
                        title="Xuất báo cáo"
                    >
                        <Download className="w-4 h-4" />
                        Xuất báo cáo
                    </button>
                    <div className="flex flex-col items-center gap-1">
                        <button
                            onClick={() => fetchAlerts()}
                            disabled={loading}
                            className="inline-flex items-center justify-center p-2.5 text-slate-blue bg-cloud-mist/50 rounded-xl hover:bg-cloud-mist transition-colors"
                            title="Làm mới"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Realtime · dự phòng mỗi 30s</span>
                    </div>
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBulkAcknowledge}
                            disabled={actionLoading}
                            className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-yellow-600 transition-all"
                        >
                            <CheckSquare className="w-4 h-4 mr-2" />
                            Tiếp nhận hàng loạt ({selectedIds.length})
                        </button>
                    )}
                </div>
            </div>

            {/* MESSAGES */}
            {(error || successMessage) && (
                <div className={`p-4 rounded-xl border flex items-center ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    {error ? <AlertTriangle className="w-5 h-5 mr-3 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-3 shrink-0" />}
                    <p className="text-sm font-medium">{error || successMessage}</p>
                </div>
            )}

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-platinum-tint grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Trạng thái</label>
                    <select
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả</option>
                        <option value="new">Mới</option>
                        <option value="acknowledged">Đã tiếp nhận</option>
                        <option value="resolved">Đã xử lý</option>
                    </select>
                </div>
                <div className="relative">
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại cảnh báo</label>
                    <select
                        value={filters.alert_type}
                        onChange={(e) => handleFilterChange('alert_type', e.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả</option>
                        <option value="stranger">Người lạ</option>
                        <option value="crowd">Đám đông</option>
                        <option value="intrusion">Xâm nhập</option>
                        <option value="person_watchlist_match">Đối tượng theo dõi</option>
                        <option value="unknown_vehicle">Xe lạ</option>
                        <option value="vehicle_control_match">Biển số theo dõi</option>
                        <option value="device_error">Lỗi thiết bị</option>
                    </select>
                </div>
                <div className="relative">
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Khu vực</label>
                    <select
                        value={filters.zone_id}
                        onChange={(e) => handleFilterChange('zone_id', e.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Toàn hệ thống</option>
                        {zones.map(z => (
                            <option key={z.id} value={z.id}>{z.zone_name}</option>
                        ))}
                    </select>
                </div>
                <div className="relative flex items-end">
                    <button
                        onClick={() => setFilters({ page: 1, limit: 20, status: '', alert_type: '', zone_id: '' })}
                        className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                    >
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
            </div>

            {/* ALERTS TABLE */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-platinum-tint overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-cloud-mist/30 sticky top-0 z-10 border-b border-platinum-tint">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Ngày</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Giờ</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Hình ảnh</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Loại</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Mức độ</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Vị trí</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading && alerts.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-blue">
                                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            ) : alerts.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center text-slate-blue">
                                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-lg font-medium text-midnight-indigo">Không có cảnh báo nào</p>
                                        <p className="text-sm mt-1">Hệ thống đang an toàn hoặc không có dữ liệu khớp với bộ lọc.</p>
                                    </td>
                                </tr>
                            ) : (
                                alerts.map(alert => (
                                    <tr key={alert.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 text-center whitespace-nowrap">
                                            <p className="text-sm font-bold text-midnight-indigo">
                                                {formatDate(alert.updated_at || alert.triggered_at)}
                                            </p>
                                            <p className="text-[10px] text-slate-blue/60 mt-1 font-mono">ID: {alert.id.substring(0, 8)}</p>
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            <p className="text-sm font-bold text-midnight-indigo" title="Cập nhật gần nhất">
                                                {formatTime(alert.updated_at || alert.triggered_at)}
                                            </p>
                                            <p className="text-[10px] text-slate-blue mt-1" title="Xảy ra lần đầu">
                                                Lần đầu: {formatTime(alert.created_at || alert.triggered_at)}
                                            </p>
                                        </td>
                                        <td className="p-4 text-center">
                                            <AlertImagesStack
                                                alert={alert}
                                                onClick={() => {
                                                    const images = getAlertImages(alert);
                                                    setSnapshotEventIds(images);
                                                    setSnapshotEventId(alert.source_event_id || images[0] || null);
                                                    setIsSnapshotOpen(true);
                                                }}
                                            />
                                        </td>
                                        {/* Loại */}
                                        <td className="p-4 text-center">
                                            <p className="text-sm font-bold text-midnight-indigo">{getAlertTypeLabel(alert.alert_type)}</p>
                                            <div className="flex flex-col items-center gap-1 mt-1">
                                                {alert.alert_type === 'vehicle_control_match' && getAlertPlateNumber(alert) && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white font-mono text-[10px] font-bold rounded uppercase tracking-wider shadow-sm border border-slate-950"
                                                        title="Biển số"
                                                    >
                                                        <Car className="w-3 h-3" />
                                                        {getAlertPlateNumber(alert)}
                                                    </span>
                                                )}
                                                {(alert.occurrence_count > 1 || alert.occurrenceCount > 1) && (
                                                    <button
                                                        onClick={() => setOccurrencesModal({ open: true, alert })}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors"
                                                        title="Bấm để xem tất cả lượt vi phạm"
                                                    >
                                                        <Users className="w-3 h-3" />
                                                        {alert.occurrence_count || alert.occurrenceCount} lần
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* Mức độ */}
                                        <td className="p-4 text-center">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${getSeverityStyle(alert.severity)}`}>
                                                {getSeverityMeta(alert.severity).label}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-midnight-indigo text-center">
                                            {zones.find(z => z.id === alert.zone_id)?.zone_name || 'Hệ thống'}
                                        </td>
                                        <td className="p-4 text-center">
                                            {getStatusBadge(alert.status)}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {alert.status === 'new' && (
                                                    <button
                                                        onClick={() => handleAcknowledge(alert.id)}
                                                        disabled={actionLoading}
                                                        className="inline-flex items-center px-3 py-1.5 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 font-semibold rounded-lg text-xs transition-colors whitespace-nowrap shadow-sm"
                                                    >
                                                        <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                                                        Tiếp nhận
                                                    </button>
                                                )}
                                                {alert.status === 'acknowledged' && (
                                                    <button
                                                        onClick={() => openResolveModal(alert)}
                                                        disabled={actionLoading}
                                                        className="inline-flex items-center px-3 py-1.5 bg-action-blue text-white hover:bg-glacier-blue font-semibold rounded-lg text-xs transition-colors whitespace-nowrap shadow-sm"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                                                        Xử lý ngay
                                                    </button>
                                                )}
                                                {alert.status === 'resolved' && (
                                                    <div className="flex flex-col items-end">
                                                        {alert.resolved_by ? (
                                                            <button
                                                                onClick={() => openHistoryModal(alert)}
                                                                className="inline-flex items-center px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold rounded-lg text-xs border border-slate-200 transition-colors"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 mr-1.5" />
                                                                Đã xử lý
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => openHistoryModal(alert)}
                                                                title="Hệ thống tự động đóng cảnh báo này (không có người xử lý)"
                                                                className="inline-flex items-center px-3 py-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 font-semibold rounded-lg text-xs border border-slate-200 border-dashed transition-colors"
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                                                Tự động đóng
                                                            </button>
                                                        )}
                                                        <p className="text-[10px] text-slate-400 mt-1 truncate max-w-[120px]" title={alert.resolution_note}>
                                                            Note: {alert.resolution_note}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION */}
                {meta && meta.totalPages > 1 && (
                    <div className="p-4 border-t border-platinum-tint bg-cloud-mist/30 flex items-center justify-between text-sm">
                        <span className="text-slate-blue font-medium">Hiển thị {alerts.length} / {meta.total} cảnh báo</span>
                        <Pagination
                            currentPage={filters.page}
                            totalPages={meta.totalPages}
                            onPageChange={(p) => handleFilterChange('page', p)}
                        />
                    </div>
                )}
            </div>

            {/* RESOLVE MODAL */}
            {resolveModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                            <h3 className="font-bold text-midnight-indigo flex items-center">
                                <ShieldAlert className="w-5 h-5 mr-2 text-action-blue" />
                                Xử lý cảnh báo
                            </h3>
                            <button onClick={() => setResolveModal({ open: false, alert: null })} className="text-slate-blue hover:text-red-500 transition-colors">✕</button>
                        </div>
                        <form onSubmit={handleResolve} className="p-6">
                            <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <p className="text-xs text-slate-blue font-bold uppercase mb-1">Loại sự kiện</p>
                                <p className="text-sm font-bold text-midnight-indigo">{getAlertTypeLabel(resolveModal.alert?.alert_type)}</p>
                            </div>
                            {resolveModal.alert?.acknowledged_by && (
                                <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <p className="text-xs text-slate-blue font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" />
                                        Đã tiếp nhận bởi
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo">
                                        {getUserDisplay(resolveModal.alert.acknowledged_by)}
                                        <span className="text-xs font-normal text-slate-blue ml-2">
                                            lúc {formatDateTime(resolveModal.alert.acknowledged_at)}
                                        </span>
                                    </p>
                                </div>
                            )}
                            {resolveModal.alert?.alert_type === 'vehicle_control_match' && getAlertPlateNumber(resolveModal.alert) && (
                                <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <p className="text-xs text-slate-blue font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <Car className="w-3.5 h-3.5" />
                                        Biển số
                                    </p>
                                    <span className="inline-flex px-2.5 py-1 bg-slate-900 text-white font-mono text-sm font-bold rounded uppercase tracking-wider shadow-sm border border-slate-950">
                                        {getAlertPlateNumber(resolveModal.alert)}
                                    </span>
                                </div>
                            )}
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-midnight-indigo mb-2">
                                    Ghi chú kết quả xử lý <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows="4"
                                    value={resolutionNote}
                                    onChange={e => setResolutionNote(e.target.value)}
                                    placeholder="Ghi rõ hành động đã thực hiện (VD: Đã mời người lạ ra khỏi phòng...)"
                                    className="w-full px-4 py-3 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:ring-1 focus:ring-action-blue resize-none"
                                />
                                <p className="text-xs text-slate-blue mt-2">Ghi chú này sẽ được lưu lại vĩnh viễn trong Audit Log.</p>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setResolveModal({ open: false, alert: null })} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-platinum-tint rounded-xl hover:bg-slate-50 transition-colors">Hủy bỏ</button>
                                <button type="submit" disabled={actionLoading} className="px-5 py-2.5 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue transition-colors flex items-center disabled:opacity-70">
                                    {actionLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                    Đóng cảnh báo
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* FE-AC: HISTORY MODAL — lịch sử tiếp nhận/đóng của alert đã resolved */}
            {historyModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                            <h3 className="font-bold text-midnight-indigo flex items-center">
                                <Eye className="w-5 h-5 mr-2 text-action-blue" />
                                Lịch sử xử lý cảnh báo
                            </h3>
                            <button onClick={() => setHistoryModal({ open: false, alert: null })} className="text-slate-blue hover:text-red-500 transition-colors">✕</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <p className="text-xs text-slate-blue font-bold uppercase mb-1">Loại sự kiện</p>
                                <p className="text-sm font-bold text-midnight-indigo">{getAlertTypeLabel(historyModal.alert?.alert_type)}</p>
                            </div>

                            {historyModal.alert?.acknowledged_by ? (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <p className="text-xs text-slate-blue font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" />
                                        Đã tiếp nhận bởi
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo">
                                        {getUserDisplay(historyModal.alert.acknowledged_by)}
                                        <span className="text-xs font-normal text-slate-blue ml-2">
                                            lúc {formatDateTime(historyModal.alert.acknowledged_at)}
                                        </span>
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-blue italic">Không có bước tiếp nhận (đóng trực tiếp).</p>
                            )}

                            {historyModal.alert?.resolved_by ? (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <p className="text-xs text-slate-blue font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Đã xử lý bởi
                                    </p>
                                    <p className="text-sm font-bold text-midnight-indigo">
                                        {getUserDisplay(historyModal.alert.resolved_by)}
                                        <span className="text-xs font-normal text-slate-blue ml-2">
                                            lúc {formatDateTime(historyModal.alert.resolved_at)}
                                        </span>
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                                    <p className="text-xs text-amber-700 font-bold uppercase mb-1 flex items-center gap-1.5">
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        Tự động đóng bởi hệ thống
                                    </p>
                                    <p className="text-sm text-amber-700">
                                        lúc {formatDateTime(historyModal.alert?.resolved_at)}
                                    </p>
                                </div>
                            )}

                            {historyModal.alert?.resolution_note && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <p className="text-xs text-slate-blue font-bold uppercase mb-1">Ghi chú xử lý</p>
                                    <p className="text-sm text-midnight-indigo whitespace-pre-wrap">{historyModal.alert.resolution_note}</p>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 text-right">
                            <button
                                onClick={() => setHistoryModal({ open: false, alert: null })}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-platinum-tint rounded-xl hover:bg-slate-50 transition-colors"
                            >Đóng</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* FE-AC: OCCURRENCES DETAIL MODAL */}
            {occurrencesModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-platinum-tint flex flex-col max-h-[80vh]">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                                    <Users className="w-5 h-5 text-amber-600" />
                                    Chi tiết lượt vi phạm
                                </h3>
                                <p className="text-xs text-slate-blue mt-0.5">
                                    {getAlertTypeLabel(occurrencesModal.alert?.alert_type)} — {zones.find(z => z.id === occurrencesModal.alert?.zone_id)?.zone_name || 'Hệ thống'}
                                    {' · '}Tổng: {occurrencesModal.alert?.occurrence_count || occurrencesModal.alert?.occurrenceCount} lượt
                                </p>
                            </div>
                            <button
                                onClick={() => setOccurrencesModal({ open: false, alert: null })}
                                className="text-slate-blue hover:text-red-500 transition-colors text-xl leading-none"
                            >✕</button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4 space-y-3 bg-slate-50/30">
                            {(occurrencesModal.alert?.payload_json?.occurrences || []).length === 0 ? (
                                <p className="text-center text-slate-blue py-8 text-sm">Không có dữ liệu occurrence.</p>
                            ) : (
                                (occurrencesModal.alert.payload_json.occurrences).map((occ, idx) => (
                                    <div key={idx} className="flex items-start gap-4 p-4 bg-white hover:bg-slate-50 hover:shadow-md hover:border-action-blue/20 rounded-2xl border border-platinum-tint transition-all duration-200">
                                        <div className="w-20 h-20 bg-slate-50 rounded-xl border border-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                                            {occ.sourceEventId ? (
                                                <ThumbnailImage
                                                    eventId={occ.sourceEventId}
                                                    className="w-full h-full object-cover rounded-lg aspect-square border-0"
                                                    onClick={() => {
                                                        const occurrences = occurrencesModal.alert?.payload_json?.occurrences || [];
                                                        // [FIX] dedupe — mirror getAlertImages(), tránh lightbox next/prev
                                                        // lặp lại đúng 1 ảnh do BE ghi trùng entry cho người lạ (userId=null).
                                                        const occImages = [...new Set(occurrences.map(o => o.sourceEventId).filter(Boolean))];
                                                        setSnapshotEventIds(occImages);
                                                        setSnapshotEventId(occ.sourceEventId);
                                                        setIsSnapshotOpen(true);
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-slate-50 rounded-xl flex flex-col items-center justify-center border border-slate-100/50">
                                                    <ImageIcon className="w-5 h-5 text-slate-300" />
                                                    <span className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-wider">Không ảnh</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-midnight-indigo">
                                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                <span>{formatDateTime(occ.occurredAt)}</span>
                                            </div>
                                            
                                            {occurrencesModal.alert?.alert_type === 'intrusion' && (
                                                <div>
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${occ.userId ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                        {occ.userId ? '👤 Người quen' : '❓ Người lạ'}
                                                    </span>
                                                </div>
                                            )}

                                            {occ.fullName && (
                                                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>{occ.fullName}</span>
                                                </div>
                                            )}

                                            {occ.userId && (
                                                <p className="text-[10px] text-slate-500 font-mono select-all">
                                                    ID: {occ.userId}
                                                </p>
                                            )}

                                            {occ.plateNumber && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="inline-flex px-2 py-0.5 bg-slate-900 text-white font-mono text-[10px] font-bold rounded uppercase tracking-wider shadow-sm border border-slate-950">
                                                        {occ.plateNumber}
                                                    </span>
                                                    {occ.vehicleType && (
                                                        <span className="text-[10px] text-slate-400">
                                                            ({occ.vehicleType === 'CAR' ? 'Ô tô' : occ.vehicleType === 'MOTORBIKE' ? 'Xe máy' : occ.vehicleType})
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {(occ.watchlistName || occ.name) && (
                                                <div className="flex items-center gap-1">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        📌 {occ.watchlistName || occ.name}
                                                    </span>
                                                </div>
                                            )}

                                            {occ.occupancyCount !== undefined && occ.occupancyCount !== null && (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className={`text-[11px] font-bold ${occ.threshold != null && occ.occupancyCount > occ.threshold ? 'text-red-600' : 'text-slate-700'}`}>
                                                        {occ.occupancyCount}{occ.threshold != null ? `/${occ.threshold}` : ''} người
                                                    </span>
                                                </div>
                                            )}

                                            {occ.confidence !== undefined && occ.confidence !== null && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-slate-400">Độ tin cậy:</span>
                                                    <span className={`text-[10px] font-bold ${occ.confidence >= 0.8 ? 'text-green-600' : 'text-amber-600'}`}>
                                                        {Math.round(occ.confidence * 100)}%
                                                    </span>
                                                    <div className="w-12 bg-slate-200 h-1 rounded-full overflow-hidden shrink-0">
                                                        <div 
                                                            className={`h-full ${occ.confidence >= 0.8 ? 'bg-green-500' : 'bg-amber-500'}`} 
                                                            style={{ width: `${Math.min(Math.max(occ.confidence * 100, 0), 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {(occ.reason || occ.description || occ.errorDetail || occ.error_detail) && (
                                                <div className="flex items-start gap-1.5 text-[11px] text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-200/50">
                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                                    <span className="leading-tight">{occ.reason || occ.description || occ.errorDetail || occ.error_detail}</span>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-300 font-bold font-mono shrink-0 select-none">#{idx + 1}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 text-right shrink-0">
                            <button
                                onClick={() => setOccurrencesModal({ open: false, alert: null })}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-platinum-tint rounded-xl hover:bg-slate-50 transition-colors"
                            >Đóng</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <EventSnapshotModal
                isOpen={isSnapshotOpen}
                onClose={() => setIsSnapshotOpen(false)}
                eventId={snapshotEventId}
                eventIds={snapshotEventIds}
            />

            <ExportReportModal
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                endpoint="/reports/security-alert/exports"
                formats={['xlsx', 'pdf']}
                title="Xuất báo cáo sự kiện an ninh"
            />
        </div>
    );
};

export default SecurityAlerts;
