import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { logout, getCurrentUser } from '../../../service/authService';
import logo from '../../../assets/images/logo.png';
import BiometricReminderModal from '../../../components/biometric/BiometricReminderModal';
import ChangePasswordModal from '../../../components/auth/ChangePasswordModal';
import BusinessAdminSidebar from './BusinessAdminSidebar';
import { RiMenuLine } from 'react-icons/ri';
import {
    Activity,
    Home,
    Layers,
    Monitor,
    Video,
    Users,
    Briefcase,
    BarChart2,
    PieChart,
    Clock,
    Fingerprint,
    Flame,
    GraduationCap,
} from 'lucide-react';

const STATIC_NAVIGATION_ITEMS = [
    {
        label: 'Tổng quan',
        to: '/business-admin',
        end: true,
        icon: Home
    },
    {
        label: 'Quản lý',
        isDropdown: true,
        icon: Layers,
        children: [
            { label: 'Phòng họp', to: '/business-admin/rooms', icon: Video },
            { label: 'Người dùng', to: '/business-admin/users', icon: Users },
            { label: 'Phòng ban', to: '/business-admin/departments', icon: Briefcase },
            { label: 'Trang thiết bị', to: '/business-admin/equipments', icon: Monitor },
            { label: 'Duyệt ảnh sinh trắc học', to: '/business-admin/biometric-submissions', icon: Fingerprint },
        ],
    },
    {
        label: 'Báo cáo',
        isDropdown: true,
        icon: BarChart2,
        children: [
            { label: 'Hiệu suất phòng họp', to: '/business-admin/room-analytics', icon: PieChart },
            { label: 'Lưu lượng & Heatmap', to: '/business-admin/zone-traffic', icon: Flame },
            { label: 'Tỷ lệ đúng giờ', to: '/business-admin/attendance-analytics', icon: Clock },
            { label: 'Chuyên cần phòng ban', to: '/business-admin/meeting-attendance', icon: Activity },
            { label: 'Chuyên cần lớp học', to: '/business-admin/class-attendance', icon: GraduationCap },
        ],
    },
];

const BusinessAdminLayout = () => {
    const [isSidebarMini, setIsSidebarMini]               = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen]   = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [currentUser, setCurrentUser]                   = useState(null);

    const navigate = useNavigate();
    const navigationItems = STATIC_NAVIGATION_ITEMS;

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
        navigate('/business-admin/profile');
    }, [navigate]);

    const handleChangePassword = useCallback(() => {
        setIsChangePasswordOpen(true);
    }, []);

    const displayName = currentUser?.fullName || 'Quản trị viên';

    return (
        <div className="flex h-screen overflow-hidden bg-cloud-mist">

            {/* ══ SIDEBAR ══ */}
            <BusinessAdminSidebar
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

export default BusinessAdminLayout;
