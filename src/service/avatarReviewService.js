import { get, post, dele } from '../utils/request';

/** GET /api/v1/admin/biometric-submissions */
export const getAvatarSubmissions = async (params = {}) => {
    const cleaned = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const query = new URLSearchParams(cleaned).toString();
    return get(`/admin/biometric-submissions${query ? `?${query}` : ''}`);
};

/** GET /api/v1/admin/biometric-submissions/:id */
export const getAvatarSubmissionDetail = async (id) => get(`/admin/biometric-submissions/${id}`);

/** GET /api/v1/admin/biometric-submissions/:id/download-url[?mediaFileId=] — không truyền = ảnh chính. */
export const getAvatarDownloadUrl = async (id, mediaFileId) =>
    get(`/admin/biometric-submissions/${id}/download-url${mediaFileId ? `?mediaFileId=${encodeURIComponent(mediaFileId)}` : ''}`);

/** POST /api/v1/admin/biometric-submissions/:id/approve */
export const approveAvatarSubmission = async (id) => post(`/admin/biometric-submissions/${id}/approve`, {});

/** POST /api/v1/admin/biometric-submissions/:id/reject  body: { reason } */
export const rejectAvatarSubmission = async (id, reason) => post(`/admin/biometric-submissions/${id}/reject`, { reason });

/** DELETE /api/v1/admin/biometric-submissions/:id */
export const deleteAvatarSubmission = async (id) => dele(`/admin/biometric-submissions/${id}`);
