import { CalendarClock, Film, HardDrive } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import RecordingScheduleModal from "../../components/devices/RecordingScheduleModal";
import {
  CAMERA_TYPES,
  RECORDING_MODE,
  dailyGB,
  getRecording,
  scheduledHoursPerWeek,
} from "../../mocks/cameraMock";
import {
  getDevices,
  getRecordingStorage,
} from "../../service/sysAdminServices";

// 2.2.7 Lịch ghi hình & lưu trữ theo từng camera.
// Lịch ghi đọc metadata_json.recording (chưa cấu hình → mặc định theo loại camera);
// dung lượng từ GET /iot-devices/recording-storage.

const TYPE_LABEL = {
  ip_camera: "Camera AI",
  door_camera: "Camera vào/ra",
  room_camera: "Camera phòng",
  anpr_camera: "Camera biển số",
};

const formatGB = (gb) =>
  gb >= 1024
    ? `${(gb / 1024).toFixed(2)} TB`
    : `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;

const StatCard = ({ label, value, sub, tone = "text-midnight-indigo" }) => (
  <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-4">
    <p className="text-[11px] font-semibold text-slate-blue">{label}</p>
    <p className={`text-xl font-bold leading-tight mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-steel-gray mt-0.5">{sub}</p>}
  </div>
);

/** Thanh 7 ngày tóm tắt lịch: mỗi ngày = tỉ lệ giờ có ghi. */
const WeekStrip = ({ schedule, mode }) => (
  <div className="flex gap-0.5">
    {schedule.map((day, i) => {
      const ratio = day.split("").filter((c) => c === "1").length / 24;
      return (
        <div
          key={i}
          className="w-3 h-5 rounded-sm bg-cloud-mist overflow-hidden flex items-end"
          title={`${Math.round(ratio * 24)} giờ`}
        >
          <div
            className={`w-full ${mode === "event" ? "bg-violet-400" : "bg-action-blue"}`}
            style={{ height: `${ratio * 100}%` }}
          />
        </div>
      );
    })}
  </div>
);

