/**
 * Cấu hình dùng chung (client + server). Mọi ngưỡng nhận diện tư thế nằm ở đây
 * để chỉnh một chỗ. Bật overlay debug bằng cách thêm `?debug=1` vào URL để xem
 * giá trị đo thực tế khi cần tinh chỉnh.
 */


export const POSES = [
  { key: "front", label: "Nhìn thẳng", instruction: "Nhìn thẳng vào camera" },
  { key: "left", label: "Quay trái", instruction: "Từ từ quay đầu sang trái" },
  { key: "right", label: "Quay phải", instruction: "Từ từ quay đầu sang phải" },
  { key: "up", label: "Ngẩng lên", instruction: "Từ từ ngẩng mặt lên" },
  { key: "down", label: "Cúi xuống", instruction: "Từ từ cúi mặt xuống" },
];

export const POSE_KEYS = POSES.map((p) => p.key);

export const POSE_THRESHOLDS = {
  /** Nhìn thẳng: |yaw| tuyệt đối tối đa (yaw = vị trí mũi giữa 2 mép má, 0 = chính giữa). */
  frontYawMax: 0.08,
  /** Nhìn thẳng: nghiêng đầu (roll) tối đa, độ. */
  frontRollMaxDeg: 12,
  /** Quay trái/phải: độ lệch yaw so với ảnh nhìn thẳng (≈ 15–20°). */
  turnYawDelta: 0.12,
  /** Quay quá mức → landmark kém chính xác, nhắc quay lại một chút. */
  turnYawMax: 0.42,
  /** Ngẩng/cúi: độ lệch pitch so với ảnh nhìn thẳng (≈ 15–20°). */
  tiltPitchDelta: 0.06,
  /** Ngẩng/cúi: không được quay ngang quá mức này (tránh chụp chéo). */
  tiltYawTolerance: 0.14,
  /** Giữ đúng tư thế liên tục bao lâu thì chụp (ms). */
  holdMs: 450,
  /** Lệch tư thế thoáng qua ngắn hơn mức này (ms) thì không tính là hỏng — tránh reset vì rung tay. */
  graceMs: 250,
};

/** Hiệu năng nhận diện (điện thoại yếu / trình duyệt trong app Zalo, Messenger…). */
export const DETECT = {
  /** Cạnh dài của khung hình thu nhỏ đưa vào mô hình (px). Ảnh chụp vẫn lấy từ video gốc. */
  maxSide: 480,
  /** Khoảng cách tối thiểu giữa 2 lần nhận diện (ms) ≈ tối đa 16 lần/giây. */
  minIntervalMs: 60,
  /** Làm mượt yaw/pitch/roll (EMA): 0..1, càng lớn càng bám nhanh. */
  smoothing: 0.5,
};

export const FRAME_CHECKS = {
  /** Bề rộng khuôn mặt / cạnh ngắn của khung hình. */
  minFaceRatio: 0.2,
  maxFaceRatio: 0.85,
  /** Tâm khuôn mặt phải nằm trong vùng giữa khung hình (tỉ lệ 0..1). */
  centerMin: 0.2,
  centerMax: 0.8,
};

/**
 * Cổng chất lượng ảnh (lớp 1, chạy trên máy người dùng). Đo trên VÙNG MẶT thu về 112px
 * (≈ kích thước đầu vào của mô hình nhận diện), không đo cả khung ảnh.
 *
 * - ok   : đạt → nhận ảnh.
 * - soft : hơi kém (hơi tối/chói/mờ nhẹ, lệch sáng) → thử tiếp; nếu giữ đúng tư thế quá
 *          `softAcceptAfterMs` mà không có khung đạt thì nhận khung tốt nhất + gắn cờ cảnh báo.
 * - hard : không dùng được (mờ nặng, quá tối/chói, nhắm mắt, mặt quá nhỏ) → KHÔNG BAO GIỜ nhận,
 *          tự quét lại và nhắc cụ thể.
 *
 * Độ nét = 100 × phương sai Laplacian / (phương sai mức xám + 25) — chuẩn hóa theo độ tương phản
 * để ảnh tối mà nét không bị coi là mờ. Hiệu chuẩn trên ảnh mẫu 4 tư thế (thang 112px): ảnh rõ 6–13,
 * mờ nhẹ (σ≈0.5) ≈ 4.5, mờ vừa (σ≈0.9) ≈ 2.3, mờ nặng (σ≈1.6) ≈ 1.3. Xem giá trị thật bằng `?debug=1`.
 */
export const QUALITY = {
  /** Độ sáng trung bình vùng mặt (0–255). */
  brightnessOk: [70, 205],
  brightnessHard: [45, 230],
  sharpnessOk: 3,
  sharpnessHard: 1.8,
  /** Chênh sáng nửa trái/phải mặt (|T−P| / trung bình) — chỉ xét ảnh nhìn thẳng/ngẩng/cúi. */
  balanceOk: 0.3,
  /** Tỉ lệ mở mắt (EAR). Dưới mức này coi là nhắm mắt/chớp mắt. Bỏ qua khi cúi (mí mắt tự hạ). */
  eyeOpenMin: 0.13,
  eyeOpenMinUp: 0.1,
  /** Bề rộng khuôn mặt tối thiểu trong khung hình gốc (px) — dưới mức này ảnh thiếu chi tiết. */
  minFacePx: 150,
  /** Đã giữ đúng tư thế bao lâu mà chưa có khung đạt thì nhận khung "soft" tốt nhất (ms). */
  softAcceptAfterMs: 5000,
  /** Sau bao lâu không đạt thì hiện thêm mẹo khắc phục (ms). */
  tipAfterMs: 3000,
};

export const CAPTURE = {
  /** Ảnh đầu ra dạng chân dung 3:4 giống ảnh hồ sơ. */
  outputWidth: 600,
  outputHeight: 800,
  jpegQuality: 0.9,
  /** Bề rộng khung cắt = bề rộng khuôn mặt × hệ số này. */
  cropFaceScale: 2.1,
  /** Tâm khuôn mặt nằm ở vị trí 42% chiều cao khung cắt (chừa vai như ảnh hồ sơ). */
  faceCenterY: 0.42,
};

/** WASM tải từ CDN (cùng phiên bản gói @mediapipe/tasks-vision trong package.json). */
export const MEDIAPIPE = {
  wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm",
  modelPath:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};
