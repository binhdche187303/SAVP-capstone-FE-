import { Activity } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { createPortal } from 'react-dom';
import UserAvatar from '../../components/common/UserAvatar';
import { formatAuditAction } from '../../constants/auditActionLabels';
import { getAuditLogs, exportAuditLogs, getUserById, getAuditLogActionTypes } from '../../service/sysAdminServices';

/**
 * AuditLogs Component
 * UC-CFG-02: System Activity Audit Logs
 * Displays security audit trails, sensitive actor actions, IP sources, and database entity transitions.
 */
// Nhãn hành động dùng chung với file Excel xuất từ BE — xem constants/auditActionLabels.js.
const formatActionName = formatAuditAction;

// [FIX] Đọc trực tiếp mọi giá trị entity_type thật đang được ghi vào audit_logs trên toàn BE
// (grep entityType/entity_type qua tất cả module) — 2 key cũ SAI ĐỊNH DẠNG hoàn toàn
// ('iot-devices' → thật là 'iot_devices' gạch dưới; 'system-configurations' → thật là
// 'system_configs') nên không bao giờ khớp, cộng thêm bổ sung đầy đủ các entity_type thật còn
// thiếu (trước chỉ phủ 5/30+ giá trị thật).
const ENTITY_TRANSLATIONS = {
    'auth': 'Hệ thống xác thực',
    'users': 'Quản lý tài khoản',
    'iot_devices': 'Giám sát thiết bị IoT',
    'rooms': 'Quản lý phòng họp',
    'room': 'Phòng họp',
    'room_booking': 'Đặt phòng họp',
    'system_configs': 'Cấu hình hệ thống',
    'face_profile': 'Hồ sơ khuôn mặt',
    'face_profiles': 'Hồ sơ khuôn mặt',
    'role': 'Vai trò',
    'role_permission': 'Phân quyền vai trò',
    'permission': 'Quyền hạn',
    'department': 'Phòng ban',
    'background_jobs': 'Tác vụ nền',
    'meeting': 'Cuộc họp',
    'meetings': 'Cuộc họp',
    'meeting_minutes': 'Biên bản họp',
    'meeting_request': 'Yêu cầu đặt phòng họp',
    'meeting_participant': 'Thành viên cuộc họp',
    'meeting_external_participant': 'Khách mời ngoài công ty',
    'meeting_agenda': 'Chương trình họp',
    'meeting_booking': 'Đặt lịch phòng họp',
    'equipment': 'Thiết bị phòng họp',
    'no_show_case': 'Trường hợp vắng mặt',
    'no_show_cases': 'Trường hợp vắng mặt',
    'security_alerts': 'Cảnh báo an ninh',
    'attendance_records': 'Bản ghi điểm danh',
    'analytics_dashboard': 'Bảng thống kê',
    'audit_logs': 'Nhật ký hệ thống',
    'zones': 'Khu vực giám sát'
};

// So khớp không phân biệt hoa/thường và dấu tiếng Việt
const normalizeText = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

const TRANSLATED_KEYS = {
    browser: 'Trình duyệt Web',
    os: 'Hệ điều hành',
    sessionLifeMinutes: 'Thời lượng phiên làm việc (phút)',
    reason: 'Lý do thực hiện',
    lockedUntil: 'Khóa đến thời gian',
    deviceCode: 'Mã thiết bị',
    lastSeen: 'Hoạt động lần cuối',
    retryCount: 'Số lần kết nối lại',
    ipAddress: 'Địa chỉ IP thiết bị',
    deviceName: 'Tên thiết bị',
    deviceType: 'Chủng loại thiết bị',
    streamUrl: 'Đường dẫn RTSP stream',
    filtersUsed: 'Bộ lọc xuất dữ liệu',
    rowCount: 'Tổng số dòng dữ liệu',
    email: 'Địa chỉ Email',
    fullName: 'Họ và tên nhân viên',
    roleIds: 'Mã nhóm quyền hạn',
    attempts: 'Số lần thử đăng nhập',
    before: 'Dữ liệu trước cập nhật',
    after: 'Dữ liệu sau cập nhật',
    input: 'Dữ liệu gửi lên'
};

