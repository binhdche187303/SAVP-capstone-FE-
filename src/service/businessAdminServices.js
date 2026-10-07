import { request, get, post, patch, dele, buildQuery } from '../utils/request';

// ============================================================
// DASHBOARD & ANALYTICS APIs for Business Admin
// ============================================================

export const getDashboardOverview = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/dashboard/overview${query}`);
};

export const getRoomAnalytics = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/rooms/dashboard${query}`);
};

export const getAttendanceAnalytics = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/attendance/on-time-rate${query}`);
};

export const getRoomUtilizationRate = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/rooms/utilization-rate${query}`);
};

export const getNoShowStats = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/rooms/no-show-rate${query}`);
};

export const getOnTimeRate = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/attendance/on-time-rate${query}`);
};

export const getMeetingsCountByPeriod = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/count-by-period${query}`);
};

export const getMeetingStatusBreakdown = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/status-breakdown${query}`);
};

export const getAverageMeetingDuration = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/average-duration${query}`);
};

export const getMeetingCancelRate = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/analytics/meetings/cancel-rate${query}`);
};

export const exportMeetingActivity = async (data) => {
    return await post('/reports/meeting-activity/exports', data);
};

// ============================================================
// USER MANAGEMENT APIs (UC-ACC-01 ~ UC-ACC-07)
// ============================================================

export const getUsers = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/users${query}`);
};

export const getUsersForManagement = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/users/manage${query}`);
};

export const getUserById = async (userId) => {
    return await get(`/users/${userId}`);
};

export const createUser = async (data) => {
    return await post('/users', data);
};

// Tạo tài khoản đối tác — gửi FormData (multipart/form-data) vì có avatarFile
// Dùng buildPartnerFormData() từ src/constants/partnerAccount.js để tạo payload
export const createPartnerUser = async (formData) => {
    return await post('/users', formData);
};

export const updateUser = async (userId, data) => {
    return await patch(`/users/${userId}`, data);
};

// Gia hạn hoặc khoá sớm tài khoản đối tác bằng cách cập nhật accountExpiresAt
// Khoá ngay: truyền new Date().toISOString()
// Gia hạn: truyền thời điểm tương lai (ISO 8601)
export const updatePartnerExpiry = async (userId, accountExpiresAt) => {
    return await patch(`/users/${userId}`, { accountExpiresAt });
};

export const updateUserRoles = async (userId, data) => {
    return await request(`/users/${userId}/roles`, { method: 'PUT', body: data });
};

export const lockUser = async (userId, data = {}) => {
    return await patch(`/users/${userId}/lock`, {
        reason: data.reason || 'Vi phạm quy định bảo mật'
    });
};

/**
 * UC-11: Mở khóa tài khoản người dùng
 * BE đúng: PATCH /users/:userId/unlock
 * @param {number|string} userId
 * @param {object} data - { reason }
 */
export const unlockUser = async (userId, data = {}) => {
    return await patch(`/users/${userId}/unlock`, {
        reason: data.reason || 'Mở khóa tài khoản'
    });
};

export const updateUserStatus = async (userId, data) => {
    return await patch(`/users/${userId}/status`, data);
};

export const deleteUser = async (userId) => {
    return await dele(`/users/${userId}`);
};

/**
 * UC-ACC-07: Xem lịch sử hoạt động của user theo đối tượng bị tác động
 * BE Option B: GET /users/:userId/audit-logs (entity_type='users' AND entity_id=userId)
 * Permission: audit.users.read (BUSINESS_ADMIN + SYSTEM_ADMIN)
 */
export const getUserAuditLogs = async (userId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/users/${userId}/audit-logs${query}`);
};

/**
 * UC-ACC-02: Import tài khoản từ Excel
 * BE đúng: POST /users/import (không còn /users/import-jobs)
 */
export const importUsers = async (formData) => {
    return await post('/users/import', formData);
};

export const importPartnerUsers = async (formData) => {
    return await post('/users/import-partners', formData);
};

export const getImportTemplate = async () => {
    return await get('/users/import/template');
};

export const getPartnerImportTemplate = async () => {
    return await get('/users/import-partners/template');
};

export const exportUsers = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/users/export${query}`, { responseType: 'blob' });
};

