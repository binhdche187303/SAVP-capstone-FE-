import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import RolePermissionManagement from './RolePermissionManagement';
import * as api from '../../service/permissionServices';

jest.mock('../../service/permissionServices', () => ({
    getRoles: jest.fn(), getPermissions: jest.fn(), getRolePermissions: jest.fn(),
    assignRolePermissions: jest.fn(), revokeRolePermission: jest.fn(),
    createRole: jest.fn(), deleteRole: jest.fn(),
}));
jest.mock('framer-motion', () => ({
    Reorder: {
        Group: ({ children }) => <ul>{children}</ul>,
        Item: ({ children, onClick }) => <li onClick={onClick}>{children}</li>,
    },
    useDragControls: () => ({ start: jest.fn() }),
}));

const roles = [
    { id: 'admin', roleCode: 'SYSTEM_ADMIN', isSystemRole: true },
    { id: 'manager', roleCode: 'MANAGER', isSystemRole: true },
];
const permissions = [
    { id: 'p1', permissionCode: 'report.center.read', permissionName: 'Xem Trung tâm báo cáo', moduleCode: 'reports' },
    { id: 'p2', permissionCode: 'report.template.manage', permissionName: 'Quản lý mẫu báo cáo', moduleCode: 'reports' },
];

beforeEach(() => {
    localStorage.clear();
    api.getRoles.mockResolvedValue({ success: true, data: roles, meta: { totalPages: 1 } });
    api.getPermissions.mockResolvedValue({ success: true, data: permissions, meta: { totalPages: 1 } });
    api.getRolePermissions.mockResolvedValue({ success: true, data: [{ id: 'p1' }] });
});

test('shows the actual API error and can recover by reloading', async () => {
    api.getPermissions.mockRejectedValueOnce({ error: { message: 'Kết nối tới máy chủ bị gián đoạn.' } });
    render(<RolePermissionManagement />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kết nối tới máy chủ bị gián đoạn.');
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại dữ liệu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('loads every permission page within the API page size', async () => {
    api.getPermissions.mockImplementation(({ page }) => Promise.resolve({
        success: true, data: [permissions[page - 1]], meta: { totalPages: 2 },
    }));
    render(<RolePermissionManagement />);
    expect(await screen.findByLabelText('Quản lý mẫu báo cáo')).toBeInTheDocument();
    expect(api.getPermissions).toHaveBeenCalledWith({ page: 1, limit: 100 });
    expect(api.getPermissions).toHaveBeenCalledWith({ page: 2, limit: 100 });
    expect(screen.queryByLabelText(/Chỉ có nút xuất báo cáo/)).not.toBeInTheDocument();
});

test('ignores an earlier role response after selecting a different role', async () => {
    let resolveAdmin;
    api.getRolePermissions.mockImplementation((id) => id === 'admin'
        ? new Promise((resolve) => { resolveAdmin = resolve; })
        : Promise.resolve({ success: true, data: [{ id: 'p2' }] }));
    render(<RolePermissionManagement />);
    await waitFor(() => expect(api.getRolePermissions).toHaveBeenCalledWith('admin'));
    fireEvent.click(screen.getByRole('heading', { name: 'Quản lý', exact: true }));
    await waitFor(() => expect(screen.getByLabelText('Quản lý mẫu báo cáo')).toBeChecked());
    await act(async () => resolveAdmin({ success: true, data: [{ id: 'p1' }] }));
    expect(screen.getByLabelText('Quản lý mẫu báo cáo')).toBeChecked();
    expect(screen.getByLabelText('Xem Trung tâm báo cáo')).not.toBeChecked();
});

test('blocks saving when assigned permissions fail to load, then allows retry', async () => {
    api.getRolePermissions.mockRejectedValueOnce({ error: { message: 'Không đủ quyền đọc cấu hình.' } });
    render(<RolePermissionManagement />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đủ quyền đọc cấu hình.');
    expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại dữ liệu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled());
});

test('does not show a stale initial-load error after a later load has succeeded', async () => {
    let rejectFirst;
    api.getPermissions.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectFirst = reject; }));
    render(<StrictMode><RolePermissionManagement /></StrictMode>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled());
    await act(async () => rejectFirst({ error: { message: 'Lỗi của yêu cầu cũ.' } }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
