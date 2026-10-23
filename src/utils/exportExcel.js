/**
 * Xuất báo cáo có định dạng — 3 loại giống Trung tâm báo cáo: Excel (.xlsx), Word (.doc), PDF (in → "Lưu thành PDF").
 *
 * Cùng một "spec" (title, subtitle, info, sheets) cho cả 3 loại. Mỗi báo cáo = phần "Thông tin báo cáo"
 * (tiêu đề, bộ lọc, người xuất, tổng hợp, chú giải) + các bảng dữ liệu.
 * Excel dùng exceljs (nạp động để không nặng bundle chính): tiêu đề cột đậm, cố định hàng đầu, bộ lọc,
 * số/ngày đúng kiểu để sort/filter/pivot. Word/PDF dựng từ HTML nên giống nhau về bố cục.
 */

const HEADER_BG = 'FF1E3A8A';
const BORDER = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const ALL_BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

export const DATE_TIME_FMT = 'dd/mm/yyyy hh:mm:ss';
export const DATE_FMT = 'dd/mm/yyyy';
export const TIME_FMT = 'hh:mm:ss';

/** Chuyển ISO / Date → Date hợp lệ, hoặc null (ô để trống thay vì chữ "Invalid Date"). */
export const toDate = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** Người đang đăng nhập (để ghi "Người xuất" vào báo cáo). */
export const currentUserName = () => {
    try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        return u?.fullName || u?.full_name || u?.email || '';
    } catch {
        return '';
    }
};

export const fmtVN = (v) => {
    const d = toDate(v);
    return d ? d.toLocaleString('vi-VN', { hour12: false }) : '';
};

const sanitizeSheetName = (name) => name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

const argb = (hex) => (hex ? `FF${hex.replace('#', '').toUpperCase()}` : undefined);

const safeName = (fileName) => fileName.replace(/[\\/:*?"<>|]/g, '');

const triggerDownload = (blob, fileName) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---------- Excel ----------

const addInfoSheet = (wb, { title, subtitle, info }) => {
    const ws = wb.addWorksheet('Thông tin báo cáo', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 30 }, { width: 70 }];
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_BG } };
    ws.getRow(1).height = 28;
    let r = 2;
    if (subtitle) {
        ws.mergeCells(`A${r}:B${r}`);
        ws.getCell(`A${r}`).value = subtitle;
        ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF6B7280' } };
        r += 1;
    }
    r += 1;
    info.forEach((item) => {
        if (item.section) {
            ws.mergeCells(`A${r}:B${r}`);
            const c = ws.getCell(`A${r}`);
            c.value = item.section;
            c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
            r += 1;
            return;
        }
        const [label, value, opts = {}] = item;
        const a = ws.getCell(`A${r}`);
        const b = ws.getCell(`B${r}`);
        a.value = label;
        a.font = { bold: true };
        a.alignment = { vertical: 'top' };
        b.value = value === undefined || value === null || value === '' ? '—' : value;
        b.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
        if (opts.numFmt) b.numFmt = opts.numFmt;
        if (opts.fill) {
            b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(opts.fill) } };
            if (opts.color) b.font = { color: { argb: argb(opts.color) }, bold: true };
        }
        a.border = ALL_BORDERS;
        b.border = ALL_BORDERS;
        r += 1;
    });
};

