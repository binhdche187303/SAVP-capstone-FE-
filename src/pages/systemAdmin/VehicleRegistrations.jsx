import { totalOf, useFacetCounts } from '../../hooks/useFilterCounts';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { AlertTriangle, Briefcase, Car, CheckCircle2, Filter, Mail, Phone, Search, User, Users, X, XCircle, ChevronDown, Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import { FaBicycle, FaCar, FaMotorcycle } from 'react-icons/fa';
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
    getAdminVehicleRegistrations,
    getUserById,
    getUsers,
    resyncVehicleRegistration,
    resyncAllVehicleRegistrations,
    reconcileHgvisionPlates,
} from '../../service/sysAdminServices';
import { HGV_SYNC, HGV_RESYNCABLE, resyncTitle } from '../../utils/hgvisionSync';
import { hasPermission } from '../../utils/permissionUtils';
import toast from '../../utils/toast';


import UserAvatar from '../../components/common/UserAvatar';
import SharedStatCard, { toneOf } from '../../components/common/StatCard';

// ─── helpers ───────────────────────────────────────────────────────────────

const VEHICLE_META = {
    car:       { label: 'Ô tô',   Icon: FaCar,        colorCls: 'text-blue-700 bg-blue-50 border-blue-200',          plateCls: 'bg-white border-blue-600 text-blue-900' },
    motorbike: { label: 'Xe máy', Icon: FaMotorcycle, colorCls: 'text-amber-700 bg-amber-50 border-amber-200',       plateCls: 'bg-yellow-50 border-yellow-500 text-yellow-900' },
    bicycle:   { label: 'Xe đạp', Icon: FaBicycle,    colorCls: 'text-emerald-700 bg-emerald-50 border-emerald-200', plateCls: 'bg-white border-slate-400 text-slate-800' },
};

