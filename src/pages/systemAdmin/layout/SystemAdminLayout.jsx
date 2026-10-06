import { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
    RiHome4Line,
    RiSettings3Line, RiShieldLine, RiSettings2Line,
    RiCpuLine, RiHardDriveLine, RiMapLine,
    RiLoginBoxLine, RiCameraLine, RiCarLine, RiMapPinLine,
    RiAlertLine, RiMapPin2Line, RiEqualizerLine, RiShieldUserLine,
    RiFileTextLine, RiMenuLine, RiFileListLine, RiFireLine
} from 'react-icons/ri';

import { logout, getCurrentUser } from '../../../service/authService';
import logo from '../../../assets/images/logo.png';
import BiometricReminderModal from '../../../components/biometric/BiometricReminderModal';
import ChangePasswordModal from '../../../components/auth/ChangePasswordModal';
import { buildDynamicNavigation, filterStaticNavigation } from '../../../utils/buildDynamicNavigation';
import SystemAdminSidebar from './SystemAdminSidebar';

const STATIC_NAVIGATION_ITEMS = [
    {
        label: 'Bảng điều khiển',
        to: '/system-admin',
        end: true,
        icon: RiHome4Line,
    },
    {
        label: 'Hệ thống',
        isDropdown: true,
        icon: RiSettings3Line,
        children: [
            { label: 'Vai trò & Phân quyền',  to: '/system-admin/roles-permissions', icon: RiShieldLine },
            { label: 'Cấu hình hệ thống',     to: '/system-admin/settings',           icon: RiSettings2Line },
            { label: 'Nhật ký kiểm toán',     to: '/system-admin/audit-logs',         icon: RiFileListLine },
            { label: 'Quy tắc cảnh báo',      to: '/system-admin/alert-rules',        icon: RiEqualizerLine },
        ],
    },
    {
        label: 'Hạ tầng',
        isDropdown: true,
        icon: RiCpuLine,
        children: [
            { label: 'Thiết bị IoT',                  to: '/system-admin/devices',              icon: RiHardDriveLine },
            { label: 'Khu vực giám sát',              to: '/system-admin/zones',                icon: RiMapLine },
            { label: 'Lưu lượng & Heatmap',           to: '/system-admin/zone-traffic',         icon: RiFireLine },
            { label: 'Nhật ký ra/vào phòng',          to: '/system-admin/room-access-logs',     icon: RiLoginBoxLine },
        ],
    },
    {
        label: 'An ninh',
        isDropdown: true,
        icon: RiShieldUserLine,
        children: [
            { label: 'Kiểm soát ra vào cổng',         to: '/system-admin/anpr-management',      icon: RiCameraLine },
            { label: 'Danh sách biển số giám sát',    to: '/system-admin/vehicle-control-list', icon: RiCarLine },
            { label: 'Đăng ký phương tiện',           to: '/system-admin/vehicle-registrations',icon: RiFileTextLine },
            { label: 'Hành trình khuôn viên',         to: '/system-admin/user-journey',         icon: RiMapPinLine },
            { label: 'Cảnh báo an ninh',              to: '/system-admin/security-alerts',      icon: RiAlertLine },
            { label: 'Bản đồ khuôn viên',             to: '/system-admin/campus-map',           icon: RiMapPin2Line },
        ],
    },
];

const SystemAdminLayout = () => {
    const [isSidebarMini, setIsSidebarMini]               = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen]   = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [currentUser, setCurrentUser]                   = useState(null);

    const navigate = useNavigate();

    const navigationItems = useMemo(
        () => [...filterStaticNavigation(STATIC_NAVIGATION_ITEMS), ...buildDynamicNavigation('system-admin')],
        [],
    );

    // Load + refresh user
    useEffect(() => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) setCurrentUser(JSON.parse(userStr));
        } catch { /* silent */ }

        getCurrentUser().then(res => {
            if (Array.isArray(res?.data?.permissions)) {
                const userStr = localStorage.getItem('user');
                const user    = userStr ? JSON.parse(userStr) : {};
                const updated = { ...user, permissions: res.data.permissions };
                localStorage.setItem('user', JSON.stringify(updated));
                setCurrentUser(updated);
            }
        }).catch(() => {});
    }, []);

    const handleLogout = useCallback(async () => {
        try { await logout(); } catch { /* silent */ } finally {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    const handleProfile = useCallback(() => {
        navigate('/system-admin/profile');
    }, [navigate]);

    const handleChangePassword = useCallback(() => {
        setIsChangePasswordOpen(true);
    }, []);

    const displayName = currentUser?.fullName || 'Quản trị viên';

    return (
        <div className="flex h-screen overflow-hidden bg-cloud-mist">

            {/* ══ SIDEBAR ══ */}
            <SystemAdminSidebar
                navigationItems={navigationItems}
                isMini={isSidebarMini}
                onToggle={() => setIsSidebarMini(v => !v)}
                isMobileOpen={isMobileSidebarOpen}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
                logo={logo}
                currentUser={currentUser}
                displayName={displayName}
                onProfile={handleProfile}
                onChangePassword={handleChangePassword}
                onLogout={handleLogout}
            />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* ══ MOBILE TOPBAR ══ */}
                <header className="lg:hidden flex items-center justify-between bg-white border-b border-platinum-tint px-4 py-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <img src={logo} alt="Logo" className="w-8 h-8 object-contain" />
                        <span className="font-bold text-midnight-indigo tracking-tight">SmarTracking</span>
                    </div>
                    <button 
                        onClick={() => setIsMobileSidebarOpen(true)} 
                        className="p-2 -mr-2 text-slate-blue hover:text-midnight-indigo rounded-lg hover:bg-cloud-mist transition-colors"
                        aria-label="Mở menu"
                    >
                        <RiMenuLine className="w-6 h-6" />
                    </button>
                </header>

                {/* ══ MAIN AREA ══ */}
                <main className="flex-1 min-w-0 overflow-y-auto">
                    <div className="p-4 md:p-6">
                        <Outlet />
                    </div>
                <BiometricReminderModal />
                <ChangePasswordModal
                    isOpen={isChangePasswordOpen}
                    onClose={() => setIsChangePasswordOpen(false)}
                />
                </main>
            </div>
        </div>
    );
};

export default SystemAdminLayout;
