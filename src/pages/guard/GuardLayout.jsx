import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, KeyRound, LogOut, Shield, User } from 'lucide-react';
import logo from '../../assets/images/logo.png';
import UserAvatar from '../../components/common/UserAvatar';
import NotificationBell from '../../components/common/NotificationBell';
import ChangePasswordModal from '../../components/auth/ChangePasswordModal';
import BiometricReminderModal from '../../components/biometric/BiometricReminderModal';
import { getCurrentUser, logout } from '../../service/authService';

const GuardLayout = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
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

    const displayName = currentUser?.fullName || currentUser?.full_name || 'Nhân viên bảo vệ';
    return (
        <div className="min-h-screen bg-cloud-mist flex flex-col">
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-platinum-tint">
                <div className="max-w-[1440px] mx-auto h-16 px-6 lg:px-12 flex items-center justify-between">
                    <div className="flex items-center gap-10">
                        <NavLink to="/guard" className="flex items-center gap-2 no-underline">
                            <div className="w-12 h-12 bg-white flex items-center justify-center shrink-0">
                                <img src={logo} alt="SmarTracking" className="w-full h-full object-contain scale-[1.3]" />
                            </div>
                            <span className="text-midnight-indigo font-bold text-lg tracking-tight hidden sm:block">SmarTracking</span>
                        </NavLink>
                        <nav className="hidden md:flex items-center gap-1">
                            <NavLink
                                to="/guard"
                                end
                                className={({ isActive }) => `px-3.5 py-2 rounded-xl text-sm no-underline flex items-center gap-2 ${isActive ? 'bg-blue-50 text-action-blue font-bold' : 'text-slate-blue font-semibold hover:bg-cloud-mist hover:text-midnight-indigo'}`}
                            >
                                <Shield className="w-4 h-4" />
                                Trực cổng
                            </NavLink>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <NotificationBell basePath="/guard" fallbackIcon={Bell} />
                        <div className="relative" ref={profileMenuRef}>
                            <button type="button" onClick={() => setIsProfileMenuOpen(v => !v)} className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-cloud-mist">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-semibold text-midnight-indigo leading-tight">{displayName}</p>
                                    <p className="text-xs text-slate-blue leading-tight">Bảo vệ</p>
                                </div>
                                <UserAvatar user={currentUser} size="md" />
                                <ChevronDown className={`w-4 h-4 text-slate-blue transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-outline-gray bg-white shadow-sm-2 overflow-hidden animate-fade-in">
                                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                                        <p className="text-sm font-semibold text-midnight-indigo truncate">{displayName}</p>
                                        <p className="text-xs text-slate-blue truncate">{currentUser?.email || 'guard@meetingsys.vn'}</p>
                                    </div>
                                    <div className="py-1">
                                        <button type="button" onClick={() => { setIsProfileMenuOpen(false); navigate('/guard/profile'); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <User className="w-4 h-4" /> Hồ sơ cá nhân
                                        </button>
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
                    </div>
                </div>
            </header>
            <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-6">
                <Outlet />
                <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
                <BiometricReminderModal />
            </main>
            <footer className="w-full bg-white border-t border-platinum-tint">
                <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-6 lg:px-12 py-5">
                    <span className="text-sm font-bold text-midnight-indigo">SmarTracking</span>
                    <span className="text-xs font-semibold text-action-blue">Guard Console</span>
                </div>
            </footer>
        </div>
    );
};

export default GuardLayout;
