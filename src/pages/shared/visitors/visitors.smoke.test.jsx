// Test render thay cho bước kiểm tra tay của các màn Khách nội bộ (S3–S7).
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { resetState } from '../../../mocks/visitorReport/store';
import VisitorManagement from './VisitorManagement';
import VisitorDesk from './VisitorDesk';
import MyVisitors from './MyVisitors';
import VisitorHistory from './VisitorHistory';
import VisitorStats from './VisitorStats';

jest.mock('recharts', () => ({
    ...jest.requireActual('recharts'),
    ResponsiveContainer: () => <div data-testid="chart" />,
}));

const renderAt = (path, routes) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
    </MemoryRouter>,
);
const tabCount = (name) => Number(screen.getByRole('tab', { name }).textContent.replace(/\D/g, ''));
const dataRows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => resetState());

describe('VisitorManagement', () => {
    const route = <Route path="/business-admin/visitors" element={<VisitorManagement />} />;

    test('tab Chờ duyệt: duyệt nhanh làm giảm số chờ, tăng số đã duyệt', async () => {
        renderAt('/business-admin/visitors', route);
        const quick = await screen.findAllByRole('button', { name: 'Duyệt nhanh' });
        const pending = tabCount(/Chờ duyệt/);
        const approved = tabCount(/Đã duyệt/);
        expect(pending).toBeGreaterThanOrEqual(3);
        fireEvent.click(quick[0]);
        await waitFor(() => expect(tabCount(/Chờ duyệt/)).toBe(pending - 1));
        expect(tabCount(/Đã duyệt/)).toBe(approved + 1);
    });

    test('ngăn chi tiết: từ chối bắt buộc có lý do', async () => {
        renderAt('/business-admin/visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt nhanh' });
        fireEvent.click(within(dataRows()[0]).getAllByRole('cell')[0]);
        const drawer = await screen.findByRole('dialog', { name: 'Chi tiết lượt khách' });
        expect(await within(drawer).findByText('Quyền ra vào')).toBeInTheDocument();
        fireEvent.click(within(drawer).getByRole('button', { name: 'Từ chối' }));
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận từ chối' }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Vui lòng nhập lý do từ chối');
        fireEvent.change(within(drawer).getByLabelText('Lý do từ chối'), { target: { value: 'Trùng lịch' } });
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận từ chối' }));
        expect(await within(drawer).findByText('Bị từ chối')).toBeInTheDocument();
        expect(within(drawer).queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    });

    test('ngăn chi tiết: gia hạn lùi giờ bị chặn', async () => {
        renderAt('/business-admin/visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt nhanh' });
        fireEvent.click(screen.getByRole('tab', { name: /Đã duyệt/ }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Duyệt nhanh' })).not.toBeInTheDocument());
        await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
        fireEvent.click(within(dataRows()[0]).getAllByRole('cell')[0]);
        const drawer = await screen.findByRole('dialog', { name: 'Chi tiết lượt khách' });
        fireEvent.click(await within(drawer).findByRole('button', { name: 'Gia hạn' }));
        fireEvent.change(within(drawer).getByLabelText('Hiệu lực mới đến'), { target: { value: '2020-01-01T08:00' } });
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận gia hạn' }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Thời điểm gia hạn phải sau hiệu lực hiện tại');
    });

    test('tìm kiếm không có kết quả hiện trạng thái rỗng', async () => {
        renderAt('/business-admin/visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt nhanh' });
        fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'zzz không có ai' } });
        expect(await screen.findByText('Không có lượt khách nào phù hợp')).toBeInTheDocument();
    });
});

