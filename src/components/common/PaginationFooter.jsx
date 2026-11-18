import { useInRouterContext, useLocation } from 'react-router-dom';
import Pagination from './Pagination';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const RoutedRegion = ({ legacyVisible, children }) => {
    const { pathname } = useLocation();
    return STANDARD_AREAS.has(pathname.split('/')[1]) || legacyVisible ? children : null;
};

// Operational lists keep their footer even for one page; legacy areas retain their visibility rules.
export const PaginationRegion = props => useInRouterContext() ? <RoutedRegion {...props} /> : props.children;

const Footer = ({ currentPage = 1, totalPages, onPageChange, totalItems, pageSize, visibleCount, itemLabel = 'bản ghi', loading = false, hasNextPage, note, compact, tone }) => {
    const knownTotal = Number.isFinite(totalItems);
    const start = (currentPage - 1) * (pageSize || 0) + 1;
    const first = knownTotal && (totalItems === 0 || visibleCount === 0 || start > totalItems) ? 0 : start;
    const count = visibleCount ?? pageSize ?? 0;
    const last = knownTotal ? (first === 0 ? 0 : Math.min(first + count - 1, totalItems)) : null;
    const summary = loading ? 'Đang tải dữ liệu...' : knownTotal
        ? `Hiển thị ${first}–${Math.max(0, last)} / ${totalItems.toLocaleString('vi-VN')} ${itemLabel}`
        : `Trang ${currentPage}${visibleCount !== undefined ? ` · ${visibleCount} ${itemLabel} trên trang` : ''}`;

    return (
        <div data-pagination-footer="standard" data-pagination-tone={tone} className="camai-pagination-footer">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="min-w-0 text-slate-blue font-medium">
                    <span>{summary}</span>
                    {note && <p className="mt-1 text-xs font-normal">{note}</p>}
                </div>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} disabled={loading} hasNextPage={hasNextPage} compact={compact} />
        </div>
    );
};

const RoutedFooter = ({ legacy, ...props }) => {
    const { pathname } = useLocation();
    return STANDARD_AREAS.has(pathname.split('/')[1]) ? <Footer {...props} /> : (legacy || null);
};

// A shared page can retain its original footer for Teacher and Student.
const PaginationFooter = ({ legacy, ...props }) => {
    const inRouter = useInRouterContext();
    return inRouter ? <RoutedFooter {...props} legacy={legacy} /> : <Footer {...props} />;
};

export default PaginationFooter;
