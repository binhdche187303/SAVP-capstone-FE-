/**
 * Cắt khung chân dung 3:4 quanh khuôn mặt từ frame video gốc (không lật gương),
 * đánh giá chất lượng VÙNG MẶT (lớp 1 — chạy trên máy) và xuất JPEG.
 *
 * Luồng: mỗi khung hình đang giữ đúng tư thế → assessFace() → nếu tốt hơn khung đang giữ
 * thì snapshotCrop() vào canvas riêng (best-of-N) → đủ thời gian giữ + có khung đạt → encodeJpeg().
 */
import { CAPTURE, QUALITY } from "./config";


/** Câu nhắc ngay dưới hướng dẫn (ngắn, làm được ngay). */
export const ISSUE_HINT = {
  small: "Đưa mặt lại gần camera hơn",
  dark: "Ảnh quá tối — ra chỗ sáng hơn",
  backlit: "Bị ngược sáng — quay mặt về phía nguồn sáng",
  glare: "Ảnh bị chói — tránh đèn chiếu thẳng vào mặt",
  eyes: "Mở mắt tự nhiên, nhìn vào màn hình",
  blur: "Ảnh bị mờ — giữ yên đầu và điện thoại",
  uneven: "Mặt bị lệch sáng — xoay người để sáng đều hai bên",
};

/** Mẹo hiện thêm khi thử mãi chưa đạt. */
export const ISSUE_TIP = {
  small: "Mẹo: khuôn mặt nên chiếm gần hết vòng tròn.",
  dark: "Mẹo: ngồi đối diện cửa sổ hoặc bóng đèn.",
  backlit: "Mẹo: không ngồi quay lưng ra cửa sổ/đèn — nguồn sáng nên ở phía trước mặt.",
  glare: "Mẹo: lùi khỏi đèn rọi/nắng gắt, tắt đèn flash màn hình nếu có.",
  eyes: "Mẹo: nhìn vào màn hình, tránh chớp mắt khi vòng sáng đang chạy.",
  blur: "Mẹo: lau sạch camera trước, tì tay hoặc kê điện thoại lên bàn cho chắc.",
  uneven: "Mẹo: ánh sáng nên chiếu thẳng vào mặt, không chiếu từ một bên.",
};

const RANK = { ok: 2, soft: 1, hard: 0 };

/** a tốt hơn b? Ưu tiên mức đạt, cùng mức thì khung nét hơn. */
export function betterQuality(a, b) {
  if (!b) return true;
  if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] > RANK[b.severity];
  return a.sharpness > b.sharpness;
}

const Q = 112;
const scratch = new Map();

function grayRegion(source, r, W, H) {
  const key = `${W}x${H}`;
  let c = scratch.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    scratch.set(key, c);
  }
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = new Float32Array(W * H);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/** Độ sáng trung bình cả khung hình (dùng phát hiện ngược sáng). */
export function frameBrightness(source, w, h) {
  const g = grayRegion(source, { x: 0, y: 0, w, h }, 32, 18);
  let s = 0;
  for (const v of g) s += v;
  return s / g.length;
}

/**
 * Đánh giá chất lượng vùng mặt trên khung hình hiện tại của video.
 * `eyes` = EAR 2 mắt (pose.eyeOpenness), dùng mắt mở to hơn (mắt phía xa khi quay ngang kém chính xác).
 */
