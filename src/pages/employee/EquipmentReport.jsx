import {
    AlertTriangle, ArrowLeft, ChevronRight, Cpu, MapPin,
    Mic, Monitor, Package, RefreshCw, Speaker, Video, Wrench,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

import { getMyMeetingHistory } from '../../service/employeeServices';
import { getEquipments, reportEquipmentFault } from '../../service/equipmentServices';

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 14 } },
};

const getEquipmentIcon = (type) => {
    switch (type) {
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
        camera: 'Camera',
        microphone: 'Microphone',
        display: 'Màn hình/Tivi',
        speaker: 'Loa',
        capture_agent: 'Bộ xử lý (Agent)',
        sensor: 'Cảm biến',
        other: 'Khác',
    };
    return labels[type] || type;
};

const getHealthBadge = (status) => {
    const map = {
        healthy: { label: 'Tốt', cls: 'bg-green-100 text-green-700' },
        warning: { label: 'Cảnh báo', cls: 'bg-yellow-100 text-yellow-700' },
        faulty: { label: 'Lỗi', cls: 'bg-red-100 text-red-700' },
        offline: { label: 'Mất kết nối', cls: 'bg-slate-200 text-slate-600' },
    };
    return map[status] || { label: status || 'Không rõ', cls: 'bg-slate-100 text-slate-600' };
};