// ============================================================
// REFERENCE APIs (Phòng ban, Vai trò, Background Job)
// ============================================================

export const getDepartments = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/departments${query}`);
};

export const getDepartmentById = async (id) => {
    return await get(`/departments/${id}`);
};

export const createDepartment = async (data) => {
    return await post('/departments', data);
};

export const updateDepartment = async (id, data) => {
    return await patch(`/departments/${id}`, data);
};

export const deactivateDepartment = async (id) => {
    return await post(`/departments/${id}/deactivate`);
};

export const reactivateDepartment = async (id) => {
    return await post(`/departments/${id}/reactivate`);
};

/**
 * Danh sách nhân viên trực thuộc trực tiếp 1 phòng ban (không đệ quy phòng ban con).
 * BE: GET /departments/:id/members — dùng để nạp nhanh cả phòng ban vào danh sách
 * người tham dự khi đặt lịch họp.
 * @param {string} departmentId
 */
export const getDepartmentMembers = async (departmentId) => {
    return await get(`/departments/${departmentId}/members`);
};



export const getRoles = async () => {
    return await get('/roles');
};

export const getBackgroundJobStatus = async (jobId) => {
    return await get(`/background-jobs/${jobId}`);
};

// ============================================================
// ROOM MANAGEMENT APIs (UC-57 ~ UC-60)
// ============================================================

export const getRooms = async (params = {}) => {
    const query = buildQuery(params);
    // BE không có route /rooms/available — endpoint thật là /rooms/search
    return await get(`/rooms/search${query}`);
};

export const getRoomRealtimeStatus = async () => {
    return await get('/rooms/realtime-status');
};

/**
 * Lấy no-show case mới nhất theo phòng.
 * status filter phải là một trong: risk | warning_sent | confirmed | released | dismissed | resolved
 * @param {string} roomId
 * @param {string} [detectionStatus] - enum value từ NoShowDetectionStatus (tuỳ chọn)
 */
export const getNoShowByRoom = async (roomId, detectionStatus) => {
    const params = { roomId, limit: 5 };
    if (detectionStatus) params.status = detectionStatus;
    const query = buildQuery(params);
    return await get(`/no-show-cases${query}`);
};

export const handleNoShowCase = async (caseId, data) => {
    return await patch(`/no-show-cases/${caseId}`, data);
};

// reason là bắt buộc theo BE (@IsNotEmpty @MaxLength(500))
export const releaseNoShowRoom = async (caseId, reason) => {
    return await post(`/no-show-cases/${caseId}/release`, { reason });
};

export const getAllNoShowCases = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/no-show-cases${query}`);
};

// ============================================================
// SECURITY & STRANGER ALERTS APIs
// ============================================================

export const getStrangerAlerts = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/face-access/stranger-alerts${query}`);
};

/** Các lần xuất hiện của 1 người lạ (trang Người lạ). strangerId null = thiết bị không gán mã. */
export const getStrangerSightings = async (deviceId, strangerId) => {
    const query = buildQuery(strangerId ? { strangerId } : {});
    return await get(`/face-access/stranger-alerts/${deviceId}/sightings${query}`);
};

export const resolveStrangerAlert = async (alertId, data) => {
    // sync BE: Redirect to real security-alerts endpoint
    return await post(`/security-alerts/${alertId}/resolve`, { resolution_note: data.resolution_note || data.reason || '' });
};

export const createRoom = async (data) => {
    return await post('/rooms', data);
};

export const updateRoom = async (roomId, data) => {
    return await patch(`/rooms/${roomId}`, data);
};

// status: 'available' | 'maintenance' | 'inactive'. Gui 'available' de go override.
export const updateRoomAdministrativeStatus = async (roomId, data) => {
    return await patch(`/rooms/${roomId}/administrative-status`, data);
};

export const deleteRoom = async (roomId) => {
    return await dele(`/rooms/${roomId}`);
};

export const getRoomDeletionImpact = async (roomId) => {
    return await get(`/rooms/${roomId}/deletion-impact`);
};

export const getRoomDetail = async (roomId) => {
    return await get(`/rooms/${roomId}`);
};

// ============================================================
// MEETING MANAGEMENT APIs (UC-18 ~ UC-34)
// ============================================================

export const getMeetings = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings${query}`);
};

