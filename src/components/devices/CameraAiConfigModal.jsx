import { BrainCircuit, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { updateDeviceAiConfig } from "../../service/sysAdminServices";

// Cấu hình AI camera (2.2.6).
// Nhận diện (ngưỡng, vùng, khung giờ, liveness, khẩu trang, thiếu sáng, bật/tắt chức năng)
// do HGVision/IVSS xử lý → cấu hình bên HGVision, SAVP không giữ bản sao.
// SAVP chỉ quyết định có phát cảnh báo người lạ từ sự kiện HGVision gửi về hay không
// (PATCH /iot-devices/:id/ai-config → metadata_json.ai_config.stranger_alert).

const HGVISION_URL = process.env.REACT_APP_HGVISION_URL || "";

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

const CameraAiConfigModal = ({ device, onClose, onSaved }) => {
  const saved = device.metadata_json?.ai_config || {};
  const [strangerAlert, setStrangerAlert] = useState(
    saved.stranger_alert ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await updateDeviceAiConfig(device.id, {
        stranger_alert: strangerAlert,
      });
      if (!res?.success)
        throw new Error(
          res?.error?.message || res?.message || "Không thể cập nhật cấu hình.",
        );
      onSaved(`Đã lưu cấu hình cảnh báo cho ${device.device_name}.`);
    } catch (err) {
      setError(
        err?.error?.message || err?.message || "Không thể cập nhật cấu hình.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-md w-full overflow-hidden animate-fade-in-up flex flex-col">
        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
          <div>
            <h3 className="font-bold text-midnight-indigo text-sm inline-flex items-center gap-1.5">
              <BrainCircuit className="w-4 h-4 text-indigo-600" /> AI Camera
            </h3>
            <p data-ui-text="secondary" className="text-[10px] text-slate-blue mt-0.5">
              {device.device_name} · {device.device_code}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-blue hover:text-midnight-indigo">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <p data-ui-text="badge" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-midnight-indigo">
              Cấu hình nhận diện thực hiện trên HGVision.
              {HGVISION_URL && (
                <a
                  href={HGVISION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 font-semibold text-action-blue hover:underline"
                >
                  Mở HGVision <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-platinum-tint">
              <div className="min-w-0">
                <p data-ui-text="primary" className="text-xs font-semibold text-midnight-indigo">
                  Cảnh báo người lạ
                </p>
                <p data-ui-text="secondary" className="text-[10px] text-slate-blue">
                  Phát cảnh báo trên SAVP khi HGVision báo mặt không có trong CSDL
                </p>
              </div>
              <Toggle on={strangerAlert} onClick={() => setStrangerAlert((v) => !v)} />
            </div>
          </div>

          <div className="px-6 py-4 flex justify-end gap-3 border-t border-platinum-tint">
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
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CameraAiConfigModal;
