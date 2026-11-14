import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExportReportModal, { reportPresetRange } from './ExportReportModal';
import { listTemplates } from '../../service/reportTemplateService';
import { exportReport } from '../../service/reportCenterService';

jest.mock('../../service/reportCenterService', () => ({ exportReport: jest.fn(), completeReportExport: jest.fn() }));
jest.mock('../../service/reportTemplateService', () => ({ listTemplates: jest.fn().mockResolvedValue({ success: true, data: [] }) }));
jest.mock('../../utils/toast', () => ({ success: jest.fn() }));

beforeEach(() => listTemplates.mockResolvedValue({ success: true, data: [] }));

test('exports the active interval and security criteria without opening another dialog', async () => {
    exportReport.mockResolvedValue({ success: true, data: { fileName: 'bao-cao.xlsx' } });
    const close = jest.fn();
    render(<MemoryRouter><ExportReportModal isOpen onClose={close} endpoint="/reports/security-alert/exports" formats={['xlsx', 'pdf']}
        range={{ from: '2026-11-10', to: '2026-11-12' }} filters={{ status: 'new', alertType: 'device_error', zoneId: 'zone-1' }} /></MemoryRouter>);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    await waitFor(() => expect(exportReport).toHaveBeenCalledWith('security-alert', { format: 'xlsx', from: '2026-11-10', to: '2026-11-12', status: 'new', alertType: 'device_error', zoneId: 'zone-1' }, { autoDownload: false }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

test('requires a date interval when the originating screen has none', async () => {
    exportReport.mockClear();
    render(<MemoryRouter><ExportReportModal isOpen onClose={jest.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Từ ngày / Đến ngày');
    expect(exportReport).not.toHaveBeenCalled();
});


test('analytics date presets cover the same complete week and month as the screen', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-13T12:00:00'));
    expect(reportPresetRange('week')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(reportPresetRange('month')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(reportPresetRange('custom', '2026-10-01', '2026-10-15')).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    jest.useRealTimers();
});

test('does not offer legacy CSV when its API cannot apply the building filter', () => {
    render(<MemoryRouter><ExportReportModal isOpen onClose={jest.fn()} filters={{ building: 'Tòa A' }} range={{ from: '2026-11-01', to: '2026-11-13' }} /></MemoryRouter>);
    expect(screen.queryByRole('radio', { name: 'CSV' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Excel' })).toBeInTheDocument();
});
