import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PersonalAttendancePoints, { summarizePointsByDay } from './PersonalAttendancePoints';
import { getMyPenaltyReport } from '../../service/managerServices';

jest.mock('../../service/managerServices', () => ({ getMyPenaltyReport: jest.fn() }));
const data = { summary: { totalMeetings: 4, totalPoints: -3, leftEarly: 1, excused: 1, pendingExcuses: 1 }, items: [{ meetingId: 'late', title: 'Họp giao ban', startTime: '2026-11-01T08:00:00+07:00', points: -3 }, { meetingId: 'excused', title: 'Họp có lý do đã duyệt', startTime: '2026-11-02T08:00:00+07:00', points: 0 }] };
const view = (from, to) => <MemoryRouter><PersonalAttendancePoints from={from} to={to} /></MemoryRouter>;
beforeEach(() => jest.clearAllMocks());

test('uses server-calculated points and updates the report with the selected dates', async () => {
    getMyPenaltyReport.mockResolvedValue({ success: true, data });
    const { rerender } = render(view('2026-11-01', '2026-11-15'));
    await screen.findByRole('img', { name: /^Điểm theo ngày:/ });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Họp giao ban')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem chi tiết điểm' })).toHaveAttribute('href', '/employee/attendance-points');
    const chart = screen.getByRole('img', { name: /^Điểm theo ngày:/ });
    expect(chart).toHaveAccessibleName(/01\/11: -3 điểm/);
    expect(chart).toHaveAccessibleName(/02\/11: 0 điểm/);
    expect(screen.queryByRole('list', { name: 'Điểm từng ngày' })).not.toBeInTheDocument();
    expect(getMyPenaltyReport).toHaveBeenLastCalledWith({ from: '2026-11-01', to: '2026-11-15' });
    rerender(view('2026-11-09', '2026-11-15'));
    await waitFor(() => expect(getMyPenaltyReport).toHaveBeenLastCalledWith({ from: '2026-11-09', to: '2026-11-15' }));
});

test('shows a load error instead of treating missing points as zero', async () => {
    getMyPenaltyReport.mockRejectedValue(new Error('offline'));
    render(view('2026-11-01', '2026-11-15'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được điểm chuyên cần');
    expect(screen.queryByRole('group', { name: 'Tổng điểm trừ' })).not.toBeInTheDocument();
});

test('chart groups every meeting by Vietnam date, keeps signed points, and includes approved zero scores', () => {
    const totals = summarizePointsByDay([
        ...Array.from({ length: 12 }, () => ({ startTime: '2026-11-13T17:30:00Z', points: -1 })),
        { startTime: '2026-11-14T08:00:00+07:00', points: '-2' },
        { startTime: '2026-11-13T08:00:00+07:00', points: -3 },
        { startTime: '2026-11-15T08:00:00+07:00', points: 0 },
    ]);
    expect(totals).toEqual([
        { day: '2026-11-13', points: -3, meetings: 1 },
        { day: '2026-11-14', points: -14, meetings: 13 },
        { day: '2026-11-15', points: 0, meetings: 1 },
    ]);
    expect(totals.reduce((sum, item) => sum + item.points, 0)).toBe(-17);
});

test('shares the overview report with the chart without fetching points a second time', async () => {
    render(<MemoryRouter><PersonalAttendancePoints from="2026-11-01" to="2026-11-15" report={{ loading: false, data, error: false }} /></MemoryRouter>);
    expect(screen.getByRole('img', { name: /^Điểm theo ngày:/ })).toHaveAccessibleName(/01\/11: -3 điểm/);
    expect(getMyPenaltyReport).not.toHaveBeenCalled();
});
