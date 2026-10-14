import { AlertTriangle, Bell, BellRing, CheckCircle, Clock, Edit3, Eye, Filter, Mail, Plus, Power, PowerOff, RefreshCw, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';

import {
    getAlertRules,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule
} from '../../service/alertRuleService';
import { getZones } from '../../service/zoneServices';
import { getAlertTypeLabel } from '../../constants/alertType';
import { motion, AnimatePresence } from 'framer-motion';

const AlertRules = () => {
    const [rules, setRules] = useState([]);
    const [zones, setZones] = useState([]);

    const INTRUSION_ZONE_TYPES = ['corridor', 'lobby', 'parking'];
    const intrusionZones = zones.filter(z => INTRUSION_ZONE_TYPES.includes(z.zone_type));
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        page: 1,
        limit: 20,
        alert_type: '',
        zone_id: '',
        enabled: ''
    });
    const [meta, setMeta] = useState(null);

    // Modal state
    const [modal, setModal] = useState({ open: false, type: 'create', data: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null });

    // Form state
    const [formData, setFormData] = useState({
        alert_type: '',
        zone_id: '',
        threshold: '',
        channels: ['in_app'],
        enabled: true,
        allow_from: '',
        allow_to: ''
    });
    const [formErrors, setFormErrors] = useState({});

    const fetchZones = async () => {
        try {
            const res = await getZones({ limit: 100 });
            if (res?.success) setZones(res.data || []);
        } catch (e) {
            console.error('Failed to fetch zones', e);
        }
    };

    const fetchRules = useCallback(async (currentFilters = filters) => {
        setLoading(true);
        setError(null);
        try {
            const res = await getAlertRules(currentFilters);
            if (res?.success) {
                setRules(res.data || []);
                setMeta(res.meta);
            } else {
                setError(res?.message || 'Không thể tải danh sách quy tắc.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchZones();
    }, []);

    useEffect(() => {
        fetchRules(filters);
    }, [filters, fetchRules]);

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
            alert_type: '',
            zone_id: '',
            threshold: '',
            channels: ['in_app'],
            enabled: true,
            allow_from: '',
            allow_to: ''
        });
        setFormErrors({});
        setModal({ open: true, type: 'create', data: null });
    };

    const openEditModal = (rule) => {
        let parsedChannels = [];
        try {
            if (typeof rule.channels === 'string') {
                if (rule.channels.startsWith('{') && rule.channels.endsWith('}')) {
                    parsedChannels = rule.channels.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                } else {
                    parsedChannels = JSON.parse(rule.channels);
                }
            } else if (Array.isArray(rule.channels)) {
                parsedChannels = rule.channels;
            }
        } catch (e) {
            console.error('Error parsing channels', e);
        }

        setFormData({
            alert_type: rule.alert_type || '',
            zone_id: rule.zone_id || '',
            threshold: rule.threshold || '',
            channels: parsedChannels,
            enabled: rule.enabled !== undefined ? rule.enabled : true,
            allow_from: rule.restricted_hours_json?.allowFrom || rule.restricted_hours_json?.allow_from || '',
            allow_to: rule.restricted_hours_json?.allowTo || rule.restricted_hours_json?.allow_to || ''
        });
        setFormErrors({});
        setModal({ open: true, type: 'edit', data: rule });
    };

    const handleFormChange = (key, value) => {
        setFormData(prev => {
            const updated = { ...prev, [key]: value };
            if (key === 'alert_type' && value === 'intrusion' && prev.zone_id) {
                const currentZone = zones.find(z => z.id === prev.zone_id);
                if (currentZone && !INTRUSION_ZONE_TYPES.includes(currentZone.zone_type)) {
                    updated.zone_id = '';
                }
            }
            return updated;
        });
        if (formErrors[key]) {
            setFormErrors(prev => ({ ...prev, [key]: null }));
        }
    };

    const handleChannelToggle = (channel) => {
        setFormData(prev => {
            const currentChannels = Array.isArray(prev.channels) ? prev.channels : [];
            const newChannels = currentChannels.includes(channel) 
                ? currentChannels.filter(c => c !== channel)
                : [...currentChannels, channel];
            return { ...prev, channels: newChannels };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const errors = {};
        if (!formData.alert_type) {
            errors.alert_type = 'Vui lòng chọn loại sự kiện.';
        }
        if (formData.alert_type === 'crowd' && (!formData.threshold || formData.threshold <= 0)) {
            errors.threshold = 'Vui lòng nhập ngưỡng (lớn hơn 0) cho cảnh báo đám đông.';
        }
        if (formData.channels.length === 0) {
            errors.channels = 'Vui lòng chọn ít nhất 1 kênh thông báo.';
        }
        if (!formData.zone_id) {
            errors.zone_id = 'Vui lòng chọn khu vực áp dụng.';
        }

        if (formData.allow_from || formData.allow_to) {
            if (!formData.allow_from || !formData.allow_to) {
                errors.allow_from = 'Vui lòng nhập đầy đủ khung giờ nếu muốn cấu hình hạn chế.';
            }
            // Không chặn allow_from > allow_to: BE coi đây là khung giờ qua nửa đêm
            // (vd 22:00→06:00, công thức current>=from||current<=to), không phải lỗi nhập liệu.
        }

        setFormErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        setActionLoading(true);
        try {
            const payload = {
                alert_type: formData.alert_type,
                zone_id: formData.zone_id || undefined,
                channels: formData.channels,
                enabled: formData.enabled
            };

            if (formData.alert_type === 'crowd') {
                payload.threshold = parseInt(formData.threshold, 10);
            }

            if (formData.allow_from && formData.allow_to) {
                payload.restricted_hours_json = {
                    allow_from: formData.allow_from,
                    allow_to: formData.allow_to
                };
            } else {
                payload.restricted_hours_json = null;
            }

            let res;
            if (modal.type === 'create') {
                res = await createAlertRule(payload);
            } else {
                // Loại sự kiện bị khóa khi sửa — không gửi lại.
                const updatePayload = { ...payload };
                delete updatePayload.alert_type;
                res = await updateAlertRule(modal.data.id, updatePayload);
            }

            if (res?.success) {
                setSuccessMessage(modal.type === 'create' ? 'Tạo quy tắc thành công.' : 'Cập nhật quy tắc thành công.');
                setModal({ open: false, type: 'create', data: null });
                fetchRules();
            } else {
                setError(res?.message || 'Có lỗi xảy ra.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleEnable = async (rule) => {
        try {
            const res = await updateAlertRule(rule.id, { enabled: !rule.enabled });
            if (res?.success) {
                setSuccessMessage(`Đã ${!rule.enabled ? 'bật' : 'tắt'} quy tắc.`);
                fetchRules();
            } else {
                setError(res?.message || 'Có lỗi xảy ra.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        }
    };

    const confirmDelete = (id) => {
        setDeleteModal({ open: true, id });
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            const res = await deleteAlertRule(deleteModal.id);
            if (res?.success) {
                setSuccessMessage('Xóa quy tắc thành công.');
                setDeleteModal({ open: false, id: null });
                fetchRules();
            } else {
                setError(res?.message || 'Lỗi khi xóa.');
            }
        } catch (err) {
            setError('Lỗi kết nối.');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4 animate-fade-in-up">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-platinum-tint">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <BellRing className="w-3.5 h-3.5" />
                        Cảnh báo
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight flex items-center">
                        <ShieldAlert className="w-7 h-7 mr-3 text-action-blue" />
                        Cấu hình Luật Cảnh báo
                    </h1>
                    <p className="text-slate-blue text-sm mt-1 ml-10">
                        Định nghĩa các điều kiện tự động kích hoạt cảnh báo an ninh.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchRules()}
                        disabled={loading}
                        className="inline-flex items-center justify-center p-2.5 text-slate-blue bg-cloud-mist/50 rounded-xl hover:bg-cloud-mist transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center px-4 py-2 bg-action-blue text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-glacier-blue transition-all"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Thêm quy tắc mới
                    </button>
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
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại sự kiện</label>
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
                        <option value="vehicle_unauthorized">Xe không được phép</option>
                        <option value="vehicle_control_match">Biển số theo dõi</option>
                        <option value="device_error">Lỗi thiết bị</option>
                    </select>
                </div>
                <div className="relative">
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Khu vực áp dụng</label>
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
                <div className="relative">
                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Trạng thái</label>
                    <select 
                        value={filters.enabled} 
                        onChange={(e) => handleFilterChange('enabled', e.target.value)}
                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả</option>
                        <option value="true">Đang bật</option>
                        <option value="false">Đang tắt</option>
                    </select>
                </div>
                <div className="relative flex items-end">
                    <button 
                        onClick={() => setFilters({ page: 1, limit: 20, alert_type: '', zone_id: '', enabled: '' })}
                        className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                    >
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
            </div>

            {/* TABLE */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-platinum-tint overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-cloud-mist/30 sticky top-0 z-10 border-b border-platinum-tint">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider">Sự kiện kích hoạt</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider">Khu vực</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider">Điều kiện / Thời gian</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider">Kênh thông báo</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="p-4 text-xs font-bold text-slate-blue uppercase tracking-wider text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading && rules.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-8 text-center text-slate-blue">
                                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            ) : rules.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-12 text-center text-slate-blue">
                                        <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-lg font-medium text-midnight-indigo">Chưa có quy tắc nào</p>
                                        <p className="text-sm mt-1">Bấm Thêm quy tắc mới để bắt đầu cấu hình hệ thống cảnh báo.</p>
                                    </td>
                                </tr>
                            ) : (
                                rules.map(rule => (
                                    <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors border-b border-platinum-tint/50 last:border-0">
                                        <td className="p-4">
                                            <p className="text-sm font-bold text-midnight-indigo uppercase">{getAlertTypeLabel(rule.alert_type)}</p>
                                        </td>
                                        <td className="p-4 text-sm text-midnight-indigo font-medium">
                                            {rule.zone_id ? (zones.find(z => z.id === rule.zone_id)?.zone_name || 'N/A') : <span className="text-slate-blue italic">Toàn hệ thống</span>}
                                        </td>
                                        <td className="p-4 text-sm">
                                            <div className="flex flex-col gap-1.5">
                                                {rule.alert_type === 'crowd' && rule.threshold && (
                                                    <div className="flex items-center gap-1.5 text-midnight-indigo">
                                                        <Users className="w-3.5 h-3.5 text-slate-blue" />
                                                        <span className="text-slate-blue text-[11px]">Ngưỡng:</span> 
                                                        <span className="font-bold text-[11px]">{rule.threshold} người</span>
                                                    </div>
                                                )}
                                                {rule.restricted_hours_json ? (
                                                    <div className="flex items-center gap-1.5 bg-blue-50/50 px-2.5 py-1 rounded-md border border-blue-100/50 w-fit">
                                                        <Clock className="w-3.5 h-3.5 text-action-blue" />
                                                        <span className="text-[11px] font-bold text-action-blue tracking-wide">
                                                            {rule.restricted_hours_json.allowFrom || rule.restricted_hours_json.allow_from} - {rule.restricted_hours_json.allowTo || rule.restricted_hours_json.allow_to}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <Clock className="w-3.5 h-3.5 opacity-60" />
                                                        <span className="text-[11px] font-medium italic">Hoạt động 24/7</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-1 flex-wrap">
                                                {rule.channels?.map(ch => (
                                                    <span key={ch} className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                                        {ch.replace('_', ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => handleToggleEnable(rule)}
                                                className={`inline-flex items-center justify-center p-1.5 rounded-full transition-colors ${rule.enabled ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                title={rule.enabled ? "Tắt quy tắc" : "Bật quy tắc"}
                                            >
                                                {rule.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => openEditModal(rule)}
                                                className="p-1.5 text-slate-400 hover:text-action-blue transition-colors"
                                                title="Chỉnh sửa"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => confirmDelete(rule.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors ml-1"
                                                title="Xóa quy tắc"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
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
                        <span className="text-slate-blue font-medium">Hiển thị {rules.length} / {meta.total} bản ghi</span>
                        <div className="flex gap-2">
                            <button 
                                disabled={filters.page <= 1} 
                                onClick={() => handleFilterChange('page', filters.page - 1)}
                                className="px-3 py-1.5 bg-white border border-platinum-tint rounded-lg font-medium text-slate-blue hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <span className="px-3 py-1.5 font-bold text-midnight-indigo">Trang {filters.page} / {meta.totalPages}</span>
                            <button 
                                disabled={filters.page >= meta.totalPages} 
                                onClick={() => handleFilterChange('page', filters.page + 1)}
                                className="px-3 py-1.5 bg-white border border-platinum-tint rounded-lg font-medium text-slate-blue hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CREATE / EDIT MODAL */}
            {modal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-platinum-tint flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-midnight-indigo flex items-center text-lg">
                                {modal.type === 'create' ? 'Thêm quy tắc mới' : 'Chỉnh sửa quy tắc'}
                            </h3>
                            <button onClick={() => setModal({ open: false, type: 'create', data: null })} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            <form id="rule-form" onSubmit={handleSubmit} noValidate className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Loại sự kiện <span className="text-red-500">*</span></label>
                                    <select 
                                        required
                                        disabled={modal.type === 'edit'}
                                        value={formData.alert_type} 
                                        onChange={(e) => handleFormChange('alert_type', e.target.value)}
                                        className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors disabled:opacity-60 ${formErrors.alert_type ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                    >
                                        <option value="" disabled>-- Chọn sự kiện kích hoạt --</option>
                                        <option value="stranger">Người lạ</option>
                                        <option value="crowd">Đám đông</option>
                                        <option value="intrusion">Xâm nhập</option>
                                        <option value="person_watchlist_match">Đối tượng theo dõi</option>
                                        <option value="unknown_vehicle">Xe lạ</option>
                                        <option value="vehicle_unauthorized">Xe không được phép</option>
                                        <option value="vehicle_control_match">Biển số theo dõi</option>
                                        <option value="device_error">Lỗi thiết bị</option>
                                    </select>
                                    {formErrors.alert_type && <p className="text-red-500 text-xs mt-1.5">{formErrors.alert_type}</p>}
                                </div>

                                {formData.alert_type === 'crowd' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Ngưỡng cảnh báo (Số người) <span className="text-red-500">*</span></label>
                                        <input 
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.threshold}
                                            onChange={(e) => handleFormChange('threshold', e.target.value)}
                                            placeholder="Ví dụ: 10"
                                            className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.threshold ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                        />
                                        {formErrors.threshold && <p className="text-red-500 text-xs mt-1.5">{formErrors.threshold}</p>}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Khu vực áp dụng <span className="text-red-500">*</span></label>
                                    <select
                                        required
                                        value={formData.zone_id}
                                        onChange={(e) => handleFormChange('zone_id', e.target.value)}
                                        className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.zone_id ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                    >
                                        <option value="" disabled>-- Chọn khu vực áp dụng --</option>
                                        {(formData.alert_type === 'intrusion' ? intrusionZones : zones).map(z => (
                                            <option key={z.id} value={z.id}>{z.zone_name}</option>
                                        ))}
                                    </select>
                                    {formErrors.zone_id && <p className="text-red-500 text-xs mt-1.5">{formErrors.zone_id}</p>}
                                    {formData.alert_type === 'intrusion' && (
                                        <p className="text-[10px] text-slate-400 mt-1.5">
                                            Chỉ hiển thị khu vực loại hành lang, sảnh, bãi đỗ xe — phòng họp và cổng ra vào không áp dụng cho cảnh báo xâm nhập.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Khung giờ hoạt động (Tùy chọn)</label>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <input 
                                                type="time" lang="en-GB" 
                                                value={formData.allow_from}
                                                onChange={(e) => handleFormChange('allow_from', e.target.value)}
                                                className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.allow_from ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                            />
                                            {formErrors.allow_from && <p className="text-red-500 text-xs mt-1.5">{formErrors.allow_from}</p>}
                                        </div>
                                        <span className="text-slate-blue font-medium mt-1">đến</span>
                                        <div className="flex-1">
                                            <input 
                                                type="time" lang="en-GB" 
                                                value={formData.allow_to}
                                                onChange={(e) => handleFormChange('allow_to', e.target.value)}
                                                className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.allow_to ? '!border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                            />
                                            {formErrors.allow_to && <p className="text-red-500 text-xs mt-1.5">{formErrors.allow_to}</p>}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1.5">Để trống để áp dụng cảnh báo 24/7.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-2">Kênh thông báo <span className="text-red-500">*</span></label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label 
                                            className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                                formData.channels.includes('in_app') 
                                                ? 'bg-blue-50/50 border-action-blue text-action-blue shadow-sm' 
                                                : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                            }`}
                                        >
                                            <input 
                                                type="checkbox" 
                                                className="sr-only"
                                                checked={formData.channels.includes('in_app')}
                                                onChange={() => handleChannelToggle('in_app')}
                                            />
                                            <Bell className={`w-6 h-6 mb-2 ${formData.channels.includes('in_app') ? 'animate-bounce' : ''}`} />
                                            <span className="text-sm font-semibold text-center">In-App</span>
                                            {formData.channels.includes('in_app') && (
                                                <div className="absolute top-2 right-2">
                                                    <CheckCircle className="w-4 h-4 text-action-blue" />
                                                </div>
                                            )}
                                        </label>
                                        
                                        <label 
                                            className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                                formData.channels.includes('email') 
                                                ? 'bg-blue-50/50 border-action-blue text-action-blue shadow-sm' 
                                                : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                            }`}
                                        >
                                            <input 
                                                type="checkbox" 
                                                className="sr-only"
                                                checked={formData.channels.includes('email')}
                                                onChange={() => handleChannelToggle('email')}
                                            />
                                            <Mail className={`w-6 h-6 mb-2 ${formData.channels.includes('email') ? 'animate-bounce' : ''}`} />
                                            <span className="text-sm font-semibold text-center">Email</span>
                                            {formData.channels.includes('email') && (
                                                <div className="absolute top-2 right-2">
                                                    <CheckCircle className="w-4 h-4 text-action-blue" />
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                    {formErrors.channels && <p className="text-red-500 text-xs mt-1.5">{formErrors.channels}</p>}
                                </div>

                                {modal.type === 'create' && (
                                    <div className="pt-2">
                                        <label className="flex items-center cursor-pointer">
                                            <div className="relative w-10 h-5 mr-3">
                                                <input 
                                                    type="checkbox" 
                                                    className="peer sr-only"
                                                    checked={formData.enabled}
                                                    onChange={(e) => handleFormChange('enabled', e.target.checked)}
                                                />
                                                <div className="w-full h-full bg-slate-200 rounded-full peer-checked:bg-green-500 transition-colors"></div>
                                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                            <span className="text-sm font-bold text-midnight-indigo">Kích hoạt quy tắc ngay</span>
                                        </label>
                                    </div>
                                )}
                            </form>
                        </div>
                        
                        <div className="p-4 border-t border-platinum-tint bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button 
                                type="button" 
                                onClick={() => setModal({ open: false, type: 'create', data: null })} 
                                className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-platinum-tint rounded-xl hover:bg-cloud-mist transition-colors"
                            >
                                Hủy bỏ
                            </button>
                            <button 
                                type="submit" 
                                form="rule-form"
                                disabled={actionLoading} 
                                className="px-5 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue transition-colors flex items-center disabled:opacity-70"
                            >
                                {actionLoading && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                                {modal.type === 'create' ? 'Tạo quy tắc' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* DELETE MODAL */}
            {deleteModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-platinum-tint">
                        <div className="p-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-midnight-indigo mb-2">Xóa quy tắc này?</h3>
                            <p className="text-sm text-slate-blue mb-6">Bạn có chắc chắn muốn xóa quy tắc cảnh báo này không? Hành động này không thể hoàn tác.</p>
                            
                            <div className="flex w-full gap-3">
                                <button 
                                    onClick={() => setDeleteModal({ open: false, id: null })} 
                                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-platinum-tint rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    Hủy bỏ
                                </button>
                                <button 
                                    onClick={handleDelete}
                                    disabled={actionLoading}
                                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center disabled:opacity-70"
                                >
                                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Xóa ngay'}
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

export default AlertRules;
