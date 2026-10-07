// src/mocks/visitorReport/reportApi.test.js
import { REPORT_TYPES, REPORT_DEFINITIONS, getReportDefinition } from '../../config/reportDefinitions';
import { formatCell } from '../../utils/reportFormat';
import * as svc from '../../service/reportCenterService';
import * as visitorSvc from '../../service/visitorService';
import { resetState } from './store';

const DAY = 86400000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const RANGE = { from: ymd(new Date(Date.now() - 29 * DAY)), to: ymd(new Date()) };
const ok = async (promise) => {
    const res = await promise;
    expect(res.success).toBe(true);
    return res.data;
};

beforeEach(() => resetState());

test('có đúng 7 loại báo cáo, đủ khai báo', () => {
    expect(REPORT_TYPES).toEqual(['staff-attendance', 'student-attendance', 'gate-access', 'room-utilization', 'vehicle', 'visitor', 'security-alert']);
    REPORT_TYPES.forEach((type) => {
        const def = getReportDefinition(type);
        expect(def.title).toBeTruthy();
        expect(def.columns.length).toBeGreaterThanOrEqual(8);
        expect(def.charts).toHaveLength(2);
    });
    expect(getReportDefinition('khong-co')).toBeNull();
});

test.each(REPORT_TYPES)('xem trước %s khớp khai báo', async (type) => {
    const def = REPORT_DEFINITIONS[type];
    const data = await ok(svc.getReportPreview(type, { ...RANGE, page: 1, limit: 20 }));
    expect(data.kpis.map((k) => k.key)).toEqual(def.kpis.map((k) => k.key));
    expect(data.charts.map((c) => c.key)).toEqual(def.charts.map((c) => c.key));
    data.charts.forEach((c) => expect(c.data.length).toBeGreaterThan(0));
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.length).toBeLessThanOrEqual(20);
    expect(data.total).toBeGreaterThanOrEqual(data.rows.length);
    def.columns.forEach((col) => expect(data.rows[0]).toHaveProperty(col.key));
    expect(await ok(svc.getReportPreview(type, { ...RANGE, page: 1, limit: 20 }))).toEqual(data);
});

test('lọc theo đơn vị, sắp xếp, tìm kiếm', async () => {
    const byDept = await ok(svc.getReportPreview('staff-attendance', { ...RANGE, departmentId: 'dep-cntt', limit: 50 }));
    expect(byDept.total).toBe(5);
    byDept.rows.forEach((r) => expect(r.departmentName).toBe('Khoa Công nghệ thông tin'));

    const sorted = await ok(svc.getReportPreview('staff-attendance', { ...RANGE, sortKey: 'rate', sortDir: 'asc', limit: 50 }));
    const rates = sorted.rows.map((r) => r.rate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));

    const first = (await ok(svc.getReportPreview('staff-attendance', { ...RANGE }))).rows[0];
    const found = await ok(svc.getReportPreview('staff-attendance', { ...RANGE, q: first.employeeCode.toLowerCase() }));
    expect(found.rows.map((r) => r.employeeCode)).toEqual([first.employeeCode]);
});

test('báo cáo khách khớp màn thống kê khách', async () => {
    const report = await ok(svc.getReportPreview('visitor', { ...RANGE }));
    const stats = await ok(visitorSvc.getVisitorStats({ ...RANGE, groupBy: 'day' }));
    const kpi = (key) => report.kpis.find((k) => k.key === key).value;
    expect(kpi('totalVisits')).toBe(stats.kpis.totalVisits);
    expect(kpi('uniqueVisitors')).toBe(stats.kpis.uniqueVisitors);
});

test.each(REPORT_TYPES)('kỳ không có dữ liệu: %s trả rỗng, KPI bằng 0', async (type) => {
    const data = await ok(svc.getReportPreview(type, { from: '2020-01-01', to: '2020-01-07' }));
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(0);
    data.kpis.forEach((k) => expect(k.value).toBe(0));
});

test('tham số sai trả thông điệp rõ ràng', async () => {
    expect(await svc.getReportPreview('khong-co', RANGE)).toEqual({ success: false, message: 'Loại báo cáo không tồn tại' });
    expect(await svc.getReportPreview('vehicle', { from: '2026-10-07', to: '2026-10-01' })).toEqual({ success: false, message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' });
    expect(await svc.getReportPreview('vehicle', { from: '2025-01-01', to: '2026-10-01' })).toEqual({ success: false, message: 'Kỳ báo cáo tối đa 366 ngày' });
    expect(await svc.getReportPreview('vehicle', { from: '', to: '2026-10-01' })).toEqual({ success: false, message: 'Vui lòng chọn kỳ báo cáo' });
});

test('danh mục và danh sách tra cứu', async () => {
    const catalog = await ok(svc.getReportCatalog());
    expect(catalog.map((c) => c.type)).toEqual(REPORT_TYPES);
    const lookups = await ok(svc.getReportLookups());
    expect(lookups.departments).toHaveLength(12);
    expect(lookups.staff).toHaveLength(60);
    expect(lookups.gates).toHaveLength(2);
    expect(lookups.rooms).toHaveLength(10);
    expect(lookups.classSections).toHaveLength(8);
});

test('định dạng ô', () => {
    expect(formatCell(1234, 'number')).toBe('1.234');
    expect(formatCell(92.5, 'percent')).toBe('92,5%');
    expect(formatCell(7.5, 'hours')).toBe('7,5 giờ');
    expect(formatCell(35, 'minutes')).toBe('35 phút');
    expect(formatCell(8100, 'duration')).toBe('2g 15p');
    expect(formatCell(null, 'duration')).toBe('—');
    expect(formatCell('', 'text')).toBe('—');
    expect(formatCell(null, 'datetime')).toBe('—');
});
