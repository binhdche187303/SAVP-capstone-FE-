import { get, post, patch, put, dele, buildQuery } from '../utils/request';

// ============================================================
// DASHBOARD & ANALYTICS APIs for Department Manager
// ============================================================

/**
 * Fetch overview stats for manager's department
 * @param {object} params - { from, to, departmentId }
 */
export const getManagerOverview = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/dashboard/overview${query}`);
};

/**
 * Fetch room analytics for manager's department
 */
export const getManagerRoomAnalytics = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/rooms/dashboard${query}`);
};

/**
 * Fetch attendance analytics for manager's department
 */
/**
 * UC-150: Thống kê điểm danh & hiện diện theo phòng ban
 * Endpoint: GET /analytics/attendance/on-time-rate
 */
export const getManagerAttendanceAnalytics = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/attendance/on-time-rate${query}`);
};

/**
 * Fetch meetings trend count
 */
export const getManagerMeetingsCountByPeriod = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/count-by-period${query}`);
};

/**
 * Fetch status breakdown for department meetings
 */
export const getManagerMeetingStatusBreakdown = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/status-breakdown${query}`);
};

/**
 * Fetch average meeting duration for department
 */
export const getManagerAverageMeetingDuration = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/average-duration${query}`);
};

/**
 * Fetch cancel rate for department meetings
 */
export const getManagerMeetingCancelRate = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/cancel-rate${query}`);
};

/**
 * Fetch no-show stats for department
 */
export const getManagerNoShowStats = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/rooms/no-show-rate${query}`);
};

// ============================================================
// MEETING APPROVAL REQUESTS (UC-SM-05 & UC-SM-06)
// ============================================================

/**
 * Fetch meeting requests pending manager approval
 * Contract: GET /meeting-requests (MeetingRequestQueryDto - camelCase, whitelist-only params)
 * @param {object} params - { approvalStatus, page, limit, requestType, targetRoomId, requestedById, from, to, q, sortBy, sortOrder }
 */
export const getPendingMeetingRequests = async (params = {}) => {
    const queryObj = {
        page: params.page || 1,
        limit: params.limit || 20,
    };
    
    if (params.approvalStatus) {
        queryObj.approvalStatus = params.approvalStatus;
    } else {
        queryObj.approvalStatus = 'pending';
    }

    if (params.requestType) queryObj.requestType = params.requestType;
    if (params.targetRoomId) queryObj.targetRoomId = params.targetRoomId;
    if (params.requestedById) queryObj.requestedById = params.requestedById;
    if (params.from) queryObj.from = params.from;
    if (params.to) queryObj.to = params.to;
    if (params.q) queryObj.q = params.q;
    
    // Fix snake_case to camelCase for backend whitelist
    if (params.sortBy) {
        queryObj.sortBy = params.sortBy === 'requested_at' ? 'requestedAt' : params.sortBy;
    }
    if (params.sortOrder) queryObj.sortOrder = params.sortOrder;

    return await get(`/meeting-requests${buildQuery(queryObj)}`);
};

/**
 * UC-SM-05: Approve meeting room request
 * Contract: POST /meeting-requests/{id}/approve { decisionNote }
 */
export const approveMeetingRequest = async (requestId, decisionNote = '') => {
    return await post(`/meeting-requests/${requestId}/approve`, { decisionNote });
};

/**
 * UC-SM-06: Reject meeting room request
 * Contract: POST /meeting-requests/{id}/reject { rejectionReason }
 */
export const rejectMeetingRequest = async (requestId, rejectionReason = '') => {
    return await post(`/meeting-requests/${requestId}/reject`, { rejectionReason });
};

/**
 * UC-158: Export meeting activities report
 */
export const exportMeetingActivity = async (data) => {
    return await post('/reports/meeting-activity/exports', data);
};

/**
 * Get departments list
 */
export const getDepartments = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/departments${query}`);
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



export const getMeetingPresence = async (meetingId) => {
    return await get(`/ivss/meetings/${meetingId}/presence`);
};

export const getUserPresence = async (meetingId, userId) => {
    return await get(`/ivss/meetings/${meetingId}/presence/${userId}`);
};

export const getMeetingPresenceReport = async (meetingId) => {
    return await get(`/ivss/meetings/${meetingId}/presence/report`);
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

export const addRecordingConfig = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/recording-config`, data);
};

/**
 * Thay thế toàn bộ agenda — BE dùng PUT /meetings/:id/agendas (ReplaceAgendaDto),
 * KHÔNG lồng vào PATCH /meetings/:id (updateMeeting chỉ nhận title/description).
 */
export const replaceAgendas = async (meetingId, items) => {
    return await put(`/meetings/${meetingId}/agendas`, { items });
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
 * Lấy danh sách phòng họp (BE không có /rooms/available — dùng /rooms/search thật)
 */
export const getRooms = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/rooms/search${query}`);
};

/**
 * Get users (for inviting participants)
 */
export const getUsers = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/users${query}`);
};

// ============================================================
// MEDIA & RECORDING ENDPOINTS (ADDED)
// ============================================================

export const getMeetingMediaFiles = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/media-files${query}`);
};

export const getMediaFile = async (fileId) => {
    return await get(`/media-files/${fileId}`);
};

export const getMediaFilePlayback = async (fileId) => {
    return await get(`/media-files/${fileId}/playback`);
};

export const updateMediaVisibility = async (fileId, data) => {
    return await patch(`/media-files/${fileId}/visibility`, data);
};

// ============================================================
// MEETING NOTES & ACTIONS ENDPOINTS (RESTORED)
// ============================================================

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
 * UC-101: Xem trạng thái điểm danh người tham dự (UC-81)
 * Endpoint: GET /meetings/{meetingId}/attendance
 */
export const getMeetingAttendance = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/attendance${query}`);
};

export const manualAttendanceCheckIn = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/attendance`, data);
};

export const updateAttendanceStatus = async (meetingId, recordId, data) => {
    return await patch(`/meetings/${meetingId}/attendance/${recordId}/status`, data);
};

export const updateAttendanceRecord = async (meetingId, recordId, data) => {
    return await patch(`/meetings/${meetingId}/attendance/${recordId}`, data);
};

export const invalidateAttendanceRecord = async (meetingId, recordId, data) => {
    return await post(`/meetings/${meetingId}/attendance/${recordId}/invalidate`, data);
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
// RECORDING & NO-SHOW CONTROL ENDPOINTS (ADDED)
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

export const getAllNoShowCases = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/no-show-cases${query}`);
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

export const uploadAgendaAttachment = async (meetingId, agendaId, formData) => {
    return await post(`/meetings/${meetingId}/agendas/${agendaId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const deleteAgendaAttachment = async (meetingId, agendaId, fileId) => {
    return await dele(`/meetings/${meetingId}/agendas/${agendaId}/attachments/${fileId}`);
};

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
 * Lấy danh sách phòng trống cho một cuộc họp cụ thể đang sửa
 * Backend tự động loại các phòng bị đặt trung lịch, bao gồm cả phòng hiện tại của cuộc họ p.
 * @param {string} meetingId - UUID cuộc họ p
 * @param {object} options - { includeCurrentRoom?: boolean, capacityWarningMode?: boolean, startTime, endTime }
 */
export const getAvailableRoomsForMeeting = async (meetingId, options = {}) => {
    const query = buildQuery(options);
    return await get(`/meetings/${meetingId}/available-rooms${query}`);
};