describe('VisitorDesk', () => {
    const route = <Route path="/business-admin/visitors/desk" element={<VisitorDesk />} />;
    const kpi = (id) => Number(screen.getByTestId(`desk-kpi-${id}`).textContent);
    const queue = () => screen.getByTestId('desk-attention');
    const openItem = (pattern) => {
        const item = within(queue()).getAllByRole('listitem').find((li) => within(li).queryByText(pattern));
        fireEvent.click(within(item).getByRole('button', { name: 'Xử lý' }));
    };

    test('là màn xử lý ngoại lệ: có hàng Cần xử lý, không còn khối mô phỏng camera', async () => {
        renderAt('/business-admin/visitors/desk', route);
        expect(await screen.findByText(/Cần xử lý \(\d+\)/)).toBeInTheDocument();
        expect(kpi('expected')).toBeGreaterThanOrEqual(13);
        expect(within(queue()).getByText('Đã thu hồi quyền, chưa rời khuôn viên')).toBeInTheDocument();
        expect(within(queue()).getByText(/Quá giờ \d+ phút/)).toBeInTheDocument();
        expect(within(queue()).getAllByText(/Camera thấy lần cuối:/).length).toBeGreaterThanOrEqual(2);
        expect(within(queue()).getByText('Chưa có ảnh khuôn mặt, cần chụp khi khách đến')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Khách đến đúng hẹn' })).not.toBeInTheDocument();
        expect(screen.getByText(/camera tại cổng tự cho vào/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Mở màn hình cổng/ })).toHaveAttribute('href', '/visitor/gate');
        expect(screen.getAllByRole('link', { name: 'Mô phỏng tại cổng' })[0].getAttribute('href')).toMatch(/^\/visitor\/gate\?code=VS-\d{6}-\d{4}$/);
    });

    test('khách phải rời: xác nhận đã rời thì ra khỏi hàng cần xử lý', async () => {
        renderAt('/business-admin/visitors/desk', route);
        await screen.findByText(/Cần xử lý \(\d+\)/);
        const onSite = kpi('onSite');
        openItem('Đã thu hồi quyền, chưa rời khuôn viên');
        const drawer = await screen.findByRole('dialog', { name: 'Chi tiết lượt khách' });
        expect(await within(drawer).findByText(/Khách phải rời khuôn viên/)).toBeInTheDocument();
        expect(within(drawer).getByText('Lần cuối camera thấy')).toBeInTheDocument();
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận khách đã rời' }));
        expect(await within(drawer).findByText('Bị thu hồi quyền')).toBeInTheDocument();
        await waitFor(() => expect(within(queue()).queryByText('Đã thu hồi quyền, chưa rời khuôn viên')).not.toBeInTheDocument());
        expect(kpi('onSite')).toBe(onSite - 1);
    });

    test('khách quá giờ: đóng lượt thủ công bắt buộc lý do; không tìm thấy thì thành chưa ghi nhận giờ ra', async () => {
        renderAt('/business-admin/visitors/desk', route);
        await screen.findByText(/Cần xử lý \(\d+\)/);
        openItem(/Quá giờ \d+ phút/);
        const drawer = await screen.findByRole('dialog', { name: 'Chi tiết lượt khách' });
        fireEvent.click(await within(drawer).findByRole('button', { name: 'Đóng lượt thủ công' }));
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận đóng lượt' }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Vui lòng chọn lý do đóng lượt');
        fireEvent.click(within(drawer).getByLabelText('Không tìm thấy khách, báo bảo vệ'));
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận đóng lượt' }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Vui lòng ghi chú đã tìm khách ở đâu');
        fireEvent.change(within(drawer).getByLabelText('Ghi chú'), { target: { value: 'Đã tìm ở Tòa A1 và nhà xe' } });
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận đóng lượt' }));
        expect(await within(drawer).findByText('Đã báo bảo vệ')).toBeInTheDocument();
        await waitFor(() => expect(within(queue()).queryByText(/Quá giờ \d+ phút/)).not.toBeInTheDocument());
        expect(within(queue()).getByText(/Chưa ghi nhận giờ ra · không tìm thấy khách/)).toBeInTheDocument();
    });

    test('khách đã rời nhưng camera không ghi nhận: nhập giờ ra ước tính', async () => {
        renderAt('/business-admin/visitors/desk', route);
        await screen.findByText(/Cần xử lý \(\d+\)/);
        openItem(/Quá giờ \d+ phút/);
        const drawer = await screen.findByRole('dialog', { name: 'Chi tiết lượt khách' });
        fireEvent.click(await within(drawer).findByRole('button', { name: 'Đóng lượt thủ công' }));
        fireEvent.click(within(drawer).getByLabelText('Khách đã rời, camera không ghi nhận'));
        fireEvent.change(within(drawer).getByLabelText('Giờ ra ước tính'), { target: { value: '2020-01-01T08:00' } });
        fireEvent.click(within(drawer).getByRole('button', { name: 'Xác nhận đóng lượt' }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Giờ ra phải sau giờ vào và không ở tương lai');
    });

    test('thẻ mã QR đăng ký: có địa chỉ trang đăng ký và nút in', async () => {
        renderAt('/business-admin/visitors/desk', route);
        await screen.findByText(/Cần xử lý \(\d+\)/);
        fireEvent.click(screen.getByRole('button', { name: /Mã QR đăng ký/ }));
        const modal = screen.getByRole('dialog', { name: 'Mã QR đăng ký khách' });
        expect(within(modal).getByText(/\/visitor\/register$/)).toBeInTheDocument();
        expect(within(modal).getByRole('button', { name: /In mã QR/ })).toBeInTheDocument();
    });

    test('đăng ký khách vãng lai mở form có chụp ảnh và ô đồng ý', async () => {
        renderAt('/business-admin/visitors/desk', route);
        await screen.findByText(/Cần xử lý \(\d+\)/);
        fireEvent.click(screen.getByRole('button', { name: /Đăng ký khách vãng lai/ }));
        const modal = screen.getByRole('dialog', { name: 'Đăng ký khách vãng lai' });
        expect(within(modal).getByLabelText(/Người cần gặp/)).toBeInTheDocument();
        expect(within(modal).getByText('Tải ảnh lên')).toBeInTheDocument();
        fireEvent.click(within(modal).getByRole('button', { name: 'Đăng ký và cấp quyền' }));
        expect(await within(modal).findByRole('alert')).toHaveTextContent('Vui lòng nhập họ tên khách');
    });
});

