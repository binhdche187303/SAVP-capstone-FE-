import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAccessToken } from '../utils/request';
import { hasPermission as hasRequiredPermission } from '../utils/permissionUtils';
import { getScreenPermission } from '../config/screenRegistry';

/**
 * Normalizes roles from various possible shapes in API response
 * @param {Array|undefined} roles 
 * @returns {string[]} normalized uppercase role strings
 */
const normalizeRoles = (roles) => {
    if (!roles || !Array.isArray(roles)) return [];
    return roles.map(r => (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase());
};

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }) => {
    const location = useLocation();
    const token = getAccessToken();

    // 1. Check if user is authenticated
    if (!token) {
        // Save the location the user tried to access for post-login redirect
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 2. Retrieve and parse user data from localStorage
    let user = null;
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            user = JSON.parse(userStr);
        }
    } catch (error) {
        console.error("ProtectedRoute: Error parsing user info", error);
    }

    if (!user || !user.roles) {
        // Clean up invalid session & redirect to login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // 3. Normalize user roles and check permission (skip if allowedRoles not provided —
    // lets a route nest just a `requiredPermission` check inside a parent already role-gated)
    const userRoles = normalizeRoles(user.roles);

    if (allowedRoles && allowedRoles.length > 0) {
        const hasRole = allowedRoles.some(role => {
            const upperRole = role.toUpperCase();
            // Fallback checks for alias roles if any (e.g. ADMIN and SYSTEM_ADMIN)
            if (upperRole === 'SYSTEM_ADMIN' || upperRole === 'ADMIN') {
                return userRoles.includes('SYSTEM_ADMIN') || userRoles.includes('ADMIN');
            }
            return userRoles.includes(upperRole);
        });

        if (!hasRole) {
            // User is logged in but doesn't have permissions -> Redirect to Forbidden page
            return <Navigate to="/403" replace />;
        }
    }

    // 4. Check permission-level access (for screens tied to a specific permission)
    if (requiredPermission && !hasRequiredPermission(requiredPermission)) {
        return <Navigate to="/403" replace />;
    }

    // 4b. Quyền của màn hình theo config/screenRegistry.js — gõ thẳng URL mà thiếu quyền thì 403,
    //     khớp với việc menu đã ẩn mục đó (trước đây chỉ vài route khai requiredPermission).
    const screenPermission = getScreenPermission(location.pathname);
    // Phiên cũ chưa có user.permissions thì bỏ qua (BE vẫn chặn) để không khoá nhầm người dùng.
    if (screenPermission && Array.isArray(user.permissions) && !hasRequiredPermission(screenPermission)) {
        return <Navigate to="/403" replace />;
    }

    // 5. Render children if all checks pass
    return children;
};

export default ProtectedRoute;
