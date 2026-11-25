import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeviceManagement from './DeviceManagement';
import { getAnprStats, getDevices, getDeviceStatusSummary, getRooms } from '../../service/sysAdminServices';
import { subscribeToDeviceStatusChanges, subscribeToNotificationUpdates, subscribeToSecurityAlerts } from '../../utils/socket';

jest.mock('../../service/sysAdminServices', () => ({
    getDevices: jest.fn(),
    getDeviceStatusSummary: jest.fn(),
    getAnprStats: jest.fn(),
    getRooms: jest.fn(),
    registerDevice: jest.fn(),
    updateDevice: jest.fn(),
    enableDevice: jest.fn(),
    disableDevice: jest.fn(),
    assignDeviceRoom: jest.fn(),
    configDeviceRtsp: jest.fn(),
    rotateFaceServerToken: jest.fn(),
    revokeFaceServerToken: jest.fn(),
    checkDeviceAvailability: jest.fn(),
    configureFaceTerminal: jest.fn(),
}));
jest.mock('../../utils/socket', () => ({
    subscribeToDeviceStatusChanges: jest.fn(),
    subscribeToNotificationUpdates: jest.fn(),
    subscribeToSecurityAlerts: jest.fn(),
}));

beforeEach(() => {
    jest.clearAllMocks();
    getRooms.mockResolvedValue({ success: true, data: [] });
    getDevices.mockResolvedValue({ success: true, data: [] });
    getAnprStats.mockResolvedValue({ success: true, data: [] });
    getDeviceStatusSummary.mockResolvedValue({
        success: true,
        data: { total: 15, online: 8, offline: 3, disabled: 2, maintenance: 2 },
    });
    subscribeToDeviceStatusChanges.mockReturnValue(() => {});
    subscribeToNotificationUpdates.mockReturnValue(() => {});
    subscribeToSecurityAlerts.mockReturnValue(() => {});
});

test('hiện tối đa 4 card và chip Bảo trì vẫn lọc trạng thái thiết bị', async () => {
    const view = render(
        <MemoryRouter initialEntries={['/system-admin/devices']}>
            <Routes>
                <Route path="/system-admin/devices" element={<DeviceManagement />} />
            </Routes>
        </MemoryRouter>,
    );

    const stats = await screen.findByRole('group', { name: 'Thống kê trạng thái thiết bị' });
    expect(stats.querySelectorAll('[data-stat-card="standard"]')).toHaveLength(4);
    ['Tổng thiết bị', 'Online', 'Offline', 'Vô hiệu'].forEach((label) => {
        expect(within(stats).getByRole('button', { name: new RegExp(label) }).querySelector('svg')).toBeInTheDocument();
    });

    const otherStatuses = within(stats).getByRole('group', { name: 'Khác' });
    const maintenance = within(otherStatuses).getByRole('button', { name: /Bảo trì/ });
    fireEvent.click(maintenance);
    expect(maintenance).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByLabelText('Trạng thái')).toHaveTextContent('Bảo trì'));

    fireEvent.click(within(stats).getByRole('button', { name: /Tổng thiết bị/ }));
    await waitFor(() => expect(screen.getByLabelText('Trạng thái')).toHaveTextContent('Tất cả trạng thái'));
    view.unmount();
});
