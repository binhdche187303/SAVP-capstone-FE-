import { AlertTriangle, Box, Camera, ChevronLeft, Cpu, RefreshCw, Search, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeviceConnectionHistoryPanel from "../../components/devices/DeviceConnectionHistoryPanel";
import BuildingInfoPanel from "../../components/cameraTwin/BuildingInfoPanel";
import CameraDetailPanel from "../../components/cameraTwin/CameraDetailPanel";
import CampusOverview3D, { rectCenter } from "../../components/cameraTwin/CampusOverview3D";
import FloorPlan3D from "../../components/cameraTwin/FloorPlan3D";
import FloorSelector from "../../components/cameraTwin/FloorSelector";
import MapControls from "../../components/cameraTwin/MapControls";
import { FLOOR_HEIGHT_M, toWorld } from "../../components/cameraTwin/campusModel";
import { KIND, STATE } from "../../components/cameraTwin/theme";
import { buildTwin, cameraKind, norm } from "../../components/cameraTwin/twinData";
import { getCampusMap } from "../../service/campusService";
import { getDevices, getRooms, getZones } from "../../service/sysAdminServices";
import { buildPlan, placeCameras, savedLayout } from "../../utils/floorPlan";

// Sơ đồ camera 3D (Campus Digital Twin). Camera, trạng thái, zone, phòng, cảnh báo: dữ liệu thật từ BE.
// Hình khối khuôn viên: cấu hình tĩnh đồ lại từ bản vẽ (campusModel). Mặt bằng tầng: buildPlan như sơ đồ 2D.

const REFRESH_MS = 60000;
const list = (res) => (Array.isArray(res?.data) ? res.data : res?.data?.items || []);

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></div>
    <div>
      <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  </div>
);

const Toggle = ({ on, onClick, color, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-slate-300 bg-white text-slate-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}
  >
    {color && <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "#cbd5e1" }} />}
    {children}
  </button>
);

