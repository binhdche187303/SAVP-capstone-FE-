import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ANPRManagement from './ANPRManagement';
import { getUsers } from '../../service/employeeServices';

jest.mock('../../service/employeeServices', () => ({ getUsers: jest.fn() }));
jest.mock('../../service/anprService', () => ({
    getAdminVehicleHistory: jest.fn(async () => ({ success: true, data: [], meta: { total: 0 } })),
    adminRegisterVehicle: jest.fn(async () => ({ success: true })),
    getUnknownVehicles: jest.fn(async () => ({ success: true, data: [], meta: { total: 0 } })),
    mockAnprVehicleEvent: jest.fn(),
    setupMockAnprCamera: jest.fn(),
}));

test('chọn chủ xe: tìm theo tên trên toàn bộ người dùng, không chỉ 100 người đầu', async () => {
    getUsers.mockImplementation(async ({ search }) => ({
        success: true,
        data: search ? [{ id: 'u-z', fullName: 'Võ Thị Xuân', email: 'xuanvt@uel.edu.vn' }] : [],
    }));
    render(<MemoryRouter><ANPRManagement /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký xe nhân viên/ }));
    fireEvent.change(await screen.findByPlaceholderText('Gõ tên, email hoặc mã nhân viên...'), { target: { value: 'Xuân' } });
    await waitFor(() => expect(getUsers).toHaveBeenCalledWith(expect.objectContaining({ search: 'Xuân' })));
    expect(await screen.findByRole('option', { name: 'Võ Thị Xuân - xuanvt@uel.edu.vn' })).toBeInTheDocument();
});
