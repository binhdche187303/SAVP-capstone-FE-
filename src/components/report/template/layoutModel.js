// Mô hình "mẫu báo cáo quy chuẩn" phía FE — soi theo BE `report-template.layout.ts`.
// Thứ tự các phần cố định theo NĐ 30/2020; chỉ các khối trong THÂN văn bản đổi chỗ được,
// và đoạn mở đầu luôn đứng đầu thân. BE kiểm lại toàn bộ khi lưu, ở đây kiểm để báo lỗi tại chỗ.

export const LIMITS = {
    shortText: 200,
    longText: 3000,
    bodyBlocks: 12,
    textBlocks: 6,
    signatures: 3,
    recipients: 10,
    recipientLength: 150,
    logoMm: [10, 30],
    watermarkOpacity: [0.03, 0.5],
    watermarkWidthPct: [20, 90],
    name: 120,
};

export const BLOCK_LABELS = {
    opening: 'Đoạn mở đầu',
    scope: 'Phạm vi và nguồn dữ liệu',
    summary: 'Bảng kết quả tổng hợp',
    assessment: 'Đánh giá và kiến nghị',
    text: 'Đoạn tự soạn',
};

export const SIGNATURE_MODE_LABELS = { required: 'Bắt buộc', optional: 'Tùy chọn', hidden: 'Ẩn' };
export const VARIABLE_HINT = 'Dùng được biến: {title} tên báo cáo, {period} kỳ báo cáo, {unit} tên đơn vị.';

export const defaultLayout = () => ({
    version: 1,
    header: {
        parentAgency: 'ĐẠI HỌC QUỐC GIA TP.HCM',
        agency: 'TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT',
        agencyUnderline: 'ĐẠI HỌC KINH TẾ',
        agencyShort: 'ĐHKTL',
        unitName: 'Phòng Hành chính',
        unitCode: 'HC',
        place: 'Thành phố Hồ Chí Minh',
    },
    title: { subject: '' },
    addressee: { enabled: true, text: 'Ban Giám hiệu Trường Đại học Kinh tế - Luật' },
    body: [
        {
            id: 'opening', kind: 'opening', enabled: true, title: '',
            text: 'Thực hiện chế độ báo cáo định kỳ, {unit} báo cáo {title} {period} trên cơ sở dữ liệu ghi nhận tự động bởi Hệ thống VISMA, cụ thể như sau:',
        },
        { id: 'scope', kind: 'scope', enabled: true, title: 'PHẠM VI VÀ NGUỒN DỮ LIỆU', text: '' },
        { id: 'summary', kind: 'summary', enabled: true, title: 'KẾT QUẢ TỔNG HỢP', text: '' },
        {
            id: 'assessment', kind: 'assessment', enabled: true, title: 'ĐÁNH GIÁ VÀ KIẾN NGHỊ',
            text: '(Đơn vị lập báo cáo bổ sung nội dung đánh giá, kiến nghị trước khi trình ký)',
        },
    ],
    closing: { enabled: true, text: 'Trên đây là báo cáo {title} {period}, {unit} kính báo cáo Ban Giám hiệu xem xét, chỉ đạo./.' },
    signatures: [
        { id: 'maker', authority: '', title: 'NGƯỜI LẬP BIỂU', mode: 'optional', useExporter: true, defaultSigner: null },
        { id: 'head', authority: 'TL. HIỆU TRƯỞNG', title: 'TRƯỞNG PHÒNG HÀNH CHÍNH', mode: 'required', useExporter: false, defaultSigner: null },
    ],
    recipients: { enabled: true, items: ['Ban Giám hiệu (để b/c);', 'Lưu: VT, HC.'] },
    appendix: { enabled: true },
    logo: { enabled: false, mediaFileId: null, position: 'margin', widthMm: 19 },
    watermark: { enabled: false, mediaFileId: null, opacity: 0.08, widthPct: 60 },
    footer: { provenance: true },
});

