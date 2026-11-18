import { groupZones } from './zoneGroups';

test('gom khu vực theo tòa nhà → tầng, khu thiếu vị trí xếp cuối', () => {
    const groups = groupZones([
        { id: '1', zone_name: 'Phòng IT', building: 'Campus - G', floor: 'Tầng 1' },
        { id: '2', zone_name: 'Cong chinh', building: 'Campus', floor: null },
        { id: '3', zone_name: 'Thang máy', building: 'Campus - G', floor: 'Tầng 1' },
        { id: '4', zone_name: 'Kho', building: null, floor: '2' },
        { id: '5', zone_name: 'A10', building: 'Campus - G', floor: '10' },
        { id: '6', zone_name: 'A2', building: 'Campus - G', floor: '2' },
    ]);
    expect(groups.map(g => [g.label, g.count])).toEqual([['Campus', 1], ['Campus - G', 4], ['Chưa có tòa nhà', 1]]);
    const g = groups[1];
    expect(g.floors.map(f => f.label)).toEqual(['Tầng 1', 'Tầng 2', 'Tầng 10']);
    expect(g.floors[0].zones.map(z => z.zone_name)).toEqual(['Phòng IT', 'Thang máy']);
    expect(groups[0].floors[0].label).toBe('Chưa có tầng');
    expect(groups[2].floors[0].label).toBe('Tầng 2');
});

test('gợi ý tòa nhà/tầng: không trùng, sắp theo số, tầng lọc theo tòa nhà đang nhập', () => {
    const { zoneLocationOptions } = require('./zoneGroups');
    const zones = [
        { building: 'Campus - G', floor: 'Tầng 1' }, { building: 'Campus - G', floor: 'Tầng 10' },
        { building: 'Campus - G', floor: 'Tầng 2' }, { building: 'Campus', floor: 'G' },
        { building: ' Campus ', floor: null }, { building: null, floor: 'Hầm' },
    ];
    expect(zoneLocationOptions(zones).buildings).toEqual(['Campus', 'Campus - G']);
    expect(zoneLocationOptions(zones, 'campus - g').floors).toEqual(['Tầng 1', 'Tầng 2', 'Tầng 10']);
    expect(zoneLocationOptions(zones, 'Tòa mới').floors).toEqual(['G', 'Hầm', 'Tầng 1', 'Tầng 2', 'Tầng 10']);
});
