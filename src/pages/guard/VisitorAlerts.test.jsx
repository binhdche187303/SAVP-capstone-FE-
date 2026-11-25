import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VisitorAlerts from './VisitorAlerts';
import { getSecurityAlerts, acknowledgeSecurityAlert, resolveSecurityAlert } from '../../service/securityAlertService';
import { getVisitorLookups } from '../../service/visitorService';

jest.mock('../../config/featureFlags', () => ({ VISITOR_MOCK_ENABLED: false }));
jest.mock('../../service/securityAlertService', () => ({ getSecurityAlerts: jest.fn(), acknowledgeSecurityAlert: jest.fn(), resolveSecurityAlert: jest.fn() }));
jest.mock('../../service/visitorService', () => ({ getVisitorLookups: jest.fn(), getDeskToday: jest.fn() }));
jest.mock('../../utils/socket', () => ({ subscribeToSecurityAlerts: () => () => {} }));
jest.mock('../../utils/visitorRealtime', () => ({ subscribeToVisitorAlertChanges: () => () => {} }));
jest.mock('../../components/common/DemoDataBanner', () => () => null);
jest.mock('../../components/security/EventSnapshotModal', () => () => null);
jest.mock('../../components/visitor/VisitDetailDrawer', () => () => null);

const records = [
    ...Array.from({ length: 51 }, (_, index) => ({ id: `over-${index}`, alert_type: 'visitor_overstay', severity: index % 2 ? 'medium' : 'high', status: ['new', 'acknowledged', 'resolved'][index % 3], zone_id: 'zone-1', triggered_at: '2026-11-14T09:00:00+07:00', payload_json: { visitorName: `Khách ${index}` } })),
    { id: 'leave', alert_type: 'visitor_must_leave', severity: 'high', status: 'resolved', zone_id: 'zone-1', triggered_at: '2026-11-14T09:00:00+07:00', payload_json: { visitorName: 'Khách cần rời' } },
    { id: 'zone', alert_type: 'visitor_zone_violation', severity: 'medium', status: 'new', zone_id: 'zone-1', triggered_at: '2026-11-14T09:00:00+07:00', payload_json: { visitorName: 'Khách sai vị trí' } },
];

test('shared filters replace the old header, preserve all-page counts and reset the visible list', async () => {
    getVisitorLookups.mockResolvedValue({ success: true, data: { zones: [{ id: 'zone-1', name: 'Cổng chính' }] } });
    getSecurityAlerts.mockImplementation(async query => {
        const rows = records.filter(row => row.alert_type === query.alert_type && (!query.severity || row.severity === query.severity) && (!query.zone_id || row.zone_id === query.zone_id));
        return { success: true, data: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: { totalPages: Math.ceil(rows.length / query.limit) } };
    });
    render(<MemoryRouter initialEntries={['/guard/visitor-alerts']}><VisitorAlerts /></MemoryRouter>);
    await screen.findByText('Hiển thị 1–10 / 53 cảnh báo');
    expect(getSecurityAlerts).toHaveBeenCalledWith(expect.objectContaining({ alert_type: 'visitor_overstay', page: 2 }));
    expect(screen.queryByRole('heading', { name: /Danh sách cảnh báo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Trạng thái'));
    fireEvent.click(screen.getByRole('option', { name: /^Đã xử lý( \(\d+\))?$/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Hiển thị 1–10 / 18 cảnh báo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tổng cảnh báo khách 53' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Loại cảnh báo'));
    fireEvent.click(screen.getByRole('option', { name: /^Khách phải rời( \(\d+\))?$/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await screen.findByText('Hiển thị 1–1 / 1 cảnh báo');
    fireEvent.click(screen.getByLabelText('Mức độ'));
    fireEvent.click(screen.getByRole('option', { name: /^Cao( \(\d+\))?$/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('Vị trí'));
    fireEvent.click(screen.getByRole('option', { name: /^Cổng chính( \(\d+\))?$/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Năm', exact: true }));
    await waitFor(() => expect(getSecurityAlerts).toHaveBeenCalledWith(expect.objectContaining({ alert_type: 'visitor_must_leave', severity: 'high', zone_id: 'zone-1', from: `${new Date().getFullYear()}-01-01T00:00:00+07:00` })));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await screen.findByText('Hiển thị 1–10 / 53 cảnh báo');
    expect(screen.getByLabelText('Trạng thái')).toHaveTextContent('Tất cả trạng thái');
    expect(screen.getByLabelText('Mức độ')).toHaveTextContent('Tất cả mức độ');
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('');
    expect(acknowledgeSecurityAlert).not.toHaveBeenCalled();
    expect(resolveSecurityAlert).not.toHaveBeenCalled();
});

test('shows the receiver name instead of an account ID and handles unavailable names', async () => {
    getVisitorLookups.mockResolvedValue({ success: true, data: { zones: [] } });
    const actorId = 'a830be13-399d-4f99-ad0f-f69bfe108869';
    getSecurityAlerts.mockImplementation(async query => ({ success: true, data: query.alert_type === 'visitor_overstay' ? [
        { id: 'named', alert_type: 'visitor_overstay', status: 'resolved', severity: 'high', acknowledged_by: actorId, acknowledged_by_name: 'Trần Quốc Admin', acknowledged_at: '2026-11-14T09:00:00+07:00' },
        { id: 'missing', alert_type: 'visitor_overstay', status: 'acknowledged', severity: 'medium', acknowledged_by: 'unavailable-account-id', acknowledged_by_name: null },
    ] : [] }));
    render(<MemoryRouter initialEntries={['/guard/visitor-alerts']}><VisitorAlerts /></MemoryRouter>);
    expect(await screen.findByText('Trần Quốc Admin')).toBeInTheDocument();
    expect(screen.queryByText(/Bởi:/)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(actorId))).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable-account-id/)).not.toBeInTheDocument();
});
