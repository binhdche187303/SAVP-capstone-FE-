// src/mocks/visitorReport/scheduleNextRun.js
// Lịch gửi báo cáo (spec §4.2 BR-S2, BR-S4). Giờ theo Asia/Ho_Chi_Minh = UTC+7 cố định,
// tự tính bằng UTC để kết quả không phụ thuộc múi giờ của máy chạy.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Date mà các getter getUTC* đọc ra đúng giờ treo tường Việt Nam.
const toVn = (date) => new Date(date.getTime() + VN_OFFSET_MS);
// Thời điểm thật ứng với giờ treo tường Việt Nam (ngày/tháng tràn được tự chuẩn hoá).
const fromVn = (y, m, d, hh = 0, mm = 0) => new Date(Date.UTC(y, m, d, hh, mm) - VN_OFFSET_MS);
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (vnDate) => `${vnDate.getUTCFullYear()}-${pad(vnDate.getUTCMonth() + 1)}-${pad(vnDate.getUTCDate())}`;

export const computeNextRun = (schedule, now = new Date()) => {
    if (!schedule?.enabled) return null;
    const [hh, mm] = schedule.time.split(':').map(Number);
    const vn = toVn(now);
    const y = vn.getUTCFullYear();
    const m = vn.getUTCMonth();
    const d = vn.getUTCDate();

    if (schedule.frequency === 'daily') {
        const today = fromVn(y, m, d, hh, mm);
        return today > now ? today : fromVn(y, m, d + 1, hh, mm);
    }
    if (schedule.frequency === 'weekly') {
        for (let i = 0; i <= 7; i += 1) {
            const candidate = fromVn(y, m, d + i, hh, mm);
            if (toVn(candidate).getUTCDay() === schedule.dayOfWeek && candidate > now) return candidate;
        }
    }
    if (schedule.frequency === 'monthly') {
        for (let i = 0; i <= 2; i += 1) {
            const first = new Date(Date.UTC(y, m + i, 1));
            const yy = first.getUTCFullYear();
            const mo = first.getUTCMonth();
            const day = schedule.dayOfMonth === 'last' ? lastDayOfMonth(yy, mo) : schedule.dayOfMonth;
            const candidate = fromVn(yy, mo, day, hh, mm);
            if (candidate > now) return candidate;
        }
    }
    throw new Error(`Tần suất không hợp lệ: ${schedule.frequency}`);
};

export const resolvePeriod = (period, now = new Date()) => {
    const vn = toVn(now);
    const y = vn.getUTCFullYear();
    const m = vn.getUTCMonth();
    const d = vn.getUTCDate();
    const at = (yy, mo, dd) => new Date(Date.UTC(yy, mo, dd));

    if (period === 'yesterday') {
        const day = ymd(at(y, m, d - 1));
        return { from: day, to: day };
    }
    if (period === 'last_week') {
        const sinceMonday = (vn.getUTCDay() + 6) % 7;
        return { from: ymd(at(y, m, d - sinceMonday - 7)), to: ymd(at(y, m, d - sinceMonday - 1)) };
    }
    if (period === 'last_month') {
        return { from: ymd(at(y, m - 1, 1)), to: ymd(at(y, m, 0)) };
    }
    throw new Error(`Kỳ dữ liệu không hợp lệ: ${period}`);
};
