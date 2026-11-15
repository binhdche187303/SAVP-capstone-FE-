import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoomManagement from './RoomManagement';
import { getRooms, getRoomFilterOptions } from '../../service/businessAdminServices';

jest.mock('../../service/businessAdminServices', () => ({ getRooms: jest.fn(), getRoomFilterOptions: jest.fn() }));

const rooms = [
    { id: 'a1', roomName: 'Phòng A1', roomCode: 'RM-A1', siteName: 'Tòa nhà A', areaName: 'Tầng 1', capacity: 8, currentStatus: 'available' },
    { id: 'a2', roomName: 'Phòng A2', roomCode: 'RM-A2', siteName: 'Tòa nhà A', areaName: 'Tầng 2', capacity: 20, currentStatus: 'available' },
    { id: 'b1', roomName: 'Phòng B1', roomCode: 'RM-B1', siteName: 'Tòa nhà B', areaName: 'Tầng 3', capacity: 50, currentStatus: 'available' },
];

test('one location field filters by building or by a specific floor across the whole list', async () => {
    getRoomFilterOptions.mockResolvedValue({ success: true, data: rooms });
    getRooms.mockImplementation(async params => {
        const data = rooms.filter(room => (!params.siteName || room.siteName === params.siteName)
            && (!params.areaName || room.areaName === params.areaName));
        return { success: true, data, meta: { total: data.length, totalPages: 1 } };
    });
    render(<MemoryRouter initialEntries={['/business-admin/rooms']}><RoomManagement /></MemoryRouter>);
    await screen.findByText('Phòng A1');
    await screen.findByRole('option', { name: 'Tòa nhà A · Tầng 2' });
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: JSON.stringify({ siteName: 'Tòa nhà A', areaName: 'Tầng 2' }) } });
    await waitFor(() => expect(getRooms).toHaveBeenCalledWith({ siteName: 'Tòa nhà A', areaName: 'Tầng 2', page: 1, limit: 10 }));
    await screen.findByText('Phòng A2');
    await waitFor(() => expect(screen.queryByText('Phòng A1')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: JSON.stringify({ siteName: 'Tòa nhà A' }) } });
    await screen.findByText('Phòng A1');
    expect(screen.queryByText('Phòng B1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: '' } });
    await screen.findByText('Phòng B1');
    expect(screen.queryByLabelText('Sức chứa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loại phòng')).not.toBeInTheDocument();
});
