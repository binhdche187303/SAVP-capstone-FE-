/**
 * Ước lượng tư thế đầu từ 478 landmark của MediaPipe Face Landmarker.
 *
 * Không dùng góc tuyệt đối (khác nhau theo khuôn mặt, khoảng cách camera) mà dùng
 * tỉ lệ hình học + hiệu chuẩn theo ảnh "nhìn thẳng" của chính người dùng:
 *
 * - yaw   = (x_mũi − x_mép_trái) / (x_mép_phải − x_mép_trái) − 0.5
 *           Trong khung hình gốc (KHÔNG lật gương), yaw > 0 nghĩa là người dùng
 *           quay sang TRÁI của chính họ (mũi dịch về phía bên phải ảnh).
 * - pitch = (y_mũi − y_mắt) / (y_cằm − y_mắt)
 *           Cúi xuống → pitch tăng, ngẩng lên → pitch giảm (so với baseline).
 * - roll  = góc đường nối 2 khóe mắt ngoài (độ).
 */
import { FRAME_CHECKS, POSE_THRESHOLDS } from "./config";

// Chỉ số landmark (MediaPipe canonical face mesh).
const NOSE_TIP = 1;
const CHEEK_A = 234;
const CHEEK_B = 454;
const EYE_OUTER_A = 33;
const EYE_OUTER_B = 263;
const CHIN = 152;

export function computeMetrics(lm, vw, vh) {
  const nose = lm[NOSE_TIP];
  const xa = lm[CHEEK_A].x;
  const xb = lm[CHEEK_B].x;
  const xl = Math.min(xa, xb);
  const xr = Math.max(xa, xb);
  const yaw = (nose.x - xl) / Math.max(xr - xl, 1e-6) - 0.5;

  const eyeY = (lm[EYE_OUTER_A].y + lm[EYE_OUTER_B].y) / 2;
  const pitch = (nose.y - eyeY) / Math.max(lm[CHIN].y - eyeY, 1e-6);

  const ex = (lm[EYE_OUTER_B].x - lm[EYE_OUTER_A].x) * vw;
  const ey = (lm[EYE_OUTER_B].y - lm[EYE_OUTER_A].y) * vh;
  let roll = (Math.atan2(ey, ex) * 180) / Math.PI;
  if (roll > 90) roll -= 180;
  if (roll < -90) roll += 180;

  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const box = { x: minX * vw, y: minY * vh, w: (maxX - minX) * vw, h: (maxY - minY) * vh };

  return {
    yaw,
    pitch,
    roll,
    box,
    faceRatio: box.w / Math.min(vw, vh),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/** Kiểm tra vị trí khuôn mặt trong khung hình. Trả về câu nhắc, hoặc null nếu ổn. */
export function framingHint(m) {
  if (m.faceRatio < FRAME_CHECKS.minFaceRatio) return "Đưa mặt lại gần camera hơn";
  if (m.faceRatio > FRAME_CHECKS.maxFaceRatio) return "Lùi ra xa camera một chút";
  if (
    m.cx < FRAME_CHECKS.centerMin ||
    m.cx > FRAME_CHECKS.centerMax ||
    m.cy < FRAME_CHECKS.centerMin ||
    m.cy > FRAME_CHECKS.centerMax
  ) {
    return "Đưa khuôn mặt vào giữa vòng tròn";
  }
  return null;
}

/**
 * Kiểm tra tư thế hiện tại có đạt bước `target` không.
 * `baseline` là số đo lúc nhìn thẳng (bắt buộc với mọi bước trừ "front").
 */
export function checkPose(target, m, baseline) {
  const T = POSE_THRESHOLDS;

  if (target === "front") {
    if (Math.abs(m.roll) > T.frontRollMaxDeg) return { ok: false, hint: "Giữ đầu thẳng, không nghiêng" };
    if (Math.abs(m.yaw) > T.frontYawMax) return { ok: false, hint: "Nhìn thẳng vào camera" };
    return { ok: true, hint: "Giữ yên…" };
  }

  const base = baseline ?? { yaw: 0, pitch: m.pitch };
  const dYaw = m.yaw - base.yaw; // > 0: quay sang trái (của người dùng)
  const dPitch = m.pitch - base.pitch; // > 0: cúi xuống

  switch (target) {
    case "left":
    case "right": {
      const signed = target === "left" ? dYaw : -dYaw;
      const word = target === "left" ? "trái" : "phải";
      if (Math.abs(m.yaw) > T.turnYawMax) return { ok: false, hint: "Quay hơi quá, quay lại một chút" };
      if (signed >= T.turnYawDelta) return { ok: true, hint: "Giữ yên…" };
      if (signed > T.turnYawDelta / 3) return { ok: false, hint: `Quay sang ${word} thêm chút nữa` };
      if (signed < -T.turnYawDelta / 2) return { ok: false, hint: `Ngược hướng rồi — quay sang ${word}` };
      return { ok: false, hint: `Từ từ quay đầu sang ${word}` };
    }
    case "up":
    case "down": {
      const signed = target === "down" ? dPitch : -dPitch;
      const word = target === "down" ? "Cúi xuống" : "Ngẩng lên";
      if (Math.abs(dYaw) > T.tiltYawTolerance) return { ok: false, hint: "Quay mặt về chính giữa" };
      if (signed >= T.tiltPitchDelta) return { ok: true, hint: "Giữ yên…" };
      if (signed > T.tiltPitchDelta / 3) return { ok: false, hint: `${word} thêm chút nữa` };
      return { ok: false, hint: `Từ từ ${word.toLowerCase()}` };
    }
    default:
      return { ok: false, hint: "" };
  }
}

// Mắt (6 điểm/mắt): [góc ngoài, mí trên 1, mí trên 2, góc trong, mí dưới 2, mí dưới 1].
const EYE_A = [33, 160, 158, 133, 153, 144];
const EYE_B = [362, 385, 387, 263, 373, 380];

function ear(lm, idx, vw, vh) {
  const d = (i, j) => Math.hypot((lm[i].x - lm[j].x) * vw, (lm[i].y - lm[j].y) * vh);
  const h = d(idx[0], idx[3]);
  if (h < 1e-6) return 0;
  return (d(idx[1], idx[5]) + d(idx[2], idx[4])) / (2 * h);
}

/**
 * Tỉ lệ mở mắt (Eye Aspect Ratio) của 2 mắt, tính theo pixel thật (không méo theo tỉ lệ khung).
 * Mở bình thường ~0.2–0.35, chớp/nhắm < ~0.12.
 */
export function eyeOpenness(lm, vw, vh) {
  return { a: ear(lm, EYE_A, vw, vh), b: ear(lm, EYE_B, vw, vh) };
}
