import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MeetingApprovals from './MeetingApprovals';
import { getPendingMeetingRequests, approveMeetingRequest, rejectMeetingRequest } from '../../service/managerServices';

jest.mock('../../service/managerServices', () => ({
    getPendingMeetingRequests: jest.fn(), approveMeetingRequest: jest.fn(), rejectMeetingRequest: jest.fn(),
}));
jest.mock('../../utils/socket', () => ({ subscribeToMeetingRequestUpdates: () => () => {} }));

test('status cards show API totals, filter requests and reset pagination', async () => {
    const totals = { pending: 23, approved: 31, rejected: 7, expired: 2, all: 63 };
    getPendingMeetingRequests.mockImplementation(async ({ approvalStatus, page, limit }) => ({
        success: true,
        data: [{
            id: `${approvalStatus}-${page}`, requestCode: `${approvalStatus}-${page}`,
            approvalStatus: approvalStatus === 'all' ? 'pending' : approvalStatus,
            requestedStartTime: '2026-11-18T01:00:00Z', requestedEndTime: '2026-11-18T02:00:00Z',
            meeting: { title: 'Cuộc họp kiểm tra' }, requestedBy: { fullName: 'Nguyễn Văn An' },
        }],
        meta: { total: totals[approvalStatus], totalPages: Math.ceil(totals[approvalStatus] / limit) },
    }));
    render(<MemoryRouter initialEntries={['/manager/meeting-approvals']}><MeetingApprovals /></MemoryRouter>);

    const pending = screen.getByRole('button', { name: /^Chờ phê duyệt/ });
    await waitFor(() => expect(within(pending).getByText('23')).toBeInTheDocument());
    expect(pending).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dạng thẻ' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Grid' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    await waitFor(() => expect(getPendingMeetingRequests).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: 'pending', page: 2, limit: 10 })));
    const approved = screen.getByRole('button', { name: /^Đã phê duyệt/ });
    fireEvent.click(approved);
    await waitFor(() => expect(getPendingMeetingRequests).toHaveBeenLastCalledWith(expect.objectContaining({ approvalStatus: 'approved', page: 1, limit: 10 })));
    expect(approved).toHaveAttribute('aria-pressed', 'true');
    expect(within(approved).getByText('31')).toBeInTheDocument();
    expect(pending).toHaveAttribute('aria-pressed', 'false');
    expect(approveMeetingRequest).not.toHaveBeenCalled();
    expect(rejectMeetingRequest).not.toHaveBeenCalled();
});
