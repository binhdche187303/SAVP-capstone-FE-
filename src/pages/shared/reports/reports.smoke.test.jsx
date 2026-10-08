// Test render thay cho bước kiểm tra tay: mỗi trang báo cáo dựng được với dữ liệu giả.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { REPORT_TYPES, REPORT_DEFINITIONS } from '../../../config/reportDefinitions';
import { resetState } from '../../../mocks/visitorReport/store';
import ReportViewer from './ReportViewer';
import ReportCenter from './ReportCenter';
import ReportSchedules from './ReportSchedules';
import ReportRuns from './ReportRuns';

// recharts cần kích thước thật của DOM; jsdom không có nên thay khung chứa bằng thẻ rỗng.
jest.mock('recharts', () => ({
    ...jest.requireActual('recharts'),
    ResponsiveContainer: () => <div data-testid="chart" />,
}));

const renderAt = (path, routes) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
    </MemoryRouter>,
);

const viewerRoute = <Route path="/business-admin/reports/:type" element={<ReportViewer />} />;

beforeEach(() => resetState());

describe('ReportViewer', () => {
    test.each(REPORT_TYPES)('%s: hiện KPI, 2 biểu đồ và bảng', async (type) => {
        const def = REPORT_DEFINITIONS[type];
        renderAt(`/business-admin/reports/${type}`, viewerRoute);
        expect((await screen.findAllByText(def.kpis[0].label)).length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('chart')).toHaveLength(2);
        def.columns.forEach((col) => expect(screen.getAllByText(col.label).length).toBeGreaterThan(0));
        expect(screen.getByText(/Hiển thị 1–\d+ \//)).toBeInTheDocument();
    });

    test('loại không tồn tại: hiện trang không tìm thấy', () => {
        renderAt('/business-admin/reports/khong-co', viewerRoute);
        expect(screen.getByText('Không tìm thấy báo cáo')).toBeInTheDocument();
        expect(screen.getByText('Về Trung tâm báo cáo')).toHaveAttribute('href', '/business-admin/reports');
    });

    test('kỳ không có dữ liệu: bảng và biểu đồ hiện trạng thái rỗng', async () => {
        renderAt('/business-admin/reports/vehicle', viewerRoute);
        await screen.findAllByText('Tổng lượt');
        fireEvent.click(screen.getByText('Tùy chọn'));
        fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2020-01-01' } });
        fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2020-01-07' } });
        fireEvent.click(screen.getByText('Xem báo cáo'));
        expect(await screen.findByText('Không có dữ liệu trong kỳ đã chọn')).toBeInTheDocument();
        expect(screen.getAllByText('Chưa có dữ liệu trong kỳ đã chọn')).toHaveLength(2);
    });

    test('kỳ quá 366 ngày: hiện thông điệp lỗi', async () => {
        renderAt('/business-admin/reports/vehicle', viewerRoute);
        await screen.findAllByText('Tổng lượt');
        fireEvent.click(screen.getByText('Tùy chọn'));
        fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2025-01-01' } });
        fireEvent.click(screen.getByText('Xem báo cáo'));
        expect(await screen.findByText('Kỳ báo cáo tối đa 366 ngày')).toBeInTheDocument();
    });

    test('bấm tiêu đề cột thì sắp xếp', async () => {
        renderAt('/business-admin/reports/staff-attendance', viewerRoute);
        await screen.findAllByText('Tỷ lệ chuyên cần');
        const firstCode = () => within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0].textContent;
        const before = firstCode();
        fireEvent.click(screen.getByText('Mã CB'));
        fireEvent.click(screen.getByText('Mã CB'));
        await waitFor(() => expect(firstCode()).not.toBe(before));
        expect(firstCode()).toBe('CB0060');
    });
});

describe('ReportCenter', () => {
    const centerRoute = <Route path="/business-admin/reports" element={<ReportCenter />} />;

    test('hiện 7 thẻ báo cáo, mỗi thẻ dẫn tới đúng trang xem', async () => {
        renderAt('/business-admin/reports', centerRoute);
        for (const type of REPORT_TYPES) {
            const link = await screen.findByRole('link', { name: new RegExp(REPORT_DEFINITIONS[type].title) });
            expect(link).toHaveAttribute('href', `/business-admin/reports/${type}`);
        }
        expect(screen.getAllByText(/lịch gửi đang bật/)).toHaveLength(7);
    });

    test('hiện file xuất gần đây và nút đặt lại dữ liệu demo', async () => {
        renderAt('/business-admin/reports', centerRoute);
        expect(await screen.findByText('File xuất gần đây')).toBeInTheDocument();
        expect(await screen.findAllByText('Xuất lại')).toHaveLength(5);
        expect(screen.getByText('Đặt lại dữ liệu demo')).toBeInTheDocument();
    });
});

describe('Đặt lịch gửi từ trang xem báo cáo', () => {
    test('Business Admin thấy nút, form điền sẵn loại báo cáo', async () => {
        renderAt('/business-admin/reports/visitor', viewerRoute);
        await screen.findAllByText('Tổng lượt');
        fireEvent.click(screen.getByRole('button', { name: /Đặt lịch gửi/ }));
        const modal = screen.getByRole('dialog', { name: 'Tạo lịch gửi báo cáo' });
        expect(within(modal).getByLabelText('Báo cáo')).toHaveValue('visitor');
    });

    test('Manager không thấy nút đặt lịch gửi', async () => {
        renderAt('/manager/reports/visitor', <Route path="/manager/reports/:type" element={<ReportViewer />} />);
        await screen.findAllByText('Tổng lượt');
        expect(screen.queryByRole('button', { name: /Đặt lịch gửi/ })).not.toBeInTheDocument();
    });
});

describe('ReportSchedules', () => {
    const route = <Route path="/business-admin/report-schedules" element={<ReportSchedules />} />;
    const rows = () => screen.getAllByRole('row').slice(1);
    const rowOf = (name) => screen.getByRole('row', { name: new RegExp(name) });

    test('hiện 6 lịch sẵn có; lịch tắt không có lần chạy kế tiếp', async () => {
        renderAt('/business-admin/report-schedules', route);
        expect(await screen.findByText('Chuyên cần cán bộ hằng tuần')).toBeInTheDocument();
        expect(rows()).toHaveLength(6);
        expect(screen.getByText('Hằng tuần, thứ Hai 07:30')).toBeInTheDocument();
        expect(screen.getByText('Hằng tháng, ngày cuối 17:00')).toBeInTheDocument();
        const disabled = rowOf('Sử dụng phòng họp cuối tháng');
        expect(within(disabled).getByTestId('next-run')).toHaveTextContent('—');
        expect(within(disabled).getByRole('switch')).not.toBeChecked();
    });

    test('tạo lịch: thiếu người nhận bị chặn, đủ thì thêm dòng mới', async () => {
        renderAt('/business-admin/report-schedules', route);
        await screen.findByText('Chuyên cần cán bộ hằng tuần');
        fireEvent.click(screen.getByRole('button', { name: /Tạo lịch gửi/ }));
        const modal = screen.getByRole('dialog', { name: 'Tạo lịch gửi báo cáo' });
        fireEvent.change(within(modal).getByLabelText('Tên lịch gửi'), { target: { value: 'Khách hằng tuần cho BGH' } });
        fireEvent.change(within(modal).getByLabelText('Báo cáo'), { target: { value: 'visitor' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Lưu lịch gửi' }));
        expect(await within(modal).findByRole('alert')).toHaveTextContent('Cần ít nhất 1 người nhận');

        fireEvent.change(within(modal).getByLabelText('Thêm email'), { target: { value: 'sai-email' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Thêm' }));
        fireEvent.click(within(modal).getByRole('button', { name: 'Lưu lịch gửi' }));
        expect(await within(modal).findByText('Email không hợp lệ: sai-email')).toBeInTheDocument();
        fireEvent.click(within(modal).getByRole('button', { name: 'Bỏ sai-email' }));

        fireEvent.change(within(modal).getByLabelText('Thêm email'), { target: { value: 'bgh@savp.edu.vn' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Thêm' }));
        expect(within(modal).getByText('1/20')).toBeInTheDocument();
        fireEvent.click(within(modal).getByRole('button', { name: 'Lưu lịch gửi' }));
        expect(await screen.findByText('Khách hằng tuần cho BGH')).toBeInTheDocument();
        expect(rows()).toHaveLength(7);
        const created = rowOf('Khách hằng tuần cho BGH');
        expect(within(created).getByTestId('next-run')).not.toHaveTextContent('—');
    });

    test('tắt lịch thì mất lần chạy kế tiếp; gửi thử hiện liên kết lịch sử', async () => {
        renderAt('/business-admin/report-schedules', route);
        await screen.findByText('Ra vào khuôn viên hằng ngày');
        const row = rowOf('Ra vào khuôn viên hằng ngày');
        expect(within(row).getByTestId('next-run')).not.toHaveTextContent('—');
        fireEvent.click(within(row).getByRole('switch'));
        await waitFor(() => expect(within(rowOf('Ra vào khuôn viên hằng ngày')).getByTestId('next-run')).toHaveTextContent('—'));

        fireEvent.click(within(rowOf('Sự kiện an ninh hằng ngày')).getByRole('button', { name: 'Gửi thử' }));
        const notice = await screen.findByText(/Đã gửi thử "Sự kiện an ninh hằng ngày" tới 3 người nhận/);
        expect(notice).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Xem lịch sử gửi' })).toHaveAttribute('href', '/business-admin/report-schedules/runs');
    });
});

describe('ReportRuns', () => {
    const route = <Route path="/business-admin/report-schedules/runs" element={<ReportRuns />} />;
    const rows = () => screen.getAllByRole('row').slice(1);

    test('40 lần chạy, lọc thất bại còn 3 dòng có lý do, gửi lại được', async () => {
        renderAt('/business-admin/report-schedules/runs', route);
        expect(await screen.findByText('40 lần chạy')).toBeInTheDocument();
        expect(rows()).toHaveLength(10);
        fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'failed' } });
        expect(await screen.findByText('3 lần chạy')).toBeInTheDocument();
        expect(screen.getByText('Quá thời gian tạo file báo cáo')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Gửi lại' })[0]);
        expect(await screen.findByText('Đã gửi lại')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Gửi lại' })).toHaveLength(2);
    });
});
