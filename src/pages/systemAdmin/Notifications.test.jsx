import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Notifications from './Notifications';
import {
    getNotifications,
    getNotificationGroups,
    markNotificationGroupRead,
} from '../../service/sysAdminServices';

jest.mock('../../service/sysAdminServices', () => ({
    getNotifications: jest.fn(),
    getNotificationGroups: jest.fn(),
    markNotificationGroupRead: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
}));
jest.mock('../../components/common/NoShowInlineAction', () => () => null);

const vehicleGroup = {
    type: 'unknown_vehicle_alert',
    day: '2026-10-26',
    total: 470,
    unread: 470,
    latestAt: '2026-10-26T09:07:00Z',
    latest: { id: 'n9', subject: 'Cảnh báo: biển số không xác định', content: 'Biển số 10DS10086 được ghi nhận tại Cổng chính.', priority: 'low', createdAt: '2026-10-26T09:07:00Z' },
};

const view = (path = '/system-admin/notifications') =>
    render(<MemoryRouter initialEntries={[path]}><Notifications /></MemoryRouter>);

beforeEach(() => {
    jest.clearAllMocks();
    getNotificationGroups.mockResolvedValue({ success: true, data: [vehicleGroup], meta: { total: 1, totalPages: 1 } });
    getNotifications.mockResolvedValue({
        success: true,
        data: [{ id: 'n9', notificationType: 'unknown_vehicle_alert', subject: 'Cảnh báo: biển số không xác định', content: 'Biển số 10DS10086 được ghi nhận tại Cổng chính.', priority: 'low', createdAt: '2026-10-26T09:07:00Z', isRead: false }],
        meta: { total: 1, totalPages: 1 },
    });
    markNotificationGroupRead.mockResolvedValue({ success: true });
});

test('mặc định gom nhóm theo loại + ngày: 1 dòng cho 470 cảnh báo xe lạ', async () => {
    view();
    const group = await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    expect(within(group).getByText('470 thông báo · 470 chưa đọc')).toBeInTheDocument();
    expect(within(group).getByText('26/10/2026')).toBeInTheDocument();
    expect(within(group).getByText(/10DS10086/)).toBeInTheDocument();
    expect(getNotificationGroups).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
});

test('tab Chưa đọc lọc ở server', async () => {
    view();
    await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    fireEvent.click(screen.getByRole('button', { name: 'Chưa đọc' }));
    await waitFor(() => expect(getNotificationGroups).toHaveBeenLastCalledWith(expect.objectContaining({ isRead: false, page: 1 })));
});

test('lọc theo loại + khoảng ngày + từ khóa gửi lên server', async () => {
    view();
    await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    fireEvent.change(screen.getByLabelText('Loại thông báo'), { target: { value: 'vehicle' } });
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-26' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-27' } });
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: '10DS' } });
    await waitFor(() => expect(getNotificationGroups).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'unknown_vehicle_alert,vehicle_unauthorized_alert,vehicle_control_list_match',
        from: '2026-10-26',
        to: '2026-10-27',
        search: '10DS',
    })));
});

test('đánh dấu đã đọc cả nhóm', async () => {
    view();
    const group = await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    fireEvent.click(within(group).getByRole('button', { name: 'Đánh dấu đã đọc cả nhóm' }));
    await waitFor(() => expect(markNotificationGroupRead).toHaveBeenCalledWith('unknown_vehicle_alert', '2026-10-26'));
});

test('mở nhóm: tải đúng thông báo của loại + ngày đó', async () => {
    view();
    const group = await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    fireEvent.click(within(group).getByRole('button', { name: 'Xem 470 thông báo' }));
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({
        type: 'unknown_vehicle_alert', from: '2026-10-26', to: '2026-10-26', page: 1,
    })));
});

test('xem dạng danh sách vẫn có', async () => {
    view();
    await screen.findByRole('listitem', { name: /Biển số không xác định/ });
    fireEvent.click(screen.getByRole('button', { name: 'Từng thông báo' }));
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })));
    expect(await screen.findByText(/Biển số 10DS10086/)).toBeInTheDocument();
});
