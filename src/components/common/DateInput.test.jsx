import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DateInput from './DateInput';
import AppDatePicker from './AppDatePicker';

const route = child => <MemoryRouter initialEntries={['/system-admin/uel-sync']}>{child}</MemoryRouter>;

test('UEL form uses Vietnamese calendar and retains ISO date API payloads', async () => {
    const change = jest.fn();
    render(route(<DateInput id="uel-date" aria-label="Lịch học từ ngày" type="date" value="2026-10-14" onChange={change} />));
    const input = screen.getByLabelText('Lịch học từ ngày');
    expect(input).toHaveValue('14/10/2026');
    fireEvent.click(input);
    const [month, year] = await screen.findAllByRole('combobox');
    expect(month).toHaveValue('9');
    expect(month).toHaveTextContent('Tháng Mười');
    expect(year).toHaveValue('2026');
    fireEvent.click(screen.getAllByRole('gridcell').find(day => day.textContent === '15'));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-10-15', id: 'uel-date' }) }));
});

test('date-time form keeps minute precision and rejects dates beyond max', () => {
    const change = jest.fn();
    render(route(<DateInput aria-label="Giờ kết thúc" type="datetime-local" value="2026-11-14T10:00" max="2026-11-14T11:00" onChange={change} />));
    const input = screen.getByLabelText('Giờ kết thúc');
    fireEvent.change(input, { target: { value: '14/11/2026 10:35' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-11-14T10:35' }) }));
    change.mockClear();
    fireEvent.change(input, { target: { value: '14/11/2026 11:01' } });
    expect(change).not.toHaveBeenCalled();
});

test('existing range pickers retain Date arrays while sharing the calendar', async () => {
    const change = jest.fn();
    render(route(<AppDatePicker selectsRange startDate={new Date(2026, 10, 14)} endDate={null} onChange={change} dateFormat="dd/MM/yyyy" />));
    fireEvent.click(screen.getByRole('textbox'));
    expect(await screen.findAllByRole('combobox')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('gridcell').find(day => day.textContent === '16'));
    expect(change.mock.calls[0][0]).toEqual([new Date(2026, 10, 14), new Date(2026, 10, 16)]);
});

test.each(['teacher', 'student', 'visitor-register'])('preserves native calendar in %s', area => {
    render(<MemoryRouter initialEntries={[`/${area}`]}><DateInput aria-label="Ngày" type="date" value="2026-11-14" onChange={jest.fn()} /></MemoryRouter>);
    expect(screen.getByLabelText('Ngày')).toHaveAttribute('type', 'date');
});