const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${hh}:${mm}:${ss} ${dd}/${month}/${yyyy}`;
};

// eslint-disable-next-line no-unused-vars
const renderPayloadDetails = (payload) => {
    if (!payload || typeof payload !== 'object') return null;

    const renderItemValue = (val) => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'object') {
            return (
                <div className="pl-3 border-l border-platinum-tint mt-1 space-y-1">
                    {Object.entries(val).map(([k, v]) => (
                        <div key={k}>
                            <span className="font-semibold text-slate-blue">{TRANSLATED_KEYS[k] || k}:</span>{' '}
                            <span className="text-midnight-indigo font-mono">{renderItemValue(v)}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return String(val);
    };

    return (
        <div className="grid grid-cols-1 gap-2 text-sm text-midnight-indigo">
            {Object.entries(payload).map(([key, val]) => {
                if (key === 'before' || key === 'after' || key === 'input') {
                    return (
                        <div key={key} className="border border-platinum-tint/60 rounded-xl p-3 bg-cloud-mist/20 mt-1">
                            <span className="block text-xs font-bold text-slate-blue uppercase tracking-wider mb-1">
                                {TRANSLATED_KEYS[key] || key}
                            </span>
                            <div className="font-mono text-xs">
                                {renderItemValue(val)}
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between py-1.5 border-b border-platinum-tint/30">
                        <span className="text-xs font-bold text-slate-blue uppercase tracking-wider">
                            {TRANSLATED_KEYS[key] || key}
                        </span>
                        <span className="font-mono text-sm text-midnight-indigo font-semibold sm:text-right">
                            {renderItemValue(val)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const AuditLogs = () => {
    // States
    const today = new Date().toISOString().slice(0, 10);

    const [logsList, setLogsList] = useState([]);
    const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters states
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedAction, setSelectedAction] = useState('');
    const [selectedEntity, setSelectedEntity] = useState('');
    const [selectedSeverity, setSelectedSeverity] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Dynamic action types from BE
    const [actionTypes, setActionTypes] = useState([]);

    // Log detail modal
    const [selectedLog, setSelectedLog] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Actor user detail modal
    const [isActorDetailOpen, setIsActorDetailOpen] = useState(false);
    const [selectedActorUser, setSelectedActorUser] = useState(null);
    const [actorDetailLoading, setActorDetailLoading] = useState(false);

    // Load action types once on mount
    useEffect(() => {
        getAuditLogActionTypes()
            .then((res) => { if (res?.success) setActionTypes(res.data || []); })
            .catch(() => {});
    }, []);

    // Chờ người dùng ngừng gõ mới gọi API
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // BE chỉ biết mã action/entity; nhãn tiếng Việt hiển thị nằm ở FE nên tự dò mã có nhãn khớp từ khóa
    const searchParams = useMemo(() => {
        if (!debouncedSearch) return {};
        const keyword = normalizeText(debouncedSearch);
        return {
            search: debouncedSearch,
            searchActionTypes: actionTypes
                .map((at) => at.actionType)
                .filter((code) => normalizeText(formatActionName(code)).includes(keyword)),
            searchEntityTypes: Object.keys(ENTITY_TRANSLATIONS)
                .filter((code) => normalizeText(ENTITY_TRANSLATIONS[code]).includes(keyword)),
        };
    }, [debouncedSearch, actionTypes]);

    // Load data
    const fetchLogs = useCallback(async (pageNumber = 1, pageLimit = 10) => {
        setLoading(true);
        setError(null);

        const params = {
            page: pageNumber,
            limit: pageLimit,
            ...searchParams,
            action: selectedAction || undefined,
            entity: selectedEntity || undefined,
            severity: selectedSeverity || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        };

        try {
            const res = await getAuditLogs(params);
            if (res?.success) {
                setLogsList(res.data || []);
                setMeta(res.meta || { page: pageNumber, limit: pageLimit, total: res.data?.length || 0, totalPages: 1 });
            } else {
                throw new Error('Fallback to mock data');
            }
        } catch {
            setLogsList([]);
            setMeta({ page: pageNumber, limit: pageLimit, total: 0, totalPages: 1 });
        } finally {
            setLoading(false);
        }
    }, [selectedAction, selectedEntity, selectedSeverity, startDate, endDate, searchParams]);

    useEffect(() => {
        fetchLogs(1, meta.limit);
    }, [fetchLogs, meta.limit]);

    // Auto-hide alert boxes
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleApplyFilters = () => {
        // Bỏ qua thời gian chờ gõ; nếu từ khóa đã khớp thì effect không chạy lại nên gọi trực tiếp
        if (search.trim() !== debouncedSearch) setDebouncedSearch(search.trim());
        else fetchLogs(1, meta.limit);
    };

    const handleClearFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setSelectedAction('');
        setSelectedEntity('');
        setSelectedSeverity('');
        setStartDate('');
        setEndDate('');
        fetchLogs(1, meta.limit);
    };

    const handleOpenDetail = (log) => {
        setSelectedLog(log);
        setIsDetailOpen(true);
    };

    // Mở modal chi tiết người dùng — gọi GET /users/:actorUserId
    const handleOpenActorDetail = async (log) => {
        const actorId = log.actorUserId || log.actorId;
        if (!actorId) return;
        setSelectedActorUser(null);
        setActorDetailLoading(true);
        setIsActorDetailOpen(true);
        try {
            const res = await getUserById(actorId);
            if (res?.success) setSelectedActorUser(res.data);
        } catch {
            // giữ modal mở, hiện skeleton hoặc thông báo lỗi
        } finally {
            setActorDetailLoading(false);
        }
    };

    const handleExport = async () => {
        if (!startDate || !endDate) {
            setError('Vui lòng chọn đầy đủ khoảng thời gian (Từ ngày và Đến ngày) để xuất nhật ký.');
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            setError('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
            return;
        }

        setExporting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const res = await exportAuditLogs({
                startDate,
                endDate,
                action: selectedAction,
                entity: selectedEntity,
                severity: selectedSeverity,
                ...searchParams
            });

            if (res?.success && res?.isBlob) {
                const blob = res.data;
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;

                const now = new Date();
                const padStr = (n) => String(n).padStart(2, '0');
                const stamp = `${now.getFullYear()}${padStr(now.getMonth() + 1)}${padStr(now.getDate())}-${padStr(now.getHours())}${padStr(now.getMinutes())}${padStr(now.getSeconds())}`;
                a.download = `nhat-ky-he-thong-${stamp}.xlsx`;

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                setSuccessMessage('Xuất nhật ký hệ thống ra file Excel thành công.');
            } else {
                throw new Error('Dữ liệu xuất không hợp lệ từ máy chủ.');
            }
        } catch (err) {
            console.error('Lỗi khi xuất tệp nhật ký:', err);
            setError(err?.error?.message || err?.message || 'Có lỗi xảy ra khi xuất tệp nhật ký.');
        } finally {
            setExporting(false);
        }
    };

    // Helper badges styling
    const getActionBadge = (action) => {
        if (!action) return 'bg-slate-50 text-slate-700 border-slate-200';
        const safeAction = String(action).toUpperCase();
        if (safeAction.includes('CREATE') || safeAction.includes('SUCCESS') || safeAction === 'LOGIN') {
            return 'bg-green-50 text-green-700 border-green-200';
        }
        if (safeAction.includes('UPDATE') || safeAction.includes('EDIT')) {
            return 'bg-amber-50 text-amber-700 border-amber-200';
        }
        if (safeAction.includes('LOCK') || safeAction.includes('FAILED') || safeAction.includes('DELETE') || safeAction.includes('OFFLINE')) {
            return 'bg-red-50 text-red-700 border-red-200';
        }
        return 'bg-slate-50 text-slate-700 border-slate-200';
    };

    // [FIX] severity thật (audit-log.entity.ts AuditLogSeverity) là info/warning/error/critical.
    // Trước đây check 'success' (không phải giá trị thật nào cả — 'info' luôn rơi else → đỏ sai
    // màu) và gộp chung error+critical vào cùng 1 nhãn/màu "Thất bại" — critical (mức nghiêm
    // trọng nhất) không phân biệt được với error thường. Tách riêng cả 4 mức.
    const getStatusBadge = (status) => {
        if (status === 'info') return 'bg-green-100 text-green-800';
        if (status === 'warning') return 'bg-amber-100 text-amber-800';
        if (status === 'critical') return 'bg-red-200 text-red-900';
        return 'bg-red-100 text-red-800';
    };

    const getStatusLabel = (status) => {
        if (status === 'info') return 'Thành công';
        if (status === 'warning') return 'Cảnh báo';
        if (status === 'critical') return 'Nghiêm trọng';
        return 'Thất bại';
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Activity className="w-3.5 h-3.5" />
                        Nhật ký
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Nhật ký hệ thống</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Theo dõi lịch sử vận hành, ghi nhận thao tác của quản trị viên và các cảnh báo khẩn cấp.
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exporting ? 'Đang xuất...' : 'Xuất nhật ký'}
                </button>
            </div>

            {/* Notification messages */}
            {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-3 animate-pulse-soft">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {/* Filters panel */}
            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* Search query */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tìm kiếm từ khóa</label>
                        <input
                            type="text"
                            placeholder="Email, tên, hoặc mô tả..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilters(); }}
                            maxLength={100}
                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                        />
                    </div>

                    {/* Action Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại hành động</label>
                        <select
                            value={selectedAction}
                            onChange={(e) => setSelectedAction(e.target.value)}
                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                        >
                            <option value="">Tất cả hành động</option>
                            {actionTypes.map((at) => (
                                <option key={at.actionType} value={at.actionType}>
                                    {formatActionName(at.actionType)} ({at.count})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Severity Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mức độ</label>
                        <select
                            value={selectedSeverity}
                            onChange={(e) => setSelectedSeverity(e.target.value)}
                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                        >
                            <option value="">Tất cả mức độ</option>
                            <option value="info">Thành công (Info)</option>
                            <option value="warning">Cảnh báo (Warning)</option>
                            <option value="error">Thất bại (Error)</option>
                            <option value="critical">Nghiêm trọng (Critical)</option>
                        </select>
                    </div>

                    {/* Start date */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            max={endDate || today}
                            onChange={(e) => {
                                const val = e.target.value;
                                setStartDate(val);
                                if (endDate && val > endDate) setEndDate('');
                            }}
                            className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-action-blue text-slate-blue ${startDate && endDate && startDate > endDate ? 'border-red-400 bg-red-50' : 'border-platinum-tint'}`}
                        />
                    </div>

                    {/* End date */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate || undefined}
                            max={today}
                            onChange={(e) => {
                                const val = e.target.value;
                                setEndDate(val);
                                if (startDate && val < startDate) setStartDate('');
                            }}
                            className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-action-blue text-slate-blue ${startDate && endDate && startDate > endDate ? 'border-red-400 bg-red-50' : 'border-platinum-tint'}`}
                        />
                        {startDate && endDate && startDate > endDate && (
                            <p className="text-[10px] text-red-500 font-semibold mt-1">Ngày kết thúc phải sau ngày bắt đầu</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-platinum-tint/50">
                    <div className="text-xs text-slate-blue font-medium">
                        Tìm thấy <span className="font-bold text-midnight-indigo">{meta.total}</span> bản ghi nhật ký.
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleClearFilters}
                            className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors"
                        >
                            Xóa bộ lọc
                        </button>
                        <button
                            type="button"
                            onClick={handleApplyFilters}
                            className="px-4 py-2 bg-cloud-mist hover:bg-platinum-tint text-midnight-indigo rounded-xl text-xs font-semibold transition-colors"
                        >
                            Áp dụng
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs Data Table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin"></div>
                        <p className="text-slate-blue text-sm mt-4">Đang tải lịch sử nhật ký hệ thống...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-cloud-mist/55 text-slate-blue text-xs font-bold uppercase border-b border-platinum-tint/70">
                                    <th className="py-4 px-6">Thời gian</th>
                                    <th className="py-4 px-6">Tài khoản</th>
                                    <th className="py-4 px-6">Hành động</th>
                                    <th className="py-4 px-6">Phân hệ</th>
                                    <th className="py-4 px-6">Địa chỉ IP</th>
                                    <th className="py-4 px-6">Trạng thái</th>
                                    <th className="py-4 px-6 text-center">Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-platinum-tint/40 text-sm">
                                {logsList.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-12 text-center text-slate-blue italic">
                                            Không có nhật ký nào trùng khớp với bộ lọc của bạn.
                                        </td>
                                    </tr>
                                ) : (
                                    logsList.map(log => (
                                        <tr key={log.id} className="hover:bg-cloud-mist/30 transition-colors">
                                            {/* Thời gian — gộp ngày + giờ */}
                                            <td className="py-4 px-6 whitespace-nowrap">
                                                <div className="font-mono text-xs font-semibold text-midnight-indigo">
                                                    {formatTimestamp(log.createdAt || log.timestamp).split(' ')[0]}
                                                </div>
                                                <div className="font-mono text-[11px] text-slate-blue">
                                                    {formatTimestamp(log.createdAt || log.timestamp).split(' ')[1]}
                                                </div>
                                            </td>

                                            {/* Tài khoản — avatar + tên có thể click */}
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => handleOpenActorDetail(log)}
                                                        className="shrink-0 focus:outline-none"
                                                        title="Xem hồ sơ người dùng"
                                                        disabled={!(log.actorUserId || log.actorId)}
                                                    >
                                                        <UserAvatar
                                                            user={{
                                                                fullName: log.actorName,
                                                                email: log.actorEmail,
                                                                avatarUrl: log.actorAvatarUrl || null
                                                            }}
                                                            className="w-9 h-9 rounded-full font-bold text-sm"
                                                        />
                                                    </button>
                                                    <div>
                                                        <button
                                                            onClick={() => handleOpenActorDetail(log)}
                                                            disabled={!(log.actorUserId || log.actorId)}
                                                            className="font-semibold text-midnight-indigo hover:text-action-blue hover:underline text-left text-sm leading-tight disabled:cursor-default disabled:no-underline disabled:hover:text-midnight-indigo"
                                                        >
                                                            {log.actorName || 'Hệ thống'}
                                                        </button>
                                                        {log.actorEmail && (
                                                            <div className="text-xs text-slate-blue font-mono mt-0.5">
                                                                {log.actorEmail}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-4 px-6">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(log.actionType || log.action)}`}>
                                                    {formatActionName(log.actionType || log.action)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-xs font-semibold text-slate-blue uppercase">
                                                {ENTITY_TRANSLATIONS[log.entityType || log.entity] || (log.entityType || log.entity)}
                                            </td>
                                            <td className="py-4 px-6 text-slate-blue font-mono text-xs">
                                                {log.ipAddress || '-'}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getStatusBadge(log.severity || log.status)}`}>
                                                    {getStatusLabel(log.severity || log.status)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <button
                                                    onClick={() => handleOpenDetail(log)}
                                                    className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                    title="Xem chi tiết nhật ký"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination footer */}
                {!loading && logsList.length > 0 && (
                    <div className="p-4 bg-cloud-mist/20 border-t border-platinum-tint/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-blue font-medium">Số dòng hiển thị:</span>
                            <select
                                value={meta.limit}
                                onChange={(e) => {
                                    const nextLimit = Number(e.target.value);
                                    setMeta(prev => ({ ...prev, limit: nextLimit }));
                                    fetchLogs(1, nextLimit);
                                }}
                                className="px-2 py-1 border border-platinum-tint rounded-lg text-xs text-slate-blue focus:outline-none focus:border-action-blue bg-white font-semibold"
                            >
                                <option value={10}>10 dòng</option>
                                <option value={20}>20 dòng</option>
                                <option value={50}>50 dòng</option>
                            </select>
                            <span className="text-xs text-slate-blue">
                                Hiển thị {(meta.page - 1) * meta.limit + 1} - {Math.min(meta.page * meta.limit, meta.total)} trên {meta.total} dòng
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <button
                                disabled={meta.page <= 1}
                                onClick={() => fetchLogs(meta.page - 1, meta.limit)}
                                className="px-3 py-1.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Trước
                            </button>
                            <button
                                disabled={meta.page >= meta.totalPages}
                                onClick={() => fetchLogs(meta.page + 1, meta.limit)}
                                className="px-3 py-1.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* DETAIL LOG MODAL */}
            {isDetailOpen && selectedLog && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setIsDetailOpen(false); }}
                >
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-2xl w-full overflow-hidden animate-fade-in-up">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-start justify-between bg-cloud-mist/50 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${getActionBadge(selectedLog.actionType || selectedLog.action).replace('border', '').replace(/border-\S+/g, '')}`}>
                                    <Activity className="w-4.5 h-4.5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-midnight-indigo text-base leading-tight">Chi tiết nhật ký hoạt động</h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(selectedLog.actionType || selectedLog.action)}`}>
                                            {formatActionName(selectedLog.actionType || selectedLog.action)}
                                        </span>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(selectedLog.severity || selectedLog.status)}`}>
                                            {getStatusLabel(selectedLog.severity || selectedLog.status)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDetailOpen(false)}
                                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                            {/* Row 1: Thời gian + IP */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Thời gian ghi nhận</span>
                                    <span className="text-sm font-semibold text-midnight-indigo font-mono">{formatTimestamp(selectedLog.createdAt || selectedLog.timestamp)}</span>
                                </div>
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Địa chỉ IP thao tác</span>
                                    <span className="text-sm font-semibold text-midnight-indigo font-mono">{selectedLog.ipAddress || '—'}</span>
                                </div>
                            </div>

                            {/* Row 2: Tài khoản + Phân hệ */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Tài khoản thực hiện</span>
                                    <span className="text-sm font-semibold text-midnight-indigo">{selectedLog.actorName || 'Hệ thống'}</span>
                                    {selectedLog.actorEmail && (
                                        <span className="block text-xs text-slate-blue font-mono mt-0.5">{selectedLog.actorEmail}</span>
                                    )}
                                </div>
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Phân hệ</span>
                                    <span className="text-sm font-semibold text-midnight-indigo">
                                        {ENTITY_TRANSLATIONS[selectedLog.entityType || selectedLog.entity] || (selectedLog.entityType || selectedLog.entity) || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Description */}
                            {selectedLog.description && (
                                <div className="rounded-xl border border-outline-gray/50 p-4 bg-white">
                                    <span className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-2">Mô tả hành động</span>
                                    <p className="text-sm text-midnight-indigo leading-relaxed">{selectedLog.description}</p>
                                </div>
                            )}

                            {/* Payload */}
                            {selectedLog.payload && Object.keys(selectedLog.payload).length > 0 && (
                                <div className="border border-platinum-tint/70 rounded-2xl overflow-hidden">
                                    <div className="px-4 py-3 bg-cloud-mist/40 border-b border-platinum-tint/50">
                                        <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Chi tiết thay đổi thông tin hệ thống</span>
                                    </div>
                                    <div className="p-4 space-y-1">
                                        {renderPayloadDetails(selectedLog.payload)}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-3.5 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end">
                            <button
                                onClick={() => setIsDetailOpen(false)}
                                className="px-5 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ACTOR USER DETAIL MODAL */}
            {isActorDetailOpen && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setIsActorDetailOpen(false); }}
                >
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-xl w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Chi tiết hồ sơ tài khoản</h3>
                            <button onClick={() => setIsActorDetailOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {actorDetailLoading || !selectedActorUser ? (
                            <div className="p-12 flex flex-col items-center justify-center">
                                <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-slate-blue text-sm">Đang tải thông tin tài khoản...</p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                                {/* Avatar header */}
                                <div className="flex items-center gap-4 bg-cloud-mist/55 p-4 rounded-xl border border-platinum-tint/50">
                                    <UserAvatar
                                        user={selectedActorUser}
                                        className="w-16 h-16 rounded-full shrink-0 font-extrabold text-xl"
                                    />
                                    <div>
                                        <h4 className="text-lg font-bold text-midnight-indigo leading-tight">{selectedActorUser.fullName}</h4>
                                        <p className="text-sm text-slate-blue mt-0.5">{selectedActorUser.email}</p>
                                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                            {selectedActorUser.roles?.map((r, idx) => (
                                                <span key={idx} className="text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">
                                                    {typeof r === 'string' ? r : (r.roleName || r.name || r.roleCode || r.code)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Thông tin cá nhân */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin cá nhân</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Mã nhân viên:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedActorUser.employeeCode || 'Chưa thiết lập'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Số điện thoại:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedActorUser.phoneNumber || selectedActorUser.phone || 'Chưa cung cấp'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Cấu trúc tổ chức */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Cấu trúc tổ chức</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Phòng ban:</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {selectedActorUser.department?.departmentName
                                                        || selectedActorUser.department?.name
                                                        || selectedActorUser.departments?.[0]?.departmentName
                                                        || selectedActorUser.departments?.[0]?.name
                                                        || 'Chưa phân bổ'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Chức danh:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedActorUser.positionTitle || 'Chưa thiết lập'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Thông tin hệ thống */}
                                    <div className="md:col-span-2 space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin hệ thống</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Trạng thái:</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
                                                    selectedActorUser.accountStatus === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                                }`}>
                                                    {selectedActorUser.accountStatus === 'active' ? 'Hoạt động' : 'Bị khóa'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Đăng nhập cuối:</span>
                                                <span className="font-semibold text-midnight-indigo block mt-1">
                                                    {selectedActorUser.lastLoginAt
                                                        ? new Date(selectedActorUser.lastLoginAt).toLocaleString('vi-VN')
                                                        : 'Chưa có thông tin'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Hồ sơ khuôn mặt:</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
                                                    selectedActorUser.hasFaceProfile ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                    {selectedActorUser.hasFaceProfile ? 'Đã đăng ký' : 'Chưa đăng ký'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AuditLogs;
