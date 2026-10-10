// Hồi quy khi tắt cờ mock (REACT_APP_VISITOR_MOCK=false / REACT_APP_REPORT_MOCK=false): service phải gọi đúng
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
    VISITOR_MOCK_ENABLED: false,
    REPORT_MOCK_ENABLED: false,
    ANY_DEMO_DATA: false,
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
    await visitorService.getPublicPurposes();
    expect(get).toHaveBeenLastCalledWith('/public/visitor-purposes');
    await visitorService.getPublicRegistration('VS-261007-0001');
    expect(get).toHaveBeenLastCalledWith('/public/visitor-registrations/VS-261007-0001');
    await visitorService.approveVisit('abc', { access: null });
    expect(post).toHaveBeenLastCalledWith('/visitors/visits/abc/approve', { access: null });
    await visitorService.scanAtGate('VS-261007-0001', { zoneId: 'z1', direction: 'in', scenario: 'normal' });
    expect(post).toHaveBeenLastCalledWith('/dev/mock-visitor-scan', { zoneId: 'z1', direction: 'in', scenario: 'normal', code: 'VS-261007-0001' });
    expect(await visitorService.verifyFaceAtGate('abc', {})).toMatchObject({ success: false });
    await visitorService.getMyVisits();
    expect(get).toHaveBeenLastCalledWith('/visitors/my-visits');
    expect(JSON.stringify(get.mock.calls)).not.toContain('host-me');
    expect(await visitorService.getDeskToday()).toEqual(FAILURE);
});

