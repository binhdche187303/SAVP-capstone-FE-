import { AlertTriangle, CheckCircle, Key, Plus, RefreshCw, Save, Search, Shield, Trash2, UserCog } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';
import {
    getRoles, getPermissions, getRolePermissions,
    assignRolePermissions, revokeRolePermission, createRole, deleteRole
} from '../../service/permissionServices';
import { PERMISSION_MODULE_STATUS } from '../../config/permissionModuleStatus';
import { PERMISSION_DEPENDENCIES } from '../../config/permissionDependencies';


// [FIX] Bổ sung đầy đủ moduleCode thật — đọc trực tiếp từ dữ liệu seed thật
// (migrations/*.ts, cột module_code bảng permissions) + MODULE_CODE_ALLOWLIST
// (accounts/constants/permission-module-allowlist.constant.ts, danh sách validate khi tạo
// permission mới). Giữ nguyên 20 key cũ (không xóa — 1 số như 'zone_management' có thể vẫn
// khớp permission cũ chưa kiểm hết), chỉ THÊM các moduleCode thật còn thiếu.
const MODULE_TRANSLATIONS = {
    'system_management': 'Quản trị hệ thống',
    'gate_access': 'Kiểm soát ra vào',
    'GATE_ACCESS': 'Kiểm soát ra vào',
    'user_management': 'Quản lý người dùng',
    'device_management': 'Quản lý thiết bị',
    'role_management': 'Quản lý phân quyền',
    'attendance_management': 'Quản lý điểm danh',
    'meeting_management': 'Quản lý phòng họp',
    'CLASSROOM': 'Lớp học',
    'zone_management': 'Quản lý khu vực',
    'iot': 'Thiết bị IoT / Camera',
    'ivss': 'Hệ thống Camera (IVSS)',
    'anpr': 'Nhận diện biển số (ANPR)',
    'alerts': 'Cảnh báo an ninh',
    'meetings': 'Phòng họp & Đặt lịch',
    'reports': 'Báo cáo thống kê',
    'accounts': 'Quản lý tài khoản',
    'recording': 'Ghi âm / Ghi hình',
    'face': 'Nhận diện khuôn mặt',
    'departments': 'Quản lý phòng ban',
    'media': 'Quản lý phương tiện',
    'other': 'Các quyền khác',
    // Xác nhận thật qua seed migrations (module_code cột permissions):
    'audit': 'Nhật ký hệ thống',
    'face_access': 'Nhận diện khuôn mặt (kiểm soát ra vào)',
    'rooms': 'Quản lý phòng họp',
    'campus_dashboard': 'Bảng điều khiển tổng quan',
    'equipment': 'Quản lý thiết bị phòng họp',
    'attendance': 'Điểm danh',
    'scheduling': 'Lịch đặt phòng',
    'minutes': 'Biên bản họp',
    'notifications': 'Thông báo',
    'analytics': 'Thống kê phân tích',
    'transcription': 'Ghi chép tự động (Transcription)',
    'zones': 'Quản lý khu vực',
    // Xác nhận thật qua MODULE_CODE_ALLOWLIST (validator tạo permission mới):
    'auth': 'Hệ thống xác thực',
    'meeting_requests': 'Yêu cầu đặt phòng họp',
    'approvals': 'Phê duyệt',
    'presence': 'Hiện diện (Presence)',
    'utilization': 'Tỷ lệ sử dụng phòng',
    'live_meeting': 'Cuộc họp trực tiếp',
    'administration': 'Quản trị hệ thống',
    'admin': 'Quản trị',
    'internal': 'Nội bộ hệ thống',
    'system': 'Hệ thống'
};

const PERMISSION_NAME_TRANSLATIONS = {
    'gate.access.alert.handle': 'Xử lý cảnh báo ra vào cổng',
    'gate.access.monitor': 'Trực giám sát cổng ra vào',
    'gate.access.read': 'Xem nhật ký ra vào cổng',
    'gate_access.stats.read': 'Xem thống kê lưu lượng phương tiện',
    'gate_access.history.read_all': 'Xem lịch sử ra vào cổng của nhân sự khác',
    'class.attendance.stats.read': 'Xem thống kê chuyên cần lớp học',
    'class.attendance.manage': 'Quản lý điểm danh lớp học',
    'class.attendance.export': 'Xuất bảng chuyên cần lớp học',
    'class.attendance.read.self': 'Xem chuyên cần cá nhân'
};

