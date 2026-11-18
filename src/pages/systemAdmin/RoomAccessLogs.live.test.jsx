import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoomAccessLogs from './RoomAccessLogs';
import { getRooms, getRoomAccessLog, getRoomBookings } from '../../service/sysAdminServices';
import { getUsers } from '../../service/employeeServices';
jest.mock('../../service/sysAdminServices', () => ({ getRooms: jest.fn(), getRoomAccessLog: jest.fn(), getRoomBookings: jest.fn(), getUserById: jest.fn() }));
jest.mock('../../service/employeeServices', () => ({ getUsers: jest.fn() }));
const room = { id: '11111111-1111-4111-8111-111111111111', roomName: 'Phòng thật' };
const view = () => render(<MemoryRouter initialEntries={['/system-admin/room-access-logs']}><RoomAccessLogs /></MemoryRouter>);
beforeEach(() => {
    jest.clearAllMocks();
    getRooms.mockResolvedValue({ success: true, data: [room] });
    getUsers.mockResolvedValue({ success: true, data: [] });
    getRoomBookings.mockResolvedValue({ success: true, data: [] });
    getRoomAccessLog.mockResolvedValue({ success: true, data: { events: [], pagination: { total: 0 } } });
});
test('an empty camera response never becomes fabricated classes, meetings or students', async () => {
    view();
    expect(await screen.findByText('Không có dữ liệu nhật ký')).toBeInTheDocument();
    expect(screen.queryByText('Bùi Văn Long')).not.toBeInTheDocument();
    expect(screen.queryByText('IT Weekly Sync')).not.toBeInTheDocument();
    expect(screen.queryByText(/Lớp WEB101|Trí tuệ nhân tạo ứng dụng/)).not.toBeInTheDocument();
});
test('shows actual events returned by the camera endpoint', async () => {
    getRoomAccessLog.mockResolvedValue({ success: true, data: { events: [{ id: 'actual-event', roomId: room.id, roomName: room.roomName, fullName: 'Người từ camera thật', eventTime: new Date().toISOString(), direction: 'enter', status: 'matched' }], pagination: { total: 1 } } });
    view();
    expect(await screen.findByText('Người từ camera thật')).toBeInTheDocument();
    expect(screen.queryByText('IT Weekly Sync')).not.toBeInTheDocument();
});
test('a connection failure is shown instead of replacing the response with demo events', async () => {
    getRoomAccessLog.mockResolvedValue({ success: false, message: 'Chưa kết nối camera' });
    view();
    expect(await screen.findByText('Chưa kết nối camera')).toBeInTheDocument();
    expect(screen.queryByText('Bùi Văn Long')).not.toBeInTheDocument();
});
test('cột camera chỉ ghi vị trí (Thang máy), không ghi tên thiết bị cầu nối', async () => {
    getRoomAccessLog.mockResolvedValue({ success: true, data: { events: [{ id: 'bridge-event', roomId: room.id, roomName: room.roomName, fullName: 'Người qua thang máy', eventTime: new Date().toISOString(), direction: 'seen', status: 'matched', deviceName: 'HGVision Camera API Bridge', deviceCode: 'IVSS-BRIDGE', zoneName: 'Thang máy' }], pagination: { total: 1 } } });
    view();
    expect(await screen.findByText('Người qua thang máy')).toBeInTheDocument();
    expect(screen.getByText('Thang máy')).toBeInTheDocument();
    expect(screen.queryByText('HGVision Camera API Bridge')).not.toBeInTheDocument();
});
