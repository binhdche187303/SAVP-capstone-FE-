/**
 * Xuất báo cáo Excel có định dạng (exceljs, nạp động để không nặng bundle chính).
 *
 * Mỗi báo cáo = 1 sheet "Thông tin báo cáo" (tiêu đề, bộ lọc, người xuất, tổng hợp, chú giải)
 * + các sheet dữ liệu có tiêu đề cột đậm, cố định hàng đầu, bộ lọc, số/ngày đúng kiểu để người dùng
 * có thể sort/filter/pivot trong Excel.
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

/**
 * @param {object} cfg
 * @param {string} cfg.fileName      không cần đuôi .xlsx
 * @param {string} cfg.title         tiêu đề báo cáo (sheet thông tin)
 * @param {string} [cfg.subtitle]
 * @param {Array}  cfg.info          [[nhãn, giá trị, {numFmt, fill, color}?] | { section }]
 * @param {Array}  cfg.sheets        [{ name, columns:[{header,key,width?,numFmt?,align?}], rows:[obj], cellStyle?(row,key,value) → {fill,color,bold}, note? }]
 */
export const downloadReport = async ({ fileName, title, subtitle, info = [], sheets }) => {
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
    const safe = fileName.replace(/[\\/:*?"<>|]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
