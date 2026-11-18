import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemSettings from './SystemSettings';
import { getSystemConfigs, getChannelMaps, getRooms, getZones, getNoShowConfig, getSecurityAlertsConfig, updateNoShowConfig } from '../../service/sysAdminServices';
import { fetchClassAttendanceClasses, fetchClassAttendanceSettings, getClassAttendanceSettings, updateClassAttendanceSettings } from '../../service/classAttendanceService';

jest.mock('../../service/sysAdminServices', () => ({
    getSystemConfigs: jest.fn(), updateSystemConfig: jest.fn(), getChannelMaps: jest.fn(), updateChannelMap: jest.fn(),
    getRooms: jest.fn(), getZones: jest.fn(), getNoShowConfig: jest.fn(), updateNoShowConfig: jest.fn(),
    getSecurityAlertsConfig: jest.fn(), updateSecurityAlertsConfig: jest.fn(),
}));
jest.mock('../../service/classAttendanceService', () => ({
    DEFAULT_CLASS_ATTENDANCE_SETTINGS: { classStartTime: '08:00', lateThresholdMinutes: 10, autoScanIntervalSeconds: 4 },
    fetchClassAttendanceClasses: jest.fn(), fetchClassAttendanceSettings: jest.fn(),
    getClassAttendanceSettings: jest.fn(), saveClassAttendanceSettings: jest.fn(), updateClassAttendanceSettings: jest.fn(),
}));

beforeEach(() => {
    jest.clearAllMocks();
    [getSystemConfigs, getChannelMaps, getRooms, getZones].forEach(api => api.mockResolvedValue({ success: true, data: [] }));
    [getNoShowConfig, getSecurityAlertsConfig].forEach(api => api.mockResolvedValue({ success: true, data: {} }));
    fetchClassAttendanceClasses.mockResolvedValue([]);
    fetchClassAttendanceSettings.mockResolvedValue({ classStartTime: '08:00', lateThresholdMinutes: 10, autoScanIntervalSeconds: 4 });
    getClassAttendanceSettings.mockReturnValue({ classStartTime: '08:00', lateThresholdMinutes: 10, autoScanIntervalSeconds: 4 });
});

const openClassroom = async () => {
    render(<MemoryRouter initialEntries={['/system-admin/settings']}><SystemSettings /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Cấu hình lớp học', exact: true }));
};

test('empty synchronized data shows an explanation instead of an unusable dropdown and tabs remain available', async () => {
    await openClassroom();
    expect(screen.getByRole('status')).toHaveTextContent('Chưa có lớp học đã đồng bộ');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đi đến đồng bộ dữ liệu UEL/ })).toHaveAttribute('href', '/system-admin/uel-sync');
    expect(screen.getByRole('button', { name: 'Lưu cấu hình lớp học', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('status'));
    fireEvent.click(screen.getByRole('button', { name: 'Quy tắc không gian', exact: true }));
    expect(screen.getByRole('heading', { name: 'Chính sách Vắng mặt', exact: true })).toBeInTheDocument();
    expect(fetchClassAttendanceClasses).toHaveBeenCalledWith({ source: 'uel_api' });
    expect(updateClassAttendanceSettings).not.toHaveBeenCalled();
    expect(updateNoShowConfig).not.toHaveBeenCalled();
});

test('synchronized classes can be selected and other tabs can still be clicked afterwards', async () => {
    fetchClassAttendanceClasses.mockResolvedValue([
        { id: 'synced-a', code: 'A', subject: 'Môn A', administrativeClasses: ['Lớp A'] },
        { id: 'synced-b', code: 'B', subject: 'Môn B', administrativeClasses: ['Lớp B'] },
    ]);
    await openClassroom();
    const select = screen.getByRole('combobox', { name: 'Lớp / môn học áp dụng' });
    expect(select).toBeEnabled();
    fireEvent.change(select, { target: { value: 'synced-b::Lớp B' } });
    await waitFor(() => expect(fetchClassAttendanceSettings).toHaveBeenLastCalledWith('synced-b', 'Lớp B'));
    expect(select).toHaveValue('synced-b::Lớp B');
    fireEvent.click(screen.getByRole('button', { name: 'Quy tắc không gian', exact: true }));
    expect(screen.getByRole('heading', { name: 'Chính sách Vắng mặt', exact: true })).toBeInTheDocument();
    expect(updateClassAttendanceSettings).not.toHaveBeenCalled();
});

test('a class-list failure remains visible without blocking navigation', async () => {
    fetchClassAttendanceClasses.mockRejectedValue(new Error('Unavailable'));
    await openClassroom();
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách lớp đã đồng bộ');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quy tắc không gian', exact: true }));
    expect(screen.getByRole('heading', { name: 'Chính sách Vắng mặt', exact: true })).toBeInTheDocument();
});
