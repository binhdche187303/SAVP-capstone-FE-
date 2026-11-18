import { get, post, patch, dele as del, buildQuery } from '../utils/request';

// ============================================================
// M3: Person Control List API
// ============================================================

/**
 * Lấy danh sách kiểm soát (Watchlist/Blocklist)
 * GET /person-control-list
 */
export const getPersonControlList = async (params = {}) => {
    const query = buildQuery(params).slice(1);
    return await get(`/person-control-list${query ? `?${query}` : ''}`);
};

/**
 * Lấy chi tiết hồ sơ kiểm soát
 * GET /person-control-list/:id
 */
export const getPersonControlRecordById = async (id) => {
    return await get(`/person-control-list/${id}`);
};

/**
 * Thêm người vào danh sách kiểm soát
 * POST /person-control-list
 * @param {object} data - Payload (display_name, user_id, face_profile_id, photo_media_file_id, list_type, reason, priority)
 */
export const createPersonControlRecord = async (data) => {
    return await post(`/person-control-list`, data);
};

/**
 * Cập nhật thông tin hồ sơ kiểm soát
 * PATCH /person-control-list/:id
 * @param {object} data - Payload
 */
export const updatePersonControlRecord = async (id, data) => {
    return await patch(`/person-control-list/${id}`, data);
};

/**
 * Xóa hồ sơ kiểm soát
 * DELETE /person-control-list/:id
 */
export const deletePersonControlRecord = async (id) => {
    return await del(`/person-control-list/${id}`);
};
