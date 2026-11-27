import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportRuns from './ReportRuns';
import { listScheduleRuns, listSchedules } from '../../../service/reportCenterService';

jest.mock('../../../hooks/useFilterCounts', () => ({ useFacetCounts: () => undefined, totalOf: () => 0 }));
jest.mock('../../../service/reportCenterService', () => ({
    listScheduleRuns: jest.fn(),
    listSchedules: jest.fn().mockResolvedValue({ success: true, data: [] }),
    retryScheduleRun: jest.fn(), downloadRunFile: jest.fn(),
}));

test('chỉ lượt thất bại chưa gửi lại có nút Gửi lại; trạng thái tạm không bị ghi thất bại', async () => {
    listSchedules.mockResolvedValue({ success: true, data: [] });
    const statuses = ['success', 'failed', 'failed', 'queued', 'running'];
    listScheduleRuns.mockResolvedValue({ success: true, data: { total: 5, page: 1, limit: 10, items: statuses.map((status, i) => ({
        id: String(i), scheduleName: `Lịch thử ${i}`, reportTitle: 'Khách', status,
        ranAt: '2026-11-27T01:00:00Z', from: '2026-11-01', to: '2026-11-27', formats: [], recipientCount: 1,
        retriedByRunId: i === 2 ? 'retry-1' : null,
    })) } });
    render(<MemoryRouter initialEntries={['/system-admin/report-schedules/runs']}><ReportRuns /></MemoryRouter>);
    await screen.findByText('Lịch thử 4');
    expect(screen.getAllByRole('button', { name: 'Gửi lại' })).toHaveLength(1);
    expect(within(screen.getByRole('table')).getAllByText('Thất bại')).toHaveLength(2);
    expect(screen.getByText('Đã gửi lại')).toBeInTheDocument();
    for (const i of [3, 4]) {
        const row = screen.getByText(`Lịch thử ${i}`).closest('tr');
        expect(within(row).queryByText('Thất bại')).not.toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: 'Gửi lại' })).not.toBeInTheDocument();
    }
});
