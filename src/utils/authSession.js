import { setTokens } from './request';

/**
 * Trang chủ theo vai trò — dùng chung cho đăng nhập mật khẩu và đăng nhập UEL (SSO).
 * API trả user.roles: string[] (vd ["ADMIN"], ["MANAGER"], ["EMPLOYEE"]).
 */
export const getRedirectPathByRoles = (roles) => {
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
        return '/employee';
    }
    const normalizedRoles = roles.map(r => (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase());
    if (normalizedRoles.includes('SYSTEM_ADMIN') || normalizedRoles.includes('ADMIN')) {
        return '/system-admin';
    }
    if (normalizedRoles.includes('BUSINESS_ADMIN')) {
        return '/business-admin';
    }
    if (normalizedRoles.includes('MANAGER')) {
        return '/manager';
    }
    if (normalizedRoles.includes('GUARD')) {
        return '/guard';
    }
    if (normalizedRoles.includes('TEACHER')) {
        return '/teacher';
    }
    if (normalizedRoles.includes('STUDENT')) {
        return '/student';
    }
    return '/employee';
};

/** Lưu phiên đăng nhập (data của POST /auth/login hoặc /auth/sso/exchange). Trả đường dẫn trang chủ. */
export const saveLoginSession = ({ accessToken, refreshToken, user }) => {
    setTokens(accessToken, refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    return getRedirectPathByRoles(user?.roles);
};
