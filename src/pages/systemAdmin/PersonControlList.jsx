import { AlertTriangle, CheckCircle, Edit3, Filter, Plus, RefreshCw, Search, Trash2, UserX, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';

import {
    getPersonControlList,
    createPersonControlRecord,
    updatePersonControlRecord,
    deletePersonControlRecord
} from '../../service/personControlListService';
import { getUsers } from '../../service/businessAdminServices';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '../../components/common/Pagination';
import { API_BASE_URL } from '../../utils/request';

// Đối chiếu khi nhận diện khuôn mặt chạy theo user_id → bắt buộc chọn user có trong hệ thống.
const emptyForm = {
    user_id: '',
    user_label: '',
    display_name: '',
    list_type: 'watchlist',
    priority: 'medium',
    reason: '',
    active: true
};

const PersonControlList = () => {
    const [persons, setPersons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        page: 1,
        limit: 10,
        list_type: '',
        active: ''
    });
    const [meta, setMeta] = useState(null);

    // Modal state
    const [modal, setModal] = useState({ open: false, type: 'create', data: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: '' });

    // Form state
    const [formData, setFormData] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});

    // Tìm user để gắn vào mục kiểm soát
    const [userSearch, setUserSearch] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [userSearching, setUserSearching] = useState(false);

    const fetchPersons = useCallback(async (currentFilters = filters) => {
        setLoading(true);
        setError(null);
        try {
            // Bỏ giá trị rỗng để BE không báo lỗi validate
            const cleanFilters = Object.entries(currentFilters).reduce((acc, [key, value]) => {
                if (value !== '') {
                    acc[key] = value;
                }
                return acc;
            }, {});

            const res = await getPersonControlList(cleanFilters);
            if (res?.success) {
                setPersons(res.data || []);
                setMeta(res.meta);
            } else {
                setError(res?.message || 'Không thể tải danh sách đối tượng.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchPersons(filters);
    }, [filters, fetchPersons]);

    useEffect(() => {
        if (successMessage || error) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, error]);

    // Debounce tìm user khi đang mở modal tạo mới
    useEffect(() => {
        if (!modal.open || modal.type !== 'create' || !userSearch.trim()) {
            setUserResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setUserSearching(true);
            try {
                const res = await getUsers({ search: userSearch.trim(), limit: 8 });
                setUserResults(res?.success ? (res.data || []) : []);
            } catch {
                setUserResults([]);
            } finally {
                setUserSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [userSearch, modal.open, modal.type]);

    const handleFilterChange = (key, value) => {
        // Đổi trang thì giữ page mới; đổi filter khác thì về trang 1 (mirror VehicleControlList).
        setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
    };

    const openCreateModal = () => {
        setFormData(emptyForm);
        setFormErrors({});
        setUserSearch('');
        setUserResults([]);
        setModal({ open: true, type: 'create', data: null });
    };

    const openEditModal = (item) => {
        setFormData({
            user_id: item.user_id || '',
            user_label: '',
            display_name: item.display_name || '',
            list_type: item.list_type || 'watchlist',
            priority: item.priority || 'medium',
            reason: item.reason || '',
            active: item.active !== false
        });
        setFormErrors({});
        setModal({ open: true, type: 'edit', data: item });
    };

    // Sửa trường nào thì xóa lỗi validate của trường đó.
    const setField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        if (formErrors[key]) setFormErrors(prev => ({ ...prev, [key]: undefined }));
    };

    const selectUser = (u) => {
        setFormData(prev => ({
            ...prev,
            user_id: u.id,
            user_label: `${u.fullName}${u.email ? ` (${u.email})` : ''}`,
            display_name: prev.display_name || u.fullName || ''
        }));
        setFormErrors(prev => ({ ...prev, user_id: undefined, display_name: undefined }));
        setUserSearch('');
        setUserResults([]);
    };

    const validateForm = () => {
        const errors = {};
        if (modal.type === 'create' && !formData.user_id) {
            errors.user_id = 'Vui lòng chọn người dùng trong hệ thống';
        }
        if (!formData.display_name.trim()) {
            errors.display_name = 'Tên hiển thị không được để trống';
        } else if (formData.display_name.length > 255) {
            errors.display_name = 'Tên hiển thị không được vượt quá 255 ký tự';
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
            const payload = {
                display_name: formData.display_name.trim(),
                list_type: formData.list_type,
                priority: formData.priority,
                reason: formData.reason.trim() || undefined,
                active: formData.active
            };

            let res;
            if (modal.type === 'create') {
                res = await createPersonControlRecord({ ...payload, user_id: formData.user_id });
            } else {
                res = await updatePersonControlRecord(modal.data.id, payload);
            }

            if (res?.success) {
                setSuccessMessage(modal.type === 'create' ? 'Thêm đối tượng thành công!' : 'Cập nhật đối tượng thành công!');
                setModal({ open: false, type: 'create', data: null });
                fetchPersons();
            } else {
                setError(res?.message || 'Có lỗi xảy ra khi lưu.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi hệ thống.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            const res = await deletePersonControlRecord(deleteModal.id);
            if (res?.success) {
                setSuccessMessage('Đã xóa đối tượng khỏi danh sách!');
                fetchPersons();
            } else {
                setError(res?.message || 'Không thể xóa đối tượng.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi xóa.');
        } finally {
            setActionLoading(false);
            setDeleteModal({ open: false, id: null, name: '' });
        }
    };

    const getListTypeDisplay = (type) => {
        switch (type) {
            case 'blocklist': return { label: 'Danh sách đen', color: 'bg-red-100 text-red-700 border-red-200' };
            case 'watchlist': return { label: 'Theo dõi', color: 'bg-orange-100 text-orange-700 border-orange-200' };
            default: return { label: 'Khác', color: 'bg-gray-100 text-gray-700 border-gray-200' };
        }
    };

    const getPriorityDisplay = (p) => {
        switch (p) {
            case 'critical': return { label: 'Nghiêm trọng', color: 'bg-red-600 text-white border-red-600' };
            case 'high': return { label: 'Cao', color: 'bg-red-50 text-red-700 border-red-200' };
            case 'medium': return { label: 'Trung bình', color: 'bg-amber-50 text-amber-700 border-amber-200' };
            case 'low': return { label: 'Thấp', color: 'bg-slate-50 text-slate-600 border-slate-200' };
            default: return { label: p || '-', color: 'bg-gray-100 text-gray-700 border-gray-200' };
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const inputCls = 'w-full p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all';
    const formSelectCls = 'w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:bg-white transition-colors';

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <UserX className="w-3.5 h-3.5" />
                        Đối tượng
                    </span>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Danh sách người giám sát</h1>
                    <p className="text-slate-blue text-sm mt-1">Khi camera nhận diện khuôn mặt của người trong danh sách, hệ thống sẽ tạo cảnh báo "Đối tượng theo dõi".</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors duration-200"
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Thêm đối tượng
                    </button>
                    <button
                        onClick={() => fetchPersons()}
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
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Phân loại</label>
                        <select value={filters.list_type} onChange={(e) => handleFilterChange('list_type', e.target.value)} className={inputCls}>
                            <option value="">Tất cả phân loại</option>
                            <option value="blocklist">Danh sách đen</option>
                            <option value="watchlist">Danh sách theo dõi</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider">Trạng thái</label>
                        <select value={filters.active} onChange={(e) => handleFilterChange('active', e.target.value)} className={inputCls}>
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
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-left">Đối tượng</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Phân loại</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Mức độ</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-left">Lý do</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="px-6 py-4 font-extrabold text-xs text-slate-blue uppercase tracking-wider text-right">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-48"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : persons.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 bg-cloud-mist rounded-full flex items-center justify-center mb-3">
                                                <UserX className="w-6 h-6 text-slate-blue" />
                                            </div>
                                            <p className="text-sm font-bold text-midnight-indigo">Không có dữ liệu</p>
                                            <p className="text-xs text-slate-blue mt-1">Chưa có đối tượng nào hoặc không tìm thấy kết quả phù hợp.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                persons.map((person) => {
                                    const listType = getListTypeDisplay(person.list_type);
                                    const priority = getPriorityDisplay(person.priority);
                                    return (
                                        <tr key={person.id} className="hover:bg-cloud-mist/30 transition-colors">
                                            <td className="px-6 py-4 text-left">
                                                <div className="flex items-center gap-3">
                                                    {person.photo_media_file_id && (
                                                        <a href={`${API_BASE_URL}/person-control-list/${person.id}/photo?token=${localStorage.getItem('accessToken')}`} target="_blank" rel="noreferrer" title="Xem ảnh hồ sơ">
                                                            <img
                                                                src={`${API_BASE_URL}/person-control-list/${person.id}/photo?token=${localStorage.getItem('accessToken')}`}
                                                                alt={person.display_name}
                                                                className="w-10 h-10 rounded-full object-cover border border-platinum-tint flex-shrink-0"
                                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                            />
                                                        </a>
                                                    )}
                                                    <div>
                                                        <div className="font-extrabold text-midnight-indigo">{person.display_name}</div>
                                                        <div className="text-[11px] text-slate-blue mt-0.5">Cập nhật: {formatDate(person.updated_at)}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${listType.color}`}>
                                                    {listType.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${priority.color}`}>
                                                    {priority.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-blue max-w-xs truncate text-left" title={person.reason || ''}>
                                                {person.reason || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center">
                                                    {person.active ? (
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
                                                    <button onClick={() => openEditModal(person)} className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setDeleteModal({ open: true, id: person.id, name: person.display_name })} className="p-1.5 text-slate-blue hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
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
                                {modal.type === 'create' ? 'Thêm Đối tượng Giám sát' : 'Cập nhật Đối tượng'}
                            </h3>
                            <button onClick={() => setModal({ open: false, type: 'create', data: null })} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <form id="person-form" onSubmit={handleSave} className="space-y-5">
                                {modal.type === 'create' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Người dùng trong hệ thống <span className="text-red-500">*</span></label>
                                        {formData.user_id ? (
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                                                <span className="font-semibold text-midnight-indigo truncate">{formData.user_label}</span>
                                                <button type="button" onClick={() => setFormData({ ...formData, user_id: '', user_label: '' })} className="text-xs font-bold text-action-blue hover:underline ml-2 shrink-0">Đổi</button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    placeholder="Tìm theo tên, email, mã nhân viên..."
                                                    value={userSearch}
                                                    onChange={(e) => setUserSearch(e.target.value)}
                                                    className={`w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.user_id ? 'border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                                />
                                                {(userSearching || userResults.length > 0) && (
                                                    <div className="absolute z-10 mt-1 w-full bg-white border border-platinum-tint rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                        {userSearching ? (
                                                            <div className="px-4 py-3 text-xs text-slate-blue">Đang tìm...</div>
                                                        ) : userResults.map(u => (
                                                            <button type="button" key={u.id} onClick={() => selectUser(u)} className="w-full text-left px-4 py-2.5 hover:bg-cloud-mist transition-colors">
                                                                <div className="text-sm font-semibold text-midnight-indigo">{u.fullName}</div>
                                                                <div className="text-[11px] text-slate-blue">
                                                                    {[u.employeeCode, u.email].filter(Boolean).join(' · ')}
                                                                    {u.hasFaceProfile === false && <span className="text-amber-600"> · chưa có khuôn mặt</span>}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {formErrors.user_id && <p className="text-xs text-red-500 font-medium mt-1.5">{formErrors.user_id}</p>}
                                        <p className="text-[11px] text-slate-400 mt-1">Hệ thống nhận diện theo khuôn mặt đã đăng ký của người dùng này.</p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Tên hiển thị <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Tên hiển thị trong cảnh báo..."
                                        value={formData.display_name}
                                        onChange={(e) => setField('display_name', e.target.value)}
                                        className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors ${formErrors.display_name ? 'border-red-500 focus:border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                    />
                                    {formErrors.display_name && <p className="text-xs text-red-500 font-medium mt-1.5">{formErrors.display_name}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Phân loại <span className="text-red-500">*</span></label>
                                        <select value={formData.list_type} onChange={(e) => setFormData({ ...formData, list_type: e.target.value })} className={formSelectCls}>
                                            <option value="watchlist">Danh sách theo dõi</option>
                                            <option value="blocklist">Danh sách đen</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Mức độ cảnh báo <span className="text-red-500">*</span></label>
                                        <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className={formSelectCls}>
                                            <option value="low">Thấp</option>
                                            <option value="medium">Trung bình</option>
                                            <option value="high">Cao</option>
                                            <option value="critical">Nghiêm trọng</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Lý do / Ghi chú</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Nhập lý do theo dõi..."
                                        value={formData.reason}
                                        onChange={(e) => setField('reason', e.target.value)}
                                        className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:bg-white transition-colors resize-none ${formErrors.reason ? 'border-red-500 focus:border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
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
                                form="person-form"
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
                            <h3 className="text-xl font-bold text-midnight-indigo mb-2">Xác nhận xóa đối tượng</h3>
                            <p className="text-sm text-slate-blue mb-6">
                                Bạn có chắc chắn muốn xóa <strong className="text-midnight-indigo">{deleteModal.name}</strong> khỏi danh sách giám sát không?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteModal({ open: false, id: null, name: '' })}
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

export default PersonControlList;
