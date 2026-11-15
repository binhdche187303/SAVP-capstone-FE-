import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MeetingAttendanceAdmin from './MeetingAttendanceAdmin';
import { getMeetings, getDepartments } from '../../service/businessAdminServices';

jest.mock('../../service/businessAdminServices', () => ({ getMeetings: jest.fn(), getDepartments: jest.fn() }));
jest.mock('../../components/meeting/MeetingPresenceIVSS', () => () => <div>Chi tiết chuyên cần</div>);

beforeEach(() => {
    jest.clearAllMocks();
    getDepartments.mockResolvedValue({ success: true, data: [] });
    getMeetings.mockImplementation(async ({ status, page = 1, limit }) => {
        const total = status === 'completed' ? 25 : 4;
        const start = (page - 1) * limit;
        return { success: true, data: { items: Array.from({ length: Math.min(limit, Math.max(0, total - start)) }, (_, index) => ({
            id: `${status}-${start + index}`, title: `Cuộc họp ${status} ${start + index + 1}`,
            startTime: '2026-11-14T08:00:00+07:00', endTime: '2026-11-14T09:00:00+07:00',
        })), meta: { total, totalPages: Math.ceil(total / limit), limit } } };
    });
});

const renderPage = () => render(<MemoryRouter initialEntries={['/business-admin/meeting-attendance']}><MeetingAttendanceAdmin /></MemoryRouter>);

test('cards show all matching meetings and switch status at page one', async () => {
    renderPage();
    const cards = within(screen.getByRole('group', { name: 'Trạng thái cuộc họp' }));
    await cards.findByRole('button', { name: 'Đã kết thúc 25' });
    expect(cards.getByRole('button', { name: 'Đang diễn ra 4' })).toHaveAttribute('aria-pressed', 'false');
    await screen.findByText('Hiển thị 1–10 / 25 cuộc họp');
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    await screen.findByText('Hiển thị 11–20 / 25 cuộc họp');
    expect(cards.getByRole('button', { name: 'Đã kết thúc 25' })).toBeInTheDocument();
    fireEvent.click(cards.getByRole('button', { name: 'Đang diễn ra 4' }));
    await screen.findByText('Hiển thị 1–4 / 4 cuộc họp');
    expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress', page: 1, limit: 10 }));
    expect(cards.getByRole('button', { name: 'Đang diễn ra 4' })).toHaveAttribute('aria-pressed', 'true');
});

test('both totals follow the same date range as the list', async () => {
    renderPage();
    await screen.findByText('Hiển thị 1–10 / 25 cuộc họp');
    getMeetings.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Năm', exact: true }));
    const from = `${new Date().getFullYear()}-01-01T00:00:00+07:00`;
    for (const status of ['completed', 'in_progress']) {
        await waitFor(() => expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({ status, limit: 1, from })));
    }
});

test('department and search filter automatically; clearing resets dates, criteria and page', async () => {
    const departmentId = '11111111-1111-4111-8111-111111111111';
    getDepartments.mockResolvedValue({ success: true, data: [{ id: departmentId, name: 'Phòng Công nghệ' }] });
    renderPage();
    await screen.findByRole('option', { name: 'Phòng Công nghệ' });
    await screen.findByText('Hiển thị 1–10 / 25 cuộc họp');
    fireEvent.change(screen.getByPlaceholderText('Tên cuộc họp...'), { target: { value: 'Kế hoạch' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: departmentId } });
    await waitFor(() => expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({ departmentId, search: 'Kế hoạch', limit: 10, page: 1 })));
    for (const status of ['completed', 'in_progress']) {
        await waitFor(() => expect(getMeetings).toHaveBeenCalledWith(expect.objectContaining({ departmentId, search: 'Kế hoạch', status, limit: 1 })));
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sau', exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    await screen.findByText('Hiển thị 11–20 / 25 cuộc họp');
    getMeetings.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await screen.findByText('Hiển thị 1–10 / 25 cuộc họp');
    expect(screen.queryByRole('button', { name: 'Áp dụng' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tên cuộc họp...')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(getMeetings).toHaveBeenCalledWith({ status: 'completed', page: 1, limit: 10 });
    expect(getMeetings).toHaveBeenCalledWith({ status: 'in_progress', page: 1, limit: 1 });
});
