import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeviceStatusModal, { sortDevices } from './DeviceStatusModal';

const devices = [
    { id: '1', name: 'Camera B', code: 'CAM-B', status: 'online' },
    { id: '2', name: 'Camera A', code: 'CAM-A', status: 'offline', lastSeenAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: '3', name: 'Camera C', code: 'CAM-C', status: 'maintenance' },
];

test('thiết bị lỗi lên đầu, online xuống cuối', () => {
    expect(sortDevices(devices).map(d => d.code)).toEqual(['CAM-A', 'CAM-C', 'CAM-B']);
});

test('hiện tên, trạng thái, lần cuối kết nối và link quản lý', () => {
    render(<MemoryRouter><DeviceStatusModal isOpen title="Camera khu vực Cổng chính" devices={devices} manageHref="/system-admin/devices" onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Camera A')).toBeInTheDocument();
    expect(screen.getByText('Mất kết nối')).toBeInTheDocument();
    expect(screen.getByText('Lần cuối: 3 giờ trước')).toBeInTheDocument();
    expect(screen.getByText('Đang bảo trì')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang Thiết bị IoT' })).toHaveAttribute('href', '/system-admin/devices');
});
