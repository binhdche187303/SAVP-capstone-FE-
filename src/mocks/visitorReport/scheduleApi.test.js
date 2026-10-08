// src/mocks/visitorReport/scheduleApi.test.js
import * as svc from '../../service/reportCenterService';
import { resetState } from './store';

const ok = async (promise) => {
    const res = await promise;
    expect(res.success).toBe(true);
    return res.data;
};
const payload = (over = {}) => ({
    name: 'Báo cáo khách hằng tuần',
    reportType: 'visitor',
    filters: { departmentId: 'dep-cntt' },
    period: 'last_week',
    frequency: 'weekly',
    time: '08:00',
    dayOfWeek: 1,
    dayOfMonth: null,
    formats: ['pdf', 'xlsx'],
    recipients: [{ type: 'email', value: 'truongphong@savp.edu.vn', label: 'truongphong@savp.edu.vn' }],
    subject: 'Báo cáo khách tuần trước',
    message: 'Kính gửi anh/chị báo cáo định kỳ.',
    enabled: true,
    ...over,
});

beforeEach(() => resetState());

test('dữ liệu sinh sẵn: 6 lịch, 40 lần chạy có lần lỗi', async () => {
    const schedules = await ok(svc.listSchedules());
    expect(schedules).toHaveLength(6);
    expect(schedules.filter((s) => s.enabled).every((s) => s.nextRunAt)).toBe(true);
    expect(schedules.find((s) => !s.enabled).nextRunAt).toBeNull();
    const runs = await ok(svc.listScheduleRuns({ limit: 100 }));
    expect(runs.total).toBe(40);
    const failed = await ok(svc.listScheduleRuns({ status: 'failed', limit: 100 }));
    expect(failed.total).toBe(3);
    failed.items.forEach((r) => expect(r.error).toBeTruthy());
});

test('tạo, sửa, bật/tắt, nhân bản, xóa', async () => {
    const created = await ok(svc.createSchedule(payload()));
    expect(created.reportTitle).toBe('Khách đến làm việc');
    expect(new Date(created.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const edited = await ok(svc.updateSchedule(created.id, payload({ frequency: 'daily', dayOfWeek: null, time: '06:00' })));
    expect(edited.frequency).toBe('daily');

    expect((await ok(svc.toggleSchedule(created.id, false))).nextRunAt).toBeNull();

    const copy = await ok(svc.duplicateSchedule(created.id));
    expect(copy.name).toBe('Báo cáo khách hằng tuần (bản sao)');
    expect(copy.enabled).toBe(false);

    await ok(svc.deleteSchedule(created.id));
    expect((await ok(svc.listSchedules())).some((s) => s.id === created.id)).toBe(false);
    expect((await svc.deleteSchedule('khong-co')).success).toBe(false);
});

test('gửi thử tạo lần chạy manual, không đổi lần chạy kế tiếp', async () => {
    const created = await ok(svc.createSchedule(payload()));
    const run = await ok(svc.runScheduleNow(created.id));
    expect(run).toMatchObject({ scheduleId: created.id, trigger: 'manual', status: 'success', recipientCount: 1, formats: ['pdf', 'xlsx'] });
    expect(run.from <= run.to).toBe(true);
    const after = (await ok(svc.listSchedules())).find((s) => s.id === created.id);
    expect(after.nextRunAt).toBe(created.nextRunAt);
    expect((await ok(svc.listScheduleRuns({ scheduleId: created.id }))).total).toBe(1);
});

test('gửi lại lần lỗi', async () => {
    const failed = (await ok(svc.listScheduleRuns({ status: 'failed' }))).items[0];
    const retry = await ok(svc.retryScheduleRun(failed.id));
    expect(retry).toMatchObject({ trigger: 'manual', status: 'success', scheduleId: failed.scheduleId, from: failed.from, to: failed.to });
    const again = (await ok(svc.listScheduleRuns({ status: 'failed', limit: 100 }))).items.find((r) => r.id === failed.id);
    expect(again.retriedByRunId).toBe(retry.id);
});

test.each([
    [{ name: ' ' }, 'Vui lòng nhập tên lịch gửi'],
    [{ reportType: 'khong-co' }, 'Loại báo cáo không tồn tại'],
    [{ period: 'last_year' }, 'Kỳ dữ liệu không hợp lệ'],
    [{ frequency: 'yearly' }, 'Tần suất không hợp lệ'],
    [{ time: '25:00' }, 'Giờ gửi không hợp lệ'],
    [{ dayOfWeek: 9 }, 'Vui lòng chọn thứ trong tuần'],
    [{ frequency: 'monthly', dayOfMonth: 31 }, 'Ngày trong tháng phải từ 1 đến 28 hoặc ngày cuối tháng'],
    [{ formats: [] }, 'Vui lòng chọn ít nhất một định dạng'],
    [{ recipients: [] }, 'Cần ít nhất 1 người nhận'],
    [{ recipients: Array.from({ length: 21 }, (_, i) => ({ type: 'email', value: `a${i}@savp.edu.vn`, label: '' })) }, 'Tối đa 20 người nhận'],
    [{ recipients: [{ type: 'email', value: 'sai-email', label: '' }] }, 'Email không hợp lệ: sai-email'],
])('lịch sai dữ liệu %#', async (over, message) => {
    expect(await svc.createSchedule(payload(over))).toEqual({ success: false, message });
});
