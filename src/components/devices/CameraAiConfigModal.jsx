import { BrainCircuit, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WEEKDAYS } from "../../mocks/cameraMock";
import { updateDeviceAiConfig } from "../../service/sysAdminServices";

// Cấu hình AI từng camera (2.2.6).
// Cờ bật/tắt + cấu hình nâng cao lưu BE (PATCH /iot-devices/:id/ai-config → metadata_json.ai_config,
// khoá snake_case). State nội bộ dùng camelCase, map qua ADV_KEYS khi đọc/ghi.

// camelCase (state) → snake_case (BE)
const ADV_KEYS = {
  confidence: "confidence_threshold",
  detectionZone: "detection_zone",
  activeFrom: "active_from",
  activeTo: "active_to",
  activeDays: "active_days",
  strangerAlert: "stranger_alert",
  liveness: "liveness_check",
  maskSupport: "mask_support",
  lowLight: "low_light",
};

const ADV_DEFAULT = {
  confidence: 80,
  detectionZone: { x: 0, y: 0, w: 100, h: 100 },
  activeFrom: "00:00",
  activeTo: "23:59",
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  strangerAlert: true,
  liveness: false,
  maskSupport: false,
  lowLight: false,
};

const FLAGS = [
  {
    key: "face_recognition",
    label: "Nhận diện khuôn mặt",
    hint: "Xác định nhân viên, khách đã đăng ký",
  },
  {
    key: "plate_recognition",
    label: "Nhận diện biển số",
    hint: "Đọc biển số xe ra/vào",
  },
  {
    key: "people_counting",
    label: "Đếm người",
    hint: "Đếm lượt qua lại, sĩ số khu vực",
  },
];

const Toggle = ({ on, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-action-blue" : "bg-platinum-tint"}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
    />
  </button>
);

const clamp = (v) => Math.min(100, Math.max(0, v));

/** Kéo chuột trên khung hình để vẽ vùng nhận diện (toạ độ % khung). */
const DetectionZoneEditor = ({ zone, onChange }) => {
  const boxRef = useRef(null);
  const [draft, setDraft] = useState(null);

  const pointAt = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100),
    };
  };
  const rectOf = (a, b) => ({
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    w: Math.round(Math.abs(a.x - b.x)),
    h: Math.round(Math.abs(a.y - b.y)),
  });
  const shown = draft ? rectOf(draft.start, draft.end) : zone;

  return (
    <div>
      <div
        ref={boxRef}
        onMouseDown={(e) => {
          const p = pointAt(e);
          setDraft({ start: p, end: p });
        }}
        onMouseMove={(e) => draft && setDraft({ ...draft, end: pointAt(e) })}
        onMouseUp={() => {
          if (!draft) return;
          const r = rectOf(draft.start, draft.end);
          if (r.w >= 5 && r.h >= 5) onChange(r);
          setDraft(null);
        }}
        onMouseLeave={() => setDraft(null)}
        className="relative aspect-video rounded-xl overflow-hidden cursor-crosshair select-none bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900"
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "10% 10%",
          }}
        />
        <span className="absolute top-2 left-2 text-[10px] font-semibold text-white/70">
          Khung hình camera (minh hoạ)
        </span>
        <div
          className="absolute border-2 border-emerald-400 bg-emerald-400/15"
          style={{
            left: `${shown.x}%`,
            top: `${shown.y}%`,
            width: `${shown.w}%`,
            height: `${shown.h}%`,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
            Vùng nhận diện
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[10px] text-slate-blue">
          Kéo chuột trên khung để vẽ lại vùng. Ngoài vùng sẽ bỏ qua.
        </p>
        <button
          type="button"
          onClick={() => onChange({ x: 0, y: 0, w: 100, h: 100 })}
          className="text-[10px] font-semibold text-action-blue hover:underline"
        >
          Toàn khung
        </button>
      </div>
    </div>
  );
};