export const createMeeting = async (data) => {
    return await post('/meetings', data);
};

export const updateMeeting = async (meetingId, data) => {
    return await patch(`/meetings/${meetingId}`, data);
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

export const cancelMeeting = async (meetingId, reason = 'Huỷ bởi quản trị viên') => {
    // BE DTO (cancel-meeting.dto.ts) dùng field cancellationReason, không phải reason
    return await post(`/meetings/${meetingId}/cancel`, { cancellationReason: reason });
};

export const approveMeeting = async (meetingId) => {
    return await post(`/meetings/${meetingId}/approve`);
};

// ============================================================
// RECORDING MANAGEMENT APIs — đã chuyển sang /media-files/*
// ============================================================

/**
 * Lấy danh sách file media của cuộc họp
 * BE: GET /meetings/:meetingId/media-files
 * @param {string} meetingId
 * @param {object} params
 */
export const getMeetingMediaFiles = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/media-files${query}`);
};

/**
 * Tải xuống file media (secure download)
 * BE: GET /media-files/:fileId/secure-download
 * @param {string} fileId - ID file media
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

/**
 * Cập nhật quyền xem file media
 * BE: PATCH /media-files/:fileId/visibility
 * @param {string} fileId
 * @param {object} data - { visibility }
 */
export const updateMediaVisibility = async (fileId, data) => {
    return await patch(`/media-files/${fileId}/visibility`, data);
};

// ============================================================
// NOTIFICATION APIs (UC-NOTI-01 ~ UC-NOTI-05)
// ============================================================

export const getNotifications = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/notifications${query}`);
};

/**
 * UC-NOTI-02: Đánh dấu thông báo đã đọc — PATCH /notifications/:id/read
 */
export const markNotificationRead = async (notificationId) => {
    return await patch(`/notifications/${notificationId}/read`);
};

/**
 * UC-NOTI-03: Đánh dấu tất cả thông báo đã đọc — PATCH /notifications/read-all
 */
export const markAllNotificationsRead = async () => {
    return await patch('/notifications/read-all');
};

// ============================================================
// B-M7: GỬI THÔNG BÁO CUỘC HỌP (Meeting Notifications)
// Lưu ý: Tất cả POST trả HTTP 202 — KHÔNG có response.message
// ============================================================

// B-M7.1 — Gửi lời mời họp
export const sendMeetingInvitations = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/invitations`, data);
};

// B-M7.2 — Gửi nhắc nhở họp
export const sendMeetingReminder = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/reminders`, data);
};

// B-M7.3 — Gửi thông báo hủy họp (chỉ khi meeting đã cancelled)
export const sendCancellationNotification = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/cancellation-notifications`, data);
};

// B-M7.4 — Phân phối biên bản
export const sendMinutesDistribution = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/minutes/distributions`, data);
};

// B-M7.5 — Xem chi tiết 1 thông báo (self)
export const getNotificationDetail = async (notificationId) => {
    return await get(`/notifications/${notificationId}`);
};

// ============================================================
// B-M8: PARTICIPANTS & AGENDA NÂNG CAO
// ============================================================

// B-M8.1 — Danh sách phòng trống thay thế
export const getMeetingAvailableRooms = async (meetingId, params = {}) => {
    const query = buildQuery(params);
    return await get(`/meetings/${meetingId}/available-rooms${query}`);
};

