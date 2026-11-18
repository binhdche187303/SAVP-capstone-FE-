import { getDeviceErrorDetail } from './deviceErrorDetail';

test('mất kết nối 1 camera: ghi loại lỗi + tên/mã camera', () => {
    const d = getDeviceErrorDetail({ alert_type: 'device_error', payload_json: { reason: 'offline', deviceName: 'Camera cổng phụ', deviceCode: 'CAM-02' } });
    expect(d).toEqual({ kind: 'Mất kết nối', devices: [{ name: 'Camera cổng phụ', code: 'CAM-02' }] });
});

test('nhiều camera: trả đủ danh sách để mở modal', () => {
    const d = getDeviceErrorDetail({ alert_type: 'device_error', payload_json: {
        reason: 'offline', offlineDevices: [{ deviceName: 'A', deviceCode: 'A-1' }, { deviceName: 'B' }, { deviceCode: 'C-01' }],
    } });
    expect(d.kind).toBe('Mất kết nối');
    expect(d.devices).toEqual([{ name: 'A', code: 'A-1' }, { name: 'B', code: '' }, { name: 'C-01', code: '' }]);
});

test('loại lỗi khác / thiếu thông tin / không phải lỗi thiết bị', () => {
    expect(getDeviceErrorDetail({ alert_type: 'device_error', payload_json: { reason: 'faulty' } }).kind).toBe('Hỏng / lỗi phần cứng');
    expect(getDeviceErrorDetail({ alert_type: 'device_error', payload_json: {} })).toEqual({ kind: 'Lỗi không xác định', devices: [] });
    expect(getDeviceErrorDetail({ alert_type: 'stranger', payload_json: {} })).toBeNull();
});
