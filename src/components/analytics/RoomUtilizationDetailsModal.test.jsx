import { fireEvent, render, screen } from '@testing-library/react';
import RoomUtilizationDetailsModal, {
    mapRoomUtilizationRows,
    rankRoomUtilizationRows,
} from './RoomUtilizationDetailsModal';

const rawRooms = [
    { roomId: 'a', roomName: 'Phòng A.101', reservationUtilizationRate: 25, bookedHours: 10, actualHours: 8 },
    { roomId: 'b', roomName: 'Phòng B.201', reservationUtilizationRate: 80, bookedHours: 20, actualHours: 12 },
    { roomId: 'c', roomName: 'Phòng C.301', reservationUtilizationRate: 80, bookedHours: 24, actualHours: null },
];

describe('RoomUtilizationDetailsModal', () => {
    test('chuẩn hóa dữ liệu và xếp hạng theo tỷ lệ, giờ đặt rồi tên phòng', () => {
        const rows = mapRoomUtilizationRows(rawRooms);
        expect(rows[0]).toEqual(expect.objectContaining({ id: 'a', name: 'A.101', rate: 25, bookedHours: 10, actualHours: 8 }));
        expect(rankRoomUtilizationRows(rows).map(room => room.name)).toEqual(['C.301', 'B.201', 'A.101']);
    });

    test('hiển thị toàn bộ phòng và tìm kiếm theo tên', () => {
        render(<RoomUtilizationDetailsModal isOpen onClose={jest.fn()} rooms={mapRoomUtilizationRows(rawRooms)} periodLabel="Tháng 11/2026" />);

        expect(screen.getByRole('dialog', { name: 'Tất cả phòng họp' })).toBeInTheDocument();
        expect(screen.getByText('C.301')).toBeInTheDocument();
        expect(screen.getByText('B.201')).toBeInTheDocument();
        expect(screen.getByText('A.101')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('Tìm theo tên phòng...'), { target: { value: 'B.201' } });
        expect(screen.getByText('B.201')).toBeInTheDocument();
        expect(screen.queryByText('A.101')).not.toBeInTheDocument();
    });
});