const CameraRecording = () => {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [storage, setStorage] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, st] = await Promise.all([
        getDevices({ limit: 100 }),
        getRecordingStorage(),
      ]);
      const list = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
      setCameras(list.filter((d) => CAMERA_TYPES.includes(d.device_type)));
      setStorage(st?.data || null);
    } catch (err) {
      setError(
        err?.error?.message ||
          err?.message ||
          "Không tải được danh sách camera.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mở thẳng lịch ghi khi đến từ trang thiết bị (?camera=<id>).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("camera");
    const device = id && cameras.find((c) => c.id === id);
    if (!device) return;
    setEditing({ device, rec: getRecording(device) });
    setSearchParams({}, { replace: true });
  }, [cameras, searchParams, setSearchParams]);

  const rows = useMemo(() => {
    const usedById = new Map(
      (storage?.devices || []).map((d) => [d.device_id, d.used_gb ?? 0]),
    );
    return cameras.map((device) => {
      const rec = getRecording(device);
      return {
        device,
        rec,
        used: usedById.get(device.id) ?? 0,
        perDay: dailyGB(rec),
      };
    });
  }, [cameras, storage]);

  const capacityGB = storage?.capacity_gb || 0;
  const totalUsed = storage?.used_gb ?? 0;
  const totalPerDay = rows.reduce((s, r) => s + r.perDay, 0);
  const steadyState = rows.reduce(
    (s, r) => s + r.perDay * r.rec.retentionDays,
    0,
  );
  const recording = rows.filter(
    (r) => r.rec.mode !== "off" && r.device.status === "online",
  );
  const avgRetention = rows.length
    ? Math.round(
        rows.reduce((s, r) => s + r.rec.retentionDays, 0) / rows.length,
      )
    : 0;
  const usedPct = capacityGB ? (totalUsed / capacityGB) * 100 : 0;
  const daysToFull =
    totalPerDay > 0 ? Math.floor((capacityGB - totalUsed) / totalPerDay) : null;
  const fits = steadyState <= capacityGB;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
            <Film className="w-3.5 h-3.5" /> Camera AI
          </span>
          <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">
            Ghi hình & lưu trữ
          </h1>
          <p className="text-slate-blue text-sm mt-1">
            Lịch ghi hình, thời gian lưu trữ và dung lượng theo từng camera.
          </p>
        </div>
      </div>

      {toast && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
          {toast}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-4">
          <p className="text-[11px] font-semibold text-slate-blue inline-flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5" /> Dung lượng đã dùng
          </p>
          <p className="text-xl font-bold leading-tight mt-1 text-midnight-indigo">
            {formatGB(totalUsed)}{" "}
            <span className="text-sm font-semibold text-steel-gray">
              / {formatGB(capacityGB)}
            </span>
          </p>
          <div className="h-2 rounded-full bg-cloud-mist mt-2 overflow-hidden">
            <div
              className={`h-full ${usedPct > 85 ? "bg-red-500" : usedPct > 70 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>
        <StatCard
          label="Camera đang ghi"
          value={`${recording.length} / ${rows.length}`}
          sub="Online và không tắt ghi"
          tone="text-green-600"
        />
        <StatCard
          label="Lưu trữ trung bình"
          value={`${avgRetention} ngày`}
          sub={`Ghi thêm ${formatGB(totalPerDay)}/ngày`}
        />
        <StatCard
          label="Dự báo ổ lưu trữ"
          value={
            fits
              ? "Đủ chỗ"
              : daysToFull != null
                ? `Đầy sau ${daysToFull} ngày`
                : "—"
          }
          sub={`Cần ${formatGB(steadyState)} khi đủ chính sách lưu`}
          tone={fits ? "text-green-600" : "text-red-600"}
        />
      </div>

      <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Camera</th>
                <th className="text-left px-4 py-3 font-bold">Chế độ</th>
                <th className="text-left px-4 py-3 font-bold">Lịch tuần</th>
                <th className="text-right px-4 py-3 font-bold">Lưu trữ</th>
                <th className="text-right px-4 py-3 font-bold">Dung lượng</th>
                <th className="text-left px-4 py-3 font-bold">
                  Trạng thái ghi
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-platinum-tint">
              {rows.map(({ device, rec, used, perDay }) => {
                const active = rec.mode !== "off" && device.status === "online";
                return (
                  <tr key={device.id} className="hover:bg-cloud-mist/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-midnight-indigo">
                        {device.device_name}
                      </p>
                      <p className="text-[10px] font-mono text-steel-gray">
                        {device.device_code} · {TYPE_LABEL[device.device_type]}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${RECORDING_MODE[rec.mode].cls}`}
                      >
                        {RECORDING_MODE[rec.mode].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <WeekStrip schedule={rec.schedule} mode={rec.mode} />
                        <span className="text-[11px] text-slate-blue tabular-nums">
                          {scheduledHoursPerWeek(rec.schedule)}h/tuần
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-midnight-indigo">
                      {rec.retentionDays} ngày
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <p className="font-semibold text-midnight-indigo">
                        {formatGB(used)}
                      </p>
                      <p className="text-[10px] text-steel-gray">
                        +{formatGB(perDay)}/ngày
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {active ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{" "}
                          Đang ghi
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-steel-gray">
                          {rec.mode === "off"
                            ? "Tắt ghi"
                            : `Gián đoạn (${device.status})`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing({ device, rec })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-action-blue hover:bg-blue-50"
                      >
                        <CalendarClock className="w-3.5 h-3.5" /> Lịch ghi
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RecordingScheduleModal
          device={editing.device}
          recording={editing.rec}
          onClose={() => setEditing(null)}
          onSaved={(rec, saved) => {
            const id = editing.device.id;
            setCameras((list) =>
              list.map((c) =>
                c.id === id
                  ? saved?.metadata_json
                    ? { ...c, metadata_json: saved.metadata_json }
                    : c
                  : c,
              ),
            );
            setToast(`Đã lưu lịch ghi cho ${editing.device.device_name}.`);
            setEditing(null);
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}
    </div>
  );
};

export default CameraRecording;