const CameraAiConfigModal = ({ device, onClose, onSaved }) => {
  const saved = device.metadata_json?.ai_config || {};
  const [flags, setFlags] = useState(() =>
    Object.fromEntries(
      FLAGS.map((f) => [
        f.key,
        saved[f.key] ??
          (device.device_type === "anpr_camera" &&
            f.key === "plate_recognition"),
      ]),
    ),
  );
  const [adv, setAdv] = useState(() =>
    Object.fromEntries(
      Object.entries(ADV_KEYS).map(([k, snake]) => [
        k,
        saved[snake] ?? ADV_DEFAULT[k],
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setAdv((a) => ({ ...a, ...patch }));
  const faceOn = flags.face_recognition;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...flags };
      for (const [k, snake] of Object.entries(ADV_KEYS)) body[snake] = adv[k];
      const res = await updateDeviceAiConfig(device.id, body);
      if (!res?.success)
        throw new Error(
          res?.error?.message ||
            res?.message ||
            "Không thể cập nhật cấu hình AI.",
        );
      onSaved(`Đã lưu cấu hình AI cho ${device.device_name}.`);
    } catch (err) {
      setError(
        err?.error?.message ||
          err?.message ||
          "Không thể cập nhật cấu hình AI.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden animate-fade-in-up flex flex-col">
        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
          <div>
            <h3 className="font-bold text-midnight-indigo text-sm inline-flex items-center gap-1.5">
              <BrainCircuit className="w-4 h-4 text-indigo-600" /> Cấu hình AI
              Camera
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
            {error && (
              <p className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </p>
            )}

            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-midnight-indigo uppercase">
                  Chức năng AI
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {FLAGS.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border border-platinum-tint"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-midnight-indigo">
                        {f.label}
                      </p>
                      <p className="text-[10px] text-slate-blue">{f.hint}</p>
                    </div>
                    <Toggle
                      on={flags[f.key]}
                      onClick={() =>
                        setFlags((s) => ({ ...s, [f.key]: !s[f.key] }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-blue mt-1.5">
                Lưu vào hệ thống. Đây là cấu hình khai báo — camera/IVSS cần
                được bật tương ứng.
              </p>
            </section>

            <section className="border-t border-platinum-tint pt-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-midnight-indigo uppercase">
                  Cấu hình nâng cao
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-midnight-indigo">
                    Ngưỡng độ tin cậy
                  </label>
                  <span className="text-xs font-bold text-action-blue tabular-nums">
                    {adv.confidence}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={99}
                  value={adv.confidence}
                  onChange={(e) => set({ confidence: Number(e.target.value) })}
                  className="w-full accent-action-blue"
                />
                <p className="text-[10px] text-slate-blue">
                  Kết quả dưới ngưỡng bị bỏ qua. Cao hơn → ít nhận nhầm nhưng dễ
                  bỏ sót.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight-indigo mb-1.5">
                  Vùng nhận diện
                </label>
                <DetectionZoneEditor
                  zone={adv.detectionZone}
                  onChange={(detectionZone) => set({ detectionZone })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight-indigo mb-1.5">
                  Khung giờ hoạt động
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={adv.activeFrom}
                    onChange={(e) => set({ activeFrom: e.target.value })}
                    className="px-2 py-1 border border-platinum-tint rounded-lg text-xs"
                  />
                  <span className="text-xs text-slate-blue">→</span>
                  <input
                    type="time"
                    value={adv.activeTo}
                    onChange={(e) => set({ activeTo: e.target.value })}
                    className="px-2 py-1 border border-platinum-tint rounded-lg text-xs"
                  />
                  <div className="flex gap-1 ml-2">
                    {WEEKDAYS.map((d, i) => {
                      const on = adv.activeDays.includes(i);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            set({
                              activeDays: on
                                ? adv.activeDays.filter((x) => x !== i)
                                : [...adv.activeDays, i].sort(),
                            })
                          }
                          className={`w-8 h-7 rounded-lg text-[11px] font-bold ${on ? "bg-action-blue text-white" : "bg-cloud-mist text-slate-blue"}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight-indigo mb-1.5">
                  Nhận diện khuôn mặt nâng cao{" "}
                  {!faceOn && (
                    <span className="font-normal text-steel-gray">
                      (bật "Nhận diện khuôn mặt" để dùng)
                    </span>
                  )}
                </label>
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${faceOn ? "" : "opacity-50 pointer-events-none"}`}
                >
                  {[
                    [
                      "strangerAlert",
                      "Cảnh báo người lạ",
                      "Mặt không có trong CSDL nhân sự",
                    ],
                    [
                      "liveness",
                      "Chống giả mạo (liveness)",
                      "Phát hiện ảnh in, màn hình, video",
                    ],
                    [
                      "maskSupport",
                      "Nhận diện khi đeo khẩu trang",
                      "Cần camera/thuật toán hỗ trợ",
                    ],
                    [
                      "lowLight",
                      "Chế độ thiếu sáng",
                      "Tăng cường ảnh IR/ban đêm",
                    ],
                  ].map(([key, label, hint]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border border-platinum-tint"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-midnight-indigo">
                          {label}
                        </p>
                        <p className="text-[10px] text-slate-blue">{hint}</p>
                      </div>
                      <Toggle
                        on={adv[key]}
                        onClick={() => set({ [key]: !adv[key] })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 py-4 flex justify-end gap-3 border-t border-platinum-tint shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu cấu hình AI"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CameraAiConfigModal;
