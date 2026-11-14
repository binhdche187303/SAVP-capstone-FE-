// src/service/reportTemplateService.js
// Mẫu báo cáo quy chuẩn (NĐ 30/2020) — BE: /report-templates.
// Cờ mock bật: mẫu lưu trong localStorage, không dựng được file xem thử (bộ dựng nằm ở BE).
import { get, post, patch, dele, buildQuery } from '../utils/request';
import { REPORT_MOCK_ENABLED } from '../config/featureFlags';
import * as mock from '../mocks/visitorReport/templateApi';

// Trang tự hiện lỗi (khối lỗi / toast) nên tắt toast mặc định của request() để khỏi báo hai lần.
const QUIET = { skipToast: true };

const real = async (fn) => {
    try {
        const res = await fn();
        return res?.success ? res : { success: false, message: res?.message || 'Thao tác không thành công' };
    } catch (error) {
        return { success: false, message: error?.error?.message || error?.message || 'Không kết nối được máy chủ', code: error?.error?.code };
    }
};

const call = async (mockFn, realFn) => {
    if (!REPORT_MOCK_ENABLED) return real(realFn);
    try {
        return { success: true, data: await mockFn() };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

/** Mẫu dùng được cho một loại báo cáo (mẫu riêng + mẫu chung). Không truyền loại = tất cả. */
export const listTemplates = (reportType) =>
    call(() => mock.listTemplates(reportType), () => get(`/report-templates${buildQuery({ reportType })}`, QUIET));

export const getTemplate = (id) => call(() => mock.getTemplate(id), () => get(`/report-templates/${id}`, QUIET));

/** Bố cục mặc định theo NĐ 30 — điểm xuất phát khi tạo mẫu mới. */
export const getTemplateDefaults = () => call(() => mock.getTemplateDefaults(), () => get('/report-templates/defaults', QUIET));

export const createTemplate = (payload) => call(() => mock.createTemplate(payload), () => post('/report-templates', payload, QUIET));

export const updateTemplate = (id, payload) =>
    call(() => mock.updateTemplate(id, payload), () => patch(`/report-templates/${id}`, payload, QUIET));

export const duplicateTemplate = (id) =>
    call(() => mock.duplicateTemplate(id), () => post(`/report-templates/${id}/duplicate`, undefined, QUIET));

export const deleteTemplate = (id) => call(() => mock.deleteTemplate(id), () => dele(`/report-templates/${id}`, QUIET));

/** Tra người ký trong danh sách người dùng: [{ id, fullName, positionTitle, departmentName }]. */
export const searchSigners = (q) =>
    call(() => mock.searchSigners(q), () => get(`/report-templates/signers${buildQuery({ q })}`, QUIET));

/** Tải ảnh logo / logo nền (PNG, JPEG ≤ 2 MB) → { mediaFileId, url }. */
export const uploadTemplateAsset = (file) =>
    call(() => mock.uploadTemplateAsset(file), () => {
        const form = new FormData();
        form.append('file', file, file.name || 'logo.png');
        return post('/report-templates/assets', form, QUIET);
    });

/** Dựng thử bố cục CHƯA lưu với số liệu minh họa → `{ success, data: Blob }`. */
/**
 * Bản quy chuẩn cho các trang tự tổng hợp dữ liệu (Nhật ký ra/vào phòng, Truy vết, Hành trình, Lưu lượng…).
 * `standard` = kết quả hộp thoại chọn kiểu bản xuất; `document` = nội dung đã dựng (xem utils/standardDocument.js).
 * Trả `{ success, data: Blob }`. Chế độ giả không dựng được (bộ dựng nằm ở BE).
 */
export const renderStandardDocument = ({ format, standard, document }) =>
    call(() => { throw new Error('Bản quy chuẩn cần kết nối máy chủ (đang bật chế độ dữ liệu giả)'); }, async () => {
        const res = await post('/report-templates/render-document', { format, ...standard, document }, QUIET);
        if (res?.isBlob) return res;
        return { success: false, message: res?.message || 'Không dựng được bản quy chuẩn' };
    });

export const previewTemplate = ({ layout, format = 'pdf', reportType }) =>
    call(() => mock.previewTemplate(), async () => {
        const res = await post('/report-templates/preview', { layout, format, reportType }, QUIET);
        if (res?.isBlob) return res;
        return { success: false, message: res?.message || 'Không dựng được bản xem thử' };
    });
