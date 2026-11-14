import { getAdminVehicleHistory } from '../service/anprService';
import { downloadReport } from './exportExcel';

export const exportAnprHistoryReport = async ({ format, standard, range, filters, filterSummary = [] }) => {
    const start = new Date(`${range.from}T00:00:00`);
    const end = new Date(`${range.to}T23:59:59.999`);
    const events = [];
    for (let page = 1; ; page += 1) {
        const result = await getAdminVehicleHistory({ ...filters, from: start.toISOString(), to: end.toISOString(), page, limit: 100 });
        if (!result?.success) throw new Error(result?.message || 'Không tải được nhật ký phương tiện để xuất');
        const batch = result.data || [];
        events.push(...batch);
        if (events.length > 20000) throw new Error('Khoảng lọc có hơn 20.000 lượt xe. Vui lòng chọn khoảng ngày ngắn hơn.');
        if (batch.length < 100 || (typeof result.meta?.total === 'number' && events.length >= result.meta.total)) break;
    }
    await downloadReport({
        format, standard: standard?.mode === 'standard' ? { ...standard, reportType: 'vehicle' } : undefined,
        title: 'NHẬT KÝ PHƯƠNG TIỆN RA VÀO', docTitle: 'Nhật ký phương tiện ra vào',
        period: range, fileName: `Nhat-ky-phuong-tien_${range.from}_${range.to}`,
        info: filterSummary.map(line => ['Bộ lọc', line]),
        sheets: [{ name: 'Nhật ký', columns: [
            { header: 'Thời điểm', key: 'time', width: 24 }, { header: 'Hướng', key: 'direction', width: 12 },
            { header: 'Camera', key: 'camera', width: 28 }, { header: 'Biển số', key: 'plate', width: 18 },
            { header: 'Loại xe', key: 'vehicleType', width: 16 }, { header: 'Đối soát', key: 'match', width: 22 },
            { header: 'Chủ xe', key: 'owner', width: 28 },
        ], rows: events.map(event => ({
            time: new Date(event.eventTime || event.createdAt || event.timestamp).toLocaleString('vi-VN'),
            direction: ['enter', 'in', 'entry'].includes(String(event.direction).toLowerCase()) ? 'Vào' : ['leave', 'out', 'exit'].includes(String(event.direction).toLowerCase()) ? 'Ra' : 'Ghi nhận',
            camera: event.cameraName || event.camera_name || '', plate: event.plateNumber || '',
            vehicleType: ({ car: 'Ô tô', motorbike: 'Xe máy', motorcycle: 'Xe máy', truck: 'Xe tải', bus: 'Xe buýt' })[event.vehicleType || event.vehicle_type] || event.vehicleType || '',
            match: event.matchState || '', owner: event.ownerName || event.owner?.fullName || '',
        })) }],
    });
};
