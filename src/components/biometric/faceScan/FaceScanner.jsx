/**
 * Màn quét khuôn mặt tự động 5 tư thế (không có chụp thủ công).
 *
 * Hiệu năng (điện thoại yếu, trình duyệt trong Zalo/Messenger):
 * - Mỗi lần nhận diện chỉ đưa khung hình thu nhỏ (cạnh dài DETECT.maxSide) vào mô hình;
 *   ảnh lưu vẫn cắt từ video gốc độ phân giải cao.
 * - Nhịp nhận diện tự điều chỉnh theo thời gian xử lý thực tế của máy.
 * - Toàn bộ trạng thái vòng lặp nằm trong ref; React chỉ re-render khi câu nhắc / tiến độ đổi.
 * - yaw/pitch/roll được làm mượt (EMA) và có khoảng "ân hạn" để rung tay không làm reset.
 *
 * Cổng chất lượng (lớp 1): trong lúc giữ đúng tư thế, mỗi khung hình được chấm điểm vùng mặt
 * (sáng/nét/lệch sáng/mở mắt/kích thước) và giữ lại khung tốt nhất (best-of-N). Hết thời gian giữ:
 * - có khung đạt → lưu khung đó;
 * - chưa có → tiếp tục quét, nhắc lỗi cụ thể; giữ đúng tư thế quá QUALITY.softAcceptAfterMs mà
 *   khung tốt nhất chỉ "hơi kém" thì lưu kèm cờ cảnh báo; lỗi nặng thì không bao giờ lưu.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { DETECT, POSES, POSE_THRESHOLDS, QUALITY } from "./config";
import { ISSUE_HINT, ISSUE_TIP, assessFace, betterQuality, encodeJpeg, frameBrightness, snapshotCrop } from "./capture";
import { landmarkerDelegate, loadLandmarker } from "./landmarker";
import { checkPose, computeMetrics, eyeOpenness, framingHint } from "./pose";
import PoseRing from "./PoseRing";


const RING_SIZE = 300;
const VIDEO_DIAMETER = 236;
const PROGRESS_STEPS = 10;
/** Ngưỡng chênh sáng (khung hình − mặt) để coi là ngược sáng. */
const BACKLIT_DELTA = 35;

const ARROW = { left: "←", right: "→", up: "↑", down: "↓" };
const ARROW_POS = {
  left: "-translate-x-20",
  right: "translate-x-20",
  up: "-translate-y-20",
  down: "translate-y-20",
};

// Bo tròn video chắc chắn trên iOS Safari/WKWebView (overflow-hidden + border-radius
// không cắt được <video> có transform).
const CIRCLE_CLIP = {
  clipPath: "circle(50% at 50% 50%)",
  WebkitClipPath: "circle(50% at 50% 50%)",
  WebkitMaskImage: "-webkit-radial-gradient(white, black)",
  transform: "translateZ(0)",
};

function cameraErrorMessage(e) {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Trang cần chạy qua HTTPS để dùng camera.";
  }
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Bạn đã chặn quyền camera. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ → cho phép Camera, rồi bấm Thử lại.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy camera trên thiết bị này.";
  if (name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng (Zalo, Teams, Zoom…). Hãy tắt ứng dụng đó rồi thử lại.";
  return "Không mở được camera. Vui lòng thử lại hoặc dùng trình duyệt khác (Chrome, Safari).";
}