const EquipmentReport = () => {
    // ─── Level 1: recent rooms ────────────────────────────────────────────────
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [roomsError, setRoomsError] = useState(null);
    const [recentRooms, setRecentRooms] = useState([]); // [{ room, lastMeeting }]

    // ─── Level 2: room detail + equipment ─────────────────────────────────────
    const [view, setView] = useState('rooms'); // 'rooms' | 'detail'
    const [selectedEntry, setSelectedEntry] = useState(null); // { room, lastMeeting }
    const [equipmentList, setEquipmentList] = useState([]);
    const [loadingEquipment, setLoadingEquipment] = useState(false);
    const [equipmentError, setEquipmentError] = useState(null);

    const [successMessage, setSuccessMessage] = useState(null);

    // ─── Fault modal ───────────────────────────────────────────────────────────
    const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [faultForm, setFaultForm] = useState({ healthStatus: 'faulty', issueNote: '' });
    const [submittingFault, setSubmittingFault] = useState(false);

    const fetchRecentRooms = useCallback(async () => {
        setLoadingRooms(true);
        setRoomsError(null);
        try {
            const res = await getMyMeetingHistory({
                status: ['scheduled', 'in_progress', 'completed'],
                page: 1,
                limit: 50,
            });
            if (!res?.success) throw new Error(res?.message || 'Không thể tải danh sách cuộc họp gần đây.');
            const meetings = res.data?.items || res.data || [];
            const map = new Map();
            meetings.forEach((m) => {
                if (!m.room?.id || map.has(m.room.id)) return;
                map.set(m.room.id, { room: m.room, lastMeeting: m });
            });
            const entries = Array.from(map.values());

            // Chỉ giữ lại các phòng có ít nhất 1 thiết bị được gán, tránh
            // cho phép báo hỏng ở phòng chưa gán thiết bị nào.
            const equipmentChecks = await Promise.all(
                entries.map((entry) =>
                    getEquipments({ currentRoomId: entry.room.id, limit: 1 })
                        .then((r) => (r?.success && (r.data || []).length > 0))
                        .catch(() => false)
                )
            );
            setRecentRooms(entries.filter((_, idx) => equipmentChecks[idx]));
        } catch (err) {
            setRoomsError(err?.message || 'Lỗi khi tải danh sách phòng.');
        } finally {
            setLoadingRooms(false);
        }
    }, []);

    useEffect(() => { fetchRecentRooms(); }, [fetchRecentRooms]);

    const fetchEquipmentForRoom = useCallback(async (roomId) => {
        setLoadingEquipment(true);
        setEquipmentError(null);
        try {
            const res = await getEquipments({ currentRoomId: roomId, limit: 100 });
            if (!res?.success) throw new Error(res?.message || 'Không thể tải danh sách thiết bị.');
            setEquipmentList(res.data || []);
        } catch (err) {
            setEquipmentError(err?.message || 'Lỗi khi tải thiết bị.');
        } finally {
            setLoadingEquipment(false);
        }
    }, []);

    const handleSelectRoom = (entry) => {
        setSelectedEntry(entry);
        setView('detail');
        setSuccessMessage(null);
        fetchEquipmentForRoom(entry.room.id);
    };

    const handleBack = () => {
        setView('rooms');
        setSelectedEntry(null);
        setEquipmentList([]);
        setEquipmentError(null);
        setSuccessMessage(null);
    };

    const openFaultModal = (eq) => {
        setSelectedEquipment(eq);
        setFaultForm({ healthStatus: 'faulty', issueNote: '' });
        setIsFaultModalOpen(true);
    };

    const handleFaultSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEquipment) return;
        setSubmittingFault(true);
        setEquipmentError(null);
        try {
            const res = await reportEquipmentFault(selectedEquipment.id, {
                healthStatus: faultForm.healthStatus,
                issueNote: faultForm.issueNote,
            });
            if (res?.success) {
                setSuccessMessage(`Đã gửi báo cáo lỗi cho "${selectedEquipment.equipmentName}". Bộ phận quản trị sẽ xác nhận và xử lý.`);
                setIsFaultModalOpen(false);
                if (selectedEntry) fetchEquipmentForRoom(selectedEntry.room.id);
            } else {
                setEquipmentError(res?.message || 'Báo hỏng thất bại.');
            }
        } catch (err) {
            setEquipmentError(err?.message || 'Lỗi khi báo hỏng thiết bị.');
        } finally {
            setSubmittingFault(false);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col bg-snow-white overflow-y-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 animate-fade-in-up">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Wrench className="w-3.5 h-3.5" />
                        Báo hỏng thiết bị phòng họp
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">
                        {view === 'rooms' ? 'Phòng họp gần đây của tôi' : selectedEntry?.room?.roomName}
                    </h1>
                    <p className="text-sm text-slate-blue mt-1">
                        {view === 'rooms'
                            ? 'Chọn một phòng để xem thiết bị và báo hỏng nếu phát hiện sự cố.'
                            : 'Danh sách thiết bị được lắp đặt trong phòng. Bấm "Báo hỏng" nếu phát hiện thiết bị gặp sự cố.'}
                    </p>
                </div>
                {view === 'detail' ? (
                    <button
                        onClick={handleBack}
                        className="inline-flex items-center px-4 py-2.5 bg-white border border-platinum-tint text-slate-blue rounded-xl text-sm font-semibold hover:bg-cloud-mist transition-all"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Quay lại danh sách phòng
                    </button>
                ) : (
                    <button
                        onClick={fetchRecentRooms}
                        className="inline-flex items-center px-4 py-2.5 bg-white border border-platinum-tint text-slate-blue rounded-xl text-sm font-semibold hover:bg-cloud-mist transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loadingRooms ? 'animate-spin' : ''}`} />
                        Làm mới
                    </button>
                )}
            </div>

            {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium animate-fade-in-up">
                    {successMessage}
                </div>
            )}

            {view === 'rooms' ? (
                    <motion.div key="rooms" initial="hidden" animate="show" variants={containerVariants}>
                        {roomsError && (
                            <div className="mb-6 p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-xl flex items-start">
                                <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                <p className="text-sm">{roomsError}</p>
                            </div>
                        )}

                        {loadingRooms ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array(6).fill(0).map((_, idx) => (
                                    <div key={idx} className="h-32 rounded-2xl bg-cloud-mist animate-pulse" />
                                ))}
                            </div>
                        ) : recentRooms.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-platinum-tint p-12 text-center">
                                <MapPin className="w-12 h-12 mb-3 mx-auto text-slate-blue opacity-50" />
                                <p className="text-sm font-medium text-slate-blue">Bạn chưa có cuộc họp nào gắn với phòng gần đây.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {recentRooms.map((entry, idx) => (
                                    <motion.button
                                        key={entry.room.id}
                                        variants={itemVariants}
                                        onClick={() => handleSelectRoom(entry)}
                                        className="text-left bg-white rounded-2xl shadow-sm-1 border border-platinum-tint p-5 hover:border-action-blue hover:shadow-md hover:-translate-y-0.5 transition-all group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                                <MapPin className="w-5 h-5 text-action-blue" />
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-blue group-hover:text-action-blue transition-colors mt-1" />
                                        </div>
                                        <div className="flex items-center gap-2 mt-3">
                                            <p className="font-bold text-midnight-indigo">{entry.room.roomName}</p>
                                            {idx === 0 && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-action-blue">
                                                    Cuộc họp mới nhất
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-blue">
                                            {entry.room.roomCode}{entry.room.location ? ` • ${entry.room.location}` : ''}
                                        </p>
                                    </motion.button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="detail" initial="hidden" animate="show" variants={containerVariants}>
                        {selectedEntry?.room?.location && (
                            <p className="text-xs text-slate-blue mb-4 inline-flex items-center gap-1.5 bg-cloud-mist/60 px-3 py-1.5 rounded-lg">
                                <MapPin className="w-3.5 h-3.5" />
                                {selectedEntry.room.location}
                            </p>
                        )}

                        {equipmentError && (
                            <div className="mb-6 p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-xl flex items-start">
                                <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                <p className="text-sm">{equipmentError}</p>
                            </div>
                        )}

                        {loadingEquipment ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Array(4).fill(0).map((_, idx) => (
                                    <div key={idx} className="h-24 rounded-2xl bg-cloud-mist animate-pulse" />
                                ))}
                            </div>
                        ) : equipmentList.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-platinum-tint p-12 text-center">
                                <Package className="w-12 h-12 mb-3 mx-auto text-slate-blue opacity-50" />
                                <p className="text-sm font-medium text-slate-blue">Phòng này chưa được gán thiết bị nào.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {equipmentList.map((eq) => {
                                    const badge = getHealthBadge(eq.healthStatus);
                                    return (
                                        <motion.div
                                            key={eq.id}
                                            variants={itemVariants}
                                            className="bg-white rounded-2xl shadow-sm-1 border border-platinum-tint p-5 flex items-start gap-4"
                                        >
                                            <div className="w-11 h-11 rounded-xl bg-cloud-mist flex items-center justify-center flex-shrink-0">
                                                {getEquipmentIcon(eq.equipmentType)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-sm text-midnight-indigo truncate">{eq.equipmentName}</p>
                                                        <p className="text-xs text-slate-blue">{getTypeLabel(eq.equipmentType)} • {eq.equipmentCode}</p>
                                                    </div>
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold flex-shrink-0 ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                {eq.assetStatus === 'maintenance' && (
                                                    <span className="inline-flex items-center px-2 py-0.5 mt-2 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700">
                                                        Đang bảo trì
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => openFaultModal(eq)}
                                                    className="mt-3 inline-flex items-center px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                                                >
                                                    <Wrench className="w-3.5 h-3.5 mr-1.5" />
                                                    Báo hỏng
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

            {/* FAULT MODAL */}
            {isFaultModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-red-50">
                            <h3 className="font-bold text-red-700">Báo hỏng thiết bị</h3>
                            <button onClick={() => setIsFaultModalOpen(false)} className="text-red-700 hover:text-red-900">✕</button>
                        </div>
                        <form onSubmit={handleFaultSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue">Mã: {selectedEquipment.equipmentCode} • Phòng: {selectedEntry?.room?.roomName}</p>
                                {selectedEntry?.room?.location && (
                                    <p className="text-xs text-slate-blue mt-0.5 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 shrink-0" /> {selectedEntry.room.location}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mức độ sự cố</label>
                                <select
                                    value={faultForm.healthStatus}
                                    onChange={(e) => setFaultForm({ ...faultForm, healthStatus: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white"
                                >
                                    <option value="warning">Cảnh báo (vẫn dùng được)</option>
                                    <option value="faulty">Lỗi (không dùng được)</option>
                                    <option value="offline">Mất kết nối</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả sự cố <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    rows="3"
                                    value={faultForm.issueNote}
                                    onChange={(e) => setFaultForm({ ...faultForm, issueNote: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none"
                                    placeholder="VD: Camera không lên hình, mic bị rè..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsFaultModalOpen(false)} disabled={submittingFault} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist disabled:opacity-50">
                                    Hủy
                                </button>
                                <button type="submit" disabled={submittingFault} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 min-w-[110px] inline-flex items-center justify-center">
                                    {submittingFault ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Gửi báo cáo'}
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

export default EquipmentReport;
