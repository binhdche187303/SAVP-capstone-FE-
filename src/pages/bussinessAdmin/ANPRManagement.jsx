import { Car, Download, Image as ImageIcon, Search, Calendar as CalendarIcon, UserX, X, Mail, Phone, Briefcase } from 'lucide-react';
import toast from '../../utils/toast';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import {
    getAdminVehicleHistory,
    adminRegisterVehicle,
    getUnknownVehicles,
    getMyVehicles
} from '../../service/anprService';
import { getUsers } from '../../service/employeeServices'; // Để lấy danh sách nhân viên
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ExportReportModal from '../../components/common/ExportReportModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import UserAvatar from '../../components/common/UserAvatar';
import Pagination from '../../components/common/Pagination';

const ANPRManagement = () => {
    const [activeTab, setActiveTab] = useState('history'); // 'history', 'register', 'unknown'
    const [loading, setLoading] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Snapshot Modal
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

    // Inline Owner Modal
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);

    // ============================================
    // TAB 1: LỊCH SỬ QUÉT BIỂN
    // ============================================
    const [historyList, setHistoryList] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [filterMatchState, setFilterMatchState] = useState('ALL');
    const [historyPage, setHistoryPage] = useState(1);
    const [dateRange, setDateRange] = useState([null, null]);
    const [startDate, endDate] = dateRange;
    const [searchKeyword, setSearchKeyword] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const itemsPerPage = 10;

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchKeyword);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchKeyword]);

    useEffect(() => {
        setHistoryPage(1);
    }, [filterMatchState, debouncedSearch, startDate, endDate]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const params = {
                page: historyPage,
                limit: itemsPerPage
            };
            if (filterMatchState !== 'ALL') {
                params.matchState = filterMatchState;
            }
            if (debouncedSearch) {
                params.plateNumber = debouncedSearch;
                params.ownerName = debouncedSearch; // Hỗ trợ BE filter theo Tên Chủ xe
            }
            if (startDate) {
                params.from = startDate.toISOString();
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                params.to = end.toISOString();
            }
            const res = await getAdminVehicleHistory(params);
            if (res?.success) {
                setHistoryList(res.data);
                setHistoryTotal(res.meta?.total || 0);
            } else {
                setHistoryList([]);
                setHistoryTotal(0);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
        }
        setLoading(false);
    };

    // ============================================
    // TAB 2: ĐĂNG KÝ HỘ (ADMIN)
    // ============================================
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [regPlate, setRegPlate] = useState('');
    const [regType, setRegType] = useState('CAR');
    const [regNote, setRegNote] = useState('');

    const fetchUsers = async () => {
        try {
            const res = await getUsers({ limit: 100 });
            if (res?.success) setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleRegisterVehicle = async (e) => {
        e.preventDefault();
        try {
            await adminRegisterVehicle({
                user_id: selectedUser,
                plate_raw: regPlate,
                vehicle_type: regType,
                note: regNote
            });
            toast.success('Đăng ký xe cho nhân viên thành công!');
            setRegPlate('');
            setRegNote('');
            setSelectedUser('');
        } catch (err) {
            toast.error('Lỗi đăng ký xe: ' + (err.message || 'Thất bại'));
        }
    };

    // ============================================
    // TAB 3: BIỂN LẠ
    // ============================================
    const [unknownList, setUnknownList] = useState([]);
    const [unknownTotal, setUnknownTotal] = useState(0);
    const [unknownPage, setUnknownPage] = useState(1);

    const fetchUnknown = async () => {
        setLoading(true);
        try {
            const res = await getUnknownVehicles({ page: unknownPage, limit: itemsPerPage });
            if (res?.success) {
                setUnknownList(res.data);
                setUnknownTotal(res.meta?.total || 0);
            } else {
                setUnknownList([]);
                setUnknownTotal(0);
            }
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    // ============================================
    // EFFECTS
    // ============================================
    useEffect(() => {
        if (activeTab === 'history') fetchHistory();
    }, [activeTab, filterMatchState, debouncedSearch, startDate, endDate, historyPage]);

    useEffect(() => {
        if (activeTab === 'unknown') fetchUnknown();
    }, [activeTab, unknownPage]);

    useEffect(() => {
        if (activeTab === 'register') fetchUsers();
    }, [activeTab]);

    useEffect(() => {
        // Auto-refresh logic for Dashboard (history/unknown)
        let interval;
        if (activeTab === 'history' || activeTab === 'unknown') {
            interval = setInterval(() => {
                if (activeTab === 'history') fetchHistory();
                if (activeTab === 'unknown') fetchUnknown();
            }, 10000); // 10 seconds auto-refresh
        }
        return () => clearInterval(interval);
    }, [activeTab, filterMatchState, debouncedSearch, startDate, endDate, historyPage, unknownPage]);

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up pb-10">
            <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                    <Car className="w-3.5 h-3.5" />
                    Biển số
                </span>
                <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Kiểm soát ra vào cổng</h1>
                <p className="text-slate-blue text-sm mt-1">
                    Theo dõi lịch sử vào ra, quản lý biển lạ và đăng ký phương tiện cho nhân sự.
                </p>
            </div>

            {/* TABS NAVIGATION */}
            <div className="flex bg-white rounded-2xl border border-platinum-tint p-1 shadow-sm-2">
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-cloud-mist text-action-blue shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    📊 Lịch sử quét (Dashboard)
                </button>
                <button
                    onClick={() => setActiveTab('unknown')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'unknown' ? 'bg-cloud-mist text-sunset-gold shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    ⚠️ Biển số lạ
                </button>
                <button
                    onClick={() => setActiveTab('register')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'register' ? 'bg-cloud-mist text-action-blue shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    📝 Đăng ký xe nhân viên
                </button>
            </div>

            {/* TAB CONTENT: HISTORY */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-6 space-y-5 animate-fade-in">

                    {/* Header */}
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-midnight-indigo">Luồng xe vào ra hệ thống</h2>
                            <p className="text-xs text-slate-blue mt-0.5">Nhật ký nhận diện biển số qua camera ANPR · cập nhật mỗi 10 giây</p>
                        </div>
                        <button
                            onClick={() => setIsExportOpen(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors"
                        >
                            <Download className="w-4 h-4" /> Xuất báo cáo
                        </button>
                    </div>

                    {/* Filter bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-cloud-mist/50 p-4 rounded-xl border border-platinum-tint">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Tìm theo biển số..."
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-platinum-tint text-sm text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none bg-white transition-all"
                            />
                        </div>

                        {/* Date range */}
                        <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue z-10 pointer-events-none" />
                            <DatePicker
                                selectsRange
                                startDate={startDate}
                                endDate={endDate}
                                onChange={(update) => setDateRange(update)}
                                placeholderText="Khoảng ngày..."
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-platinum-tint text-sm text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none bg-white"
                                dateFormat="dd/MM/yyyy"
                                isClearable
                            />
                        </div>

                        {/* Match state */}
                        <select
                            value={filterMatchState}
                            onChange={(e) => setFilterMatchState(e.target.value)}
                            className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none bg-white transition-all"
                        >
                            <option value="ALL">Tất cả trạng thái</option>
                            <option value="matched">Khớp dữ liệu</option>
                            <option value="unmatched">Biển lạ</option>
                        </select>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-platinum-tint">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-cloud-mist border-b border-platinum-tint">
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap">Thời điểm</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Hướng</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Camera</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Biển số</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Đối soát</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap">Chủ xe</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Ảnh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-platinum-tint">
                                {loading && historyList.length === 0 ? (
                                    <tr><td colSpan="7" className="py-10 text-center text-slate-blue text-sm">Đang tải...</td></tr>
                                ) : historyList.length === 0 ? (
                                    <tr><td colSpan="7" className="py-10 text-center text-slate-blue text-sm">Không có dữ liệu phù hợp.</td></tr>
                                ) : (
                                    historyList.map((item, idx) => {
                                        const evtDate = item.eventTime ? new Date(item.eventTime) : null;
                                        const dir = item.direction;
                                        const isEnter = dir === 'enter' || dir === 'in' || dir === 'ENTRY';
                                        const isLeave = dir === 'leave' || dir === 'out' || dir === 'EXIT';

                                        return (
                                            <tr key={item.id || idx} className="hover:bg-cloud-mist/40 transition-colors">
                                                {/* Thời điểm */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <p className="text-sm font-semibold text-midnight-indigo">
                                                        {evtDate ? evtDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                                                    </p>
                                                    <p className="text-xs text-slate-blue mt-0.5 font-mono">
                                                        {evtDate ? evtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                                                    </p>
                                                </td>

                                                {/* Hướng */}
                                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                                    {isEnter ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            ↓ Vào
                                                        </span>
                                                    ) : isLeave ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            ↑ Ra
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
                                                            — Thấy
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Camera */}
                                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                                    <span className="text-xs font-semibold text-slate-blue">{item.channelId || 'Main Gate'}</span>
                                                </td>

                                                {/* Biển số */}
                                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                                    <div className="inline-flex flex-col items-center gap-1">
                                                        <span className="font-bold text-midnight-indigo border border-slate-300 px-2.5 py-0.5 rounded-md bg-white shadow-sm font-mono text-sm tracking-wider">
                                                            {item.plateNumber}
                                                        </span>
                                                        {item.isBlacklisted && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                                                                ⚠ Danh sách đen
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Đối soát */}
                                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                                    {item.matchState === 'matched' ? (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Khớp</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">Biển lạ</span>
                                                    )}
                                                </td>

                                                {/* Chủ xe */}
                                                <td className="py-3 px-4">
                                                    {item.owner ? (
                                                        <div
                                                            className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors group w-fit max-w-[160px]"
                                                            onClick={() => { setSelectedOwner(item.owner); setIsOwnerModalOpen(true); }}
                                                        >
                                                            <UserAvatar
                                                                user={item.owner}
                                                                name={item.owner.fullName}
                                                                className="w-7 h-7 rounded-full text-xs shadow-sm border border-platinum-tint group-hover:border-action-blue flex-shrink-0"
                                                            />
                                                            <span className="text-sm font-semibold text-action-blue group-hover:text-blue-700 truncate" title={item.owner.fullName}>
                                                                {item.owner.fullName}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 font-medium px-2">Không xác định</span>
                                                    )}
                                                </td>

                                                {/* Ảnh */}
                                                <td className="py-3 px-4">
                                                    <div className="flex justify-center">
                                                        <ThumbnailImage
                                                            eventId={item.id}
                                                            onClick={() => { setSnapshotEventId(item.id); setIsSnapshotOpen(true); }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-[11px] text-slate-blue font-semibold">
                            {historyTotal > 0
                                ? `Hiển thị ${(historyPage - 1) * itemsPerPage + 1}–${Math.min(historyPage * itemsPerPage, historyTotal)} / ${historyTotal} lượt quét`
                                : 'Không có dữ liệu'}
                        </span>
                        {!loading && Math.ceil(historyTotal / itemsPerPage) > 1 && (
                            <Pagination
                                currentPage={historyPage}
                                totalPages={Math.ceil(historyTotal / itemsPerPage)}
                                onPageChange={setHistoryPage}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: UNKNOWN VEHICLES */}
            {activeTab === 'unknown' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-6 space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-bold text-midnight-indigo">Danh sách biển số lạ</h2>
                        <p className="text-xs text-slate-blue mt-1">Những phương tiện đi qua camera nhưng không khớp với bất kỳ đăng ký nào trong hệ thống.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loading && unknownList.length === 0 ? (
                            <div className="col-span-full py-8 text-center text-slate-blue">Đang tải...</div>
                        ) : unknownList.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-slate-blue bg-cloud-mist rounded-xl border border-dashed border-outline-gray">
                                Không có cảnh báo biển lạ nào hiện tại.
                            </div>
                        ) : (
                            unknownList.map((item, idx) => (
                                <div key={item.id || idx} className="p-4 rounded-xl border border-orange-200 bg-orange-50 flex items-start gap-4 shadow-sm">
                                    <div className="w-12 h-12 rounded-full bg-white border border-orange-200 flex items-center justify-center flex-shrink-0 text-xl shadow-sm">
                                        ⚠️
                                    </div>
                                    <div>
                                        <div className="flex items-center flex-wrap gap-2">
                                            <span className="font-bold text-midnight-indigo border border-steel-gray px-2 py-0.5 rounded bg-white font-mono text-sm shadow-sm">{item.plateNumber}</span>
                                            {item.isBlacklisted && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200" title="Chỉ hiện cho lượt đầu tiên trong 5 phút">
                                                    ⚠️ Danh sách đen
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs font-semibold text-slate-blue mt-2">Phát hiện lúc:</p>
                                        <p className="text-sm font-bold text-midnight-indigo">{new Date(item.eventTime).toLocaleString('vi-VN')}</p>
                                        <p className="text-xs text-slate-blue mt-1">Camera: {item.channelId || 'Unknown'}</p>
                                        <ThumbnailImage
                                            eventId={item.id}
                                            className="w-full h-24 mt-3 object-cover shadow-sm border border-orange-200 rounded-lg hover:border-action-blue"
                                            onClick={() => {
                                                setSnapshotEventId(item.id);
                                                setIsSnapshotOpen(true);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination Unknown */}
                    {!loading && Math.ceil(unknownTotal / itemsPerPage) > 1 && (
                        <div className="flex justify-between items-center pt-4 mt-2 border-t border-platinum-tint/50">
                            <span className="text-[11px] text-slate-blue">
                                Hiển thị {(unknownPage - 1) * itemsPerPage + 1} - {Math.min(unknownPage * itemsPerPage, unknownTotal)} trong tổng số {unknownTotal} biển lạ
                            </span>
                            <Pagination 
                                currentPage={unknownPage} 
                                totalPages={Math.ceil(unknownTotal / itemsPerPage)} 
                                onPageChange={setUnknownPage} 
                            />
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: REGISTER */}
            {activeTab === 'register' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-8 animate-fade-in max-w-2xl mx-auto">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-midnight-indigo">Đăng ký xe cho nhân viên</h2>
                        <p className="text-xs text-slate-blue mt-1">Dùng quyền Admin để chủ động cấp phép phương tiện cho người dùng vào hệ thống.</p>
                    </div>

                    <form onSubmit={handleRegisterVehicle} className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Chọn nhân viên *</label>
                            <select
                                required
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                            >
                                <option value="" disabled>-- Nhấn để chọn nhân viên --</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.fullName} - {u.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Biển số xe *</label>
                            <input
                                type="text"
                                required
                                value={regPlate}
                                onChange={(e) => setRegPlate(e.target.value.toUpperCase())}
                                placeholder="VD: 30A-123.45"
                                className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm font-mono outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Loại phương tiện *</label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${regType === 'CAR' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                    <input type="radio" value="CAR" checked={regType === 'CAR'} onChange={() => setRegType('CAR')} className="hidden" />
                                    <span>🚗 Ô tô</span>
                                </label>
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${regType === 'MOTORBIKE' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                    <input type="radio" value="MOTORBIKE" checked={regType === 'MOTORBIKE'} onChange={() => setRegType('MOTORBIKE')} className="hidden" />
                                    <span>🏍 Xe máy</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Ghi chú (Tùy chọn)</label>
                            <input
                                type="text"
                                value={regNote}
                                onChange={(e) => setRegNote(e.target.value)}
                                placeholder="Ghi chú thêm..."
                                className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                            />
                        </div>

                        <div className="pt-4 text-right">
                            <button
                                type="submit"
                                className="px-6 py-2.5 rounded-xl bg-action-blue hover:bg-glacier-blue text-white font-bold shadow-sm transition-colors text-sm"
                            >
                                Xác nhận Đăng ký
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <EventSnapshotModal 
                isOpen={isSnapshotOpen} 
                eventId={snapshotEventId} 
                onClose={() => {
                    setIsSnapshotOpen(false);
                    setSnapshotEventId(null);
                }} 
            />

            {/* Inline Owner Profile Modal */}
            {isOwnerModalOpen && selectedOwner && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-slide-up relative">
                        <div className="flex items-center justify-between p-5 border-b border-platinum-tint bg-cloud-mist">
                            <h3 className="text-lg font-bold text-midnight-indigo">Thông tin Chủ xe</h3>
                            <button
                                onClick={() => {
                                    setIsOwnerModalOpen(false);
                                    setSelectedOwner(null);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-midnight-indigo hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="flex flex-col items-center">
                                <UserAvatar 
                                    user={selectedOwner} 
                                    className="w-24 h-24 rounded-full text-3xl mb-4 border-4 border-cloud-mist shadow-sm"
                                />
                                <h4 className="text-xl font-bold text-midnight-indigo text-center">{selectedOwner.fullName || 'Không có tên'}</h4>
                                
                                <div className="w-full mt-6 space-y-4">
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Briefcase className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-blue">Phòng ban</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.department || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-blue">Email</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.email || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-blue">Số điện thoại</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.phoneNumber || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ExportReportModal
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                endpoint="/reports/vehicle/exports"
                formats={['xlsx', 'pdf']}
                title="Xuất báo cáo phương tiện"
            />
        </div>
    );
};

export default ANPRManagement;
