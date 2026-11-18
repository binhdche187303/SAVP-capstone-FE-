import { get, post, patch, dele, buildQuery } from '../utils/request';

// ================= ROLES =================

export const getRoles = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/roles${query}`);
};

export const getRoleById = async (id) => {
    return await get(`/roles/${id}`);
};

export const createRole = async (data) => {
    return await post('/roles', data);
};

export const updateRole = async (id, data) => {
    return await patch(`/roles/${id}`, data);
};

/**
 * Xóa vai trò
 * BE: DELETE /roles/:id
 * @param {string|number} id
 */
export const deleteRole = async (id) => {
    return await dele(`/roles/${id}`);
};

// ================= PERMISSIONS =================

export const getPermissions = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/permissions${query}`);
};

export const getPermissionById = async (id) => {
    return await get(`/permissions/${id}`);
};

export const createPermission = async (data) => {
    return await post('/permissions', data);
};

export const updatePermission = async (id, data) => {
    return await patch(`/permissions/${id}`, data);
};

export const togglePermissionActive = async (id) => {
    return await post(`/permissions/${id}/toggle-active`);
};

// ================= ROLE <-> PERMISSIONS =================

export const getRolePermissions = async (roleId) => {
    return await get(`/roles/${roleId}/permissions`);
};

export const assignRolePermissions = async (roleId, permissionIds) => {
    return await post(`/roles/${roleId}/permissions`, { permissionIds });
};

export const revokeRolePermission = async (roleId, permissionId) => {
    return await dele(`/roles/${roleId}/permissions/${permissionId}`);
};
