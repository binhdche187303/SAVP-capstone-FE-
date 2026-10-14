import { get, post } from '../utils/request';

// ============================================================
// M1: Security Alerts API
// ============================================================

/**
 * Lấy danh sách cảnh báo an ninh
 * GET /security-alerts
 */
export const getSecurityAlerts = async (params = {}, options = {}) => {
    // Lọc bỏ các param rỗng để tránh lỗi 400 Bad Request từ BE
    const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
    const query = new URLSearchParams(cleanParams).toString();
    return await get(`/security-alerts${query ? `?${query}` : ''}`, options);
};

/**
 * Lấy chi tiết cảnh báo an ninh
 * GET /security-alerts/:id
 */
export const getSecurityAlertById = async (id) => {
    return await get(`/security-alerts/${id}`);
};

/**
 * Xác nhận cảnh báo an ninh (Acknowledge)
 * POST /security-alerts/:id/acknowledge
 */
export const acknowledgeSecurityAlert = async (id) => {
    return await post(`/security-alerts/${id}/acknowledge`);
};

/**
 * Đóng cảnh báo an ninh (Resolve)
 * POST /security-alerts/:id/resolve
 * @param {object} data - { resolution_note: string }
 */
export const resolveSecurityAlert = async (id, data) => {
    return await post(`/security-alerts/${id}/resolve`, data);
};

/**
 * Xác nhận hàng loạt cảnh báo an ninh
 * POST /security-alerts/bulk-acknowledge
 * @param {object} data - { ids: string[] }
 */
export const bulkAcknowledgeSecurityAlerts = async (data) => {
    return await post(`/security-alerts/bulk-acknowledge`, data);
};

// ============================================================
// REPORT EXPORTS (UC-120)
// ============================================================

export const exportSecurityAlertReport = async (params = {}) => {
    return await post('/reports/security-alerts/exports', params);
};
