import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmployeeOnTimeAnalytics from './EmployeeOnTimeAnalytics';
import { getAttendanceAnalytics, getAttendanceUserStats, getDepartments } from '../../service/sysAdminServices';

jest.mock('../../service/sysAdminServices', () => ({
    getAttendanceAnalytics: jest.fn(), getAttendanceUserStats: jest.fn(),
    getDepartments: jest.fn(), getUsers: jest.fn(),
}));
jest.mock('../../components/common/FilterBar', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));
jest.mock('recharts', () => ({ ...jest.requireActual('recharts'), ResponsiveContainer: () => null }));

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ roles: ['MANAGER'], departmentId: 'department-1' }));
    getDepartments.mockResolvedValue({ success: true, data: [] });
    getAttendanceAnalytics.mockResolvedValue({ success: true, data: {} });
    getAttendanceUserStats.mockResolvedValue({ success: true, data: { items: [], total: 0 } });
});
afterEach(() => localStorage.removeItem('user'));

test('custom selection supplies a complete date range to the dashboard and member list', async () => {
    render(<MemoryRouter initialEntries={['/manager/attendance-analytics']}><EmployeeOnTimeAnalytics /></MemoryRouter>);
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Tuần', exact: true }));
    await waitFor(() => expect(getAttendanceAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'week' })));
    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn', exact: true }));
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'custom', from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })));
    for (const api of [getAttendanceAnalytics, getAttendanceUserStats]) {
        const customCalls = api.mock.calls.filter(([params]) => params.preset === 'custom');
        expect(customCalls.length).toBeGreaterThan(0);
        customCalls.forEach(([params]) => {
            expect(params.from).toBeTruthy();
            expect(params.to).toBeTruthy();
            expect(params.from <= params.to).toBe(true);
        });
    }
});

test('missing or reversed dates do not trigger either analytics request', async () => {
    render(<MemoryRouter initialEntries={['/manager/attendance-analytics']}><EmployeeOnTimeAnalytics /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn', exact: true }));
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'custom' })));
    getAttendanceAnalytics.mockClear();
    getAttendanceUserStats.mockClear();
    const fromInput = screen.getByLabelText('Từ ngày');
    const toInput = screen.getByLabelText('Đến ngày');
    fireEvent.change(fromInput, { target: { value: '' } });
    expect(screen.getByRole('status')).toHaveTextContent('Vui lòng chọn đủ từ ngày và đến ngày.');
    fireEvent.change(toInput, { target: { value: '2026-01-01' } });
    fireEvent.change(fromInput, { target: { value: '2026-02-01' } });
    expect(screen.getByRole('status')).toHaveTextContent('Từ ngày phải trước hoặc bằng đến ngày.');
    expect(getAttendanceAnalytics).not.toHaveBeenCalled();
    expect(getAttendanceUserStats).not.toHaveBeenCalled();
    fireEvent.change(toInput, { target: { value: '2026-02-05' } });
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-02-01', to: '2026-02-05' })));
});

test('date fields stay visible for presets and editing a date selects custom', async () => {
    render(<MemoryRouter initialEntries={['/manager/attendance-analytics']}><EmployeeOnTimeAnalytics /></MemoryRouter>);
    const from = screen.getByLabelText('Từ ngày');
    const to = screen.getByLabelText('Đến ngày');
    expect(from.value).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to.value).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ngày', exact: true }));
    expect(from.value).toBe(to.value);
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'day' })));
    fireEvent.change(from, { target: { value: '2026-01-01' } });
    expect(screen.getByRole('button', { name: 'Tùy chọn', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(getAttendanceUserStats).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'custom', from: '2026-01-01', to: to.value })));
});
