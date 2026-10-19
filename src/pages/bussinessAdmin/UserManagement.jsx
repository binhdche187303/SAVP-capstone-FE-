import { Users, RefreshCw } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ImportAccountsModal from '../../components/user/ImportAccountsModal';
import { useState, useEffect, useCallback, useRef } from 'react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { vi } from 'date-fns/locale/vi';
import TimePicker from '../../components/common/TimePicker';

import { createPortal } from 'react-dom';
import UserAvatar from '../../components/common/UserAvatar';
import {
    getUsers,
    getUsersForManagement,
    getStudentAdministrativeClasses,
    createUser,
    createPartnerUser,
    updateUser,
    updatePartnerExpiry,
    updateUserRoles,
    lockUser,
    unlockUser,
    updateUserStatus,
    deleteUser,
    getUserAuditLogs,
    getDepartments,
    getRoles,
    exportUsers,
    getUserById,
    resyncUserPortrait,
} from '../../service/businessAdminServices';
import { adminRegisterVehicle } from '../../service/anprService';
import {
    PARTNER_DEPARTMENT_ID,
    isPartnerAccount,
    isAccountExpired,
    getExpiryStatus,
    getExpiryLabel,
    buildPartnerFormData,
} from '../../constants/partnerAccount';

import { getLeaderRoleLabel } from '../../utils/calendarRoleLabel';

const ROLE_LABELS = {
    SYSTEM_ADMIN: 'Quản trị hệ thống',
    BUSINESS_ADMIN: 'Quản trị nghiệp vụ',
    MANAGER: 'Trưởng nhóm / Quản lý',
    EMPLOYEE: 'Cán bộ, viên chức',
    TEACHER: 'Giảng viên',
    STUDENT: 'Sinh viên',
    GUARD: 'Bảo vệ',
};

const normalizeRoleCode = (role) => (
    typeof role === 'string'
        ? role
        : (role?.roleCode || role?.role_code || role?.code || '')
).toUpperCase();

const formatRoleLabel = (role, roles = []) => {
    const code = normalizeRoleCode(role);
    if (ROLE_LABELS[code]) return ROLE_LABELS[code];

    const roleIdOrCode = typeof role === 'string' ? role : role?.id || code;
    const roleObj = roles.find((item) => item.id === roleIdOrCode || normalizeRoleCode(item) === code);
    const fallbackName = typeof role === 'object' ? role?.roleName : null;
    return ROLE_LABELS[normalizeRoleCode(roleObj)] || fallbackName || roleObj?.roleName || code || 'Chưa phân quyền';
};

const hasRole = (user, roleCode) => (user?.roles || []).some((role) => normalizeRoleCode(role) === roleCode);

/**
 * UserManagement Component
 * UC-ACC-01 ~ UC-ACC-07: Account Management for SystemAdmin
 */
