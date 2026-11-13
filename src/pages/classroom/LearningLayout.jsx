import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BookOpen, Calendar, CalendarDays, Car, ChevronDown, FileCheck, FileText, GraduationCap, KeyRound, LayoutGrid, LogOut, Film, Menu, Monitor, PlusCircle, ScanFace, User, UserCheck, Users, X } from 'lucide-react';
import logo from '../../assets/images/logo.png';
import { getCurrentUser, logout } from '../../service/authService';
import { getBiometricStatus } from '../../service/avatarService';
import { MEETING_BOOKING_ENABLED } from '../../config/featureFlags';
import UserAvatar from '../../components/common/UserAvatar';
import NotificationBell from '../../components/common/NotificationBell';
import BiometricReminderModal from '../../components/biometric/BiometricReminderModal';
import ChangePasswordModal from '../../components/auth/ChangePasswordModal';

const footerLinks = [
    { label: 'Hỗ trợ', to: 'legal?tab=support' },
    { label: 'Tài liệu', to: 'legal?tab=docs-user' },
    { label: 'Quyền riêng tư', to: 'legal?tab=privacy' },
];

// Trạng thái khuôn mặt hiển thị trong menu tài khoản (mục đã chuyển từ thanh điều hướng vào đây).
const FACE_STATUS = {
    not_uploaded: { label: 'Chưa đăng ký', className: 'bg-amber-50 text-amber-700 border-amber-200', needsAction: true },
    rejected: { label: 'Bị từ chối', className: 'bg-red-50 text-red-700 border-red-200', needsAction: true },
    pending_review: { label: 'Chờ duyệt', className: 'bg-blue-50 text-action-blue border-blue-200' },
    approved: { label: 'Đã đăng ký', className: 'bg-green-50 text-green-700 border-green-200' },
};

