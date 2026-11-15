import { fireEvent, render, screen } from '@testing-library/react';
import CalendarRangePresets, { calendarRange } from './CalendarRangePresets';

describe('calendar range shortcuts', () => {
    test('week starts on Monday even across a year boundary', () => {
        expect(calendarRange('week', new Date(2027, 0, 3))).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    });
    test('month and year use calendar boundaries through today', () => {
        const today = new Date(2028, 1, 29);
        expect(calendarRange('month', today)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
        expect(calendarRange('year', today)).toEqual({ from: '2028-01-01', to: '2028-02-29' });
    });
    test('shortcuts change both dates, manual edits and Custom preserve entered dates', () => {
        const onChange = jest.fn();
        const { rerender } = render(<CalendarRangePresets from="2020-01-01" to="2020-01-07" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Năm' }));
        const range = calendarRange('year');
        expect(onChange).toHaveBeenLastCalledWith(range);
        rerender(<CalendarRangePresets {...range} onChange={onChange} />);
        expect(screen.getByRole('button', { name: 'Năm' })).toHaveAttribute('aria-pressed', 'true');
        rerender(<CalendarRangePresets from="2020-01-01" to="2020-01-07" onChange={onChange} />);
        expect(screen.getByRole('button', { name: 'Tùy chọn khoảng' })).toHaveAttribute('aria-pressed', 'true');
        onChange.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn khoảng' }));
        expect(onChange).not.toHaveBeenCalled();
    });
});
