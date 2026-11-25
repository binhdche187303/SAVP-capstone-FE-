import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GatePresenceManagement from './GatePresenceManagement';
import { buildGuardSummary, fetchGuardGateEventsInRange, filterGuardGateEvents, getGuardGateEvents } from '../../service/guardAccessService';

jest.mock('../../service/guardAccessService', () => ({
    GUARD_GATE_EVENTS_STORAGE_KEY: 'test-gate-events',
    getGuardGateEvents: jest.fn(),
    fetchGuardGateEventsInRange: jest.fn(),
    filterGuardGateEvents: jest.fn(),
    exportGuardGateEventsCsv: jest.fn(),
    buildGuardSummary: jest.fn(),
}));

const SUMMARY = {
        present: 12,
        entries: 24,
        presencePeopleCount: 18,
        presenceText: '36 giờ',
        presenceByPerson: [],
};

const renderPage = () => render(
    <MemoryRouter initialEntries={['/system-admin/gate-presence']}>
        <Routes>
            <Route path="/system-admin/gate-presence" element={<GatePresenceManagement />} />
        </Routes>
    </MemoryRouter>,
);

beforeEach(() => {
    jest.clearAllMocks();
    getGuardGateEvents.mockReturnValue([]);
    fetchGuardGateEventsInRange.mockResolvedValue([]);
    filterGuardGateEvents.mockReturnValue([]);
    buildGuardSummary.mockReturnValue(SUMMARY);
});

test('hiện tối đa 4 card chuẩn có màu, icon và giữ thao tác làm mới', async () => {
    renderPage();
    await waitFor(() => expect(fetchGuardGateEventsInRange).toHaveBeenCalledTimes(1));

    const stats = screen.getByRole('group', { name: 'Thống kê hiện diện khuôn viên' });
    expect(stats.querySelectorAll('[data-stat-card="standard"]')).toHaveLength(4);
    ['Đang có mặt', 'Lượt vào', 'Người có dữ liệu hiện diện', 'Tổng thời gian quy đổi'].forEach((label) => {
        expect(within(stats).getByRole('group', { name: label }).querySelector('svg')).toBeInTheDocument();
    });
    expect(stats.querySelector('[data-tone="blue"]')).toBeInTheDocument();
    expect(stats.querySelector('[data-tone="success"]')).toBeInTheDocument();
    expect(stats.querySelector('[data-tone="warning"]')).toBeInTheDocument();
    expect(stats.querySelector('[data-tone="slate"]')).toBeInTheDocument();
    expect(within(stats).queryByRole('group', { name: 'Khác' })).not.toBeInTheDocument();

    const refresh = screen.getByRole('button', { name: 'Làm mới' });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(fetchGuardGateEventsInRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toBeEnabled());
});
