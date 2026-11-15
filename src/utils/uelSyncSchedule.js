/** Lịch chạy đồng bộ UEL tự động: tính lần chạy kế tiếp và câu mô tả (giờ máy người dùng). */

export const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** settings: { autoEnabled, frequency: 'daily'|'weekly', weekday: 0 (CN)..6, time: 'HH:mm' } */
export const nextRunOf = (settings, from = new Date()) => {
    if (!settings?.autoEnabled) return null;
    const [h, m] = String(settings.time || '02:00').split(':').map(Number);
    const d = new Date(from);
    d.setHours(h, m, 0, 0);
    if (settings.frequency === 'weekly') {
        let diff = (Number(settings.weekday) - d.getDay() + 7) % 7;
        if (diff === 0 && d <= from) diff = 7;
        d.setDate(d.getDate() + diff);
    } else if (d <= from) {
        d.setDate(d.getDate() + 1);
    }
    return d;
};

/** "02:00 hằng ngày" / "02:00 Chủ nhật hằng tuần" */
export const scheduleLabelOf = (settings) =>
    settings?.frequency === 'weekly'
        ? `${settings.time} ${WEEKDAYS[Number(settings.weekday)] ?? ''} hằng tuần`
        : `${settings?.time ?? '02:00'} hằng ngày`;

const pad = (n) => String(n).padStart(2, '0');
/** "Thứ Sáu 13/11/2026 lúc 02:00" */
export const formatRunAt = (date) =>
    date ? `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} lúc ${pad(date.getHours())}:${pad(date.getMinutes())}` : '—';
