// Kiểm tra logic ghép dữ liệu cho sơ đồ camera 3D và các tương tác chính của trang.
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { buildTwin, cameraKind, floorOrder, matchBuilding, matchGate } from './twinData';
import CameraTwin from '../../pages/systemAdmin/CameraTwin';
import { getCampusMap } from '../../service/campusService';
import { getDevices, getRooms, getZones } from '../../service/sysAdminServices';

// jsdom không có WebGL: thay canvas 3D bằng thẻ rỗng, giữ nguyên phần còn lại của trang.
jest.mock('./CampusOverview3D', () => ({
    __esModule: true,
    default: () => <div data-testid="campus-3d" />,
    rectCenter: ([x1, y1, x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2],
}));
jest.mock('./FloorPlan3D', () => ({ __esModule: true, default: () => <div data-testid="floor-3d" /> }));
jest.mock('./MapControls', () => ({ __esModule: true, default: () => null }));
jest.mock('../devices/DeviceConnectionHistoryPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('../../service/campusService', () => ({ getCampusMap: jest.fn() }));
jest.mock('../../service/sysAdminServices', () => ({ getZones: jest.fn(), getRooms: jest.fn(), getDevices: jest.fn() }));

const zones = [
    { id: 'z1', zone_code: 'A1-G-LOBBY', zone_name: 'Sảnh chính A1', zone_type: 'lobby', building: 'KTL.A1', floor: 'G' },
    { id: 'z3', zone_code: 'A1-1-CORR', zone_name: 'Hành lang lầu 1', zone_type: 'corridor', building: 'KTL.A1', floor: '1' },
    { id: 'z4', zone_code: 'B1-SERVER', zone_name: 'Phòng quản lý mạng', zone_type: 'room', building: 'B1', floor: 'G' },
    { id: 'g1', zone_code: 'GATE_MAIN', zone_name: 'Cong chinh', zone_type: 'gate', building: 'Campus', floor: 'G' },
];
const rooms = [
    { roomId: 'r1', roomCode: 'A1.101', roomName: 'Phòng họp lớn', siteName: 'KTL.A1', areaName: 'Tầng 1', capacity: 30 },
    { roomId: 'r5', roomCode: 'RM-A102', roomName: 'Phong A102', siteName: 'Toa nha A', areaName: 'Tang 1' },
];
const dev = (id, code, type, status, extra = {}) => ({ id, device_code: code, device_name: code, device_type: type, status, metadata_json: {}, ...extra });
const devices = [
    dev('d1', 'A1-G-AI-01', 'ip_camera', 'online'),
    dev('d4', 'A1-1-AI-01', 'ip_camera', 'offline'),
    dev('d6', 'A1-ROOM-101', 'room_camera', 'online', { room_id: 'r1' }),
    dev('d9', 'B1-SEC-01', 'ip_camera', 'online', { metadata_json: { provider: 'ivss' } }),
    dev('d10', 'GATE1-IN-01', 'anpr_camera', 'online'),
    dev('d13', 'IOT-ROOMCAM-A102', 'room_camera', 'online', { room_id: 'r5' }),
    dev('s1', 'SENSOR-01', 'temperature_sensor', 'online'),
];
const mz = (zoneId, ids, open = 0) => ({ zoneId, cameras: ids.map((deviceId) => ({ deviceId })), alerts: { open, total: open, latest: [] } });
const mapZones = [mz('z1', ['d1']), mz('z3', ['d4']), mz('z4', ['d9'], 1), mz('g1', ['d10'])];

describe('twinData', () => {
    test('matchBuilding nhận nhiều cách viết tên tòa', () => {
        expect(matchBuilding('KTL.A1')).toBe('A1');
        expect(matchBuilding('Tòa nhà B1')).toBe('B1');
        expect(matchBuilding('Hội trường')).toBe('A2');
        expect(matchBuilding('Toa nha A')).toBeNull();
    });

    test('matchGate theo mã/tên zone cổng', () => {
        expect(matchGate(zones[3])).toBe('G1');
        expect(matchGate({ zone_code: 'X', zone_name: 'Cổng phụ', zone_type: 'gate' })).toBe('G4');
    });

    test('floorOrder: hầm < trệt < lầu', () => {
        expect(floorOrder('B')).toBeLessThan(floorOrder('G'));
        expect(floorOrder('G')).toBe(0);
        expect(floorOrder('3')).toBe(3);
    });

    test('cameraKind: ANPR / IVSS là camera an ninh', () => {
        expect(cameraKind(devices[3])).toBe('sec');
        expect(cameraKind(devices[4])).toBe('sec');
        expect(cameraKind(devices[0])).toBe('ai');
    });

    test('buildTwin: thống kê, cảnh báo và vị trí lấy từ dữ liệu', () => {
        const t = buildTwin({ zones, rooms, devices, mapZones });
        expect(t.stats).toEqual({ total: 6, ai: 4, offline: 1, alert: 1 });
        expect(t.stateById.d9).toBe('alert');
        expect(t.location.d6).toMatchObject({ buildingId: 'A1', floorId: '1', roomId: 'r1' });
        expect(t.location.d10).toEqual({ gateId: 'G1' });
        expect(t.buildings.A1.floorList.map((f) => f.id)).toEqual(['G', '1']);
        expect(t.unplacedCameras.map((c) => c.id)).toEqual(['d13']);
    });
});

describe('CameraTwin page', () => {
    beforeEach(() => {
        getZones.mockResolvedValue({ data: zones });
        getRooms.mockResolvedValue({ data: rooms });
        getDevices.mockResolvedValue({ data: devices });
        getCampusMap.mockResolvedValue({ data: { zones: mapZones } });
    });

    const renderPage = () => render(<MemoryRouter><CameraTwin /></MemoryRouter>);
    const stat = (label) => within(screen.getByTestId('twin-stats')).getByText(label).previousSibling.textContent;

    test('thẻ thống kê tính từ dữ liệu API', async () => {
        renderPage();
        expect(await screen.findByTestId('campus-3d')).toBeInTheDocument();
        expect(stat('Tổng camera')).toBe('6');
        expect(stat('Đang có cảnh báo')).toBe('1');
    });

    test('chọn tòa → mở mặt bằng → đổi tầng → chọn camera', async () => {
        renderPage();
        await screen.findByTestId('campus-3d');
        fireEvent.click(screen.getByRole('button', { name: /KTL\.A1/ }));
        fireEvent.click(screen.getByRole('button', { name: /Xem mặt bằng tầng/ }));
        expect(screen.getByTestId('floor-3d')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Lầu 1/ }));
        expect(screen.getByRole('tab', { name: /Lầu 1/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('button', { name: /A1-1-AI-01/ }));
        expect(screen.getByRole('button', { name: 'Đóng chi tiết camera' })).toBeInTheDocument();
    });

    test('tìm mã camera mở đúng tòa/tầng', async () => {
        renderPage();
        await screen.findByTestId('campus-3d');
        fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'B1-SEC' } });
        fireEvent.click(screen.getByRole('button', { name: /B1-SEC-01/ }));
        expect(screen.getByTestId('floor-3d')).toBeInTheDocument();
        expect(screen.getByText('Phòng quản lý mạng', { selector: 'span' })).toBeInTheDocument();
    });

    test('API lỗi: hiện thông báo và nút thử lại', async () => {
        getZones.mockRejectedValue(new Error('boom'));
        renderPage();
        expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeInTheDocument();
    });
});