const ROLE_TRANSLATIONS = {
    'SYSTEM_ADMIN': 'Quản trị hệ thống',
    'BUSINESS_ADMIN': 'Quản trị doanh nghiệp',
    'MANAGER': 'Quản lý',
    'EMPLOYEE': 'Nhân viên',
    'TEACHER': 'Giảng viên',
    'STUDENT': 'Sinh viên',
    'GUARD': 'Bảo vệ'
};

const getDisplayRoleName = (role) => {
    const roleCode = (role?.roleCode || role?.role_code || '').toUpperCase();
    return ROLE_TRANSLATIONS[roleCode] || role?.roleName || role?.role_name || role?.name || roleCode || 'Vai trò';
};

const getDisplayPermissionName = (permission) => {
    return PERMISSION_NAME_TRANSLATIONS[permission?.permissionCode] || permission?.permissionName || permission?.permissionCode || 'Quyền';
};

const RolePermissionManagement = () => {
    // Data states
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [rolePermissions, setRolePermissions] = useState([]); // IDs of permissions for the selected role
    const [originalRolePermissions, setOriginalRolePermissions] = useState([]); // IDs as loaded from server, used to diff on save
    
    // UI states
    const [loading, setLoading] = useState(true);
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const modulesPerPage = 3;

    // Modal states
    const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        roleCode: '',
        roleName: '',
        description: ''
    });
    
    // Delete states
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState(null);
    const [isDeletingRole, setIsDeletingRole] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rolesRes, permsRes] = await Promise.all([
                getRoles({ limit: 100 }),
                getPermissions({ limit: 500 })
            ]);
            
            if (rolesRes?.success && permsRes?.success) {
                setRoles(rolesRes.data || []);
                setPermissions(permsRes.data || []);
            } else {
                setError('Không thể tải dữ liệu vai trò hoặc quyền hệ thống.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi tải dữ liệu hệ thống.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset pagination when searching or changing role
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedRole]);

    // Handle selecting a role
    const handleSelectRole = async (role) => {
        setSelectedRole(role);
        setPermissionsLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await getRolePermissions(role.id);
            if (res?.success) {
                // BE might return full permission objects or just IDs. Assuming full objects.
                const assignedIds = (res.data || []).map(p => p.permissionId || p.id);
                setRolePermissions(assignedIds);
                setOriginalRolePermissions(assignedIds);
            }
        } catch (err) {
            setError('Không thể tải danh sách quyền của vai trò này.');
        } finally {
            setPermissionsLoading(false);
        }
    };

    // Handle toggling a permission checkbox.
    // Enforces a one-way dependency: ticking a "write" permission auto-ticks its required "read"
    // permission (if declared in PERMISSION_DEPENDENCIES); unticking a "read" permission is blocked
    // while a still-ticked "write" permission depends on it. Read-only grants remain unaffected.
    const handleTogglePermission = (permissionId) => {
        const target = permissions.find(p => p.id === permissionId);
        const isCurrentlyChecked = rolePermissions.includes(permissionId);

        if (!isCurrentlyChecked) {
            const deps = (target && PERMISSION_DEPENDENCIES[target.permissionCode]) || [];
            const depIds = deps
                .map(code => permissions.find(p => p.permissionCode === code)?.id)
                .filter(id => id && !rolePermissions.includes(id));
            if (depIds.length > 0) {
                setError(null);
                setSuccessMessage(`Đã tự động thêm ${depIds.length} quyền xem cần thiết cho "${getDisplayPermissionName(target)}".`);
            }
            setRolePermissions(prev => [...prev, permissionId, ...depIds]);
            return;
        }

        const blockedBy = target && rolePermissions
            .filter(id => id !== permissionId)
            .map(id => permissions.find(p => p.id === id))
            .find(p => p && PERMISSION_DEPENDENCIES[p.permissionCode]?.includes(target.permissionCode));
        if (blockedBy) {
            setSuccessMessage(null);
            setError(`Không thể gỡ "${getDisplayPermissionName(target)}" vì "${getDisplayPermissionName(blockedBy)}" đang được chọn và cần quyền này. Hãy gỡ "${getDisplayPermissionName(blockedBy)}" trước.`);
            return;
        }

        setRolePermissions(prev => prev.filter(id => id !== permissionId));
    };

    // Save assigned permissions: diff against the originally loaded set so
    // unchecked permissions are actually revoked (POST only ever adds, never removes).
    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const toAdd = rolePermissions.filter(id => !originalRolePermissions.includes(id));
            const toRemove = originalRolePermissions.filter(id => !rolePermissions.includes(id));

            if (toAdd.length === 0 && toRemove.length === 0) {
                setSuccessMessage('Không có thay đổi nào để lưu.');
                return;
            }

            if (toAdd.length > 0) {
                await assignRolePermissions(selectedRole.id, rolePermissions);
            }

            // BE only supports revoking one permission per request.
            // allSettled so one blocked revoke (e.g. CANNOT_REVOKE_SYSTEM_PERMISSION)
            // doesn't hide the outcome of the others.
            const revokeResults = await Promise.allSettled(
                toRemove.map(id => revokeRolePermission(selectedRole.id, id))
            );
            const failedRevokes = revokeResults
                .map((r, i) => ({ r, id: toRemove[i] }))
                .filter(({ r }) => r.status === 'rejected');

            // Re-sync from server so the UI always reflects real DB state,
            // especially permissions whose revoke was blocked and must show checked again.
            const refreshed = await getRolePermissions(selectedRole.id);
            if (refreshed?.success) {
                const assignedIds = (refreshed.data || []).map(p => p.permissionId || p.id);
                setRolePermissions(assignedIds);
                setOriginalRolePermissions(assignedIds);
            }

            if (failedRevokes.length > 0) {
                const messages = failedRevokes
                    .map(({ r }) => r.reason?.error?.message || r.reason?.message || 'Lỗi không xác định')
                    .join('; ');
                setError(`Đã lưu một phần. Không thể gỡ ${failedRevokes.length} quyền: ${messages}`);
            } else {
                setSuccessMessage(`Đã cập nhật quyền cho vai trò ${getDisplayRoleName(selectedRole)}.`);
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi lưu phân quyền.');
        } finally {
            setSaving(false);
        }
    };

    // Create Role
    const handleCreateRoleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await createRole(createForm);
            if (res?.success) {
                setSuccessMessage('Tạo vai trò mới thành công!');
                setIsCreateRoleOpen(false);
                setCreateForm({ roleCode: '', roleName: '', description: '' });
                fetchData();
            } else {
                setError(res?.message || 'Tạo vai trò thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi tạo vai trò.');
        }
    };

    // Delete Role
    const handleDeleteClick = (role, e) => {
        e.stopPropagation(); // Prevent selecting the role
        setRoleToDelete(role);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!roleToDelete) return;
        setIsDeletingRole(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await deleteRole(roleToDelete.id);
            if (res?.success) {
                setSuccessMessage(`Đã xoá vai trò ${getDisplayRoleName(roleToDelete)} thành công.`);
                setIsDeleteModalOpen(false);
                if (selectedRole?.id === roleToDelete.id) {
                    setSelectedRole(null);
                    setRolePermissions([]);
                    setOriginalRolePermissions([]);
                }
                fetchData();
            } else {
                setError(res?.message || 'Không thể xoá vai trò.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi xoá vai trò.');
        } finally {
            setIsDeletingRole(false);
            setRoleToDelete(null);
        }
    };

    // Filter permissions by module
    const groupedPermissions = permissions.reduce((acc, curr) => {
        const module = curr.moduleCode || 'other';
        if (!acc[module]) acc[module] = [];
        acc[module].push(curr);
        return acc;
    }, {});

    const filteredModules = Object.keys(groupedPermissions).filter(module => {
        if (!searchTerm) return true;
        return groupedPermissions[module].some(p => 
            getDisplayPermissionName(p).toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.permissionCode.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    return (
        <div className="p-6 h-full flex flex-col bg-snow-white">
            <div className="flex justify-between items-center mb-6 animate-fade-in-up">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <UserCog className="w-3.5 h-3.5" />
                        Phân quyền
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý Phân quyền</h1>
                    <p className="text-sm text-slate-blue mt-1">Cấu hình các vai trò và gán quyền chi tiết cho từng vai trò trong hệ thống.</p>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start animate-fade-in-up">
                    <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}
            
            {successMessage && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-start animate-fade-in-up">
                    <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium">{successMessage}</p>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 animate-fade-in-up delay-100">
                {/* ROLES LIST PANE */}
                <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-2xl shadow-sm-1 border border-platinum-tint overflow-hidden">
                    <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                        <h2 className="font-bold text-midnight-indigo flex items-center">
                            <Shield className="w-5 h-5 mr-2 text-action-blue" />
                            Vai trò hệ thống
                        </h2>
                        <button
                            onClick={() => setIsCreateRoleOpen(true)}
                            className="p-1.5 bg-action-blue text-white rounded-lg hover:bg-glacier-blue transition-colors"
                            title="Tạo vai trò mới"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            Array(4).fill(0).map((_, idx) => (
                                <div key={idx} className="h-16 bg-cloud-mist rounded-xl animate-pulse"></div>
                            ))
                        ) : roles.length === 0 ? (
                            <div className="text-center py-8 text-slate-blue text-sm">Chưa có vai trò nào.</div>
                        ) : (
                            roles.map(role => {
                                const displayRoleName = getDisplayRoleName(role);
                                return (
                                <div 
                                    key={role.id}
                                    onClick={() => handleSelectRole(role)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 ${
                                        selectedRole?.id === role.id 
                                        ? 'border-action-blue bg-blue-50/50 shadow-sm' 
                                        : 'border-platinum-tint bg-white hover:border-action-blue/50 hover:bg-cloud-mist/20'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="font-bold text-sm text-midnight-indigo">{displayRoleName}</h3>
                                        <div className="flex items-center gap-1">
                                            {role.isSystemRole && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md">HỆ THỐNG</span>
                                            )}
                                            {!role.isSystemRole && (
                                                <button
                                                    onClick={(e) => handleDeleteClick(role, e)}
                                                    className="p-1 text-slate-blue hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Xoá vai trò"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-blue font-mono mb-2">{role.roleCode}</p>
                                    <p className="text-xs text-slate-blue line-clamp-2">{role.description || 'Không có mô tả'}</p>
                                </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* PERMISSIONS MATRIX PANE */}
                <div className="w-full lg:w-2/3 flex flex-col bg-white rounded-2xl shadow-sm-1 border border-platinum-tint overflow-hidden">
                    {selectedRole ? (
                        <>
                            <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                                <div>
                                    <h2 className="font-bold text-midnight-indigo flex items-center">
                                        <Key className="w-5 h-5 mr-2 text-action-blue" />
                                        Phân quyền: {getDisplayRoleName(selectedRole)}
                                    </h2>
                                    <p className="text-xs text-slate-blue mt-1">Cấu hình các quyền thao tác cho vai trò này</p>
                                </div>
                                <div className="flex gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue" />
                                        <input 
                                            type="text" 
                                            placeholder="Tìm quyền..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-48 pl-9 pr-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSavePermissions}
                                        disabled={saving || permissionsLoading}
                                        className="inline-flex items-center px-4 py-2 bg-action-blue text-white rounded-xl text-sm font-semibold hover:bg-glacier-blue transition-all shadow-sm disabled:opacity-50"
                                    >
                                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                        Lưu cấu hình
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-6">
                                {permissionsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-40">
                                        <RefreshCw className="w-6 h-6 text-action-blue animate-spin mb-3" />
                                        <span className="text-sm text-slate-blue">Đang tải cấu hình quyền...</span>
                                    </div>
                                ) : filteredModules.length === 0 ? (
                                    <div className="text-center py-12 text-slate-blue text-sm">Không tìm thấy quyền nào.</div>
                                ) : (
                                    <div className="flex flex-col h-full">
                                        <div className="space-y-6 flex-1">
                                            {filteredModules.slice((currentPage - 1) * modulesPerPage, currentPage * modulesPerPage).map(module => (
                                                <div key={module} className="bg-cloud-mist/20 border border-platinum-tint rounded-xl overflow-hidden">
                                                <div className="bg-cloud-mist/40 px-4 py-2 border-b border-platinum-tint">
                                                    <h3 className="font-bold text-midnight-indigo text-sm uppercase">{MODULE_TRANSLATIONS[module] || module}</h3>
                                                </div>
                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {groupedPermissions[module]
                                                        .filter(p => !searchTerm || getDisplayPermissionName(p).toLowerCase().includes(searchTerm.toLowerCase()) || p.permissionCode.toLowerCase().includes(searchTerm.toLowerCase()))
                                                        .map(p => {
                                                        const moduleStatus = PERMISSION_MODULE_STATUS[p.moduleCode];
                                                        return (
                                                        <label key={p.id} className="flex items-start space-x-3 cursor-pointer group">
                                                            <div className="flex-shrink-0 pt-0.5">
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 text-action-blue border-platinum-tint rounded rounded focus:ring-action-blue"
                                                                    checked={rolePermissions.includes(p.id)}
                                                                    onChange={() => handleTogglePermission(p.id)}
                                                                />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-semibold text-midnight-indigo group-hover:text-action-blue transition-colors flex items-center gap-1.5">
                                                                    {getDisplayPermissionName(p)}
                                                                    {moduleStatus && (
                                                                        <AlertTriangle
                                                                            className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
                                                                            title={moduleStatus.note}
                                                                        />
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-slate-blue font-mono mt-0.5">{p.permissionCode}</p>
                                                            </div>
                                                        </label>
                                                        );
                                                        })}
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                        
                                        {/* Pagination Controls */}
                                        {Math.ceil(filteredModules.length / modulesPerPage) > 1 && (
                                            <div className="flex justify-center items-center mt-6 pt-4 border-t border-platinum-tint gap-2">
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="px-3 py-1 text-sm bg-white border border-platinum-tint rounded-lg disabled:opacity-50 hover:bg-cloud-mist transition-colors"
                                                >
                                                    Trước
                                                </button>
                                                <span className="text-sm font-medium text-slate-blue px-2">
                                                    Trang {currentPage} / {Math.ceil(filteredModules.length / modulesPerPage)}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredModules.length / modulesPerPage), p + 1))}
                                                    disabled={currentPage === Math.ceil(filteredModules.length / modulesPerPage)}
                                                    className="px-3 py-1 text-sm bg-white border border-platinum-tint rounded-lg disabled:opacity-50 hover:bg-cloud-mist transition-colors"
                                                >
                                                    Sau
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-blue">
                            <Shield className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-medium text-midnight-indigo mb-1">Chưa chọn vai trò</p>
                            <p className="text-sm">Vui lòng chọn một vai trò bên danh sách để cấu hình phân quyền.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* CREATE ROLE MODAL */}
            {isCreateRoleOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Tạo vai trò mới</h3>
                            <button onClick={() => setIsCreateRoleOpen(false)} className="text-slate-blue hover:text-midnight-indigo">✕</button>
                        </div>
                        <form onSubmit={handleCreateRoleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã vai trò <span className="text-red-500">*</span></label>
                                <input required type="text" value={createForm.roleCode} onChange={e => setCreateForm({...createForm, roleCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono" placeholder="VD: GUEST_USER" />
                                <p className="text-[10px] text-slate-blue mt-1">Chỉ chứa chữ hoa A-Z, số 0-9 và dấu gạch dưới.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên hiển thị <span className="text-red-500">*</span></label>
                                <input required type="text" value={createForm.roleName} onChange={e => setCreateForm({...createForm, roleName: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm" placeholder="VD: Người dùng khách" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả</label>
                                <textarea rows="3" value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none" placeholder="Mô tả quyền hạn của vai trò này..." />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsCreateRoleOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist">Hủy</button>
                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue">Tạo mới</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* DELETE ROLE MODAL */}
            {isDeleteModalOpen && roleToDelete && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-sm w-full flex flex-col overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-midnight-indigo mb-2">Xác nhận xoá vai trò</h3>
                            <p className="text-sm text-slate-blue mb-1">
                                Bạn có chắc chắn muốn xoá vai trò <span className="font-bold text-midnight-indigo">{getDisplayRoleName(roleToDelete)}</span>?
                            </p>
                            <p className="text-[11px] text-red-500 bg-red-50 p-2 rounded-lg mt-3 text-left">
                                Lưu ý: Thao tác này không thể hoàn tác. Người dùng đang có vai trò này có thể sẽ bị mất quyền truy cập.
                            </p>
                        </div>
                        <div className="p-4 bg-cloud-mist/30 border-t border-platinum-tint flex justify-end gap-3">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                disabled={isDeletingRole}
                                className="px-4 py-2 bg-white border border-platinum-tint text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeletingRole}
                                className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white font-semibold rounded-xl text-sm shadow-sm hover:bg-red-700 disabled:opacity-50 min-w-[100px]"
                            >
                                {isDeletingRole ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Xoá vĩnh viễn'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default RolePermissionManagement;
