import { changeFilter } from '../../testUtils/filterSelection';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VehicleRegistrations from './VehicleRegistrations';
import { getAdminVehicleRegistrations, getUsers } from '../../service/sysAdminServices';

jest.mock('../../service/sysAdminServices', () => ({
    getAdminVehicleRegistrations: jest.fn(), getUsers: jest.fn(), getUserById: jest.fn(),
}));
jest.mock('../../components/common/UserAvatar', () => () => <span>Ảnh chủ xe</span>);

beforeEach(() => {
    jest.clearAllMocks();
    getUsers.mockResolvedValue({ success: true, data: [] });
    getAdminVehicleRegistrations.mockImplementation(async filters => ({
        success: true, data: [], meta: { page: filters.page, total: 21, totalPages: 3 },
    }));
});

const loaded = () => waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeEnabled());

test('status cards filter through the API, reset pagination and toggle off', async () => {
    render(<VehicleRegistrations />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    fireEvent.click(screen.getByRole('button', { name: /Đang hoạt động/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'active' })));
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('active');
    expect(screen.getByRole('button', { name: /Đang hoạt động/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Vô hiệu/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'disabled' })));
    fireEvent.click(screen.getByRole('button', { name: /Vô hiệu/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ status: '' })));
});

test('owner card opens an API-backed owner filter and clears it when closed', async () => {
    render(<VehicleRegistrations />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Số chủ xe/ }));
    changeFilter(screen.getByRole('textbox', { name: 'Chủ xe' }), { target: { value: 'Lan' } });
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, owner: 'Lan' })));
    fireEvent.click(screen.getByRole('button', { name: /Số chủ xe/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ owner: '' })));
    expect(screen.queryByRole('textbox', { name: 'Chủ xe' })).not.toBeInTheDocument();
});

test('total card clears combined filters to show all vehicles', async () => {
    render(<VehicleRegistrations />);
    await loaded();
    changeFilter(screen.getByRole('textbox', { name: 'Tìm kiếm' }), { target: { value: '30A' } });
    changeFilter(screen.getByLabelText('Loại phương tiện'), { target: { value: 'car' } });
    fireEvent.click(screen.getByRole('button', { name: /Đang hoạt động/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ search: '30A', vehicleType: 'car', status: 'active' })));
    fireEvent.click(screen.getByRole('button', { name: /Tổng phương tiện/ }));
    await waitFor(() => expect(getAdminVehicleRegistrations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: '', vehicleType: '', status: '', owner: '' })));
    expect(screen.getByRole('button', { name: /Tổng phương tiện/ })).toHaveAttribute('aria-pressed', 'true');
});
