// Test render trang Đồng bộ UEL với service giả (không gọi BE thật).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UelSync from './UelSync';
import * as svc from '../../service/uelSyncService';

jest.mock('../../service/uelSyncService', () => {
    const actual = jest.requireActual('../../service/uelSyncService');
    return {
        ...actual,
        getUelSyncStatus: jest.fn(),
        getUelSyncRuns: jest.fn(),
        getStudyPeriods: jest.fn(),
        runUelSync: jest.fn(),
        runUelSyncAll: jest.fn(),
        updateUelSyncSettings: jest.fn(),
        replaceStudyPeriods: jest.fn(),
        lookupUel: jest.fn(),
        downloadUelGaps: jest.fn(),
    };
});

const RUN = {
    id: 'r1',
    trigger: 'manual',
    requestedByName: 'Quản trị viên',
    status: 'partial',
    startedAt: '2026-11-08T03:02:39.708Z',
    finishedAt: '2026-11-08T03:02:41.000Z',
    options: { namHoc: '2026-2027', hocKy: '1', fromDate: '2026-11-02', toDate: '2026-11-22' },
    results: [
        { step: 'departments', fetched: 5, upserted: 5, skipped: 0, deactivated: 0, warnings: [] },
        { step: 'sessions', fetched: 0, upserted: 0, skipped: 0, deactivated: 0, warnings: [], error: 'Bảng study_periods trống' },
    ],
};

const status = (over = {}) => ({
    configured: true,
    running: false,
    schedule: { enabled: false, label: '02:00 hằng ngày' },
    settings: { namHoc: '2026-2027', hocKy: '1' },
    plan: { fromDate: '2026-11-17', toDate: '2027-08-31' },
    periodCount: 0,
    lastRun: RUN,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    svc.getUelSyncStatus.mockResolvedValue(status());
    svc.getUelSyncRuns.mockResolvedValue([RUN]);
    svc.getStudyPeriods.mockResolvedValue([]);
});

test('hiện tình trạng, lượt gần nhất với bước lỗi', async () => {
    render(<UelSync />);
    expect(await screen.findByText('Đồng bộ dữ liệu Đào tạo UEL')).toBeInTheDocument();
    expect(screen.getByText('Đã cấu hình')).toBeInTheDocument();
    expect(screen.getAllByText('Có bước lỗi').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa có bảng giờ tiết học. Vui lòng nhập giờ bắt đầu và kết thúc của từng tiết.')).toBeInTheDocument();
    // Đã bỏ phần Nâng cao (bảng giờ tiết, tra cứu) và đoạn mô tả đầu trang.
    expect(screen.queryByRole('button', { name: /Nâng cao/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu nhập tay không bị ghi đè/)).not.toBeInTheDocument();
    expect(svc.getStudyPeriods).not.toHaveBeenCalled();
    // Cài đặt cũ chỉ có namHoc/hocKy → hiểu là học kỳ chỉ định.
    expect(screen.getByLabelText('Chỉ định')).toBeChecked();
});

test.each([
    ['chuỗi JSON', JSON.stringify(RUN.results)],
    ['object theo bước', {
        departments: { fetched: 5, upserted: 5, skipped: 0, deactivated: 0, warnings: [] },
        sessions: { fetched: 0, upserted: 0, skipped: 0, deactivated: 0, warnings: [], error: 'Bảng study_periods trống' },
    }],
])('lịch sử có results dạng %s vẫn render thay vì làm sập trang', async (_label, results) => {
    const legacyRun = { ...RUN, results };
    svc.getUelSyncStatus.mockResolvedValue(status({ lastRun: legacyRun }));
    svc.getUelSyncRuns.mockResolvedValue([legacyRun]);

    render(<UelSync />);

    expect(await screen.findByText('Đồng bộ dữ liệu Đào tạo UEL')).toBeInTheDocument();
    expect(screen.getAllByText('Có bước lỗi').length).toBeGreaterThan(0);
});

test('1 nút: Đồng bộ toàn bộ gọi run-all', async () => {
    svc.runUelSyncAll.mockResolvedValue({ accepted: true });
    render(<UelSync />);
    fireEvent.click(await screen.findByRole('button', { name: /Đồng bộ toàn bộ/ }));
    await waitFor(() => expect(svc.runUelSyncAll).toHaveBeenCalledTimes(1));
    expect(svc.runUelSync).not.toHaveBeenCalled();
});

test('thẻ Đồng bộ ngay hiện lịch đến hết năm học, không còn ô số ngày', async () => {
    render(<UelSync />);
    expect(await screen.findByText(/đến 31\/08\/2027/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Lấy lịch học trước/)).not.toBeInTheDocument();
});

test('status cũ không có plan vẫn render', async () => {
    svc.getUelSyncStatus.mockResolvedValue(status({ plan: undefined }));
    render(<UelSync />);
    expect(await screen.findByText(/Lịch học đến hết năm học\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/đến \d{2}\/\d{2}\/\d{4}/)).not.toBeInTheDocument();
});

test('chưa có API key: không cho chạy', async () => {
    svc.getUelSyncStatus.mockResolvedValue(status({ configured: false }));
    render(<UelSync />);
    expect(await screen.findByText('Chưa có API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đồng bộ toàn bộ/ })).toBeDisabled();
});

test('cài đặt: bật tự động hằng tuần, chọn ngày + giờ, học kỳ tự nhận', async () => {
    svc.updateUelSyncSettings.mockImplementation(async (p) => p);
    render(<UelSync />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Tự động đồng bộ toàn bộ' }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Hằng tuần' }));
    expect(screen.getByRole('radio', { name: 'Hằng tuần' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Vào ngày'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Giờ chạy'), { target: { value: '03:30' } });
    fireEvent.click(screen.getByLabelText(/Tự nhận/));
    expect(screen.getByText(/Lần chạy kế tiếp/)).toHaveTextContent('Thứ Hai');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() =>
        expect(svc.updateUelSyncSettings).toHaveBeenCalledWith({
            autoEnabled: true, frequency: 'weekly', weekday: 1, time: '03:30',
            termMode: 'auto', namHoc: '', hocKy: '', intervalDays: 3,
        }),
    );
    expect(await screen.findByText('Đã lưu cài đặt.')).toBeInTheDocument();
});

test('cảnh báo của lượt cũ hiển thị tiếng Việt thay cho lỗi trùng email', async () => {
    svc.getUelSyncRuns.mockResolvedValue([{ ...RUN, results: [{ step: 'staff', fetched: 2, upserted: 1, skipped: 1, deactivated: 0, warnings: ['cán bộ SDH162: duplicate key value violates unique constraint "ux_users_email_active"'] }] }]);
    render(<UelSync />);
    const toggle = (await screen.findAllByRole('button')).find((b) => b.hasAttribute('aria-expanded') && b.closest('tr'));
    fireEvent.click(toggle);
    expect(await screen.findByText(/cán bộ SDH162: Email này đã được dùng cho một tài khoản khác/)).toBeInTheDocument();
    expect(screen.queryByText(/duplicate key/)).not.toBeInTheDocument();
});

test('cài đặt: mỗi N ngày (vd 5 ngày) lúc 02:00', async () => {
    svc.updateUelSyncSettings.mockImplementation(async (p) => p);
    render(<UelSync />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Tự động đồng bộ toàn bộ' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Mỗi N ngày' }));
    fireEvent.change(screen.getByLabelText('Số ngày giữa 2 lần'), { target: { value: '5' } });
    expect(screen.getByText(/Lần chạy kế tiếp/)).toHaveTextContent('mỗi 5 ngày');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() =>
        expect(svc.updateUelSyncSettings).toHaveBeenCalledWith(
            expect.objectContaining({ frequency: 'interval', intervalDays: 5 }),
        ),
    );
});

