import { get, post, buildQuery } from '../utils/request';

// ============================================================
// M1: Security Alerts API
// ============================================================

/**
 * Lấy danh sách cảnh báo an ninh
 * GET /security-alerts
 */
export const getSecurityAlerts = async (params = {}, options = {}) => {
    return await get(`/security-alerts${buildQuery(params)}`, options);
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
