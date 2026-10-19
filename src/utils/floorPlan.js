// Mặt bằng tầng do FE tự dựng từ danh sách zone/phòng (chưa có ảnh/CAD mặt bằng).
// Dùng chung cho sơ đồ 2D (CameraLayout) và mặt bằng 3D (CameraTwin) để 2 màn luôn cùng hình học.
import { CAMERA_TYPES, defaultAngle } from "../mocks/cameraMock";

export const PLAN_W = 1000;
const PAD = 40;
const GAP = 30;
const BAND_H = { rooms: 170, corridors: 90, others: 170 };

export const BLOCK_STYLE = {
  room: { fill: "#eef2ff", stroke: "#a5b4fc" },
  corridor: { fill: "#f1f5f9", stroke: "#cbd5e1" },
  lobby: { fill: "#eff6ff", stroke: "#93c5fd" },
  gate: { fill: "#fffbeb", stroke: "#fcd34d" },
  parking: { fill: "#f3f4f6", stroke: "#9ca3af" },
  restricted: { fill: "#fef2f2", stroke: "#fca5a5" },
};

export const zoneFloorKey = (z) =>
  z.building && z.floor ? `${z.building} - Tầng ${z.floor}` : null;

export const isRestricted = (z) =>
  /SERVER|RESTRICT/i.test(z.zone_code) || /hạn chế/i.test(z.zone_name);

/** Chia 1 dải ngang thành n khối bằng nhau. */
const rowBlocks = (items, y, h) => {
  const n = items.length;
  const w = (PLAN_W - PAD * 2 - (n - 1) * 20) / n;
  return items.map((it, i) => ({ ...it, x: PAD + i * (w + 20), y, w, h }));
};

/** Dựng mặt bằng 1 tầng: phòng (trên) — hành lang (giữa) — sảnh/cổng/bãi xe (dưới). */
export const buildPlan = (zones, rooms) => {
  const bands = [
    [
      "rooms",
      rooms.map((r) => ({
        key: r.roomId,
        kind: "room",
        label: r.roomName,
        sub: r.roomCode,
        roomId: r.roomId,
        capacity: r.capacity,
      })),
    ],
    [
      "corridors",
      zones
        .filter((z) => z.zone_type === "corridor" && !isRestricted(z))
        .map((z) => ({
          key: z.id,
          kind: "corridor",
          label: z.zone_name,
          sub: z.zone_code,
          zoneId: z.id,
        })),
    ],
    [
      "others",
      zones
        .filter((z) => z.zone_type !== "corridor" || isRestricted(z))
        .map((z) => ({
          key: z.id,
          kind: isRestricted(z)
            ? "restricted"
            : BLOCK_STYLE[z.zone_type]
              ? z.zone_type
              : "lobby",
          label: z.zone_name,
          sub: z.zone_code,
          zoneId: z.id,
        })),
    ],
  ].filter(([, items]) => items.length > 0);

  let y = PAD;
  const blocks = [];
  bands.forEach(([band, items]) => {
    blocks.push(...rowBlocks(items, y, BAND_H[band]));
    y += BAND_H[band] + GAP;
  });
  return { blocks, height: Math.max(y - GAP + PAD, 300) };
};

/**
 * Camera của tầng: camera theo zone (campus map) + camera gán phòng (room_id).
 * Vị trí mặc định rải đều trong khối; `positions` (metadata_json.layout hoặc bản đang kéo) ghi đè.
 */
export const placeCameras = (plan, zoneCameras, devices, positions = {}) => {
  const byId = Object.fromEntries(devices.map((d) => [d.id, d]));
  const out = [];
  plan.blocks.forEach((b) => {
    const ids = b.zoneId
      ? zoneCameras[b.zoneId] || []
      : devices
          .filter(
            (d) => d.room_id === b.roomId && CAMERA_TYPES.includes(d.device_type),
          )
          .map((d) => d.id);
    ids.forEach((id, i) => {
      const device = byId[id];
      if (!device) return;
      const def = {
        x: b.x + (b.w * (i + 1)) / (ids.length + 1),
        y: b.kind === "room" ? b.y + 26 : b.y + b.h / 2,
        angle: b.kind === "room" ? 90 : defaultAngle(id),
      };
      out.push({ device, block: b, ...def, ...positions[id] });
    });
  });
  return out;
};

/** Vị trí đã lưu (metadata_json.layout) của các camera thuộc floorKey. */
export const savedLayout = (devices, floorKey) => {
  const out = {};
  devices.forEach((d) => {
    const l = d.metadata_json?.layout;
    if (l && l.floor_key === floorKey) out[d.id] = { x: l.x, y: l.y, angle: l.angle };
  });
  return out;
};
