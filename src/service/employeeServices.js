import { get, post, patch, put, dele, buildQuery } from '../utils/request';

// ============================================================
// EMPLOYEE APIs (UC-SM-01 ~ UC-SM-03)
// ============================================================

/**
 * Lấy danh sách phòng đủ sức chứa để hiển thị trong form đặt lịch.
 * BE chưa có GET /rooms/available (lọc conflict theo khung giờ) — tạm dùng
 * GET /rooms/search?minCapacity=X cho đến khi BE cung cấp endpoint chuyên trách.
 * Conflict thật vẫn được kiểm tra server-side khi gọi POST /meetings.
 * @param {object} params - { startTime, endTime, minCapacity }
 */
export const getAvailableRooms = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/rooms/available${query}`);
};

/**
 * Lấy danh sách phòng họp (BE không có /rooms/available — dùng /rooms/search thật).
 * Dùng cho các trang ngoài phạm vi luồng booking (MeetingDetail.jsx); KHÔNG dùng trong
 * BookMeeting.jsx để check trùng lịch theo khung giờ (xem getAvailableRooms).
 * @param {object} params - { page, limit }
 */
export const getRooms = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/rooms/search${query}`);
};

/**
 * Lấy danh sách phòng hợp KHẢ DỤNG cho một cuộc họ p cụ thể (lọc theo khung giờ của cuộc họ p).
 * Sử dụng endpoint chuyên trách: GET /meetings/:meetingId/available-rooms
 * Backend tự động loại các phòng bị đặt trung lịch, bao gồm cả phòng hiện tại của cuộc họ p.
 * @param {string} meetingId - UUID cuộc họ p
 * @param {object} options - { includeCurrentRoom?: boolean, capacityWarningMode?: boolean }
 */
export const getAvailableRoomsForMeeting = async (meetingId, options = {}) => {
    const query = buildQuery(options);
    return await get(`/meetings/${meetingId}/available-rooms${query}`);
};

/**
 * Tìm kiếm/lấy danh sách rút gọn nhân viên nội bộ (dùng cho autocomplete chọn participants)
 * @param {object} params - { page, limit, search }
 */
export const getUsers = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/users${query}`);
};

/**
 * Create a new meeting / Book a meeting room
 * @param {object} data - Meeting booking payload (CreateMeetingDto)
 */
export const createMeeting = async (data) => {
    return await post('/meetings', data);
};

/**
 * Tạo cấu hình ghi âm/ghi hình cho cuộc họp (gọi sau khi tạo họp thành công)
 * @param {string} meetingId
 * @param {object} data - { enableVideo, enableAudio, consentRequired, ... }
 */
export const addRecordingConfig = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/recording-config`, data);
};

/**
 * Ghi đè toàn bộ chương trình họp (agenda) - atomic replace
 * @param {string} meetingId
 * @param {Array<{title: string, plannedDurationMinutes: number, description?: string, ownerId?: string}>} items
 */
export const replaceAgendas = async (meetingId, items) => {
    return await put(`/meetings/${meetingId}/agendas`, { items });
};

export const updateAgendaItem = async (meetingId, agendaId, data) => {
    return await patch(`/meetings/${meetingId}/agendas/${agendaId}`, data);
};

export const uploadAgendaAttachment = async (meetingId, agendaId, formData) => {
    return await post(`/meetings/${meetingId}/agendas/${agendaId}/attachments`, formData, {
        headers: {} // Let browser set multipart/form-data with boundary
    });
};

export const deleteAgendaAttachment = async (meetingId, agendaId, fileId) => {
    return await dele(`/meetings/${meetingId}/agendas/${agendaId}/attachments/${fileId}`);
};

/**
 * Thêm thành viên nội bộ vào cuộc họp (sau khi tạo họp)
 * @param {string} meetingId
 * @param {object} data - { userId, overrideWarnings?, warningToken? }
 */