const downloadXlsx = async ({ fileName, title, subtitle, info = [], sheets }) => {
    const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    wb.creator = currentUserName() || 'SAVP';
    wb.created = new Date();

    addInfoSheet(wb, { title, subtitle, info });

    sheets.forEach((sheet) => {
        const ws = wb.addWorksheet(sanitizeSheetName(sheet.name), { views: [{ state: 'frozen', ySplit: sheet.note ? 3 : 1, xSplit: sheet.freezeCols || 0 }] });
        let headerRowIdx = 1;
        if (sheet.note) {
            ws.mergeCells(1, 1, 1, Math.max(sheet.columns.length, 2));
            ws.getCell(1, 1).value = sheet.note;
            ws.getCell(1, 1).font = { italic: true, color: { argb: 'FF6B7280' } };
            ws.getCell(1, 1).alignment = { wrapText: true, vertical: 'top' };
            ws.getRow(1).height = 32;
            headerRowIdx = 3;
        }
        ws.columns = sheet.columns.map((c) => ({ key: c.key, width: c.width || 16 }));
        const header = ws.getRow(headerRowIdx);
        sheet.columns.forEach((c, i) => {
            const cell = header.getCell(i + 1);
            cell.value = c.header;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = ALL_BORDERS;
        });
        header.height = 30;

        sheet.rows.forEach((row, ri) => {
            const xr = ws.getRow(headerRowIdx + 1 + ri);
            sheet.columns.forEach((c, i) => {
                const cell = xr.getCell(i + 1);
                let v = row[c.key];
                if (v instanceof Date) cell.numFmt = c.numFmt || DATE_TIME_FMT;
                else if (c.numFmt) cell.numFmt = c.numFmt;
                if (v === undefined || v === null) v = '';
                cell.value = v;
                cell.border = ALL_BORDERS;
                cell.alignment = { vertical: 'middle', horizontal: c.align || (typeof v === 'number' ? 'right' : 'left'), wrapText: !!c.wrap };
                const st = sheet.cellStyle?.(row, c.key, v);
                if (st?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.fill) } };
                if (st?.color || st?.bold) cell.font = { color: st.color ? { argb: argb(st.color) } : undefined, bold: !!st.bold };
            });
        });

        if (sheet.rows.length > 0) {
            ws.autoFilter = {
                from: { row: headerRowIdx, column: 1 },
                to: { row: headerRowIdx, column: sheet.columns.length },
            };
        }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safe = safeName(fileName);
    triggerDownload(blob, safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`);
};

// ---------- Word / PDF (HTML) ----------

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const p2 = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
const hms = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const hexOf = (c) => (c ? `#${c.replace('#', '')}` : undefined);

const cellText = (v, col) => {
    if (v === undefined || v === null || v === '') return '';
    if (v instanceof Date) {
        if (col.numFmt === DATE_FMT) return dmy(v);
        if (col.numFmt === TIME_FMT) return hms(v);
        return `${dmy(v)} ${hms(v)}`;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
    }
    return String(v);
};

const HTML_STYLE = `
@page{size:A4 landscape;margin:12mm}
body{font-family:'Times New Roman',serif;font-size:11pt;color:#0A0A0A}
h1{font-size:16pt;text-align:center;margin:0 0 2px;color:#1E3A8A}
.sub{text-align:center;font-style:italic;color:#6B7280;margin:0 0 10px}
h2{font-size:12pt;margin:16px 0 4px;color:#1E3A8A}
.cnt{font-size:9pt;font-weight:normal;color:#6B7280}
.note{font-size:9pt;font-style:italic;color:#6B7280;margin:0 0 4px}
table{border-collapse:collapse;width:100%}
table.info{margin-bottom:6px}
table.info td,table.info th{border:1px solid #D1D5DB;padding:3px 6px;font-size:10pt;text-align:left;vertical-align:top}
table.info .k{width:28%;font-weight:bold}
table.info .sec{background:#1E3A8A;color:#fff}
table.data th,table.data td{border:1px solid #9CA3AF;padding:3px 5px;font-size:8.5pt;text-align:left;vertical-align:top}
table.data th{background:#1E3A8A;color:#fff;text-align:center}
table.data tr{page-break-inside:avoid}
thead{display:table-header-group}
.empty{text-align:center;color:#6B7280}`;

const buildInfoRows = (info) => info.map((item) => {
    if (item.section) return `<tr><th colspan="2" class="sec">${esc(item.section)}</th></tr>`;
    const [label, value, opts = {}] = item;
    const shown = value === undefined || value === null || value === '' ? '—' : value;
    const style = opts.fill
        ? ` style="background:${hexOf(opts.fill)};${opts.color ? `color:${hexOf(opts.color)};font-weight:bold` : ''}"`
        : '';
    return `<tr><td class="k">${esc(label)}</td><td${style}>${esc(shown)}</td></tr>`;
}).join('');

const buildDataTable = (sheet) => {
    const head = sheet.columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
    const body = sheet.rows.length === 0
        ? `<tr><td colspan="${sheet.columns.length}" class="empty">Không có dữ liệu</td></tr>`
        : sheet.rows.map((row) => {
            const cells = sheet.columns.map((c) => {
                const v = row[c.key];
                const st = sheet.cellStyle?.(row, c.key, v);
                const css = [
                    c.align === 'center' ? 'text-align:center' : (typeof v === 'number' ? 'text-align:right' : ''),
                    st?.fill ? `background:${hexOf(st.fill)}` : '',
                    st?.color ? `color:${hexOf(st.color)}` : '',
                    st?.bold ? 'font-weight:bold' : '',
                ].filter(Boolean).join(';');
                return `<td${css ? ` style="${css}"` : ''}>${esc(cellText(v, c))}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    const note = sheet.note ? `<p class="note">${esc(sheet.note)}</p>` : '';
    return `<h2>${esc(sheet.name)} <span class="cnt">(${sheet.rows.length} dòng)</span></h2>${note}
<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
};

const buildHtml = ({ title, subtitle, info = [], sheets }, { forWord }) => {
    const wordHead = forWord
        ? '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->'
        : '';
    return `<!doctype html><html lang="vi" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>${wordHead}
<style>${HTML_STYLE}</style></head><body>
<h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
<table class="info"><tbody>${buildInfoRows(info)}</tbody></table>
${sheets.map(buildDataTable).join('\n')}
</body></html>`;
};

// PDF: in qua iframe ẩn (không bị chặn cửa sổ bật lên dù gọi sau khi đã chờ tải dữ liệu); người dùng chọn "Lưu thành PDF".
const printHtml = (html) => new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    let printed = false;
    const run = () => {
        if (printed) return;
        printed = true;
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { iframe.remove(); resolve(); }, 1500);
    };
    iframe.onload = run;
    setTimeout(run, 400);
});

/**
 * @param {object} cfg
 * @param {'xlsx'|'pdf'|'docx'} [cfg.format='xlsx']
 * @param {string} cfg.fileName      không cần đuôi file
 * @param {string} cfg.title         tiêu đề báo cáo (sheet thông tin)
 * @param {string} [cfg.subtitle]
 * @param {Array}  cfg.info          [[nhãn, giá trị, {numFmt, fill, color}?] | { section }]
 * @param {Array}  cfg.sheets        [{ name, columns:[{header,key,width?,numFmt?,align?}], rows:[obj], cellStyle?(row,key,value) → {fill,color,bold}, note? }]
 */
export const downloadReport = async (cfg) => {
    const format = cfg.format || 'xlsx';
    if (format === 'docx') {
        const name = safeName(cfg.fileName);
        const blob = new Blob([String.fromCharCode(0xFEFF), buildHtml(cfg, { forWord: true })], { type: 'application/msword' });
        triggerDownload(blob, name.endsWith('.doc') ? name : `${name}.doc`);
        return;
    }
    if (format === 'pdf') {
        await printHtml(buildHtml(cfg, { forWord: false }));
        return;
    }
    await downloadXlsx(cfg);
};
