import { useLocation, useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { AREA_ROLE } from '../../config/screenRegistry';

// Tên hiển thị + thứ tự ưu tiên giống getRedirectPathByRoles (utils/authSession.js).
const AREA_LABEL = {
    'system-admin': 'Quản trị hệ thống',
    'business-admin': 'Quản trị nghiệp vụ',
    manager: 'Trưởng đơn vị',
    guard: 'Bảo vệ',
    teacher: 'Giảng viên',
    student: 'Sinh viên',
    employee: 'Cán bộ, viên chức',
};

const readRoles = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return (user?.roles || []).map(r => (typeof r === 'string' ? r : r?.roleCode || r?.role_code || '').toUpperCase());
    } catch {
        return [];
    }
};

/** Các khu vực (layout) user được vào theo role — dùng cho menu chuyển vai trò. */
export const getAvailableAreas = (roles = readRoles()) =>
    Object.keys(AREA_LABEL).filter(area => roles.includes(AREA_ROLE[area]) || (area === 'system-admin' && roles.includes('ADMIN')));

/**
 * Mục "Chuyển vai trò" trong menu tài khoản. Chỉ hiện khi user có từ 2 khu vực trở lên
 * (vd. Cán bộ + Giảng viên, Trưởng đơn vị + Giảng viên) — trước đây họ chỉ vào được 1 layout
 * theo thứ tự ưu tiên và mất menu của vai trò còn lại.
 */
const RoleSwitcherMenu = ({ onNavigate }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const areas = getAvailableAreas();
    if (areas.length < 2) return null;
    const current = areas.find(a => pathname === `/${a}` || pathname.startsWith(`/${a}/`));

    return (
        <div className="py-1 border-t border-b border-outline-gray" role="group" aria-label="Chuyển vai trò">
            <p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-blue">Chuyển vai trò</p>
            {areas.map(area => {
                const active = area === current;
                return (
                    <button
                        key={area}
                        type="button"
                        role="menuitem"
                        disabled={active}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => { onNavigate?.(); navigate(`/${area}`); }}
                        className={`flex items-center gap-3 w-full px-4 py-2 text-left text-sm transition-colors ${active ? 'text-action-blue font-semibold cursor-default' : 'text-midnight-indigo hover:bg-cloud-mist'}`}
                    >
                        <Repeat className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{AREA_LABEL[area]}</span>
                        {active && <span className="text-[10px] font-bold">Đang dùng</span>}
                    </button>
                );
            })}
        </div>
    );
};

export default RoleSwitcherMenu;