export const addInternalParticipant = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/participants/internal`, data);
};

/**
 * UC-AT-ME: Thống kê chuyên cần cá nhân
 * GET /analytics/attendance/on-time-rate/me
 * @param {object} params - { preset: 'week'|'month'|'quarter', from?, to? }
 */
export const getMyAttendanceStats = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/attendance/on-time-rate/me${query}`);
};

/**
 * UC-22: Tra cứu lịch trình cá nhân
 * @param {object} params - { from, to, view, status }
 */
export const getMySchedule = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/me/schedule${query}`);
};

/**
 * Lấy lịch sử cuộc họp cá nhân (hỗ trợ phân trang, phục vụ trang Bản ghi)
 * @param {object} params - { status, page, limit, from, to, q }
 */
export const getMyMeetingHistory = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/me/meetings/history${query}`);
};

/**
 * UC-ACC-07: Xem chi tiết hồ sơ user (self)
 * @param {number|string} userId
 */
export const getUserById = async (userId) => {
    return await get(`/users/${userId}`);
};

/**
 * Lấy hồ sơ công khai của user
 * @param {number|string} userId
 */
export const getUserPublicProfile = async (userId) => {
    return await get(`/users/${userId}/public-profile`);
};

/**
 * UC-AM-12: Cập nhật thông tin cá nhân (self)
 * BE đúng: PATCH /users/:userId (không còn /me/profile)
 * @param {string|number} userId - Lấy từ localStorage hoặc auth context
 * @param {object} data - { fullName, phoneNumber }
 */
export const updateSelfProfile = async (userId, data) => {
    return await patch(`/users/${userId}`, data);
};

/**
 * UC-AM-13: Đăng ký dữ liệu khuôn mặt và liên kết vào tài khoản người dùng
 * @param {number|string} userId
 * @param {object} data - Payload matching backend schema
 */
export const registerFaceProfile = async (userId, formData) => {
    // Note: Do not pass Content-Type header so the browser can automatically
    // set the multipart/form-data boundary
    return await post(`/users/${userId}/face-profile`, formData, {
        headers: {} 
    });
};

/**
 * UC-SM-04: Xem chi tiết cuộc họp
 */
export const getMeetingById = async (id) => {
    return await get(`/meetings/${id}`);
};

export const getMeetingMediaFiles = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/media-files${query}`);
};

export const updateMediaVisibility = async (fileId, data) => {
    return await patch(`/media-files/${fileId}/visibility`, data);
};


export const getMeetingMinutesByMeetingId = async (meetingId) => {
    const query = buildQuery({ meetingId, limit: 1 });
    return await get(`/meeting-minutes${query}`);
};

/**
 * UC-SM-02: Chỉnh sửa cuộc họp
 */
export const updateMeeting = async (id, data) => {
    return await patch(`/meetings/${id}`, data);
};

export const updateMeetingTime = async (id, data) => {
    return await patch(`/meetings/${id}/time`, data);
};

export const updateMeetingRoom = async (id, data) => {
    return await patch(`/meetings/${id}/room`, data);
};

export const updateMeetingRecordingConfig = async (id, data) => {
    return await patch(`/meetings/${id}/recording-config`, data);
};

/**
 * UC-SM-03: Hủy cuộc họp
 */
export const cancelMeeting = async (id, reason = '') => {
    // BE DTO (cancel-meeting.dto.ts) dùng field cancellationReason, không phải reason
    return await post(`/meetings/${id}/cancel`, { cancellationReason: reason });
};

/**
 * UC-SM-08: Check-in bằng khuôn mặt vào phòng họp
 */
export const checkInMeeting = async (id, data) => {
    // CHỜ BE-11
    return await post(`/meetings/${id}/check-in`, data);
};

/**
 * UC-94: Bắt đầu phiên họp
 * Endpoint: POST /live-meetings/{meetingId}/start
 */
export const startMeeting = async (id) => {
    return await post(`/live-meetings/${id}/start`);
};

/**
 * Tải xuống file media cuộc họp (secure download)
 * BE: GET /media-files/:fileId/secure-download
 * @param {string} fileId - ID file media (lấy từ GET /meetings/:meetingId/media-files)
 */
export const getMediaFile = async (fileId) => {
    return await get(`/media-files/${fileId}`);
};

/**
 * Phát lại file media trong trình duyệt
 * BE: GET /media-files/:fileId/playback
 * @param {string} fileId
 */
export const getMediaFilePlayback = async (fileId) => {
    return await get(`/media-files/${fileId}/playback`);
};

// ============================================================
// MEETING NOTES & ACTIONS ENDPOINTS (RESTORED)
// ============================================================

export const getMeetingAttendance = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/attendance${query}`);
};

