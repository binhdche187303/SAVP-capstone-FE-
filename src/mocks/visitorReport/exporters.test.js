// src/mocks/visitorReport/exporters.test.js
import { EMPTY_TEXT, buildFileName, buildExportModel, buildWorkbook, buildReportHtml, runExport } from './exporters';
import { getReportDefinition } from '../../config/reportDefinitions';
import * as reportService from '../../service/reportCenterService';
import { resetState } from './store';

const definition = getReportDefinition('visitor');
const lookups = { departments: [{ id: 'dep-cntt', name: 'Khoa Công nghệ thông tin' }], purposes: [] };
const report = (rows) => ({
    kpis: definition.kpis.map((k) => ({ key: k.key, value: 3 })),
    charts: [],
    rows,
});
const row = {
    code: 'VS-261007-0001', visitorName: '<script>alert(1)</script>', organization: 'Công ty A & B', hostName: 'Nguyễn Văn An',
    departmentName: 'Khoa Công nghệ thông tin', purpose: 'Làm việc với đơn vị',
    checkInTime: '2026-10-07T02:00:00.000Z', checkOutTime: null, durationSeconds: 8100, statusLabel: 'Đã rời',
};
const model = (rows) => buildExportModel({
    definition, lookups, report: report(rows),
    filters: { from: '2026-10-01', to: '2026-10-07', departmentId: 'dep-cntt', status: 'checked_out' },
    now: new Date(2026, 9, 7, 10, 30),
});

test('tên file theo quy ước', () => {
    expect(buildFileName('visitor', '2026-10-01', '2026-10-07', 'xlsx')).toBe('visitor_2026-10-01_2026-10-07.xlsx');
    expect(buildFileName('visitor', '2026-10-01', '2026-10-07', 'docx')).toBe('visitor_2026-10-01_2026-10-07.doc');
    expect(buildFileName('visitor', '2026-10-01', '2026-10-07', 'pdf')).toBe('visitor_2026-10-01_2026-10-07.pdf');
});

test('mô hình xuất: tiêu đề, kỳ, bộ lọc có nhãn, ô đã định dạng', () => {
    const m = model([row]);
    expect(m.title).toBe('Báo cáo Khách đến làm việc');
    expect(m.period).toBe('Kỳ báo cáo: 01/10/2026 – 07/10/2026');
    expect(m.filterLines).toEqual(['Đơn vị tiếp: Khoa Công nghệ thông tin', 'Trạng thái: Đã rời']);
    expect(m.headers).toEqual(definition.columns.map((c) => c.label));
    expect(m.rows[0][0]).toBe('VS-261007-0001');
    expect(m.rows[0][8]).toBe('2g 15p');
    expect(m.rows[0][7]).toBe('—');
    expect(m.kpis[0]).toEqual({ label: 'Tổng lượt', value: '3' });
    expect(m.empty).toBe(false);
});

test('Excel có 2 sheet; không có dữ liệu thì ghi dòng thông báo', () => {
    const wb = buildWorkbook(model([]));
    expect(wb.SheetNames).toEqual(['Tổng hợp', 'Dữ liệu']);
    expect(wb.Sheets['Dữ liệu'].A2.v).toBe(EMPTY_TEXT);
    expect(buildWorkbook(model([row])).Sheets['Dữ liệu'].A2.v).toBe('VS-261007-0001');
});

test('HTML cho Word/PDF thoát ký tự đặc biệt và có dòng rỗng', () => {
    const html = buildReportHtml(model([row]));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Công ty A &amp; B');
    expect(buildReportHtml(model([]))).toContain(EMPTY_TEXT);
});

test('PDF: trình duyệt chặn cửa sổ bật lên thì trả false', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    expect(runExport('pdf', model([row]), 'x.pdf')).toBe(false);
    open.mockRestore();
});

test('xuất PDF bị chặn cửa sổ bật lên: service báo lỗi rõ ràng và không ghi vào file xuất gần đây', async () => {
    resetState();
    const before = (await reportService.getRecentExports()).data.length;
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    const res = await reportService.exportReport('visitor', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
    open.mockRestore();
    expect(res).toEqual({ success: false, message: 'Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.' });
    expect((await reportService.getRecentExports()).data).toHaveLength(before);
});

test('định dạng xuất lạ bị từ chối', async () => {
    const res = await reportService.exportReport('visitor', { format: 'csv', from: '2026-10-01', to: '2026-10-07' });
    expect(res).toEqual({ success: false, message: 'Định dạng xuất không hợp lệ' });
});
