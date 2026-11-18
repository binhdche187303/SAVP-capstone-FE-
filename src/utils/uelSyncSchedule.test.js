import { nextRunOf, scheduleLabelOf } from './uelSyncSchedule';

const S = { autoEnabled: true, frequency: 'interval', intervalDays: 5, weekday: 0, time: '02:00' };

test('mỗi N ngày: chưa có lượt tự động nào ⇒ lần tới như hằng ngày', () => {
    const from = new Date(2026, 10, 17, 10, 0);
    expect(nextRunOf(S, from)).toEqual(new Date(2026, 10, 18, 2, 0));
});

test('mỗi N ngày: lần tới = ngày lượt trước + N lúc giờ chạy', () => {
    const from = new Date(2026, 10, 17, 10, 0);
    const last = new Date(2026, 10, 16, 2, 0).toISOString();
    expect(nextRunOf(S, from, last)).toEqual(new Date(2026, 10, 21, 2, 0));
});

test('mỗi N ngày: lượt trước đã quá hạn ⇒ lần cron kế tiếp', () => {
    const from = new Date(2026, 10, 17, 10, 0);
    const last = new Date(2026, 9, 1, 2, 0).toISOString();
    expect(nextRunOf(S, from, last)).toEqual(new Date(2026, 10, 18, 2, 0));
});

test('nhãn mỗi N ngày', () => {
    expect(scheduleLabelOf({ ...S, intervalDays: 30 })).toBe('02:00 mỗi 30 ngày');
});
