import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AttendancePenaltyReport from './AttendancePenaltyReport';
import { getMyPenaltyReport, getPenaltyMeetingSummary, getPenaltyReportScope, getPenaltySummary } from '../../service/managerServices';

jest.mock('../../service/managerServices', () => ({
    getMyPenaltyReport: jest.fn(), getPenaltyMeetingSummary: jest.fn(), getPenaltyReportScope: jest.fn(), getPenaltySummary: jest.fn(),
    getUserPenaltyReport: jest.fn(), getPenaltyMeetingDetail: jest.fn(),
}));

const counts = { totalMeetings: 3, present: 1, late: 0, leftEarly: 0, absent: 2, excused: 0, totalPoints: -4 };
const people = ['Nguyễn An', 'Trần Bình'].map((fullName, index) => ({ ...counts, userId: `user-${index}`, fullName }));
const meetings = [1, 2, 3].map(index => ({ ...counts, meetingId: `meeting-${index}`, title: `Cuộc họp ${index}`, invited: 3, startTime: '2026-11-01T08:00:00Z' }));

beforeEach(() => {
    jest.clearAllMocks();
    getPenaltyReportScope.mockResolvedValue({ data: { scope: 'school' } });
    getMyPenaltyReport.mockResolvedValue({ data: { summary: counts, items: [] } });
    getPenaltySummary.mockImplementation(async ({ search }) => ({ data: {
        rows: search ? people.slice(0, 1) : people, departments: [], totals: { ...counts, people: search ? 1 : 2 },
    } }));
    getPenaltyMeetingSummary.mockImplementation(async ({ search }) => ({ data: {
        rows: search ? meetings.slice(0, 1) : meetings, departments: [], totals: { ...counts, meetings: search ? 1 : 3 },
    } }));
});

test('thẻ dùng số liệu thật, lọc chế độ xem và cập nhật số đếm theo tìm kiếm', async () => {
    render(<MemoryRouter initialEntries={['/business-admin/attendance-points']}><AttendancePenaltyReport /></MemoryRouter>);
    const peopleCard = await screen.findByRole('button', { name: 'Tổng hợp toàn trường · Theo nhân sự' });
    await within(peopleCard).findByText('2', { exact: true });
    const meetingsCard = screen.getByRole('button', { name: 'Theo cuộc họp', exact: true });
    expect(within(meetingsCard).getByText('3', { exact: true })).toBeInTheDocument();
    fireEvent.click(meetingsCard);
    expect(meetingsCard).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Cuộc họp 1', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'An' } });
    await waitFor(() => expect(getPenaltyMeetingSummary).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'An' })));
    await within(meetingsCard).findByText('1', { exact: true });
    fireEvent.click(peopleCard);
    expect(await screen.findByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.queryByText('Trần Bình')).not.toBeInTheDocument();
    expect(getMyPenaltyReport).not.toHaveBeenCalled();
});

test('tài khoản chỉ có phạm vi cá nhân không gọi báo cáo tổng hợp', async () => {
    getPenaltyReportScope.mockResolvedValue({ data: { scope: null } });
    render(<MemoryRouter initialEntries={['/employee/attendance-points']}><AttendancePenaltyReport /></MemoryRouter>);
    expect(await screen.findByText('Số buổi họp')).toBeInTheDocument();
    expect(getMyPenaltyReport).toHaveBeenCalled();
    expect(getPenaltySummary).not.toHaveBeenCalled();
    expect(getPenaltyMeetingSummary).not.toHaveBeenCalled();
});

test('personal cards filter actual categories and negative scores, keep totals, and reset pagination', async () => {
    getPenaltyReportScope.mockResolvedValue({ data: { scope: null } });
    const items = [
        ...Array.from({ length: 12 }, (_, index) => ({ meetingId: `late-${index}`, title: `Đi trễ ${index + 1}`, category: 'late', points: -1 })),
        { meetingId: 'early', title: 'Buổi về sớm', category: 'left_early', points: -2 },
        { meetingId: 'absent', title: 'Buổi vắng mặt', category: 'absent', points: -2 },
        { meetingId: 'excused', title: 'Buổi có lý do', category: 'excused', points: 0 },
        { meetingId: 'present', title: 'Buổi có mặt', category: 'present', points: 0 },
    ];
    getMyPenaltyReport.mockResolvedValue({ data: { summary: { totalMeetings: 16, late: 12, leftEarly: 1, absent: 1, excused: 1, totalPoints: -16 }, items } });
    render(<MemoryRouter initialEntries={['/employee/attendance-points']}><AttendancePenaltyReport /></MemoryRouter>);
    const all = await screen.findByRole('button', { name: 'Số buổi họp', exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Đi trễ', exact: true }));
    expect(screen.queryByText('Buổi có lý do')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2', exact: true }));
    expect(await screen.findByText('Đi trễ 12', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vắng mặt', exact: true }));
    expect(await screen.findByText('Buổi vắng mặt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(within(all).getByText('16', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Về sớm', exact: true }));
    expect(await screen.findByText('Buổi về sớm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Có lý do', exact: true }));
    expect(await screen.findByText('Buổi có lý do')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tổng điểm trừ', exact: true }));
    expect(screen.queryByText('Buổi có lý do')).not.toBeInTheDocument();
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Đi trễ 1', { exact: true })).toBeInTheDocument();
});
