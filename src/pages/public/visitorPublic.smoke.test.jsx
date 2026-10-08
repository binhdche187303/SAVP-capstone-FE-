// Test render thay cho bước kiểm tra tay của các trang công khai (S1, S2).
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { resetState } from '../../mocks/visitorReport/store';
import VisitorRegister from './VisitorRegister';
import VisitorStatus from './VisitorStatus';
import VisitorGate from './VisitorGate';
import * as visitorService from '../../service/visitorService';

const renderAt = (path, routes) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
    </MemoryRouter>,
);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByText('Tiếp tục'));

beforeEach(() => resetState());

describe('VisitorRegister', () => {
    const route = <Route path="/visitor/register" element={<VisitorRegister />} />;

    test('chặn từng bước khi thiếu hoặc sai dữ liệu', () => {
        renderAt('/visitor/register', route);
        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập họ tên khách');
        type(/Họ tên/, 'Trần Thị Demo');
        type(/Số điện thoại/, '12345');
        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Số điện thoại không hợp lệ');
        type(/Số điện thoại/, '0912345678');
        type(/Email/, 'sai');
        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập email hợp lệ để nhận kết quả');
    });

    test('link mời có ?host=: người cần gặp được chọn sẵn', async () => {
        renderAt('/visitor/register?host=host-me', route);
        type(/Họ tên/, 'Trần Thị Demo');
        type(/Số điện thoại/, '0912345678');
        type(/Email/, 'demo@example.com');
        next();
        expect(await screen.findByText('Tài khoản đang đăng nhập')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Chọn người khác' })).toBeInTheDocument();
    });

    test('đi hết 4 bước, không có camera vẫn tải ảnh lên được, nhận mã lượt và QR', async () => {
        renderAt('/visitor/register', route);
        type(/Họ tên/, 'Trần Thị Demo');
        type(/Số điện thoại/, '0912345678');
        type(/Email/, 'demo@example.com');
        next();

        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng chọn người cần gặp');
        fireEvent.focus(screen.getByLabelText(/Người cần gặp/));
        fireEvent.click(await screen.findByText('Tài khoản đang đăng nhập'));
        type(/Mục đích/, 'Làm việc với đơn vị');
        next();

        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng chụp hoặc tải ảnh khuôn mặt');
        fireEvent.click(screen.getByText('Bật camera'));
        expect(await screen.findByText(/Không truy cập được camera/)).toBeInTheDocument();
        const file = new File(['anh'], 'mat.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Tải ảnh khuôn mặt'), { target: { files: [file] } });
        expect(await screen.findByAltText('Ảnh khuôn mặt đã chụp')).toBeInTheDocument();
        next();
        expect(screen.getByRole('alert')).toHaveTextContent('Cần đồng ý xử lý dữ liệu sinh trắc để tiếp tục');
        fireEvent.click(screen.getByLabelText(/Tôi đồng ý/));
        next();

        expect(screen.getByText('Trần Thị Demo')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Gửi đăng ký'));
        const code = await screen.findByText(/^VS-\d{6}-\d{4}$/);
        expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
        expect(screen.getByText(/demo@example.com/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Tra cứu trạng thái' })).toHaveAttribute('href', `/visitor/status/${code.textContent}`);
    });
});

describe('VisitorStatus', () => {
    const routes = (
        <>
            <Route path="/visitor/status" element={<VisitorStatus />} />
            <Route path="/visitor/status/:code" element={<VisitorStatus />} />
        </>
    );
    const register = async () => {
        const res = await visitorService.createPublicRegistration({
            visitor: { fullName: 'Phạm Thị Tra Cứu', idNumber: '001099000222', phone: '0911222333', email: 'tracuu@example.com', organization: 'Công ty CP MISA', plateNumber: '', photo: 'data:image/png;base64,AAAA' },
            hostId: 'host-me',
            purpose: 'Làm việc với đơn vị',
            companions: 0,
            scheduledFrom: new Date(Date.now() + 3600000).toISOString(),
            scheduledTo: new Date(Date.now() + 3 * 3600000).toISOString(),
            consent: true,
        });
        return res.data;
    };

    test('đang chờ duyệt: hiện trạng thái, không lộ dữ liệu cá nhân', async () => {
        const visit = await register();
        renderAt(`/visitor/status/${visit.code}`, routes);
        expect(await screen.findByText('Phạm Thị Tra Cứu')).toBeInTheDocument();
        expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
        expect(screen.queryByText(/0911222333/)).not.toBeInTheDocument();
        expect(screen.queryByText(/tracuu@example.com/)).not.toBeInTheDocument();
        expect(screen.queryByText(/001099000222/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Hiệu lực từ/)).not.toBeInTheDocument();
    });

    test('đã duyệt: hiện khung giờ và khu vực được cấp', async () => {
        const visit = await register();
        await visitorService.approveVisit(visit.id, {});
        renderAt(`/visitor/status/${visit.code}`, routes);
        expect(await screen.findByText(/Hiệu lực từ/)).toBeInTheDocument();
        expect(screen.getByText('Cổng chính')).toBeInTheDocument();
    });

    test('bị từ chối: hiện lý do', async () => {
        const visit = await register();
        await visitorService.rejectVisit(visit.id, { reason: 'Trùng lịch công tác' });
        renderAt(`/visitor/status/${visit.code}`, routes);
        expect(await screen.findByText(/Trùng lịch công tác/)).toBeInTheDocument();
    });

    test('mã sai: trang không tìm thấy có nút đăng ký mới', async () => {
        renderAt('/visitor/status/VS-000000-0000', routes);
        expect(await screen.findByText('Không tìm thấy lượt đăng ký với mã này')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Đăng ký mới' })).toHaveAttribute('href', '/visitor/register');
    });

    test('nhập mã rồi tra cứu', async () => {
        const visit = await register();
        renderAt('/visitor/status', routes);
        fireEvent.change(screen.getByLabelText('Mã lượt khách'), { target: { value: visit.code.toLowerCase() } });
        fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
        expect(await screen.findByText('Phạm Thị Tra Cứu')).toBeInTheDocument();
    });
});

describe('VisitorGate (màn hình cổng mô phỏng)', () => {
    const route = <Route path="/visitor/gate" element={<VisitorGate />} />;
    const HOUR = 3600000;
    const approvedVisit = async () => {
        const res = await visitorService.createVisit({
            channel: 'walk_in',
            visitor: { fullName: 'Vũ Văn Cổng', idNumber: '', phone: '0933444555', email: '', organization: 'Viettel Solutions', plateNumber: '', photo: 'data:image/png;base64,AAAA' },
            hostId: 'host-me',
            purpose: 'Làm việc với đơn vị',
            companions: 0,
            scheduledFrom: new Date(Date.now() + HOUR).toISOString(),
            scheduledTo: new Date(Date.now() + 3 * HOUR).toISOString(),
            consent: true,
        });
        return res.data;
    };
    const scan = () => fireEvent.click(screen.getByRole('button', { name: 'Quét khuôn mặt' }));

    test('mã trên URL được điền sẵn; khách hợp lệ được cho vào và báo người được gặp', async () => {
        const visit = await approvedVisit();
        renderAt(`/visitor/gate?code=${visit.code}`, route);
        expect(screen.getByLabelText('Mã lượt khách')).toHaveValue(visit.code);
        expect(screen.getByText(/so khớp khuôn mặt là giả lập/)).toBeInTheDocument();
        scan();
        expect(await screen.findByText('Cho phép vào')).toBeInTheDocument();
        expect(screen.getByText(/Vũ Văn Cổng/)).toBeInTheDocument();
        expect(screen.getByText(/Đã báo Tài khoản đang đăng nhập/)).toBeInTheDocument();
    });

    test('đến ngoài khung giờ: từ chối kèm lý do', async () => {
        const visit = await approvedVisit();
        renderAt(`/visitor/gate?code=${visit.code}`, route);
        fireEvent.change(screen.getByLabelText('Tình huống'), { target: { value: 'outside_window' } });
        scan();
        expect(await screen.findByText('Từ chối')).toBeInTheDocument();
        expect(screen.getByText('Ngoài khung giờ được cấp')).toBeInTheDocument();
    });

    test('độ khớp thấp: mời đến quầy lễ tân', async () => {
        const visit = await approvedVisit();
        renderAt(`/visitor/gate?code=${visit.code}`, route);
        fireEvent.change(screen.getByLabelText('Tình huống'), { target: { value: 'low_score' } });
        scan();
        expect(await screen.findByText('Vui lòng đến quầy lễ tân')).toBeInTheDocument();
        expect(screen.getByText('71%')).toBeInTheDocument();
    });

    test('chiều ra: ghi nhận khách ra, kể cả khi đã bị thu hồi quyền', async () => {
        const visit = await approvedVisit();
        await visitorService.verifyFaceAtGate(visit.id, { zoneId: 'zone-gate-main', scenario: 'normal' });
        await visitorService.revokeVisit(visit.id, { reason: 'Vi phạm nội quy' });
        renderAt(`/visitor/gate?code=${visit.code}`, route);
        scan();
        expect(await screen.findByText('Quyền ra vào đã bị thu hồi')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Chiều ra' }));
        scan();
        expect(await screen.findByText('Đã ghi nhận khách ra')).toBeInTheDocument();
    });

    test('mã sai hoặc bỏ trống: báo lỗi rõ ràng', async () => {
        renderAt('/visitor/gate', route);
        scan();
        expect(await screen.findByText('Vui lòng nhập hoặc quét mã lượt khách')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Mã lượt khách'), { target: { value: 'VS-000000-0000' } });
        scan();
        expect(await screen.findByText('Không tìm thấy lượt khách với mã này')).toBeInTheDocument();
    });

    test('có lối đăng ký cho khách chưa đăng ký', () => {
        renderAt('/visitor/gate', route);
        expect(screen.getByText(/Chưa đăng ký\?/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Đăng ký tại đây/ })).toHaveAttribute('href', '/visitor/register');
    });
});
