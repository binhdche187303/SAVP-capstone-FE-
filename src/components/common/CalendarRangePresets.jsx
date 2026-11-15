import { useState } from 'react';
import TimeRangeButtons from './TimeRangeButtons';

const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Calendar periods run from the start of the period through today, in local time.
export const calendarRange = (period, now = new Date()) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === 'month') start.setDate(1);
    if (period === 'year') start.setMonth(0, 1);
    return { from: ymd(start), to: ymd(now) };
};

const OPTIONS = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng'], ['year', 'Năm'], ['custom', 'Tùy chọn khoảng']];

// Compare controlled dates with the last selection: editing either date selects Custom.
const CalendarRangePresets = ({ from, to, onChange, className = '', options = OPTIONS }) => {
    const [selection, setSelection] = useState(() => ({
        key: from === calendarRange('day').from && to === from ? 'day' : 'custom', from, to,
    }));
    const value = selection.from === from && selection.to === to ? selection.key : 'custom';
    return <TimeRangeButtons label="Khoảng thời gian" customLabel="Tùy chọn khoảng" className={className} value={value} options={options}
        onChange={key => {
            const range = key === 'custom' ? { from, to } : calendarRange(key);
            setSelection({ key, ...range });
            if (key !== 'custom') onChange(range);
        }} />;
};

export default CalendarRangePresets;
