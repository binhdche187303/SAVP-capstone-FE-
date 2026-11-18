import { get, post, patch, dele, buildQuery } from '../utils/request';

/**
 * Lấy danh sách thiết bị
 * @param {object} params - { page, limit, equipmentType, assetStatus, healthStatus, currentRoomId, search, sortBy, sortOrder }
 * @returns {Promise<object>} response envelope
 */
export const getEquipments = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/equipments${query}`);
};

/**
 * Thêm mới thiết bị
 * @param {object} data - { equipmentName, equipmentType, equipmentCode, serialNumber, brand, model, purchaseDate, specification, healthStatus, roomId, assignmentNote }
 * @returns {Promise<object>} response envelope
 */
export const createEquipment = async (data) => {
    return await post('/equipments', data);
};

/**
 * Báo cáo lỗi thiết bị
 * @param {string|number} equipmentId
 * @param {object} data - { healthStatus, assetStatus, issueNote }
 * @returns {Promise<object>} response envelope
 */
export const reportEquipmentFault = async (equipmentId, data) => {
    return await patch(`/equipments/${equipmentId}/fault`, data);
};

/**
 * Gán thiết bị vào phòng
 * @param {string|number} equipmentId
 * @param {object} data - { roomId, installedAt, assignmentNote }
 * @returns {Promise<object>} response envelope
 */
export const assignEquipment = async (equipmentId, data) => {
    return await patch(`/equipments/${equipmentId}/assignment`, data);
};

/**
 * Gỡ thiết bị khỏi phòng đang gán
 * BE: DELETE /equipments/:id/assignment
 * @param {string|number} equipmentId
 * @returns {Promise<object>} response envelope
 */
export const unassignEquipment = async (equipmentId) => {
    return await dele(`/equipments/${equipmentId}/assignment`);
};

/**
 * Danh sách phòng đã đăng ký có thiết bị (camera/mic/tivi) nhưng chưa được gán đủ thiết bị thực tế
 * BE: GET /equipments/rooms-missing-equipment
 * @returns {Promise<object>} response envelope — data: [{ roomId, roomCode, roomName, missingTypes, missingTypeLabels }], meta: { totalRoomsMissing }
 */
export const getRoomsMissingEquipment = async () => {
    return await get('/equipments/rooms-missing-equipment');
};

/**
 * Xóa thiết bị-tài sản
 * BE: DELETE /equipments/:equipmentId
 * @param {string|number} equipmentId
 * @returns {Promise<object>} response envelope
 */
export const deleteEquipment = async (equipmentId) => {
    return await dele(`/equipments/${equipmentId}`);
};

/**
 * Xác nhận thiết bị báo lỗi là hỏng thật (bước trước khi cử người sửa)
 * BE: PATCH /equipments/:id/fault-confirmation
 * @param {string|number} equipmentId
 * @param {object} data - { confirmationNote }
 * @returns {Promise<object>}
 */
export const confirmEquipmentFault = async (equipmentId, data) => {
    return await patch(`/equipments/${equipmentId}/fault-confirmation`, data);
};

/**
 * Cập nhật lại thiết bị sau khi sửa xong
 * BE: PATCH /equipments/:id/fault-resolution
 * @param {string|number} equipmentId
 * @param {object} data - { healthStatus, assetStatus, resolutionNote }
 * @returns {Promise<object>}
 */
export const resolveEquipmentFault = async (equipmentId, data) => {
    return await patch(`/equipments/${equipmentId}/fault-resolution`, data);
};

/**
 * Lich su bao hong / xac nhan / khac phuc cua 1 thiet bi (ai bao, ai xac nhan, ai da sua)
 * BE: GET /equipments/:id/fault-history
 * @param {string|number} equipmentId
 * @returns {Promise<object>} response envelope
 */
export const getEquipmentFaultHistory = async (equipmentId) => {
    return await get(`/equipments/${equipmentId}/fault-history`);
};