const CameraTwin = () => {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("campus");
  const [buildingId, setBuildingId] = useState(null);
  const [gateId, setGateId] = useState(null);
  const [floorId, setFloorId] = useState(null);
  const [cameraId, setCameraId] = useState(null);
  const [blockKey, setBlockKey] = useState(null);
  const [layers, setLayers] = useState({ ai: true, sec: true, fov: true, labels: true, furniture: true });
  const [query, setQuery] = useState("");
  const [historyDevice, setHistoryDevice] = useState(null);
  const apiRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [zRes, rRes, dRes, mRes] = await Promise.all([
        getZones({ limit: 100 }),
        getRooms({ limit: 100 }),
        getDevices({ limit: 100 }),
        getCampusMap(),
      ]);
      if (dRes && dRes.success === false) throw new Error(dRes.message || "Không tải được danh sách thiết bị.");
      setRaw({
        zones: list(zRes).filter((z) => z.status !== "inactive"),
        rooms: list(rRes),
        devices: list(dRes),
        mapZones: mRes?.data?.zones || [],
      });
      setError(null);
    } catch (err) {
      setError(err?.error?.message || err?.message || "Không tải được dữ liệu sơ đồ camera.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const twin = useMemo(() => (raw ? buildTwin(raw) : null), [raw]);
  const building = twin && buildingId ? twin.buildings[buildingId] : null;
  const floor = building?.floorList.find((f) => f.id === floorId) || building?.floorList[0] || null;

  const plan = useMemo(() => (floor ? buildPlan(floor.zones, floor.rooms) : null), [floor]);
  const placed = useMemo(
    () => (plan && raw ? placeCameras(plan, twin.zoneCameras, raw.devices, savedLayout(raw.devices, floor.key)) : []),
    [plan, raw, twin, floor],
  );

  const focusBuilding = (id) => {
    const b = twin.buildings[id];
    if (!b?.rect) return;
    const [x, , z] = rectCenter(b.rect);
    apiRef.current?.focus([x, (b.floors * FLOOR_HEIGHT_M) / 2, z], 90 + b.floors * 10);
  };

  const selectBuilding = (id) => {
    setBuildingId(id);
    setGateId(null);
    setCameraId(null);
    focusBuilding(id);
  };

  const selectGate = (id) => {
    setGateId(id);
    setBuildingId(null);
    const [x, z] = toWorld(twin.gates[id].at);
    apiRef.current?.focus([x, 3, z], 55);
  };

  const openBuilding = (id, fid = null) => {
    const b = twin.buildings[id];
    if (!b?.floorList.length) {
      selectBuilding(id);
      return;
    }
    setBuildingId(id);
    setGateId(null);
    setFloorId(fid || b.floorList[0].id);
    setBlockKey(null);
    setView("floor");
  };

  const backToCampus = () => {
    setView("campus");
    setBlockKey(null);
    setCameraId(null);
    setTimeout(() => buildingId && focusBuilding(buildingId), 50);
  };

  const changeFloor = (id) => {
    setFloorId(id);
    setBlockKey(null);
    setCameraId(null);
  };

  const pickCamera = (id) => {
    const loc = twin.location[id];
    setCameraId(id);
    if (loc?.buildingId) {
      openBuilding(loc.buildingId, loc.floorId);
      setCameraId(id);
    } else if (loc?.gateId) {
      setView("campus");
      selectGate(loc.gateId);
    }
  };

  // ---- Tìm kiếm: mã/tên camera, tên/mã phòng, tòa nhà ----
  const results = useMemo(() => {
    const q = norm(query);
    if (!twin || q.length < 2) return [];
    const out = [];
    twin.cameras.forEach((c) => {
      if (norm(`${c.device_code} ${c.device_name}`).includes(q))
        out.push({ key: `c${c.id}`, type: "Camera", label: c.device_code, sub: c.device_name, run: () => pickCamera(c.id) });
    });
    Object.values(twin.buildings).forEach((b) => {
      if (norm(`${b.name} ${b.role}`).includes(q))
        out.push({ key: `b${b.id}`, type: "Tòa nhà", label: b.name, sub: b.role, run: () => {
          if (!b.rect) return;
          setView("campus");
          selectBuilding(b.id);
        } });
      b.floorList.forEach((f) =>
        f.rooms.forEach((r) => {
          if (norm(`${r.roomName} ${r.roomCode}`).includes(q))
            out.push({
              key: `r${r.roomId}`,
              type: "Phòng",
              label: r.roomName,
              sub: `${b.name} · ${f.label}`,
              run: () => {
                openBuilding(b.id, f.id);
                setBlockKey(r.roomId);
              },
            });
        }),
      );
    });
    Object.values(twin.gates).forEach((g) => {
      if (norm(g.name).includes(q))
        out.push({ key: `g${g.id}`, type: "Cổng", label: g.name, sub: g.side, run: () => {
          setView("campus");
          selectGate(g.id);
        } });
    });
    return out.slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, twin]);

  // ---- Chi tiết camera đang chọn ----
  const selectedDevice = twin && cameraId ? twin.cameras.find((c) => c.id === cameraId) : null;
  const selectedPlaced = placed.find((p) => p.device.id === cameraId);
  const where = (() => {
    if (!selectedDevice) return null;
    const loc = twin.location[cameraId];
    if (loc?.gateId) return { place: twin.gates[loc.gateId].name };
    if (loc?.buildingId) {
      const b = twin.buildings[loc.buildingId];
      return {
        place: b.name,
        floor: b.floorMap[loc.floorId]?.label,
        spot: view === "floor" && selectedPlaced ? selectedPlaced.block.label : undefined,
      };
    }
    return null;
  })();
  const block = plan?.blocks.find((b) => b.key === blockKey);
  const blockCameras = block ? placed.filter((p) => p.block.key === block.key) : [];

  const stats = view === "floor" && floor ? twin.summarize(floor.cameraIds) : twin?.stats;
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Tiêu đề + đường dẫn */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#1e3a5f]/10 px-3 py-1 text-[11px] font-bold text-[#1e3a5f]">
            <Box className="h-3.5 w-3.5" /> Campus Digital Twin
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sơ đồ camera 3D</h1>
          <nav className="mt-1 flex items-center gap-1 text-sm text-slate-500" aria-label="breadcrumb">
            <button onClick={backToCampus} className={view === "floor" ? "text-[#1e3a5f] hover:underline" : "font-semibold text-slate-700"}>
              Tổng quan khuôn viên
            </button>
            {view === "floor" && building && (
              <>
                <span>›</span>
                <span className="font-semibold text-slate-700">{building.name} – {floor?.label}</span>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã camera, phòng, tòa nhà…"
              aria-label="Tìm kiếm"
              className="w-72 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[#1e3a5f]"
            />
            {query.trim().length >= 2 && (
              <ul className="absolute right-0 z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {results.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">Không tìm thấy kết quả.</li>}
                {results.map((r) => (
                  <li key={r.key}>
                    <button
                      onClick={() => {
                        r.run();
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                    >
                      <span className="w-14 shrink-0 rounded bg-slate-100 px-1 text-center text-[10px] text-slate-500">{r.type}</span>
                      <span className="truncate font-semibold text-slate-800">{r.label}</span>
                      <span className="ml-auto truncate text-slate-400">{r.sub}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => load()} className="text-xs font-bold underline">Thử lại</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="twin-stats">
          <StatCard icon={Camera} label={view === "floor" ? "Camera trên tầng" : "Tổng camera"} value={stats.total} tone="bg-[#1e3a5f]/10 text-[#1e3a5f]" />
          <StatCard icon={Cpu} label="Camera AI" value={stats.ai} tone="bg-red-50 text-red-600" />
          <StatCard icon={WifiOff} label="Mất tín hiệu" value={stats.offline} tone="bg-slate-100 text-slate-600" />
          <StatCard icon={AlertTriangle} label="Đang có cảnh báo" value={stats.alert} tone="bg-orange-50 text-orange-600" />
        </div>
      )}

      {loading && !twin ? (
        <div className="flex h-[560px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1e3a5f]/20 border-t-[#1e3a5f]" />
        </div>
      ) : !twin ? (
        <div className="flex h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          Không có dữ liệu để dựng sơ đồ.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          {/* Bản đồ */}
          <div className="relative h-[calc(100vh-300px)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
              {view === "floor" && (
                <button
                  onClick={backToCampus}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Khuôn viên
                </button>
              )}
              {view === "floor" && building && (
                <div className="rounded-xl bg-white/95 p-1 shadow-sm">
                  <FloorSelector floors={building.floorList} value={floor?.id} onChange={changeFloor} summarize={twin.summarize} />
                </div>
              )}
              <div className="ml-auto flex flex-wrap gap-1.5 rounded-xl bg-white/90 p-1 shadow-sm">
                <Toggle on={layers.ai} onClick={() => toggle("ai")} color={KIND.ai.color}>Camera AI</Toggle>
                <Toggle on={layers.sec} onClick={() => toggle("sec")} color={KIND.sec.color}>Camera an ninh</Toggle>
                <Toggle on={layers.fov} onClick={() => toggle("fov")}>Vùng quan sát</Toggle>
                {view === "floor" && (
                  <>
                    <Toggle on={layers.labels} onClick={() => toggle("labels")}>Nhãn phòng</Toggle>
                    <Toggle on={layers.furniture} onClick={() => toggle("furniture")}>Nội thất</Toggle>
                  </>
                )}
              </div>
            </div>

            {view === "campus" ? (
              <CampusOverview3D
                twin={twin}
                apiRef={apiRef}
                layers={layers}
                selectedBuildingId={buildingId}
                selectedGateId={gateId}
                selectedCameraId={cameraId}
                onSelectBuilding={selectBuilding}
                onOpenBuilding={openBuilding}
                onSelectGate={selectGate}
                onSelectCamera={setCameraId}
                onClear={() => setCameraId(null)}
              />
            ) : plan && plan.blocks.length ? (
              <FloorPlan3D
                key={floor.key}
                plan={plan}
                placed={placed}
                stateById={twin.stateById}
                layers={layers}
                apiRef={apiRef}
                selectedCameraId={cameraId}
                selectedBlockKey={blockKey}
                onSelectCamera={setCameraId}
                onSelectBlock={setBlockKey}
                onClear={() => {
                  setCameraId(null);
                  setBlockKey(null);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Tầng này chưa có zone/phòng để dựng mặt bằng.</div>
            )}

            <MapControls apiRef={apiRef} />

            {/* Chú giải */}
            <div className="absolute bottom-4 left-4 z-10 max-w-[360px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(KIND).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />{v.label}</span>
                ))}
                {Object.entries(STATE).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: v.color }} />{v.label}</span>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {view === "campus"
                  ? "Mô hình minh hoạ: vị trí theo bản vẽ khuôn viên, số tầng theo quy hoạch; mặt tiền, chiều cao tầng là ước lượng. Bấm tòa để chọn, bấm đúp để xem tầng."
                  : "Hình học phòng dựng tự động từ zone/phòng (giống sơ đồ 2D), chưa phải mặt bằng kiến trúc. Nội thất là minh hoạ."}
              </p>
            </div>
          </div>

          {/* Panel phải */}
          <aside className="max-h-[calc(100vh-300px)] min-h-[560px] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {selectedDevice && (
              <CameraDetailPanel
                device={selectedDevice}
                state={twin.stateById[selectedDevice.id]}
                where={where}
                angle={selectedPlaced?.angle ?? selectedDevice.metadata_json?.layout?.angle}
                onClose={() => setCameraId(null)}
                onHistory={() => setHistoryDevice(selectedDevice)}
              />
            )}

            {view === "campus" ? (
              <BuildingInfoPanel
                twin={twin}
                selectedBuildingId={buildingId}
                selectedGateId={gateId}
                onSelectBuilding={selectBuilding}
                onSelectGate={selectGate}
                onOpenBuilding={openBuilding}
              />
            ) : (
              <>
                {block && (
                  <section className="rounded-xl border border-[#1e3a5f]/20 bg-[#1e3a5f]/[0.04] p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500">{block.kind === "room" ? "Phòng" : "Khu vực"}</p>
                    <h3 className="text-sm font-bold text-slate-900">{block.label}</h3>
                    <p className="font-mono text-[11px] text-slate-500">{block.sub}{block.capacity ? ` · ${block.capacity} chỗ` : ""}</p>
                    <p className="mt-2 text-[11px] font-semibold text-slate-600">Camera liên quan ({blockCameras.length})</p>
                    {blockCameras.length === 0 && <p className="text-[11px] text-slate-400">Chưa có camera.</p>}
                  </section>
                )}
                <section>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase text-slate-500">
                    Camera trên tầng ({placed.length})
                  </h3>
                  {placed.length === 0 && (
                    <p className="text-xs text-slate-500">Chưa có camera gán vào zone/phòng của tầng này.</p>
                  )}
                  <ul className="space-y-0.5">
                    {(block ? blockCameras : placed).map((p) => {
                      const st = twin.stateById[p.device.id];
                      return (
                        <li key={p.device.id}>
                          <button
                            onClick={() => setCameraId(p.device.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${cameraId === p.device.id ? "bg-[#1e3a5f]/10 font-bold text-[#1e3a5f]" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: KIND[cameraKind(p.device)].color }} />
                            <span className="truncate font-mono">{p.device.device_code}</span>
                            <span className="ml-auto shrink-0" style={{ color: STATE[st].color }}>{STATE[st].label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}

            {view === "campus" && (twin.unplacedCameras.length > 0 || twin.unmatchedZones.length > 0) && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                <p className="font-bold">Chưa gắn lên sơ đồ</p>
                <p className="mt-0.5">
                  {twin.unplacedCameras.length} camera · {twin.unmatchedZones.length} zone · {twin.unmatchedRooms.length} phòng chưa khớp tòa nhà
                  trên sơ đồ (A1, A2, B1, B2…). Khai báo "Tòa nhà" của zone / "Khu" của phòng theo tên tòa để hiển thị.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {twin.unplacedCameras.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <button onClick={() => setCameraId(c.id)} className="font-mono hover:underline">{c.device_code}</button>
                      <span className="text-amber-700"> · {STATE[twin.stateById[c.id]].label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {historyDevice && <DeviceConnectionHistoryPanel device={historyDevice} onClose={() => setHistoryDevice(null)} />}
    </div>
  );
};

export default CameraTwin;
