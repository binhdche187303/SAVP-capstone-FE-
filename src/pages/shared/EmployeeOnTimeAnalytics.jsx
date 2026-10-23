import { Building2, Clock, Info, RefreshCw, TrendingUp, User, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { getAttendanceAnalytics, getAttendanceUserStats, getUsers, getDepartments } from '../../service/sysAdminServices';
import { get } from '../../utils/request';
import { isSchoolLeader } from '../../utils/calendarRoleLabel';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#64748b'];

// ── Helper: Avatar circle với initials fallback ──────────────────────────────
const AVATAR_COLORS = ['#4361EE', '#7C3AED', '#DB2777', '#D97706', '#15803D', '#0284C7', '#0891B2'];

const UserAvatar = ({ avatarUrl, fullName, size = 32 }) => {
    const initials = (fullName || '?')
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map(w => w[0].toUpperCase())
        .join('');
    const bg = AVATAR_COLORS[(fullName || '').charCodeAt(0) % AVATAR_COLORS.length];

    const [imgError, setImgError] = useState(false);

    if (avatarUrl && !imgError) {
        return (
            <img
                src={avatarUrl}
                alt={fullName}
                onError={() => setImgError(true)}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
        );
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            background: bg, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.floor(size * 0.36), fontWeight: 800,
            flexShrink: 0, userSelect: 'none',
        }}>
            {initials}
        </div>
    );
};

