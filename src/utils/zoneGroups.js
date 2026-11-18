/** Gom khu vực theo Tòa nhà → Tầng (hàng trăm khu vẫn dễ tìm). */
const NO_BUILDING = 'Chưa có tòa nhà';
const NO_FLOOR = 'Chưa có tầng';
const floorLabel = (f) => (!f ? NO_FLOOR : /^t[ầa]ng\b/i.test(f) ? f : `Tầng ${f}`);
export const groupZones = (zones = []) => {
    const byB = new Map();
    for (const z of zones) {
        const b = z.building || NO_BUILDING;
        const fl = floorLabel(z.floor);
        if (!byB.has(b)) byB.set(b, new Map());
        const floors = byB.get(b);
        if (!floors.has(fl)) floors.set(fl, []);
        floors.get(fl).push(z);
    }
    const cmp = (a, b) => (a === NO_BUILDING || a === NO_FLOOR) - (b === NO_BUILDING || b === NO_FLOOR) || a.localeCompare(b, 'vi', { numeric: true });
    return [...byB.keys()].sort(cmp).map((b) => {
        const floors = byB.get(b);
        return {
            key: `b:${b}`, label: b,
            count: [...floors.values()].reduce((n, l) => n + l.length, 0),
            floors: [...floors.keys()].sort(cmp).map((fl) => ({
                key: `f:${b}|${fl}`, label: fl,
                zones: [...floors.get(fl)].sort((x, y) => String(x.zone_name).localeCompare(String(y.zone_name), 'vi', { numeric: true })),
            })),
        };
    });
};

/**
 * Gợi ý cho ô Tòa nhà / Tầng (datalist): giá trị đã dùng ở các khu vực khác, để chọn nhanh và
 * tránh gõ lệch ("Tầng G" vs "G"). Tầng ưu tiên các tầng của đúng tòa nhà đang nhập.
 */
export const zoneLocationOptions = (zones = [], building = '') => {
    const uniq = (values) => [...new Set(values.map(v => (v || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const b = building.trim().toLowerCase();
    const sameBuilding = b ? zones.filter(z => (z.building || '').trim().toLowerCase() === b) : [];
    return {
        buildings: uniq(zones.map(z => z.building)),
        floors: uniq((sameBuilding.length ? sameBuilding : zones).map(z => z.floor)),
    };
};
