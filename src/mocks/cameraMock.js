// Hằng số & mặc định cho phân hệ 2.2 Camera AI. Dữ liệu thật lưu BE trong metadata_json của
// thiết bị (ai_config / recording / layout / anpr); file này chỉ còn giá trị mặc định khi camera
// chưa được cấu hình và các hàm tính toán hiển thị. Xem docs/MOCK_CHO_BE.md.

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const pickBy = (id, salt, arr) => arr[hash(`${id}:${salt}`) % arr.length];

// ── Mục 1: Loại camera ─────────────────────────────────────────────────────

export const CAMERA_TYPES = [
  "ip_camera",
  "door_camera",
  "room_camera",
  "anpr_camera",
];

export const LANE_LABEL = { in: "Làn vào", out: "Làn ra", both: "Hai chiều" };

/** Làn của camera biển số (metadata_json.anpr). Lượt xe hôm nay: GET /iot-devices/anpr-stats. */
export const getAnprInfo = (device) => {
  const anpr = device.metadata_json?.anpr || {};
  return {
    laneDirection: anpr.lane_direction || "both",
    laneNo: anpr.lane_no || 1,
  };
};

// ── Mục 6: Cấu hình AI nâng cao ────────────────────────────────────────────

export const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// ── Mục 7: Lịch ghi hình & lưu trữ ─────────────────────────────────────────

export const RECORDING_MODE = {
  continuous: { label: "Liên tục", cls: "bg-blue-50 text-blue-700" },
  event: { label: "Theo sự kiện", cls: "bg-violet-50 text-violet-700" },
  off: { label: "Tắt", cls: "bg-slate-100 text-steel-gray" },
};

// Lưới 7 ngày × 24 giờ: mỗi ngày 1 chuỗi 24 ký tự '1' (ghi) / '0' (không).
const FULL_DAY = "1".repeat(24);
const OFFICE_HOURS = "0".repeat(7) + "1".repeat(12) + "0".repeat(5);
const NO_DAY = "0".repeat(24);

const defaultRecording = (device) => {
  if (device.device_type === "room_camera") {
    return {
      mode: "event",
      retentionDays: 30,
      bitrateMbps: 2,
      schedule: [...Array(5).fill(OFFICE_HOURS), NO_DAY, NO_DAY],
    };
  }
  if (device.device_type === "anpr_camera") {
    return {
      mode: "event",
      retentionDays: 90,
      bitrateMbps: 2,
      schedule: Array(7).fill(FULL_DAY),
    };
  }
  return {
    mode: "continuous",
    retentionDays: 30,
    bitrateMbps: 4,
    schedule: Array(7).fill(FULL_DAY),
  };
};

/** Lịch ghi của camera: metadata_json.recording (snake_case) → camelCase; chưa có → mặc định. */
export const getRecording = (device) => {
  const r = device.metadata_json?.recording;
  if (!r) return defaultRecording(device);
  return {
    mode: r.mode,
    retentionDays: r.retention_days,
    bitrateMbps: r.bitrate_mbps,
    schedule: r.schedule,
  };
};

/** Số giờ ghi / tuần theo lịch. */
export const scheduledHoursPerWeek = (schedule) =>
  schedule.reduce(
    (sum, day) => sum + day.split("").filter((c) => c === "1").length,
    0,
  );

/** GB ghi mỗi ngày (trung bình theo tuần). Theo sự kiện ≈ 15% thời lượng. */
export const dailyGB = (rec) => {
  if (rec.mode === "off") return 0;
  const hoursPerDay = scheduledHoursPerWeek(rec.schedule) / 7;
  const factor = rec.mode === "event" ? 0.15 : 1;
  return (rec.bitrateMbps * 3600 * hoursPerDay * factor) / 8 / 1024;
};

// ── Mục 4: Vị trí camera trên sơ đồ ────────────────────────────────────────

/** Hướng nhìn mặc định (độ, 0 = sang phải, chiều kim đồng hồ). */
export const defaultAngle = (deviceId) =>
  pickBy(deviceId, "angle", [45, 90, 135, 270, 315]);
