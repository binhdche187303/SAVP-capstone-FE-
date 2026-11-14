import { exportAnprHistoryReport } from './anprReportExport';
import { getAdminVehicleHistory } from '../service/anprService';
import { downloadReport } from './exportExcel';
jest.mock('../service/anprService', () => ({ getAdminVehicleHistory: jest.fn() }));
jest.mock('./exportExcel', () => ({ downloadReport: jest.fn().mockResolvedValue() }));

test('exports all ANPR pages using the same camera, recognition and date filters for both modes', async () => {
    const events = Array.from({ length: 101 }, (_, id) => ({ id, eventTime: '2026-11-10T08:00:00+07:00', plateNumber: `30A${id}`, vehicleType: 'car' }));
    getAdminVehicleHistory.mockResolvedValueOnce({ success: true, data: events.slice(0, 100), meta: { total: 101 } }).mockResolvedValueOnce({ success: true, data: events.slice(100), meta: { total: 101 } });
    await exportAnprHistoryReport({ format: 'xlsx', standard: { mode: 'standard', templateId: 'template-1' }, range: { from: '2026-11-10', to: '2026-11-12' }, filters: { cameraName: 'ANPR-1', matchState: 'matched', zoneId: 'zone-1', plateNumber: '30A' } });
    expect(getAdminVehicleHistory).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, cameraName: 'ANPR-1', matchState: 'matched', zoneId: 'zone-1', plateNumber: '30A', from: new Date('2026-11-10T00:00:00').toISOString(), to: new Date('2026-11-12T23:59:59.999').toISOString() }));
    const config = downloadReport.mock.calls[0][0];
    expect(config.sheets[0].rows).toHaveLength(101);
    expect(config.standard).toMatchObject({ templateId: 'template-1', reportType: 'vehicle' });
});
