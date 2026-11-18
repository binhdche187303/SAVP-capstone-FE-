import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Strangers, { groupByHour } from './Strangers';
import { dismissStrangerEvents, getStrangerAlerts, getStrangerSightings } from '../../service/businessAdminServices';
import { getDevices } from '../../service/sysAdminServices';

jest.mock('../../service/businessAdminServices', () => ({
    getStrangerAlerts: jest.fn(),
    getStrangerSightings: jest.fn(),
    reopenStrangerEvents: jest.fn(),
    dismissStrangerEvents: jest.fn(),
}));
jest.mock('../../service/personControlListService', () => ({ createPersonControlRecord: jest.fn() }));
jest.mock('../../service/sysAdminServices', () => ({ getDevices: jest.fn() }));
jest.mock('../../components/common/ThumbnailImage', () => () => <div data-testid="thumb" />);

const mk = (i, iso, hits = 1) => ({
    deviceId: 'd1', deviceCode: 'Camera 2', strangerId: `snapshot:${i}`, hitCount: hits,
    lastSeen: iso, firstSeen: iso, latestEventId: `e${i}`, snapshotEventId: `e${i}`,
});
const items = [mk(1, '2026-11-18T04:55:00Z'), mk(2, '2026-11-18T04:10:00Z'), mk(3, '2026-11-18T03:59:00Z', 2)];

beforeEach(() => {
    jest.clearAllMocks();
    getDevices.mockResolvedValue({ success: true, data: [] });
    getStrangerAlerts.mockImplementation(async ({ limit }) => ({ success: true, data: limit === 1 ? [] : items, meta: { total: limit === 1 ? 0 : items.length } }));
    getStrangerSightings.mockResolvedValue({ data: [{ eventId: 'e3', time: '2026-11-18T03:59:00Z' }, { eventId: 'e3b', time: '2026-11-18T03:50:00Z' }] });
    dismissStrangerEvents.mockResolvedValue({ success: true });
});

test('groupByHour gom theo khung giờ VN, giữ thứ tự mới nhất trước', () => {
    const groups = groupByHour(items);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['11:00 – 11:59 · 18/11', 2], ['10:00 – 10:59 · 18/11', 1]]);
});

test('không hiện mã snapshot; chọn nhiều người lạ và đóng hàng loạt với 1 lý do', async () => {
    render(<MemoryRouter initialEntries={['/system-admin/strangers']}><Strangers /></MemoryRouter>);
    expect(await screen.findByRole('region', { name: /11:00 – 11:59/ })).toBeInTheDocument();
    expect(screen.queryByText(/snapshot:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chọn cả trang \(3\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Đóng 3 mục đã chọn/ }));
    const dialog = await screen.findByText('Đóng cảnh báo 3 người lạ');
    const form = dialog.closest('form');
    await within(form).findByText(/3 người lạ · 4 lượt/);
    // Người 1 lượt dùng thẳng latestEventId; người nhiều lượt mới hỏi BE.
    expect(getStrangerSightings).toHaveBeenCalledTimes(1);
    fireEvent.click(within(form).getByLabelText(/AI nhận nhầm/));
    fireEvent.click(within(form).getByRole('button', { name: /Đóng cảnh báo/ }));
    await waitFor(() => expect(dismissStrangerEvents).toHaveBeenCalledWith({ eventIds: ['e1', 'e2', 'e3', 'e3b'], reason: 'ai_false_positive' }));
});
