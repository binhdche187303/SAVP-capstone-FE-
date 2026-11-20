// Luật chống tạo trùng mẫu báo cáo (khớp BE): mỗi loại báo cáo tối đa MỘT mẫu riêng, cộng MỘT mẫu
// "Tất cả báo cáo" (reportTypes rỗng) → cả hệ thống tối đa REPORT_TYPES.length + 1 mẫu; tên không trùng.
import { REPORT_TYPES } from '../../../config/reportDefinitions';

const norm = (name) => String(name || '').trim().toLocaleLowerCase('vi');

/** Hai phạm vi có đụng nhau không: mẫu chung chỉ đụng mẫu chung, mẫu riêng đụng mẫu riêng chung loại. */
export const scopesOverlap = (a = [], b = []) => (!a.length || !b.length ? !a.length && !b.length : a.some((t) => b.includes(t)));

/** Mẫu khác đang giữ phạm vi này → `{ template, overlap }` (overlap rỗng = đụng mẫu "Tất cả báo cáo"), hoặc null. */
export const findScopeConflict = (templates, reportTypes, exceptId) => {
    const hit = (templates || []).find((t) => t.id !== exceptId && scopesOverlap(t.reportTypes, reportTypes));
    return hit ? { template: hit, overlap: reportTypes.filter((x) => hit.reportTypes.includes(x)) } : null;
};

export const findNameConflict = (templates, name, exceptId) =>
    (templates || []).find((t) => t.id !== exceptId && norm(t.name) === norm(name)) || null;

/** Loại báo cáo → mẫu riêng đang giữ loại đó (bỏ qua mẫu đang sửa). */
export const takenTypes = (templates, exceptId) => {
    const out = {};
    (templates || []).forEach((t) => { if (t.id !== exceptId) t.reportTypes.forEach((x) => { out[x] = t; }); });
    return out;
};

export const hasGeneralTemplate = (templates, exceptId) => (templates || []).some((t) => t.id !== exceptId && !t.reportTypes.length);

/** Đã đủ chỗ (mọi loại có mẫu riêng + đã có mẫu chung) → không tạo thêm được. */
export const templatesFull = (templates) => {
    const taken = takenTypes(templates);
    return hasGeneralTemplate(templates) && REPORT_TYPES.every((t) => taken[t]);
};