export function assessFace(
  video,
  m,
  eyes,
  pose,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  // Bỏ 8% mỗi bên để bớt nền lọt vào (nhất là khi quay ngang).
  const padX = m.box.w * 0.08;
  const x = Math.max(0, m.box.x + padX);
  const y = Math.max(0, m.box.y);
  const r = { x, y, w: Math.min(vw - x, m.box.w - 2 * padX), h: Math.min(vh - y, m.box.h) };
  const gray = grayRegion(video, r, Q, Q);

  let sum = 0, sq = 0, left = 0, right = 0;
  for (let yy = 0; yy < Q; yy++) {
    for (let xx = 0; xx < Q; xx++) {
      const v = gray[yy * Q + xx];
      sum += v;
      sq += v * v;
      if (xx < Q / 2) left += v;
      else right += v;
    }
  }
  const n = Q * Q;
  const brightness = sum / n;
  const variance = sq / n - brightness * brightness;
  const balance = Math.abs(left - right) / (n / 2) / Math.max(brightness, 1);

  let lSum = 0, lSq = 0, ln = 0;
  for (let yy = 1; yy < Q - 1; yy++) {
    for (let xx = 1; xx < Q - 1; xx++) {
      const k = yy * Q + xx;
      const l = 4 * gray[k] - gray[k - 1] - gray[k + 1] - gray[k - Q] - gray[k + Q];
      lSum += l;
      lSq += l * l;
      ln++;
    }
  }
  const lMean = lSum / ln;
  const sharpness = (100 * (lSq / ln - lMean * lMean)) / (variance + 25);

  const eyeOpen = Math.max(eyes.a, eyes.b);
  const facePx = m.box.w;

  const [bOkMin, bOkMax] = QUALITY.brightnessOk;
  const [bHardMin, bHardMax] = QUALITY.brightnessHard;
  const eyeMin = pose === "up" ? QUALITY.eyeOpenMinUp : QUALITY.eyeOpenMin;
  const checkEyes = pose !== "down"; // cúi xuống mí mắt tự hạ → không xét
  const checkBalance = pose === "front" || pose === "up" || pose === "down";

  let severity = "ok";
  let issue = null;
  const hard = (k) => {
    severity = "hard";
    issue = k;
  };
  if (facePx < QUALITY.minFacePx) hard("small");
  else if (brightness < bHardMin) hard("dark");
  else if (brightness > bHardMax) hard("glare");
  else if (checkEyes && eyeOpen < eyeMin) hard("eyes");
  else if (sharpness < QUALITY.sharpnessHard) hard("blur");
  else {
    const soft = (k) => {
      severity = "soft";
      issue = k;
    };
    if (brightness < bOkMin) soft("dark");
    else if (brightness > bOkMax) soft("glare");
    else if (sharpness < QUALITY.sharpnessOk) soft("blur");
    else if (checkBalance && balance > QUALITY.balanceOk) soft("uneven");
  }

  return { brightness, sharpness, balance, eyeOpen, facePx, severity, issue };
}

function cropRect(m, vw, vh) {
  const aspect = CAPTURE.outputWidth / CAPTURE.outputHeight; // 0.75
  let w = m.box.w * CAPTURE.cropFaceScale;
  let h = w / aspect;
  if (h > vh) {
    h = vh;
    w = h * aspect;
  }
  if (w > vw) {
    w = vw;
    h = w / aspect;
  }
  const faceCx = m.box.x + m.box.w / 2;
  const faceCy = m.box.y + m.box.h / 2;
  let x = faceCx - w / 2;
  let y = faceCy - h * CAPTURE.faceCenterY;
  x = Math.min(Math.max(0, x), vw - w);
  y = Math.min(Math.max(0, y), vh - h);
  return { x, y, w, h };
}

/** Chép khung chân dung của khung hình hiện tại vào `canvas` (giữ lại làm ứng viên). */
export function snapshotCrop(video, m, canvas) {
  const crop = cropRect(m, video.videoWidth, video.videoHeight);
  const scale = Math.min(1, CAPTURE.outputWidth / crop.w);
  const outW = Math.round(crop.w * scale);
  const outH = Math.round(crop.h * scale);
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW;
    canvas.height = outH;
  }
  canvas.getContext("2d").drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  return crop;
}

export function encodeJpeg(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh"))),
      "image/jpeg",
      CAPTURE.jpegQuality,
    ),
  );
}
