// Nhãn và mô tả cho lịch gửi báo cáo (BR-S1, BR-S2).

export const WEEKDAYS = [
    [1, 'thứ Hai'], [2, 'thứ Ba'], [3, 'thứ Tư'], [4, 'thứ Năm'], [5, 'thứ Sáu'], [6, 'thứ Bảy'], [0, 'Chủ nhật'],
];
export const PERIOD_LABELS = { yesterday: 'Hôm qua', last_week: 'Tuần trước', last_month: 'Tháng trước' };
export const FREQUENCY_LABELS = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' };
export const FORMAT_LABELS = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word' };
export const FORMAT_EXTENSIONS = { pdf: 'pdf', xlsx: 'xlsx', docx: 'doc' };

// "Hằng tuần, thứ Hai 07:30"
export const describeFrequency = (schedule) => {
    if (schedule.frequency === 'weekly') {
        const day = WEEKDAYS.find(([value]) => value === schedule.dayOfWeek)?.[1] || '';
        return `Hằng tuần, ${day} ${schedule.time}`;
    }
    if (schedule.frequency === 'monthly') {
        return `Hằng tháng, ngày ${schedule.dayOfMonth === 'last' ? 'cuối' : schedule.dayOfMonth} ${schedule.time}`;
    }
    return `Hằng ngày ${schedule.time}`;
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Kỳ dữ liệu mẫu để xem trước tên file đính kèm trong form (máy chủ mới là nơi tính kỳ thật).
export const samplePeriod = (period, now = new Date()) => {
    const day = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (period === 'last_week') {
        const sinceMonday = (now.getDay() + 6) % 7;
        return { from: ymd(day(-sinceMonday - 7)), to: ymd(day(-sinceMonday - 1)) };
    }
    if (period === 'last_month') {
        return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    }
    return { from: ymd(day(-1)), to: ymd(day(-1)) };
};
