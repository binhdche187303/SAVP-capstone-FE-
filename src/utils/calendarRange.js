// Khoảng thời gian theo chế độ xem lịch (ngày / tuần bắt đầu thứ Hai / tháng), giờ Việt Nam.
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const calendarViewRange = (date, view) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start);
    if (view === 'month') {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
    } else if (view === 'week') {
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 6);
    }
    return { from: `${dateKey(start)}T00:00:00+07:00`, to: `${dateKey(end)}T23:59:59+07:00` };
};

export const isSameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
