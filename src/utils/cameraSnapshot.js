// Tải ảnh chụp camera về máy. Ảnh thật do BE chụp (POST /hgvision/cameras/:name/snapshot);
// captureCameraSnapshot: chụp khung hình ngay ở trình duyệt (dự phòng, hiện không dùng ở trang nào).
// Video HLS phát qua proxy BE (hls.js tải bằng XHR + CORS) nên canvas không bị "tainted".

const pad = (n) => String(n).padStart(2, '0');

/** Tên file an toàn: <ten-camera>_<YYYYMMDD-HHmmss>.png (bỏ dấu, ký tự đặc biệt). */
export const snapshotFileName = (cameraName, at = new Date()) => {
    const slug = String(cameraName || 'camera')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'camera';
    const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
    return `${slug}_${stamp}.png`;
};

const drawStamp = (ctx, width, height, lines) => {
    const size = Math.max(14, Math.round(width / 60));
    ctx.font = `600 ${size}px sans-serif`;
    const lineH = Math.round(size * 1.35);
    const boxH = lineH * lines.length + size;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, height - boxH, width, boxH);
    ctx.fillStyle = '#fff';
    lines.forEach((text, i) => ctx.fillText(text, size, height - boxH + size / 2 + lineH * (i + 1) - lineH * 0.25));
};

const toBlob = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('EMPTY'))), 'image/png');
    } catch (e) {
        reject(e); // SecurityError nếu canvas bị tainted
    }
});

export const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * @param video   phần tử <video> đang phát (null → vẽ khung minh họa, dùng cho dữ liệu giả)
 * @param info    { cameraName, zoneName }
 * @returns tên file đã tải
 * @throws Error('NO_FRAME') khi video chưa có khung hình; Error khác khi trình duyệt chặn.
 */
export const captureCameraSnapshot = async (video, { cameraName, zoneName } = {}) => {
    const at = new Date();
    const width = video?.videoWidth || 1280;
    const height = video?.videoHeight || 720;
    if (video && (!video.videoWidth || video.readyState < 2)) throw new Error('NO_FRAME');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (video) {
        ctx.drawImage(video, 0, 0, width, height);
    } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Khung hình minh họa', width / 2, height / 2);
        ctx.textAlign = 'start';
    }
    drawStamp(ctx, width, height, [
        [cameraName, zoneName].filter(Boolean).join(' · '),
        at.toLocaleString('vi-VN', { hour12: false }),
    ]);
    const fileName = snapshotFileName(cameraName, at);
    downloadBlob(await toBlob(canvas), fileName);
    return fileName;
};
