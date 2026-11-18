import { get, post, patch, dele as del, buildQuery } from '../utils/request';

// ============================================================
// M2: Alert Rules API
// ============================================================

/**
 * Lấy danh sách quy tắc cảnh báo
 * GET /alert-rules
 */
export const getAlertRules = async (params = {}) => {
    // Remove empty strings and nulls
    const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
    const query = buildQuery(cleanParams).slice(1);
    return await get(`/alert-rules${query ? `?${query}` : ''}`);
};

/**
 * Lấy chi tiết quy tắc cảnh báo
 * GET /alert-rules/:id
 */
export const getAlertRuleById = async (id) => {
    return await get(`/alert-rules/${id}`);
};

/**
 * Tạo quy tắc cảnh báo mới
 * POST /alert-rules
 * @param {object} data - Payload (alert_type, zone_id, threshold, channels, enabled, restricted_hours_json, allowed_person_ids_json)
 */
export const createAlertRule = async (data) => {
    return await post(`/alert-rules`, data);
};

/**
 * Cập nhật quy tắc cảnh báo
 * PATCH /alert-rules/:id
 * @param {object} data - Payload
 */
export const updateAlertRule = async (id, data) => {
    return await patch(`/alert-rules/${id}`, data);
};

/**
 * Xóa quy tắc cảnh báo
 * DELETE /alert-rules/:id
 */
export const deleteAlertRule = async (id) => {
    return await del(`/alert-rules/${id}`);
};
