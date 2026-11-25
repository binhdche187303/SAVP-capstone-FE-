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

// [2026-11-23] Đích sau đăng nhập do link mang theo (`/login?next=face` — mã QR "Dùng điện thoại"
// của màn đăng ký FaceID). Lưu sessionStorage để sống qua vòng chuyển hướng SSO UEL.
const POST_LOGIN_NEXT_KEY = 'postLoginNext';
const NEXT_SUFFIX = { face: '/face-register' };

/** Ghi nhớ `?next=` hợp lệ của trang đăng nhập (chỉ nhận giá trị trong NEXT_SUFFIX). */
export const rememberPostLoginNext = (search) => {
    try {
        const next = new URLSearchParams(search).get('next');
        if (next && NEXT_SUFFIX[next]) sessionStorage.setItem(POST_LOGIN_NEXT_KEY, next);
    } catch { /* ignore */ }
};

/** Trang sau đăng nhập: trang chủ vai trò, hoặc trang `next` đã ghi nhớ (dùng 1 lần). */
export const getPostLoginPath = (roles) => {
    const home = getRedirectPathByRoles(roles);
    let next = null;
    try {
        next = sessionStorage.getItem(POST_LOGIN_NEXT_KEY);
        sessionStorage.removeItem(POST_LOGIN_NEXT_KEY);
    } catch { /* ignore */ }
    // Quản trị không có trang đăng ký FaceID.
    if (next === 'face' && (home === '/system-admin' || home === '/business-admin')) return home;
    return next && NEXT_SUFFIX[next] ? home + NEXT_SUFFIX[next] : home;
};

/** Lưu phiên đăng nhập (data của POST /auth/login hoặc /auth/sso/exchange). Trả đường dẫn trang sau đăng nhập. */
export const saveLoginSession = ({ accessToken, refreshToken, user }) => {
    setTokens(accessToken, refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    return getPostLoginPath(user?.roles);
};
