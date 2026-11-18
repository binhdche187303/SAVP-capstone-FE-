import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DepartmentManagement from './DepartmentManagement';
import * as svc from '../../service/businessAdminServices';

jest.mock('../../service/businessAdminServices', () => {
    const ok = (data = []) => jest.fn(async () => ({ success: true, data, meta: { total: data.length, totalPages: 1 } }));
    return {
        getDepartments: ok(),
        getDepartmentById: ok(),
        createDepartment: ok(),
        updateDepartment: ok(),
        deactivateDepartment: ok(),
        reactivateDepartment: ok(),
        getUsersForManagement: ok(),
        createUser: ok(),
        updateUser: ok(),
        updateUserRoles: ok(),
        lockUser: ok(),
        unlockUser: ok(),
        deleteUser: ok(),
        getUserAuditLogs: ok(),
        getRoles: ok(),
        getUserById: ok(),
    };
});

const depts = [
    { id: 'd-law', departmentCode: 'LAW', departmentName: 'Khoa Luật', isActive: true, memberCount: 3, staffCount: 1, studentCount: 2 },
    { id: 'd-it', departmentCode: 'IT', departmentName: 'Phòng Công nghệ thông tin', isActive: true, memberCount: 1, staffCount: 1, studentCount: 0 },
];
const people = {
    'd-law': {
        staff: [{ id: 'u1', fullName: 'Nguyễn Luật Sư', email: 'ls@uel.edu.vn', accountStatus: 'active', roles: ['LECTURER'] }],
        student: [{ id: 's1', fullName: 'Lê Sinh Viên', email: 'sv@st.uel.edu.vn', accountStatus: 'active', roles: ['STUDENT'] }],
    },
    'd-it': {
        staff: [{ id: 'u2', fullName: 'Trần Kỹ Thuật', email: 'kt@uel.edu.vn', accountStatus: 'active', roles: ['EMPLOYEE'] }],
        student: [],
    },
};

beforeEach(() => {
    svc.getDepartments.mockResolvedValue({ success: true, data: depts, meta: { total: 2, totalPages: 1 } });
    svc.getRoles.mockResolvedValue({ success: true, data: [
        { id: 7, roleCode: 'LECTURER', roleName: 'Giảng viên' },
        { id: 3, roleCode: 'EMPLOYEE', roleName: 'Nhân viên' },
    ] });
    svc.getUsersForManagement.mockImplementation(async ({ departmentId, accountType }) => {
        const data = people[departmentId]?.[accountType] || [];
        return { success: true, data, meta: { total: data.length, totalPages: 1 } };
    });
});

test('cột thành viên tách cán bộ và SV', async () => {
    render(<MemoryRouter><DepartmentManagement /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: '1 cán bộ · 2 SV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 cán bộ' })).toBeInTheDocument();
});

test('mở phòng ban: mặc định chỉ cán bộ của đúng phòng ban đó, có tab xem SV', async () => {
    render(<MemoryRouter><DepartmentManagement /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '1 cán bộ · 2 SV' }));
    await screen.findByText('Nguyễn Luật Sư');
    expect(svc.getUsersForManagement).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'd-law', accountType: 'staff', page: 1 }));
    expect(screen.queryByText('Lê Sinh Viên')).not.toBeInTheDocument();
    const row = screen.getByText('Nguyễn Luật Sư').closest('tr');
    expect(within(row).getByText('Giảng viên')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sinh viên (2)' }));
    await screen.findByText('Lê Sinh Viên');
    expect(svc.getUsersForManagement).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'd-law', accountType: 'student', page: 1 }));
    await waitFor(() => expect(screen.queryByText('Nguyễn Luật Sư')).not.toBeInTheDocument());
});

test('phòng ban khác hiện danh sách khác', async () => {
    render(<MemoryRouter><DepartmentManagement /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '1 cán bộ' }));
    await screen.findByText('Trần Kỹ Thuật');
    await waitFor(() => expect(screen.queryByText('Nguyễn Luật Sư')).not.toBeInTheDocument());
});