/** Gán giá trị theo đường dẫn, không sửa đối tượng gốc. `setIn(l, ['header', 'agency'], 'X')`. */
export const setIn = (source, path, value) => {
    if (!path.length) return value;
    const [head, ...rest] = path;
    const copy = Array.isArray(source) ? [...source] : { ...source };
    copy[head] = setIn(source?.[head] ?? (typeof rest[0] === 'number' ? [] : {}), rest, value);
    return copy;
};

export const fillText = (text, vars) => String(text || '').replace(/\{(title|period|unit)\}/g, (_, key) => vars[key] ?? '');

// ---------- Đổi chỗ khối trong thân văn bản ----------

/** Vị trí thấp nhất một khối không phải "mở đầu" được đứng (ngay sau đoạn mở đầu nếu có). */
const firstFreeIndex = (body) => (body[0]?.kind === 'opening' ? 1 : 0);

/** Chuyển khối `id` tới trước khối `beforeId` (null = xuống cuối). Đoạn mở đầu không rời vị trí đầu. */
export const moveBlock = (body, id, beforeId) => {
    const moving = body.find((b) => b.id === id);
    if (!moving || moving.kind === 'opening' || id === beforeId) return body;
    const rest = body.filter((b) => b.id !== id);
    let index = beforeId == null ? rest.length : rest.findIndex((b) => b.id === beforeId);
    if (index < 0) index = rest.length;
    index = Math.max(index, firstFreeIndex(rest));
    const next = [...rest.slice(0, index), moving, ...rest.slice(index)];
    return next.every((b, i) => b === body[i]) ? body : next;
};

export const canShift = (body, id, delta) => {
    const index = body.findIndex((b) => b.id === id);
    if (index < 0 || body[index].kind === 'opening') return false;
    const target = index + delta;
    return target >= firstFreeIndex(body) && target < body.length;
};

export const shiftBlock = (body, id, delta) => {
    if (!canShift(body, id, delta)) return body;
    const index = body.findIndex((b) => b.id === id);
    const next = [...body];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
};

const freeId = (prefix, taken) => {
    for (let i = 1; ; i += 1) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
};

export const canAddTextBlock = (body) =>
    body.length < LIMITS.bodyBlocks && body.filter((b) => b.kind === 'text').length < LIMITS.textBlocks;

export const newTextBlock = (body) => ({
    id: freeId('text-', new Set(body.map((b) => b.id))),
    kind: 'text',
    enabled: true,
    title: 'NỘI DUNG BỔ SUNG',
    text: '',
});

export const newSignatureSlot = (signatures) => ({
    id: freeId('sig-', new Set(signatures.map((s) => s.id))),
    authority: '',
    title: 'NGƯỜI KÝ',
    mode: 'optional',
    useExporter: false,
    defaultSigner: null,
});