test('service báo cáo gọi đúng endpoint thật', async () => {
    await reportService.getReportPreview('visitor', { from: '2026-10-01', to: '2026-10-07', page: 1 });
    expect(get).toHaveBeenLastCalledWith('/reports/visitor/preview?from=2026-10-01&to=2026-10-07&page=1');
    await reportService.exportReport('vehicle', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
    expect(post).toHaveBeenLastCalledWith('/reports/center/vehicle/exports', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
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

test('cờ riêng: tắt cờ khách nhưng cờ báo cáo còn bật thì báo cáo vẫn dùng dữ liệu giả', async () => {
    jest.resetModules();
    jest.doMock('../config/featureFlags', () => ({ VISITOR_MOCK_ENABLED: false, REPORT_MOCK_ENABLED: true, ANY_DEMO_DATA: true }));
    const reports = require('./reportCenterService');
    const res = await reports.getReportCatalog();
    expect(res.success).toBe(true);
    expect(get).not.toHaveBeenCalledWith('/reports/catalog');
    jest.dontMock('../config/featureFlags');
});

describe('xuất báo cáo qua job (BE thật)', () => {
    beforeEach(() => {
        window.open = jest.fn();
    });

    test('tạo job → chờ completed → mở liên kết tải đã ký', async () => {
        post.mockResolvedValueOnce({ success: true, data: { jobId: 'job-1', status: 'queued' } });
        get.mockResolvedValueOnce({ success: true, data: { status: 'running' } })
            .mockResolvedValueOnce({ success: true, data: { status: 'completed', outputFileId: 'f-1', result: { fileName: 'vehicle_2026-10-01_2026-10-07.xlsx' } } })
            .mockResolvedValueOnce({ success: true, data: { downloadUrl: 'http://api/secure?token=t' } });
        const res = await reportService.exportReport('vehicle', { format: 'xlsx', from: '2026-10-01', to: '2026-10-07' });
        expect(post).toHaveBeenLastCalledWith('/reports/center/vehicle/exports', { format: 'xlsx', from: '2026-10-01', to: '2026-10-07' });
        expect(get).toHaveBeenCalledWith('/background-jobs/job-1');
        expect(get).toHaveBeenLastCalledWith('/media-files/f-1');
        expect(window.open).toHaveBeenCalledWith('http://api/secure?token=t', '_blank');
        expect(res).toEqual({ success: true, data: { fileName: 'vehicle_2026-10-01_2026-10-07.xlsx', format: 'xlsx' } });
    });

    test('job failed → trả { success: false, message } của BE', async () => {
        post.mockResolvedValueOnce({ success: true, data: { jobId: 'job-2' } });
        get.mockResolvedValueOnce({ success: true, data: { status: 'failed', errorMessage: 'Báo cáo có 60.000 dòng, vượt giới hạn 50.000 dòng.' } });
        const res = await reportService.exportReport('gate-access', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
        expect(res).toEqual({ success: false, message: 'Báo cáo có 60.000 dòng, vượt giới hạn 50.000 dòng.' });
        expect(window.open).not.toHaveBeenCalled();
    });

    test('tạo job lỗi (409 chưa khả dụng) → trả nguyên thông điệp, không hỏi trạng thái', async () => {
        post.mockResolvedValueOnce({ success: false, message: 'Chờ phân hệ 2.7' });
        const res = await reportService.exportReport('student-attendance', { format: 'pdf', from: '2026-10-01', to: '2026-10-07' });
        expect(res).toEqual({ success: false, message: 'Chờ phân hệ 2.7' });
        expect(get).not.toHaveBeenCalled();
    });

    test('hàm chờ: hết thời gian chờ → báo thu hẹp kỳ (không treo)', async () => {
        get.mockResolvedValue({ success: true, data: { status: 'running' } });
        const res = await reportService.waitForExportJob('job-3', { sleep: async () => undefined, intervalMs: 1000, maxMs: 3000 });
        expect(res.success).toBe(false);
        expect(res.message).toContain('Quá thời gian');
        expect(get).toHaveBeenCalledTimes(4);
    });

    test('tải file của lần chạy lịch → mở liên kết ký, trả tên file', async () => {
        get.mockResolvedValueOnce({ success: true, data: { fileName: 'visitor_2026-10-01_2026-10-07.pdf', downloadUrl: 'http://api/secure?token=r' } });
        const res = await reportService.downloadRunFile('run-1', 'pdf');
        expect(get).toHaveBeenLastCalledWith('/report-schedule-runs/run-1/files/pdf');
        expect(window.open).toHaveBeenCalledWith('http://api/secure?token=r', '_blank');
        expect(res.data.fileName).toBe('visitor_2026-10-01_2026-10-07.pdf');
    });

    test('thẻ báo cáo available=false: hiện lý do, không có liên kết xem', async () => {
        get.mockImplementation(async (url) => {
            if (url === '/reports/catalog') {
                return { success: true, data: [
                    { type: 'student-attendance', title: 'Chuyên cần sinh viên', description: 'd', available: false, unavailableReason: 'Chờ phân hệ 2.7', activeSchedules: 0, lastExportAt: null },
                    { type: 'vehicle', title: 'Phương tiện', description: 'd', available: true, activeSchedules: 2, lastExportAt: null },
                ] };
            }
            return { success: true, data: [] };
        });
        render(
            <MemoryRouter initialEntries={['/business-admin/reports']}>
                <Routes><Route path="/business-admin/reports" element={<ReportCenter />} /></Routes>
            </MemoryRouter>,
        );
        expect(await screen.findByTestId('unavailable-student-attendance')).toHaveTextContent('Chờ phân hệ 2.7');
        expect(screen.getByText('Chuyên cần sinh viên').closest('a')).toBeNull();
        expect(screen.getByText('Phương tiện').closest('a')).not.toBeNull();
    });
});

test('BE trả lỗi HTTP (request ném đối tượng) → service trả { success: false, message }, không ném ra trang', async () => {
    get.mockRejectedValueOnce({ message: 'Chờ phân hệ 2.7 có dữ liệu điểm danh từng buổi học', status: 409 });
    expect(await reportService.getReportPreview('student-attendance', { from: '2026-10-01', to: '2026-10-07' }))
        .toEqual({ success: false, message: 'Chờ phân hệ 2.7 có dữ liệu điểm danh từng buổi học' });
    post.mockRejectedValueOnce(new Error('Network Error'));
    expect(await visitorService.approveVisit('x', {})).toEqual({ success: false, message: 'Network Error' });
    get.mockRejectedValueOnce({});
    expect((await visitorService.getDeskToday()).message).toBe('Không kết nối được máy chủ');
});
