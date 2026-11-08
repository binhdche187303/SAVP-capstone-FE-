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
        updateUelSyncSettings: jest.fn(),
        replaceStudyPeriods: jest.fn(),
        lookupUel: jest.fn(),
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
    settings: { namHoc: '2026-2027', hocKy: '1', sessionDaysAhead: 14 },
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
    expect(screen.getByText('2026-2027 · HK1')).toBeInTheDocument();
    expect(screen.getByText('Có bước lỗi')).toBeInTheDocument();
    expect(screen.getByText('Bảng study_periods trống')).toBeInTheDocument();
});

test('chưa có bảng giờ tiết: chặn chạy lịch học, bỏ bước lịch học thì chạy được', async () => {
    svc.runUelSync.mockResolvedValue({ accepted: true });
    render(<UelSync />);
    const runBtn = await screen.findByRole('button', { name: /Chạy đồng bộ/ });
    expect(runBtn).toBeDisabled();
    expect(screen.getByText(/Lịch học cần bảng giờ tiết/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /6\. Lịch học/ }));
    expect(runBtn).toBeEnabled();
    fireEvent.click(runBtn);
    await waitFor(() =>
        expect(svc.runUelSync).toHaveBeenCalledWith({
            steps: ['departments', 'staff', 'students', 'sections', 'enrollments'],
            namHoc: '2026-2027',
            hocKy: '1',
        }),
    );
});

test('chưa có API key: không cho chạy', async () => {
    svc.getUelSyncStatus.mockResolvedValue(status({ configured: false }));
    render(<UelSync />);
    expect(await screen.findByText('Chưa có API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chạy đồng bộ/ })).toBeDisabled();
});

test('thêm tiết rồi lưu bảng giờ tiết', async () => {
    svc.replaceStudyPeriods.mockImplementation(async (p) => p);
    render(<UelSync />);
    fireEvent.click(await screen.findByRole('button', { name: /Thêm tiết/ }));
    fireEvent.change(screen.getByLabelText('Giờ kết thúc tiết 1'), { target: { value: '07:50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bảng giờ tiết' }));
    await waitFor(() =>
        expect(svc.replaceStudyPeriods).toHaveBeenCalledWith([{ periodNo: 1, startTime: '07:00', endTime: '07:50' }]),
    );
    expect(await screen.findByText(/Đã lưu 1 tiết/)).toBeInTheDocument();
});

test('tra cứu trực tiếp: lịch dạy 1 ngày gửi kèm ngày, hiện bảng kết quả', async () => {
    svc.lookupUel.mockResolvedValue({
        type: 'lecturerDay',
        api: 'thoikhoabieu/chi_tiet_tkb_gv_1ngay',
        total: 1,
        truncated: false,
        items: [{ stt: 1, ngay_hoc: '2026-11-09', ma_lop_hoc_phan: '261MI0101_01', ten_hoc_phan: 'Cơ sở dữ liệu', ma_giang_vien: 'NS003' }],
    });
    render(<UelSync />);
    await screen.findByText('Tra cứu trực tiếp từ UEL');
    fireEvent.change(screen.getByLabelText('Tra cứu'), { target: { value: 'lecturerDay' } });
    fireEvent.change(screen.getByLabelText('Mã giảng viên'), { target: { value: 'NS003' } });
    fireEvent.change(screen.getByLabelText('Ngày'), { target: { value: '2026-11-09' } });
    fireEvent.click(screen.getByRole('button', { name: /Tra cứu$/ }));
    await waitFor(() =>
        expect(svc.lookupUel).toHaveBeenCalledWith({ type: 'lecturerDay', code: 'NS003', date: '2026-11-09' }),
    );
    expect(await screen.findByText('Cơ sở dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Học phần')).toBeInTheDocument();
});
