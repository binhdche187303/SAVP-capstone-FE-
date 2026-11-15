import { useEffect, useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import PaginationFooter from './PaginationFooter';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const itemKey = item => Array.isArray(item) ? JSON.stringify(item[0]) : item && typeof item === 'object'
    ? item.id ?? item.userId ?? item.meetingId ?? item.studentId ?? item.zoneId ?? item.roomId ?? item.departmentId ?? item.deviceId ?? item.code ?? item.key ?? JSON.stringify(item)
    : item;

const Collection = ({ standard, items, children, itemLabel = 'bản ghi', initialPageSize = 10, resetKey, revealAdded = false, activeIndex, loading = false, note, paginationTone }) => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const records = Array.isArray(items) ? items : [];
    const keys = records.map(itemKey);
    const identity = resetKey ?? JSON.stringify([...keys].sort());
    const previous = useRef({ identity, keys });
    const focusedIndex = useRef(undefined);
    useEffect(() => {
        const currentKeys = new Set(keys);
        const addedOnly = resetKey === undefined && previous.current.keys.every(key => currentKeys.has(key));
        if (revealAdded && previous.current.keys.length > 0 && keys.length > previous.current.keys.length) {
            setPage(Math.ceil(keys.length / pageSize));
        } else if (identity !== previous.current.identity && !addedOnly) setPage(1);
        previous.current = { identity, keys };
        // Identity tracks the record set; live arrivals do not send the reader back to page one.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identity, records.length, revealAdded, pageSize]);
    useEffect(() => {
        if (Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < records.length && activeIndex !== focusedIndex.current) {
            focusedIndex.current = activeIndex;
            setPage(Math.floor(activeIndex / pageSize) + 1);
        }
    }, [activeIndex, records.length, pageSize]);
    if (!standard) return children(records, 0);
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return <>
        {children(records.slice(startIndex, startIndex + pageSize), startIndex)}
        <PaginationFooter currentPage={safePage} totalPages={totalPages} totalItems={records.length}
            pageSize={pageSize} onPageChange={setPage} loading={loading} itemLabel={itemLabel} note={note} tone={paginationTone}
            onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    </>;
};

const Routed = props => {
    const { pathname } = useLocation();
    return <Collection {...props} standard={AREAS.has(pathname.split('/')[1])} />;
};

// Page complete record collections; server-paginated lists retain their existing footer.
// The render callback receives the original index so editing/deleting rows keeps its target.
const PaginatedCollection = props => useInRouterContext() ? <Routed {...props} /> : <Collection {...props} standard />;
export default PaginatedCollection;
