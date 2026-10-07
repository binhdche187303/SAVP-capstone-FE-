// src/mocks/visitorReport/prng.js
// Sinh số giả ngẫu nhiên tất định để dữ liệu demo không đổi giữa các lần tải trang.

export const hashSeed = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

export const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const pick = (rng, array) => array[Math.floor(rng() * array.length)];
export const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
