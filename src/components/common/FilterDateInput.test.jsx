import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FilterBar from './FilterBar';

test('displays Vietnamese dates and preserves ISO values in change callbacks', () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Ngày xem" type="date" name="date" value="2026-11-13" onChange={change} /></FilterBar>);
    const input = screen.getByRole('textbox', { name: 'Ngày xem' });
    expect(input).toHaveValue('13/11/2026');
    fireEvent.change(input, { target: { value: '12/11/2026' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-11-12', name: 'date', type: 'date' }) }));
});

test('retains ISO entry support for existing date filter integrations', () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Ngày xem" type="date" value="2026-11-13" onChange={change} /></FilterBar>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày xem' }), { target: { value: '2026-11-01' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-11-01' }) }));
});

test('keeps dates outside min/max disabled while valid dates remain selectable', async () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Ngày xem" type="date" value="2026-11-13" min="2026-11-10" max="2026-11-13" onChange={change} /></FilterBar>);
    fireEvent.click(screen.getByRole('textbox', { name: 'Ngày xem' }));
    const days = await screen.findAllByRole('gridcell');
    const disabled = days.find(day => day.textContent === '14');
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(disabled);
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(days.find(day => day.textContent === '12'));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-11-12' }) }));
});

test('does not submit an out-of-bounds date entered manually', () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Ngày xem" type="date" value="2026-11-13" max="2026-11-13" onChange={change} /></FilterBar>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày xem' }), { target: { value: '2026-11-14' } });
    expect(change).not.toHaveBeenCalled();
});

test('retains local date/time values and minute precision', () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Từ thời điểm" type="datetime-local" value="2026-11-13T10:30" onChange={change} /></FilterBar>);
    const input = screen.getByRole('textbox', { name: 'Từ thời điểm' });
    expect(input).toHaveValue('13/11/2026 10:30');
    fireEvent.change(input, { target: { value: '13/11/2026 11:05' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2026-11-13T11:05' }) }));
});

test('retains empty values for optional date filters', () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Từ ngày" type="date" value="2026-11-13" onChange={change} /></FilterBar>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Từ ngày' }), { target: { value: '' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '' }) }));
});

test.each(['teacher', 'student'])('keeps the original native date input in %s', area => {
    render(<MemoryRouter initialEntries={[`/${area}/recordings`]}>
        <FilterBar><input aria-label="Từ ngày" type="date" value="2026-11-13" onChange={jest.fn()} /></FilterBar>
    </MemoryRouter>);
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-11-13');
});

test('allows selecting month and year directly before choosing a day', async () => {
    const change = jest.fn();
    render(<FilterBar><input aria-label="Ngày xem" type="date" value="2026-11-13" onChange={change} /></FilterBar>);
    fireEvent.click(screen.getByRole('textbox', { name: 'Ngày xem' }));
    const [month, year] = await screen.findAllByRole('combobox');
    fireEvent.change(year, { target: { value: '2025' } });
    fireEvent.change(month, { target: { value: '9' } });
    expect(change).not.toHaveBeenCalled();
    const days = screen.getAllByRole('gridcell');
    fireEvent.click(days.find(day => day.textContent === '12'));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '2025-10-12' }) }));
});