export default function FaceScanner({ poses, initialBaseline = null, debug = false, onComplete, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(0);
  const loopRef = useRef(() => {});
  const canvasRef = useRef(null);

  // Trạng thái vòng lặp (ref để không re-render mỗi frame)
  const stepRef = useRef(0);
  const baselineRef = useRef(initialBaseline);
  const holdStartRef = useRef(0);
  const lastOkRef = useRef(0);
  const samplesRef = useRef([]);
  const busyRef = useRef(false);
  const cooldownRef = useRef(0);
  // Best-of-N cho bước hiện tại
  const bestRef = useRef(null);
  const bestCanvasRef = useRef(null);
  const framesRef = useRef(0);
  const failMsRef = useRef(0);
  const lastTickRef = useRef(0);
  const tipRef = useRef("");
  const nextDetectRef = useRef(0);
  const avgDetectMsRef = useRef(30);
  const smoothRef = useRef(null);
  const capturesRef = useRef({});
  const viewRef = useRef({ hint: "", progress: 0 });
  const debugAtRef = useRef(0);
  // Giữ props mới nhất trong ref — vòng lặp rAF chạy liên tục nên không được bắt closure cũ.
  const posesRef = useRef(poses);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    posesRef.current = poses;
    onCompleteRef.current = onComplete;
  });

  const [status, setStatus] = useState("loading");
  const [loadingText, setLoadingText] = useState("Đang tải mô hình nhận diện…");
  const [error, setError] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [view, setView] = useState({ hint: "", progress: 0 });
  const [captured, setCaptured] = useState>(new Set());
  const [flash, setFlash] = useState("");
  const [debugText, setDebugText] = useState("");
  const [tip, setTip] = useState("");
  const [attempt, setAttempt] = useState(0);

  const target = poses[stepIdx] ?? null;

  /** Chỉ setState khi câu nhắc hoặc tiến độ (đã lượng tử hóa) thật sự thay đổi. */
  const pushView = useCallback((hint, progress) => {
    const q = Math.round(progress * PROGRESS_STEPS) / PROGRESS_STEPS;
    const cur = viewRef.current;
    if (cur.hint === hint && cur.progress === q) return;
    viewRef.current = { hint, progress: q };
    setView(viewRef.current);
  }, []);

  const pushTip = useCallback((t) => {
    if (tipRef.current === t) return;
    tipRef.current = t;
    setTip(t);
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Lưu ảnh đã chụp cho bước hiện tại và chuyển bước. */
  const accept = useCallback(
    (pose, blob, best, warning) => {
      const { q, m, crop } = best;
      if (pose === "front") {
        const s = samplesRef.current.length ? samplesRef.current : [{ yaw: m.yaw, pitch: m.pitch, roll: m.roll }];
        baselineRef.current = {
          yaw: s.reduce((a, b) => a + b.yaw, 0) / s.length,
          pitch: s.reduce((a, b) => a + b.pitch, 0) / s.length,
        };
      }
      capturesRef.current[pose] = {
        blob,
        url: URL.createObjectURL(blob),
        meta: {
          yaw: +m.yaw.toFixed(4),
          pitch: +m.pitch.toFixed(4),
          roll: +m.roll.toFixed(2),
          brightness: +q.brightness.toFixed(1),
          sharpness: +q.sharpness.toFixed(2),
          manual: false,
          qualityWarning: warning,
          width: Math.round(Math.min(crop.w, 600)),
          height: Math.round(Math.min(crop.h, 800)),
          balance: +q.balance.toFixed(3),
          eyeOpen: +q.eyeOpen.toFixed(3),
          facePx: Math.round(q.facePx),
          issue: q.issue,
          frames: framesRef.current,
        },
      };
      const label = POSES.find((p) => p.key === pose)?.label ?? pose;
      holdStartRef.current = 0;
      samplesRef.current = [];
      bestRef.current = null;
      framesRef.current = 0;
      failMsRef.current = 0;
      pushTip("");
      cooldownRef.current = performance.now() + 700;
      setCaptured((prev) => new Set(prev).add(pose));
      setFlash(`✓ ${label}`);
      pushView("", 0);

      const next = stepRef.current + 1;
      if (next >= posesRef.current.length) {
        stopCamera();
        setTimeout(() => onCompleteRef.current(capturesRef.current, baselineRef.current), 450);
        return;
      }
      stepRef.current = next;
      setStepIdx(next);
      setTimeout(() => setFlash(""), 700);
    },
    [pushTip, pushView, stopCamera],
  );

  /** Mã hóa khung tốt nhất đã giữ lại rồi lưu. */
  const doCapture = useCallback(
    async (warning) => {
      const pose = posesRef.current[stepRef.current];
      const best = bestRef.current;
      const canvas = bestCanvasRef.current;
      if (!pose || !best || !canvas || busyRef.current) return;
      busyRef.current = true;
      try {
        const blob = await encodeJpeg(canvas);
        accept(pose, blob, best, warning);
      } catch (e) {
        console.error(e);
      } finally {
        busyRef.current = false;
      }
    },
    [accept],
  );

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(() => loopRef.current());
    const video = videoRef.current;
    const lm = landmarkerRef.current;
    if (!video || !lm || video.readyState < 2 || busyRef.current) return;
    const now = performance.now();
    if (now < nextDetectRef.current) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Thu nhỏ khung hình trước khi nhận diện (tọa độ landmark chuẩn hóa 0..1 nên không đổi).
    const scale = Math.min(1, DETECT.maxSide / Math.max(vw, vh));
    const dw = Math.round(vw * scale);
    const dh = Math.round(vh * scale);
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }
    canvas.getContext("2d").drawImage(video, 0, 0, dw, dh);

    const t0 = performance.now();
    const result = lm.detectForVideo(canvas, t0);
    const t1 = performance.now();
    avgDetectMsRef.current = avgDetectMsRef.current * 0.8 + (t1 - t0) * 0.2;
    // Máy chậm → giãn nhịp để giao diện/video không bị giật.
    nextDetectRef.current = t1 + Math.max(DETECT.minIntervalMs, avgDetectMsRef.current * 1.5);

    const face = result.faceLandmarks?.[0];
    const pose = posesRef.current[stepRef.current];

    const fail = (msg) => {
      // Lệch thoáng qua trong lúc đang giữ → bỏ qua, không reset tiến độ.
      if (holdStartRef.current && t1 - lastOkRef.current < POSE_THRESHOLDS.graceMs) return;
      holdStartRef.current = 0;
      samplesRef.current = [];
      pushView(msg, 0);
    };

    const showDebug = (text) => {
      if (!debug || t1 - debugAtRef.current < 250) return;
      debugAtRef.current = t1;
      setDebugText(`${landmarkerDelegate() ?? "?"} ${avgDetectMsRef.current.toFixed(0)}ms ${dw}x${dh} | ${text}`);
    };

    if (!face) {
      smoothRef.current = null;
      showDebug("no face");
      return fail("Không thấy khuôn mặt — hãy nhìn vào camera");
    }

    const raw = computeMetrics(face, vw, vh);
    const a = DETECT.smoothing;
    const prev = smoothRef.current;
    const s = prev
      ? {
          yaw: prev.yaw + a * (raw.yaw - prev.yaw),
          pitch: prev.pitch + a * (raw.pitch - prev.pitch),
          roll: prev.roll + a * (raw.roll - prev.roll),
        }
      : { yaw: raw.yaw, pitch: raw.pitch, roll: raw.roll };
    smoothRef.current = s;
    const m = { ...raw, ...s };

    let dbg = "";
    if (debug) {
      const b = baselineRef.current;
      dbg =
        `yaw ${m.yaw.toFixed(3)} pitch ${m.pitch.toFixed(3)} roll ${m.roll.toFixed(1)}° face ${m.faceRatio.toFixed(2)}` +
        (b ? ` | dYaw ${(m.yaw - b.yaw).toFixed(3)} dPitch ${(m.pitch - b.pitch).toFixed(3)}` : "");
    }

    const dt = lastTickRef.current ? Math.min(250, t1 - lastTickRef.current) : 0;
    lastTickRef.current = t1;

    if (!pose || t1 < cooldownRef.current) return showDebug(dbg);

    const frame = framingHint(m);
    if (frame) {
      showDebug(dbg);
      return fail(frame);
    }

    // Chấm chất lượng vùng mặt của khung hình này (rẻ: 112×112 px).
    const q = assessFace(video, m, eyeOpenness(face, vw, vh), pose);
    if (q.issue === "dark" && frameBrightness(canvas, dw, dh) - q.brightness > BACKLIT_DELTA) q.issue = "backlit";
    if (debug) {
      const bq = bestRef.current?.q;
      showDebug(
        `${dbg}\nQ ${q.severity}${q.issue ? `:${q.issue}` : ""} sáng ${q.brightness.toFixed(0)} nét ${q.sharpness.toFixed(2)} ` +
          `lệch ${q.balance.toFixed(2)} mắt ${q.eyeOpen.toFixed(2)} mặt ${q.facePx.toFixed(0)}px | best ${bq?.severity ?? "-"} ` +
          `${bq?.sharpness.toFixed(2) ?? ""} n${framesRef.current} fail ${(failMsRef.current / 1000).toFixed(1)}s`,
      );
    }

    const check = checkPose(pose, m, baselineRef.current);
    if (!check.ok) return fail(check.hint);

    lastOkRef.current = t1;
    if (!holdStartRef.current) {
      holdStartRef.current = t1;
      samplesRef.current = [];
    }
    samplesRef.current.push(s);

    // Best-of-N: giữ lại khung tốt nhất của bước này (kể cả qua các lần giữ bị ngắt).
    framesRef.current++;
    if (betterQuality(q, bestRef.current?.q)) {
      if (!bestCanvasRef.current) bestCanvasRef.current = document.createElement("canvas");
      const bc = bestCanvasRef.current;
      bestRef.current = { q, m, crop: snapshotCrop(video, m, bc) };
    }

    const p = Math.min(1, (t1 - holdStartRef.current) / POSE_THRESHOLDS.holdMs);
    if (p < 1) return pushView("Giữ yên…", p);

    const best = bestRef.current;
    if (best.q.severity === "ok") return void doCapture(false);

    // Chưa có khung đạt: quét tiếp, nhắc lỗi cụ thể của khung hiện tại.
    failMsRef.current += dt;
    if (best.q.severity === "soft" && failMsRef.current >= QUALITY.softAcceptAfterMs) return void doCapture(true);
    const issue = (q.severity !== "ok" ? q.issue : best.q.issue) ?? "blur";
    pushView(ISSUE_HINT[issue], 0.9);
    if (failMsRef.current >= QUALITY.tipAfterMs) pushTip(ISSUE_TIP[issue]);
  }, [debug, doCapture, pushTip, pushView]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // Khởi động: tải model + mở camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        setLoadingText("Đang tải mô hình nhận diện…");
        const lm = await loadLandmarker();
        if (cancelled) return;
        landmarkerRef.current = lm;

        setLoadingText("Đang mở camera…");
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("no mediaDevices", "NotFoundError");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(() => loopRef.current());
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(
          e instanceof DOMException || !(e instanceof Error)
            ? cameraErrorMessage(e)
            : "Không tải được mô hình nhận diện. Kiểm tra kết nối mạng rồi thử lại.",
        );
        setStatus("camera-error");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const instruction = POSES.find((p) => p.key === target)?.instruction ?? "";
  const arrow = target ? ARROW[target] : undefined;

  return (
    <div className="flex flex-col items-center text-slate-900">
      <div className="flex w-full items-center justify-between px-1">
        <button
          type="button"
          onClick={() => { stopCamera(); onCancel(); }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50"
        >
          <ArrowLeft className="h-4 w-4" /> Hủy
        </button>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          Tư thế {Math.min(stepIdx + 1, poses.length)}/{poses.length}
        </span>
      </div>

      <div className="relative mt-4" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <div aria-hidden className="absolute inset-3 rounded-full bg-gradient-to-b from-blue-50 to-blue-100/60" />
        <div
          className="absolute overflow-hidden rounded-full bg-slate-800 shadow-[0_12px_32px_-12px_rgba(29,78,216,0.55)]"
          style={{
            width: VIDEO_DIAMETER,
            height: VIDEO_DIAMETER,
            left: (RING_SIZE - VIDEO_DIAMETER) / 2,
            top: (RING_SIZE - VIDEO_DIAMETER) / 2,
            ...CIRCLE_CLIP,
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full rounded-full object-cover"
            style={{ transform: "scaleX(-1)", clipPath: CIRCLE_CLIP.clipPath, WebkitClipPath: CIRCLE_CLIP.WebkitClipPath }}
          />
          {status === "scanning" && arrow && !flash && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`animate-pulse text-6xl font-bold text-white/70 drop-shadow ${ARROW_POS[target]}`}>
                {arrow}
              </span>
            </div>
          )}
          {flash && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-600/40 text-2xl font-semibold text-white">
              {flash}
            </div>
          )}
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
              {loadingText}
            </div>
          )}
        </div>
        <PoseRing
          size={RING_SIZE}
          innerDiameter={VIDEO_DIAMETER}
          captured={captured}
          target={status === "scanning" ? target : null}
          progress={view.progress}
        />
      </div>

      {status === "camera-error" ? (
        <div className="mt-5 max-w-sm text-center">
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-2xl border border-blue-100 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-sm"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="mt-5 max-w-sm text-center">
          <p className="text-xl font-bold text-[#0b1b3f]">{instruction}</p>
          <p className="mt-1.5 min-h-6 text-sm font-medium text-blue-700">
            {status === "scanning" && view.hint !== instruction ? view.hint : ""}
          </p>
          {status === "scanning" && tip && (
            <p className="mx-auto mt-2 max-w-xs rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              {tip}
            </p>
          )}
          {status === "scanning" && (
            <p className="mt-2 text-xs text-slate-400">Tự động chụp khi đúng tư thế và ảnh đủ rõ — không cần bấm nút</p>
          )}
        </div>
      )}

      <ol className="mt-5 flex flex-wrap justify-center gap-2">
        {poses.map((p) => (
          <li
            key={p}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              captured.has(p)
                ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                : p === target
                  ? "bg-blue-600 text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,0.8)]"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {captured.has(p) && <Check className="h-3.5 w-3.5" />}
            {POSES.find((x) => x.key === p)?.label}
          </li>
        ))}
      </ol>

      {debug && <pre className="mt-4 whitespace-pre-wrap text-center text-[11px] text-amber-700">{debugText}</pre>}
    </div>
  );
}
