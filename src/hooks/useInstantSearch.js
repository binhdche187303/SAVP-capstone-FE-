import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Thời gian chờ chung trước khi gửi từ khoá tìm kiếm lên BE.
export const SEARCH_DEBOUNCE_MS = 300;

/** Trả về `value` sau khi người dùng ngừng thay đổi `delay` ms. */
export const useDebouncedValue = (value, delay = SEARCH_DEBOUNCE_MS) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

// So khớp không phân biệt hoa/thường và dấu tiếng Việt.
export const normalizeSearchText = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

// Gom mọi giá trị chữ/số trong bản ghi (kể cả object lồng nhau) thành một chuỗi để tìm.
const collectText = (value, depth = 0, out = []) => {
    if (value === null || value === undefined || depth > 3) return out;
    if (typeof value === 'string' || typeof value === 'number') {
        out.push(String(value));
    } else if (Array.isArray(value)) {
        value.forEach((item) => collectText(item, depth + 1, out));
    } else if (typeof value === 'object') {
        Object.values(value).forEach((item) => collectText(item, depth + 1, out));
    }
    return out;
};

/** True khi bản ghi chứa từ khoá (đã chuẩn hoá). */
export const matchesSearch = (item, query) => {
    const needle = normalizeSearchText(query);
    if (!needle) return true;
    return normalizeSearchText(collectText(item).join(' ')).includes(needle);
};

/**
 * Trạng thái "đang chờ kết quả tìm kiếm" ổn định hơn cờ `pending` thô:
 * sau khi từ khoá ngừng thay đổi, vẫn coi là đang chờ cho tới khi `items` thực sự được thay
 * bằng dữ liệu mới (tránh 1 nhịp hiện lại danh sách cũ giữa lúc debounce xong và lúc bắt đầu gọi API).
 */
export const useStablePending = (pending, items) => {
    const startItems = useRef(null);
    const waiting = useRef(false);
    const [, forceRender] = useState(0);
    let result;
    if (pending) {
        if (!waiting.current) startItems.current = items;
        waiting.current = true;
        result = true;
    } else if (waiting.current && items === startItems.current) {
        result = true; // từ khoá đã ổn định nhưng dữ liệu mới chưa về
    } else {
        waiting.current = false;
        result = false;
    }
    // An toàn: nếu từ khoá quay về giá trị cũ (không có lần gọi API mới) thì tự nhả sau 1,5 giây.
    const stuck = !pending && result;
    useEffect(() => {
        if (!stuck) return undefined;
        const timer = setTimeout(() => { waiting.current = false; forceRender((n) => n + 1); }, 1500);
        return () => clearTimeout(timer);
    }, [stuck]);
    return result;
};

// Giữ chiều cao khung trang trong lúc chờ kết quả, để trang không co lại rồi giãn ra (bị "nhảy").
const holds = new Map(); // element -> số hook đang giữ
const pageFrame = () => document.querySelector('[data-page-frame]') || document.querySelector('main');
export const useHoldPageHeight = (active) => {
    // Nhớ chiều cao trang lúc chưa tìm kiếm: khi bắt đầu giữ, danh sách đã lọc xong nên
    // chiều cao hiện tại có thể đã bị co — phải giữ theo chiều cao trước đó.
    const lastHeight = useRef(0);
    useLayoutEffect(() => {
        if (active) return;
        const frame = pageFrame();
        if (frame) lastHeight.current = frame.offsetHeight;
    });
    useLayoutEffect(() => {
        if (!active) return undefined;
        const frame = pageFrame();
        if (!frame) return undefined;
        const count = holds.get(frame) || 0;
        if (count === 0) frame.style.minHeight = `${Math.max(lastHeight.current, frame.offsetHeight)}px`;
        holds.set(frame, count + 1);
        return () => {
            const left = (holds.get(frame) || 1) - 1;
            if (left > 0) { holds.set(frame, left); return; }
            holds.delete(frame);
            // Thả ở frame kế tiếp, sau khi danh sách mới đã render.
            requestAnimationFrame(() => { if (!holds.has(frame)) frame.style.minHeight = ''; });
        };
    }, [active]);
};

/**
 * Tìm kiếm "lọc ngay khi gõ" cho danh sách lấy từ BE:
 * - Trong lúc chờ BE trả kết quả cho từ khoá đang gõ, lọc tức thì trên dữ liệu đã tải.
 *   Nếu không có dòng nào khớp tại chỗ thì giữ nguyên danh sách hiện tại cho tới khi BE trả về
 *   (tránh danh sách bị xoá trắng rồi bung ra).
 * - Khi BE đã trả kết quả cho đúng từ khoá, hiển thị nguyên kết quả BE (BE có thể khớp
 *   trên trường không có trong dữ liệu trả về, nên không lọc lại để tránh ẩn nhầm).
 * - Giữ chiều cao khung trang trong lúc chờ để trang không bị nhảy.
 */
export const useInstantFilter = (items, query, pending) => {
    // Chỉ theo dõi khi ô tìm kiếm có chữ — tránh lấy danh sách rỗng lúc mới mở trang làm mốc.
    const hasQuery = !!normalizeSearchText(query);
    const waiting = useStablePending(pending && hasQuery, items);
    useHoldPageHeight(waiting && hasQuery);
    return useMemo(() => {
        const list = Array.isArray(items) ? items : [];
        if (!waiting || !normalizeSearchText(query)) return list;
        const matched = list.filter((item) => matchesSearch(item, query));
        return matched.length ? matched : list;
    }, [items, query, waiting]);
};
