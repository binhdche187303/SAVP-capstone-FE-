// src/mocks/visitorReport/store.test.js
import { buildSeed, ME_HOST_ID, SEED_VERSION } from './seed';
import { STORAGE_KEY, loadState, saveState, updateState, resetState } from './store';
import { isOverstay } from './visitStateMachine';

const NOW = new Date(2026, 9, 7, 10, 0, 0);
const NEXT_DAY = new Date(2026, 9, 8, 9, 0, 0);
const sameDay = (iso, day) => new Date(iso).toDateString() === day.toDateString();

beforeEach(() => {
    jest.restoreAllMocks();
    resetState(NOW);
    window.localStorage.clear();
});

describe('buildSeed', () => {
    const seed = buildSeed(NOW);

    test('tất định với cùng thời điểm', () => {
        expect(buildSeed(NOW)).toEqual(seed);
    });
    test('đủ quy mô', () => {
        expect(seed.version).toBe(SEED_VERSION);
        expect(seed.departments).toHaveLength(12);
        expect(seed.zones).toHaveLength(6);
        expect(seed.hosts).toHaveLength(61);
        expect(seed.visits.length).toBeGreaterThanOrEqual(350);
        expect(seed.schedules).toHaveLength(6);
        expect(seed.runs).toHaveLength(40);
        expect(seed.runs.filter((r) => r.status === 'failed').length).toBeGreaterThanOrEqual(3);
    });
    test('hôm nay có đủ trạng thái để demo', () => {
        const today = seed.visits.filter((v) => sameDay(v.scheduledFrom, NOW));
        expect(today).toHaveLength(14);
        const statuses = new Set(today.map((v) => v.status));
        ['pending_approval', 'approved', 'checked_in', 'checked_out', 'rejected'].forEach((s) => expect(statuses.has(s)).toBe(true));
        expect(today.some((v) => isOverstay(v, NOW))).toBe(true);
        expect(today.filter((v) => v.status === 'pending_approval' && v.hostId === ME_HOST_ID)).toHaveLength(2);
        expect(today.some((v) => v.status === 'approved' && !v.visitor.hasPhoto)).toBe(true);
        // Bổ sung 2026-10-08: có khách phải rời, lượt đã vào có lần cuối camera thấy, lượt quá giờ đã quá 30 phút.
        expect(today.filter((v) => v.status === 'must_leave')).toHaveLength(1);
        today.filter((v) => v.checkInAt).forEach((v) => expect(v.lastSeen).toMatchObject({ zoneId: expect.any(String), at: expect.any(String) }));
        const late = today.find((v) => isOverstay(v, NOW));
        expect(NOW.getTime() - new Date(late.access.validTo).getTime()).toBeGreaterThanOrEqual(30 * 60 * 1000);
    });
    test('mã lượt đúng định dạng và không trùng', () => {
        const codes = seed.visits.map((v) => v.code);
        codes.forEach((c) => expect(c).toMatch(/^VS-\d{6}-\d{4}$/));
        expect(new Set(codes).size).toBe(codes.length);
        expect(new Set(seed.visits.map((v) => v.id)).size).toBe(seed.visits.length);
    });
    test('lượt đã rời có giờ vào trước giờ ra', () => {
        seed.visits.filter((v) => v.status === 'checked_out').forEach((v) => {
            expect(new Date(v.checkInAt).getTime()).toBeLessThan(new Date(v.checkOutAt).getTime());
        });
    });
    test('lịch sử quá khứ không đổi khi sang ngày', () => {
        const pick = (s) => s.visits.find((v) => v.id === 'v-20261001-01');
        expect(pick(buildSeed(NEXT_DAY))).toEqual(pick(seed));
    });
});

describe('store', () => {
    test('lần đầu trả seed và ghi localStorage', () => {
        const state = loadState(NOW);
        expect(state.visits.length).toBeGreaterThanOrEqual(350);
        expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
    test('updateState giữ thay đổi qua lần đọc sau', () => {
        updateState((s) => { s.visits[0].purpose = 'Đã sửa'; }, NOW);
        expect(loadState(NOW).visits[0].purpose).toBe('Đã sửa');
    });
    test('JSON hỏng → trả seed, không ném lỗi', () => {
        window.localStorage.setItem(STORAGE_KEY, '{hỏng');
        expect(loadState(NOW).visits.length).toBeGreaterThanOrEqual(350);
    });
    test('sai version → sinh lại', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 0, visits: [] }));
        expect(loadState(NOW).visits.length).toBeGreaterThanOrEqual(350);
    });
    test('localStorage không ghi được → vẫn giữ thay đổi trong bộ nhớ', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
        expect(saveState(buildSeed(NOW))).toBe(false);
        updateState((s) => { s.visits[0].purpose = 'Trong bộ nhớ'; }, NOW);
        expect(loadState(NOW).visits[0].purpose).toBe('Trong bộ nhớ');
    });
    test('sang ngày khác → sinh lại hôm nay, giữ bản ghi người dùng đã chạm', () => {
        updateState((s) => {
            s.visits.unshift({ ...s.visits[0], id: 'u-1', code: 'VS-261007-9001', userTouched: true });
        }, NOW);
        const next = loadState(NEXT_DAY);
        expect(next.visits.some((v) => v.id === 'u-1')).toBe(true);
        expect(next.visits.filter((v) => sameDay(v.scheduledFrom, NEXT_DAY)).length).toBeGreaterThanOrEqual(14);
        expect(new Set(next.visits.map((v) => v.id)).size).toBe(next.visits.length);
    });
    test('resetState xoá thay đổi', () => {
        updateState((s) => { s.visits[0].purpose = 'Đã sửa'; }, NOW);
        expect(resetState(NOW).visits[0].purpose).not.toBe('Đã sửa');
    });
});