const STATUS_META = {
    active:   { label: 'Hoạt động', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    disabled: { label: 'Vô hiệu',   cls: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500' },
};

// DB lưu chữ thường (car/motorbike); 'motorcycle' là tên khác của xe máy.
const getVehicleMeta  = (type)   => VEHICLE_META[String(type || '').toLowerCase() === 'motorcycle' ? 'motorbike' : String(type || '').toLowerCase()] || { label: 'Khác', Icon: FaCar, colorCls: 'text-slate-700 bg-slate-50 border-slate-200', plateCls: 'bg-white border-slate-400 text-slate-800' };
const getStatusMeta   = (status) => STATUS_META[(status || '').toLowerCase()] || { label: status, cls: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-400' };

const normaliseOwner = (owner) => {
    if (!owner) return null;
    return {
        ...owner,
        fullName:     owner.fullName     || owner.full_name     || owner.user?.fullName     || owner.user?.full_name || '',
        email:        owner.email        || owner.user?.email   || '',
        phoneNumber:  owner.phoneNumber  || owner.phone_number  || owner.phone || owner.user?.phoneNumber || '',
        department:   owner.department?.departmentName || owner.department || owner.departmentName || owner.department_name || owner.user?.department || '',
        employeeCode: owner.employeeCode || owner.employee_code || owner.user?.employeeCode || '',
    };
};

const formatDateTime = (iso) => {
    if (!iso) return { date: '—', time: '' };
    const d = new Date(iso);
    return {
        date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
};

// ─── stat card ─────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, colorCls, loading, onClick, selected, hint }) => (
    <StatisticCard icon={icon} label={label} value={value} tone={statisticTone(colorCls)} loading={loading}
        onClick={onClick} selected={selected} helper={hint} />
);

// ─── main component ─────────────────────────────────────────────────────────

const VehicleRegistrations = () => {
    const [registrations, setRegistrations] = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);
    const [meta, setMeta]                   = useState(null);
    const [usersMap, setUsersMap]           = useState({});

    const [filters, setFilters] = useState({ page: 1, limit: 10, search: '', status: '', vehicleType: '', owner: '' });
    const [showOwnerFilter, setShowOwnerFilter] = useState(false);

    // owner modal
    const [selectedOwner,      setSelectedOwner]      = useState(null);
    const [ownerDetail,        setOwnerDetail]        = useState(null);
    const [ownerDetailLoading, setOwnerDetailLoading] = useState(false);
    const [isOwnerModalOpen,   setIsOwnerModalOpen]   = useState(false);

    const [syncingId, setSyncingId] = useState(null);
    const [bulkSyncing, setBulkSyncing] = useState(false);
    const [reconciling, setReconciling] = useState(false);
    // Cùng quyền với BE (anpr.vehicle.admin_register) — không có quyền thì ẩn nút.
    const canSync = hasPermission('anpr.vehicle.admin_register');

    // ── data fetch ──────────────────────────────────────────────────────────

    const fetchRegistrations = useCallback(async (currentFilters = filters, silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await getAdminVehicleRegistrations(currentFilters);
            if (res?.success) {
                setRegistrations(res.data || []);
                setMeta(res.meta);
            } else {
                setError(res?.message || 'Không thể tải lịch sử đăng ký xe.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchRegistrations(filters); }, [filters, fetchRegistrations]);

    // Đẩy hàng loạt xe chưa đồng bộ (đăng ký trước khi có tính năng / lỗi / lúc cờ ghi tắt).
    const handleResyncAll = async () => {
        setBulkSyncing(true);
        try {
            const res = await resyncAllVehicleRegistrations();
            const d = res?.data;
            if (!res?.success) {
                setError(res?.message || 'Không đồng bộ được sang HGVision.');
            } else if (!d?.enabled) {
                toast.info('Hệ thống chưa dùng HGVision (CAMERA_PROVIDER khác hgvision).');
            } else if (d.total === 0) {
                toast.success('Mọi xe đăng ký đều đã đồng bộ HGVision.');
            } else {
                const parts = [`Đã đồng bộ ${d.synced}/${d.total} xe sang HGVision`];
                if (d.failed) parts.push(`${d.failed} lỗi`);
                if (d.pending) parts.push(`${d.pending} chưa ghi (cờ ghi đang tắt)`);
                if (d.remaining) parts.push(`còn ${d.remaining} xe — bấm lại để đẩy tiếp`);
                (d.failed || d.pending ? toast.warning : toast.success)(parts.join(', ') + '.');
            }
            fetchRegistrations(filters, true);
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi đồng bộ.');
        } finally {
            setBulkSyncing(false);
        }
    };

    // Đối soát ngay SAVP ↔ HGVision (job tự chạy định kỳ; nút này để khỏi chờ).
    const handleReconcile = async () => {
        setReconciling(true);
        try {
            const res = await reconcileHgvisionPlates();
            const d = res?.data;
            if (!res?.success) {
                setError(res?.message || 'Không đối soát được với HGVision.');
            } else if (!d?.enabled) {
                toast.info('Hệ thống chưa dùng HGVision (CAMERA_PROVIDER khác hgvision).');
            } else if (d.busy) {
                toast.info('Đang đối soát, vui lòng chờ chút rồi thử lại.');
            } else if (d.aborted) {
                toast.warning(d.aborted);
            } else {
                const parts = [];
                if (d.restored) parts.push(`khôi phục ${d.restored} biển bị xoá`);
                if (d.removed) parts.push(`xoá ${d.removed} biển thừa`);
                if (d.pushed) parts.push(`đẩy lại ${d.pushed} xe`);
                if (d.mismatched) parts.push(`${d.mismatched} biển lệch với hệ thống nhận diện`);
                if (d.missing) parts.push(`${d.missing} biển bị xoá chưa khôi phục (cờ ghi đang tắt)`);
                if (d.failed) parts.push(`${d.failed} lỗi`);
                if (!parts.length) toast.success(`Đã đối soát ${d.checked} biển — khớp với HGVision.`);
                else (d.mismatched || d.missing || d.failed ? toast.warning : toast.success)(`Đối soát xong: ${parts.join(', ')}.`);
            }
            fetchRegistrations(filters, true);
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi đối soát.');
        } finally {
            setReconciling(false);
        }
    };

    const handleResync = async (reg) => {
        setSyncingId(reg.id);
        try {
            const res = await resyncVehicleRegistration(reg.id);
            const status = res?.data?.hgvision_sync_status;
            if (!res?.success) {
                setError(res?.message || 'Không đồng bộ được sang HGVision.');
            } else if (status !== 'synced') {
                setError(res?.data?.hgvision_sync_error || HGV_SYNC[status]?.text || 'Chưa đồng bộ được sang HGVision.');
            }
            fetchRegistrations(filters, true);
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi đồng bộ.');
        } finally {
            setSyncingId(null);
        }
    };

    // usersMap — one-time, for avatar resolution
    useEffect(() => {
        (async () => {
            try {
                const res = await getUsers({ limit: 1000 });
                if (res?.success && res.data) {
                    const map = {};
                    (Array.isArray(res.data) ? res.data : res.data.users || []).forEach(u => { map[u.id] = u; });
                    setUsersMap(map);
                }
            } catch (_) {}
        })();
    }, []);

    // silent polling every 60s
    useEffect(() => {
        const id = setInterval(() => fetchRegistrations(filters, true), 60000);
        return () => clearInterval(id);
    }, [fetchRegistrations, filters]);

    // ── derived stats ───────────────────────────────────────────────────────

    const activeCount   = registrations.filter(r => (r.status || '').toLowerCase() === 'active').length;
    const disabledCount = registrations.filter(r => (r.status || '').toLowerCase() === 'disabled').length;
    const uniqueOwners  = new Set(registrations.map(r => r.owner?.userId || r.owner?.user_id || r.owner?.id).filter(Boolean)).size;

    // ── owner modal ─────────────────────────────────────────────────────────

    const handleOwnerClick = async (owner) => {
        const base = normaliseOwner(owner);
        if (!base) return;
        setSelectedOwner(base);
        setOwnerDetail(null);
        setIsOwnerModalOpen(true);
        const userId = owner.userId || owner.user_id || owner.id;
        if (userId) {
            setOwnerDetailLoading(true);
            try {
                const res = await getUserById(userId);
                if (res?.success && res.data) setOwnerDetail(res.data);
            } catch (_) {}
            finally { setOwnerDetailLoading(false); }
        }
    };

    const closeOwnerModal = () => { setIsOwnerModalOpen(false); setSelectedOwner(null); setOwnerDetail(null); };

    // [FIX] Object literal { ...prev, [key]: value, page: 1 } — khi key='page' (đổi
    // trang), 'page: 1' viết SAU '[key]: value' trong CÙNG object literal nên đè mất
    // giá trị page vừa set (JS: key trùng trong 1 literal, giá trị SAU CÙNG thắng) →
    // bấm "Sau"/số trang nào cũng bị kéo về trang 1. Chỉ ép page=1 khi đổi filter KHÁC
    // page — đổi chính page thì giữ nguyên giá trị mới. Mirror fix đã áp dụng ở
    // SecurityAlerts.jsx.
    // Số đếm cạnh lựa chọn của từng ô lọc (mỗi ô đếm theo các bộ lọc khác).
    const countTotal = useCallback(
        (f) => getAdminVehicleRegistrations(Object.fromEntries(Object.entries({ ...f, page: 1, limit: 1 }).filter(([, v]) => v !== '' && v != null))).then(totalOf),
        [],
    );
    const statusCounts = useFacetCounts(filters, 'status', ['active', 'disabled'], countTotal);
    const vehicleTypeCounts = useFacetCounts(filters, 'vehicleType', ['car', 'motorbike', 'bicycle'], countTotal);

    const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));

    // ── render ──────────────────────────────────────────────────────────────

    return (
        <div data-page-surface="wide" className="space-y-6 max-w-7xl mx-auto pb-10">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                            <Car className="w-3.5 h-3.5" /> Kiểm soát Phương tiện
                        </span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Lịch sử Đăng ký Xe</h1>
                    <p className="text-slate-blue text-sm mt-1">Toàn bộ phương tiện đã đăng ký — tra cứu theo chủ xe, biển số hoặc loại xe.</p>
                </div>
                <div className="flex items-center gap-2">
                    {canSync && (
                        <button
                            type="button"
                            onClick={handleResyncAll}
                            disabled={bulkSyncing}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-platinum-tint bg-white text-sm font-bold text-midnight-indigo hover:bg-cloud-mist/40 transition-colors disabled:opacity-50"
                            title="Đẩy các xe chưa đồng bộ sang HGVision (Bình thường, chủ xe theo tài khoản)"
                        >
                            <RefreshCw className={`w-4 h-4 ${bulkSyncing ? 'animate-spin' : ''}`} />
                            Đồng bộ HGVision
                        </button>
                    )}
                    {canSync && (
                        <button
                            type="button"
                            onClick={handleReconcile}
                            disabled={reconciling}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-platinum-tint bg-white text-sm font-bold text-midnight-indigo hover:bg-cloud-mist/40 transition-colors disabled:opacity-50"
                            title="So danh sách biển với HGVision: khôi phục biển bị xoá, báo biển lệch, xoá biển thừa (tự chạy mỗi 15 phút)"
                        >
                            <ScanSearch className={`w-4 h-4 ${reconciling ? 'animate-pulse' : ''}`} />
                            Đối soát ngay
                        </button>
                    )}
                    <RefreshButton
                        onClick={() => fetchRegistrations()}
                        title="Làm mới dữ liệu"
                        busy={loading}
                    />
                </div>
            </div>

            {/* ── Stat cards ── */}
            <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Car} label="Tổng phương tiện" value={meta?.total ?? registrations.length}
                    colorCls="bg-indigo-50 text-indigo-600" loading={loading}
                    selected={!filters.status && !filters.search && !filters.vehicleType && !filters.owner && !showOwnerFilter}
                    onClick={() => { setShowOwnerFilter(false); setFilters(prev => ({ ...prev, page: 1, search: '', status: '', vehicleType: '', owner: '' })); }} />
                <StatCard icon={CheckCircle2} label="Đang hoạt động" value={activeCount}
                    colorCls="bg-emerald-50 text-emerald-600" loading={loading}
                    selected={filters.status === 'active'} hint="Trong trang hiện tại"
                    onClick={() => handleFilterChange('status', filters.status === 'active' ? '' : 'active')} />
                <StatCard icon={XCircle} label="Vô hiệu" value={disabledCount}
                    colorCls="bg-red-50 text-red-500" loading={loading}
                    selected={filters.status === 'disabled'} hint="Trong trang hiện tại"
                    onClick={() => handleFilterChange('status', filters.status === 'disabled' ? '' : 'disabled')} />
                <StatCard icon={Users} label="Số chủ xe" value={uniqueOwners}
                    colorCls="bg-blue-50 text-action-blue" loading={loading}
                    selected={showOwnerFilter} hint="Trong trang hiện tại"
                    onClick={() => { setShowOwnerFilter(prev => !prev); handleFilterChange('owner', ''); }} />
            </StatisticGrid>

            {/* ── Error ── */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="font-semibold">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Filters ── */}
            <FilterBar variant="card" className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-sm font-extrabold text-midnight-indigo">
                    <Filter className="w-4 h-4 text-slate-blue" /> Bộ lọc
                </div>
                <div data-filter-grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* search */}
                    <FilterField label="Tìm kiếm" className="lg:col-span-2"><div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Tên / Email / Biển số..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        />
                    </div></FilterField>

                    {showOwnerFilter && (
                        <FilterField label="Chủ xe"><div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Tên hoặc email chủ xe..."
                                value={filters.owner}
                                onChange={(e) => handleFilterChange('owner', e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 border border-platinum-tint rounded-xl text-sm"
                            />
                        </div></FilterField>
                    )}

                    {/* status filter */}
                    <FilterField label="Trạng thái"><div className="relative">
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                        <FilterMultiSelect singleSelect counts={statusCounts}
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="w-full appearance-none pl-3 pr-9 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all cursor-pointer"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="active">Hoạt động</option>
                            <option value="disabled">Vô hiệu</option>
                        </FilterMultiSelect>
                    </div></FilterField>

                    {/* vehicle type filter */}
                    <FilterField label="Loại phương tiện"><div className="relative">
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                        <FilterMultiSelect counts={vehicleTypeCounts}
                            value={filters.vehicleType}
                            onChange={(e) => handleFilterChange('vehicleType', e.target.value)}
                            className="w-full appearance-none pl-3 pr-9 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all cursor-pointer"
                        >
                            <option value="">Tất cả loại xe</option>
                            <option value="car">Ô tô</option>
                            <option value="motorbike">Xe máy</option>
                            <option value="bicycle">Xe đạp</option>
                        </FilterMultiSelect>
                    </div></FilterField>
                </div>
            </FilterBar>

            {/* ── Table ── */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full text-left text-sm">
                        <colgroup>
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '7%' }} />
                            <col style={{ width: '29%' }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '14%' }} />
                        </colgroup>
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Ngày</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Giờ</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Chủ xe</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Biển số</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Loại xe</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Ghi chú</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-14" /></td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
                                                <div className="space-y-1.5">
                                                    <div className="h-3.5 bg-gray-200 rounded w-28" />
                                                    <div className="h-2.5 bg-gray-100 rounded w-36" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center"><div className="h-8 bg-gray-200 rounded-lg w-28 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-40" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                                    </tr>
                                ))
                            ) : registrations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-2xl bg-cloud-mist flex items-center justify-center">
                                                <Car className="w-7 h-7 text-slate-blue" />
                                            </div>
                                            <p className="font-bold text-midnight-indigo">Không có kết quả</p>
                                            <p className="text-xs text-slate-blue">Chưa có đăng ký xe nào khớp với điều kiện lọc.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {registrations.map((reg, idx) => {
                                        const owner        = reg.owner;
                                        const ownerName    = owner?.fullName || owner?.full_name || 'Không rõ';
                                        const ownerEmail   = owner?.email || 'Chưa cung cấp';
                                        const ownerId      = owner?.userId || owner?.user_id || owner?.id;
                                        const resolvedUser = (ownerId && usersMap[ownerId]) || normaliseOwner(owner);
                                        const vm           = getVehicleMeta(reg.vehicle_type);
                                        const sm           = getStatusMeta(reg.status);
                                        const { date, time } = formatDateTime(reg.created_at);

                                        return (
                                            <motion.tr
                                                key={reg.id}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.03, duration: 0.2 }}
                                                className="hover:bg-cloud-mist/30 transition-colors"
                                            >
                                                {/* Ngày ĐK */}
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-midnight-indigo">{date}</td>

                                                {/* Giờ ĐK */}
                                                <td className="px-6 py-4 whitespace-nowrap text-[11px] text-slate-blue">{time}</td>

                                                {/* Chủ xe */}
                                                <td className="px-6 py-4">
                                                    {owner ? (
                                                        <button
                                                            className="flex items-center gap-3 text-left group hover:bg-slate-50 p-1.5 -m-1.5 rounded-xl transition-colors w-fit"
                                                            onClick={() => handleOwnerClick(owner)}
                                                            title="Xem chi tiết chủ xe"
                                                        >
                                                            <UserAvatar
                                                                user={resolvedUser}
                                                                name={ownerName}
                                                                className="w-9 h-9 rounded-full shrink-0 text-xs font-bold shadow-sm border border-platinum-tint group-hover:border-action-blue transition-all"
                                                            />
                                                            <div>
                                                                <p className="font-bold text-action-blue group-hover:text-blue-700 transition-colors leading-tight">{ownerName}</p>
                                                                <p data-ui-text="secondary" className="text-[11px] text-slate-blue">{ownerEmail}</p>
                                                            </div>
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-3 p-1.5">
                                                            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                                                                <User className="w-4 h-4 text-gray-400" />
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-slate-400">Không rõ</p>
                                                                <p data-ui-text="secondary" className="text-[11px] text-slate-300">—</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Biển số */}
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-block px-3 py-1.5 rounded-lg border-2 font-mono font-extrabold tracking-widest text-sm ${vm.plateCls}`}>
                                                        {reg.plate_number || '—'}
                                                    </span>
                                                </td>

                                                {/* Loại xe */}
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${vm.colorCls}`}>
                                                        <vm.Icon className="w-3.5 h-3.5" />
                                                        {vm.label}
                                                    </span>
                                                </td>

                                                {/* Ghi chú */}
                                                <td className="px-6 py-4 text-xs text-slate-blue max-w-[200px] truncate" title={reg.note}>
                                                    {reg.note || <span className="text-slate-300">—</span>}
                                                </td>

                                                {/* Trạng thái */}
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${sm.cls}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                                                        {sm.label}
                                                    </span>
                                                    {HGV_SYNC[reg.hgvision_sync_status] && (
                                                        <div
                                                            className={`mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold ${HGV_SYNC[reg.hgvision_sync_status].cls}`}
                                                            title={reg.hgvision_sync_error || ''}
                                                        >
                                                            {HGV_SYNC[reg.hgvision_sync_status].text}
                                                            {canSync && HGV_RESYNCABLE.includes(reg.hgvision_sync_status) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleResync(reg)}
                                                                    disabled={syncingId === reg.id}
                                                                    className="p-1 text-slate-blue hover:text-amber-600 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
                                                                    title={resyncTitle(reg.hgvision_sync_status)}
                                                                >
                                                                    <RefreshCw className={`w-3.5 h-3.5 ${syncingId === reg.id ? 'animate-spin' : ''}`} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </ResponsiveTable>
                </div>

                {/* Pagination */}
                {meta && <PaginationRegion legacyVisible={meta && meta.total > 0}><PaginationFooter
                        currentPage={meta.page}
                        totalPages={meta.totalPages}
                        totalItems={meta.total}
                        pageSize={filters.limit}
                        onPageChange={(p) => handleFilterChange('page', p)}
                        itemLabel={"bản ghi"}
                        loading={loading}
                     onPageSizeChange={size => { setFilters(previous => ({ ...previous, limit: size, page: 1 })); }} /></PaginationRegion>}
            </div>

            {/* ── Owner Detail Modal ── */}
            {isOwnerModalOpen && selectedOwner && createPortal(
                <AnimatePresence>
                    <motion.div
                        key="owner-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/60 backdrop-blur-md"
                        onClick={closeOwnerModal}
                    >
                        <motion.div
                            key="owner-modal"
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* modal header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-platinum-tint bg-cloud-mist">
                                <h3 className="text-base font-extrabold text-midnight-indigo">Thông tin Chủ xe</h3>
                                <button onClick={closeOwnerModal} className="p-1.5 rounded-lg text-slate-400 hover:text-midnight-indigo hover:bg-slate-200 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* modal body */}
                            {(() => {
                                const d    = ownerDetail || selectedOwner;
                                const name = d.fullName || d.full_name || 'Không có tên';
                                const email = d.email || selectedOwner.email || 'Chưa cung cấp';
                                const phone = d.phoneNumber || d.phone_number || d.phone || selectedOwner.phoneNumber || 'Chưa cung cấp';
                                const dept  = d.department?.departmentName || d.department || d.departmentName || selectedOwner.department || 'Chưa cung cấp';
                                const code  = d.employeeCode || d.employee_code || selectedOwner.employeeCode;
                                return (
                                    <div className="p-6 overflow-y-auto">
                                        <div className="flex flex-col items-center mb-6">
                                            {ownerDetailLoading ? (
                                                <div className="w-24 h-24 rounded-full border-4 border-cloud-mist bg-slate-100 flex items-center justify-center mb-4">
                                                    <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
                                                </div>
                                            ) : (
                                                <UserAvatar
                                                    user={ownerDetail || selectedOwner}
                                                    name={name}
                                                    className="w-24 h-24 rounded-full text-3xl mb-4 border-4 border-cloud-mist shadow-sm"
                                                />
                                            )}
                                            <h4 className="text-xl font-extrabold text-midnight-indigo text-center">{name}</h4>
                                            {code && (
                                                <span data-ui-text="code" className="mt-1.5 text-[11px] font-mono text-slate-blue bg-cloud-mist px-2.5 py-0.5 rounded-full border border-platinum-tint">
                                                    {code}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            {[
                                                { icon: Briefcase, label: 'Phòng ban',       value: dept },
                                                { icon: Mail,      label: 'Email',            value: email },
                                                { icon: Phone,     label: 'Số điện thoại',   value: phone },
                                            ].map(({ icon: Icon, label, value }) => (
                                                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm flex-shrink-0">
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p data-ui-text="label" className="text-[11px] font-semibold text-slate-blue">{label}</p>
                                                        <p className="text-sm font-bold text-midnight-indigo truncate">{value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default VehicleRegistrations;
