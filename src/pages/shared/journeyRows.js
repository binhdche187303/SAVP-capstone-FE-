// Dựng các dòng hiển thị cho trang Lịch sử di chuyển từ sự kiện thô của BE.
// BE cố ý trả zone appear + disappear thành 2 sự kiện riêng; FE gộp lại thành
// 1 "lượt ở" để timeline gọn. Dữ liệu gốc không bị sửa.

export const typeOf = (e) => (e.type || '').toLowerCase();
export const dirOf = (e) => (e.direction || '').toLowerCase();
const ms = (t) => new Date(t).getTime();
const isLeave = (e) => ['leave', 'exit'].includes(dirOf(e));

/** Gộp zone appear → disappear (cùng khu vực, liền kề theo giờ) thành 1 dòng có endTime. Trả về theo giờ tăng dần. */
export const mergeZoneStays = (events = []) => {
    const asc = [...events].sort((a, b) => ms(a.time) - ms(b.time));
    const rows = [];
    const open = new Map();
    asc.forEach((e) => {
        if (typeOf(e) !== 'zone') { rows.push(e); return; }
        const key = e.zoneName || e.deviceName || '';
        if (dirOf(e) === 'disappear') {
            const stay = open.get(key);
            if (!stay) { rows.push(e); return; }
            open.delete(key);
            stay.direction = 'stay';
            stay.endTime = e.time;
            stay.durationMs = ms(e.time) - ms(stay.time);
            if (e.sourceEventId) stay.endSourceEventId = e.sourceEventId;
            return;
        }
        const stay = { ...e };
        open.set(key, stay);
        rows.push(stay);
    });
    return rows;
};

/**
 * Đánh dấu dòng khu vực / phòng họp được ghi nhận khi người đó đang ở ngoài
 * (sau lượt ra cổng, trước lượt vào cổng kế tiếp) — thường là dữ liệu camera lệch giờ.
 * `rows` phải theo giờ tăng dần.
 */
export const flagAfterExit = (rows = []) => {
    const outside = [];
    let leftAt = null;
    rows.forEach((r) => {
        if (typeOf(r) !== 'gate') return;
        if (isLeave(r)) { if (leftAt === null) leftAt = r.time; }
        else if (dirOf(r) === 'enter' && leftAt !== null) { outside.push([leftAt, r.time]); leftAt = null; }
    });
    if (leftAt !== null) outside.push([leftAt, null]);
    const hit = (t) => outside.find(([from, to]) => ms(t) > ms(from) && (to === null || ms(t) < ms(to)));
    return rows.map((r) => {
        if (typeOf(r) === 'gate') return r;
        const found = hit(r.time) || (r.endTime && hit(r.endTime));
        return found ? { ...r, afterExitAt: found[0] } : r;
    });
};

export const buildJourneyRows = (events) => flagAfterExit(mergeZoneStays(events));