describe('MyVisitors', () => {
    const route = <Route path="/employee/my-visitors" element={<MyVisitors />} />;
    const count = (id) => Number(screen.getByTestId(`my-${id}-count`).textContent);

    test('duyệt khách xin gặp mình: chuyển từ cần duyệt sang sắp đến', async () => {
        renderAt('/employee/my-visitors', route);
        const approveButtons = await screen.findAllByRole('button', { name: 'Duyệt' });
        const pending = count('pending');
        const upcoming = count('upcoming');
        expect(pending).toBeGreaterThanOrEqual(2);
        fireEvent.click(approveButtons[0]);
        await waitFor(() => expect(count('pending')).toBe(pending - 1));
        expect(count('upcoming')).toBe(upcoming + 1);
    });

    test('có thông báo cho người được gặp và đánh dấu đã đọc được', async () => {
        renderAt('/employee/my-visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt' });
        expect(screen.getAllByText(/xin gặp bạn, đang chờ duyệt/).length).toBeGreaterThanOrEqual(2);
        expect(Number(screen.getByTestId('my-unread-count').textContent)).toBeGreaterThanOrEqual(2);
        fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
        await waitFor(() => expect(Number(screen.getByTestId('my-unread-count').textContent)).toBe(0));
    });

    test('sao chép link đăng ký: link chọn sẵn mình là người cần gặp', async () => {
        renderAt('/employee/my-visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt' });
        fireEvent.click(screen.getByRole('button', { name: /Sao chép link đăng ký/ }));
        expect(await screen.findByText(/\/visitor\/register\?host=host-me$/)).toBeInTheDocument();
    });

    test('mời khách: không cần chọn người gặp, khách chưa có ảnh', async () => {
        renderAt('/employee/my-visitors', route);
        await screen.findAllByRole('button', { name: 'Duyệt' });
        const upcoming = count('upcoming');
        fireEvent.click(screen.getByRole('button', { name: /Mời khách/ }));
        const modal = screen.getByRole('dialog', { name: 'Mời khách đến làm việc' });
        expect(within(modal).queryByLabelText(/Người cần gặp/)).not.toBeInTheDocument();
        fireEvent.change(within(modal).getByLabelText(/Họ tên khách/), { target: { value: 'Lê Văn Mời' } });
        fireEvent.change(within(modal).getByLabelText(/Số điện thoại/), { target: { value: '0987654321' } });
        fireEvent.change(within(modal).getByLabelText(/Mục đích/), { target: { value: 'Hợp tác doanh nghiệp' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Gửi lời mời' }));
        expect(await screen.findByText(/Đã mời Lê Văn Mời · VS-\d{6}-\d{4}/)).toBeInTheDocument();
        expect(screen.getByText(/lễ tân sẽ chụp khi khách đến/)).toBeInTheDocument();
        await waitFor(() => expect(count('upcoming')).toBe(upcoming + 1));
    });
});

describe('VisitorHistory', () => {
    const route = <Route path="/business-admin/visitors/history" element={<VisitorHistory />} />;

    test('tra theo tên khách và xem các lượt của một khách', async () => {
        renderAt('/business-admin/visitors/history', route);
        expect(await screen.findByText(/^\d+ lượt khách$/)).toBeInTheDocument();
        const first = screen.getAllByRole('button', { name: /^Xem các lượt của / })[0];
        const name = first.textContent;
        fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: name } });
        await waitFor(() => {
            const buttons = screen.getAllByRole('button', { name: /^Xem các lượt của / });
            expect(buttons.every((b) => b.textContent === name)).toBe(true);
        });
        fireEvent.click(screen.getAllByRole('button', { name: /^Xem các lượt của / })[0]);
        const panel = await screen.findByRole('dialog', { name: `Các lượt của ${name}` });
        expect(within(panel).getByText(/Tổng số lượt/)).toBeInTheDocument();
    });

    test('khoảng ngày không có khách hiện trạng thái rỗng', async () => {
        renderAt('/business-admin/visitors/history', route);
        await screen.findByText(/^\d+ lượt khách$/);
        fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2020-01-01' } });
        fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2020-01-07' } });
        expect(await screen.findByText('Không có lượt khách nào trong khoảng đã chọn')).toBeInTheDocument();
        expect(screen.getByText('0 lượt khách')).toBeInTheDocument();
    });
});

describe('VisitorStats', () => {
    const route = <Route path="/business-admin/visitors/stats" element={<VisitorStats />} />;

    test('hiện 5 KPI, 5 biểu đồ và liên kết sang báo cáo khách', async () => {
        renderAt('/business-admin/visitors/stats', route);
        expect(await screen.findByText('Khách duy nhất')).toBeInTheDocument();
        ['Tổng lượt', 'Lưu trú TB', 'Lượt quá giờ', 'Tỷ lệ không đến'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
        expect(screen.getAllByTestId('chart')).toHaveLength(5);
        expect(screen.getByRole('link', { name: /Mở báo cáo để xuất/ })).toHaveAttribute('href', '/business-admin/reports/visitor');
    });
});
