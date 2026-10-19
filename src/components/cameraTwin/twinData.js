// Ghép dữ liệu thật (zone, phòng, thiết bị, campus map) vào hình khối khuôn viên tĩnh (campusModel).
// Hàm thuần — không gọi API — để test được.
import { CAMERA_TYPES } from "../../mocks/cameraMock";
import { BUILDINGS, GATES, UNPLACED_BUILDINGS } from "./campusModel";

/** Bỏ dấu, viết hoa, gọn khoảng trắng: "Tòa KTL.A1" → "TOA KTL.A1". */
export const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "D")
    .toUpperCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

const ALL_BUILDINGS = [...BUILDINGS, ...UNPLACED_BUILDINGS];

/** Tên tòa trong DB (zone.building / room.siteName) → id tòa trên sơ đồ, hoặc null. */
export const matchBuilding = (raw) => {
  const n = norm(raw).replace(/^(TOA NHA|TOA|KHOI|NHA)\s+/, "");
  if (!n) return null;
  const compact = n.replace(/[\s.]/g, "");
  const hit = ALL_BUILDINGS.find((b) =>
    b.match.some((m) => {
      const mc = norm(m).replace(/[\s.]/g, "");
      return compact === mc || new RegExp(`(^|[^A-Z0-9])${mc}($|[^A-Z0-9])`).test(n.replace(/\./g, " "));
    }),
  );
  return hit ? hit.id : null;
};

/** Zone cổng → id cổng trên sơ đồ, hoặc null. */
export const matchGate = (zone) => {
  const keys = [norm(zone.zone_code || zone.zoneCode), norm(zone.zone_name || zone.zoneName)];
  const g = GATES.find((gt) => gt.match.some((m) => keys.some((k) => k === norm(m) || k.includes(norm(m)))));
  return g ? g.id : null;
};

/** Camera AI (HGVision: nhận diện) hay camera an ninh (IVSS / biển số). */
export const cameraKind = (device) => {
  const provider = norm(device.metadata_json?.provider || device.metadata_json?.source);
  if (device.device_type === "anpr_camera" || provider.includes("IVSS")) return "sec";
  return "ai";
};

/** online | offline | alert — "alert" khi zone chứa camera có cảnh báo chưa xử lý. */
export const cameraState = (device, alertDeviceIds) => {
  if (alertDeviceIds.has(device.id)) return "alert";
  return device.status === "online" ? "online" : "offline";
};

/** Chỉ số tầng để sắp xếp: hầm < trệt/G < 1 < 2 … */
export const floorOrder = (f) => {
  const n = norm(f);
  if (/HAM|^B\d?$/.test(n)) return -1;
  if (/TRET|^G$|^0$/.test(n)) return 0;
  const d = n.match(/\d+/);
  return d ? Number(d[0]) : 99;
};

export const floorLabel = (f) => {
  const o = floorOrder(f);
  if (o === -1) return "Tầng hầm";
  if (o === 0) return "Tầng trệt";
  if (o === 99) return String(f);
  return `Lầu ${o}`;
};

const roomFloor = (r) => (r.areaName || "").replace(/^t[aầ]ng\s*/i, "").trim() || null;

/**
 * @param zones   GET /zones (snake_case)
 * @param rooms   GET /rooms/search (camelCase)
 * @param devices GET /iot-devices
 * @param mapZones GET /campus-dashboard/campus-map → data.zones
 */
export const buildTwin = ({ zones = [], rooms = [], devices = [], mapZones = [] }) => {
  const cameras = devices.filter((d) => CAMERA_TYPES.includes(d.device_type));
  const zoneCameras = {};
  const alertDeviceIds = new Set();
  const zoneAlerts = {};
  mapZones.forEach((z) => {
    zoneCameras[z.zoneId] = (z.cameras || []).map((c) => c.deviceId);
    zoneAlerts[z.zoneId] = z.alerts || { open: 0, total: 0, latest: [] };
    if (z.alerts?.open > 0) zoneCameras[z.zoneId].forEach((id) => alertDeviceIds.add(id));
  });

  const buildings = Object.fromEntries(
    ALL_BUILDINGS.map((b) => [b.id, { ...b, floors: b.floors, floorMap: {}, cameraIds: new Set() }]),
  );
  const gates = Object.fromEntries(GATES.map((g) => [g.id, { ...g, zones: [], cameraIds: new Set() }]));
  const placedIds = new Set();
  // deviceId → { buildingId, floorId } | { gateId } — để tìm kiếm / mở đúng tầng.
  const location = {};
  const unmatchedZones = [];
  const unmatchedRooms = [];

  const floorOf = (bid, floor, key) => {
    const fm = buildings[bid].floorMap;
    const id = String(floor);
    if (!fm[id]) fm[id] = { id, label: floorLabel(floor), order: floorOrder(floor), key, zones: [], rooms: [], cameraIds: new Set() };
    if (key && !fm[id].key) fm[id].key = key;
    return fm[id];
  };

  zones.forEach((z) => {
    if (z.zone_type === "gate") {
      const gid = matchGate(z);
      if (gid) {
        gates[gid].zones.push(z);
        (zoneCameras[z.id] || []).forEach((id) => {
          gates[gid].cameraIds.add(id);
          placedIds.add(id);
          location[id] = { gateId: gid };
        });
        return;
      }
    }
    const bid = matchBuilding(z.building);
    if (!bid || !z.floor) { unmatchedZones.push(z); return; }
    const zf = floorOf(bid, z.floor, `${z.building} - Tầng ${z.floor}`);
    zf.zones.push(z);
    (zoneCameras[z.id] || []).forEach((id) => {
      zf.cameraIds.add(id);
      buildings[bid].cameraIds.add(id);
      placedIds.add(id);
      location[id] = { buildingId: bid, floorId: String(z.floor) };
    });
  });

  rooms.forEach((r) => {
    const bid = matchBuilding(r.siteName) || matchBuilding(r.roomCode);
    const fl = roomFloor(r);
    if (!bid || !fl) { unmatchedRooms.push(r); return; }
    const rf = floorOf(bid, fl, null);
    rf.rooms.push(r);
    cameras.filter((d) => d.room_id === r.roomId).forEach((d) => {
      rf.cameraIds.add(d.id);
      buildings[bid].cameraIds.add(d.id);
      placedIds.add(d.id);
      location[d.id] = { buildingId: bid, floorId: fl, roomId: r.roomId };
    });
  });

  Object.values(buildings).forEach((b) => {
    Object.values(b.floorMap).forEach((f) => {
      // Khoá layout: dùng đúng floor_key của trang 2D để vị trí camera đã lưu dùng chung.
      if (!f.key) f.key = `${b.id} - Tầng ${f.id}`;
    });
    b.floorList = Object.values(b.floorMap).sort((x, y) => x.order - y.order);
  });

  const stateById = Object.fromEntries(cameras.map((d) => [d.id, cameraState(d, alertDeviceIds)]));
  const summarize = (ids) => {
    const list = [...ids].filter((id) => id in stateById);
    return {
      total: list.length,
      ai: list.filter((id) => cameraKind(cameras.find((c) => c.id === id)) === "ai").length,
      offline: list.filter((id) => stateById[id] === "offline").length,
      alert: list.filter((id) => stateById[id] === "alert").length,
    };
  };

  return {
    cameras,
    stateById,
    location,
    zoneCameras,
    zoneAlerts,
    buildings,
    gates,
    unplacedCameras: cameras.filter((d) => !placedIds.has(d.id)),
    unmatchedZones,
    unmatchedRooms,
    summarize,
    stats: summarize(new Set(cameras.map((d) => d.id))),
  };
};