test('cài đặt: số ngày ngoài 2..90 thì không cho lưu', async () => {
    render(<UelSync />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Tự động đồng bộ toàn bộ' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Mỗi N ngày' }));
    fireEvent.change(screen.getByLabelText('Số ngày giữa 2 lần'), { target: { value: '1' } });
    expect(screen.getByText('Số ngày giữa 2 lần phải từ 2 đến 90.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu cài đặt' })).toBeDisabled();
});

test('lượt bị gián đoạn hiện nhãn riêng', async () => {
    svc.getUelSyncRuns.mockResolvedValue([{ ...RUN, status: 'failed', interrupted: true }]);
    render(<UelSync />);
    expect(await screen.findByText('Bị gián đoạn (server khởi động lại)')).toBeInTheDocument();
});

const GAPS = {
    generatedAt: '2026-11-18T02:22:31.000Z',
    students: {
        total: 18989,
        noEmail: 1835,
        groups: [
            { label: 'K20', total: 22, noEmail: 0 },
            { label: 'K22', total: 3079, noEmail: 0 },
            { label: 'Khác', total: 2214, noEmail: 1833 },
        ],
    },
    staff: { total: 1063, noEmail: 79 },
    sections: { total: 3855, noLecturer: 595, reasons: { not_assigned: 450, ambiguous: 120, not_in_staff: 15, pending: 10 } },
};

const has = (t) => (content) => content.includes(t);

test('lượt chạy có báo cáo dữ liệu cần bổ sung + nút xuất Excel', async () => {
    svc.getUelSyncRuns.mockResolvedValue([{ ...RUN, gaps: GAPS }]);
    svc.downloadUelGaps.mockResolvedValue(undefined);
    render(<UelSync />);
    expect(await screen.findByText('Dữ liệu cần bổ sung')).toBeInTheDocument();
    expect(screen.getByText(has('1.835 / 18.989 SV chưa có email'))).toBeInTheDocument();
    expect(screen.getByText(has('79 / 1.063 cán bộ chưa có email'))).toBeInTheDocument();
    expect(screen.getByText(has('595 / 3.855 lớp HP chưa có giảng viên'))).toBeInTheDocument();
    expect(screen.getByText(/UEL chưa phân công giảng viên: 450/)).toBeInTheDocument();
    expect(screen.getByText(has('K20: 0 / 22'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xuất Excel danh sách/ }));
    await waitFor(() => expect(svc.downloadUelGaps).toHaveBeenCalled());
});

test('cột Vô hiệu hóa có giải thích', async () => {
    render(<UelSync />);
    expect(await screen.findAllByTitle(/UEL không còn trả về/)).not.toHaveLength(0);
});
