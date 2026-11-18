import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { getNotifications } from '../../service/sysAdminServices';
import { subscribeToNotificationUpdates } from '../../utils/socket';
import { emitNotificationBanner } from '../../utils/notificationBanner';

jest.mock('../../service/sysAdminServices', () => ({ getNotifications: jest.fn() }));
jest.mock('../../service/securityAlertService', () => ({ getSecurityAlerts: jest.fn(async () => ({ success: true, data: [], meta: { total: 0 } })) }));
jest.mock('../../utils/socket', () => ({ subscribeToNotificationUpdates: jest.fn() }));
jest.mock('../../utils/notificationBanner', () => ({ emitNotificationBanner: jest.fn() }));
jest.mock('./NoShowInlineAction', () => () => null);

let pushRealtime;
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    subscribeToNotificationUpdates.mockImplementation((cb) => { pushRealtime = cb; return () => {}; });
    getNotifications.mockResolvedValue({
        success: true,
        data: [{ id: 'n1', notificationType: 'unknown_vehicle_alert', subject: 'Cảnh báo: biển số không xác định', content: 'Biển số 1', priority: 'low', createdAt: '2026-11-18T03:00:00Z', isRead: false }],
        meta: { total: 500, unread: 3 },
    });
});

const view = () => render(<MemoryRouter><NotificationBell basePath="/system-admin" /></MemoryRouter>);

test('số trên chuông = số chưa đọc thật từ server (không tính xe lạ mức thấp)', async () => {
    view();
    expect(await screen.findByText('3')).toBeInTheDocument();
});

test('thông báo realtime mức thấp (xe lạ) không tăng số, không bật banner', async () => {
    view();
    await screen.findByText('3');
    act(() => pushRealtime({ id: 'n2', subject: 'Cảnh báo: biển số không xác định', content: 'x', priority: 'low', createdAt: new Date().toISOString() }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(emitNotificationBanner).not.toHaveBeenCalled();

    act(() => pushRealtime({ id: 'n3', subject: 'Cảnh báo: camera mất kết nối', content: 'y', priority: 'high', createdAt: new Date().toISOString() }));
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(emitNotificationBanner).toHaveBeenCalledTimes(1);
});
