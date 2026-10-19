import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { RiArrowDownSLine, RiMenuFoldLine, RiMenuUnfoldLine } from 'react-icons/ri';
import UserAvatar from '../../../components/common/UserAvatar';
import NotificationBell from '../../../components/common/NotificationBell';

const BusinessAdminSidebar = ({
    navigationItems = [],
    isMini,
    onToggle,
    isMobileOpen,
    onMobileClose,
    logo,
    currentUser,
    displayName,
    onProfile,
    onChangePassword,
    onLogout,
}) => {
    const location = useLocation();
    const [openSections, setOpenSections] = useState([]);
    // 'notification' | 'profile' | null — chỉ 1 dropdown mở tại 1 thời điểm
    const [openDropdown, setOpenDropdown] = useState(null);
    const [isLogoHovered, setIsLogoHovered] = useState(false);
    const profileRef = useRef(null);

    // Auto-expand section chứa route đang active
    useEffect(() => {
        const active = navigationItems
            .filter(item =>
                item.isDropdown &&
                item.children?.some(c =>
                    c.end ? location.pathname === c.to : location.pathname.startsWith(c.to)
                )
            )
            .map(item => item.label);
        if (active.length) {
            setOpenSections(prev => [...new Set([...prev, ...active])]);
        }
    }, [location.pathname, navigationItems]);

    // Reset logo hover khi mở rộng sidebar
    useEffect(() => {
        if (!isMini) setIsLogoHovered(false);
    }, [isMini]);

    // Đóng profile dropdown khi click ngoài vùng profileRef
    useEffect(() => {
        const handler = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setOpenDropdown(prev => prev === 'profile' ? null : prev);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleSection = (label) =>
        setOpenSections(prev =>
            prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
        );

    const hasActiveChild = (item) =>
        item.children?.some(c =>
            c.end ? location.pathname === c.to : location.pathname.startsWith(c.to)
        );

    const handleProfileAction = (fn) => {
        setOpenDropdown(null);
        fn?.();
    };

    return (
        <>
            {/* ══ MOBILE OVERLAY ══ */}
            <div 
                className={`lg:hidden fixed inset-0 z-40 bg-midnight-indigo/20 backdrop-blur-sm transition-opacity duration-300 ${isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onMobileClose}
                aria-hidden="true"
            />

            <aside
                className={`
                    fixed lg:sticky top-0 inset-y-0 left-0 flex flex-col shrink-0 h-screen
                    bg-midnight-indigo border-r border-white/[0.08]
                    transition-all duration-300 ease-in-out z-50
                    ${isMini ? 'lg:w-[72px]' : 'lg:w-[280px]'}
                    w-[280px]
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
            {/* ══ LOGO ROW ══ */}
            <div className="flex items-center h-[68px] border-b border-white/[0.08] shrink-0 px-3 gap-2.5">

                {isMini ? (
                    /* Khi thu gọn: logo là nút bấm để mở rộng, dùng state để kiểm soát hover */
                    <button
                        type="button"
                        onClick={onToggle}
                        title="Mở rộng sidebar"
                        onMouseEnter={() => setIsLogoHovered(true)}
                        onMouseLeave={() => setIsLogoHovered(false)}
                        className="relative flex items-center justify-center w-11 h-11 shrink-0"
                    >
                        <img
                            src={logo}
                            alt="VISMA IVA"
                            className={`w-11 h-11 object-contain transition-opacity duration-150 ${isLogoHovered ? 'opacity-20' : 'opacity-100'}`}
                        />
                        <RiMenuUnfoldLine
                            className={`absolute w-6 h-6 text-white transition-opacity duration-150 ${isLogoHovered ? 'opacity-100' : 'opacity-0'}`}
                        />
                    </button>
                ) : (
                    /* Khi mở rộng: logo dẫn về dashboard */
                    <NavLink
                        to="/business-admin"
                        end
                        className="flex items-center gap-3 shrink-0 no-underline hover:opacity-80 transition-opacity"
                    >
                        <img src={logo} alt="VISMA IVA" className="w-11 h-11 object-contain shrink-0" />
                    </NavLink>
                )}

                {/* Tên dự án — ẩn khi mini */}
                <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-200 ${isMini ? 'w-0 opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <p className="text-[16px] font-black text-white whitespace-nowrap leading-tight tracking-tight">
                        VISMA IVA
                    </p>
                    <p className="text-[11px] text-steel-gray font-semibold whitespace-nowrap">
                        Business Admin
                    </p>
                </div>

                {/* Nút thu gọn — chỉ hiện khi mở rộng */}
                {!isMini && (
                    <button
                        type="button"
                        onClick={onToggle}
                        title="Thu gọn sidebar"
                        className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.1] transition-colors"
                    >
                        <RiMenuFoldLine className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* ══ NAV SCROLL ══ */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
                {navigationItems.map(item => {

                    /* ── Item đơn ── */
                    if (!item.isDropdown) {
                        return (
                            <NavLink
                                key={item.label}
                                to={item.to}
                                end={item.end}
                                title={isMini ? item.label : undefined}
                                className={({ isActive }) =>
                                    `relative flex items-center gap-3 px-3.5 py-3 mb-0.5
                                    text-[14px] font-semibold whitespace-nowrap
                                    transition-colors no-underline
                                    ${isActive
                                        ? 'text-white bg-action-blue/[0.22]'
                                        : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                                    }`
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && (
                                            <span className="absolute right-0 top-0 bottom-0 w-[3px] bg-action-blue rounded-l" />
                                        )}
                                        {item.icon && (
                                            <item.icon className="w-[21px] h-[21px] shrink-0" />
                                        )}
                                        <span className={`transition-all duration-200 ${isMini ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                                            {item.label}
                                        </span>
                                    </>
                                )}
                            </NavLink>
                        );
                    }

                    /* ── Section (collapsible) ── */
                    const isOpen    = openSections.includes(item.label) && !isMini;
                    const hasActive = hasActiveChild(item);

                    return (
                        <div key={item.label} className="mb-0.5">
                            {/* Section header */}
                            <button
                                type="button"
                                onClick={() => { 
                                    if (isMini) {
                                        if (onToggle) onToggle();
                                        if (!openSections.includes(item.label)) {
                                            setOpenSections(prev => [...prev, item.label]);
                                        }
                                    } else {
                                        toggleSection(item.label); 
                                    }
                                }}
                                title={isMini ? item.label : undefined}
                                className={`
                                    relative flex items-center gap-3 w-full px-3.5 py-3
                                    text-[14px] font-bold whitespace-nowrap text-left
                                    transition-colors hover:text-white hover:bg-white/[0.05]
                                    ${hasActive ? 'text-white' : 'text-white/[0.75]'}
                                `}
                            >
                                {hasActive && (
                                    <span className="absolute right-0 top-0 bottom-0 w-[3px] bg-action-blue/50 rounded-l" />
                                )}
                                {item.icon && (
                                    <item.icon className="w-[21px] h-[21px] shrink-0" />
                                )}
                                <span className={`flex-1 transition-all duration-200 ${isMini ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                                    {item.label}
                                </span>
                                {!isMini && (
                                    <RiArrowDownSLine
                                        className={`w-4 h-4 shrink-0 text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                )}
                            </button>

                            {/* Children — slide */}
                            <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-[600px]' : 'max-h-0'}`}>
                                {item.children?.map(child => (
                                    <NavLink
                                        key={child.label}
                                        to={child.to}
                                        end={child.end}
                                        className={({ isActive }) =>
                                            `relative flex items-center gap-2.5 pl-12 pr-3.5 py-[9px]
                                            text-[13px] font-medium whitespace-nowrap
                                            transition-colors no-underline
                                            ${isActive
                                                ? 'text-white font-semibold'
                                                : 'text-white/[0.52] hover:text-white/[0.88] hover:bg-white/[0.05]'
                                            }`
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {isActive && (
                                                    <span className="absolute left-[26px] top-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full bg-action-blue" />
                                                )}
                                                {child.icon && (
                                                    <child.icon className="w-4 h-4 shrink-0 opacity-70" />
                                                )}
                                                <span>{child.label}</span>
                                            </>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ══ NOTIFICATION BELL ══ */}
            <div className="shrink-0 border-t border-white/[0.08] px-2 py-2">
                <div className={`flex items-center ${isMini ? 'justify-center' : 'gap-3 px-1.5'}`}>
                    <NotificationBell
                        basePath="/business-admin"
                        dark
                        dropUp
                        dropdownAlign="left"
                        isOpen={openDropdown === 'notification'}
                        onIsOpenChange={(open) => {
                            if (open) setOpenDropdown('notification');
                            else setOpenDropdown(prev => prev === 'notification' ? null : prev);
                        }}
                    />
                    {!isMini && (
                        <NavLink
                            to="/business-admin/notifications"
                            className="text-[14px] font-semibold text-white/70 hover:text-white select-none cursor-pointer no-underline"
                        >
                            Thông báo
                        </NavLink>
                    )}
                </div>
            </div>

            {/* ══ PROFILE — bottom sidebar ══ */}
            <div
                ref={profileRef}
                className="relative shrink-0 border-t border-white/[0.08]"
            >
                {/* Dropdown mở lên (dropup) */}
                {openDropdown === 'profile' && (
                    <div className="absolute bottom-full left-0 mb-1 w-[260px] rounded-xl border border-outline-gray bg-white shadow-sm-3 overflow-hidden z-50 animate-fade-in">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-outline-gray bg-cloud-mist">
                            <p className="text-sm font-semibold text-midnight-indigo truncate">
                                {displayName}
                            </p>
                            <p className="text-xs text-slate-blue truncate">
                                {currentUser?.email || ''}
                            </p>
                        </div>

                        <div className="py-1">
                            <button
                                type="button"
                                onClick={() => handleProfileAction(onProfile)}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                                Hồ sơ cá nhân
                            </button>

                            <button
                                type="button"
                                onClick={() => handleProfileAction(onChangePassword)}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Đổi mật khẩu
                            </button>

                            <button
                                type="button"
                                onClick={() => handleProfileAction(onLogout)}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16,17 21,12 16,7" /><line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Đăng xuất
                            </button>
                        </div>
                    </div>
                )}

                {/* Profile trigger */}
                <button
                    type="button"
                    onClick={() => setOpenDropdown(prev => prev === 'profile' ? null : 'profile')}
                    title={isMini ? displayName : undefined}
                    className="flex items-center gap-3 w-full px-3 py-4 hover:bg-white/[0.06] transition-colors"
                >
                    <UserAvatar
                        user={currentUser}
                        name={displayName}
                        className="w-10 h-10 rounded-full shrink-0 ring-2 ring-white/20"
                    />
                    <div className={`flex-1 min-w-0 text-left overflow-hidden transition-all duration-200 ${isMini ? 'w-0 opacity-0' : 'opacity-100'}`}>
                        <p className="text-[14px] font-semibold text-white truncate leading-tight">
                            {displayName}
                        </p>
                        <p className="text-[11.5px] text-steel-gray truncate">
                            Quản trị kinh doanh
                        </p>
                    </div>
                    {!isMini && (
                        <RiArrowDownSLine
                            className={`w-[15px] h-[15px] shrink-0 text-white/40 transition-transform duration-200 ${openDropdown === 'profile' ? 'rotate-180' : ''}`}
                        />
                    )}
                </button>
            </div>
            </aside>
        </>
    );
};

export default BusinessAdminSidebar;
