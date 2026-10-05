import { Activity, Archive, BarChart2, Calendar, ChevronDown, Clock, Car, FileCheck, FileText, Flame, Home, MapPin, Monitor, PlusCircle, Menu, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { logout, getCurrentUser } from '../../../service/authService';
import logo from '../../../assets/images/logo.png';
import BiometricReminderModal from '../../../components/biometric/BiometricReminderModal';
import UserAvatar from '../../../components/common/UserAvatar';
import ChangePasswordModal from '../../../components/auth/ChangePasswordModal';
import NotificationBell from '../../../components/common/NotificationBell';
import { buildDynamicNavigation, filterStaticNavigation } from '../../../utils/buildDynamicNavigation';


const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

const STATIC_NAVIGATION_ITEMS = [
    {
        label: 'Trang chủ',
        to: '/manager',
        end: true,
        icon: Home,
    },
    {
        label: 'Cuộc họp',
        isDropdown: true,
        icon: Calendar,
        children: [
            {
                label: 'Lịch cá nhân',
                to: '/manager/schedule',
                icon: Calendar,
                requiredPermission: 'schedule.read.self',
            },
            {
                label: 'Đăng ký họp',
                to: '/manager/book',
                icon: PlusCircle,
            },
            {
                label: 'Phê duyệt cuộc họp',
                to: '/manager/meeting-approvals',
                icon: FileCheck,
                requiredPermission: 'meeting_request.read',
            },
            {
                label: 'Kho biên bản',
                to: '/manager/minutes',
                icon: Archive,
            },
        ],
    },
    {
        label: 'Tài liệu họp',
        to: '/manager/recordings',
        icon: FileText,
    },
    {
        label: 'Báo hỏng thiết bị',
        to: '/manager/equipments',
        icon: Monitor,
    },
    {
        label: 'Hành trình',
        to: '/manager/user-journey',
        icon: MapPin,
    },
    {
        label: 'Báo cáo',
        isDropdown: true,
        icon: BarChart2,
        children: [
            {
                label: 'Tỷ lệ đúng giờ',
                to: '/manager/attendance-analytics',
                icon: Clock,
            },
            {
                label: 'Chuyên cần phòng ban',
                to: '/manager/meeting-attendance',
                icon: Activity,
            },
            {
                label: 'Lưu lượng & Heatmap',
                to: '/manager/zone-traffic',
                icon: Flame,
            },
        ],
    },
];
const footerLinks = [
    { label: 'Hỗ trợ', to: 'legal?tab=support' },
    { label: 'Tài liệu', to: 'legal?tab=docs-user' },
    { label: 'Quyền riêng tư', to: 'legal?tab=privacy' },
];

const ManagerLayout = () => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [openDropdown, setOpenDropdown] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const profileMenuRef = useRef(null);
    const navRef = useRef(null);
    const navigate = useNavigate();

    const navigationItems = [...filterStaticNavigation(STATIC_NAVIGATION_ITEMS), ...buildDynamicNavigation('manager')];

    // Load user info from localStorage
    useEffect(() => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                setCurrentUser(JSON.parse(userStr));
            }
        } catch {
            // silent
        }

        // Refresh effective permissions from server so newly granted/revoked
        // permissions reflect in the navbar without requiring re-login.
        getCurrentUser().then(res => {
            if (Array.isArray(res?.data?.permissions)) {
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : {};
                const updatedUser = { ...user, permissions: res.data.permissions };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setCurrentUser(updatedUser);
            }
        }).catch(() => {
            // silent - keep existing cached permissions if refresh fails
        });
    }, []);

    // Close profile menu on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
            if (navRef.current && !navRef.current.contains(event.target)) {
                setOpenDropdown(null);
            }
            if (event.target.closest('.mobile-menu-overlay')) {
                setIsMobileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await logout();
        } catch {
            // silent
        } finally {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    const handleProfile = useCallback(() => {
        setIsProfileMenuOpen(false);
        navigate('/manager/profile');
    }, [navigate]);

    const handleMyVehicles = useCallback(() => {
        setIsProfileMenuOpen(false);
        navigate('/manager/my-vehicles');
    }, [navigate]);

    const handleChangePassword = useCallback(() => {
        setIsProfileMenuOpen(false);
        setIsChangePasswordOpen(true);
    }, []);

    const displayName = currentUser?.fullName || 'Trưởng phòng';
    const displayRole = 'Trưởng phòng';

    return (
        <div className="min-h-screen flex flex-col bg-cloud-mist">
            {/* ========== NAVBAR ========== */}
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-platinum-tint">
                <div className="max-w-[1440px] mx-auto flex items-center justify-between h-16 px-6 lg:px-12">
                    {/* Left: Logo + Nav */}
                    <div className="flex items-center gap-10">
                        {/* Logo */}
                        <NavLink
                            to="/manager"
                            className="flex items-center gap-2 no-underline"
                            aria-label="SmarTracking home"
                        >
                            <div className="w-12 h-12 bg-white flex items-center justify-center shrink-0">
                                <img src={logo} alt="SmarTracking Logo" className="w-full h-full object-contain scale-[1.3]" />
                            </div>
                            <span className="text-midnight-indigo font-bold text-xl tracking-tight hidden sm:block">
                                SmarTracking
                            </span>
                        </NavLink>

                        <nav
                            ref={navRef}
                            aria-label="Primary navigation"
                            className="hidden md:flex items-center gap-1"
                        >
                            {navigationItems.map((item) => (
                                item.isDropdown ? (
                                    <div
                                        key={item.label}
                                        className="relative"
                                        onMouseEnter={() => setOpenDropdown(item.label)}
                                        onMouseLeave={() => setOpenDropdown(null)}
                                    >
                                        <button
                                            onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                                            className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist flex items-center gap-1.5"
                                        >
                                            {item.icon && <item.icon className="w-4 h-4 text-slate-400" />}
                                            <span>{item.label}</span>
                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === item.label ? 'rotate-180 text-midnight-indigo' : 'text-slate-400'}`} />
                                        </button>

                                        {openDropdown === item.label && (
                                            <div className="absolute top-full left-0 pt-1 z-50 min-w-max">
                                                <div className="bg-white border border-platinum-tint/80 rounded-2xl shadow-xl p-2.5 flex gap-4 items-stretch animate-in fade-in slide-in-from-top-1 duration-150">
                                                    {chunkArray(item.children, 3).map((chunk, chunkIdx) => (
                                                        <div key={chunkIdx} className="flex gap-4 items-stretch">
                                                            {chunkIdx > 0 && (
                                                                <div className="w-px bg-platinum-tint/60 self-stretch my-1" aria-hidden="true" />
                                                            )}
                                                            <div className="flex flex-col gap-1 min-w-[170px]">
                                                                {chunk.map(child => (
                                                                    <NavLink
                                                                        key={child.label}
                                                                        to={child.to}
                                                                        end={child.end || false}
                                                                        onClick={() => setOpenDropdown(null)}
                                                                        className={({ isActive }) =>
                                                                            `flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all no-underline ${isActive
                                                                                ? 'text-action-blue bg-blue-50/70 font-bold'
                                                                                : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/60'
                                                                            }`
                                                                        }
                                                                    >
                                                                        {child.icon && <child.icon className="w-4 h-4 flex-shrink-0 text-slate-400" />}
                                                                        <span className="truncate">{child.label}</span>
                                                                    </NavLink>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <NavLink
                                        key={item.label}
                                        to={item.to}
                                        end={item.end || false}
                                        className={({ isActive }) =>
                                            `px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 no-underline whitespace-nowrap flex items-center gap-1.5 ${isActive
                                                ? 'text-action-blue bg-blue-50 font-bold'
                                                : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'
                                            }`
                                        }
                                    >
                                        {item.icon && <item.icon className="w-4 h-4 text-slate-400" />}
                                        <span>{item.label}</span>
                                    </NavLink>
                                )
                            ))}
                        </nav>
                    </div>

                    {/* Right: Notification + Profile */}
                    <div className="flex items-center gap-4">
                        {/* Notification bell */}
                        <NotificationBell basePath="/manager" />

                        {/* Divider */}
                        <div className="w-px h-6 bg-platinum-tint" aria-hidden="true" />

                        {/* Profile dropdown */}
                        <div className="relative" ref={profileMenuRef}>
                            <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={isProfileMenuOpen}
                                aria-label="Open user menu"
                                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-cloud-mist transition-colors duration-200"
                            >
                                <div className="hidden sm:flex flex-col items-end">
                                    <span className="text-sm font-semibold text-midnight-indigo leading-tight">
                                        {displayName}
                                    </span>
                                    <span className="text-xs text-slate-blue leading-tight">
                                        {displayRole}
                                    </span>
                                </div>

                                <UserAvatar
                                    user={currentUser}
                                    name={displayName}
                                    className="w-9 h-9 rounded-full font-bold text-sm ring-2 ring-action-blue/20"
                                />

                                <svg
                                    className={`w-4 h-4 text-slate-blue transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''
                                        }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isProfileMenuOpen && (
                                <div
                                    role="menu"
                                    aria-label="User menu"
                                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-outline-gray bg-white shadow-sm-2 overflow-hidden animate-fade-in"
                                >
                                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                                        <p className="text-sm font-semibold text-midnight-indigo truncate">{displayName}</p>
                                        <p className="text-xs text-slate-blue truncate">{currentUser?.email || 'manager@smrmpts.com'}</p>
                                    </div>

                                    <div className="py-1">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={handleProfile}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors duration-150"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                <circle cx="12" cy="7" r="4" />
                                            </svg>
                                            Hồ sơ cá nhân
                                        </button>

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={handleMyVehicles}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors duration-150"
                                        >
                                            <Car className="w-4 h-4" />
                                            Xe của tôi
                                        </button>

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={handleChangePassword}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors duration-150"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                            </svg>
                                            Đổi mật khẩu
                                        </button>

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors duration-150"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                <polyline points="16,17 21,12 16,7" />
                                                <line x1="21" y1="12" x2="9" y2="12" />
                                            </svg>
                                            Đăng xuất
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Hamburger Menu Toggle (Mobile) */}
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist transition-colors bg-transparent border-0"
                        >
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* ========== MOBILE MENU DRAWER ========== */}
            <div className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {/* Overlay backdrop */}
                <div 
                    className="absolute inset-0 bg-midnight-indigo/20 backdrop-blur-sm mobile-menu-overlay" 
                    aria-hidden="true" 
                    onClick={() => setIsMobileMenuOpen(false)}
                />
                
                {/* Drawer panel */}
                <div className={`absolute top-16 right-0 bottom-0 w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out transform ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                    <div className="p-4 flex flex-col gap-2">
                        {navigationItems.map((item) => (
                            <div key={item.label}>
                                {item.isDropdown ? (
                                    <div className="flex flex-col gap-1">
                                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                            {item.label}
                                        </div>
                                        {item.children.map(child => (
                                            <NavLink
                                                key={child.label}
                                                to={child.to}
                                                end={child.end || false}
                                                onClick={() => setIsMobileMenuOpen(false)}
                                                className={({ isActive }) =>
                                                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline ${
                                                        isActive ? 'text-action-blue bg-blue-50/70 font-bold' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'
                                                    }`
                                                }
                                            >
                                                {child.icon && <child.icon className="w-4 h-4 text-slate-400" />}
                                                <span>{child.label}</span>
                                            </NavLink>
                                        ))}
                                    </div>
                                ) : (
                                    <NavLink
                                        to={item.to}
                                        end={item.end || false}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline ${
                                                isActive ? 'text-action-blue bg-blue-50 font-bold' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'
                                            }`
                                        }
                                    >
                                        {item.icon && <item.icon className="w-4 h-4 text-slate-400" />}
                                        <span>{item.label}</span>
                                    </NavLink>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ========== MAIN CONTENT ========== */}
            <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-6">
                <Outlet />
                <BiometricReminderModal />
                <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
            </main>

            {/* ========== FOOTER ========== */}
            <footer className="w-full bg-white border-t border-platinum-tint">
                <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-6 lg:px-12 py-5">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-midnight-indigo">
                            SmarTracking
                        </span>
                        <span className="text-xs text-slate-blue">
                            © 2026 Trung tâm Điều hành Thông minh SmarTracking. Trạng thái: Hoạt động.
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className="text-xs font-semibold text-action-blue">
                            v2.0.0-beta
                        </span>
                        <nav aria-label="Footer links" className="flex items-center gap-4">
                            {footerLinks.map((link) => (
                                <a
                                    key={link.label}
                                    href={link.to}
                                    className="text-xs font-medium text-slate-blue hover:text-action-blue transition-colors duration-200 no-underline"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default ManagerLayout;
