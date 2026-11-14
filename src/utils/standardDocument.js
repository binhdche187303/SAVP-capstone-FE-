/**
 * Chuyển "spec" của downloadReport (title, info, sheets) thành nội dung văn bản quy chuẩn
 * gửi lên POST /report-templates/render-document — BE trình bày theo mẫu NĐ 30.
 *
 * Quy ước đọc phần `info`:
 * - mục có chữ "xuất" (Thông tin xuất)               → bỏ (BE tự ghi người / thời điểm trích xuất)
 * - mục "Ghi chú" / "Chú giải"                         → ghi chú
 * - mục "Tổng hợp" / "Kết quả" / "Thống kê" / "Chỉ số" → chỉ tiêu (bảng kết quả tổng hợp)
 * - mục khác (Phạm vi báo cáo…)                         → điều kiện lọc ("Nhãn: giá trị")
 * Bảng: bỏ cột STT (BE tự đánh số) và cột có `standard: false`; ngày giờ gửi ISO, số nguyên gửi số.
 */

const DATE_FMT = 'dd/mm/yyyy';
const TIME_FMT = 'hh:mm:ss';
const p2 = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD theo giờ máy (người dùng ở VN). */
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const sentence = (s) => {
    const t = String(s || '').trim();
    if (!t || t !== t.toUpperCase()) return t;
    const lower = t.toLocaleLowerCase('vi-VN');
    return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
};

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());

const textOf = (v, col) => {
    if (v === undefined || v === null || v === '') return null;
    if (isDate(v)) {
        const d = `${p2(v.getDate())}/${p2(v.getMonth() + 1)}/${v.getFullYear()}`;
        const t = `${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}`;
        if (col.numFmt === DATE_FMT) return d;
        if (col.numFmt === TIME_FMT) return t;
        return `${d} ${t}`;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
    }
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    return String(v);
};

const isSttColumn = (c) => /^(stt|#|tt)$/i.test(String(c.header || '').trim()) || c.key === 'stt';

/** Định dạng cột theo dữ liệu thật: toàn ngày giờ (không phải chỉ ngày / chỉ giờ) → datetime, toàn số nguyên → number. */
const columnFormat = (col, rows) => {
    const values = rows.map((r) => r[col.key]).filter((v) => v !== undefined && v !== null && v !== '');
    if (!values.length) return 'text';
    if (col.numFmt !== DATE_FMT && col.numFmt !== TIME_FMT && values.every(isDate)) return 'datetime';
    if (values.every((v) => typeof v === 'number' && Number.isInteger(v))) return 'number';
    return 'text';
};

const toTable = (sheet) => {
    const cols = sheet.columns.filter((c) => !isSttColumn(c) && c.standard !== false);
    const columns = cols.map((c, i) => ({ key: `c${i}`, label: cut(String(c.header || c.key), 120), format: columnFormat(c, sheet.rows) }));
    const rows = sheet.rows.map((r) => {
        const out = {};
        cols.forEach((c, i) => {
            const v = r[c.key];
            const f = columns[i].format;
            if (f === 'datetime') out[`c${i}`] = isDate(v) ? v.toISOString() : null;
            else if (f === 'number') out[`c${i}`] = typeof v === 'number' ? v : null;
            else { const t = textOf(v, c); out[`c${i}`] = t === null ? null : cut(t, 2000); }
        });
        return out;
    });
    return { title: cut(String(sheet.name || 'Dữ liệu'), 200), columns, rows };
};

const sectionKind = (name) => {
    const s = String(name || '').toLocaleLowerCase('vi-VN');
    if (/xuất/.test(s)) return 'skip';
    if (/ghi chú|chú giải|chú thích/.test(s)) return 'notes';
    if (/tổng hợp|kết quả|thống kê|chỉ số|chỉ tiêu/.test(s)) return 'kpis';
    return 'filters';
};

/**
 * @param {object} cfg  spec của downloadReport, thêm:
 *   period?: { from: Date|string, to: Date|string }   kỳ báo cáo (mặc định: hôm nay)
 *   docTitle?: string                                  tên báo cáo viết thường câu ("Nhật ký ra/vào phòng"); mặc định lấy từ title
 *   dataSource?: string                                dòng "Nguồn dữ liệu"
 */
export const toStandardDocument = (cfg) => {
    const filterLines = [];
    const kpis = [];
    const notes = [];
    let kind = 'filters';
    for (const item of cfg.info || []) {
        if (item && item.section) { kind = sectionKind(item.section); continue; }
        if (!Array.isArray(item) || kind === 'skip') continue;
        const [label, value] = item;
        if (/^(người|thời điểm|thời gian|ngày) xuất/i.test(String(label))) continue;
        const shown = textOf(value, {});
        if (kind === 'kpis') {
            kpis.push({ label: cut(String(label), 200), value: typeof value === 'number' && Number.isFinite(value) ? value : cut(shown ?? '—', 200) });
        } else if (kind === 'notes') {
            notes.push(cut(shown ? `${label}: ${shown}` : String(label), 1000));
        } else if (shown) {
            filterLines.push(cut(`${label}: ${shown}`, 300));
        }
    }
    for (const sheet of cfg.sheets || []) if (sheet.note) notes.push(cut(`${sheet.name}: ${sheet.note}`, 1000));

    const toYmd = (v) => {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isNaN(d.getTime()) ? ymd(new Date()) : ymd(d);
    };
    const today = ymd(new Date());
    const from = cfg.period?.from ? toYmd(cfg.period.from) : today;
    const to = cfg.period?.to ? toYmd(cfg.period.to) : from;

    return {
        title: cut(cfg.docTitle || sentence(cfg.title) || 'Báo cáo', 200),
        period: from <= to ? { from, to } : { from: to, to: from },
        filterLines: filterLines.slice(0, 30),
        kpis: kpis.slice(0, 40),
        notes: notes.slice(0, 20),
        tables: (cfg.sheets || []).slice(0, 10).map(toTable),
        ...(cfg.dataSource ? { dataSource: cfg.dataSource } : {}),
    };
};
