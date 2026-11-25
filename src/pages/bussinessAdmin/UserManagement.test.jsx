import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserManagement from './UserManagement';
import {
    getDepartments,
    getRoles,
    getStudentAdministrativeClasses,
    getUsers,
    getUsersForManagement,
} from '../../service/businessAdminServices';

jest.mock('../../service/businessAdminServices', () => ({
    getUsers: jest.fn(),
    getUsersForManagement: jest.fn(),
    getStudentAdministrativeClasses: jest.fn(),
    createUser: jest.fn(),
    createPartnerUser: jest.fn(),
    updateUser: jest.fn(),
    updatePartnerExpiry: jest.fn(),
    updateUserRoles: jest.fn(),
    lockUser: jest.fn(),
    unlockUser: jest.fn(),
    updateUserStatus: jest.fn(),
    deleteUser: jest.fn(),
    getUserAuditLogs: jest.fn(),
    getDepartments: jest.fn(),
    getRoles: jest.fn(),
    exportUsers: jest.fn(),
    getUserById: jest.fn(),
    resyncUserPortrait: jest.fn(),
}));
jest.mock('../../service/anprService', () => ({ adminRegisterVehicle: jest.fn() }));

const totals = {
    active: 8,
    locked: 2,
    inactive: 1,
    pending_reset: 3,
    expired: 1,
};

beforeEach(() => {
    jest.clearAllMocks();
    getUsers.mockResolvedValue({ success: true, data: [] });
    getDepartments.mockResolvedValue({ success: true, data: [] });
    getRoles.mockResolvedValue({ success: true, data: [] });
    getStudentAdministrativeClasses.mockResolvedValue({ success: true, data: [] });
    getUsersForManagement.mockImplementation(({ accountStatus } = {}) => Promise.resolve({
        success: true,
        data: [],
        meta: {
            total: accountStatus ? totals[accountStatus] : 15,
            totalPages: 1,
        },
    }));
});

test('hiển thị tối đa 4 card và các trạng thái còn lại vẫn lọc được từ mục Khác', async () => {
    render(
        <MemoryRouter initialEntries={['/system-admin/users']}>
            <Routes>
                <Route path="/system-admin/users" element={<UserManagement mode="system-admin" />} />
            </Routes>
        </MemoryRouter>,
    );

    await screen.findByText('Không tìm thấy người dùng phù hợp.');
    const stats = await screen.findByRole('group', { name: 'Thống kê trạng thái tài khoản' });
    expect(stats.querySelectorAll('[data-stat-card="standard"]')).toHaveLength(4);
    ['Tổng tài khoản', 'Hoạt động', 'Bị khóa', 'Tạm dừng'].forEach((label) => {
        expect(within(stats).getByRole('button', { name: label }).querySelector('svg')).toBeInTheDocument();
    });

    const otherStatuses = within(stats).getByRole('group', { name: 'Khác' });
    expect(within(otherStatuses).getAllByRole('button')).toHaveLength(2);
    const pendingReset = within(otherStatuses).getByRole('button', { name: /Chờ đổi mật khẩu/ });
    const expired = within(otherStatuses).getByRole('button', { name: /Hết hạn/ });
    expect(pendingReset).toBeInTheDocument();
    expect(expired).toBeInTheDocument();

    fireEvent.click(pendingReset);
    expect(pendingReset).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByLabelText('Trạng thái')).toHaveTextContent('Chờ đổi mật khẩu'));
    await waitFor(() => expect(getUsersForManagement).toHaveBeenCalledWith(expect.objectContaining({ accountStatus: 'pending_reset' })));

    fireEvent.click(within(stats).getByRole('button', { name: 'Tổng tài khoản' }));
    await waitFor(() => expect(screen.getByLabelText('Trạng thái')).toHaveTextContent('Tất cả trạng thái'));
});
