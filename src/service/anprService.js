import { get, post, patch, dele as del } from '../utils/request';

// ============================================================
// ANPR APIs (UC-ANPR)
// ============================================================

/**
 * Lấy danh sách xe của tôi (Employee/Manager/Admin)
 * GET /anpr/vehicle-registrations
 */
export const getMyVehicles = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/anpr/vehicle-registrations${query ? `?${query}` : ''}`);
};

/**
 * Lấy chi tiết xe của tôi
 * GET /anpr/vehicle-registrations/:id
 */
export const getMyVehicleById = async (id) => {
    return await get(`/anpr/vehicle-registrations/${id}`);
};

/**
 * Đăng ký xe mới (Cá nhân)
 * POST /anpr/vehicle-registrations
 * @param {object} data - { plateNumber, vehicleType, note }
 */
export const createMyVehicle = async (data) => {
    return await post(`/anpr/vehicle-registrations`, data);
};

/**
 * Sửa thông tin xe (note/loại xe)
 * PATCH /anpr/vehicle-registrations/:id
 */
export const updateMyVehicle = async (id, data) => {
    return await patch(`/anpr/vehicle-registrations/${id}`, data);
};

/**
 * Bật/tắt trạng thái xe
 * PATCH /anpr/vehicle-registrations/:id/status
 * @param {object} data - { status: 'ACTIVE' | 'INACTIVE' }
 */
export const toggleMyVehicleStatus = async (id, data) => {
    const beStatus = (data.status === 'ACTIVE' || data.status === 'active') ? 'active' : 'disabled';
    return await patch(`/anpr/vehicle-registrations/${id}/status`, { status: beStatus });
};

/**
 * Xóa mềm xe
 * DELETE /anpr/vehicle-registrations/:id
 */
export const deleteMyVehicle = async (id) => {
    return await del(`/anpr/vehicle-registrations/${id}`);
};

/**
 * Admin đăng ký xe hộ nhân viên
 * POST /anpr/admin/vehicle-registrations
 * @param {object} data - { userId, plateNumber, vehicleType, note }
 */
export const adminRegisterVehicle = async (data) => {
    return await post(`/anpr/admin/vehicle-registrations`, data);
};

/**
 * Lịch sử xe của tôi
 * GET /anpr/vehicle-history
 */
export const getMyVehicleHistory = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/anpr/vehicle-history${query ? `?${query}` : ''}`);
};

/**
 * Lịch sử quét biển toàn hệ thống (Admin)
 * GET /anpr/admin/vehicle-history
 * @param {object} params - { page, limit, matchState }
 */
export const getAdminVehicleHistory = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/anpr/admin/vehicle-history${query ? `?${query}` : ''}`);
};

/**
 * Lấy danh sách biển lạ / chưa đăng ký (Admin)
 * GET /anpr/admin/unknown-vehicles
 */
export const getUnknownVehicles = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/anpr/admin/unknown-vehicles${query ? `?${query}` : ''}`);
};

export const setupMockAnprCamera = async (data = {}) => {
    return await post('/dev/mock-anpr-setup', data);
};

export const mockAnprVehicleEvent = async (data = {}) => {
    return await post('/dev/mock-anpr-event', data);
};

// ============================================================
// M4: Vehicle Control List (Blocklist / Watchlist)
// ============================================================

/**
 * Thêm xe vào danh sách kiểm soát (Watchlist/Blocklist)
 * POST /anpr/admin/control-list
 * @param {object} data - Payload (plate_raw, list_type, reason)
 */
export const createVehicleControlRecord = async (data) => {
    return await post(`/anpr/admin/control-list`, data);
};

/**
 * Lấy danh sách kiểm soát phương tiện
 * GET /anpr/admin/control-list
 */
export const getVehicleControlList = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/anpr/admin/control-list${query ? `?${query}` : ''}`);
};

/**
 * Lấy chi tiết một xe trong danh sách kiểm soát
 * GET /anpr/admin/control-list/:id
 */
export const getVehicleControlRecordById = async (id) => {
    return await get(`/anpr/admin/control-list/${id}`);
};

/**
 * Cập nhật xe trong danh sách kiểm soát
 * PATCH /anpr/admin/control-list/:id
 * @param {object} data - Payload (reason, active)
 */
export const updateVehicleControlRecord = async (id, data) => {
    return await patch(`/anpr/admin/control-list/${id}`, data);
};

/**
 * Xóa xe khỏi danh sách kiểm soát
 * DELETE /anpr/admin/control-list/:id
 */
export const deleteVehicleControlRecord = async (id) => {
    return await del(`/anpr/admin/control-list/${id}`);
};

// ============================================================
// GATE ACCESS HISTORY (UC-107 — employee self-service)
// ============================================================

export const getMyGateAccessHistory = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return await get(`/gate-access/history${query ? `?${query}` : ''}`);
};

// ============================================================
// REPORT EXPORTS (UC-119)
// ============================================================

export const exportVehicleReport = async (params = {}) => {
    return await post('/reports/vehicle/exports', params);
};