/** Số La Mã của từng mục đang bật (đoạn mở đầu không đánh số) — để canvas ghi giống file thật. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const sectionNumbers = (body) => {
    const out = {};
    let n = 0;
    body.forEach((b) => {
        if (b.enabled && b.kind !== 'opening') { out[b.id] = ROMAN[n] || String(n + 1); n += 1; }
    });
    return out;
};

// ---------- Kiểm trước khi lưu ----------

const tooLong = (value, max) => String(value || '').trim().length > max;

/** Trả thông báo lỗi đầu tiên, hoặc null nếu mẫu lưu được. */
export const validateLayout = (layout) => {
    const h = layout.header;
    if (!h.agency.trim()) return 'Vui lòng nhập tên cơ quan';
    if (h.agencyUnderline.trim() && !h.agency.includes(h.agencyUnderline.trim())) return 'Phần gạch chân phải nằm trong tên cơ quan';
    if (!h.place.trim()) return 'Vui lòng nhập địa danh';
    if ([h.parentAgency, h.agency, h.unitName, layout.title.subject, layout.addressee.text].some((v) => tooLong(v, LIMITS.shortText))) {
        return `Các dòng đầu văn bản, trích yếu, kính gửi tối đa ${LIMITS.shortText} ký tự`;
    }
    for (const block of layout.body) {
        if (block.kind !== 'opening' && block.enabled && !block.title.trim()) return `Mục "${BLOCK_LABELS[block.kind]}" cần có tiêu đề`;
        if (tooLong(block.text, LIMITS.longText)) return `Nội dung mỗi khối tối đa ${LIMITS.longText} ký tự`;
    }
    if (tooLong(layout.closing.text, LIMITS.longText)) return `Câu kết tối đa ${LIMITS.longText} ký tự`;
    for (const slot of layout.signatures) {
        if (!slot.title.trim()) return 'Mỗi ô ký cần có chức vụ';
        if (slot.mode === 'required' && !slot.useExporter && !slot.defaultSigner?.fullName?.trim()) {
            return `Ô ký bắt buộc "${slot.title}" cần có người ký mặc định`;
        }
    }
    if (layout.recipients.items.length > LIMITS.recipients) return `Tối đa ${LIMITS.recipients} nơi nhận`;
    if (layout.recipients.items.some((item) => tooLong(item, LIMITS.recipientLength))) return `Mỗi dòng nơi nhận tối đa ${LIMITS.recipientLength} ký tự`;
    if (layout.logo.enabled && !layout.logo.mediaFileId) return 'Bật logo thì cần tải ảnh logo';
    if (layout.watermark.enabled && !layout.watermark.mediaFileId) return 'Bật logo nền thì cần tải ảnh';
    return null;
};

// ---------- Người ký lúc xuất ----------

/** Trạng thái ban đầu của hộp thoại xuất: mỗi ô ký (không ẩn) kèm người ký mặc định của mẫu. */
export const initialSignerState = (layout) =>
    Object.fromEntries(layout.signatures.filter((s) => s.mode !== 'hidden').map((s) => [s.id, {
        included: true,
        userId: s.defaultSigner?.userId ?? null,
        fullName: s.defaultSigner?.fullName ?? '',
    }]));

const sameSigner = (a, b) => (a?.userId ?? null) === (b?.userId ?? null) && (a?.fullName ?? '').trim() === (b?.fullName ?? '').trim();

/**
 * Đổi trạng thái hộp thoại thành `signers` gửi BE: chỉ gửi ô đã đổi so với mẫu; `null` = bỏ ô tùy chọn.
 * Trả `{ error }` nếu ô bắt buộc chưa có tên.
 */
export const buildSignerPayload = (layout, state) => {
    const signers = {};
    for (const slot of layout.signatures) {
        if (slot.mode === 'hidden') continue;
        const pick = state[slot.id] || { included: true, userId: null, fullName: '' };
        if (!pick.included) {
            if (slot.mode === 'required') return { error: `Ô ký "${slot.title}" là bắt buộc, không bỏ được` };
            signers[slot.id] = null;
            continue;
        }
        const name = pick.fullName.trim();
        if (!name) {
            if (slot.mode === 'required' && !slot.useExporter && !slot.defaultSigner?.fullName) {
                return { error: `Vui lòng chọn người ký cho ô "${slot.title}"` };
            }
            continue; // để trống → BE dùng người ký mặc định / người xuất
        }
        const chosen = { userId: pick.userId || null, fullName: name };
        if (!sameSigner(chosen, slot.defaultSigner)) signers[slot.id] = chosen;
    }
    return { signers };
};

/** Dọn trước khi lưu / xem thử: bỏ dòng nơi nhận trống (ô soạn giữ nguyên dòng trống để gõ dễ). */
export const cleanLayout = (layout) => ({
    ...layout,
    recipients: { ...layout.recipients, items: layout.recipients.items.map((x) => x.trim()).filter(Boolean) },
});

export const linesOf = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
