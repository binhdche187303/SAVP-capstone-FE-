// Dữ liệu giả cho "Mẫu báo cáo quy chuẩn" — chỉ để màn cấu hình chạy được khi chưa nối BE.
// Lưu riêng một khóa localStorage (không đụng seed của phân hệ Khách / Báo cáo).
import { getReportDefinition } from '../../config/reportDefinitions';
import { defaultLayout, validateLayout, LIMITS } from '../../components/report/template/layoutModel';

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
            reportType: null,
            isDefault: true,
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
    const reportType = payload.reportType === undefined ? current?.reportType ?? null : payload.reportType || null;
    if (reportType && !getReportDefinition(reportType)) fail('Loại báo cáo không tồn tại');
    const layout = payload.layout === undefined ? current?.layout ?? defaultLayout() : payload.layout;
    const problem = validateLayout(layout);
    if (problem) fail(problem);
    const isDefault = payload.isDefault === undefined ? current?.isDefault ?? false : Boolean(payload.isDefault);
    return { name, reportType, layout: JSON.parse(JSON.stringify(layout)), isDefault };
};

// Mỗi loại báo cáo (hoặc nhóm "dùng chung") chỉ có một mẫu mặc định.
const clearOtherDefaults = (state, keep) => {
    if (!keep.isDefault) return;
    state.templates.forEach((t) => { if (t.id !== keep.id && (t.reportType || '*') === (keep.reportType || '*')) t.isDefault = false; });
};

const stamp = () => ({ updatedAt: new Date().toISOString(), updatedByName: 'Tài khoản đang đăng nhập' });

export const listTemplates = (reportType) => {
    if (reportType && !getReportDefinition(reportType)) fail('Loại báo cáo không tồn tại');
    return load().templates
        .filter((t) => !reportType || !t.reportType || t.reportType === reportType)
        .sort((a, b) => Number(Boolean(b.reportType)) - Number(Boolean(a.reportType)) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'vi'))
        .map(view);
};

export const getTemplate = (id) => view(find(id));
export const getTemplateDefaults = () => ({ layout: defaultLayout() });

export const createTemplate = (payload = {}) => {
    const state = load();
    state.seq += 1;
    const created = { id: `10000000-0000-4000-8000-${String(state.seq).padStart(12, '0')}`, ...clean(payload), ...stamp() };
    state.templates.push(created);
    clearOtherDefaults(state, created);
    save();
    return view(created);
};

export const updateTemplate = (id, payload = {}) => {
    const state = load();
    const current = find(id);
    Object.assign(current, clean(payload, current), stamp());
    clearOtherDefaults(state, current);
    save();
    return view(current);
};

export const duplicateTemplate = (id) => {
    const source = find(id);
    return createTemplate({ name: `${source.name} (bản sao)`.slice(0, LIMITS.name), reportType: source.reportType, isDefault: false, layout: source.layout });
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
    if (template.reportType && template.reportType !== type) fail('Mẫu này không dùng cho loại báo cáo đã chọn');
    fail('Đang dùng dữ liệu minh họa: bản quy chuẩn chỉ xuất được khi nối máy chủ thật. Hãy chọn bản thường.');
};
