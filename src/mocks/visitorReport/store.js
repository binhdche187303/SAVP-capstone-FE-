// src/mocks/visitorReport/store.js
import { buildSeed, SEED_VERSION, ME_HOST_ID } from './seed';

export const STORAGE_KEY = 'savp.visitorReportMock';

// Dùng khi localStorage không ghi được (ẩn danh, đầy quota): demo vẫn chạy trong bộ nhớ.
let memory = null;
let persistFailed = false;

const USER_COLLECTIONS = ['visits', 'notifications', 'schedules', 'runs', 'exports'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const readStored = () => {
    if (persistFailed) return memory;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const saveState = (state) => {
    memory = state;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        persistFailed = false;
        return true;
    } catch {
        persistFailed = true;
        return false;
    }
};

// Sang ngày mới: sinh lại để "hôm nay" có dữ liệu, giữ những gì người demo đã tạo hoặc sửa.
const reseedKeepingUserData = (old, now) => {
    const fresh = buildSeed(now);
    USER_COLLECTIONS.forEach((key) => {
        const mine = (old[key] || []).filter((item) => item.userTouched);
        const mineIds = new Set(mine.map((item) => item.id));
        fresh[key] = [...mine, ...fresh[key].filter((item) => !mineIds.has(item.id))];
    });
    return fresh;
};

export const loadState = (now = new Date()) => {
    const stored = readStored();
    const valid = stored && stored.version === SEED_VERSION && Array.isArray(stored.visits);
    if (valid && stored.seededOn === dayKey(now)) return stored;
    const next = valid ? reseedKeepingUserData(stored, now) : buildSeed(now);
    saveState(next);
    return next;
};

export const updateState = (mutator, now = new Date()) => {
    const state = loadState(now);
    mutator(state);
    saveState(state);
    return state;
};

export const resetState = (now = new Date()) => {
    const fresh = buildSeed(now);
    saveState(fresh);
    return fresh;
};

// Người đang đăng nhập đóng vai cán bộ `host-me` trong dữ liệu giả.
export const getCurrentActor = () => {
    try {
        const user = JSON.parse(window.localStorage.getItem('user') || 'null');
        const fullName = user?.fullName || user?.full_name || user?.name;
        return { id: ME_HOST_ID, fullName: fullName || 'Tài khoản đang đăng nhập' };
    } catch {
        return { id: ME_HOST_ID, fullName: 'Tài khoản đang đăng nhập' };
    }
};
