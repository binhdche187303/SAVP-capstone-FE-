import { CalendarClock, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  RECORDING_MODE,
  WEEKDAYS,
  dailyGB,
  scheduledHoursPerWeek,
} from "../../mocks/cameraMock";
import { updateRecordingPolicy } from "../../service/sysAdminServices";

// Lịch ghi hình 1 camera (2.2.7): chế độ, lưới 7 ngày × 24 giờ, số ngày lưu trữ.
// Lưu BE: PATCH /iot-devices/:id/recording-policy → metadata_json.recording.

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const PRESETS = [
  { label: "24/7", rows: () => Array(7).fill("1".repeat(24)) },
  {
    label: "Giờ hành chính",
    rows: () => [
      ...Array(5).fill("0".repeat(7) + "1".repeat(12) + "0".repeat(5)),
      "0".repeat(24),
      "0".repeat(24),
    ],
  },
  {
    label: "Ngoài giờ",
    rows: () => [
      ...Array(5).fill("1".repeat(7) + "0".repeat(12) + "1".repeat(5)),
      "1".repeat(24),
      "1".repeat(24),
    ],
  },
  { label: "Xoá hết", rows: () => Array(7).fill("0".repeat(24)) },
];
const RETENTION = [7, 15, 30, 60, 90];

const setCell = (rows, day, hour, value) =>
  rows.map((r, d) =>
    d === day ? r.slice(0, hour) + value + r.slice(hour + 1) : r,
  );

const RecordingScheduleModal = ({ device, recording, onClose, onSaved }) => {
  const [rec, setRec] = useState(recording);
  // Kéo chuột để tô: giá trị tô ('1'/'0') lấy theo ô bắt đầu kéo.
  const [paint, setPaint] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const hours = scheduledHoursPerWeek(rec.schedule);
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateRecordingPolicy(device.id, {
        mode: rec.mode,
        retention_days: rec.retentionDays,
        bitrate_mbps: rec.bitrateMbps,
        schedule: rec.schedule,
      });
      if (!res?.success) throw new Error(res?.error?.message || res?.message);
      onSaved(rec, res.data);
    } catch (err) {
      setError(
        err?.error?.message || err?.message || "Không thể lưu lịch ghi hình.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4"
      onMouseUp={() => setPaint(null)}
    >
      <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden animate-fade-in-up flex flex-col">
        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
          <div>
            <h3 className="font-bold text-midnight-indigo text-sm inline-flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-action-blue" /> Lịch ghi
              hình
            </h3>
            <p className="text-[10px] text-slate-blue mt-0.5">
              {device.device_name} · {device.device_code}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-blue hover:text-midnight-indigo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                Chế độ ghi
              </label>
              <div className="flex gap-1">
                {Object.entries(RECORDING_MODE).map(([key, m]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRec({ ...rec, mode: key })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border ${rec.mode === key ? "border-action-blue bg-blue-50 text-action-blue" : "border-platinum-tint text-slate-blue"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                Lưu trữ
              </label>
              <select
                value={rec.retentionDays}
                onChange={(e) =>
                  setRec({ ...rec, retentionDays: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 border border-platinum-tint rounded-lg text-sm bg-white"
              >
                {RETENTION.map((d) => (
                  <option key={d} value={d}>
                    {d} ngày (tự xoá cũ hơn)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                Chất lượng
              </label>
              <select
                value={rec.bitrateMbps}
                onChange={(e) =>
                  setRec({ ...rec, bitrateMbps: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 border border-platinum-tint rounded-lg text-sm bg-white"
              >
                <option value={1}>720p · 1 Mbps</option>
                <option value={2}>1080p · 2 Mbps</option>
                <option value={4}>1080p cao · 4 Mbps</option>
                <option value={8}>4K · 8 Mbps</option>
              </select>
            </div>
          </div>

          <div
            className={
              rec.mode === "off" ? "opacity-40 pointer-events-none" : ""
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-bold text-midnight-indigo">
                Khung giờ ghi{" "}
                <span className="font-normal text-slate-blue">
                  · kéo chuột để tô/xoá · {hours} giờ/tuần
                </span>
              </p>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setRec({ ...rec, schedule: p.rows() })}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-action-blue hover:bg-blue-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="select-none">
              <div className="flex ml-8">
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="flex-1 text-center text-[9px] text-steel-gray"
                  >
                    {h % 3 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              {WEEKDAYS.map((d, day) => (
                <div key={d} className="flex items-center gap-0 mt-0.5">
                  <span className="w-8 text-[11px] font-semibold text-slate-blue">
                    {d}
                  </span>
                  {HOURS.map((h) => {
                    const on = rec.schedule[day][h] === "1";
                    return (
                      <div
                        key={h}
                        onMouseDown={() => {
                          const v = on ? "0" : "1";
                          setPaint(v);
                          setRec({
                            ...rec,
                            schedule: setCell(rec.schedule, day, h, v),
                          });
                        }}
                        onMouseEnter={() =>
                          paint &&
                          setRec({
                            ...rec,
                            schedule: setCell(rec.schedule, day, h, paint),
                          })
                        }
                        className={`flex-1 h-6 border border-white cursor-pointer ${on ? (rec.mode === "event" ? "bg-violet-400" : "bg-action-blue") : "bg-cloud-mist hover:bg-platinum-tint"}`}
                        title={`${d} ${h}:00–${h + 1}:00`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-cloud-mist rounded-xl p-3 text-xs text-slate-blue">
            Ước tính dung lượng:{" "}
            <span className="font-bold text-midnight-indigo">
              {dailyGB(rec).toFixed(1)} GB/ngày
            </span>{" "}
            · cần{" "}
            <span className="font-bold text-midnight-indigo">
              {(dailyGB(rec) * rec.retentionDays).toFixed(0)} GB
            </span>{" "}
            cho {rec.retentionDays} ngày lưu
            {rec.mode === "event" && " (theo sự kiện ≈ 15% thời lượng)"}.
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-platinum-tint shrink-0">
          {error && (
            <p className="mr-auto text-xs text-red-600 font-medium">{error}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu lịch ghi"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RecordingScheduleModal;
