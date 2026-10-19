import { Activity, Move, VideoOff, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { KIND, STATE } from "./theme";
import { cameraKind } from "./twinData";

const TYPE_LABEL = {
  ip_camera: "IP camera",
  door_camera: "Camera vào/ra",
  room_camera: "Camera phòng",
  anpr_camera: "Camera biển số",
};

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3 border-b border-dashed border-slate-100 py-1 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-semibold text-slate-800">{children}</span>
  </div>
);

/** Chi tiết camera đang chọn: mã, vị trí, loại, trạng thái, hướng nhìn, xem trước. */
const CameraDetailPanel = ({ device, state, where, angle, onClose, onHistory }) => {
  // Trang 2D chỉ có ở System Admin.
  const canEditLayout = useLocation().pathname.startsWith("/system-admin");
  const kind = cameraKind(device);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND[kind].color }} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase" style={{ color: KIND[kind].color }}>{KIND[kind].label}</p>
          <h3 className="truncate text-sm font-bold text-slate-900">{device.device_name || device.device_code}</h3>
          <p className="font-mono text-[11px] text-slate-500">{device.device_code}</p>
        </div>
        <button onClick={onClose} aria-label="Đóng chi tiết camera" className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2">
        <Row label="Trạng thái">
          <span style={{ color: STATE[state].color }}>{STATE[state].label}</span>
        </Row>
        <Row label="Tòa nhà / cổng">{where?.place || "Chưa gán lên sơ đồ"}</Row>
        {where?.floor && <Row label="Tầng">{where.floor}</Row>}
        {where?.spot && <Row label="Vị trí lắp">{where.spot}</Row>}
        <Row label="Loại thiết bị">{TYPE_LABEL[device.device_type] || device.device_type}</Row>
        <Row label="Hướng quan sát">{angle == null ? "—" : `${Math.round(angle)}°`}</Row>
        <Row label="IP">{device.ip_address || "—"}</Row>
      </div>

      <div className="mt-3 flex aspect-video flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 text-center text-[11px] text-slate-500">
        <VideoOff className="h-5 w-5" />
        Hệ thống chưa có API xem trực tiếp / ảnh chụp theo camera.
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={onHistory}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#1e3a5f]/30 px-2 py-1.5 text-[11px] font-semibold text-[#1e3a5f] hover:bg-slate-50"
        >
          <Activity className="h-3.5 w-3.5" /> Lịch sử kết nối
        </button>
        {canEditLayout && (
        <Link
          to="/system-admin/camera-layout"
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Move className="h-3.5 w-3.5" /> Chỉnh vị trí (2D)
        </Link>
        )}
      </div>
    </section>
  );
};

export default CameraDetailPanel;
