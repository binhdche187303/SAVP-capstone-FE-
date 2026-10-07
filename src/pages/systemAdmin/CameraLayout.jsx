import { Activity, LayoutGrid, Move, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DeviceConnectionHistoryPanel from "../../components/devices/DeviceConnectionHistoryPanel";
import { CAMERA_TYPES, defaultAngle } from "../../mocks/cameraMock";
import { getCampusMap } from "../../service/campusService";
import {
  getDevices,
  getRooms,
  getZones,
  saveCameraLayout,
} from "../../service/sysAdminServices";

// 2.2.4 Sơ đồ lắp đặt camera theo tầng.
// Thật (BE): zone (building/floor), phòng (areaName), camera theo zone (campus map), trạng thái camera.
// Vị trí + hướng camera lưu BE (PUT /iot-devices/layout → metadata_json.layout theo floor_key).
// Mặt bằng do FE tự vẽ từ danh sách zone/phòng (chưa có ảnh mặt bằng).

const W = 1000;
const PAD = 40;
const GAP = 30;
const BAND_H = { rooms: 170, corridors: 90, others: 170 };

const STATUS_COLOR = {
  online: "#22c55e",
  offline: "#ef4444",
  maintenance: "#f59e0b",
  disabled: "#94a3b8",
};
const STATUS_LABEL = {
  online: "Online",
  offline: "Offline",
  maintenance: "Bảo trì",
  disabled: "Vô hiệu",
};
const TYPE_LABEL = {
  ip_camera: "Camera AI",
  door_camera: "Camera vào/ra",
  room_camera: "Camera phòng",
  anpr_camera: "Camera biển số",
};

const BLOCK_STYLE = {
  room: { fill: "#eef2ff", stroke: "#a5b4fc" },
  corridor: { fill: "#f1f5f9", stroke: "#cbd5e1" },
  lobby: { fill: "#eff6ff", stroke: "#93c5fd" },
  gate: { fill: "#fffbeb", stroke: "#fcd34d" },
  parking: { fill: "#f3f4f6", stroke: "#9ca3af" },
  restricted: { fill: "#fef2f2", stroke: "#fca5a5" },
};

const zoneFloorKey = (z) =>
  z.building && z.floor ? `${z.building} - Tầng ${z.floor}` : null;

const isRestricted = (z) =>
  /SERVER|RESTRICT/i.test(z.zone_code) || /hạn chế/i.test(z.zone_name);

/** Chia 1 dải ngang thành n khối bằng nhau. */
const rowBlocks = (items, y, h) => {
  const n = items.length;
  const w = (W - PAD * 2 - (n - 1) * 20) / n;
  return items.map((it, i) => ({ ...it, x: PAD + i * (w + 20), y, w, h }));
};

/** Dựng mặt bằng 1 tầng: phòng (trên) — hành lang (giữa) — sảnh/cổng/bãi xe (dưới). */
const buildPlan = (zones, rooms) => {
  const bands = [
    [
      "rooms",
      rooms.map((r) => ({
        key: r.roomId,
        kind: "room",
        label: r.roomName,
        sub: r.roomCode,
        roomId: r.roomId,
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

/** Hình quạt góc nhìn 60°, bán kính r, hướng angle (độ). */
const fovPath = (angle, r = 80, spread = 30) => {
  const rad = (d) => (d * Math.PI) / 180;
  const a1 = rad(angle - spread);
  const a2 = rad(angle + spread);
  return `M0,0 L${r * Math.cos(a1)},${r * Math.sin(a1)} A${r},${r} 0 0,1 ${r * Math.cos(a2)},${r * Math.sin(a2)} Z`;
};

const CameraLayout = () => {
  const [zones, setZones] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [zoneCameras, setZoneCameras] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [floor, setFloor] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState({});
  const [dirty, setDirty] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historyDevice, setHistoryDevice] = useState(null);
  const svgRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [zRes, rRes, dRes, mRes] = await Promise.all([
        getZones({ limit: 200 }),
        getRooms({ limit: 200 }),
        getDevices({ limit: 100 }),
        getCampusMap(),
      ]);
      const list = (res) =>
        Array.isArray(res?.data) ? res.data : res?.data?.items || [];
      setZones(list(zRes).filter((z) => z.status !== "inactive"));
      setRooms(list(rRes));
      setDevices(list(dRes));
      const byZone = {};
      (mRes?.data?.zones || []).forEach((z) => {
        byZone[z.zoneId] = (z.cameras || []).map((c) => c.deviceId);
      });
      setZoneCameras(byZone);
    } catch (err) {
      setError(
        err?.error?.message || err?.message || "Không tải được dữ liệu sơ đồ.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deviceById = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d])),
    [devices],
  );

  // Danh sách tầng: từ zone (Tòa + tầng) và phòng (areaName cùng dạng "Tòa A - Tầng 1").
  const floors = useMemo(() => {
    const map = new Map();
    const ensure = (key) => {
      if (!map.has(key)) map.set(key, { key, zones: [], rooms: [] });
      return map.get(key);
    };
    zones.forEach((z) => {
      const key = zoneFloorKey(z);
      if (key) ensure(key).zones.push(z);
    });
    rooms.forEach((r) => {
      if (r.areaName && map.has(r.areaName)) ensure(r.areaName).rooms.push(r);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key, "vi"));
  }, [zones, rooms]);

  const current = floors.find((f) => f.key === floor) || floors[0];

  // Vị trí đã lưu của tầng hiện tại (metadata_json.layout của từng camera).
  const savedPositions = useMemo(() => {
    if (!current) return {};
    const out = {};
    devices.forEach((d) => {
      const l = d.metadata_json?.layout;
      if (l && l.floor_key === current.key)
        out[d.id] = { x: l.x, y: l.y, angle: l.angle };
    });
    return out;
  }, [devices, current]);

  useEffect(() => {
    setPositions(savedPositions);
    setDirty(false);
  }, [savedPositions]);

  useEffect(() => {
    setSelectedId(null);
  }, [current]);

  // Ghi lại layout vào danh sách thiết bị cục bộ sau khi BE lưu thành công.
  const applyLayout = (layoutById) =>
    setDevices((list) =>
      list.map((d) => {
        if (!(d.id in layoutById)) return d;
        const meta = { ...(d.metadata_json || {}) };
        if (layoutById[d.id]) meta.layout = layoutById[d.id];
        else delete meta.layout;
        return { ...d, metadata_json: meta };
      }),
    );

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await saveCameraLayout({
        floor_key: current.key,
        reset: true,
      });
      if (!res?.success) throw new Error(res?.error?.message || res?.message);
      applyLayout(
        Object.fromEntries(Object.keys(savedPositions).map((id) => [id, null])),
      );
    } catch (err) {
      setError(
        err?.error?.message || err?.message || "Không thể đặt lại vị trí.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const list = Object.entries(positions).map(([id, p]) => ({
        device_id: id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        angle: ((Math.round(p.angle) % 360) + 360) % 360,
      }));
      const res = await saveCameraLayout({
        floor_key: current.key,
        positions: list,
      });
      if (!res?.success) throw new Error(res?.error?.message || res?.message);
      applyLayout(
        Object.fromEntries(
          list.map((p) => [
            p.device_id,
            { floor_key: current.key, x: p.x, y: p.y, angle: p.angle },
          ]),
        ),
      );
      setEditMode(false);
    } catch (err) {
      setError(err?.error?.message || err?.message || "Không thể lưu vị trí.");
    } finally {
      setSaving(false);
    }
  };

  const plan = useMemo(
    () =>
      current
        ? buildPlan(current.zones, current.rooms)
        : { blocks: [], height: 300 },
    [current],
  );

  // Camera của tầng: camera theo zone (campus map) + camera gán phòng (room_id).
  const placed = useMemo(() => {
    const out = [];
    plan.blocks.forEach((b) => {
      const ids = b.zoneId
        ? zoneCameras[b.zoneId] || []
        : devices
            .filter(
              (d) =>
                d.room_id === b.roomId && CAMERA_TYPES.includes(d.device_type),
            )
            .map((d) => d.id);
      ids.forEach((id, i) => {
        const device = deviceById[id];
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
  }, [plan, zoneCameras, devices, deviceById, positions]);

  const toSvg = (e) => {
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
    return {
      x: Math.round(Math.min(W, Math.max(0, p.x))),
      y: Math.round(Math.min(plan.height, Math.max(0, p.y))),
    };
  };

  const updatePos = (id, patch) => {
    const cam = placed.find((c) => c.device.id === id);
    setPositions((p) => ({
      ...p,
      [id]: { x: cam.x, y: cam.y, angle: cam.angle, ...p[id], ...patch },
    }));
    setDirty(true);
  };

  const selected = placed.find((c) => c.device.id === selectedId);
  const floorStats = (f) => {
    const ids = new Set();
    f.zones.forEach((z) =>
      (zoneCameras[z.id] || []).forEach((id) => ids.add(id)),
    );
    f.rooms.forEach((r) =>
      devices
        .filter(
          (d) => d.room_id === r.roomId && CAMERA_TYPES.includes(d.device_type),
        )
        .forEach((d) => ids.add(d.id)),
    );
    const cams = [...ids].map((id) => deviceById[id]).filter(Boolean);
    return {
      total: cams.length,
      offline: cams.filter((d) => d.status === "offline").length,
    };
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
            <LayoutGrid className="w-3.5 h-3.5" /> Camera AI
          </span>
          <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">
            Sơ đồ lắp đặt camera
          </h1>
          <p className="text-slate-blue text-sm mt-1">
            Vị trí, hướng nhìn và trạng thái camera theo từng tầng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={handleReset}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-blue border border-platinum-tint hover:bg-cloud-mist"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Về mặc định
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-action-blue hover:bg-glacier-blue disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> Lưu vị trí{dirty ? " *" : ""}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              disabled={!current}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-action-blue border border-action-blue/30 hover:bg-blue-50 disabled:opacity-50"
            >
              <Move className="w-3.5 h-3.5" /> Chỉnh vị trí
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20 bg-white rounded-2xl border border-platinum-tint">
          <div className="w-8 h-8 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
        </div>
      ) : floors.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-platinum-tint text-sm text-steel-gray">
          Chưa có khu vực nào khai báo Tòa nhà + Tầng.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4">
          <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-2 h-fit">
            <p className="px-2 py-1.5 text-[11px] font-bold uppercase text-slate-blue">
              Tầng
            </p>
            {floors.map((f) => {
              const s = floorStats(f);
              const active = f.key === current.key;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setFloor(f.key);
                    setEditMode(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-sm ${active ? "bg-blue-50 text-action-blue font-bold" : "text-midnight-indigo hover:bg-cloud-mist"}`}
                >
                  <span className="truncate">{f.key}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] text-slate-blue tabular-nums">
                      {s.total}
                    </span>
                    {s.offline > 0 && (
                      <span className="px-1.5 rounded bg-red-100 text-red-600 text-[10px] font-bold">
                        {s.offline}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-3">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${plan.height}`}
              className={`w-full h-auto select-none ${editMode ? "cursor-crosshair" : ""}`}
              onPointerMove={(e) => dragId && updatePos(dragId, toSvg(e))}
              onPointerUp={() => setDragId(null)}
              onPointerLeave={() => setDragId(null)}
            >
              <rect
                x={1}
                y={1}
                width={W - 2}
                height={plan.height - 2}
                rx={16}
                fill="#fff"
                stroke="#e2e8f0"
                strokeWidth={2}
              />
              {plan.blocks.map((b) => {
                const st = BLOCK_STYLE[b.kind];
                return (
                  <g key={b.key}>
                    <rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={10}
                      fill={st.fill}
                      stroke={st.stroke}
                      strokeWidth={2}
                    />
                    <text
                      x={b.x + 10}
                      y={b.y + b.h - 24}
                      fontSize={13}
                      fontWeight={700}
                      fill="#1e1b4b"
                    >
                      {b.label}
                    </text>
                    <text
                      x={b.x + 10}
                      y={b.y + b.h - 9}
                      fontSize={10}
                      fill="#64748b"
                      fontFamily="monospace"
                    >
                      {b.sub}
                    </text>
                  </g>
                );
              })}
              {placed.map((c) => {
                const color =
                  STATUS_COLOR[c.device.status] || STATUS_COLOR.disabled;
                const isSel = c.device.id === selectedId;
                return (
                  <g
                    key={c.device.id}
                    transform={`translate(${c.x},${c.y})`}
                    className={editMode ? "cursor-move" : "cursor-pointer"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(c.device.id);
                      if (editMode) setDragId(c.device.id);
                    }}
                  >
                    <path
                      d={fovPath(c.angle)}
                      fill={color}
                      fillOpacity={isSel ? 0.28 : 0.14}
                      stroke={color}
                      strokeOpacity={0.4}
                    />
                    {c.device.status === "offline" && (
                      <circle r={16} fill="none" stroke={color} strokeWidth={2}>
                        <animate
                          attributeName="r"
                          values="12;20;12"
                          dur="1.6s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="stroke-opacity"
                          values="0.8;0;0.8"
                          dur="1.6s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                    <circle
                      r={11}
                      fill={color}
                      stroke={
                        c.device.device_type === "anpr_camera"
                          ? "#ea580c"
                          : isSel
                            ? "#1e1b4b"
                            : "#fff"
                      }
                      strokeWidth={3}
                    />
                    <circle r={4} fill="#fff" />
                    {(isSel || editMode) && (
                      <text
                        y={-17}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#1e1b4b"
                        stroke="#fff"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {c.device.device_code.replace("DEMO-", "")}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap gap-4 px-2 pt-2 text-[11px] text-slate-blue">
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: STATUS_COLOR[k] }}
                  />{" "}
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-600" />{" "}
                Camera biển số
              </span>
              <span className="ml-auto text-steel-gray">
                {editMode
                  ? "Kéo camera để đổi vị trí, chỉnh hướng ở khung bên phải."
                  : "Bấm vào camera để xem chi tiết."}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-4 h-fit">
            {!selected ? (
              <p className="text-xs text-steel-gray">
                {placed.length} camera trên tầng này. Chọn 1 camera trên sơ đồ
                để xem trạng thái.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-blue">
                    {TYPE_LABEL[selected.device.device_type] ||
                      selected.device.device_type}
                  </p>
                  <p className="text-sm font-bold text-midnight-indigo">
                    {selected.device.device_name}
                  </p>
                  <p className="text-[10px] font-mono text-steel-gray">
                    {selected.device.device_code}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-cloud-mist rounded-lg p-2">
                    <p className="text-[10px] text-slate-blue">Trạng thái</p>
                    <p
                      className="font-bold"
                      style={{ color: STATUS_COLOR[selected.device.status] }}
                    >
                      {STATUS_LABEL[selected.device.status] ||
                        selected.device.status}
                    </p>
                  </div>
                  <div className="bg-cloud-mist rounded-lg p-2">
                    <p className="text-[10px] text-slate-blue">Vị trí</p>
                    <p className="font-bold text-midnight-indigo truncate">
                      {selected.block.label}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-blue">
                  IP:{" "}
                  <span className="font-mono text-midnight-indigo">
                    {selected.device.ip_address || "—"}
                  </span>
                </p>
                {editMode && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-midnight-indigo">
                        Hướng nhìn
                      </label>
                      <span className="text-xs font-bold text-action-blue tabular-nums">
                        {selected.angle}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={355}
                      step={5}
                      value={selected.angle}
                      onChange={(e) =>
                        updatePos(selected.device.id, {
                          angle: Number(e.target.value),
                        })
                      }
                      className="w-full accent-action-blue"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setHistoryDevice(selected.device)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-action-blue border border-action-blue/30 hover:bg-blue-50"
                  >
                    <Activity className="w-3.5 h-3.5" /> Lịch sử kết nối
                  </button>
                  <Link
                    to="/system-admin/devices"
                    className="text-center px-3 py-2 rounded-xl text-xs font-semibold text-slate-blue hover:bg-cloud-mist"
                  >
                    Mở trang thiết bị
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {historyDevice && (
        <DeviceConnectionHistoryPanel
          device={historyDevice}
          onClose={() => setHistoryDevice(null)}
        />
      )}
    </div>
  );
};

export default CameraLayout;
