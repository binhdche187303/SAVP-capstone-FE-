import { totalOf, useProbeCounts } from '../../hooks/useFilterCounts';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import ReportExportAction from '../../components/common/ReportExportAction';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import './AuditLogsFilters.css';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import { Activity, Filter, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { createPortal } from 'react-dom';
import UserAvatar from '../../components/common/UserAvatar';
import { expandAuditActionSelection, formatAuditAction, groupAuditActionOptions } from '../../constants/auditActionLabels';
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
    'zones': 'Khu vực giám sát',
    'visitor_visits': 'Quản lý lượt khách',
    'visitor_visit': 'Quản lý lượt khách',
    'visitors': 'Quản lý khách',
    'camera_groups': 'Nhóm camera',
    'person_control_list': 'Danh sách người giám sát',
    'anpr': 'Nhận diện biển số',
    'alert_rules': 'Quy tắc cảnh báo',
    'room_bookings': 'Đặt phòng',
    'meeting_requests': 'Yêu cầu họp',
    'roles': 'Vai trò',
    'permissions': 'Quyền hạn',
    'departments': 'Phòng ban',
    'equipments': 'Thiết bị',
    'reports': 'Báo cáo',
    'report_templates': 'Mẫu báo cáo',
    'report_schedules': 'Lịch báo cáo',
    'class_attendance': 'Điểm danh lớp học',
    'uel_sync': 'Đồng bộ UEL',
    'hgvision': 'HGVision',
    'face_access': 'Ra vào bằng khuôn mặt',
    'system_configurations': 'Cấu hình hệ thống',
    'live_meetings': 'Phiên họp trực tiếp',
    'admin': 'Quản trị',
    'me': 'Hồ sơ cá nhân'
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
    const fetchVersion = useRef(0);
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

    // Gom mã trùng nhãn, sắp A→Z theo nhãn tiếng Việt
    const actionOptions = useMemo(() => groupAuditActionOptions(actionTypes), [actionTypes]);

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
        const version = ++fetchVersion.current;
        setLoading(true);
        setError(null);

        const params = {
            page: pageNumber,
            limit: pageLimit,
            ...searchParams,
            action: expandAuditActionSelection(selectedAction),
            entity: selectedEntity || undefined,
            severity: selectedSeverity || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        };

        try {
            const res = await getAuditLogs(params);
            if (version !== fetchVersion.current) return;
            if (res?.success) {
                setLogsList(res.data || []);
                const serverMeta = res.meta || {};
                setMeta({
                    ...serverMeta,
                    page: Number(serverMeta.page) || pageNumber,
                    limit: Number(serverMeta.limit) || pageLimit,
                    total: Number(serverMeta.total) || res.data?.length || 0,
                    totalPages: Number(serverMeta.totalPages) || 1
                });
            } else {
                throw new Error('Fallback to mock data');
            }
        } catch {
            if (version !== fetchVersion.current) return;
            setLogsList([]);
            setMeta({ page: pageNumber, limit: pageLimit, total: 0, totalPages: 1 });
        } finally {
            if (version === fetchVersion.current) setLoading(false);
        }
    }, [selectedAction, selectedEntity, selectedSeverity, startDate, endDate, searchParams]);

    // Số đếm cạnh lựa chọn ô "Mức độ" (đếm theo các bộ lọc khác). Ô "Loại hành động" đã có số từ API riêng.
    const severityBaseKey = JSON.stringify({ searchParams, selectedAction, selectedEntity, startDate, endDate });
    const severityCounts = useProbeCounts(
        ['info', 'warning', 'error', 'critical'],
        (value) => getAuditLogs({
            ...searchParams,
            action: expandAuditActionSelection(selectedAction),
            entity: selectedEntity || undefined,
            severity: value || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            page: 1,
            limit: 1,
        }).then(totalOf),
        severityBaseKey,
    );

    useEffect(() => {
        fetchLogs(1, meta.limit);
        return () => { fetchVersion.current += 1; };
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

    const handleClearFilters = () => {
        if (!debouncedSearch && !selectedAction && !selectedEntity && !selectedSeverity && !startDate && !endDate) fetchLogs(1, meta.limit);
        setSearch('');
        setDebouncedSearch('');
        setSelectedAction('');
        setSelectedEntity('');
        setSelectedSeverity('');
        setStartDate('');
        setEndDate('');
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
                action: expandAuditActionSelection(selectedAction),
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
            return { success: false, message: err?.error?.message || err?.message || 'Không xuất được nhật ký.' };
        } finally {
            setExporting(false);
        }
    };

    // Một số bản backend cũ có thể trả toàn bộ danh sách dù đã nhận limit.
    // Cắt thêm ở FE để bảng luôn hiển thị đúng số dòng mỗi trang.
    const pageLimit = meta.limit || 10;
    const currentPage = Number(meta.page) || 1;
    const effectiveTotal = Math.max(Number(meta.total) || 0, logsList.length);
    const effectiveTotalPages = Math.max(
        Number(meta.totalPages) || 1,
        Math.ceil(effectiveTotal / pageLimit)
    );
    const visibleLogs = logsList.length > pageLimit
        ? logsList.slice((currentPage - 1) * pageLimit, currentPage * pageLimit)
        : logsList;

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
                    <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Activity className="w-3.5 h-3.5" />
                        Nhật ký
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Nhật ký hệ thống</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Theo dõi lịch sử vận hành, ghi nhận thao tác của quản trị viên và các cảnh báo khẩn cấp.
                    </p>
                </div>
                <ReportExportAction format="xlsx" label="Xuất nhật ký" busy={exporting}
                    onClick={handleExport}
                    disabled={exporting}
                    legacyClassName="inline-flex items-center justify-center px-4 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exporting ? 'Đang xuất...' : 'Xuất nhật ký'}
                </ReportExportAction>
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
            <FilterBar variant="card" className="audit-log-filters">
                <div className="audit-log-filter-main">
                    <FilterField label="Tìm kiếm từ khóa">
                        <input type="text" placeholder="Email, tên, hoặc mô tả..." value={search} maxLength={100}
                            onChange={event => setSearch(event.target.value)} />
                    </FilterField>
                    <FilterField label="Loại hành động">
                        <FilterMultiSelect value={selectedAction} onChange={event => setSelectedAction(event.target.value)}>
                            <option value="">Tất cả hành động</option>
                            {actionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>)}
                        </FilterMultiSelect>
                    </FilterField>
                    <FilterField label="Mức độ">
                        <FilterMultiSelect counts={severityCounts} value={selectedSeverity} onChange={event => setSelectedSeverity(event.target.value)}>
                            <option value="">Tất cả mức độ</option>
                            <option value="info">Thành công (Info)</option>
                            <option value="warning">Cảnh báo (Warning)</option>
                            <option value="error">Thất bại (Error)</option>
                            <option value="critical">Nghiêm trọng (Critical)</option>
                        </FilterMultiSelect>
                    </FilterField>
                </div>
                <div className="audit-log-filter-time">
                    <CalendarRangePresets from={startDate} to={endDate} onChange={range => { setStartDate(range.from); setEndDate(range.to); }} />
                    <div className="audit-log-filter-dates">
                        <FilterField label="Từ ngày">
                            <input type="date" value={startDate} max={endDate || today} onChange={event => {
                                const value = event.target.value; setStartDate(value);
                                if (endDate && value > endDate) setEndDate('');
                            }} />
                        </FilterField>
                        <FilterField label="Đến ngày">
                            <input type="date" value={endDate} min={startDate || undefined} max={today} onChange={event => {
                                const value = event.target.value; setEndDate(value);
                                if (startDate && value < startDate) setStartDate('');
                            }} />
                        </FilterField>
                    </div>
                    <button type="button" data-filter-action onClick={handleClearFilters}
                        className="audit-log-filter-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors">
                        <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                    </button>
                </div>
                <p data-ui-text="secondary" className="audit-log-filter-count text-slate-blue">
                    Tìm thấy <span className="font-semibold text-midnight-indigo">{meta.total}</span> bản ghi nhật ký.
                </p>
            </FilterBar>

            {/* Logs Data Table */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                {loading && logsList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 text-action-blue animate-spin" />
                        <p className="text-slate-blue text-sm mt-4">Đang tải lịch sử nhật ký hệ thống...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <ResponsiveTable className="w-full min-w-[1200px] text-left border-collapse">
<colgroup>
<col style={{ width: '12%' }} />
<col style={{ width: '18%' }} />
<col style={{ width: '25%' }} />
<col style={{ width: '18%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '7%' }} />
</colgroup>
                            <thead className="whitespace-nowrap">
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
                                    visibleLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-cloud-mist/30 transition-colors">
                                            {/* Thời gian — gộp ngày + giờ */}
                                            <td className="py-4 px-6 whitespace-nowrap">
                                                <div data-ui-text="primary" className="text-sm font-semibold tabular-nums text-midnight-indigo">
                                                    {formatTimestamp(log.createdAt || log.timestamp).split(' ')[0]}
                                                </div>
                                                <div data-ui-text="secondary" className="text-xs tabular-nums text-slate-blue">
                                                    {formatTimestamp(log.createdAt || log.timestamp).split(' ')[1]}
                                                </div>
                                            </td>

                                            {/* Tài khoản — avatar + tên có thể click */}
                                            <td className="py-4 px-6 min-w-[240px]">
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
                                                    <div className="min-w-0">
                                                        <button data-ui-text="primary"
                                                            onClick={() => handleOpenActorDetail(log)}
                                                            disabled={!(log.actorUserId || log.actorId)}
                                                            className="font-semibold text-midnight-indigo hover:text-action-blue hover:underline text-left text-sm leading-tight disabled:cursor-default disabled:no-underline disabled:hover:text-midnight-indigo"
                                                        >
                                                            {log.actorName || 'Hệ thống'}
                                                        </button>
                                                        {log.actorEmail && (
                                                            <div data-ui-text="secondary" className="text-xs text-slate-blue break-all mt-0.5">
                                                                {log.actorEmail}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-4 px-6 min-w-[280px]">
                                                <span data-ui-text="primary" className={`inline-flex px-2 py-0.5 rounded-full text-sm font-medium border ${getActionBadge(log.actionType || log.action)}`}>
                                                    {formatActionName(log.actionType || log.action)}
                                                </span>
                                            </td>
                                            <td data-ui-text="primary" className="py-4 px-6 min-w-[210px] text-sm font-medium text-slate-blue">
                                                {ENTITY_TRANSLATIONS[log.entityType || log.entity] || (log.entityType || log.entity)}
                                            </td>
                                            <td data-ui-text="primary" className="py-4 px-6 whitespace-nowrap text-slate-blue text-sm">
                                                {log.ipAddress || 'Chưa cung cấp'}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span data-ui-text="badge" className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(log.severity || log.status)}`}>
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
                        </ResponsiveTable>
                    </div>
                )}

                {/* Pagination footer */}
                {<PaginationRegion legacyVisible={!loading && logsList.length > 0}><PaginationFooter
                        currentPage={currentPage}
                        totalPages={effectiveTotalPages}
                        totalItems={effectiveTotal}
                        pageSize={pageLimit}
                        onPageChange={(p) => fetchLogs(p, pageLimit)}
                        itemLabel={"dòng"}
                        loading={loading}
                        onPageSizeChange={size => { setMeta(previous => ({ ...previous, page: 1, limit: size })); fetchLogs(1, size); }}
                    /></PaginationRegion>}
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
                                        <span data-ui-text="badge" className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(selectedLog.actionType || selectedLog.action)}`}>
                                            {formatActionName(selectedLog.actionType || selectedLog.action)}
                                        </span>
                                        <span data-ui-text="badge" className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(selectedLog.severity || selectedLog.status)}`}>
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
                                    <span data-ui-text="label" className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Thời gian ghi nhận</span>
                                    <span data-ui-text="primary" className="text-sm font-semibold text-midnight-indigo">{formatTimestamp(selectedLog.createdAt || selectedLog.timestamp)}</span>
                                </div>
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span data-ui-text="label" className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Địa chỉ IP thao tác</span>
                                    <span data-ui-text="primary" className="text-sm font-semibold text-midnight-indigo">{selectedLog.ipAddress || 'Chưa cung cấp'}</span>
                                </div>
                            </div>

                            {/* Row 2: Tài khoản + Phân hệ */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span data-ui-text="label" className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Tài khoản thực hiện</span>
                                    <span data-ui-text="primary" className="text-sm font-semibold text-midnight-indigo">{selectedLog.actorName || 'Hệ thống'}</span>
                                    {selectedLog.actorEmail && (
                                        <span data-ui-text="secondary" className="block text-xs text-slate-blue break-all mt-0.5">{selectedLog.actorEmail}</span>
                                    )}
                                </div>
                                <div className="bg-cloud-mist/40 rounded-xl p-3.5 border border-platinum-tint/60">
                                    <span data-ui-text="label" className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-1">Phân hệ</span>
                                    <span className="text-sm font-semibold text-midnight-indigo">
                                        {ENTITY_TRANSLATIONS[selectedLog.entityType || selectedLog.entity] || (selectedLog.entityType || selectedLog.entity) || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Description */}
                            {selectedLog.description && (
                                <div className="rounded-xl border border-outline-gray/50 p-4 bg-white">
                                    <span data-ui-text="label" className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider mb-2">Mô tả hành động</span>
                                    <p className="text-sm text-midnight-indigo leading-relaxed">{selectedLog.description}</p>
                                </div>
                            )}

                            {/* Payload */}
                            {selectedLog.payload && Object.keys(selectedLog.payload).length > 0 && (
                                <div className="border border-platinum-tint/70 rounded-2xl overflow-hidden">
                                    <div className="px-4 py-3 bg-cloud-mist/40 border-b border-platinum-tint/50">
                                        <span data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Chi tiết thay đổi thông tin hệ thống</span>
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
                                <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
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
                                                <span data-ui-text="badge" key={idx} className="text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">
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
                                                <span data-ui-text="badge" className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
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
                                                <span data-ui-text="badge" className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
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
