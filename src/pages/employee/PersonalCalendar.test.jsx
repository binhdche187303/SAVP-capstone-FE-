import { calendarViewRange } from './PersonalCalendar';

test('day view requests exactly the chosen date in Vietnam time', () => {
    expect(calendarViewRange(new Date(2026, 10, 15), 'day')).toEqual({ from: '2026-11-15T00:00:00+07:00', to: '2026-11-15T23:59:59+07:00' });
});

test('week view includes Monday through Sunday when the week crosses months', () => {
    expect(calendarViewRange(new Date(2026, 10, 1), 'week')).toEqual({ from: '2026-10-26T00:00:00+07:00', to: '2026-11-01T23:59:59+07:00' });
});

test('month view includes leap day', () => {
    expect(calendarViewRange(new Date(2028, 1, 12), 'month')).toEqual({ from: '2028-02-01T00:00:00+07:00', to: '2028-02-29T23:59:59+07:00' });
});
