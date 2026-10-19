// Màu dùng chung cho sơ đồ camera 3D — ý nghĩa nhất quán giữa bản đồ, panel và chú giải.
export const KIND = {
  ai: { color: "#dc2626", label: "Camera AI" },
  sec: { color: "#2563eb", label: "Camera an ninh" },
};

export const STATE = {
  online: { color: "#16a34a", label: "Online" },
  offline: { color: "#94a3b8", label: "Mất tín hiệu" },
  alert: { color: "#ea580c", label: "Đang có cảnh báo" },
};

export const NAVY = "#1e3a5f";

/** Màu marker: xám khi mất tín hiệu, cam khi cảnh báo, còn lại theo loại camera. */
export const markerColor = (kind, state) =>
  state === "offline" ? STATE.offline.color : state === "alert" ? STATE.alert.color : KIND[kind].color;
