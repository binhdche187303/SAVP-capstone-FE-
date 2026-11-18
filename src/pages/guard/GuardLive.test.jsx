import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuardLive, { errorMessage } from './GuardLive';
import { captureHgSnapshot, getHgCameraLogs, getHgCameras, getHgSnapshotFile, getHgSnapshots } from '../../service/hgvisionService';
import { downloadBlob } from '../../utils/cameraSnapshot';

jest.mock('../../service/hgvisionService', () => ({
    getHgCameras: jest.fn(),
    getHgCameraLogs: jest.fn(),
    captureHgSnapshot: jest.fn(),
    getHgSnapshots: jest.fn(),
    getHgSnapshotFile: jest.fn(),
    toBackendUrl: (p) => `http://be.test${p}`,
}));
jest.mock('../../utils/cameraSnapshot', () => ({ captureCameraSnapshot: jest.fn(() => Promise.resolve('cong-chinh_x.png')), downloadBlob: jest.fn() }));
jest.mock('../../components/camera/HlsPlayer', () => ({ src, title }) => <div data-testid="player" data-src={src}>{title}</div>);

const cams = [
    { name: 'Cong chinh', index: 1, group: 'Cong', status: 'online', fps: 24, usingFace: true, usingPlate: true, health: { level: 'good', reasons: [], fps: 24, fpsExpected: 25, bitrateKbps: 3000, latencyMs: 40, disconnects24h: 0 }, liveUrl: '/api/v1/hgvision/live/Cong%20chinh/index.m3u8' },
    { name: 'Sanh A', index: 2, group: 'Sanh', zoneId: 'z1', zoneName: 'Sảnh bảo vệ', status: 'online', fps: 12, health: { level: 'weak', reasons: ['FPS thấp hơn cấu hình'] }, liveUrl: '/api/v1/hgvision/live/Sanh%20A/index.m3u8' },
    { name: 'Bai xe', index: 3, group: 'Bai xe', status: 'offline', health: { level: 'offline', reasons: [] }, liveUrl: '/api/v1/hgvision/live/Bai%20xe/index.m3u8' },
];

const renderPage = () => render(<MemoryRouter initialEntries={['/guard/live']}><GuardLive /></MemoryRouter>);

beforeEach(() => {
    jest.clearAllMocks();
    getHgCameras.mockResolvedValue({ success: true, data: cams, meta: { total: 3, online: 2 } });
    const snap = { id: 's1', cameraName: 'Cong chinh', capturedAt: '2026-11-18T02:05:07.000Z', capturedByName: 'Bảo vệ A', fileName: 'cong-chinh_1.png' };
    captureHgSnapshot.mockResolvedValue({ success: true, data: snap });
    getHgSnapshots.mockResolvedValue({ success: true, data: [snap] });
    getHgSnapshotFile.mockResolvedValue({ success: true, isBlob: true, data: new Blob(['png'], { type: 'image/png' }) });
    getHgCameraLogs.mockResolvedValue({ success: true, data: { items: [{ id: 1, level: 'error', message: 'Mất kết nối tới camera', timestamp_ms: 0 }], has_more: false } });
});

test('hiển thị thống kê, tự chọn camera online đầu tiên và phát qua liveUrl của BE', async () => {
    renderPage();
    const player = await screen.findByTestId('player');
    expect(player).toHaveAttribute('data-src', 'http://be.test/api/v1/hgvision/live/Cong%20chinh/index.m3u8');
    expect(screen.getByRole('button', { name: /Tổng camera/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /Tín hiệu yếu/ })).toHaveTextContent('1');
    expect(await screen.findByText('Mất kết nối tới camera')).toBeInTheDocument();
    expect(getHgCameraLogs).toHaveBeenCalledWith('Cong chinh', { limit: 10 });
});

test('danh sách chia theo khu vực, ưu tiên khu vực SAVP hơn nhóm HGVision', async () => {
    renderPage();
    await screen.findByTestId('player');
    const list = within(screen.getByRole('region', { name: 'Danh sách camera' }));
    // Khu vực của camera đang xem mở sẵn; các khu vực khác đóng cho tới khi bấm.
    expect(list.getByRole('group', { name: 'Khu vực Cong' })).toHaveTextContent('Cong chinh');
    const lobby = list.getByRole('group', { name: 'Khu vực Sảnh bảo vệ' });
    expect(lobby).not.toHaveTextContent('Sanh A');
    fireEvent.click(within(lobby).getByRole('button', { name: /Sảnh bảo vệ/ }));
    expect(lobby).toHaveTextContent('Sanh A');
    expect(list.queryByRole('group', { name: 'Khu vực Sanh' })).not.toBeInTheDocument();
});

test('bấm thẻ thống kê để lọc theo trạng thái', async () => {
    renderPage();
    await screen.findByTestId('player');
    fireEvent.click(screen.getByRole('button', { name: /Tín hiệu yếu/ }));
    const list = within(screen.getByRole('region', { name: 'Danh sách camera' }));
    expect(list.getByText('Danh sách camera (1)')).toBeInTheDocument();
    expect(list.getByText('Sanh A')).toBeInTheDocument();
});

test('tìm không dấu theo tên hoặc khu vực; chọn camera mất kết nối thì không mở player', async () => {
    renderPage();
    await screen.findByTestId('player');
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'sảnh bảo' } });
    const list = within(screen.getByRole('region', { name: 'Danh sách camera' }));
    expect(list.getByText('Danh sách camera (1)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: '  BAI   xe ' } });
    expect(list.getByText('Danh sách camera (1)')).toBeInTheDocument();
    expect(await screen.findByText('Camera đang mất kết nối')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
});

test('bố cục lưới chỉ phát camera đang online', async () => {
    renderPage();
    await screen.findByTestId('player');
    fireEvent.click(screen.getByTitle('Lưới 4 camera'));
    expect(screen.getAllByTestId('player').map((p) => p.textContent)).toEqual(['Cong chinh', 'Sanh A']);
});

test('báo lỗi rõ khi máy chủ chưa cấu hình HGVision', async () => {
    getHgCameras.mockRejectedValue({ success: false, status: 503, error: { code: 'HGVISION_NOT_CONFIGURED' } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa cấu hình kết nối HGVision');
});

test('errorMessage ưu tiên 403 và mã HGVision', () => {
    expect(errorMessage({ status: 403, error: { code: 'FORBIDDEN' } })).toBe('Bạn chưa được cấp quyền xem camera.');
    expect(errorMessage({ status: 503, error: { code: 'HGVISION_UNAVAILABLE' } })).toBe('Không kết nối được máy chủ camera HGVision.');
    expect(errorMessage({ status: 500, error: { message: 'x' } })).toBe('x');
});

test('chụp ảnh camera đang xem; camera mất kết nối thì khóa nút', async () => {
    renderPage();
    await screen.findByTestId('player');
    expect(await screen.findByText(/Bảo vệ A/)).toBeInTheDocument(); // ảnh đã chụp gần đây từ BE
    expect(getHgSnapshots).toHaveBeenCalledWith({ camera: 'Cong chinh', limit: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Chụp ảnh' }));
    await waitFor(() => expect(captureHgSnapshot).toHaveBeenCalledWith('Cong chinh'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'cong-chinh_1.png'));
    expect(getHgSnapshotFile).toHaveBeenCalledWith('s1');
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'bai xe' } });
    expect(await screen.findByText('Camera đang mất kết nối')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chụp ảnh' })).toBeDisabled();
});
