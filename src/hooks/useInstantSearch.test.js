import { act, renderHook } from '@testing-library/react';
import { matchesSearch, normalizeSearchText, useDebouncedValue, useInstantFilter } from './useInstantSearch';

const items = [
    { id: 1, fullName: 'Nguyễn Văn Phúc', email: 'hieutruong@meetingsys.vn', room: { roomName: 'Phòng họp A101' } },
    { id: 2, fullName: 'Lê Thị Minh Châu', email: 'pht@meetingsys.vn', room: { roomName: 'Hội trường B' } },
];

test('normalizes Vietnamese accents and case', () => {
    expect(normalizeSearchText('  Đặng PHÚC ')).toBe('dang phuc');
});

test('matches nested values without accents', () => {
    expect(matchesSearch(items[0], 'phuc')).toBe(true);
    expect(matchesSearch(items[0], 'a101')).toBe(true);
    expect(matchesSearch(items[1], 'phuc')).toBe(false);
    expect(matchesSearch(items[1], '')).toBe(true);
});

test('filters instantly while waiting, then shows the server result as-is', () => {
    const { result, rerender } = renderHook(({ list, query, pending }) => useInstantFilter(list, query, pending), {
        initialProps: { list: items, query: 'chau', pending: true },
    });
    expect(result.current.map((i) => i.id)).toEqual([2]);
    // Từ khoá đã ổn định nhưng dữ liệu chưa được thay: vẫn coi là đang chờ, giữ kết quả lọc tại chỗ.
    rerender({ list: items, query: 'chau', pending: false });
    expect(result.current.map((i) => i.id)).toEqual([2]);
    // BE trả kết quả mới cho đúng từ khoá: hiển thị nguyên dữ liệu BE, không lọc lại.
    const serverResult = [...items];
    rerender({ list: serverResult, query: 'chau', pending: false });
    expect(result.current.map((i) => i.id)).toEqual([1, 2]);
});

test('keeps the current list when nothing matches locally (no blank flash)', () => {
    const { result } = renderHook(() => useInstantFilter(items, 'khong-co', true));
    expect(result.current.map((i) => i.id)).toEqual([1, 2]);
});

test('an empty search box never starts waiting', () => {
    const { result, rerender } = renderHook(({ list, pending }) => useInstantFilter(list, '', pending), {
        initialProps: { list: [], pending: true },
    });
    expect(result.current).toEqual([]);
    rerender({ list: items, pending: false });
    expect(result.current.map((i) => i.id)).toEqual([1, 2]);
});

test('debounces value changes', () => {
    jest.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } });
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('ab');
    jest.useRealTimers();
});
