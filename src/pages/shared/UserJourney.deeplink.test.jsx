import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserJourney from './UserJourney';
import { getUsers, getUserById } from '../../service/businessAdminServices';

jest.mock('../../service/businessAdminServices', () => ({ getUsers: jest.fn(), getUserById: jest.fn() }));
jest.mock('../../service/campusService', () => ({
    getUserJourney: jest.fn(async () => ({ success: true, data: { events: [], summary: {} } })),
    getMyUserJourney: jest.fn(async () => ({ success: true, data: { events: [], summary: {} } })),
}));

beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', fullName: 'Quản trị', roles: ['SYSTEM_ADMIN'] }));
    // 50 người đầu (A→Z) không có người được mở qua link — DB thật có ~26.000 tài khoản.
    getUsers.mockResolvedValue({ success: true, data: [{ id: 'u-a', fullName: 'A Thị Kim Hoa' }], meta: { total: 25981 } });
    getUserById.mockResolvedValue({ success: true, data: { id: 'u-target', fullName: 'Nguyễn Văn Luân', email: 'luannv@uel.edu.vn' } });
});

test('mở hành trình qua ?userId= chọn đúng người đó, không lấy người đầu danh sách', async () => {
    render(<MemoryRouter initialEntries={['/x?userId=u-target']}><UserJourney /></MemoryRouter>);
    await waitFor(() => expect(getUserById).toHaveBeenCalledWith('u-target'));
    expect(await screen.findByDisplayValue('Nguyễn Văn Luân')).toBeInTheDocument();
    expect(getUsers).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'u-target' }));
});
