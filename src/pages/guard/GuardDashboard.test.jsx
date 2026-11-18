import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuardDashboard from './GuardDashboard';
import { getSecurityAlerts } from '../../service/securityAlertService';
import { getAdminGateAccessLogs } from '../../service/sysAdminServices';

jest.mock('../../service/securityAlertService', () => ({ getSecurityAlerts: jest.fn(), acknowledgeSecurityAlert: jest.fn(), resolveSecurityAlert: jest.fn() }));
jest.mock('../../service/sysAdminServices', () => ({ getAdminGateAccessLogs: jest.fn() }));
jest.mock('../../utils/socket', () => ({ subscribeToSecurityAlerts: () => () => {} }));
jest.mock('../../components/common/DashboardBanner', () => () => null);
jest.mock('../../components/security/EventSnapshotModal', () => () => null);

const logs = Array.from({ length: 25 }, (_, i) => ({ id: `log-${i}`, user: { full_name: `Người ${i + 1}` }, access_time: '2026-11-14T03:00:00Z', direction: 'enter', zone_name: 'Cổng chính' }));
const alerts = Array.from({ length: 23 }, (_, i) => ({ id: `alert-${i}`, alert_type: 'stranger', severity: 'medium', status: 'new', payload_json: { fullName: `Cảnh báo thử ${i + 1}` } }));
const paginate = (items, page, limit) => ({ data: items.slice((page - 1) * limit, page * limit), meta: { total: items.length } });

beforeEach(() => {
    jest.clearAllMocks();
    getAdminGateAccessLogs.mockImplementation(async ({ page, limit, direction }) => direction ? { data: [], meta: { total: 25 } } : paginate(logs, page, limit));
    getSecurityAlerts.mockImplementation(async ({ status, page, limit }) => status === 'open' ? paginate(alerts, page, limit) : { data: [], meta: { total: status === 'new' ? 23 : 0 } });
});

test('hai danh sách phân trang theo đủ tổng API, độc lập và dùng cùng kiểu điều khiển', async () => {
    render(<MemoryRouter initialEntries={['/guard']}><GuardDashboard /></MemoryRouter>);
    const traffic = within(screen.getByRole('region', { name: 'Ra vào cổng gần nhất' }));
    const warnings = within(screen.getByRole('region', { name: 'Cảnh báo cần xử lý' }));
    await traffic.findByText('Hiển thị 1–10 / 25 lượt ra/vào');
    await warnings.findByText('Hiển thị 1–5 / 23 cảnh báo');
    await waitFor(() => expect(traffic.getByRole('button', { name: 'Sau', exact: true })).toBeEnabled());
    fireEvent.click(traffic.getByRole('button', { name: 'Sau', exact: true }));
    await traffic.findByText('Hiển thị 11–20 / 25 lượt ra/vào');
    expect(traffic.getByText('Người 20')).toBeInTheDocument();
    expect(warnings.getByText('Hiển thị 1–5 / 23 cảnh báo')).toBeInTheDocument();
    await waitFor(() => expect(warnings.getByRole('button', { name: 'Sau', exact: true })).toBeEnabled());
    fireEvent.click(warnings.getByRole('button', { name: 'Sau', exact: true }));
    await warnings.findByText('Hiển thị 6–10 / 23 cảnh báo');
    expect(traffic.queryByLabelText('Số dòng/trang')).not.toBeInTheDocument();
    fireEvent.click(traffic.getByRole('button', { name: 'Trước', exact: true }));
    await traffic.findByText('Hiển thị 1–10 / 25 lượt ra/vào');
    expect(warnings.getByText('Hiển thị 6–10 / 23 cảnh báo')).toBeInTheDocument();
    expect(getAdminGateAccessLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
    expect(getSecurityAlerts).toHaveBeenCalledWith({ status: 'open', page: 2, limit: 5 });
    for (const list of [traffic, warnings]) {
        expect(list.getByRole('button', { name: 'Trước', exact: true })).toHaveTextContent('Trước');
        expect(list.getByRole('button', { name: 'Sau', exact: true })).toHaveTextContent('Sau');
    }
});

test('Đóng cảnh báo mở modal của hệ thống (không dùng window.prompt), bắt buộc ghi chú', async () => {
    const { resolveSecurityAlert } = jest.requireMock('../../service/securityAlertService');
    resolveSecurityAlert.mockResolvedValue({ success: true });
    const promptSpy = jest.spyOn(window, 'prompt').mockImplementation(() => null);
    const acked = [{ id: 'a-1', alert_type: 'vehicle_control_match', severity: 'high', status: 'acknowledged', payload_json: { plateNumber: '88B351455' } }];
    getSecurityAlerts.mockImplementation(async ({ status, page, limit }) => status === 'open' ? paginate(acked, page, limit) : { data: [], meta: { total: 0 } });
    render(<MemoryRouter initialEntries={['/guard']}><GuardDashboard /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng cảnh báo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đóng cảnh báo' });
    expect(promptSpy).not.toHaveBeenCalled();
    const note = within(dialog).getByLabelText('Ghi chú xử lý');
    expect(note).toHaveValue('Đã kiểm tra và xử lý tại hiện trường');
    fireEvent.change(note, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng cảnh báo' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Vui lòng nhập ghi chú');
    expect(resolveSecurityAlert).not.toHaveBeenCalled();
    fireEvent.change(note, { target: { value: 'Đã liên hệ chủ xe' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng cảnh báo' }));
    await waitFor(() => expect(resolveSecurityAlert).toHaveBeenCalledWith('a-1', { resolution_note: 'Đã liên hệ chủ xe' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    promptSpy.mockRestore();
});

test('Tiếp nhận mở modal (ghi chú không bắt buộc), gửi kèm ghi chú và báo đã tiếp nhận', async () => {
    const { acknowledgeSecurityAlert } = jest.requireMock('../../service/securityAlertService');
    acknowledgeSecurityAlert.mockResolvedValue({ success: true });
    const fresh = [{ id: 'n-1', alert_type: 'unknown_vehicle', severity: 'medium', status: 'new', payload_json: { plateNumber: '51A12345' } }];
    getSecurityAlerts.mockImplementation(async ({ status, page, limit }) => status === 'open' ? paginate(fresh, page, limit) : { data: [], meta: { total: 0 } });
    render(<MemoryRouter initialEntries={['/guard']}><GuardDashboard /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp nhận' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tiếp nhận cảnh báo' });
    expect(within(dialog).getByText('· 51A12345')).toBeInTheDocument();
    const note = within(dialog).getByLabelText('Ghi chú tiếp nhận');
    expect(note).toHaveValue('');
    fireEvent.change(note, { target: { value: 'Đang ra cổng kiểm tra' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp nhận' }));
    await waitFor(() => expect(acknowledgeSecurityAlert).toHaveBeenCalledWith('n-1', 'Đang ra cổng kiểm tra'));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã tiếp nhận cảnh báo: Xe lạ · 51A12345');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
