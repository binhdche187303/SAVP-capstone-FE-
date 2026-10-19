// Texture vẽ bằng canvas (không tải ảnh ngoài): mặt tiền, cỏ, sân bóng, mặt nước, gạch lát.
// Tất cả là MINH HOẠ, không phải ảnh chụp công trình thật.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const cache = new Map();

const make = (key, size, draw, repeat = [1, 1]) => {
  const k = `${key}|${repeat.join("x")}`;
  if (cache.has(k)) return cache.get(k);
  let base = cache.get(key);
  if (!base) {
    const c = document.createElement("canvas");
    c.width = size[0];
    c.height = size[1];
    draw(c.getContext("2d"), c.width, c.height);
    base = new CanvasTexture(c);
    base.colorSpace = SRGBColorSpace;
    base.wrapS = RepeatWrapping;
    base.wrapT = RepeatWrapping;
    base.anisotropy = 4;
    cache.set(key, base);
  }
  const t = base.clone();
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  cache.set(k, t);
  return t;
};

// Mỗi ô texture = 1 bước cột × 1 tầng.
const FACADES = {
  tower: (g, w, h) => {
    g.fillStyle = "#f4f6f8";
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#5f8fb8");
    grd.addColorStop(0.5, "#9cc3e0");
    grd.addColorStop(1, "#4d7aa3");
    g.fillStyle = grd;
    g.fillRect(6, 14, w - 12, h - 22);
    g.fillStyle = "#e8ecef";
    g.fillRect(w / 2 - 1.5, 14, 3, h - 22);
    g.fillStyle = "#cfd6dc";
    g.fillRect(0, 0, w, 6);
  },
  band: (g, w, h) => {
    g.fillStyle = "#fbfbf9";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#6f97bd";
    g.fillRect(0, 22, w, h - 36);
    g.fillStyle = "#dfe6ec";
    for (let x = 0; x < w; x += w / 4) g.fillRect(x, 22, 2, h - 36);
  },
  grid: (g, w, h) => {
    g.fillStyle = "#f4f5f7";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#6c8fb0";
    g.fillRect(10, 12, w / 2 - 14, h - 22);
    g.fillRect(w / 2 + 4, 12, w / 2 - 14, h - 22);
    g.fillStyle = "#c9ced4";
    g.fillRect(0, h - 6, w, 6);
  },
  hall: (g, w, h) => {
    g.fillStyle = "#f2e2c6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#7b9cbc";
    g.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.65);
    g.fillStyle = "#e3cfae";
    g.fillRect(0, h - 5, w, 5);
  },
  canteen: (g, w, h) => {
    g.fillStyle = "#df7535";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfe3f2";
    g.fillRect(6, h * 0.35, w - 12, h * 0.55);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h * 0.16);
  },
  curtain: (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "#1f6f6c");
    grd.addColorStop(0.5, "#3fa29a");
    grd.addColorStop(1, "#1d625f");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, h - 3, w, 3);
    g.fillRect(w - 2, 0, 2, h);
  },
};

export const facadeTexture = (style, cols, rows) =>
  make(`facade-${style}`, [64, 64], FACADES[style] || FACADES.grid, [Math.max(1, Math.round(cols)), rows]);

/** Mái bê tông: lưới ô sáng tối nhẹ. */
export const roofTexture = (rx, rz) =>
  make("roof", [128, 128], (g, w, h) => {
    g.fillStyle = "#c9ccce";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.strokeRect(0, 0, w, h);
  }, [rx, rz]);

/** Cỏ: nền xanh có hạt sáng/tối để đỡ phẳng. */
export const grassTexture = (rx, rz) =>
  make("grass", [256, 256], (g, w, h) => {
    g.fillStyle = "#8fc56a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const l = Math.random();
      g.fillStyle = l < 0.5 ? `rgba(60,120,40,${0.08 + Math.random() * 0.12})` : `rgba(210,240,150,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 3);
    }
  }, [rx, rz]);

/** Mặt nước: xanh có gợn sáng. */
export const waterTexture = () =>
  make("water", [256, 256], (g, w, h) => {
    g.fillStyle = "#4aa3c9";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 3, x + 16, y);
      g.stroke();
    }
  }, [2, 2]);

/** Gạch lát quảng trường / sàn phòng. */
export const tileTexture = (rx, rz, color = "#ece6da", line = "#d6cdbd") =>
  make(`tile-${color}`, [64, 64], (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, [rx, rz]);
