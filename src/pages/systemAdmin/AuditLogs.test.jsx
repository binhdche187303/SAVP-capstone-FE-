import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuditLogs from './AuditLogs';
import { getAuditLogs, getAuditLogActionTypes } from '../../service/sysAdminServices';

jest.mock('../../service/sysAdminServices', () => ({
    getAuditLogs: jest.fn(), getAuditLogActionTypes: jest.fn(), exportAuditLogs: jest.fn(), getUserById: jest.fn(),
}));
const result = total => ({ success: true, data: [], meta: { page: 1, limit: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) } });
const renderPage = () => render(<MemoryRouter initialEntries={['/system-admin/audit-logs']}><AuditLogs /></MemoryRouter>);
beforeEach(() => {
    jest.clearAllMocks();
    getAuditLogActionTypes.mockResolvedValue({ success: true, data: [{ actionType: 'auth.login', count: 3 }] });
    getAuditLogs.mockResolvedValue(result(0));
});

test('filters automatically and clears criteria without sending the previous filters again', async () => {
    renderPage();
    await waitFor(() => expect(getAuditLogs).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Áp dụng' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mức độ'), { target: { value: 'warning' } });
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'warning', page: 1 })));
    fireEvent.change(screen.getByLabelText('Tìm kiếm từ khóa'), { target: { value: 'admin' } });
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'admin' })));
    fireEvent.click(screen.getByRole('button', { name: 'Ngày', exact: true }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: expect.any(String), endDate: expect.any(String) })));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith({ page: 1, limit: 10, action: undefined, entity: undefined, severity: undefined, startDate: undefined, endDate: undefined }));
    expect(screen.getByLabelText('Tìm kiếm từ khóa')).toHaveValue('');
});

test('a slow response for old criteria cannot replace the results after clearing', async () => {
    let resolveOld;
    getAuditLogs.mockImplementation(params => params.severity === 'warning'
        ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(result(101)));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Tìm thấy/)).toHaveTextContent('101'));
    fireEvent.change(screen.getByLabelText('Mức độ'), { target: { value: 'warning' } });
    await waitFor(() => expect(resolveOld).toEqual(expect.any(Function)));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ severity: undefined })));
    await act(async () => resolveOld(result(55)));
    expect(screen.getByText(/Tìm thấy/)).toHaveTextContent('101');
});
