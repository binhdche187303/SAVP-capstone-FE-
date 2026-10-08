// Hồi quy khi tắt cờ mock (REACT_APP_VISITOR_REPORT_MOCK=false): service phải gọi đúng
// endpoint thật qua utils/request, và màn mới hiện khối lỗi thay vì trắng trang khi BE chưa có.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { get, post, patch, dele } from '../utils/request';
import * as visitorService from './visitorService';
import * as reportService from './reportCenterService';
import ReportCenter from '../pages/shared/reports/ReportCenter';
import VisitorDesk from '../pages/shared/visitors/VisitorDesk';

jest.mock('../config/featureFlags', () => ({
    ...jest.requireActual('../config/featureFlags'),
    VISITOR_REPORT_MOCK_ENABLED: false,
}));
jest.mock('../utils/request', () => ({
    ...jest.requireActual('../utils/request'),
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    dele: jest.fn(),
}));

const FAILURE = { success: false, message: 'Không kết nối được máy chủ' };

beforeEach(() => {
    [get, post, patch, dele].forEach((fn) => fn.mockReset().mockResolvedValue(FAILURE));
});

test('service khách gọi đúng endpoint thật', async () => {
    await visitorService.listVisits({ status: 'approved', page: 2, q: '' });
    expect(get).toHaveBeenLastCalledWith('/visitors/visits?status=approved&page=2');
    await visitorService.getPublicRegistration('VS-261007-0001');
    expect(get).toHaveBeenLastCalledWith('/public/visitor-registrations/VS-261007-0001');
    await visitorService.approveVisit('abc', { access: null });
    expect(post).toHaveBeenLastCalledWith('/visitors/visits/abc/approve', { access: null });
    await visitorService.verifyFaceAtGate('abc', { zoneId: 'zone-gate-main' });
    expect(post).toHaveBeenLastCalledWith('/visitors/visits/abc/verify-face', { zoneId: 'zone-gate-main' });
    expect(await visitorService.getDeskToday()).toEqual(FAILURE);
});

test('service báo cáo gọi đúng endpoint thật', async () => {
    await reportService.getReportPreview('visitor', { from: '2026-10-01', to: '2026-10-07', page: 1 });
    expect(get).toHaveBeenLastCalledWith('/reports/visitor/preview?from=2026-10-01&to=2026-10-07&page=1');
    await reportService.exportReport('vehicle', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
    expect(post).toHaveBeenLastCalledWith('/reports/vehicle/exports', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
    await reportService.toggleSchedule('sch-1', false);
    expect(patch).toHaveBeenLastCalledWith('/report-schedules/sch-1', { enabled: false });
    await reportService.deleteSchedule('sch-1');
    expect(dele).toHaveBeenLastCalledWith('/report-schedules/sch-1');
    await reportService.listScheduleRuns({ status: 'failed' });
    expect(get).toHaveBeenLastCalledWith('/report-schedule-runs?status=failed');
});

test('BE chưa có: màn mới hiện khối lỗi, không còn dải dữ liệu minh họa', async () => {
    render(
        <MemoryRouter initialEntries={['/business-admin/reports']}>
            <Routes>
                <Route path="/business-admin/reports" element={<ReportCenter />} />
            </Routes>
        </MemoryRouter>,
    );
    expect(await screen.findByText('Không kết nối được máy chủ')).toBeInTheDocument();
    expect(screen.queryByText(/dữ liệu minh họa/)).not.toBeInTheDocument();
});

test('BE chưa có: quầy lễ tân hiện khối lỗi', async () => {
    render(
        <MemoryRouter initialEntries={['/business-admin/visitors/desk']}>
            <Routes>
                <Route path="/business-admin/visitors/desk" element={<VisitorDesk />} />
            </Routes>
        </MemoryRouter>,
    );
    expect(await screen.findByText('Không kết nối được máy chủ')).toBeInTheDocument();
});
