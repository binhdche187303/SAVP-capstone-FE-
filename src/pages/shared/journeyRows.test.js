import { buildJourneyRows, mergeZoneStays } from './journeyRows';

const at = (hm) => `2026-11-23T${hm}:00+07:00`;
const zone = (hm, direction, zoneName = 'Bãi giữ xe') => ({ type: 'zone', direction, zoneName, time: at(hm) });
const gate = (hm, direction) => ({ type: 'gate', direction, zoneName: 'Cổng chính', time: at(hm) });

test('gộp zone appear + disappear cùng khu vực thành 1 lượt ở, xếp theo giờ tăng dần', () => {
    const rows = mergeZoneStays([zone('17:17', 'disappear'), zone('17:00', 'appear'), gate('07:45', 'enter')]);
    expect(rows.map((r) => r.type)).toEqual(['gate', 'zone']);
    expect(rows[1]).toMatchObject({ direction: 'stay', time: at('17:00'), endTime: at('17:17'), durationMs: 17 * 60000 });
});

test('không gộp khác khu vực; disappear lẻ và appear lẻ giữ nguyên', () => {
    const rows = mergeZoneStays([zone('08:00', 'appear', 'A'), zone('09:00', 'disappear', 'B')]);
    expect(rows.map((r) => r.direction)).toEqual(['appear', 'disappear']);
});

test('không sửa mảng sự kiện gốc', () => {
    const events = [zone('08:00', 'appear'), zone('09:00', 'disappear')];
    mergeZoneStays(events);
    expect(events[0].direction).toBe('appear');
    expect(events[0].endTime).toBeUndefined();
});

test('đánh dấu lượt ở kết thúc sau khi đã ra cổng', () => {
    const rows = buildJourneyRows([gate('07:45', 'enter'), zone('17:00', 'appear'), gate('17:10', 'leave'), zone('17:17', 'disappear')]);
    const stay = rows.find((r) => r.type === 'zone');
    expect(stay.afterExitAt).toBe(at('17:10'));
});

test('không đánh dấu khi đã vào cổng lại', () => {
    const rows = buildJourneyRows([gate('12:00', 'leave'), gate('13:00', 'enter'), zone('14:00', 'appear'), zone('15:00', 'disappear')]);
    expect(rows.find((r) => r.type === 'zone').afterExitAt).toBeUndefined();
});
