import { AlertTriangle, Car, CheckCircle, Edit3, Eye, Filter, Plus, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';

import {
    getVehicleControlList,
    createVehicleControl,
    updateVehicleControl,
    deleteVehicleControl
} from '../../service/sysAdminServices';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '../../components/common/Pagination';

// Loại phương tiện (tùy chọn) — khớp CONTROL_LIST_VEHICLE_TYPES ở BE. Chỉ để mô tả/lọc,
// KHÔNG dùng để kiểm tra định dạng biển số.
const VEHICLE_TYPE_OPTIONS = [
    { value: 'car', label: 'Ô tô' },
    { value: 'motorbike', label: 'Xe máy' },
    { value: 'truck', label: 'Xe tải' },
    { value: 'bus', label: 'Xe buýt' },
    { value: 'other', label: 'Khác' },
];
const getVehicleTypeLabel = (value) =>
    VEHICLE_TYPE_OPTIONS.find((o) => o.value === value)?.label || 'Không xác định';

// Bản sao quy tắc BE (capstone-be/src/modules/anpr/utils/plate-format.ts) để báo lỗi sớm:
// ký tự cho phép trên giá trị gốc; sau chuẩn hóa dài 5–10, ≥1 chữ cái, ≥4 chữ số.
const PLATE_ALLOWED_CHARS = /^[A-Za-z0-9 .-]+$/;
const validatePlate = (raw) => {
    const value = raw.trim();
    if (!value) return 'Biển số xe không được để trống';
    if (value.length > 20) return 'Biển số xe không được vượt quá 20 ký tự';
    if (!PLATE_ALLOWED_CHARS.test(value)) {
        return 'Biển số chỉ được chứa chữ, số, dấu cách, dấu gạch ngang (-) hoặc dấu chấm (.)';
    }
    const plate = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const digits = plate.replace(/[^0-9]/g, '').length;
    if (plate.length < 5 || plate.length > 10 || !/[A-Z]/.test(plate) || digits < 4) {
        return 'Biển số không đúng định dạng (ví dụ: 30F-256.58)';
    }
    return '';
};

// BE ValidationPipe trả message dạng mảng — lấy thông báo đầu tiên.
const getErrorMessage = (res, fallback) => {
    const msg = res?.message;
    return (Array.isArray(msg) ? msg[0] : msg) || fallback;
};

const VehicleControlList = () => {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        page: 1,
        limit: 10,
        plate: '',
        list_type: '',
        vehicle_type: '',
        active: ''
    });
    const [meta, setMeta] = useState(null);

    // Modal state
    const [modal, setModal] = useState({ open: false, type: 'create', data: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null, plate: '' });

    // Form state
    const [formData, setFormData] = useState({
        plate_raw: '',
        list_type: 'blocklist',
        vehicle_type: '',
        reason: '',
        active: true
    });
    const [formErrors, setFormErrors] = useState({});

    const fetchVehicles = useCallback(async (currentFilters = filters) => {
        setLoading(true);
        setError(null);
        try {
            // Remove empty strings from filters to prevent validation errors on backend
            const cleanFilters = Object.entries(currentFilters).reduce((acc, [key, value]) => {
                if (value !== '') {
                    acc[key] = value;
                }
                return acc;
            }, {});
            
            const res = await getVehicleControlList(cleanFilters);
            if (res?.success) {
                setVehicles(res.data || []);
                setMeta(res.meta);
            } else {
                setError(res?.message || 'Không thể tải danh sách phương tiện.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchVehicles(filters);
    }, [filters, fetchVehicles]);

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
        // page — đổi chính page thì giữ nguyên giá trị mới. Mirror fix đã áp dụng ở
        // SecurityAlerts.jsx.
        setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
    };

    const openCreateModal = () => {
        setFormData({
            plate_raw: '',
            list_type: 'blocklist',
            vehicle_type: '',
            reason: '',
            active: true
        });
        setFormErrors({});
        setModal({ open: true, type: 'create', data: null });
    };

    const openEditModal = (item) => {
        setFormData({
            plate_raw: item.plate_raw || item.plate_number || '', // Fallback to plate_number if raw is missing
            list_type: item.list_type || 'blocklist',
            vehicle_type: item.vehicle_type || '',
            reason: item.reason || '',
            active: item.active !== false
        });
        setFormErrors({});
        setModal({ open: true, type: 'edit', data: item });
    };

    const validateForm = () => {
        const errors = {};
        // Biển số chỉ nhập khi tạo (không sửa được) — bản ghi cũ sai định dạng vẫn sửa được lý do/trạng thái.
        if (modal.type === 'create') {
            const plateError = validatePlate(formData.plate_raw);
            if (plateError) errors.plate_raw = plateError;
        }

        if (formData.reason && formData.reason.length > 255) {
            errors.reason = 'Lý do không được vượt quá 255 ký tự';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setActionLoading(true);
        try {
            const payload = { ...formData, plate_raw: formData.plate_raw.trim() };
            if (!payload.vehicle_type) delete payload.vehicle_type;

            let res;
            if (modal.type === 'create') {
                res = await createVehicleControl(payload);
            } else {
                res = await updateVehicleControl(modal.data.id, {
                    reason: payload.reason,
                    active: payload.active,
                    vehicle_type: formData.vehicle_type || null
                }); // BE PATCH chỉ cho sửa reason, active, vehicle_type
            }

            if (res?.success) {
                setSuccessMessage(modal.type === 'create' ? 'Thêm biển số thành công!' : 'Cập nhật biển số thành công!');
                setModal({ open: false, type: 'create', data: null });
                fetchVehicles();
            } else {
                setError(getErrorMessage(res, 'Có lỗi xảy ra khi lưu.'));
            }
        } catch (err) {
            setError(getErrorMessage(err, 'Lỗi hệ thống.'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            const res = await deleteVehicleControl(deleteModal.id);
            if (res?.success) {
                setSuccessMessage('Đã xóa biển số thành công!');
                setDeleteModal({ open: false, id: null, plate: '' });
                fetchVehicles();
            } else {
                setError(res?.message || 'Không thể xóa biển số.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi xóa.');
        } finally {
            setActionLoading(false);
            setDeleteModal({ open: false, id: null, plate: '' });
        }
    };

    const getListTypeDisplay = (type) => {
        switch (type) {
            case 'blocklist': return { label: 'Danh sách đen', color: 'bg-red-100 text-red-700 border-red-200' };
            case 'watchlist': return { label: 'Theo dõi', color: 'bg-orange-100 text-orange-700 border-orange-200' };
            default: return { label: 'Khác', color: 'bg-gray-100 text-gray-700 border-gray-200' };
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Car className="w-3.5 h-3.5" />
                        Phương tiện
                    </span>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Biển số Theo dõi</h1>
                    <p className="text-slate-blue text-sm mt-1">Quản lý danh sách chặn và phương tiện cần giám sát tự động (ANPR).</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors duration-200"
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Thêm biển số
                    </button>
                    <button
                        onClick={() => fetchVehicles()}
                        className="p-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl hover:bg-cloud-mist transition-colors duration-200"
                        title="Tải lại dữ liệu"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="font-semibold">{successMessage}</span>
                    </motion.div>
                )}
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span className="font-semibold">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-1">
                <div className="flex items-center gap-2 mb-4 text-sm font-bold text-midnight-indigo">
                    <Filter className="w-4 h-4 text-slate-blue" />
                    Bộ lọc tìm kiếm
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Tìm biển số</label>
                        <input
                            type="text"
                            placeholder="Nhập biển số..."
                            value={filters.plate}
                            onChange={(e) => handleFilterChange('plate', e.target.value)}
                            className="w-full p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Phân loại</label>
                        <select
                            value={filters.list_type}
                            onChange={(e) => handleFilterChange('list_type', e.target.value)}
                            className="w-full p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        >
                            <option value="">Tất cả phân loại</option>
                            <option value="blocklist">Danh sách đen</option>
                            <option value="watchlist">Danh sách theo dõi</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Loại xe</label>
                        <select
                            value={filters.vehicle_type}
                            onChange={(e) => handleFilterChange('vehicle_type', e.target.value)}
                            className="w-full p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        >
                            <option value="">Tất cả loại xe</option>
                            {VEHICLE_TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Trạng thái</label>
                        <select
                            value={filters.active}
                            onChange={(e) => handleFilterChange('active', e.target.value)}
                            className="w-full p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="true">Đang hoạt động</option>
                            <option value="false">Vô hiệu hóa</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-cloud-mist/50 border-b border-platinum-tint">
                            <tr>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Biển số (Gốc)</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Biển số (Chuẩn hóa)</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Phân loại</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Loại xe</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-left">Lý do</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-right">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        <td className="px-6 py-4 text-center flex justify-center"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                        <td className="px-6 py-4 text-center flex justify-center"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                        <td className="px-6 py-4 text-center flex justify-center"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                        <td className="px-6 py-4 text-center flex justify-center"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        <td className="px-6 py-4 text-left"><div className="h-4 bg-gray-200 rounded w-48"></div></td>
                                        <td className="px-6 py-4 text-center flex justify-center"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : vehicles.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 bg-cloud-mist rounded-full flex items-center justify-center mb-3">
                                                <Car className="w-6 h-6 text-slate-blue" />
                                            </div>
                                            <p className="text-sm font-bold text-midnight-indigo">Không có dữ liệu</p>
                                            <p className="text-xs text-slate-blue mt-1">Chưa có biển số nào hoặc không tìm thấy kết quả phù hợp.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                vehicles.map((vehicle) => {
                                    const listType = getListTypeDisplay(vehicle.list_type);
                                    return (
                                        <tr key={vehicle.id} className="hover:bg-cloud-mist/30 transition-colors">
                                            <td className="px-6 py-4 font-mono font-medium text-slate-blue text-center">
                                                {vehicle.plate_raw || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="font-extrabold font-mono tracking-wider text-midnight-indigo text-base">{vehicle.plate_number}</div>
                                                <div className="text-[11px] text-slate-blue mt-0.5">Cập nhật: {formatDate(vehicle.updated_at)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${listType.color}`}>
                                                    {listType.label}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 text-center text-xs ${vehicle.vehicle_type ? 'font-semibold text-midnight-indigo' : 'text-slate-400'}`}>
                                                {getVehicleTypeLabel(vehicle.vehicle_type)}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-blue max-w-xs truncate text-left" title={vehicle.reason}>
                                                {vehicle.reason || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center">
                                                    {vehicle.active ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Hoạt động
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-blue">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-blue"></div> Vô hiệu
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => openEditModal(vehicle)} className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setDeleteModal({ open: true, id: vehicle.id, plate: vehicle.plate_number })} className="p-1.5 text-slate-blue hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
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
                {meta && meta.total > 0 && (
                    <div className="px-6 py-4 bg-cloud-mist/30 border-t border-platinum-tint flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-blue">
                            Hiển thị trang {meta.page} / {meta.totalPages} (Tổng {meta.total} bản ghi)
                        </span>
                        <Pagination 
                            currentPage={filters.page} 
                            totalPages={meta.totalPages} 
                            onPageChange={(p) => handleFilterChange('page', p)} 
                        />
                    </div>
                )}
            </div>

            {/* Modal Add/Edit */}
            {modal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-platinum-tint flex flex-col max-h-[90vh]"
                    >
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-midnight-indigo flex items-center text-lg">
                                {modal.type === 'create' ? 'Thêm Biển số Mới' : 'Cập nhật Biển số'}
                            </h3>
                            <button onClick={() => setModal({ open: false, type: 'create', data: null })} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <form id="vehicle-form" onSubmit={handleSave} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Biển số xe (Thô) <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Nhập biển số xe (VD: 29A-12345)..."
                                        value={formData.plate_raw}
                                        maxLength={20}
                                        onChange={(e) => setFormData({ ...formData, plate_raw: e.target.value })}
                                        disabled={modal.type === 'edit'} // BE spec doesn't allow editing plate_raw in PATCH
                                        className={`w-full px-4 py-2.5 bg-slate-50 border font-mono rounded-xl text-sm focus:outline-none transition-colors disabled:opacity-60 disabled:bg-gray-100 ${formErrors.plate_raw ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue focus:bg-white'}`}
                                    />
                                    {formErrors.plate_raw && <p className="text-xs text-red-500 font-medium mt-1.5">{formErrors.plate_raw}</p>}
                                    {modal.type === 'edit' && <p className="text-[11px] text-slate-400 mt-1">Không thể thay đổi biển số xe sau khi tạo.</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Phân loại <span className="text-red-500">*</span></label>
                                    <select
                                        value={formData.list_type}
                                        onChange={(e) => setFormData({ ...formData, list_type: e.target.value })}
                                        disabled={modal.type === 'edit'} // BE spec PATCH only updates reason & active
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:bg-white transition-colors disabled:opacity-60 disabled:bg-gray-100"
                                    >
                                        <option value="blocklist">Danh sách đen</option>
                                        <option value="watchlist">Danh sách theo dõi</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Loại phương tiện</label>
                                    <select
                                        value={formData.vehicle_type}
                                        onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:bg-white transition-colors"
                                    >
                                        <option value="">Không xác định</option>
                                        {VEHICLE_TYPE_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Lý do / Ghi chú</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Nhập lý do theo dõi..."
                                        value={formData.reason}
                                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                        className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors resize-none ${formErrors.reason ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                    />
                                    {formErrors.reason && <p className="text-xs text-red-500 font-medium mt-1.5">{formErrors.reason}</p>}
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-cloud-mist/50 border border-platinum-tint rounded-xl">
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-midnight-indigo">Trạng thái hoạt động</h4>
                                        <p className="text-xs text-slate-blue mt-0.5">Kích hoạt theo dõi ngay lập tức</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={formData.active}
                                        onClick={() => setFormData({ ...formData, active: !formData.active })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${formData.active ? 'bg-action-blue' : 'bg-slate-300'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${formData.active ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setModal({ open: false, type: 'create', data: null })}
                                className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-midnight-indigo bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="submit"
                                form="vehicle-form"
                                disabled={actionLoading}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-w-[120px]"
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Lưu lại'}
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Modal Confirm Delete */}
            {deleteModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-midnight-indigo mb-2">Xác nhận xóa biển số</h3>
                            <p className="text-sm text-slate-blue mb-6">
                                Bạn có chắc chắn muốn xóa biển số <strong className="text-midnight-indigo font-mono">{deleteModal.plate}</strong> không? Hành động này không thể hoàn tác.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteModal({ open: false, id: null, plate: '' })}
                                    className="flex-1 px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-midnight-indigo bg-slate-50 hover:bg-slate-100 rounded-xl transition-all"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading}
                                    className="flex-1 px-5 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Xóa ngay'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default VehicleControlList;
