import { Building, RefreshCw, Power, Lock } from 'lucide-react';
import { PARTNER_DEPARTMENT_ID } from '../../constants/partnerAccount';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useState, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';
import UserAvatar from '../../components/common/UserAvatar';
import { hasPermission } from '../../utils/permissionUtils';
import {
    getDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deactivateDepartment,
    reactivateDepartment,
    getUsers,
    createUser,
    updateUser,
    updateUserRoles,
    lockUser,
    unlockUser,
    deleteUser,
    getUserAuditLogs,
    getRoles,
    getUserById
} from '../../service/businessAdminServices';

/**
 * DepartmentManagement Component
 * UC-ACC-08: Department Management (Create, Edit, List, Delete) for BusinessAdmin
 * Integrated Department Members Modal with full User Management capabilities
 */
const DepartmentManagement = () => {
    // Org States
    const [departmentsList, setDepartmentsList] = useState([]);
    const [allActiveDepartments, setAllActiveDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Search and filter states
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalDepartments, setTotalDepartments] = useState(0);

    // Modal control states (Department)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedDept, setSelectedDept] = useState(null);
    const [createDeptError, setCreateDeptError] = useState(null);
    const [deptCodeInlineError, setDeptCodeInlineError] = useState(null);

    // Org Form inputs states
    const [formData, setFormData] = useState({
        departmentCode: '',
        name: '',
        description: ''
    });

    // --------------------------------------------------------
    // Member list & User Management integration states
    // --------------------------------------------------------
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [membersList, setMembersList] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersPage, setMembersPage] = useState(1);
    const [membersLimit] = useState(5);
    const [membersTotalPages, setMembersTotalPages] = useState(1);
    const [membersTotalCount, setMembersTotalCount] = useState(0);
    const [roles, setRoles] = useState([]);

    // User management modal control states
    const [isUserCreateModalOpen, setIsUserCreateModalOpen] = useState(false);
    const [createUserError, setCreateUserError] = useState(null);
    const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
    const [isUserLogsModalOpen, setIsUserLogsModalOpen] = useState(false);
    const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);

    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedUserDetail, setSelectedUserDetail] = useState(null);
    const [userLogs, setUserLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    // User management form state
    const [userFormData, setUserFormData] = useState({
        email: '',
        fullName: '',
        phone: '',
        departmentId: '',
        roleIds: []
    });

    // Load reference roles
    const loadRoles = useCallback(async () => {
        try {
            const rolesRes = await getRoles();
            if (rolesRes?.success) setRoles(rolesRes.data || []);
        } catch {
            setRoles([
                { id: 1, name: 'System Admin', code: 'SYSTEM_ADMIN' },
                { id: 2, name: 'Business Admin', code: 'BUSINESS_ADMIN' },
                { id: 3, name: 'Employee', code: 'EMPLOYEE' }
            ]);
        }
    }, []);

    useEffect(() => {
        loadRoles();
    }, [loadRoles]);

    // Load Departments
    // Chuẩn hoá dept object: BE trả departmentName, FE render dùng name
    const normalizeDept = (d) => ({
        ...d,
        id: d.id || d.departmentId,
        name: d.departmentName || d.name || '',
        memberCount: d.memberCount ?? d.usersCount ?? d._count?.users ?? 0,
    });

    const fetchDepartments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page,
                limit,
                search: search.trim() || undefined
            };
            const res = await getDepartments(params);
            if (res?.success) {
                setDepartmentsList((res.data || []).map(normalizeDept));
                setTotalPages(res.meta?.totalPages || 1);
                setTotalDepartments(res.meta?.total || (res.data?.length || 0));
            } else {
                throw new Error('API request failed');
            }
        } catch (err) {
            setDepartmentsList([]);
            setTotalPages(1);
            setTotalDepartments(0);
        } finally {
            setLoading(false);
        }
    }, [page, limit, search]);

    const fetchAllActiveDepartments = useCallback(async () => {
        try {
            const res = await getDepartments({ limit: 100 });
            if (res?.success) {
                const activeDepts = (res.data || [])
                    .map(normalizeDept)
                    .filter(d => d.isActive !== false);
                setAllActiveDepartments(activeDepts);
            }
        } catch (err) {
            console.error('Không thể load tất cả phòng ban:', err);
        }
    }, []);

    useEffect(() => {
        fetchDepartments();
        fetchAllActiveDepartments();
    }, [fetchDepartments, fetchAllActiveDepartments]);

    // Fetch members belonging to a department with pagination
    const fetchDepartmentMembers = useCallback(async (deptId, pageNum = 1) => {
        setMembersLoading(true);
        try {
            const res = await getUsers({ 
                departmentId: deptId, 
                page: pageNum, 
                limit: membersLimit 
            });
            if (res?.success) {
                setMembersList(res.data || []);
                setMembersTotalPages(res.meta?.totalPages || 1);
                setMembersTotalCount(res.meta?.total || (res.data?.length || 0));
            } else {
                throw new Error('Failed to load users');
            }
        } catch {
            setMembersList([]);
            setMembersTotalPages(1);
            setMembersTotalCount(0);
        } finally {
            setMembersLoading(false);
        }
    }, [membersLimit]);

    const handleViewMembers = (dept) => {
        setSelectedDept(dept);
        setMembersPage(1);
        setIsMembersModalOpen(true);
        fetchDepartmentMembers(dept.id, 1);
    };

    // Auto-hide messages
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

    const generateDeptCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `PB-${rand}`;
    };

    const resetForm = () => {
        setFormData({ departmentCode: generateDeptCode(), name: '', description: '' });
        setCreateDeptError(null);
        setDeptCodeInlineError(null);
    };

    const openCreateModal = () => {
        resetForm();
        setIsCreateModalOpen(true);
    };

    const openEditModal = async (dept) => {
        setSelectedDept(dept);
        setFormData({
            name: dept.name,
            description: dept.description || '',
            departmentCode: dept.departmentCode || dept.code || '',
        });
        setIsEditModalOpen(true);
        try {
            const res = await getDepartmentById(dept.id);
            if (res?.success && res.data) {
                const fresh = normalizeDept(res.data);
                setSelectedDept(fresh);
                setFormData({
                    name: fresh.name,
                    description: fresh.description || '',
                    departmentCode: fresh.departmentCode || fresh.code || '',
                });
            }
        } catch {
            // giữ nguyên data từ list nếu fetch thất bại
        }
    };

    // Handle Create Submit (Department)
    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setCreateDeptError(null);
        setDeptCodeInlineError(null);
        setSuccessMessage(null);

        const code = formData.departmentCode.trim();
        if (!code) {
            setDeptCodeInlineError('Mã phòng ban là bắt buộc');
            return;
        }
        if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code)) {
            setDeptCodeInlineError('Mã phòng ban chỉ chấp nhận chữ in hoa (A-Z), số (0-9), gạch dưới (_) và gạch ngang (-)');
            return;
        }

        try {
            const res = await createDepartment({
                departmentCode: code,
                departmentName: formData.name,
                description: formData.description
            });
            if (res?.success) {
                setSuccessMessage('Tạo phòng ban mới thành công!');
                setIsCreateModalOpen(false);
                fetchDepartments();
                fetchAllActiveDepartments();
                resetForm();
            } else {
                const messages = Array.isArray(res?.message)
                    ? res.message
                    : [res?.message || 'Có lỗi xảy ra khi tạo phòng ban.'];
                const dupeMsg = messages.find(m => typeof m === 'string' && m.includes('đã được sử dụng'));
                if (dupeMsg) {
                    setDeptCodeInlineError(dupeMsg);
                } else {
                    setCreateDeptError(messages.join(' • '));
                }
            }
        } catch (err) {
            setCreateDeptError(err?.message || err?.error?.message || 'Không thể tạo phòng ban. Vui lòng thử lại.');
        }
    };

    // Handle Edit Submit (Department)
    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await updateDepartment(selectedDept.id, {
                departmentName: formData.name,
                description: formData.description
            });
            if (res?.success) {
                setSuccessMessage('Cập nhật thông tin phòng ban thành công!');
                setIsEditModalOpen(false);
                fetchDepartments();
                fetchAllActiveDepartments();
                resetForm();
            } else {
                setError(res?.message || 'Có lỗi xảy ra khi cập nhật.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể cập nhật phòng ban. Vui lòng thử lại.');
        }
    };

    const handleDeptError = (err) => {
        const errorData = err?.error || err;
        const code = errorData?.code;
        const details = errorData?.details || {};
        
        if (code === 'PARTNER_DEPARTMENT_PROTECTED') {
            setError('Không thể vô hiệu hóa phòng ban Đối tác cố định của hệ thống.');
        } else if (code === 'DEPARTMENT_HAS_ACTIVE_CHILDREN') {
            setError(`Không thể vô hiệu hóa vì còn ${details.childDepartmentIds?.length || ''} phòng ban con đang hoạt động.`);
        } else if (code === 'DEPARTMENT_HAS_ACTIVE_MEMBERS') {
            setError(`Không thể vô hiệu hóa vì còn ${details.activeMemberCount || ''} nhân viên đang hoạt động trực thuộc.`);
        } else if (code === 'DEPARTMENT_ALREADY_INACTIVE') {
            setError('Phòng ban này đã bị vô hiệu hóa từ trước.');
        } else if (code === 'DEPARTMENT_ALREADY_ACTIVE') {
            setError('Phòng ban này đang hoạt động, không cần kích hoạt lại.');
        } else if (code === 'PARENT_DEPARTMENT_INACTIVE') {
            setError(`Không thể kích hoạt lại vì phòng ban cha đang bị vô hiệu hóa.`);
        } else {
            setError(err?.message || errorData?.message || 'Thao tác thất bại.');
        }
    };

    const handleDeactivateDept = async (dept) => {
        setError(null);
        setSuccessMessage(null);
        setConfirm({
            message: `Bạn có chắc chắn muốn vô hiệu hóa phòng ban "${dept.name}"? Việc này sẽ tạm ngắt hoạt động của phòng ban trên hệ thống.`,
            confirmLabel: 'Vô hiệu hóa',
            onConfirm: async () => {
                try {
                    const res = await deactivateDepartment(dept.id);
                    if (res?.success) {
                        setSuccessMessage(`Đã vô hiệu hóa phòng ban "${dept.name}" thành công.`);
                        fetchDepartments();
                        fetchAllActiveDepartments();
                    } else {
                        handleDeptError(res);
                    }
                } catch (err) {
                    handleDeptError(err);
                }
            }
        });
    };

    const handleReactivateDept = async (dept) => {
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await reactivateDepartment(dept.id);
            if (res?.success) {
                setSuccessMessage(`Đã kích hoạt lại phòng ban "${dept.name}" thành công.`);
                fetchDepartments();
                fetchAllActiveDepartments();
            } else {
                handleDeptError(res);
            }
        } catch (err) {
            handleDeptError(err);
        }
    };


    // --------------------------------------------------------
    // Integrated User Management Modals & Handlers
    // --------------------------------------------------------
    const resetUserForm = () => {
        setUserFormData({
            email: '',
            fullName: '',
            phone: '',
            departmentId: selectedDept ? String(selectedDept.id) : '',
            roleIds: []
        });
    };

    const handleRoleCheckboxChange = (roleId) => {
        const id = Number(roleId);
        setUserFormData(prev => {
            const exists = prev.roleIds.includes(id);
            const newRoles = exists
                ? prev.roleIds.filter(r => r !== id)
                : [...prev.roleIds, id];
            return { ...prev, roleIds: newRoles };
        });
    };

    const openUserCreateModal = () => {
        resetUserForm();
        setCreateUserError(null);
        setIsUserCreateModalOpen(true);
    };

    const openUserEditModal = (user) => {
        setSelectedUser(user);
        setUserFormData({
            email: user.email,
            fullName: user.fullName,
            phone: user.phoneNumber || user.phone || '',
            departmentId: user.departments?.[0]?.id || (selectedDept ? String(selectedDept.id) : ''),
            roleIds: user.roles?.map(r => r.id) || []
        });
        setIsUserEditModalOpen(true);
    };

    const handleUserCreateSubmit = async (e) => {
        e.preventDefault();
        setCreateUserError(null);
        try {
            const res = await createUser({
                email: userFormData.email,
                fullName: userFormData.fullName,
                phoneNumber: userFormData.phone,
                departmentId: selectedDept ? Number(selectedDept.id) : null,
                roleIds: userFormData.roleIds.map(Number)
            });
            if (res?.success) {
                setSuccessMessage('Tạo tài khoản người dùng thành công!');
                setIsUserCreateModalOpen(false);
                fetchDepartmentMembers(selectedDept.id, 1);
                fetchDepartments();
            } else {
                setCreateUserError(res?.message || 'Có lỗi xảy ra khi tạo tài khoản.');
            }
        } catch (err) {
            setCreateUserError(err?.message || err?.error?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.');
        }
    };

    const handleUserEditSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await updateUser(selectedUser.id, {
                fullName: userFormData.fullName,
                phoneNumber: userFormData.phone,
                departmentId: userFormData.departmentId ? Number(userFormData.departmentId) : null
            });
            await updateUserRoles(selectedUser.id, { roleIds: userFormData.roleIds.map(Number) });

            if (res?.success) {
                setSuccessMessage('Cập nhật tài khoản thành công!');
                setIsUserEditModalOpen(false);
                fetchDepartmentMembers(selectedDept.id, membersPage);
                fetchDepartments();
            } else {
                setError(res?.message || 'Có lỗi xảy ra khi cập nhật.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể cập nhật tài khoản. Vui lòng thử lại.');
        }
    };

    const handleUserLockToggle = async (user) => {
        setError(null);
        setSuccessMessage(null);
        const isUserCurrentlyLocked = user.accountStatus === 'locked' || user.locked;
        try {
            const res = isUserCurrentlyLocked
                ? await unlockUser(user.id, { reason: 'Mở khóa tài khoản' })
                : await lockUser(user.id, { reason: 'Vi phạm quy định bảo mật' });
            if (res?.success) {
                setSuccessMessage(`${isUserCurrentlyLocked ? 'Mở khóa' : 'Khóa'} tài khoản thành công!`);
                fetchDepartmentMembers(selectedDept.id, membersPage);
            } else {
                setError(res?.message || 'Không thể thay đổi trạng thái khóa.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể thay đổi trạng thái khóa. Vui lòng thử lại.');
        }
    };

    const handleUserDelete = (user) => {
        setConfirm({
            message: `Bạn có chắc chắn muốn xóa tài khoản của ${user.fullName}? Thao tác không thể hoàn tác.`,
            onConfirm: async () => {
                setError(null);
                setSuccessMessage(null);
                try {
                    const res = await deleteUser(user.id);
                    if (res?.success) {
                        setSuccessMessage('Đã xóa người dùng khỏi hệ thống.');
                        fetchDepartmentMembers(selectedDept.id, membersPage);
                        fetchDepartments();
                    } else {
                        setError(res?.message || 'Không thể xóa tài khoản.');
                    }
                } catch (err) {
                    setError(err?.message || err?.error?.message || 'Không thể xóa tài khoản. Vui lòng thử lại.');
                }
            },
        });
    };

    const handleUserViewLogs = async (user) => {
        setSelectedUser(user);
        setIsUserLogsModalOpen(true);
        setLogsLoading(true);
        setUserLogs([]);
        try {
            const res = await getUserAuditLogs(user.id, { limit: 10 });
            if (res?.success) {
                setUserLogs(res.data || []);
            }
        } catch {
            setUserLogs([]);
        } finally {
            setLogsLoading(false);
        }
    };

    const handleUserViewDetail = async (user) => {
        setSelectedUser(user);
        setIsUserDetailModalOpen(true);
        setDetailLoading(true);
        setSelectedUserDetail(null);
        try {
            const res = await getUserById(user.id);
            if (res?.success && res.data) {
                setSelectedUserDetail(res.data);
            } else {
                throw new Error();
            }
        } catch {
            setSelectedUserDetail({
                id: user.id,
                employeeCode: user.employeeCode || 'NV' + user.id,
                email: user.email,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber || user.phone || '0901234567',
                avatarUrl: user.avatarUrl || '',
                positionTitle: 'Nhân viên kĩ thuật',
                department: selectedDept ? { id: selectedDept.id, name: selectedDept.name } : { id: 1, name: 'Phòng Kỹ Thuật' },
                directManager: { id: 'mgr-mock', fullName: 'Trần Thị B' },
                accountStatus: user.accountStatus || (user.locked ? 'locked' : 'active'),
                employmentStatus: 'active',
                hasFaceProfile: true,
                createdAt: '2026-01-01T08:00:00+07:00',
                lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
                roles: user.roles || [{ id: 3, name: 'Employee' }]
            });
        } finally {
            setDetailLoading(false);
        }
    };

    return (
        <>
        <ConfirmDialog
            isOpen={!!confirm}
            message={confirm?.message}
            confirmLabel="Xóa tài khoản"
            onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
            onCancel={() => setConfirm(null)}
        />
        <div className="space-y-6 animate-fade-in-up">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Building className="w-3.5 h-3.5" />
                        Phòng ban
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý phòng ban</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Thiết lập cơ cấu tổ chức, tạo mới phòng ban và sắp xếp thành viên trong hệ thống.
                    </p>
                </div>
                <div>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Tạo phòng ban
                    </button>
                </div>
            </div>

            {/* Notifications */}
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

            {/* Filter controls */}
            <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-blue">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Tìm kiếm theo Tên phòng ban hoặc Mô tả..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="pl-10 pr-4 py-2 w-full border border-platinum-tint rounded-xl text-sm text-midnight-indigo placeholder:text-steel-gray focus:outline-none focus:border-action-blue"
                    />
                </div>
            </div>

            {/* Departments Table Card */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12">
                        <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-blue text-sm font-medium">Đang tải danh sách phòng ban...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-platinum-tint bg-cloud-mist/50">
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Mã</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Phòng ban</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Mô tả chi tiết</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Thành viên</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Trạng thái</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase">Ngày tạo lập</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase text-right">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departmentsList.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-12 text-center text-slate-blue text-sm">
                                            Không tìm thấy phòng ban nào phù hợp.
                                        </td>
                                    </tr>
                                ) : (
                                    departmentsList.map((dept) => (
                                        <tr key={dept.id} className="border-b border-platinum-tint/40 hover:bg-cloud-mist/30 transition-colors">
                                            <td className="py-4 px-6">
                                                <span className="font-mono text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md whitespace-nowrap">
                                                    {dept.departmentCode || '—'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-action-blue flex items-center justify-center font-bold text-sm">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                        </svg>
                                                    </div>
                                                    <span 
                                                        onClick={() => handleViewMembers(dept)}
                                                        className="text-sm font-bold text-midnight-indigo hover:text-action-blue hover:underline cursor-pointer"
                                                    >
                                                        {dept.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-sm text-slate-blue max-w-sm truncate">
                                                {dept.description || 'Không có mô tả'}
                                            </td>
                                            <td className="py-4 px-6 text-sm text-midnight-indigo font-semibold">
                                                <button
                                                    onClick={() => handleViewMembers(dept)}
                                                    className="inline-flex items-center px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-action-blue rounded-lg text-xs font-semibold transition-colors"
                                                >
                                                    {dept.memberCount || 0} nhân sự
                                                </button>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                    dept.isActive !== false
                                                        ? 'bg-green-50 text-green-700'
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${dept.isActive !== false ? 'bg-green-500' : 'bg-slate-400'}`} />
                                                    {dept.isActive !== false ? 'Hoạt động' : 'Vô hiệu hóa'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-sm text-slate-blue">
                                                {dept.createdAt ? new Date(dept.createdAt).toLocaleDateString('vi-VN') : '---'}
                                            </td>
                                            <td className="py-4 px-6 text-right space-x-2">
                                                <button
                                                    onClick={() => openEditModal(dept)}
                                                    title="Chỉnh sửa thông tin"
                                                    className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                {dept.id === PARTNER_DEPARTMENT_ID ? (
                                                    <span title="Phòng ban hệ thống, không thể vô hiệu hóa" className="inline-flex p-1.5 rounded-lg text-slate-300 cursor-not-allowed">
                                                        <Lock className="w-4 h-4" />
                                                    </span>
                                                ) : dept.isActive !== false ? (
                                                    <button
                                                        onClick={() => handleDeactivateDept(dept)}
                                                        title="Vô hiệu hóa phòng ban"
                                                        className="inline-flex p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Power className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleReactivateDept(dept)}
                                                        title="Kích hoạt lại phòng ban"
                                                        className="inline-flex p-1.5 rounded-lg text-green-600 hover:text-green-800 hover:bg-green-50 transition-colors"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Footer */}
                {!loading && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                        <span className="text-xs text-slate-blue">
                            Hiển thị {departmentsList.length} trên tổng số {totalDepartments} phòng ban
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(p - 1, 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                            >
                                Trước
                            </button>
                            <span className="px-3 py-1.5 text-xs font-bold text-midnight-indigo">
                                Trang {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                            >
                                Tiếp
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CREATE DEPT MODAL */}
            {isCreateModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-base">Tạo phòng ban mới</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                            {createDeptError && (
                                <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span className="whitespace-pre-line">{createDeptError}</span>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                                    Tên phòng ban <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Ví dụ: Phòng Nghiên cứu và Phát triển"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1 flex items-center gap-2">
                                    Mã phòng ban <span className="text-red-500">*</span>
                                    <span className="text-[10px] font-normal normal-case text-action-blue bg-blue-50 px-1.5 py-0.5 rounded">Tự động</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        required
                                        value={formData.departmentCode}
                                        onChange={(e) => {
                                            setDeptCodeInlineError(null);
                                            setFormData(f => ({ ...f, departmentCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }));
                                        }}
                                        placeholder="PB-XXXX"
                                        className={`flex-1 px-3 py-2 border rounded-xl text-sm font-mono focus:outline-none ${deptCodeInlineError ? 'border-red-400 focus:border-red-500' : 'border-platinum-tint focus:border-action-blue'}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setDeptCodeInlineError(null); setFormData(f => ({ ...f, departmentCode: generateDeptCode() })); }}
                                        className="px-3 py-2 border border-platinum-tint rounded-xl text-xs font-semibold text-slate-blue hover:bg-cloud-mist transition-colors whitespace-nowrap"
                                        title="Tạo mã ngẫu nhiên mới"
                                    >
                                        Tạo lại
                                    </button>
                                </div>
                                {deptCodeInlineError ? (
                                    <p className="mt-1 text-xs text-red-600">{deptCodeInlineError}</p>
                                ) : (
                                    <p className="mt-1 text-[11px] text-slate-blue">Mã ngẫu nhiên, có thể chỉnh thủ công. Chỉ A-Z, 0-9, _ và -.</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả hoạt động</label>
                                <textarea
                                    rows="4"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Mô tả chức năng nhiệm vụ của phòng ban..."
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue resize-none"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint rounded-xl text-sm font-semibold bg-white text-slate-blue hover:bg-cloud-mist transition-all"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all"
                                >
                                    Xác nhận tạo
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* EDIT DEPT MODAL */}
            {isEditModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-base">Chỉnh sửa thông tin phòng ban</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã phòng ban</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.departmentCode || '—'}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-cloud-mist text-slate-blue cursor-not-allowed font-mono"
                                />
                                <p className="text-[10px] text-slate-blue mt-1">Mã phòng ban không thể thay đổi sau khi tạo.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên phòng ban <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả hoạt động</label>
                                <textarea
                                    rows="4"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue resize-none"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint rounded-xl text-sm font-semibold bg-white text-slate-blue hover:bg-cloud-mist transition-all"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all"
                                >
                                    Lưu thay đổi
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* DEPARTMENT MEMBERS MODAL (WITH COMPLETE USER MANAGEMENT ACTIONS) */}
            {isMembersModalOpen && selectedDept && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-base">Thành viên phòng ban: {selectedDept.name}</h3>
                                <p className="text-xs text-slate-blue mt-0.5">{selectedDept.description || 'Không có mô tả chi tiết'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={openUserCreateModal}
                                    className="inline-flex items-center justify-center px-3 py-1.5 bg-action-blue hover:bg-glacier-blue text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
                                >
                                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tạo người dùng mới
                                </button>
                                <button onClick={() => setIsMembersModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto flex flex-col min-h-0 justify-between">
                            {membersLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 flex-1">
                                    <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                    <p className="mt-4 text-slate-blue text-xs">Đang tải danh sách thành viên...</p>
                                </div>
                            ) : membersList.length === 0 ? (
                                <p className="text-center text-sm text-slate-blue py-12 flex-1">Phòng ban này chưa có nhân sự nào được phân bổ.</p>
                            ) : (
                                <div className="w-full overflow-x-auto overflow-y-auto flex-1 min-h-0 border border-platinum-tint/60 rounded-xl shadow-sm-1">
                                    <table className="w-full text-left border-collapse min-w-[750px]">
                                        <thead>
                                            <tr className="border-b border-platinum-tint bg-cloud-mist/50 select-none">
                                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Hồ sơ</th>
                                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Số điện thoại</th>
                                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Vai trò (Role)</th>
                                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Trạng thái</th>
                                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase text-right whitespace-nowrap">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {membersList.map((user) => (
                                                <tr key={user.id} className="border-b border-platinum-tint/40 hover:bg-cloud-mist/20 transition-colors">
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-3">
                                                            <UserAvatar
                                                                user={user}
                                                                className="w-10 h-10 rounded-full shrink-0 font-bold text-sm"
                                                            />
                                                            <div>
                                                                <h4 
                                                                    onClick={() => handleUserViewDetail(user)}
                                                                    className="text-sm font-bold text-midnight-indigo leading-tight cursor-pointer hover:underline hover:text-action-blue whitespace-nowrap"
                                                                >
                                                                    {user.fullName}
                                                                </h4>
                                                                <p className="text-xs text-slate-blue leading-normal">{user.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-sm text-slate-blue whitespace-nowrap">
                                                        {user.phoneNumber || user.phone || 'Chưa cung cấp'}
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                            {user.roles?.map(r => (
                                                                <span key={r.id} className="inline-flex text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold whitespace-nowrap">
                                                                    {r.name}
                                                                </span>
                                                            )) || <span className="text-xs text-steel-gray">Chưa phân quyền</span>}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(user.accountStatus === 'locked' || user.locked)
                                                            ? 'bg-red-50 text-red-700'
                                                            : 'bg-green-50 text-green-700'
                                                            }`}>
                                                            {(user.accountStatus === 'locked' || user.locked) ? 'Bị khóa' : 'Hoạt động'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                                                        <button
                                                            onClick={() => handleUserViewDetail(user)}
                                                            title="Xem chi tiết hồ sơ"
                                                            className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleUserViewLogs(user)}
                                                            title="Xem nhật ký lịch sử"
                                                            className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => openUserEditModal(user)}
                                                            title="Chỉnh sửa thông tin"
                                                            className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleUserLockToggle(user)}
                                                            title={user.locked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                                                            className={`inline-flex p-1.5 rounded-lg transition-colors ${user.locked
                                                                ? 'text-green-600 hover:bg-green-50 hover:text-green-700'
                                                                : 'text-red-500 hover:bg-red-50 hover:text-red-600'
                                                                }`}
                                                        >
                                                            {user.locked ? (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleUserDelete(user)}
                                                            title="Xóa vĩnh viễn"
                                                            className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Pagination for Members List */}
                            {!membersLoading && membersList.length > 0 && (
                                <div className="px-6 py-3 border-t border-platinum-tint bg-cloud-mist/10 flex items-center justify-between select-none rounded-xl mt-4">
                                    <span className="text-xs text-slate-blue">
                                        Hiển thị {membersList.length} trên tổng số {membersTotalCount} thành viên
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const prevPage = Math.max(membersPage - 1, 1);
                                                setMembersPage(prevPage);
                                                fetchDepartmentMembers(selectedDept.id, prevPage);
                                            }}
                                            disabled={membersPage === 1}
                                            className="px-2.5 py-1 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                                        >
                                            Trước
                                        </button>
                                        <span className="px-2.5 py-1 text-xs font-bold text-midnight-indigo">
                                            Trang {membersPage} / {membersTotalPages}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const nextPage = Math.min(membersPage + 1, membersTotalPages);
                                                setMembersPage(nextPage);
                                                fetchDepartmentMembers(selectedDept.id, nextPage);
                                            }}
                                            disabled={membersPage === membersTotalPages}
                                            className="px-2.5 py-1 border border-platinum-tint rounded-lg text-xs font-semibold bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-50 transition-colors"
                                        >
                                            Tiếp
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* INTEGRATED USER CREATE MODAL */}
            {isUserCreateModalOpen && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-base">Thêm người dùng</h3>
                                <p className="text-xs text-slate-blue mt-0.5">Phòng ban: <span className="font-semibold text-action-blue">{selectedDept?.name}</span></p>
                            </div>
                            <button onClick={() => setIsUserCreateModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleUserCreateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                            {createUserError && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    {createUserError}
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Họ và Tên <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={userFormData.fullName}
                                    onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                                    placeholder="Ví dụ: Nguyễn Văn A"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Email <span className="text-red-500">*</span></label>
                                <input
                                    type="email"
                                    required
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                                    placeholder="example@company.com"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Số điện thoại</label>
                                <input
                                    type="text"
                                    value={userFormData.phone}
                                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                                    placeholder="09xxxxxxxx"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Phòng ban</label>
                                <input
                                    type="text"
                                    disabled
                                    value={selectedDept?.name || ''}
                                    className="w-full px-3 py-2 border border-platinum-tint/50 bg-cloud-mist rounded-xl text-sm text-slate-blue cursor-not-allowed focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Vai trò (Role)</label>
                                <div className="space-y-2 mt-1">
                                    {roles.map(r => (
                                        <label key={r.id} className="flex items-center gap-2 text-sm text-midnight-indigo font-medium cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={userFormData.roleIds.includes(r.id)}
                                                onChange={() => handleRoleCheckboxChange(r.id)}
                                                className="rounded text-action-blue focus:ring-action-blue"
                                            />
                                            {r.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsUserCreateModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                                >
                                    Tạo mới
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* INTEGRATED USER EDIT MODAL */}
            {isUserEditModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-base">Chỉnh sửa thông tin thành viên</h3>
                            <button onClick={() => setIsUserEditModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleUserEditSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Email</label>
                                <input
                                    type="email"
                                    disabled
                                    value={userFormData.email}
                                    className="w-full px-3 py-2 border border-platinum-tint/50 bg-cloud-mist rounded-xl text-sm text-slate-blue cursor-not-allowed focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Họ và Tên <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={userFormData.fullName}
                                    onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Số điện thoại</label>
                                <input
                                    type="text"
                                    value={userFormData.phone}
                                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Phòng ban</label>
                                {hasPermission('accounts.user.update') ? (
                                    <select
                                        value={userFormData.departmentId}
                                        onChange={(e) => setUserFormData({ ...userFormData, departmentId: e.target.value })}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white text-midnight-indigo font-medium"
                                    >
                                        <option value={selectedDept?.id || ''}>{selectedDept?.name || 'Chọn phòng ban'}</option>
                                        {allActiveDepartments
                                            .filter(d => d.id !== selectedDept?.id)
                                            .map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        disabled
                                        value={selectedDept?.name || ''}
                                        className="w-full px-3 py-2 border border-platinum-tint/50 bg-cloud-mist rounded-xl text-sm text-slate-blue cursor-not-allowed focus:outline-none"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Vai trò (Role)</label>
                                <div className="space-y-2 mt-1">
                                    {roles.map(r => (
                                        <label key={r.id} className="flex items-center gap-2 text-sm text-midnight-indigo font-medium cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={userFormData.roleIds.includes(r.id)}
                                                onChange={() => handleRoleCheckboxChange(r.id)}
                                                className="rounded text-action-blue focus:ring-action-blue"
                                            />
                                            {r.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsUserEditModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                                >
                                    Lưu thay đổi
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* INTEGRATED USER AUDIT LOGS MODAL */}
            {isUserLogsModalOpen && selectedUser && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-base">Lịch sử hoạt động</h3>
                                <p className="text-xs text-slate-blue mt-0.5">{selectedUser.fullName} ({selectedUser.email})</p>
                            </div>
                            <button onClick={() => setIsUserLogsModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto flex flex-col min-h-0">
                            {logsLoading ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : userLogs.length === 0 ? (
                                <p className="text-center text-sm text-slate-blue py-8">Không có bản ghi hoạt động nào.</p>
                            ) : (
                                <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
                                    {userLogs.map((log) => (
                                        <div key={log.id} className="p-3 bg-cloud-mist rounded-xl border border-outline-gray/60 space-y-1">
                                            <div className="flex justify-between items-start gap-2">
                                                <p className="text-xs font-bold text-midnight-indigo">
                                                    {log.description || ACTION_MAP[log.action] || log.action}
                                                </p>
                                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : log.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {log.status === 'success' ? 'Thành công' : log.status === 'failed' ? 'Thất bại' : log.status || ''}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center pt-0.5">
                                                <p className="text-[10px] text-slate-blue">Tác nhân: {log.actorName || log.actorEmail || '—'}</p>
                                                <span className="text-[10px] text-slate-blue">
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleString('vi-VN') : ''}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="pt-4 flex justify-end border-t border-platinum-tint mt-4">
                                <button
                                    onClick={() => setIsUserLogsModalOpen(false)}
                                    className="px-4 py-2 bg-midnight-indigo text-white hover:bg-midnight-indigo/90 rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* INTEGRATED USER DETAIL MODAL */}
            {isUserDetailModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-base">Chi tiết hồ sơ tài khoản</h3>
                            <button onClick={() => setIsUserDetailModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {detailLoading || !selectedUserDetail ? (
                            <div className="p-12 flex flex-col items-center justify-center flex-1">
                                <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-slate-blue text-sm">Đang tải chi tiết...</p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0 flex flex-col justify-between">
                                <div className="flex items-center gap-4 bg-cloud-mist/55 p-4 rounded-xl border border-platinum-tint/50">
                                    <UserAvatar
                                        user={selectedUserDetail}
                                        className="w-16 h-16 rounded-full shrink-0 font-extrabold text-xl"
                                    />
                                    <div>
                                        <h4 className="text-lg font-bold text-midnight-indigo leading-tight">{selectedUserDetail.fullName}</h4>
                                        <p className="text-sm text-slate-blue mt-0.5">{selectedUserDetail.email}</p>
                                        <div className="flex gap-1.5 mt-1">
                                            {selectedUserDetail.roles?.map(r => (
                                                <span key={r.id} className="text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">
                                                    {r.roleName || r.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin cá nhân</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Mã nhân viên:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedUserDetail.employeeCode || 'Chưa thiết lập'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Số điện thoại:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedUserDetail.phoneNumber || 'Chưa cung cấp'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Cấu trúc tổ chức</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Phòng ban:</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {selectedUserDetail.department?.departmentName || selectedUserDetail.department?.name || 'Chưa phân bổ'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Chức danh / Vị trí:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedUserDetail.positionTitle || 'Chưa thiết lập'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Quản lý trực tiếp:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedUserDetail.directManager?.fullName || 'Không có'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin hệ thống</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Trạng thái hoạt động:</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
                                                    selectedUserDetail.accountStatus === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                                }`}>
                                                    {selectedUserDetail.accountStatus === 'active' ? 'Hoạt động' : 'Bị khóa'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Đăng nhập cuối:</span>
                                                <span className="font-semibold text-midnight-indigo block mt-1">
                                                    {selectedUserDetail.lastLoginAt ? new Date(selectedUserDetail.lastLoginAt).toLocaleString('vi-VN') : 'Chưa có thông tin'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Hồ sơ khuôn mặt (FaceID):</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
                                                    selectedUserDetail.hasFaceProfile ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                    {selectedUserDetail.hasFaceProfile ? 'Đã hợp lệ' : 'Chưa đăng ký'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-between items-center border-t border-platinum-tint mt-6">
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsUserDetailModalOpen(false);
                                                openUserEditModal(selectedUserDetail);
                                            }}
                                            className="px-3 py-1.5 border border-platinum-tint bg-white text-action-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Chỉnh sửa
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsUserDetailModalOpen(false);
                                                handleUserLockToggle(selectedUserDetail);
                                            }}
                                            className={`px-3 py-1.5 border rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 ${
                                                (selectedUserDetail.accountStatus === 'locked' || selectedUserDetail.locked)
                                                    ? 'border-green-200 bg-white text-green-600 hover:bg-green-50'
                                                    : 'border-red-200 bg-white text-red-500 hover:bg-red-50'
                                            }`}
                                        >
                                            {(selectedUserDetail.accountStatus === 'locked' || selectedUserDetail.locked) ? (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                    </svg>
                                                    Mở khóa
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    Khóa tài khoản
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsUserDetailModalOpen(false);
                                                handleUserViewLogs(selectedUserDetail);
                                            }}
                                            className="px-3 py-1.5 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Nhật ký lịch sử
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsUserDetailModalOpen(false)}
                                        className="px-4 py-2 bg-midnight-indigo text-white hover:bg-midnight-indigo/90 rounded-xl text-sm font-semibold transition-colors"
                                    >
                                        Đóng
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
        </>
    );
};

// Map action codes — khớp với mã thực tế BE ghi trong GET /users/:id/audit-logs
const ACTION_MAP = {
    // Tài khoản (mã mới từ BE Option B)
    'ACCOUNT_CREATE': 'Thêm tài khoản',
    'account.partner.create': 'Tạo tài khoản đối tác',
    'ACCOUNT_UPDATE': 'Cập nhật tài khoản',
    'ACCOUNT_LOCK': 'Khóa tài khoản',
    'ACCOUNT_UNLOCK': 'Mở khóa tài khoản',
    'ACCOUNT_DELETE': 'Xóa tài khoản',
    'ACCOUNT_ROLE_UPDATE': 'Đổi vai trò',
    'ACCOUNT_STATUS_UPDATE': 'Cập nhật trạng thái',
    'account.partner.extend': 'Gia hạn tài khoản đối tác',
    'view_detail': 'Xem chi tiết',
    // Legacy codes (fallback phòng trường hợp BE chưa migrate đồng bộ)
    'LOGIN': 'Đăng nhập',
    'LOGIN_FAILED': 'Đăng nhập thất bại',
    'LOGOUT': 'Đăng xuất',
    'CREATE_USER': 'Thêm tài khoản',
    'UPDATE_USER': 'Cập nhật tài khoản',
    'LOCK_USER': 'Khóa tài khoản',
    'UNLOCK_USER': 'Mở khóa tài khoản',
    'DELETE_USER': 'Xóa tài khoản',
    'REGISTER_DEVICE': 'Đăng ký thiết bị',
    'EXPORT_USERS': 'Xuất tệp nhân viên',
    'UPDATE_CONFIG': 'Cập nhật cấu hình hệ thống',
};

export default DepartmentManagement;
