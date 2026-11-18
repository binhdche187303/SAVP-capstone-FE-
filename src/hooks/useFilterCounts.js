import { useEffect, useMemo, useRef, useState } from 'react';
import { matchesFilter } from '../utils/filterSelection';

/**
 * Số đếm cạnh từng lựa chọn của ô lọc ("Nhãn (số)"), truyền vào <FilterMultiSelect counts={...}>.
 * Khoá '' là lựa chọn "Tất cả".
 */

/** Đếm tại chỗ trên danh sách đã tải đủ (màn lọc phía trình duyệt). getValue có thể trả mảng. */
export const countBy = (items, getValue) => {
    const list = Array.isArray(items) ? items : [];
    const counts = { '': list.length };
    for (const item of list) {
        const values = [].concat(getValue(item)).filter((v) => v !== undefined && v !== null && v !== '');
        for (const v of new Set(values.map(String))) counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
};

/**
 * Đếm tại chỗ cho nhiều ô lọc cùng lúc (faceted): mỗi ô đếm trên danh sách đã áp MỌI ô lọc khác.
 * facets: { key: { selected, get: (item) => giá trị } } → trả { key: counts }.
 * `items` nên là danh sách đã áp các bộ lọc không phải ô chọn (vd: ô tìm kiếm).
 * Hàm thường (không phải hook) — gọi được ở bất kỳ đâu trong component.
 */
export const clientFacetCounts = (items, facets) => {
    const list = Array.isArray(items) ? items : [];
    const entries = Object.entries(facets);
    return Object.fromEntries(entries.map(([key, facet]) => {
        const others = entries.filter(([k]) => k !== key);
        const scoped = list.filter((item) => others.every(([, f]) => matchesFilter(f.selected, f.get(item))));
        return [key, countBy(scoped, facet.get)];
    }));
};

export const useClientCounts = (items, getValue) =>
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => countBy(items, getValue), [items]);

/** Đọc tổng số bản ghi từ phản hồi danh sách phân trang của BE. */
export const totalOf = (res) => {
    if (!res?.success) return undefined;
    const t = res.meta?.total ?? res.data?.total ?? res.pagination?.total;
    if (typeof t === 'number') return t;
    return Array.isArray(res.data) ? res.data.length : undefined;
};

const PROBE_DELAY_MS = 300;
const PROBE_CONCURRENCY = 4;
export const PROBE_MAX_OPTIONS = 15;

/**
 * Đếm qua BE cho màn phân trang: với mỗi lựa chọn, gọi `probe(value)` (API danh sách với lựa chọn đó,
 * giữ nguyên các bộ lọc khác, limit=1) để lấy tổng. Mỗi ô đếm theo các bộ lọc KHÁC (faceted),
 * nên `depsKey` chỉ nên chứa giá trị của các bộ lọc khác.
 * - Chờ 300ms sau khi bộ lọc đổi, tối đa 4 yêu cầu song song, nhớ kết quả theo depsKey.
 * - Bỏ qua khi số lựa chọn > PROBE_MAX_OPTIONS (tránh dồn hàng chục yêu cầu lên BE).
 */
export const useProbeCounts = (values, probe, depsKey, { enabled = true, max = PROBE_MAX_OPTIONS } = {}) => {
    const [counts, setCounts] = useState(undefined);
    const cache = useRef(new Map());
    const probeRef = useRef(probe);
    probeRef.current = probe;
    const valuesKey = (values || []).map(String).join('|');

    useEffect(() => {
        const list = (values || []).map(String);
        if (!enabled || list.length === 0 || list.length > max) { setCounts(undefined); return undefined; }
        const key = `${depsKey}::${valuesKey}`;
        if (cache.current.has(key)) { setCounts(cache.current.get(key)); return undefined; }
        let cancelled = false;
        const timer = setTimeout(async () => {
            const targets = ['', ...list];
            const result = {};
            let failed = false;
            let next = 0;
            const worker = async () => {
                while (!cancelled && next < targets.length) {
                    const value = targets[next++];
                    try {
                        const n = await probeRef.current(value);
                        if (typeof n === 'number') result[value] = n; else failed = true;
                    } catch {
                        failed = true;
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, targets.length) }, worker));
            if (cancelled) return;
            // Có lựa chọn đếm lỗi → ẩn hết số (tránh hiện "(0)" sai); không nhớ để lần sau thử lại.
            if (failed) { setCounts(undefined); return; }
            cache.current.set(key, result);
            setCounts(result);
        }, PROBE_DELAY_MS);
        return () => { cancelled = true; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depsKey, valuesKey, enabled, max]);

    return counts;
};

/**
 * Tiện ích cho màn có một object `filters`: đếm cho ô lọc `key` với các giá trị `values`.
 * `fetchTotal(filtersWithOverride)` gọi API danh sách (limit=1) và trả Promise<number> (dùng totalOf).
 * Mỗi ô bỏ qua chính nó và các khoá phân trang khi so sánh (faceted).
 */
export const useFacetCounts = (filters, key, values, fetchTotal, { enabled = true, max, ignore = ['page', 'limit', 'offset'] } = {}) => {
    const depsKey = useMemo(
        () => JSON.stringify(Object.entries(filters || {}).filter(([k]) => k !== key && !ignore.includes(k))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filters, key],
    );
    return useProbeCounts(values, (v) => fetchTotal({ ...filters, [key]: v }), depsKey, { enabled, max });
};
