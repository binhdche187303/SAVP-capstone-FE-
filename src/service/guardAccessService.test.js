import { get } from '../utils/request';
import { buildGuardSummary, fetchGuardGateEventsInRange, filterGuardGateEvents } from './guardAccessService';

jest.mock('../utils/request', () => ({
    get: jest.fn(), post: jest.fn(),
    buildQuery: params => `?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined))}`
}));
jest.mock('../assets/guardDemoFaces', () => ({}));

const event = (id, date, direction = 'in') => ({
    id, userId: 'EMP003', status: 'authorized', direction,
    occurredAt: new Date(date).toISOString(), gateName: 'Cổng chính'
});

beforeEach(() => jest.clearAllMocks());

test('includes both selected dates and excludes adjacent days in exported events', () => {
    const events = [
        event('before', '2026-11-09T23:59:59.999'),
        event('first', '2026-11-10T00:00:00'),
        event('last', '2026-11-12T23:59:59.999'),
        event('after', '2026-11-13T00:00:00')
    ];
    expect(filterGuardGateEvents(events, { fromDate: '2026-11-10', toDate: '2026-11-12' }).map(e => e.id))
        .toEqual(['first', 'last']);
});

test('summarizes entry/exit pairs across multiple days, including an overnight stay', () => {
    const events = [
        event('in-1', '2026-11-10T23:00:00'),
        event('out-1', '2026-11-11T01:00:00', 'out'),
        event('in-2', '2026-11-12T08:00:00'),
        event('out-2', '2026-11-12T09:00:00', 'out'),
        event('outside', '2026-11-13T08:00:00')
    ];
    const summary = buildGuardSummary(events, { fromDate: '2026-11-10', toDate: '2026-11-12' });
    expect(summary).toMatchObject({ entries: 2, exits: 2, presenceMinutes: 180, presencePeopleCount: 1 });
    expect(summary.presenceByPerson[0]).toMatchObject({ totalPresenceMinutes: 180, lastDirection: 'out' });
});

test('keeps existing day/week callers working', () => {
    const events = [event('monday', '2026-11-09T08:00:00'), event('friday', '2026-11-13T08:00:00')];
    expect(buildGuardSummary(events, { rangeMode: 'day', anchorDate: '2026-11-13' }).entries).toBe(1);
    expect(buildGuardSummary(events, { rangeMode: 'week', anchorDate: '2026-11-13' }).entries).toBe(2);
});

test('fetches every page within local day boundaries rather than truncating at 100 logs', async () => {
    const row = i => ({ id: `log-${i}`, access_time: new Date('2026-11-11T12:00:00').toISOString(), direction: 'enter' });
    get.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => row(i)) })
        .mockResolvedValueOnce({ data: [row(100)] });
    expect(await fetchGuardGateEventsInRange('2026-11-10', '2026-11-12')).toHaveLength(101);
    expect(get).toHaveBeenCalledTimes(2);
    const first = new URL(get.mock.calls[0][0], 'http://localhost').searchParams;
    const second = new URL(get.mock.calls[1][0], 'http://localhost').searchParams;
    expect(first.get('from')).toBe(new Date('2026-11-10T00:00:00').toISOString());
    expect(first.get('to')).toBe(new Date('2026-11-12T23:59:59.999').toISOString());
    expect(first.get('limit')).toBe('100');
    expect(first.get('page')).toBe('1');
    expect(second.get('page')).toBe('2');
});
