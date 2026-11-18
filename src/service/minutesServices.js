import { get, post, patch, dele, buildQuery } from '../utils/request';

/**
 * Lấy cấu hình AI Draft (để kiểm tra xem tính năng AI Summarize có bật không)
 * @param {string} meetingId 
 */
export const getAiDraftConfig = async (meetingId) => {
    return await get(`/meetings/${meetingId}/minutes/ai-draft-config`);
};

/**
 * Tạo AI Draft Job
 * @param {string} meetingId 
 * @param {object} payload { transcriptId, language, forceRerun }
 */
export const createAiDraftJob = async (meetingId, payload) => {
    return await post(`/meetings/${meetingId}/minutes/ai-draft-jobs`, payload);
};

/**
 * Lấy danh sách AI Draft Jobs để tiếp tục polling
 * @param {string} meetingId 
 */
export const getAiDraftJobs = async (meetingId) => {
    return await get(`/meetings/${meetingId}/minutes/ai-draft-jobs`);
};

/**
 * Tạo biên bản cuộc họp thủ công
 * @param {string} meetingId 
 * @param {object} payload { title }
 */
export const createManualMinutes = async (meetingId, payload) => {
    return await post(`/meetings/${meetingId}/minutes`, payload);
};

/**
 * Lấy chi tiết biên bản cuộc họp
 * @param {string} minutesId
 */
export const getMeetingMinutesById = async (minutesId) => {
    return await get(`/meeting-minutes/${minutesId}`);
};

/**
 * So sánh bản biên bản thủ công và bản AI của cùng 1 cuộc họp (song song, độc lập).
 * Trả về { manual: MinutesListItemDto|null, ai: MinutesListItemDto|null }.
 * @param {string} meetingId
 */
export const compareMeetingMinutes = async (meetingId) => {
    return await get(`/meeting-minutes/compare${buildQuery({ meetingId })}`);
};

/**
 * Bật/tắt chế độ chia sẻ trực tiếp bản nháp cho participant xem read-only (MKM-LIVE-01).
 * Chỉ Host (preparedBy) gọi được, chỉ áp dụng khi status=draft.
 * @param {string} minutesId
 * @param {boolean} enabled
 */
export const toggleLiveShareMinutes = async (minutesId, enabled) => {
    return await patch(`/meeting-minutes/${minutesId}/live-share`, { enabled });
};

/**
 * Cập nhật nội dung biên bản cuộc họp
 * @param {string} minutesId 
 * @param {object} payload { versionNo, title, minutesContent, decisionsJson, actionItemsJson, aiSummary }
 */
export const updateMeetingMinutes = async (minutesId, payload) => {
    return await patch(`/meeting-minutes/${minutesId}`, payload);
};

/**
 * Xóa biên bản cuộc họp nháp
 * @param {string} minutesId 
 */
export const deleteMeetingMinutes = async (minutesId) => {
    return await dele(`/meeting-minutes/${minutesId}`);
};

/**
 * Ban hành chính thức biên bản cuộc họp
 * @param {string} minutesId 
 */
export const issueMeetingMinutes = async (minutesId) => {
    return await post(`/meeting-minutes/${minutesId}/issue`);
};

/**
 * Theo dõi trạng thái background job (dùng chung cho AI & STT)
 * @param {string} jobId
 */
export const getBackgroundJob = async (jobId) => {
    return await get(`/background-jobs/${jobId}`);
};

/**
 * Gửi/thông báo biên bản đã ban hành cho toàn bộ người tham dự.
 * Participant nội bộ nhận in-app + email; khách ngoài công ty nhận email đính kèm PDF tự động.
 * @param {string} meetingId  — path param (khác với minutesId trong body)
 * @param {object} payload { minutesId, recipientScope, channels, message? }
 */
export const distributeMeetingMinutes = async (meetingId, payload) => {
    return await post(`/meetings/${meetingId}/minutes/distributions`, payload);
};