// B-M8.3 — Tải template Excel import participant.
// Trả về { success, isBlob: true, data: Blob } (xem handleResponse trong utils/request.js)
// — KHÔNG phải Blob trần, phải dùng res.data khi tạo object URL.
export const downloadParticipantImportTemplate = async (meetingId) => {
    return await get(`/meetings/${meetingId}/participants/import/template`);
};

// B-M8.4 — Import participants từ file Excel (2 bước).
// Bước 1 trả 422 kèm preview từng dòng -> caller cần truyền { skipToast: true } để tự
// render preview thay vì bị toast đỏ báo lỗi.
export const importMeetingParticipants = async (meetingId, formData, options = {}) => {
    return await post(`/meetings/${meetingId}/participants/import`, formData, options);
};

// B-M8.5 — Thêm khách bên ngoài tổ chức
export const addExternalParticipant = async (meetingId, data) => {
    return await post(`/meetings/${meetingId}/participants/external`, data);
};

// B-M8.6 — Xóa khách bên ngoài
export const removeExternalParticipant = async (meetingId, externalParticipantId, data = {}) => {
    return await dele(`/meetings/${meetingId}/participants/external/${externalParticipantId}`, data);
};

// B-M8.7 — Xóa người tham gia nội bộ
export const removeInternalParticipant = async (meetingId, participantUserId, data = {}) => {
    return await dele(`/meetings/${meetingId}/participants/${participantUserId}`, data);
};

// ============================================================
// B-M6: BIÊN BẢN NÂNG CAO (Minutes)
// ============================================================

// B-M6.0 — Danh sách biên bản toàn công ty (Business Admin = all, Manager = dept-scoped)
export const listMinutes = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/meeting-minutes${query}`);
};

// B-M6.1 — Tìm biên bản theo người (limit max 20)
export const searchMinutesByPerson = async (userId, params = {}) => {
    const query = buildQuery({ userId, ...params });
    return await get(`/meeting-minutes/search-by-person${query}`);
};

// B-M6.2 — Gắn/gỡ tài nguyên vào biên bản
export const linkMinutesResources = async (minutesId, data) => {
    return await patch(`/meeting-minutes/${minutesId}/link-resources`, data);
};

// B-M6.3 — Chia sẻ biên bản cho user
export const createMinutesShare = async (minutesId, data) => {
    return await post(`/meeting-minutes/${minutesId}/shares`, data);
};

// B-M6.4 — Danh sách người được chia sẻ biên bản
export const getMinutesShares = async (minutesId) => {
    return await get(`/meeting-minutes/${minutesId}/shares`);
};

// B-M6.5 — Thu hồi chia sẻ biên bản
export const revokeMinutesShare = async (minutesId, userId) => {
    return await dele(`/meeting-minutes/${minutesId}/shares/${userId}`);
};

// B-M6.6 — Tạo job export biên bản (PDF/Docx) — poll /background-jobs/:jobId
export const exportMinutes = async (minutesId, data) => {
    return await post(`/meeting-minutes/${minutesId}/exports`, data);
};

// B-M6.7 — Upload file đính kèm biên bản
export const uploadMinutesAttachment = async (minutesId, formData) => {
    return await post(`/meeting-minutes/${minutesId}/attachments`, formData);
};

// B-M6.8 — Danh sách file đính kèm biên bản
export const getMinutesAttachments = async (minutesId) => {
    return await get(`/meeting-minutes/${minutesId}/attachments`);
};

// B-M6.9 — Xóa file đính kèm biên bản
export const deleteMinutesAttachment = async (minutesId, fileId) => {
    return await dele(`/meeting-minutes/${minutesId}/attachments/${fileId}`);
};

// Background job polling — getBackgroundJobStatus đã được khai báo ở dòng 158

// ============================================================
// IVSS / PORTRAIT APIs
// ============================================================
export const resyncUserPortrait = async (userId) => {
    return await post(`/admin/ivss/portrait/${userId}/resync`);
};