// ── Helper: Pagination bar ───────────────────────────────────────────────────
const Pagination = ({ page, totalPages, total, onPageChange }) => {
    if (totalPages <= 1) return null;

    const visibleCount = Math.min(totalPages, 5);
    const pages = Array.from({ length: visibleCount }, (_, i) => {
        if (totalPages <= 5) return i + 1;
        if (page <= 3) return i + 1;
        if (page >= totalPages - 2) return totalPages - 4 + i;
        return page - 2 + i;
    });

    return (
        <div className="flex items-center justify-between pt-3 border-t border-platinum-tint mt-2 px-1">
            <span className="text-[10px] text-slate-blue font-semibold tabular-nums">
                {total} nhân sự · Trang {page}/{totalPages}
            </span>
            <div className="flex items-center gap-1">
                <button
                    disabled={page === 1}
                    onClick={() => onPageChange(page - 1)}
                    className="px-2 py-1 text-xs border border-platinum-tint rounded-lg disabled:opacity-40 hover:bg-cloud-mist text-slate-blue transition-colors"
                >‹</button>
                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-semibold ${
                            p === page
                                ? 'bg-action-blue text-white border-action-blue'
                                : 'border-platinum-tint hover:bg-cloud-mist text-slate-blue'
                        }`}
                    >{p}</button>
                ))}
                <button
                    disabled={page === totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="px-2 py-1 text-xs border border-platinum-tint rounded-lg disabled:opacity-40 hover:bg-cloud-mist text-slate-blue transition-colors"
                >›</button>
            </div>
        </div>
    );
};

// ────────────────────────────────────────────────────────────────────────────
const EmployeeOnTimeAnalytics = () => {
    // Đọc user từ localStorage synchronously
    const [currentUser] = useState(() => {
        try {
            const s = localStorage.getItem('user');
            return s ? JSON.parse(s) : null;
        } catch { return null; }
    });

    // BGH không thuộc đơn vị nào ⇒ xem toàn trường như admin (BE đã cho BGH phạm vi mọi phòng ban).
    const isManager = currentUser?.roles?.some(
        r => (typeof r === 'string' ? r : (r.roleCode || r.role_code || '')).toUpperCase() === 'MANAGER'
    ) && !(isSchoolLeader(currentUser) && !currentUser?.departmentId);
    const managerDeptId = isManager
        ? (currentUser?.departmentId || currentUser?.department_id || '')
        : '';

    // ── Summary dashboard state ──────────────────────────────────────────────
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    // ── Late history drilldown state ─────────────────────────────────────────
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedUserName, setSelectedUserName] = useState('');
    const [lateHistory, setLateHistory] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState(false);

    // ── Filters ──────────────────────────────────────────────────────────────
    const [preset, setPreset] = useState('month');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [departmentId, setDepartmentId] = useState(managerDeptId);
    const [departments, setDepartments] = useState([]);

    // ── Employee search ──────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // ── Manager: per-user table state ────────────────────────────────────────
    const [memberStats, setMemberStats] = useState([]);
    const [memberPage, setMemberPage] = useState(1);
    const [memberTotalPages, setMemberTotalPages] = useState(1);
    const [memberTotal, setMemberTotal] = useState(0);
    const [memberLoading, setMemberLoading] = useState(false);

    // ── Business Admin: department modal state ───────────────────────────────
    const [modalDept, setModalDept] = useState(null);
    const [modalMembers, setModalMembers] = useState([]);
    const [modalPage, setModalPage] = useState(1);
    const [modalTotalPages, setModalTotalPages] = useState(1);
    const [modalTotal, setModalTotal] = useState(0);
    const [modalLoading, setModalLoading] = useState(false);

    // ── Load departments ─────────────────────────────────────────────────────
    useEffect(() => {
        getDepartments({ limit: 100 })
            .then(res => { if (res?.success) setDepartments(res.data || []); })
            .catch(err => console.error('Lỗi khi tải danh sách phòng ban:', err));
    }, []);

    // ── Debounced employee search ────────────────────────────────────────────
    useEffect(() => {
        if (!searchQuery.trim()) { setSuggestions([]); return; }
        const timer = setTimeout(async () => {
            setSearchingUsers(true);
            try {
                const res = await getUsers({ search: searchQuery, page: 1, limit: 10 });
                if (res?.success) setSuggestions(res.data || []);
            } catch { /* silent */ } finally { setSearchingUsers(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ── Close suggestions on outside click ──────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (!e.target.closest('.suggestion-container')) setShowSuggestions(false);
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // ── Summary analytics fetch ──────────────────────────────────────────────
    const fetchAttendanceDashboard = useCallback(async () => {
        if (preset === 'custom' && (!from || !to)) return;
        setLoading(true);
        setError(null);
        try {
            const params = {
                preset,
                ...(preset === 'custom' && { from, to }),
                ...(departmentId && { departmentId }),
            };
            const res = await getAttendanceAnalytics(params);
            if (res?.success) {
                setData(res.data);
            } else {
                throw new Error(res?.message || 'Không thể tải dữ liệu.');
            }
        } catch (err) {
            setData(null);
            setError(err?.message || 'Không thể tải dữ liệu chuyên cần. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, from, to, departmentId]);

    useEffect(() => { fetchAttendanceDashboard(); }, [fetchAttendanceDashboard]);

    // ── Manager: fetch per-user stats ────────────────────────────────────────
    const fetchMemberStats = useCallback(async () => {
        if (!managerDeptId) return;
        setMemberLoading(true);
        try {
            const res = await getAttendanceUserStats({
                departmentId: managerDeptId,
                preset,
                ...(preset === 'custom' && { from, to }),
                page: memberPage,
                limit: 10,
            });
            if (res?.success && res.data) {
                setMemberStats(res.data.items || []);
                setMemberTotalPages(res.meta?.totalPages ?? res.data.totalPages ?? 1);
                setMemberTotal(res.meta?.total ?? res.data.total ?? 0);
            } else {
                throw new Error('no data');
            }
        } catch {
            setMemberStats([]);
            setMemberTotalPages(1);
            setMemberTotal(0);
        } finally {
            setMemberLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managerDeptId, preset, from, to, memberPage]);

    useEffect(() => {
        if (isManager) fetchMemberStats();
    }, [isManager, fetchMemberStats]);

    // Reset member page khi đổi bộ lọc thời gian
    useEffect(() => { setMemberPage(1); }, [preset, from, to]);

    // ── Business Admin: modal fetch ──────────────────────────────────────────
    const fetchModalMembers = useCallback(async () => {
        if (!modalDept) return;
        setModalLoading(true);
        try {
            const res = await getAttendanceUserStats({
                departmentId: modalDept.departmentId,
                preset,
                ...(preset === 'custom' && { from, to }),
                page: modalPage,
                limit: 10,
            });
            if (res?.success && res.data) {
                setModalMembers(res.data.items || []);
                setModalTotalPages(res.meta?.totalPages ?? res.data.totalPages ?? 1);
                setModalTotal(res.meta?.total ?? res.data.total ?? 0);
            } else {
                throw new Error('no data');
            }
        } catch {
            setModalMembers([]);
            setModalTotalPages(1);
            setModalTotal(0);
        } finally {
            setModalLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modalDept, preset, from, to, modalPage]);

    useEffect(() => { fetchModalMembers(); }, [fetchModalMembers]);

    // Lock body scroll khi modal mở
    useEffect(() => {
        document.body.style.overflow = modalDept ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [modalDept]);

    const handleOpenDeptModal = (dept) => {
        setModalDept(dept);
        setModalPage(1);
    };
    const handleCloseModal = () => {
        setModalDept(null);
        setModalMembers([]);
        setModalPage(1);
    };

    // ── Late history drilldown ───────────────────────────────────────────────
    const handleUserClick = async (user) => {
        setSelectedUserId(user.userId);
        setSelectedUserName(user.fullName);
        setLoadingHistory(true);
        setHistoryError(false);
        setLateHistory(null);
        try {
            const q = `?preset=${preset}${preset === 'custom' ? `&from=${from}&to=${to}` : ''}`;
            const res = await get(`/analytics/attendance/on-time-rate/users/${user.userId}/late-history${q}`);
            if (res?.success) {
                setLateHistory(res.data);
            } else {
                throw new Error(res?.message || 'Không thể tải lịch sử.');
            }
        } catch {
            setHistoryError(true);
        } finally {
            setLoadingHistory(false);
        }
    };

    const pieData = data ? [
        { name: 'Đúng giờ', value: data.onTimeCount ?? 0 },
        { name: 'Đến muộn', value: data.lateCount ?? 0 },
        { name: 'Vắng mặt', value: data.absentCount ?? 0 },
    ] : [];

    const managerDeptName = departments.find(d => d.id === managerDeptId)?.departmentName || '';

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-platinum-tint pb-5">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <Clock className="w-6 h-6 text-action-blue" />
                        Phân tích Tỷ lệ Đúng giờ
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">
                        {isManager
                            ? `Số liệu thống kê đi muộn, vắng mặt của phòng ban bạn quản lý${managerDeptName ? `: ${managerDeptName}` : ''}`
                            : 'Xem số liệu thống kê đi muộn, vắng mặt theo phòng ban và tra cứu lịch sử chi tiết của nhân viên.'}
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Bộ lọc nhanh</label>
                    <select
                        value={preset}
                        onChange={(e) => setPreset(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-semibold"
                    >
                        <option value="day">Hôm nay</option>
                        <option value="week">Tuần này</option>
                        <option value="month">Tháng này</option>
                        <option value="custom">Tùy chọn khoảng</option>
                    </select>
                </div>

                {preset === 'custom' && (
                    <>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Từ ngày</label>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo" />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Đến ngày</label>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo" />
                        </div>
                    </>
                )}

                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Phòng ban</label>
                    {isManager ? (
                        <div className="px-3 py-2 bg-cloud-mist border border-platinum-tint rounded-xl text-xs text-midnight-indigo font-semibold flex items-center gap-1.5 min-w-[160px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-action-blue shrink-0" />
                            {managerDeptName || 'Phòng ban của bạn'}
                        </div>
                    ) : (
                        <select
                            value={departmentId}
                            onChange={(e) => setDepartmentId(e.target.value)}
                            className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-semibold bg-white"
                        >
                            <option value="">Tất cả phòng ban</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.departmentName}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Employee late history search */}
                <div className="space-y-1 relative min-w-[240px] flex-1 suggestion-container">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Tra cứu nhân sự đi muộn</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="Nhập tên, email hoặc mã..."
                            className="w-full px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-semibold pr-8"
                        />
                        {searchingUsers ? (
                            <div className="absolute right-2 top-2.5 w-3.5 h-3.5 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
                        ) : searchQuery && (
                            <button onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                                className="absolute right-2 top-2 text-slate-blue hover:text-midnight-indigo">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-platinum-tint rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                            {suggestions.map(user => (
                                <button key={user.id} type="button"
                                    onClick={() => { handleUserClick({ userId: user.id, fullName: user.fullName }); setShowSuggestions(false); setSearchQuery(''); }}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-col transition-colors">
                                    <span className="text-xs font-bold text-midnight-indigo">{user.fullName}</span>
                                    <span className="text-[10px] text-slate-blue font-mono">{user.email}{user.employeeCode ? ` · ${user.employeeCode}` : ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start text-sm gap-2">
                    <Info className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="flex-1">{error}</p>
                    <button
                        onClick={fetchAttendanceDashboard}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            {data && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                        { label: 'Tỷ lệ đúng giờ', value: `${data.onTimeRate ?? 0}%`, color: 'text-midnight-indigo' },
                        { label: 'Tổng lượt tham dự bắt buộc', value: data.totalRequiredParticipants ?? 0, color: 'text-midnight-indigo' },
                        { label: 'Lượt đi muộn', value: data.lateCount ?? 0, color: 'text-amber-500' },
                        { label: 'Lượt vắng mặt', value: data.absentCount ?? 0, color: 'text-red-500' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-2">
                            <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">{label}</span>
                            <span className={`text-2xl font-black ${color} block`}>{value}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Dashboard Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Manager: per-user table ── */}
                {isManager ? (
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden lg:col-span-2">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-sm">Chuyên cần theo thành viên</h3>
                                <p className="text-[10px] text-slate-blue mt-0.5">Số lượt đúng giờ · đến muộn · vắng mặt trên tổng lịch bắt buộc</p>
                            </div>
                            {memberLoading && (
                                <div className="w-4 h-4 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-platinum-tint bg-slate-50/50 text-[10px] font-bold text-slate-blue uppercase tracking-wider">
                                        <th className="px-4 py-3">Thành viên</th>
                                        <th className="px-4 py-3 text-center">Đúng giờ</th>
                                        <th className="px-4 py-3 text-center">Đến muộn</th>
                                        <th className="px-4 py-3 text-center">Vắng mặt</th>
                                        <th className="px-4 py-3 text-right hidden sm:table-cell">Tổng bắt buộc</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint text-xs">
                                    {memberLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                                                        <div className="h-3 w-24 bg-slate-100 rounded" />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3"><div className="h-5 w-12 bg-slate-100 rounded-full mx-auto" /></td>
                                                <td className="px-4 py-3"><div className="h-5 w-12 bg-slate-100 rounded-full mx-auto" /></td>
                                                <td className="px-4 py-3"><div className="h-5 w-12 bg-slate-100 rounded-full mx-auto" /></td>
                                                <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3 w-8 bg-slate-100 rounded ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : memberStats.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-slate-blue italic">
                                                Không có dữ liệu thành viên nào
                                            </td>
                                        </tr>
                                    ) : (
                                        memberStats.map(member => {
                                            const total = member.totalMeetings ?? member.totalRequired ?? 0;
                                            const late = member.lateCount ?? 0;
                                            const onTime = member.onTimeCount ?? 0;
                                            const absent = member.absentCount ?? Math.max(0, total - onTime - late);
                                            return (
                                                <tr key={member.userId}
                                                    onClick={() => handleUserClick({ userId: member.userId, fullName: member.fullName })}
                                                    className="hover:bg-slate-50/60 transition-colors cursor-pointer">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <UserAvatar avatarUrl={member.avatarUrl} fullName={member.fullName} size={32} />
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-midnight-indigo truncate">{member.fullName}</p>
                                                                {member.employeeCode && (
                                                                    <p className="text-[10px] text-slate-blue font-mono">{member.employeeCode}</p>
                                                                )}
                                                                <p className="text-[10px] text-slate-blue font-mono truncate hidden sm:block">{member.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${onTime > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                            {onTime}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${late > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                                            {late}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${absent > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                                                            {absent}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-blue font-semibold tabular-nums hidden sm:table-cell">
                                                        {total}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {!memberLoading && memberStats.length > 0 && (
                            <div className="px-4 pb-4">
                                <Pagination
                                    page={memberPage}
                                    totalPages={memberTotalPages}
                                    total={memberTotal}
                                    onPageChange={setMemberPage}
                                />
                            </div>
                        )}
                    </div>

                ) : (
                    /* ── Business Admin / SysAdmin: department table + (i) button ── */
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden lg:col-span-2">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                            <h3 className="font-bold text-midnight-indigo text-sm">Tỷ lệ đi muộn theo phòng ban</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-platinum-tint bg-slate-50/50 text-[10px] font-bold text-slate-blue uppercase tracking-wider">
                                        <th className="px-6 py-3">Phòng ban</th>
                                        <th className="px-6 py-3 text-right">Tổng lượt tham dự</th>
                                        <th className="px-6 py-3 text-right">Lượt đi muộn</th>
                                        <th className="px-6 py-3 text-right">Tỷ lệ đi muộn</th>
                                        <th className="px-4 py-3 text-center w-16">Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint text-xs">
                                    {loading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-4 h-12 bg-slate-50/20" />
                                            </tr>
                                        ))
                                    ) : !data?.lateByDepartment || data.lateByDepartment.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-slate-blue italic">
                                                Không có dữ liệu phòng ban nào
                                            </td>
                                        </tr>
                                    ) : (
                                        data.lateByDepartment.map(dept => (
                                            <tr key={dept.departmentId} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-6 py-4 font-bold text-midnight-indigo">{dept.departmentName}</td>
                                                <td className="px-6 py-4 text-right text-slate-blue font-semibold tabular-nums">{dept.totalRequiredParticipants}</td>
                                                <td className="px-6 py-4 text-right font-semibold tabular-nums">
                                                    <span className={dept.lateCount > 0 ? 'text-amber-500' : 'text-emerald-600'}>{dept.lateCount}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold tabular-nums">
                                                    <span className={dept.lateRate > 15 ? 'text-red-500' : dept.lateRate > 0 ? 'text-amber-500' : 'text-emerald-600'}>
                                                        {dept.lateRate}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <button
                                                        onClick={() => handleOpenDeptModal(dept)}
                                                        title={`Xem nhân sự đi muộn — ${dept.departmentName}`}
                                                        className="w-6 h-6 rounded-full border border-platinum-tint text-action-blue text-[11px] font-black hover:bg-action-blue hover:text-white hover:border-action-blue transition-colors inline-flex items-center justify-center"
                                                    >
                                                        i
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pie Chart */}
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                    <h3 className="font-bold text-midnight-indigo text-sm">Phân bố trạng thái chuyên cần</h3>
                    <div className="h-64">
                        {loading ? (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {pieData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend style={{ fontSize: 10 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Trend & Hourly Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                    <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-action-blue" /> Xu hướng chuyên cần theo tuần
                    </h3>
                    <div className="h-72">
                        {loading ? (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                        ) : !data?.trend?.length ? (
                            <div className="w-full h-full flex items-center justify-center text-slate-blue italic text-xs">Không có dữ liệu xu hướng</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={288}>
                                <BarChart data={data.trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="period" tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip labelFormatter={(l) => `Tuần từ: ${new Date(l).toLocaleDateString('vi-VN')}`} contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                    <Bar dataKey="onTimeCount" name="Đúng giờ" stackId="a" fill="#22c55e" />
                                    <Bar dataKey="lateCount" name="Đi muộn" stackId="a" fill="#f59e0b" />
                                    <Bar dataKey="absentCount" name="Vắng mặt" stackId="a" fill="#ef4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                    <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" /> Tỷ lệ đi muộn theo khung giờ trong ngày
                    </h3>
                    <div className="h-72">
                        {loading ? (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                        ) : !data?.lateByHourOfDay?.length ? (
                            <div className="w-full h-full flex items-center justify-center text-slate-blue italic text-xs">Không có dữ liệu khung giờ</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={288}>
                                <BarChart data={data.lateByHourOfDay}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="hourOfDay" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
                                    <Tooltip formatter={(v) => [`${v}%`, 'Tỷ lệ đi muộn']} labelFormatter={(l) => `Khung giờ: ${l}h – ${l + 1}h`} contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                    <Bar dataKey="lateRate" name="Tỷ lệ đi muộn" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Business Admin: Department member modal ─────────────────────── */}
            {modalDept && createPortal(
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
                >
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
                        {/* Modal header */}
                        <div className="px-5 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/40 shrink-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <Building2 className="w-4 h-4 text-action-blue shrink-0" />
                                <div className="min-w-0">
                                    <h3 className="font-bold text-midnight-indigo text-sm truncate">{modalDept.departmentName}</h3>
                                    <p className="text-[10px] text-slate-blue">
                                        Nhân sự đi muộn · {modalTotal} người · tỷ lệ chung {modalDept.lateRate}%
                                    </p>
                                </div>
                            </div>
                            <button onClick={handleCloseModal} className="text-slate-blue hover:text-midnight-indigo shrink-0 ml-2">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="flex-1 overflow-y-auto p-3">
                            {modalLoading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                                            <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                                            <div className="flex-1 space-y-1.5">
                                                <div className="h-3 w-32 bg-slate-100 rounded" />
                                                <div className="h-2.5 w-44 bg-slate-100 rounded" />
                                            </div>
                                            <div className="h-5 w-16 bg-slate-100 rounded-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : modalMembers.length === 0 ? (
                                <div className="py-12 text-center text-slate-blue italic text-xs">
                                    Không có dữ liệu nhân sự cho phòng ban này
                                </div>
                            ) : (
                                <div className="divide-y divide-platinum-tint/60">
                                    {modalMembers.map(member => (
                                        <div
                                            key={member.userId}
                                            onClick={() => { handleCloseModal(); handleUserClick({ userId: member.userId, fullName: member.fullName }); }}
                                            className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-cloud-mist/60 cursor-pointer transition-colors"
                                        >
                                            <UserAvatar avatarUrl={member.avatarUrl} fullName={member.fullName} size={36} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-midnight-indigo truncate">{member.fullName}</p>
                                                <p className="text-[10px] text-slate-blue font-mono truncate">
                                                    {member.email}{member.employeeCode ? ` · ${member.employeeCode}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    member.lateCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'
                                                }`}>
                                                    {member.lateCount} lần muộn
                                                </span>
                                                <span className={`text-xs font-black tabular-nums min-w-[38px] text-right ${
                                                    member.lateRate > 15 ? 'text-red-500' : member.lateRate > 0 ? 'text-amber-500' : 'text-emerald-600'
                                                }`}>
                                                    {member.lateRate}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal footer: pagination */}
                        {!modalLoading && modalTotalPages > 1 && (
                            <div className="px-5 pb-4 pt-1 shrink-0 border-t border-platinum-tint">
                                <Pagination
                                    page={modalPage}
                                    totalPages={modalTotalPages}
                                    total={modalTotal}
                                    onPageChange={setModalPage}
                                />
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* ── Late History Modal ──────────────────────────────────────────── */}
            {selectedUserId && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo flex items-center gap-2 text-sm">
                                <User className="w-4 h-4 text-action-blue" />
                                Chi tiết đi muộn: {selectedUserName}
                            </h3>
                            <button onClick={() => setSelectedUserId(null)} className="text-slate-blue hover:text-midnight-indigo">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {loadingHistory ? (
                                <div className="space-y-3 animate-pulse">
                                    <div className="h-10 bg-slate-100 rounded-lg" />
                                    <div className="h-10 bg-slate-100 rounded-lg" />
                                </div>
                            ) : historyError ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Info className="w-8 h-8 text-red-500 mb-3" />
                                    <p className="text-midnight-indigo text-sm font-bold">Không thể tải lịch sử đi muộn</p>
                                    <p className="mt-1 text-slate-blue text-xs max-w-sm">
                                        Vui lòng kiểm tra kết nối mạng và thử lại.
                                    </p>
                                    <button
                                        onClick={() => handleUserClick({ userId: selectedUserId, fullName: selectedUserName })}
                                        className="mt-4 px-4 py-2 rounded-xl bg-action-blue text-white text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                                    </button>
                                </div>
                            ) : (
                                <div className="border border-platinum-tint rounded-xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-platinum-tint text-[10px] font-bold text-slate-blue uppercase">
                                                <th className="px-4 py-2">Tiêu đề cuộc họp</th>
                                                <th className="px-4 py-2">Thời gian họp</th>
                                                <th className="px-4 py-2">Check-in</th>
                                                <th className="px-4 py-2 text-right">Muộn (phút)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-platinum-tint text-xs text-midnight-indigo">
                                            {!lateHistory?.lateMeetings?.length ? (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-4 text-center text-slate-blue font-medium">Không có lịch sử đi muộn trong kỳ</td>
                                                </tr>
                                            ) : (
                                                lateHistory.lateMeetings.map(meeting => (
                                                    <tr key={meeting.meetingId}>
                                                        <td className="px-4 py-3 font-semibold">{meeting.meetingTitle}</td>
                                                        <td className="px-4 py-3 text-slate-blue font-mono text-[10px]">
                                                            {meeting.scheduledStartTime ? new Date(meeting.scheduledStartTime).toLocaleString('vi-VN') : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-blue font-mono text-[10px]">
                                                            {meeting.checkInTime ? new Date(meeting.checkInTime).toLocaleString('vi-VN') : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-red-500 font-bold tabular-nums">{meeting.lateMinutes}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default EmployeeOnTimeAnalytics;