/**
 * Cập nhật trạng thái điểm danh theo từng bản ghi
 * BE: PATCH /meetings/:meetingId/attendance/:recordId/status
 * @param {string} meetingId
 * @param {string} recordId - ID bản ghi điểm danh cụ thể
 * @param {object} data - { status }
 */
export const updateAttendanceStatus = async (meetingId, recordId, data) => {
    return await patch(`/meetings/${meetingId}/attendance/${recordId}/status`, data);
};

export const listMeetingNotes = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/notes${query}`);
};

export const createMeetingNote = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/notes`, data);
};

/**
 * UC-98: Kết thúc phiên họp
 * Endpoint: POST /live-meetings/{meetingId}/end
 */
export const endMeeting = async (meetingId) => {
    return await post(`/live-meetings/${meetingId}/end`);
};

/**
 * UC-100: Xem danh sách người đang có mặt
 * Endpoint: GET /live-meetings/{meetingId}/present-attendees
 */
export const getPresentAttendees = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/live-meetings/${meetingId}/present-attendees${query}`);
};

/**
 * UC-95: Yêu cầu gia hạn phiên họp
 * Endpoint: POST /live-meetings/{meetingId}/extension-requests
 */
export const requestExtension = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/extension-requests`, data);
};

/**
 * UC-96: Phê duyệt/từ chối yêu cầu gia hạn
 * Endpoint: POST /live-meetings/{meetingId}/extension-requests/{requestId}/decide
 */
export const decideExtension = async (meetingId, requestId, data) => {
    return await post(`/live-meetings/${meetingId}/extension-requests/${requestId}/decide`, data);
};

// ============================================================
// RECORDING & DEVICES CONTROL ENDPOINTS (ADDED)
// ============================================================

export const startVideoRecording = async (meetingId, data) => {
    return await post(`/live-meetings/${meetingId}/recording/start-video`, data);
};

export const pauseVideoRecording = async (meetingId, sessionId) => {
    return await post(`/live-meetings/${meetingId}/recording/${sessionId}/pause-video`);
};

export const resumeVideoRecording = async (meetingId, sessionId) => {
    return await post(`/live-meetings/${meetingId}/recording/${sessionId}/resume-video`);
};

export const stopVideoRecording = async (meetingId, sessionId) => {
    return await post(`/live-meetings/${meetingId}/recording/${sessionId}/stop-video`);
};

export const uploadVideoRecording = async (meetingId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return await post(`/meetings/${meetingId}/recording-sessions/video-upload`, formData);
};

export const createMockCamera = async (data) => {
    return await post('/dev/mock-camera', data);
};

export const getRoomDevices = async (roomId) => {
    return await get(`/iot-devices?room_id=${roomId}`);
};

export const getRecordingStatus = async (meetingId, sessionId) => {
    return await get(`/live-meetings/${meetingId}/recording/${sessionId}/status`);
};

export const getRecordingSessions = async (meetingId) => {
    return await get(`/meetings/${meetingId}/recording-sessions`);
};

export const getRecordingConfig = async (meetingId) => {
    return await get(`/meetings/${meetingId}/recording-config`);
};

export const updateRecordingConfig = async (meetingId, data) => {
    return await patch(`/meetings/${meetingId}/recording-config`, data);
};
