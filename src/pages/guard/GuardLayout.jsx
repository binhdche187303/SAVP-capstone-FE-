import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import RoleSwitcherMenu from '../../components/common/RoleSwitcherMenu';
import { Bell, Car, ChevronDown, KeyRound, LogOut, Menu, Shield, ShieldAlert, User, UserCheck, UserRound, Video, X } from 'lucide-react';
import logo from '../../assets/images/logo.png';
import UserAvatar from '../../components/common/UserAvatar';
import NotificationBell from '../../components/common/NotificationBell';
import ChangePasswordModal from '../../components/auth/ChangePasswordModal';
import BiometricReminderModal from '../../components/biometric/BiometricReminderModal';
import FaceMenuItem, { FaceAlertDot, useFaceStatus } from '../../components/biometric/FaceMenuItem';
import { getCurrentUser, logout } from '../../service/authService';
import { filterStaticNavigation } from '../../utils/buildDynamicNavigation';

const NAV_ITEMS = [
    { to: '/guard', label: 'Trực cổng', icon: Shield, end: true },
    { to: '/guard/live', label: 'Camera', icon: Video },
    { to: '/guard/security-alerts', label: 'Cảnh báo an ninh', icon: ShieldAlert },
    { to: '/guard/visitor-alerts', label: 'Cảnh báo khách', icon: UserRound },
    { to: '/guard/anpr', label: 'Xe vào ra', icon: Car },
    { to: '/guard/visitors/desk', label: 'Khách tại cổng', icon: UserCheck },
];

const footerLinks = [
    { label: 'Hỗ trợ', to: 'legal?tab=support' },
    { label: 'Tài liệu', to: 'legal?tab=docs-user' },
    { label: 'Quyền riêng tư', to: 'legal?tab=privacy' },
];

const GuardLayout = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) setCurrentUser(JSON.parse(stored));
        } catch {}
        getCurrentUser().then(res => {
            if (res?.data) {
                const stored = localStorage.getItem('user');
                const user = stored ? JSON.parse(stored) : {};
                const updated = { ...user, ...res.data };
                localStorage.setItem('user', JSON.stringify(updated));
                setCurrentUser(updated);
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = useCallback(async () => {
        try { await logout(); } catch {}
        navigate('/login', { replace: true });
    }, [navigate]);

    const faceInfo = useFaceStatus();
    const displayName = currentUser?.fullName || currentUser?.full_name || 'Nhân viên bảo vệ';
    return (
        <div className="min-h-screen bg-cloud-mist flex flex-col">
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-platinum-tint">
                <div className="max-w-[1440px] mx-auto h-16 px-6 lg:px-12 flex items-center justify-between gap-4">
                    {/* Giống header role teacher: logo, menu chữ không icon, khu vực tài khoản căn phải. */}
                    <div className="flex shrink-0 items-center min-w-0">
                        <NavLink to="/guard" className="flex items-center gap-2 no-underline shrink-0">
                            <div className="w-12 h-12 bg-white flex items-center justify-center shrink-0">
                                <img src={logo} alt="VISMA IVA" className="w-full h-full object-contain scale-[1.3]" />
                            </div>
                            <span className="text-midnight-indigo font-bold text-lg tracking-tight hidden xl:block">VISMA IVA</span>
                        </NavLink>
                    </div>
                    <nav aria-label="Điều hướng chính" className="hidden xl:flex items-center gap-1.5 flex-nowrap">
                        {filterStaticNavigation(NAV_ITEMS).map(({ to, label, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                className={({ isActive }) => `h-9 px-3.5 rounded-xl text-sm font-semibold no-underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${isActive ? 'bg-blue-50 text-action-blue' : 'text-slate-blue hover:bg-cloud-mist hover:text-midnight-indigo'}`}
                            >
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="flex flex-1 items-center justify-end gap-2 lg:gap-3 min-w-0">
                        <NotificationBell basePath="/guard" fallbackIcon={Bell} />
                        <span aria-hidden="true" className="hidden sm:block h-7 w-px bg-platinum-tint" />
                        <div className="relative" ref={profileMenuRef}>
                            <button type="button" onClick={() => setIsProfileMenuOpen(v => !v)} className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-cloud-mist">
                                <div className="text-right hidden sm:block max-w-[150px] lg:max-w-[200px]">
                                    <p className="text-sm font-semibold text-midnight-indigo leading-tight truncate">{displayName}</p>
                                    <p className="text-xs text-slate-blue leading-tight">Bảo vệ</p>
                                </div>
                                <span className="relative shrink-0">
                                    <UserAvatar user={currentUser} name={displayName} className="w-9 h-9 rounded-full font-bold text-sm ring-2 ring-action-blue/20" />
                                    <FaceAlertDot faceInfo={faceInfo} />
                                </span>
                                <ChevronDown className={`w-4 h-4 text-slate-blue transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-outline-gray bg-white shadow-sm-2 overflow-hidden animate-fade-in">
                                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                                        <p className="text-sm font-semibold text-midnight-indigo truncate">{displayName}</p>
                                        <p className="text-xs text-slate-blue truncate">{currentUser?.email || 'guard@meetingsys.vn'}</p>
                                    </div>
                                    <div className="py-1">
                                        <button type="button" onClick={() => { setIsProfileMenuOpen(false); navigate('/guard/profile'); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <User className="w-4 h-4" /> Hồ sơ cá nhân
                                        </button>
                                        <FaceMenuItem faceInfo={faceInfo} onClick={() => { setIsProfileMenuOpen(false); navigate('/guard/face-register'); }} />
                                        <button type="button" onClick={() => { setIsProfileMenuOpen(false); navigate('/guard/my-vehicles'); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <Car className="w-4 h-4" /> Xe của tôi
                                        </button>
                                        <RoleSwitcherMenu onNavigate={() => setIsProfileMenuOpen(false)} />
                                        <button type="button" onClick={() => { setIsProfileMenuOpen(false); setIsChangePasswordOpen(true); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <KeyRound className="w-4 h-4" /> Đổi mật khẩu
                                        </button>
                                        <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                                            <LogOut className="w-4 h-4" /> Đăng xuất
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Màn nhỏ hơn xl (1280px): thanh menu ẩn, mở điều hướng bằng ngăn kéo. */}
                        <button type="button" onClick={() => setIsMobileMenuOpen(v => !v)} aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={isMobileMenuOpen}
                            className="xl:hidden flex items-center justify-center p-2 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist">
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>
            <div className={`xl:hidden fixed inset-0 z-40 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-midnight-indigo/20 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
                <nav aria-label="Điều hướng chính" className={`absolute top-16 right-0 bottom-0 w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out transform ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                    <div className="p-4 flex flex-col gap-1">
                        {filterStaticNavigation(NAV_ITEMS).map(({ to, label, icon: Icon, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={({ isActive }) => `px-3 py-2.5 rounded-xl text-sm no-underline flex items-center gap-2 ${isActive ? 'bg-blue-50 text-action-blue font-bold' : 'text-slate-blue font-semibold hover:bg-cloud-mist hover:text-midnight-indigo'}`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </div>
            <main data-page-frame="contained" className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-6">
                <Outlet />
                <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
                <BiometricReminderModal />
            </main>
            <footer className="w-full bg-white border-t border-platinum-tint">
                <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-6 lg:px-12 py-5">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-midnight-indigo">VISMA IVA</span>
                        <span className="text-xs text-slate-blue">© 2026 VISMA Intelligent Video Analytics (IVA). Trạng thái: Hoạt động.</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className="text-xs font-semibold text-action-blue">v2.0.0-beta</span>
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

export default GuardLayout;
