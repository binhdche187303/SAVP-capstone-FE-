// Định dạng ô dùng chung cho bảng báo cáo trên màn hình và file xuất (PDF/Excel/Word).
// Tự ghép chuỗi thay vì dùng toLocaleString để kết quả giống nhau trên mọi trình duyệt.

const EMPTY = '—';
const pad = (n) => String(n).padStart(2, '0');
const isEmpty = (value) => value === null || value === undefined || value === '';
const grouped = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const oneDecimal = (n) => String(Math.round(Number(n) * 10) / 10).replace('.', ',');

export const formatDateTime = (value) => {
    if (isEmpty(value)) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDuration = (seconds) => {
    if (isEmpty(seconds)) return EMPTY;
    const minutes = Math.round(Number(seconds) / 60);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}g ${minutes % 60}p` : `${minutes}p`;
};

export const formatCell = (value, format = 'text') => {
    if (format === 'datetime') return formatDateTime(value);
    if (format === 'duration') return formatDuration(value);
    if (isEmpty(value)) return EMPTY;
    switch (format) {
        case 'number':
            return grouped(Number(value));
        case 'percent':
            return `${oneDecimal(value)}%`;
        case 'hours':
            return `${oneDecimal(value)} giờ`;
        case 'minutes':
            return `${Math.round(Number(value))} phút`;
        default:
            return String(value);
    }
};
