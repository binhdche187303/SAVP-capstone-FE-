import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, BookOpen, CalendarDays, ChevronDown, KeyRound, LogOut, Menu, User, UserCheck, X } from 'lucide-react';
import logo from '../../assets/images/logo.png';
import { getCurrentUser, logout } from '../../service/authService';
import UserAvatar from '../../components/common/UserAvatar';
import NotificationBell from '../../components/common/NotificationBell';
import BiometricReminderModal from '../../components/biometric/BiometricReminderModal';
import ChangePasswordModal from '../../components/auth/ChangePasswordModal';

const LearningLayout = ({ role = 'teacher' }) => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const basePath = role === 'student' ? '/student' : '/teacher';
    const displayRole = role === 'student' ? 'Sinh viên' : 'Giảng viên';

    useEffect(() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) setCurrentUser(JSON.parse(stored));
        } catch {
            setCurrentUser(null);
        }
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
            if (event.target.closest('.learning-mobile-overlay')) {
                setIsMobileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = useCallback(async () => {
        try { await logout(); } catch {}
        navigate('/login', { replace: true });
    }, [navigate]);

    const handleProfile = useCallback(() => {
        setIsProfileMenuOpen(false);
        navigate(`${basePath}/profile`);
    }, [basePath, navigate]);

    const handleChangePassword = useCallback(() => {
        setIsProfileMenuOpen(false);
        setIsChangePasswordOpen(true);
    }, []);

    const navItems = [
        { label: 'Trang chủ', to: basePath, end: true, icon: BookOpen },
        { label: role === 'student' ? 'Chuyên cần' : 'Điểm danh lớp', to: `${basePath}/attendance`, icon: UserCheck },
        ...(role === 'teacher' ? [{ label: 'Bảng chuyên cần', to: `${basePath}/attendance-report`, icon: Activity }] : []),
        { label: 'Lịch học', to: `${basePath}/schedule`, icon: CalendarDays }
    ];
    const displayName = currentUser?.fullName || currentUser?.full_name || displayRole;

    return (
        <div className="min-h-screen bg-cloud-mist flex flex-col">
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-platinum-tint">
                <div className="max-w-[1440px] mx-auto h-16 px-6 lg:px-12 flex items-center justify-between">
                    <div className="flex items-center gap-10">
                        <NavLink to={basePath} className="flex items-center gap-2 no-underline">
                            <div className="w-12 h-12 bg-white flex items-center justify-center shrink-0">
                                <img src={logo} alt="SmarTracking" className="w-full h-full object-contain scale-[1.3]" />
                            </div>
                            <span className="text-midnight-indigo font-bold text-lg tracking-tight hidden sm:block">SmarTracking</span>
                        </NavLink>
                        <nav className="hidden md:flex items-center gap-1">
                            {navItems.map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) => `px-3.5 py-2 rounded-xl text-sm no-underline flex items-center gap-2 ${isActive ? 'bg-blue-50 text-action-blue font-bold' : 'text-slate-blue font-semibold hover:bg-cloud-mist hover:text-midnight-indigo'}`}
                                >
                                    <item.icon className="w-4 h-4" />
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <NotificationBell basePath={basePath} />
                        <div className="relative" ref={profileMenuRef}>
                            <button type="button" onClick={() => setIsProfileMenuOpen(v => !v)} className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-cloud-mist">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-semibold text-midnight-indigo leading-tight">{displayName}</p>
                                    <p className="text-xs text-slate-blue leading-tight">{displayRole}</p>
                                </div>
                                <UserAvatar user={currentUser} className="w-9 h-9 rounded-full font-bold text-sm ring-2 ring-action-blue/20" />
                                <ChevronDown className={`w-4 h-4 text-slate-blue transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-outline-gray bg-white shadow-sm-2 overflow-hidden animate-fade-in">
                                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                                        <p className="text-sm font-semibold text-midnight-indigo truncate">{displayName}</p>
                                        <p className="text-xs text-slate-blue truncate">{currentUser?.email || (role === 'student' ? 'student@meetingsys.vn' : 'teacher@meetingsys.vn')}</p>
                                    </div>
                                    <div className="py-1">
                                        <button type="button" onClick={handleProfile} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <User className="w-4 h-4" /> Hồ sơ cá nhân
                                        </button>
                                        <button type="button" onClick={handleChangePassword} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <KeyRound className="w-4 h-4" /> Đổi mật khẩu
                                        </button>
                                        <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                                            <LogOut className="w-4 h-4" /> Đăng xuất
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setIsMobileMenuOpen(v => !v)} className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist">
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>
            <div className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-midnight-indigo/20 backdrop-blur-sm learning-mobile-overlay" />
                <div className={`absolute top-16 right-0 bottom-0 w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out transform ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                    <div className="p-4 flex flex-col gap-2">
                        {navItems.map(item => (
                            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'text-action-blue bg-blue-50 font-bold' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'}`}>
                                <item.icon className="w-4 h-4 text-slate-400" />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </div>
            </div>
            <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-6">
                <Outlet />
                <BiometricReminderModal />
                <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
            </main>
            <footer className="w-full bg-white border-t border-platinum-tint">
                <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-6 lg:px-12 py-5">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-midnight-indigo">SmarTracking</span>
                        <span className="text-xs text-slate-blue">© 2026 Trung tâm Điều hành Thông minh SmarTracking. Trạng thái: Hoạt động.</span>
                    </div>
                    <span className="text-xs font-semibold text-action-blue">v2.0.0-beta</span>
                </div>
            </footer>
        </div>
    );
};

export default LearningLayout;
