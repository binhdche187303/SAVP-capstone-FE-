import { Building2, ChevronRight, DoorOpen } from "lucide-react";
import { SOURCE } from "./campusModel";
import { STATE } from "./theme";

const Stat = ({ label, value, color }) => (
  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
  </div>
);

const dot = (s) =>
  !s.total ? "#cbd5e1" : s.alert ? STATE.alert.color : s.offline ? "#64748b" : STATE.online.color;

/** Danh sách tòa nhà + cổng (bấm để focus) và chi tiết tòa/cổng đang chọn. */
const BuildingInfoPanel = ({ twin, selectedBuildingId, selectedGateId, onSelectBuilding, onSelectGate, onOpenBuilding }) => {
  const b = selectedBuildingId && twin.buildings[selectedBuildingId];
  const g = selectedGateId && twin.gates[selectedGateId];
  const placedBuildings = Object.values(twin.buildings).filter((x) => x.rect);
  const unplaced = Object.values(twin.buildings).filter((x) => !x.rect);

  return (
    <div className="space-y-4">
      {b && (
        <section className="rounded-xl border border-[#1e3a5f]/20 bg-[#1e3a5f]/[0.04] p-3">
          <p className="text-[10px] font-bold uppercase text-slate-500">{b.role}</p>
          <h3 className="text-base font-bold text-slate-900">{b.name}</h3>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <Stat label="Camera" value={twin.summarize(b.cameraIds).total} />
            <Stat label="Mất tín hiệu" value={twin.summarize(b.cameraIds).offline} color={STATE.offline.color} />
            <Stat label="Cảnh báo" value={twin.summarize(b.cameraIds).alert} color={STATE.alert.color} />
          </div>
          <dl className="mt-2 space-y-0.5 text-[11px] text-slate-600">
            {b.floors && <div>Số tầng: <b>{b.floors}</b> <span className="text-slate-400">({SOURCE[b.sources?.floors] || "—"})</span></div>}
            {b.areaM2 && <div>Diện tích xây dựng: <b>{b.areaM2.toLocaleString("vi-VN")} m²</b></div>}
            <div>Tầng có dữ liệu camera: <b>{b.floorList.length ? b.floorList.map((f) => f.label).join(", ") : "chưa có"}</b></div>
          </dl>
          {b.note && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{b.note}</p>}
          <button
            onClick={() => onOpenBuilding(b.id)}
            disabled={!b.floorList.length}
            title={b.floorList.length ? undefined : "Chưa có zone/phòng nào gán vào tòa này"}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-bold text-white hover:bg-[#16304f] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Xem mặt bằng tầng <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {g && (
        <section className="rounded-xl border border-[#1e3a5f]/20 bg-[#1e3a5f]/[0.04] p-3">
          <p className="text-[10px] font-bold uppercase text-slate-500">Cổng · {g.side}</p>
          <h3 className="text-base font-bold text-slate-900">{g.name}</h3>
          <p className="mt-1 text-[11px] text-slate-600">
            Zone: {g.zones.length ? g.zones.map((z) => z.zone_code).join(", ") : <span className="text-amber-700">chưa gán zone cổng nào</span>}
          </p>
          <ul className="mt-2 space-y-1">
            {[...g.cameraIds].map((id) => {
              const c = twin.cameras.find((x) => x.id === id);
              if (!c) return null;
              return (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATE[twin.stateById[id]].color }} />
                  <span className="truncate font-mono">{c.device_code}</span>
                  <span className="ml-auto text-slate-500">{STATE[twin.stateById[id]].label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase text-slate-500">Tòa nhà</h3>
        <ul className="space-y-0.5">
          {placedBuildings.map((x) => {
            const s = twin.summarize(x.cameraIds);
            return (
              <li key={x.id}>
                <button
                  onClick={() => onSelectBuilding(x.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selectedBuildingId === x.id ? "bg-[#1e3a5f]/10 font-bold text-[#1e3a5f]" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{x.name}</span>
                  <span className="ml-auto flex items-center gap-1.5 tabular-nums text-slate-500">
                    {s.total}
                    <span className="h-2 w-2 rounded-full" style={{ background: dot(s) }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {unplaced.map((x) => (
          <p key={x.id} className="mt-1 px-2 text-[11px] text-slate-400">
            {x.name} — {x.role}: chưa có vị trí trên sơ đồ khuôn viên
          </p>
        ))}
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase text-slate-500">Cổng</h3>
        <ul className="space-y-0.5">
          {Object.values(twin.gates).map((x) => {
            const s = twin.summarize(x.cameraIds);
            return (
              <li key={x.id}>
                <button
                  onClick={() => onSelectGate(x.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selectedGateId === x.id ? "bg-[#1e3a5f]/10 font-bold text-[#1e3a5f]" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <DoorOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{x.name}</span>
                  <span className="ml-auto flex items-center gap-1.5 tabular-nums text-slate-500">
                    {s.total}
                    <span className="h-2 w-2 rounded-full" style={{ background: dot(s) }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default BuildingInfoPanel;
