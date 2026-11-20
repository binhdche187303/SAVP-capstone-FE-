// Dữ liệu giả cho "Mẫu báo cáo quy chuẩn" — chỉ để màn cấu hình chạy được khi chưa nối BE.
// Lưu riêng một khóa localStorage (không đụng seed của phân hệ Khách / Báo cáo).
import { getReportDefinition } from '../../config/reportDefinitions';
import { defaultLayout, validateLayout, LIMITS } from '../../components/report/template/layoutModel';
import { findNameConflict, findScopeConflict } from '../../components/report/template/templateScope';

export const TEMPLATE_STORAGE_KEY = 'savp.reportTemplateMock';

const SIGNERS = [
    { id: '00000000-0000-4000-8000-000000000001', fullName: 'Nguyễn Văn An', positionTitle: 'Hiệu trưởng', departmentName: 'Ban Giám hiệu' },
    { id: '00000000-0000-4000-8000-000000000002', fullName: 'Trần Thị Bình', positionTitle: 'Trưởng phòng', departmentName: 'Phòng Hành chính' },
    { id: '00000000-0000-4000-8000-000000000003', fullName: 'Lê Hoàng Cường', positionTitle: 'Phó Trưởng phòng', departmentName: 'Phòng Hành chính' },
    { id: '00000000-0000-4000-8000-000000000004', fullName: 'Phạm Thu Dung', positionTitle: 'Chuyên viên văn thư', departmentName: 'Phòng Hành chính' },
    { id: '00000000-0000-4000-8000-000000000005', fullName: 'Võ Minh Đức', positionTitle: 'Trưởng phòng', departmentName: 'Phòng Đào tạo' },
];

let memory = null;
// Ảnh tải lên ở chế độ giả chỉ sống trong phiên làm việc (không nhét ảnh vào localStorage).
const assetUrls = new Map();

const fail = (message) => { throw new Error(message); };

const seed = () => {
    const layout = defaultLayout();
    layout.signatures[1].defaultSigner = { userId: SIGNERS[1].id, fullName: SIGNERS[1].fullName };
    return {
        seq: 1,
        templates: [{
            id: '10000000-0000-4000-8000-000000000001',
            name: 'Mẫu chuẩn VISMA (NĐ 30)',
            reportTypes: [],
            layout,
            updatedAt: new Date().toISOString(),
            updatedByName: 'Dữ liệu minh họa',
        }],
    };
};

const load = () => {
    if (memory) return memory;
    try {
        const stored = JSON.parse(window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || 'null');
        memory = stored && Array.isArray(stored.templates) ? stored : seed();
        // Bản lưu cũ: reportType (1 loại | null) → reportTypes.
        memory.templates.forEach((t) => {
            if (!Array.isArray(t.reportTypes)) t.reportTypes = t.reportType ? [t.reportType] : [];
            delete t.reportType;
            delete t.isDefault;
        });
    } catch {
        memory = seed();
    }
    return memory;
};

const save = () => {
    try { window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(memory)); } catch { /* demo vẫn chạy trong bộ nhớ */ }
};

export const resetTemplates = () => {
    memory = seed();
    assetUrls.clear();
    save();
};

const view = (t) => ({
    ...t,
    layout: JSON.parse(JSON.stringify(t.layout)),
    assetUrls: Object.fromEntries([t.layout.logo.mediaFileId, t.layout.watermark.mediaFileId]
        .filter((id) => id && assetUrls.has(id)).map((id) => [id, assetUrls.get(id)])),
});

const find = (id) => load().templates.find((t) => t.id === id) || fail('Không tìm thấy mẫu báo cáo');

const clean = (payload, current) => {
    const name = payload.name === undefined ? current?.name : String(payload.name || '').trim();
    if (!name) fail('Vui lòng nhập tên mẫu');
    if (name.length > LIMITS.name) fail(`Tên mẫu tối đa ${LIMITS.name} ký tự`);
    const reportTypes = payload.reportTypes === undefined ? current?.reportTypes ?? [] : [...new Set(payload.reportTypes || [])];
    if (reportTypes.some((t) => !getReportDefinition(t))) fail('Loại báo cáo không tồn tại');
    const layout = payload.layout === undefined ? current?.layout ?? defaultLayout() : payload.layout;
    const problem = validateLayout(layout);
    if (problem) fail(problem);
    return { name, reportTypes, layout: JSON.parse(JSON.stringify(layout)) };
};

