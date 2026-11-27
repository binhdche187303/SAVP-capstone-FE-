// Vị trí mặc định theo bộ "Bản vẽ vị trí Camera - KTL - Final".
// Hệ tọa độ dùng chung với CameraLayout: rộng 1000, chiều cao theo tỉ lệ ảnh.
// Các vị trí đã được người dùng lưu trong metadata_json.layout luôn được ưu tiên.

export const KTL_GATE_FLOOR_KEY = "Khuôn viên - Cổng";

const position = (floorKey, x, y, angle) => ({ floorKey, x, y, angle });

export const KTL_LAYOUT_BY_CODE = {
  // Khối A1 - tầng trệt: G-1 ... G-9.
  "G-1": position("A1 - Tầng G", 177, 173, 180),
  "G-2": position("A1 - Tầng G", 216, 159, 270),
  "G-3": position("A1 - Tầng G", 214, 181, 0),
  "G-4": position("A1 - Tầng G", 504, 148, 90),
  "G-5": position("A1 - Tầng G", 431, 189, 0),
  "G-6": position("A1 - Tầng G", 576, 188, 180),
  "G-7": position("A1 - Tầng G", 794, 178, 180),
  "G-8": position("A1 - Tầng G", 802, 159, 270),
  "G-9": position("A1 - Tầng G", 832, 174, 0),

  // Khối A1 - lầu 1: T1-1 ... T1-6.
  "T1-1": position("A1 - Tầng 1", 215, 160, 180),
  "T1-2": position("A1 - Tầng 1", 444, 174, 180),
  "T1-3": position("A1 - Tầng 1", 457, 179, 0),
  "T1-4": position("A1 - Tầng 1", 550, 179, 180),
  "T1-5": position("A1 - Tầng 1", 565, 174, 0),
  "T1-6": position("A1 - Tầng 1", 794, 161, 270),

  // Bộ hồ sơ chỉ có một camera lầu 2, số bản vẽ "1 - Phải".
  "T2-1": position("A1 - Tầng 2", 215, 160, 180),

  // Hội trường - lầu 1.
  "HT-1": position("A2 - Tầng 1", 593, 285, 0),
  "HT-2": position("A2 - Tầng 1", 593, 368, 0),

  // Khối B1 - tầng trệt.
  "B1-1": position("B1 - Tầng G", 220, 246, 180),
  "B1-2": position("B1 - Tầng G", 922, 248, 180),

  // Cổng 1 / cổng chính: 3 camera.
  "GATE1-1": position(KTL_GATE_FLOOR_KEY, 458, 559, 225),
  "GATE1-2": position(KTL_GATE_FLOOR_KEY, 480, 559, 315),
  "GATE1-3": position(KTL_GATE_FLOOR_KEY, 469, 575, 270),

  // Cổng 2 mới: 4 camera, hai cặp hai bên đường.
  "GATE2-1": position(KTL_GATE_FLOOR_KEY, 208, 526, 225),
  "GATE2-2": position(KTL_GATE_FLOOR_KEY, 269, 526, 315),
  "GATE2-3": position(KTL_GATE_FLOOR_KEY, 208, 544, 135),
  "GATE2-4": position(KTL_GATE_FLOOR_KEY, 269, 544, 45),

  // Cổng 2A / cổng 2 hiện hữu: 3 camera.
  "GATE2A-1": position(KTL_GATE_FLOOR_KEY, 258, 249, 210),
  "GATE2A-2": position(KTL_GATE_FLOOR_KEY, 286, 250, 330),
  "GATE2A-3": position(KTL_GATE_FLOOR_KEY, 306, 258, 45),

  // Cổng 3: 2 camera AI mới, cùng trụ và nhìn hai chiều.
  "GATE3-1": position(KTL_GATE_FLOOR_KEY, 555, 181, 270),
  "GATE3-2": position(KTL_GATE_FLOOR_KEY, 555, 208, 90),
};

const normalizedCode = (value) => String(value || "").trim().toUpperCase();

/**
 * Tạo lớp vị trí mặc định từ mã camera trong Excel Final.
 * Chỉ trả vị trí thuộc đúng tầng để không vô tình chuyển camera sang tầng khác.
 */
export const defaultKtlLayout = (devices, floorKey) => {
  const out = {};
  devices.forEach((device) => {
    const found = KTL_LAYOUT_BY_CODE[normalizedCode(device.device_code)];
    if (!found || found.floorKey !== floorKey) return;
    out[device.id] = { x: found.x, y: found.y, angle: found.angle };
  });
  return out;
};