const UserManagement = ({ mode = 'business-admin' }) => {
    const isSystemAdminMode = mode === 'system-admin';
    // States
    const [usersList, setUsersList] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [isResyncing, setIsResyncing] = useState(false);

    // Global users map for avatars and phone numbers not returned by manage API
    const [usersMap, setUsersMap] = useState({});

    // Fetch master user list for avatars and phone numbers
    useEffect(() => {
        const fetchUsersMap = async () => {
            try {
                const res = await getUsers({ limit: 100 });
                if (res?.success && res.data) {
                    const map = {};
                    res.data.forEach(u => {
                        map[u.id] = u;
                    });
                    setUsersMap(map);
                }
            } catch (err) {
                console.error("Failed to fetch users map:", err);
            }
        };
        fetchUsersMap();
    }, []);

    // Filter & Search states
    const [search, setSearch] = useState('');
    const [selectedAccountType, setSelectedAccountType] = useState('staff');
    const [selectedRole, setSelectedRole] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [studentClassOptions, setStudentClassOptions] = useState([]);
    const [selectedStatus, setSelectedStatus] = useState(''); // ACTIVE, LOCKED
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);

    // Modal control states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedUserDetail, setSelectedUserDetail] = useState(null);
    const [calendarRoleOrig, setCalendarRoleOrig] = useState(null);
    const [userLogs, setUserLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    // Expiry modal state
    const [isExpiryModalOpen, setIsExpiryModalOpen] = useState(false);
    const [expiryTargetUser, setExpiryTargetUser] = useState(null);
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [expiryLoading, setExpiryLoading] = useState(false);

    // Date+time picker states for create-partner form
    const [expiryPickerDate, setExpiryPickerDate] = useState(null);
    const [expiryPickerTime, setExpiryPickerTime] = useState('23:59');

    // Date+time picker states for expiry modal
    const [newExpiryDateObj, setNewExpiryDateObj] = useState(null);
    const [newExpiryTimeStr, setNewExpiryTimeStr] = useState('23:59');

    // Form inputs states
    const [formData, setFormData] = useState({
        email: '',
        fullName: '',
        phone: '',
        departmentId: '',
        administrativeClass: '',
        roleIds: [],
        // Partner-only fields
        accountType: 'employee',
        accountExpiresAt: '',
        avatarFile: null,
        plateRaw: '',
        vehicleType: 'CAR',
    });
    const avatarInputRef = useRef(null);

    const [formErrors, setFormErrors] = useState({});


    // Load filter options (Departments, Roles)
    const loadFilterData = useCallback(async () => {
        try {
            const [deptRes, rolesRes] = await Promise.all([
                getDepartments({ limit: 100 }),
                getRoles()
            ]);
            if (deptRes?.success) setDepartments(deptRes.data || []);
            if (rolesRes?.success) setRoles(rolesRes.data || []);
        } catch {
            setDepartments([]);
            setRoles([]);
        }
    }, []);

    // Load Users
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page,
                limit,
                search: search.trim() || undefined,
                accountType: selectedAccountType,
                roleId: selectedRole || undefined,
                departmentId: selectedDept || undefined,
                classId: selectedAccountType === 'student' ? selectedClass || undefined : undefined,
                accountStatus: selectedStatus || undefined
            };
            const res = await getUsersForManagement(params);
            if (res?.success) {
                setUsersList(res.data || []);
                setTotalPages(res.meta?.totalPages || 1);
                setTotalUsers(res.meta?.total || (res.data?.length || 0));
            } else {
                throw new Error('API request failed');
            }
        } catch (err) {
            setUsersList([]);
            setTotalPages(1);
            setTotalUsers(0);
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, selectedAccountType, selectedRole, selectedDept, selectedClass, selectedStatus]);

    useEffect(() => {
        loadFilterData();
    }, [loadFilterData]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        const fetchStudentClasses = async () => {
            try {
                const response = await getStudentAdministrativeClasses();
                const classes = response?.data || [];
                setStudentClassOptions(
                    (classes || []).sort((a, b) => (a.code || '').localeCompare(b.code || '', 'vi'))
                );
            } catch {
                setStudentClassOptions([]);
            }
        };

        fetchStudentClasses();
    }, []);

    const visibleRoles = roles.filter((role) => {
        const code = normalizeRoleCode(role);
        return selectedAccountType === 'student' ? code === 'STUDENT' : code !== 'STUDENT';
    });
    const isStudentList = selectedAccountType === 'student';
    const studentRole = roles.find((role) => normalizeRoleCode(role) === 'STUDENT');
    const isStudentRoleSelected = Boolean(studentRole && formData.roleIds.includes(studentRole.id));

    // Auto-hide success and error messages after 3 seconds
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);


    // Handle Create (UC-06) — nhánh employee + partner
    const handleCreateSubmit = async (e) => {
        e.preventDefault();

        const isPartner = formData.accountType === 'partner';

        // Client-side Validation
        const errors = {};
        if (!formData.fullName.trim()) errors.fullName = "Vui lòng nhập họ và tên";
        if (!formData.email.trim()) {
            errors.email = "Vui lòng nhập email";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = "Email không đúng định dạng";
        }
        if (!isPartner && formData.roleIds.length === 0) {
            errors.roleIds = "Vui lòng gán ít nhất 1 vai trò";
        }

        if (!isPartner) {
            if (isStudentRoleSelected) {
                if (!formData.administrativeClass) errors.administrativeClass = "Vui lòng chọn lớp hành chính";
            } else if (!formData.departmentId) {
                errors.departmentId = "Vui lòng chọn phòng ban";
            }
        } else {
            if (!formData.accountExpiresAt) {
                errors.accountExpiresAt = "Vui lòng nhập ngày hết hạn";
            } else if (new Date(formData.accountExpiresAt).getTime() <= Date.now()) {
                errors.accountExpiresAt = "Ngày hết hạn phải là thời điểm tương lai";
            }
            if (!formData.avatarFile) {
                errors.avatarFile = "Vui lòng chọn ảnh khuôn mặt (sinh trắc học)";
            } else {
                const allowed = ['image/jpeg', 'image/png', 'image/webp'];
                if (!allowed.includes(formData.avatarFile.type)) {
                    errors.avatarFile = "Ảnh phải là JPEG, PNG hoặc WEBP";
                } else if (formData.avatarFile.size > 5 * 1024 * 1024) {
                    errors.avatarFile = "Ảnh không được vượt quá 5MB";
                }
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setFormErrors({});
        setError(null);
        setSuccessMessage(null);

        try {
            let res;
            if (isPartner) {
                // Tự động gán vai trò Employee cho tài khoản đối tác
                const employeeRole = roles.find(r => {
                    const code = (r.roleCode || r.role_code || '').toUpperCase();
                    return code === 'EMPLOYEE';
                });
                if (!employeeRole) {
                    setError('Không tìm thấy vai trò EMPLOYEE trong hệ thống. Vui lòng tải lại trang.');
                    return;
                }
                const partnerRoleIds = [employeeRole.id];

                const fd = buildPartnerFormData({
                    fullName: formData.fullName,
                    email: formData.email,
                    roleIds: partnerRoleIds,
                    avatarFile: formData.avatarFile,
                    accountExpiresAt: new Date(formData.accountExpiresAt).toISOString(),
                });
                res = await createPartnerUser(fd);
            } else {
                res = await createUser({
                    email: formData.email,
                    fullName: formData.fullName,
                    phoneNumber: formData.phone,
                    accountType: isStudentRoleSelected ? 'student' : 'employee',
                    departmentId: isStudentRoleSelected ? undefined : formData.departmentId || null,
                    administrativeClass: isStudentRoleSelected ? formData.administrativeClass : undefined,
                    roleIds: formData.roleIds,
                });
            }

            if (res?.success) {
                // Đăng ký biển số xe nếu có
                if (isPartner && formData.plateRaw.trim() && res.data?.id) {
                    try {
                        await adminRegisterVehicle({
                            user_id: res.data.id,
                            plate_raw: formData.plateRaw.trim(),
                            vehicle_type: formData.vehicleType || 'CAR',
                        });
                        setSuccessMessage('Tạo tài khoản đối tác và đăng ký biển số xe thành công!');
                    } catch (vehicleErr) {
                        setSuccessMessage('Tạo tài khoản đối tác thành công. Lưu ý: đăng ký biển số thất bại — ' + (vehicleErr?.error?.message || vehicleErr?.message || 'vui lòng đăng ký lại trong mục ANPR.'));
                    }
                } else {
                    setSuccessMessage(isPartner ? 'Tạo tài khoản đối tác thành công!' : 'Tạo tài khoản người dùng thành công!');
                }
                fetchUsers();
                resetForm();
            } else {
                setError(res?.message || 'Có lỗi xảy ra khi tạo tài khoản.');
            }
        } catch (err) {
            const code = err?.error?.code;
            const msgMap = {
                AVATAR_FILE_REQUIRED: 'Vui lòng chọn ảnh sinh trắc học.',
                AVATAR_FILE_TOO_LARGE: 'Ảnh vượt quá 5MB.',
                AVATAR_FILE_TYPE_INVALID: 'Ảnh phải là JPEG, PNG hoặc WEBP.',
                ACCOUNT_EXPIRES_AT_REQUIRED: 'Vui lòng nhập ngày hết hạn.',
                ACCOUNT_EXPIRES_AT_MUST_BE_FUTURE: 'Ngày hết hạn phải là thời điểm tương lai.',
                ACCOUNT_EMAIL_ALREADY_EXISTS: 'Email này đã tồn tại trong hệ thống.',
                PARTNER_AVATAR_STORAGE_FAILED: 'Tải ảnh lên thất bại, vui lòng thử lại.',
            };
            setError(msgMap[code] || err?.error?.message || err?.message || 'Thao tác thất bại. Không thể kết nối tới server.');
        } finally {
            setIsCreateModalOpen(false);
        }
    };

    // Kết hợp Date object + HH:MM string → ISO string
    const combineDateTime = (dateObj, timeStr) => {
        if (!dateObj || !timeStr) return '';
        const [hh, mm] = timeStr.split(':');
        const d = new Date(dateObj);
        d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
        return d.toISOString();
    };

    // Handlers cho picker trong create form
    const handleExpiryPickerDate = (date) => {
        setExpiryPickerDate(date);
        const iso = combineDateTime(date, expiryPickerTime);
        setFormData(f => ({ ...f, accountExpiresAt: iso }));
        setFormErrors(e => ({ ...e, accountExpiresAt: '' }));
    };
    const handleExpiryPickerTime = (time) => {
        setExpiryPickerTime(time);
        const iso = combineDateTime(expiryPickerDate, time);
        setFormData(f => ({ ...f, accountExpiresAt: iso }));
    };

    // Handlers cho picker trong expiry modal
    const handleNewExpiryDateChange = (date) => {
        setNewExpiryDateObj(date);
        setNewExpiryDate(combineDateTime(date, newExpiryTimeStr));
    };
    const handleNewExpiryTimeChange = (time) => {
        setNewExpiryTimeStr(time);
        setNewExpiryDate(combineDateTime(newExpiryDateObj, time));
    };

    // Mở modal gia hạn / khoá sớm tài khoản đối tác
    const openExpiryModal = (user) => {
        setExpiryTargetUser(user);
        if (user.accountExpiresAt) {
            const d = new Date(user.accountExpiresAt);
            setNewExpiryDateObj(d);
            setNewExpiryTimeStr(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
            setNewExpiryDate(d.toISOString());
        } else {
            setNewExpiryDateObj(null);
            setNewExpiryTimeStr('23:59');
            setNewExpiryDate('');
        }
        setIsExpiryModalOpen(true);
    };

    const handleExpiryUpdate = async (lockNow = false) => {
        if (!expiryTargetUser) return;
        setExpiryLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const expiresAt = lockNow
                ? new Date().toISOString()
                : new Date(newExpiryDate).toISOString();

            if (!lockNow && new Date(newExpiryDate).getTime() <= Date.now()) {
                setError('Ngày gia hạn phải là thời điểm tương lai.');
                setExpiryLoading(false);
                return;
            }

            const res = await updatePartnerExpiry(expiryTargetUser.id, expiresAt);
            if (res?.success) {
                setSuccessMessage(lockNow ? 'Đã khoá sớm tài khoản đối tác.' : 'Đã cập nhật hạn tài khoản đối tác.');
                setIsExpiryModalOpen(false);
                fetchUsers();
            } else {
                setError(res?.message || 'Cập nhật hạn thất bại.');
            }
        } catch (err) {
            const code = err?.error?.code;
            if (code === 'ACCOUNT_EXPIRY_PARTNER_ONLY') {
                setError('Chỉ áp dụng được cho tài khoản đối tác.');
            } else {
                setError(err?.error?.message || err?.message || 'Cập nhật hạn thất bại.');
            }
        } finally {
            setExpiryLoading(false);
        }
    };

    // Handle Edit (UC-09 & UC-08). Ở chế độ system-admin (mode='system-admin'), theo Role-UC.md
    // SYSTEM_ADMIN chỉ có UC-08 (gán vai trò) — KHÔNG có UC-09 (sửa thông tin cá nhân), nên bỏ
    // qua updateUser và chỉ gọi updateUserRoles dù BE vẫn cấp quyền accounts.user.update.
    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        try {
            const res = isSystemAdminMode
                ? null
                : await updateUser(selectedUser.id, {
                    fullName: formData.fullName,
                    phoneNumber: formData.phone,
                    departmentId: formData.departmentId || null,
                    // Chỉ gửi vai trò lịch khi đã tải được giá trị gốc và có thay đổi
                    ...(calendarRoleOrig && formData.isUnitClerk !== calendarRoleOrig.isUnitClerk
                        ? { isUnitClerk: formData.isUnitClerk } : {}),
                    ...(calendarRoleOrig && formData.leadershipTitle !== calendarRoleOrig.leadershipTitle
                        ? { leadershipTitle: formData.leadershipTitle || null } : {}),
                });
            if (isSystemAdminMode) {
                await updateUserRoles(selectedUser.id, { roleIds: formData.roleIds });
            }

            if (isSystemAdminMode || res?.success) {
                setSuccessMessage(isSystemAdminMode ? 'Cập nhật vai trò thành công!' : 'Cập nhật tài khoản thành công!');
                setIsEditModalOpen(false);
                fetchUsers();
                resetForm();
            } else {
                setError(res?.message || 'Có lỗi xảy ra khi cập nhật.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Thao tác thất bại. Không thể lưu thay đổi.');
        }
    };

    // Toggle Lock / Unlock (UC-11 / UC-12)
    const handleLockToggle = async (user) => {
        setError(null);
        setSuccessMessage(null);
        const isUserCurrentlyLocked = user.accountStatus === 'locked' || user.locked;
        try {
            const res = isUserCurrentlyLocked
                ? await unlockUser(user.id, { reason: 'Mở khóa tài khoản' })
                : await lockUser(user.id, { reason: 'Vi phạm quy định bảo mật' });
            if (res?.success) {
                setSuccessMessage(`${isUserCurrentlyLocked ? 'Mở khóa' : 'Khóa'} tài khoản thành công!`);
                fetchUsers();
            } else {
                setError(res?.message || 'Không thể thay đổi trạng thái khóa.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể thay đổi trạng thái khóa. Vui lòng thử lại.');
        }
    };

    // Toggle activate / deactivate (UC-08)
    const handleStatusToggle = async (user) => {
        const isActive = user.accountStatus === 'active' || (!user.accountStatus && !user.locked);
        const newStatus = isActive ? 'inactive' : 'active';
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await updateUserStatus(user.id, { status: newStatus });
            if (res?.success) {
                setSuccessMessage(`${isActive ? 'Đã tạm dừng' : 'Đã kích hoạt lại'} tài khoản thành công!`);
                fetchUsers();
            } else {
                setError(res?.message || 'Không thể đổi trạng thái tài khoản.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể đổi trạng thái. Vui lòng thử lại.');
        }
    };

    // Delete user (BR-PRIV-02 soft delete)
    const handleResyncPortrait = async (userId) => {
        setIsResyncing(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await resyncUserPortrait(userId);
            if (res?.success) {
                setSuccessMessage('Đã yêu cầu đồng bộ lại, có hiệu lực trong vài phút.');
            } else {
                if (res?.status === 404) {
                    setError('Người dùng chưa từng được đăng ký vào kho nhận diện thường trực.');
                } else {
                    setError(res?.message || 'Có lỗi xảy ra khi đồng bộ lại nhận diện khuôn mặt.');
                }
            }
        } catch (err) {
            const status = err?.response?.status || err?.status;
            if (status === 404 || err?.message?.includes('404')) {
                setError('Người dùng chưa từng được đăng ký vào kho nhận diện thường trực.');
            } else if (status === 403 || err?.message?.includes('403')) {
                setError('Tài khoản của bạn không có quyền đồng bộ thiết bị (403). Vui lòng liên hệ Quản trị hệ thống hoặc bộ phận kỹ thuật.');
            } else {
                setError(err?.message || err?.error?.message || 'Không thể đồng bộ lại. Vui lòng thử lại.');
            }
        } finally {
            setIsResyncing(false);
        }
    };

    const handleDeleteUser = (user) => {
        setConfirm({
            message: `Bạn có chắc chắn muốn xóa tài khoản của ${user.fullName}? Thao tác không thể hoàn tác.`,
            onConfirm: async () => {
                setError(null);
                setSuccessMessage(null);
                try {
                    const res = await deleteUser(user.id);
                    if (res?.success) {
                        setSuccessMessage('Đã xóa người dùng khỏi hệ thống.');
                        fetchUsers();
                    } else {
                        setError(res?.message || 'Không thể xóa tài khoản.');
                    }
                } catch (err) {
                    setError(err?.message || err?.error?.message || 'Không thể xóa tài khoản. Vui lòng thử lại.');
                }
            },
        });
    };

    // Open User logs modal (UC-ACC-07)
    const handleViewLogs = async (user) => {
        setSelectedUser(user);
        setIsLogsModalOpen(true);
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

    // Load detail profile (UC-AM-10)
    const handleViewDetail = async (user) => {
        setSelectedUser(user);
        setIsDetailModalOpen(true);
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
            setSelectedUserDetail({ ...user });
        } finally {
            setDetailLoading(false);
        }
    };

    // Excel Export download — GET /users/export (accounts.user.export), trả file XLSX toàn bộ danh sách
    const handleExportExcel = async () => {
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await exportUsers();
            if (res?.isBlob && res.data) {
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'Danh_Sach_Nguoi_Dung.xlsx');
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url);
                setSuccessMessage('Xuất toàn bộ danh sách người dùng thành công.');
                return;
            }
            throw new Error('Phản hồi không hợp lệ');
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi xuất dữ liệu.');
        }
    };

    // Helper functions
    const openCreateModal = () => {
        resetForm();
        setIsCreateModalOpen(true);
    };

    const openEditModal = (user) => {
        setSelectedUser(user);
        // ManageUserItemDto.departmentId là UUID string trực tiếp trên user (không
        // phải mảng user.departments); ManageUserItemDto.roles là string[] roleCode
        // (còn UserDetailResponseDto.roles — khi mở từ modal Chi tiết — là object[]
        // {id, roleCode, roleName}) — phải suy ra id thật của role qua danh sách
        // roles đã nạp (khớp theo roleCode) để checkbox tick đúng trạng thái hiện tại.
        const deptId = user.departmentId || user.departments?.[0]?.id || user.department?.id || '';
        const roleIds = (user.roles || [])
            .map(r => {
                if (typeof r === 'string') {
                    return roles.find(role => (role.roleCode || role.role_code || '').toUpperCase() === r.toUpperCase())?.id;
                }
                const rCode = (r.roleCode || r.role_code || '').toUpperCase();
                return r.id || roles.find(role => (role.roleCode || role.role_code || '').toUpperCase() === rCode)?.id;
            })
            .filter(Boolean);

        setFormData({
            email: user.email,
            fullName: user.fullName,
            phone: user.phoneNumber || user.phone || '',
            departmentId: deptId,
            administrativeClass: '',
            roleIds,
            isUnitClerk: false,
            leadershipTitle: '',
        });
        setCalendarRoleOrig(null);
        setIsEditModalOpen(true);
        // Lịch tuần UEL: cờ văn thư / chức danh BGH chỉ có trong chi tiết tài khoản.
        getUserById(user.id)
            .then((res) => {
                if (!res?.success || !res.data) return;
                const orig = { isUnitClerk: !!res.data.isUnitClerk, leadershipTitle: res.data.leadershipTitle || '' };
                setCalendarRoleOrig(orig);
                setFormData((prev) => ({ ...prev, ...orig }));
            })
            .catch(() => {});
    };

    const resetForm = () => {
        setFormData({
            email: '',
            fullName: '',
            phone: '',
            departmentId: '',
            administrativeClass: '',
            roleIds: [],
            accountType: 'employee',
            accountExpiresAt: '',
            avatarFile: null,
            plateRaw: '',
            vehicleType: 'CAR',
        });
        setExpiryPickerDate(null);
        setExpiryPickerTime('23:59');
        if (avatarInputRef.current) avatarInputRef.current.value = '';
    };

    const handleRoleCheckboxChange = (roleId) => {
        // roleId là UUID string (RoleResponseDto.id) — trước đây Number(roleId) biến
        // UUID thành NaN, khiến checkbox không bao giờ khớp và payload gửi lên BE
        // (CreateUserDto/UpdateUserRolesDto yêu cầu roleIds là UUID) luôn bị 400.
        setFormData(prev => {
            const exists = prev.roleIds.includes(roleId);
            const newRoles = exists
                ? prev.roleIds.filter(r => r !== roleId)
                : [...prev.roleIds, roleId];
            const changedRole = roles.find((role) => role.id === roleId);
            const changedStudentRole = normalizeRoleCode(changedRole) === 'STUDENT';
            return {
                ...prev,
                roleIds: newRoles,
                ...(changedStudentRole && !exists ? { departmentId: '' } : {}),
                ...(changedStudentRole && exists ? { administrativeClass: '' } : {}),
            };
        });
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <ConfirmDialog
                isOpen={!!confirm}
                message={confirm?.message}
                confirmLabel="Xóa tài khoản"
                onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
                onCancel={() => setConfirm(null)}
            />
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Users className="w-3.5 h-3.5" />
                        Người dùng
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý người dùng</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Quản lý hồ sơ, cấu hình phân quyền (Role) và giám sát trạng thái tài khoản.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleExportExcel}
                        className="inline-flex items-center justify-center px-4 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Xuất dữ liệu Excel
                    </button>
                    {!isSystemAdminMode && (
                        <>
                            <button
                                onClick={() => { resetForm(); setIsImportModalOpen(true); }}
                                className="inline-flex items-center justify-center px-4 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Nhập từ Excel
                            </button>
                            <button
                                onClick={openCreateModal}
                                className="inline-flex items-center justify-center px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Tạo người dùng
                            </button>
                        </>
                    )}
                </div>
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
                        placeholder="Tìm kiếm theo Tên hoặc Email..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="pl-10 pr-4 py-2 w-full border border-platinum-tint rounded-xl text-sm text-midnight-indigo placeholder:text-steel-gray focus:outline-none focus:border-action-blue"
                    />
                </div>

                <div className="flex flex-wrap gap-3">
                    <select
                        value={selectedAccountType}
                        onChange={(e) => {
                            setSelectedAccountType(e.target.value);
                            setSelectedRole('');
                            setSelectedDept('');
                            setSelectedClass('');
                            setPage(1);
                        }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                    >
                        <option value="staff">Nhân sự</option>
                        <option value="student">Sinh viên</option>
                    </select>

                    {/* Role Filter */}
                    {!isStudentList && (
                        <select
                            value={selectedRole}
                            onChange={(e) => { setSelectedRole(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                        >
                            <option value="">Tất cả vai trò</option>
                            {visibleRoles.map(r => (
                                <option key={r.id} value={r.id}>{formatRoleLabel(r, roles)}</option>
                            ))}
                        </select>
                    )}

                    {/* Department Filter */}
                    {!isStudentList && (
                        <select
                            value={selectedDept}
                            onChange={(e) => { setSelectedDept(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                        >
                            <option value="">Tất cả phòng ban</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.departmentName}</option>
                            ))}
                        </select>
                    )}

                    {/* Class Filter */}
                    {isStudentList && (
                        <select
                            value={selectedClass}
                            onChange={(e) => { setSelectedClass(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                        >
                            <option value="">Tất cả lớp hành chính</option>
                            {studentClassOptions.map((klass) => (
                                <option key={klass.code} value={klass.code}>
                                    {klass.code}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Status Filter */}
                    <select
                        value={selectedStatus}
                        onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                    >
                        <option value="">Tất cả trạng thái</option>
                        <option value="active">Hoạt động</option>
                        <option value="locked">Bị khóa</option>
                        <option value="inactive">Tạm dừng</option>
                        <option value="pending_reset">Chờ đổi mật khẩu</option>
                        <option value="expired">Hết hạn</option>
                    </select>
                </div>
            </div>

            {/* User Table card */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12">
                        <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-blue text-sm font-medium">Đang tải danh sách người dùng...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-platinum-tint bg-cloud-mist/50">
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Hồ sơ</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">{isStudentList ? 'Mã sinh viên' : 'Số điện thoại'}</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">{isStudentList ? 'Lớp hành chính' : 'Phòng ban'}</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Vai trò</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase whitespace-nowrap">Trạng thái</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase text-right whitespace-nowrap">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usersList.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-12 text-center text-slate-blue text-sm">
                                            Không tìm thấy người dùng phù hợp.
                                        </td>
                                    </tr>
                                ) : (
                                    usersList.map((baseUser) => {
                                        const detailedUser = usersMap[baseUser.id] || {};
                                        const user = { ...baseUser, ...detailedUser };
                                        return (
                                            <tr key={user.id} className="border-b border-platinum-tint/40 hover:bg-cloud-mist/30 transition-colors">
                                                <td className="py-4 px-6 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <UserAvatar
                                                            user={user}
                                                            className="w-10 h-10 rounded-full shrink-0 font-bold text-sm"
                                                        />

                                                        <div>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <h4
                                                                    onClick={() => handleViewDetail(user)}
                                                                    className="text-sm font-bold text-midnight-indigo leading-tight cursor-pointer hover:underline hover:text-action-blue"
                                                                >
                                                                    {user.fullName}
                                                                </h4>
                                                                {isPartnerAccount(user) && (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                                                                        Đối tác
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-blue leading-normal">{user.email}</p>
                                                            {isPartnerAccount(user) && user.accountExpiresAt && (
                                                                <p className={`text-[10px] font-medium mt-0.5 ${
                                                                    getExpiryStatus(user.accountExpiresAt) === 'expired' ? 'text-red-500' :
                                                                    getExpiryStatus(user.accountExpiresAt) === 'expiring_soon' ? 'text-amber-600' :
                                                                    'text-green-600'
                                                                }`}>
                                                                    {getExpiryLabel(user.accountExpiresAt)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-sm text-slate-blue whitespace-nowrap">
                                                    {isStudentList
                                                        ? (user.studentCode || user.employeeCode || 'Chưa có')
                                                        : (user.phoneNumber || user.phone || 'Chưa cung cấp')}
                                                </td>
                                                <td className="py-4 px-6 text-sm text-midnight-indigo font-medium whitespace-nowrap">
                                                    {isStudentList
                                                        ? (user.administrativeClass || user.className || 'Chưa có lớp')
                                                        : (() => {
                                                            const deptId = user.departmentId || (user.departments && user.departments[0]?.id) || (user.department?.id);
                                                            const dept = departments.find(d => d.id === deptId || d.uuid === deptId);
                                                            return dept ? dept.name || dept.roomName || dept.departmentName : 'Chưa phân bổ';
                                                        })()}
                                                </td>
                                                <td className="py-4 px-6 whitespace-nowrap">
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.leadershipTitle ? (
                                                            // BGH mang role MANAGER nhưng hiển thị theo chức danh lãnh đạo
                                                            <span className="inline-flex text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-bold">
                                                                {getLeaderRoleLabel(user)}
                                                            </span>
                                                        ) : user.roles?.map((r, idx) => {
                                                            // user.roles có thể là string[] roleCode (ManageUserItemDto, danh sách)
                                                            // hoặc object[] {id, roleCode, roleName} (UserDetailResponseDto, chi tiết).
                                                            return (
                                                                <span key={idx} className="inline-flex text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">
                                                                    {formatRoleLabel(r, roles)}
                                                                </span>
                                                            );
                                                        }) || <span className="text-xs text-steel-gray">Chưa phân quyền</span>}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(user.accountStatus === 'locked' || user.locked) ? 'bg-red-50 text-red-700' :
                                                        isAccountExpired(user) ? 'bg-orange-50 text-orange-700' :
                                                            user.accountStatus === 'inactive' ? 'bg-slate-100 text-slate-600' :
                                                                user.accountStatus === 'pending_reset' ? 'bg-amber-50 text-amber-700' :
                                                                    'bg-green-50 text-green-700'
                                                        }`}>
                                                        {(user.accountStatus === 'locked' || user.locked) ? 'Bị khóa' :
                                                            isAccountExpired(user) ? 'Hết hạn' :
                                                                user.accountStatus === 'inactive' ? 'Tạm dừng' :
                                                                    user.accountStatus === 'pending_reset' ? 'Chờ đổi mk' :
                                                                        'Hoạt động'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                                                    {!isSystemAdminMode && isPartnerAccount(user) && (
                                                        <button
                                                            onClick={() => openExpiryModal(user)}
                                                            title="Gia hạn / Khoá sớm tài khoản đối tác"
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-amber-600 hover:bg-amber-50 hover:text-amber-700 text-xs font-semibold transition-colors border border-amber-200"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            Gia hạn
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleViewDetail(user)}
                                                        title="Xem chi tiết hồ sơ"
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleViewLogs(user)}
                                                        title="Xem nhật ký lịch sử"
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        title={isSystemAdminMode ? 'Gán vai trò' : 'Chỉnh sửa thông tin'}
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleLockToggle(user)}
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
                                                    {(user.accountStatus === 'active' || user.accountStatus === 'inactive') && (
                                                        <button
                                                            onClick={() => handleStatusToggle(user)}
                                                            title={user.accountStatus === 'inactive' ? 'Kích hoạt tài khoản' : 'Tạm dừng tài khoản'}
                                                            className={`inline-flex p-1.5 rounded-lg transition-colors ${user.accountStatus === 'inactive'
                                                                ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                                                                : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'
                                                            }`}
                                                        >
                                                            {user.accountStatus === 'inactive' ? (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteUser(user)}
                                                        title="Xóa vĩnh viễn"
                                                        className="inline-flex p-1.5 rounded-lg text-slate-blue hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination footer */}
                {!loading && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                        <span className="text-xs text-slate-blue">
                            Hiển thị {usersList.length} trên tổng số {totalUsers} người dùng
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

            {/* CREATE MODAL */}
            {isCreateModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-lg w-full overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
                            <h3 className="font-bold text-midnight-indigo">
                                {formData.accountType === 'partner' ? 'Tạo tài khoản đối tác' : 'Tạo người dùng mới'}
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto">

                            {/* Account type toggle */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-2">Loại tài khoản</label>
                                <div className="flex rounded-xl border border-platinum-tint overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => { setFormData(p => ({ ...p, accountType: 'employee' })); setFormErrors({}); }}
                                        className={`flex-1 py-2 text-sm font-semibold transition-colors ${formData.accountType === 'employee' ? 'bg-action-blue text-white' : 'bg-white text-slate-blue hover:bg-cloud-mist'}`}
                                    >
                                        Nhân viên
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const employeeRole = roles.find(r => r.roleCode === 'EMPLOYEE');
                                            setFormData(p => ({ ...p, accountType: 'partner', roleIds: employeeRole ? [employeeRole.id] : p.roleIds }));
                                            setFormErrors({});
                                        }}
                                        className={`flex-1 py-2 text-sm font-semibold transition-colors border-l border-platinum-tint ${formData.accountType === 'partner' ? 'bg-amber-500 text-white' : 'bg-white text-slate-blue hover:bg-cloud-mist'}`}
                                    >
                                        Đối tác
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.fullName ? 'text-red-500' : 'text-slate-blue'}`}>Họ và Tên <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => { setFormData({ ...formData, fullName: e.target.value }); setFormErrors({ ...formErrors, fullName: '' }); }}
                                    placeholder="Ví dụ: Nguyễn Văn A"
                                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none ${formErrors.fullName ? 'border-red-500 focus:border-red-500 bg-red-50' : 'border-platinum-tint focus:border-action-blue'}`}
                                />
                                {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                            </div>
                            <div>
                                <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.email ? 'text-red-500' : 'text-slate-blue'}`}>Email <span className="text-red-500">*</span></label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors({ ...formErrors, email: '' }); }}
                                    placeholder={formData.accountType === 'partner' ? 'doitac@congty-x.com' : 'email@smrmpts.com'}
                                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none ${formErrors.email ? 'border-red-500 focus:border-red-500 bg-red-50' : 'border-platinum-tint focus:border-action-blue'}`}
                                />
                                {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                                {formData.accountType === 'partner' && (
                                    <p className="text-xs text-amber-600 mt-1">Mật khẩu ban đầu = email này. Nên đặt hạn ngắn.</p>
                                )}
                            </div>

                            {/* Employee-only: phone + department */}
                            {formData.accountType === 'employee' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Số điện thoại</label>
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="09xxxxxxxx"
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                        />
                                    </div>
                                    {isStudentRoleSelected ? (
                                        <div>
                                            <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.administrativeClass ? 'text-red-500' : 'text-slate-blue'}`}>Lớp hành chính <span className="text-red-500">*</span></label>
                                            <select
                                                value={formData.administrativeClass}
                                                onChange={(e) => { setFormData({ ...formData, administrativeClass: e.target.value }); setFormErrors({ ...formErrors, administrativeClass: '' }); }}
                                                className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none bg-white ${formErrors.administrativeClass ? 'border-red-500 focus:border-red-500 bg-red-50' : 'border-platinum-tint focus:border-action-blue'}`}
                                            >
                                                <option value="">Chọn lớp hành chính...</option>
                                                {studentClassOptions.map((klass) => (
                                                    <option key={klass.code} value={klass.code}>
                                                        {klass.code}
                                                    </option>
                                                ))}
                                            </select>
                                            {formErrors.administrativeClass && <p className="text-red-500 text-xs mt-1">{formErrors.administrativeClass}</p>}
                                        </div>
                                    ) : (
                                        <div>
                                            <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.departmentId ? 'text-red-500' : 'text-slate-blue'}`}>Phòng ban <span className="text-red-500">*</span></label>
                                            <select
                                                value={formData.departmentId}
                                                onChange={(e) => { setFormData({ ...formData, departmentId: e.target.value }); setFormErrors({ ...formErrors, departmentId: '' }); }}
                                                className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none bg-white ${formErrors.departmentId ? 'border-red-500 focus:border-red-500 bg-red-50' : 'border-platinum-tint focus:border-action-blue'}`}
                                            >
                                                <option value="">Chọn phòng ban...</option>
                                                {departments.filter(d => d.id !== PARTNER_DEPARTMENT_ID).map(d => (
                                                    <option key={d.id} value={d.id}>{d.departmentName}</option>
                                                ))}
                                            </select>
                                            {formErrors.departmentId && <p className="text-red-500 text-xs mt-1">{formErrors.departmentId}</p>}
                                        </div>
                                    )}
                                </>
                            )}

                            {formData.accountType !== 'partner' && (
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.roleIds ? 'text-red-500' : 'text-slate-blue'}`}>Gán vai trò <span className="text-red-500">*</span></label>
                                    <div className="space-y-2 mt-1">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 text-sm text-midnight-indigo font-medium cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.roleIds.includes(r.id)}
                                                    onChange={() => { handleRoleCheckboxChange(r.id); setFormErrors({ ...formErrors, roleIds: '' }); }}
                                                    className="rounded text-action-blue focus:ring-action-blue"
                                                />
                                                {formatRoleLabel(r, roles)}
                                            </label>
                                        ))}
                                    </div>
                                    {formErrors.roleIds && <p className="text-red-500 text-xs mt-1">{formErrors.roleIds}</p>}
                                </div>
                            )}

                            {/* Partner-only fields */}
                            {formData.accountType === 'partner' && (
                                <div className="border border-amber-200 rounded-xl p-4 space-y-4 bg-amber-50/40">
                                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Thông tin đối tác</p>

                                    <div>
                                        <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.accountExpiresAt ? 'text-red-500' : 'text-slate-blue'}`}>
                                            Ngày hết hạn tài khoản <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative z-30">
                                                <DatePicker
                                                    selected={expiryPickerDate}
                                                    onChange={handleExpiryPickerDate}
                                                    minDate={new Date(Date.now() + 60000)}
                                                    locale={vi}
                                                    dateFormat="dd/MM/yyyy"
                                                    placeholderText="DD/MM/YYYY"
                                                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none ${formErrors.accountExpiresAt ? 'border-red-500 bg-red-50' : 'border-platinum-tint focus:border-action-blue'} bg-white`}
                                                    wrapperClassName="w-full"
                                                />
                                            </div>
                                            <div className="w-[130px]">
                                                <TimePicker
                                                    value={expiryPickerTime}
                                                    onChange={handleExpiryPickerTime}
                                                    placeholder="23:59"
                                                />
                                            </div>
                                        </div>
                                        {formErrors.accountExpiresAt && <p className="text-red-500 text-xs mt-1">{formErrors.accountExpiresAt}</p>}
                                    </div>

                                    <div>
                                        <label className={`block text-xs font-bold uppercase mb-1 ${formErrors.avatarFile ? 'text-red-500' : 'text-slate-blue'}`}>
                                            Ảnh khuôn mặt (sinh trắc học) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            ref={avatarInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0] || null;
                                                setFormData({ ...formData, avatarFile: f });
                                                setFormErrors({ ...formErrors, avatarFile: '' });
                                            }}
                                            className="w-full text-sm text-slate-blue file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-platinum-tint file:text-xs file:font-semibold file:bg-white file:text-slate-blue hover:file:bg-cloud-mist"
                                        />
                                        <p className="text-[10px] text-slate-blue mt-1">JPEG / PNG / WEBP · Tối đa 5MB · Ảnh rõ mặt, không đeo kính đen</p>
                                        {formErrors.avatarFile && <p className="text-red-500 text-xs mt-1">{formErrors.avatarFile}</p>}
                                    </div>

                                    {/* Biển số xe (tuỳ chọn) */}
                                    <div className="border-t border-amber-200 pt-3">
                                        <p className="text-xs font-bold text-slate-blue uppercase mb-2">Biển số xe (tuỳ chọn)</p>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-[10px] text-slate-blue mb-1">Biển số</label>
                                                <input
                                                    type="text"
                                                    value={formData.plateRaw}
                                                    onChange={(e) => setFormData({ ...formData, plateRaw: e.target.value.toUpperCase() })}
                                                    placeholder="VD: 51A-12345"
                                                    maxLength={20}
                                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue uppercase"
                                                />
                                            </div>
                                            <div className="w-28">
                                                <label className="block text-[10px] text-slate-blue mb-1">Loại xe</label>
                                                <select
                                                    value={formData.vehicleType}
                                                    onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                                                    className="w-full px-2 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                                >
                                                    <option value="CAR">Ô tô</option>
                                                    <option value="MOTORBIKE">Xe máy</option>
                                                    <option value="TRUCK">Xe tải</option>
                                                    <option value="OTHER">Khác</option>
                                                </select>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-blue mt-1">Để trống nếu chưa cần đăng ký. Có thể thêm sau trong mục ANPR.</p>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors ${formData.accountType === 'partner' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-action-blue hover:bg-glacier-blue'}`}
                                >
                                    {formData.accountType === 'partner' ? 'Tạo tài khoản đối tác' : 'Tạo mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* EXPIRY MODAL — gia hạn / khoá sớm tài khoản đối tác */}
            {isExpiryModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-sm w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-amber-50/60">
                            <div>
                                <h3 className="font-bold text-midnight-indigo">Gia hạn / Khoá sớm</h3>
                                <p className="text-xs text-amber-700 mt-0.5">{expiryTargetUser?.fullName}</p>
                            </div>
                            <button onClick={() => setIsExpiryModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {expiryTargetUser?.accountExpiresAt && (
                                <div className="flex items-center gap-2 text-xs text-slate-blue bg-cloud-mist/60 border border-platinum-tint rounded-xl px-3 py-2">
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Hạn hiện tại: <strong className="text-midnight-indigo">{new Date(expiryTargetUser.accountExpiresAt).toLocaleString('vi-VN')}</strong></span>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Hạn mới</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative z-30">
                                        <DatePicker
                                            selected={newExpiryDateObj}
                                            onChange={handleNewExpiryDateChange}
                                            minDate={new Date()}
                                            locale={vi}
                                            dateFormat="dd/MM/yyyy"
                                            placeholderText="DD/MM/YYYY"
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                            wrapperClassName="w-full"
                                        />
                                    </div>
                                    <div className="w-[130px]">
                                        <TimePicker
                                            value={newExpiryTimeStr}
                                            onChange={handleNewExpiryTimeChange}
                                            placeholder="23:59"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-platinum-tint">
                                <button
                                    type="button"
                                    disabled={expiryLoading}
                                    onClick={() => handleExpiryUpdate(true)}
                                    className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                                >
                                    Khoá ngay
                                </button>
                                <div className="flex-1"></div>
                                <button
                                    type="button"
                                    onClick={() => setIsExpiryModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    disabled={expiryLoading || !newExpiryDateObj}
                                    onClick={() => handleExpiryUpdate(false)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {expiryLoading ? 'Đang lưu...' : 'Cập nhật hạn'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* EDIT MODAL */}
            {isEditModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">{isSystemAdminMode ? 'Gán vai trò' : 'Chỉnh sửa thông tin'}</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Email</label>
                                <input
                                    type="email"
                                    disabled
                                    value={formData.email}
                                    className="w-full px-3 py-2 border border-platinum-tint/50 bg-cloud-mist rounded-xl text-sm text-slate-blue cursor-not-allowed focus:outline-none"
                                />
                            </div>
                            {!isSystemAdminMode && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Họ và Tên <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Số điện thoại</label>
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Phòng ban</label>
                                        <select
                                            value={formData.departmentId}
                                            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                        >
                                            <option value="">Chọn phòng ban...</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={d.id}>{d.departmentName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="pt-3 border-t border-platinum-tint">
                                        <p className="text-xs font-bold text-slate-blue uppercase mb-2">Vai trò lịch họp</p>
                                        <label className={`flex items-start gap-2 text-sm font-medium ${formData.departmentId ? 'text-midnight-indigo cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                                            <input
                                                type="checkbox"
                                                checked={!!formData.isUnitClerk}
                                                disabled={!formData.departmentId || !calendarRoleOrig}
                                                onChange={(e) => setFormData({ ...formData, isUnitClerk: e.target.checked })}
                                                className="mt-0.5 rounded text-action-blue focus:ring-action-blue"
                                            />
                                            <span>
                                                Văn thư đơn vị
                                                <span className="block text-xs font-normal text-slate-blue">
                                                    {formData.departmentId
                                                        ? `Là văn thư của: ${departments.find(d => d.id === formData.departmentId)?.departmentName || ''}`
                                                        : 'Cần chọn phòng ban trước'}
                                                </span>
                                            </span>
                                        </label>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mt-3 mb-1">Ban Giám hiệu</label>
                                        <select
                                            value={formData.leadershipTitle || ''}
                                            disabled={!calendarRoleOrig}
                                            onChange={(e) => setFormData({ ...formData, leadershipTitle: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white disabled:bg-cloud-mist"
                                        >
                                            <option value="">Không</option>
                                            <option value="HIEU_TRUONG">Hiệu trưởng</option>
                                            <option value="PHO_HIEU_TRUONG">Phó Hiệu trưởng</option>
                                            <option value="BI_THU">Bí thư Đảng ủy</option>
                                            <option value="PHO_BI_THU">Phó Bí thư Đảng ủy</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            {isSystemAdminMode && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Vai trò</label>
                                    <div className="space-y-2 mt-1">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 text-sm text-midnight-indigo font-medium cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.roleIds.includes(r.id)}
                                                    onChange={() => handleRoleCheckboxChange(r.id)}
                                                    className="rounded text-action-blue focus:ring-action-blue"
                                                />
                                                {formatRoleLabel(r, roles)}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
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

            {/* IMPORT MODAL — 2-tab component */}
            <ImportAccountsModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={fetchUsers}
            />


            {/* USER LOGS MODAL */}
            {isLogsModalOpen && selectedUser && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-lg w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <div>
                                <h3 className="font-bold text-midnight-indigo">Lịch sử hoạt động</h3>
                                <p className="text-[10px] text-slate-blue mt-0.5">{selectedUser.fullName} ({selectedUser.email})</p>
                            </div>
                            <button onClick={() => setIsLogsModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6">
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
                                    onClick={() => setIsLogsModalOpen(false)}
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

            {/* DETAIL MODAL (UC-AM-10) */}
            {isDetailModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-2xl w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Chi tiết hồ sơ tài khoản</h3>
                            <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {detailLoading || !selectedUserDetail ? (
                            <div className="p-12 flex flex-col items-center justify-center">
                                <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-slate-blue text-sm">Đang tải chi tiết...</p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                                {/* Top header summary */}
                                <div className="flex items-center gap-4 bg-cloud-mist/55 p-4 rounded-xl border border-platinum-tint/50">
                                    <UserAvatar
                                        user={selectedUserDetail}
                                        className="w-16 h-16 rounded-full shrink-0 font-extrabold text-xl"
                                    />
                                    <div>
                                        <h4 className="text-lg font-bold text-midnight-indigo leading-tight">{selectedUserDetail.fullName}</h4>
                                        <p className="text-sm text-slate-blue mt-0.5">{selectedUserDetail.email}</p>
                                        <div className="flex gap-1.5 mt-1 flex-wrap">
                                            {selectedUserDetail.roles?.map((r, idx) => {
                                                return (
                                                    <span key={idx} className="text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded-full font-bold">
                                                        {formatRoleLabel(r, roles)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* 1. Personal Information */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin cá nhân</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">{hasRole(selectedUserDetail, 'STUDENT') ? 'Mã sinh viên:' : 'Mã nhân viên:'}</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {hasRole(selectedUserDetail, 'STUDENT')
                                                        ? selectedUserDetail.studentProfile?.studentCode || selectedUserDetail.studentCode || selectedUserDetail.employeeCode || 'Chưa thiết lập'
                                                        : selectedUserDetail.employeeCode || 'Chưa thiết lập'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">Số điện thoại:</span>
                                                <span className="font-semibold text-midnight-indigo">{selectedUserDetail.phoneNumber || 'Chưa cung cấp'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Organization Structure */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Cấu trúc tổ chức</h4>
                                        <div className="space-y-2 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">{hasRole(selectedUserDetail, 'STUDENT') ? 'Lớp hành chính:' : 'Phòng ban:'}</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {hasRole(selectedUserDetail, 'STUDENT') ? (
                                                        selectedUserDetail.studentProfile?.administrativeClass
                                                        || selectedUserDetail.administrativeClass
                                                        || selectedUserDetail.classSections?.[0]?.classCode
                                                        || selectedUserDetail.studentProfile?.classSections?.[0]?.classCode
                                                        || 'Chưa có lớp'
                                                    ) : (() => {
                                                        const deptId = selectedUserDetail.departmentId || (selectedUserDetail.departments && selectedUserDetail.departments[0]?.id) || (selectedUserDetail.department?.id);
                                                        const dept = departments.find(d => d.id === deptId || d.uuid === deptId);
                                                        return dept ? dept.name || dept.roomName || dept.departmentName : 'Chưa phân bổ';
                                                    })()}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">{hasRole(selectedUserDetail, 'STUDENT') ? 'Ngành / Khóa:' : 'Chức danh / Vị trí:'}</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {hasRole(selectedUserDetail, 'STUDENT')
                                                        ? [
                                                            selectedUserDetail.studentProfile?.major || selectedUserDetail.major,
                                                            selectedUserDetail.studentProfile?.cohort || selectedUserDetail.cohort,
                                                        ].filter(Boolean).join(' - ') || 'Chưa thiết lập'
                                                        : selectedUserDetail.positionTitle || 'Chưa thiết lập'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-blue block text-xs">{hasRole(selectedUserDetail, 'STUDENT') ? 'Giáo viên chủ nhiệm:' : 'Quản lý trực tiếp:'}</span>
                                                <span className="font-semibold text-midnight-indigo">
                                                    {hasRole(selectedUserDetail, 'STUDENT')
                                                        ? selectedUserDetail.studentProfile?.homeroomTeacher?.fullName
                                                            || selectedUserDetail.studentProfile?.classSections?.find(item => item?.lecturerName)?.lecturerName
                                                            || selectedUserDetail.classSections?.find(item => item?.lecturerName)?.lecturerName
                                                            || 'Chưa phân công'
                                                        : selectedUserDetail.directManager?.fullName || 'Không có'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. System Information */}
                                    <div className="md:col-span-2 space-y-3">
                                        <h4 className="text-xs font-bold text-midnight-indigo uppercase tracking-wider border-b border-platinum-tint/60 pb-1.5">Thông tin hệ thống</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-slate-blue block text-xs">Trạng thái hoạt động:</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${(selectedUserDetail.accountStatus === 'locked' || selectedUserDetail.locked) ? 'bg-red-50 text-red-700' :
                                                    isAccountExpired(selectedUserDetail) ? 'bg-orange-50 text-orange-700' :
                                                        selectedUserDetail.accountStatus === 'inactive' ? 'bg-slate-100 text-slate-600' :
                                                            selectedUserDetail.accountStatus === 'pending_reset' ? 'bg-amber-50 text-amber-700' :
                                                                'bg-green-50 text-green-700'
                                                    }`}>
                                                    {(selectedUserDetail.accountStatus === 'locked' || selectedUserDetail.locked) ? 'Bị khóa' :
                                                        isAccountExpired(selectedUserDetail) ? 'Hết hạn' :
                                                            selectedUserDetail.accountStatus === 'inactive' ? 'Tạm dừng' :
                                                                selectedUserDetail.accountStatus === 'pending_reset' ? 'Chờ đổi mật khẩu' :
                                                                    'Hoạt động'}
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
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${selectedUserDetail.biometricReviewStatus === 'approved' ? 'bg-green-50 text-green-700' :
                                                        selectedUserDetail.biometricReviewStatus === 'pending_review' ? 'bg-amber-50 text-amber-700' :
                                                            selectedUserDetail.biometricReviewStatus === 'rejected' ? 'bg-red-50 text-red-700' :
                                                                'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {selectedUserDetail.biometricReviewStatus === 'approved' ? 'Đã hợp lệ' :
                                                            selectedUserDetail.biometricReviewStatus === 'pending_review' ? 'Đang chờ duyệt' :
                                                                selectedUserDetail.biometricReviewStatus === 'rejected' ? 'Bị từ chối' :
                                                                    'Chưa nộp ảnh'}
                                                    </span>
                                                    {selectedUserDetail.biometricReviewStatus === 'approved' && (
                                                        <button
                                                            type="button"
                                                            disabled={isResyncing}
                                                            onClick={() => handleResyncPortrait(selectedUserDetail.id)}
                                                            className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title="Yêu cầu hệ thống đồng bộ lại nhận diện khuôn mặt cho thiết bị"
                                                        >
                                                            <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin' : ''}`} />
                                                            Đồng bộ lại
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {isPartnerAccount(selectedUserDetail) && selectedUserDetail.accountExpiresAt && (
                                                <div>
                                                    <span className="text-slate-blue block text-xs">Hạn sử dụng tài khoản:</span>
                                                    <span className={`font-semibold block mt-1 ${
                                                        getExpiryStatus(selectedUserDetail.accountExpiresAt) === 'expired' ? 'text-red-600' :
                                                        getExpiryStatus(selectedUserDetail.accountExpiresAt) === 'expiring_soon' ? 'text-amber-600' :
                                                        'text-midnight-indigo'
                                                    }`}>
                                                        {new Date(selectedUserDetail.accountExpiresAt).toLocaleString('vi-VN')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* AF1 Action Shortcuts */}
                                <div className="pt-4 flex justify-between items-center border-t border-platinum-tint mt-6">
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsDetailModalOpen(false);
                                                openEditModal(selectedUserDetail);
                                            }}
                                            className="px-3 py-1.5 border border-platinum-tint bg-white text-action-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            {isSystemAdminMode ? 'Gán vai trò' : 'Chỉnh sửa'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsDetailModalOpen(false);
                                                handleLockToggle(selectedUserDetail);
                                            }}
                                            className={`px-3 py-1.5 border rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 ${(selectedUserDetail.accountStatus === 'locked' || selectedUserDetail.locked)
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
                                                setIsDetailModalOpen(false);
                                                handleViewLogs(selectedUserDetail);
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
                                        onClick={() => setIsDetailModalOpen(false)}
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
    );
};

// Row-level import failure reasons — see ImportAccountRowReason in
// capstone-be/src/modules/accounts/constants/import-accounts.constants.ts



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

export default UserManagement;