const conflict = (message, code, details) => { const e = new Error(message); e.code = code; e.details = details; throw e; };

// Giống BE: chỉ kiểm phần đổi (mẫu cũ đang trùng vẫn sửa được nội dung).
const assertNoConflict = (next, current) => {
    const others = load().templates;
    const exceptId = current?.id;
    if (!current || next.name.trim().toLocaleLowerCase('vi') !== current.name.trim().toLocaleLowerCase('vi')) {
        const same = findNameConflict(others, next.name, exceptId);
        if (same) conflict(`Đã có mẫu tên "${same.name}", vui lòng đặt tên khác`, 'TEMPLATE_NAME_TAKEN', { templateId: same.id, templateName: same.name });
    }
    const sameTypes = current && current.reportTypes.length === next.reportTypes.length && current.reportTypes.every((t) => next.reportTypes.includes(t));
    if (!sameTypes) {
        const hit = findScopeConflict(others, next.reportTypes, exceptId);
        if (hit) {
            const scope = hit.overlap.length ? hit.overlap.map((t) => `"${getReportDefinition(t)?.title || t}"`).join(', ') : '"Tất cả báo cáo"';
            conflict(`${scope} đã có mẫu "${hit.template.name}". Hãy sửa mẫu hiện có thay vì tạo mới.`, 'TEMPLATE_SCOPE_TAKEN',
                { templateId: hit.template.id, templateName: hit.template.name, reportTypes: hit.overlap });
        }
    }
};

const stamp = () => ({ updatedAt: new Date().toISOString(), updatedByName: 'Tài khoản đang đăng nhập' });

export const listTemplates = (reportType) => {
    if (reportType && !getReportDefinition(reportType)) fail('Loại báo cáo không tồn tại');
    return load().templates
        .filter((t) => !reportType || !t.reportTypes.length || t.reportTypes.includes(reportType))
        .sort((a, b) => Number(b.reportTypes.length > 0) - Number(a.reportTypes.length > 0) || a.name.localeCompare(b.name, 'vi'))
        .map(view);
};

export const getTemplate = (id) => view(find(id));
export const getTemplateDefaults = () => ({ layout: defaultLayout() });

export const createTemplate = (payload = {}) => {
    const state = load();
    const next = clean(payload);
    assertNoConflict(next, null);
    state.seq += 1;
    const created = { id: `10000000-0000-4000-8000-${String(state.seq).padStart(12, '0')}`, ...next, ...stamp() };
    state.templates.push(created);
    save();
    return view(created);
};

export const updateTemplate = (id, payload = {}) => {
    const current = find(id);
    const next = clean(payload, current);
    assertNoConflict(next, current);
    Object.assign(current, next, stamp());
    save();
    return view(current);
};

export const deleteTemplate = (id) => {
    const state = load();
    find(id);
    state.templates = state.templates.filter((t) => t.id !== id);
    save();
    return null;
};

export const searchSigners = (q) => {
    const term = String(q || '').trim().toLowerCase();
    return SIGNERS.filter((s) => !term || `${s.fullName} ${s.positionTitle}`.toLowerCase().includes(term));
};

export const uploadTemplateAsset = (file) => {
    if (!file) fail('Vui lòng chọn ảnh');
    const mediaFileId = `20000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;
    const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '';
    assetUrls.set(mediaFileId, url);
    return { mediaFileId, url, mimeType: file.type || 'image/png' };
};

export const previewTemplate = () => fail('Đang dùng dữ liệu minh họa: bản xem thử PDF / Word / Excel chỉ dựng được khi nối máy chủ thật.');

/** Kiểm lựa chọn "bản quy chuẩn" lúc xuất — soi theo BE validateStandardExport. */
export const assertStandardExport = (type, params) => {
    const template = find(params.templateId);
    if (template.reportTypes.length && !template.reportTypes.includes(type)) fail('Mẫu này không dùng cho loại báo cáo đã chọn');
    fail('Đang dùng dữ liệu minh họa: bản quy chuẩn chỉ xuất được khi nối máy chủ thật. Hãy chọn bản thường.');
};
