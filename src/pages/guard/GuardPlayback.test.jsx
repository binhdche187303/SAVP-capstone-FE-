import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuardPlayback, { fmtDuration, validateWindow } from './GuardPlayback';
import { downloadHgPlayback, getHgCameras, getHgMediaBlob, getHgPlaybackRecordings } from '../../service/hgvisionService';
import { downloadBlob } from '../../utils/cameraSnapshot';

jest.mock('../../service/hgvisionService', () => ({
    getHgCameras: jest.fn(),
    getHgPlaybackRecordings: jest.fn(),
    downloadHgPlayback: jest.fn(),
    getHgMediaBlob: jest.fn(),
    hgPlaybackPlaylistUrl: ({ camera, from, to }) => `http://be.test/playlist?camera=${camera}&from=${from}&to=${to}`,
}));
jest.mock('../../utils/cameraSnapshot', () => ({ downloadBlob: jest.fn() }));
jest.mock('../../components/camera/HlsPlayer', () => ({ src }) => <div data-testid="player" data-src={src} />);

const cams = [
    { name: 'Cong chinh', group: 'Cong', status: 'online' },
    { name: 'Sanh A', zoneName: 'Sảnh bảo vệ', status: 'online', usingRecord: false },
];

const renderPage = (url = '/guard/playback') => render(<MemoryRouter initialEntries={[url]}><GuardPlayback /></MemoryRouter>);

const recordings = () => {
    const now = Date.now();
    const a = { startMs: now - 14 * 60_000, endMs: now - 10 * 60_000 };
    const b = { startMs: now - 8 * 60_000, endMs: now - 2 * 60_000 };
    return { a, b, data: { ranges: [a, b], segments: [{ ...a, thumbUrl: '/api/v1/hgvision/stream?path=t1' }, { ...b, thumbUrl: null }] } };
};

beforeEach(() => {
    jest.clearAllMocks();
    getHgCameras.mockResolvedValue({ success: true, data: cams });
    getHgMediaBlob.mockResolvedValue({ data: new Blob(['jpg']) });
});

test('trạng thái trống ban đầu và báo lỗi khi chưa chọn camera', async () => {
    renderPage();
    expect(screen.getByText('Chưa có video nào')).toBeInTheDocument();
    expect(screen.getByText('Chọn camera và khoảng thời gian để tìm kiếm đoạn ghi hình.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tìm/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chọn camera cần xem lại.');
    expect(getHgPlaybackRecordings).not.toHaveBeenCalled();
});

test('tìm theo camera, phát khoảng ghi đầu tiên và liệt kê các đoạn', async () => {
    const { a, data } = recordings();
    getHgPlaybackRecordings.mockResolvedValue({ success: true, data });
    renderPage();
    const select = await screen.findByLabelText('Camera');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Sanh A (không ghi hình)' })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: 'Cong chinh' } });
    fireEvent.click(screen.getByRole('button', { name: '1 giờ' }));
    expect(screen.getByRole('button', { name: '1 giờ' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Tìm/ }));

    const player = await screen.findByTestId('player');
    expect(player.dataset.src).toBe(`http://be.test/playlist?camera=Cong chinh&from=${a.startMs}&to=${a.endMs}`);
    const call = getHgPlaybackRecordings.mock.calls[0][0];
    expect(call.camera).toBe('Cong chinh');
    expect(call.to - call.from).toBeGreaterThan(55 * 60_000);
    expect(screen.getAllByTestId('timeline-range')).toHaveLength(2);
    const list = within(screen.getByRole('region', { name: 'Danh sách đoạn ghi' }));
    expect(list.getByText('Đoạn ghi hình (2)')).toBeInTheDocument();
    expect(screen.getByText('10 phút')).toBeInTheDocument(); // tổng thời lượng có ghi
});

test('bấm một đoạn trong danh sách thì phát đoạn đó; tải video tối đa 1 giờ', async () => {
    const { b, data } = recordings();
    getHgPlaybackRecordings.mockResolvedValue({ success: true, data });
    downloadHgPlayback.mockResolvedValue({ success: true, isBlob: true, data: new Blob(['mp4'], { type: 'video/mp4' }) });
    renderPage('/guard/playback?camera=Cong%20chinh');
    await screen.findByTestId('player'); // ?camera= tự tìm
    const list = within(screen.getByRole('region', { name: 'Danh sách đoạn ghi' }));
    fireEvent.click(list.getAllByRole('button')[1]);
    expect(screen.getByTestId('player').dataset.src).toBe(`http://be.test/playlist?camera=Cong chinh&from=${b.startMs}&to=${b.endMs}`);

    fireEvent.click(screen.getByRole('button', { name: /Tải video/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(downloadHgPlayback).toHaveBeenCalledWith({ camera: 'Cong chinh', from: b.startMs, to: b.endMs });
    expect(downloadBlob.mock.calls[0][1]).toMatch(/^Cong_chinh_\d{8}-\d{4}\.mp4$/);
});

test('không có đoạn ghi thì hiện thông báo; lỗi BE hiện cảnh báo', async () => {
    getHgPlaybackRecordings.mockResolvedValueOnce({ success: true, data: { ranges: [], segments: [] } });
    renderPage('/guard/playback?camera=Cong%20chinh');
    expect(await screen.findByText('Không có đoạn ghi hình')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();

    getHgPlaybackRecordings.mockRejectedValueOnce({ status: 400, error: { message: 'Khoảng thời gian tối đa 24 giờ' } });
    fireEvent.click(screen.getByRole('button', { name: /Tìm/ }));
    expect(await screen.findByText('Khoảng thời gian tối đa 24 giờ')).toBeInTheDocument();
});

test('validateWindow và fmtDuration', () => {
    const now = 1_800_000_000_000;
    expect(validateWindow({ camera: 'A', from: now - 1000, to: now - 2000, now })).toMatch(/kết thúc phải sau/);
    expect(validateWindow({ camera: 'A', from: now - 25 * 3600_000, to: now, now })).toMatch(/tối đa 1 ngày/);
    expect(validateWindow({ camera: 'A', from: now + 1000, to: now + 2000, now })).toMatch(/trước thời điểm hiện tại/);
    expect(validateWindow({ camera: 'A', from: now - 3600_000, to: now, now })).toBeNull();
    expect(fmtDuration(90_000)).toBe('1 phút 30 giây');
    expect(fmtDuration(2 * 3600_000 + 5 * 60_000)).toBe('2 giờ 5 phút');
});
