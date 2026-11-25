import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ZoneTrafficAnalytics from './ZoneTrafficAnalytics';
import { getZoneTraffic } from '../../service/campusService';
import { getZones } from '../../service/zoneServices';
import { getCameraGroups } from '../../service/cameraGroupServices';

jest.mock('../../service/campusService', () => ({ getZoneTraffic: jest.fn() }));
jest.mock('../../service/zoneServices', () => ({ getZones: jest.fn() }));
jest.mock('../../service/cameraGroupServices', () => ({ getCameraGroups: jest.fn() }));
jest.mock('recharts', () => ({
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    LineChart: ({ children }) => <div>{children}</div>,
    Line: ({ dataKey, hide }) => <span data-testid={`line-${dataKey}`} data-hidden={String(Boolean(hide))} />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
}));

const TRAFFIC = {
    success: true,
    data: {
        heatmap: [
            { zoneId: 'zone-a', zoneName: 'Sảnh A', building: 'A', floor: '1', avgOccupancy: 12, peakOccupancy: 20, relativeDensity: 1, peakAt: '2026-11-23T08:00:00.000Z' },
            { zoneId: 'zone-b', zoneName: 'Sảnh B', building: 'B', floor: '1', avgOccupancy: 7, peakOccupancy: 10, relativeDensity: 0.5, peakAt: '2026-11-23T08:00:00.000Z' },
        ],
        series: [
            { zoneId: 'zone-a', hourBucket: '2026-11-23T08:00:00.000Z', avgOccupancy: 12 },
            { zoneId: 'zone-b', hourBucket: '2026-11-23T08:00:00.000Z', avgOccupancy: 7 },
        ],
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    getZoneTraffic.mockResolvedValue(TRAFFIC);
    getZones.mockResolvedValue({ success: true, data: [] });
    getCameraGroups.mockResolvedValue({ data: [] });
});

test('hiện tối đa 4 card chuẩn và giữ thao tác chọn khu vực trên biểu đồ', async () => {
    render(
        <MemoryRouter initialEntries={['/system-admin/zone-traffic']}>
            <Routes>
                <Route path="/system-admin/zone-traffic" element={<ZoneTrafficAnalytics />} />
            </Routes>
        </MemoryRouter>,
    );

    const zoneButton = await screen.findByRole('button', { name: 'Sảnh A' });
    const stats = screen.getByRole('group', { name: 'Thống kê lưu lượng khu vực' });
    expect(stats.querySelectorAll('[data-stat-card="standard"]')).toHaveLength(4);
    ['Khu vực có dữ liệu', 'Tổng số người TB', 'Khu đông nhất', 'Giờ cao điểm'].forEach((label) => {
        expect(within(stats).getByRole('group', { name: label }).querySelector('svg')).toBeInTheDocument();
    });
    expect(within(stats).queryByRole('group', { name: 'Khác' })).not.toBeInTheDocument();

    fireEvent.click(zoneButton);
    expect(zoneButton).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByTestId('line-zone-b')).toHaveAttribute('data-hidden', 'true'));
});
