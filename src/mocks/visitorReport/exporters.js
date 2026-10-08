// src/mocks/visitorReport/exporters.js
// Xuất file phía trình duyệt, chỉ phục vụ demo (spec §7). BE thật sẽ thay bằng job xuất file.
import * as XLSX from 'xlsx';
import { formatCell } from '../../utils/reportFormat';

export const EMPTY_TEXT = 'Không có dữ liệu trong kỳ đã chọn';
const EXTENSION = { pdf: 'pdf', xlsx: 'xlsx', docx: 'doc' };

const pad = (n) => String(n).padStart(2, '0');
const dmy = (ymd) => ymd.split('-').reverse().join('/');
const stamp = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const escapeHtml = (value) =>
    String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const buildFileName = (type, from, to, format) => `${type}_${from}_${to}.${EXTENSION[format]}`;

const filterLabel = (filter, value, lookups) => {
    if (filter.options) return filter.options.find((o) => o.value === value)?.label || value;
    return (lookups[filter.lookup] || []).find((o) => o.id === value)?.name || value;
};

export const buildExportModel = ({ definition, filters, lookups, report, now = new Date() }) => ({
    title: `Báo cáo ${definition.title}`,
    period: `Kỳ báo cáo: ${dmy(filters.from)} – ${dmy(filters.to)}`,
    generatedAt: stamp(now),
    filterLines: definition.filters
        .filter((f) => filters[f.key])
        .map((f) => `${f.label}: ${filterLabel(f, filters[f.key], lookups)}`),
    kpis: definition.kpis.map((k) => ({
        label: k.label,
        value: formatCell(report.kpis.find((item) => item.key === k.key)?.value, k.format),
    })),
    headers: definition.columns.map((c) => c.label),
    rows: report.rows.map((r) => definition.columns.map((c) => formatCell(r[c.key], c.format))),
    empty: report.rows.length === 0,
});

export const buildWorkbook = (model) => {
    const summary = [
        [model.title],
        [model.period],
        [`Thời điểm xuất: ${model.generatedAt}`],
        ...model.filterLines.map((line) => [line]),
        [],
        ['Chỉ số', 'Giá trị'],
        ...model.kpis.map((k) => [k.label, k.value]),
    ];
    const data = [model.headers, ...(model.empty ? [[EMPTY_TEXT]] : model.rows)];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Tổng hợp');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), 'Dữ liệu');
    return workbook;
};

export const buildReportHtml = (model) => {
    const body = model.empty
        ? `<tr><td colspan="${model.headers.length}" style="text-align:center">${EMPTY_TEXT}</td></tr>`
        : model.rows.map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(model.title)}</title>
<style>
body{font-family:'Times New Roman',serif;font-size:12pt;color:#0A0A0A;margin:24px}
h1{font-size:16pt;text-align:center;margin:0 0 4px}
p{margin:2px 0}.meta{text-align:center}
table{border-collapse:collapse;width:100%;margin-top:12px}
th,td{border:1px solid #476788;padding:4px 6px;font-size:10pt;text-align:left}
th{background:#E7EDF6}
.kpi td:first-child{width:40%}
@page{size:A4 landscape;margin:12mm}
</style></head><body>
<h1>${escapeHtml(model.title.toUpperCase())}</h1>
<p class="meta">${escapeHtml(model.period)}</p>
<p class="meta">Thời điểm xuất: ${escapeHtml(model.generatedAt)}</p>
${model.filterLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
<table class="kpi"><tbody>${model.kpis.map((k) => `<tr><td>${escapeHtml(k.label)}</td><td>${escapeHtml(k.value)}</td></tr>`).join('')}</tbody></table>
<table><thead><tr>${model.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
};

const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

// Trả false khi không xuất được (PDF bị chặn cửa sổ bật lên) để service báo cho người dùng.
export const runExport = (format, model, fileName) => {
    if (format === 'xlsx') {
        XLSX.writeFile(buildWorkbook(model), fileName);
        return true;
    }
    const html = buildReportHtml(model);
    if (format === 'docx') {
        downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), fileName);
        return true;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // onload không chắc chạy với tài liệu ghi bằng document.write; đặt cờ để chỉ in một lần.
    let printed = false;
    const print = () => {
        if (printed) return;
        printed = true;
        printWindow.print();
    };
    printWindow.onload = print;
    setTimeout(print, 400);
    return true;
};