const LearningLayout = ({ role = 'teacher' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [openDropdown, setOpenDropdown] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [faceStatus, setFaceStatus] = useState(null);
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
        getBiometricStatus().then(res => {
            if (res?.success && res.data) setFaceStatus(res.data.biometricReviewStatus || 'not_uploaded');
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

    // Thanh trên chỉ giữ việc dùng hằng ngày; mục cài đặt một lần (khuôn mặt, xe) nằm trong menu tài khoản.
    // Giảng viên là cán bộ: ngoài giảng dạy còn họp, báo hỏng thiết bị, đón khách như Nhân viên.
    const navItems = role === 'teacher' ? [
        { label: 'Trang chủ', to: basePath, end: true, icon: BookOpen },
        {
            label: 'Giảng dạy',
            icon: GraduationCap,
            children: [
                { label: 'Lịch dạy', to: `${basePath}/schedule`, icon: CalendarDays },
                { label: 'Điểm danh lớp', to: `${basePath}/attendance`, icon: UserCheck },
                { label: 'Bảng chuyên cần', to: `${basePath}/attendance-report`, icon: Activity },
                { label: 'Ghi hình', to: `${basePath}/recordings`, icon: Film },
            ],
        },
        {
            label: 'Cuộc họp',
            icon: Calendar,
            children: [
                { label: 'Lịch cá nhân', to: `${basePath}/my-schedule`, icon: Calendar },
                // Ẩn khi MEETING_BOOKING_ENABLED=false — lịch họp đăng ký trên VPĐT, SAVP chỉ hiển thị + điểm danh.
                ...(MEETING_BOOKING_ENABLED ? [{ label: 'Đăng ký họp', to: `${basePath}/book`, icon: PlusCircle }] : []),
                { label: 'Kho biên bản', to: `${basePath}/minutes`, icon: FileCheck },
                { label: 'Tài liệu họp', to: `${basePath}/meeting-documents`, icon: FileText },
            ],
        },
        {
            label: 'Tiện ích',
            icon: LayoutGrid,
            children: [
                { label: 'Khách của tôi', to: `${basePath}/my-visitors`, icon: Users },
                { label: 'Báo hỏng thiết bị', to: `${basePath}/equipments`, icon: Monitor },
            ],
        },
    ] : [
        { label: 'Trang chủ', to: basePath, end: true, icon: BookOpen },
        { label: 'Chuyên cần', to: `${basePath}/attendance`, icon: UserCheck },
        { label: 'Lịch học', to: `${basePath}/schedule`, icon: CalendarDays },
    ];
    const faceInfo = faceStatus ? FACE_STATUS[faceStatus] || FACE_STATUS.not_uploaded : null;
    const goTo = (path) => { setIsProfileMenuOpen(false); navigate(path); };
    const isGroupActive = (item) => item.children.some(c => location.pathname.startsWith(c.to));
    // Cùng độ đậm cho mọi trạng thái (mục đang chọn chỉ đổi màu/nền) để chiều rộng không nhảy; mũi tên sát chữ.
    const navLinkClass = ({ isActive }) => `h-9 px-3.5 rounded-xl text-sm font-semibold no-underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${isActive ? 'bg-blue-50 text-action-blue' : 'text-slate-blue hover:bg-cloud-mist hover:text-midnight-indigo'}`;
    const mobileLinkClass = ({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'text-action-blue bg-blue-50 font-bold' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist'}`;
    const displayName = currentUser?.fullName || currentUser?.full_name || displayRole;

    return (
        <div className="min-h-screen bg-cloud-mist flex flex-col">
            <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-platinum-tint">
                <div className="max-w-[1440px] mx-auto h-16 px-6 lg:px-12 flex items-center justify-between gap-4">
                    {/* 3 cột: logo trái · menu chính giữa · thông báo/tài khoản phải (2 cột ngoài cùng flex-1 nên menu luôn ở giữa) */}
                    <div className="flex flex-1 items-center min-w-0">
                        <NavLink to={basePath} className="flex items-center gap-2 no-underline shrink-0">
                            <div className="w-12 h-12 bg-white flex items-center justify-center shrink-0">
                                <img src={logo} alt="VISMA IVA" className="w-full h-full object-contain scale-[1.3]" />
                            </div>
                            <span className="text-midnight-indigo font-bold text-lg tracking-tight hidden xl:block">VISMA IVA</span>
                        </NavLink>
                    </div>
                    <nav className="hidden xl:flex items-center gap-6 flex-nowrap">
                            {navItems.map(item => item.children ? (
                                <div
                                    key={item.label}
                                    className="relative shrink-0"
                                    onMouseEnter={() => setOpenDropdown(item.label)}
                                    onMouseLeave={() => setOpenDropdown(null)}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenDropdown(v => (v === item.label ? null : item.label))}
                                        className={navLinkClass({ isActive: isGroupActive(item) })}
                                    >
                                        {item.label}
                                        <ChevronDown className={`w-3.5 h-3.5 -mr-0.5 opacity-60 transition-transform ${openDropdown === item.label ? 'rotate-180' : ''}`} />
                                    </button>
                                    {openDropdown === item.label && (
                                        <div className="absolute top-full left-0 pt-1 z-50 min-w-max">
                                            <div className="bg-white border border-platinum-tint/80 rounded-2xl shadow-xl p-2.5 flex flex-col gap-1 min-w-[190px]">
                                                {item.children.map(child => (
                                                    <NavLink
                                                        key={child.to}
                                                        to={child.to}
                                                        onClick={() => setOpenDropdown(null)}
                                                        className={({ isActive }) => `flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium no-underline whitespace-nowrap ${isActive ? 'text-action-blue bg-blue-50/70 font-bold' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/60'}`}
                                                    >
                                                        <child.icon className="w-4 h-4 shrink-0 text-slate-400" />
                                                        {child.label}
                                                    </NavLink>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                                    {item.label}
                                </NavLink>
                            ))}
                    </nav>
                    <div className="flex flex-1 items-center justify-end gap-2 lg:gap-3 min-w-0">
                        <NotificationBell basePath={basePath} />
                        <span aria-hidden="true" className="hidden sm:block h-7 w-px bg-platinum-tint" />
                        <div className="relative" ref={profileMenuRef}>
                            <button type="button" onClick={() => setIsProfileMenuOpen(v => !v)} className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-cloud-mist">
                                <div className="text-right hidden sm:block max-w-[150px] lg:max-w-[200px]">
                                    <p className="text-sm font-semibold text-midnight-indigo leading-tight truncate">{displayName}</p>
                                    <p className="text-xs text-slate-blue leading-tight">{displayRole}</p>
                                </div>
                                <span className="relative shrink-0">
                                    <UserAvatar user={currentUser} className="w-9 h-9 rounded-full font-bold text-sm ring-2 ring-action-blue/20" />
                                    {faceInfo?.needsAction && <span title="Chưa đăng ký khuôn mặt" className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-slate-blue transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-outline-gray bg-white shadow-sm-2 overflow-hidden animate-fade-in">
                                    <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <p className="text-sm font-semibold text-midnight-indigo truncate">{displayName}</p>
                                            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-blue-50 text-action-blue text-[10px] font-bold">{displayRole}</span>
                                        </div>
                                        <p className="text-xs text-slate-blue truncate">{currentUser?.email || (role === 'student' ? 'student@meetingsys.vn' : 'teacher@meetingsys.vn')}</p>
                                    </div>
                                    <div className="py-1">
                                        <button type="button" onClick={handleProfile} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <User className="w-4 h-4" /> Hồ sơ cá nhân
                                        </button>
                                        <button type="button" onClick={() => goTo(`${basePath}/face-register`)} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <ScanFace className="w-4 h-4" />
                                            <span className="flex-1 whitespace-nowrap">Khuôn mặt</span>
                                            {faceInfo && <span className={`shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${faceInfo.className}`}>{faceInfo.label}</span>}
                                        </button>
                                        <button type="button" onClick={() => goTo(`${basePath}/my-vehicles`)} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <Car className="w-4 h-4" /> Xe của tôi
                                        </button>
                                        <button type="button" onClick={handleChangePassword} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist">
                                            <KeyRound className="w-4 h-4" /> Đổi mật khẩu
                                        </button>
                                    </div>
                                    <div className="py-1 border-t border-outline-gray">
                                        <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                                            <LogOut className="w-4 h-4" /> Đăng xuất
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setIsMobileMenuOpen(v => !v)} className="xl:hidden flex items-center justify-center p-2 rounded-lg text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist">
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>
            <div className={`xl:hidden fixed inset-0 z-40 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-midnight-indigo/20 backdrop-blur-sm learning-mobile-overlay" />
                <div className={`absolute top-16 right-0 bottom-0 w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out transform ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
                    <div className="p-4 flex flex-col gap-2">
                        {navItems.map(item => item.children ? (
                            <div key={item.label} className="flex flex-col gap-1">
                                <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                                {item.children.map(child => (
                                    <NavLink key={child.to} to={child.to} onClick={() => setIsMobileMenuOpen(false)} className={mobileLinkClass}>
                                        <child.icon className="w-4 h-4 text-slate-400" />
                                        <span>{child.label}</span>
                                    </NavLink>
                                ))}
                            </div>
                        ) : (
                            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setIsMobileMenuOpen(false)} className={mobileLinkClass}>
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

export default LearningLayout;
