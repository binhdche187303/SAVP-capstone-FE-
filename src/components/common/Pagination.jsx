import React from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import './Pagination.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const PaginationControls = ({ currentPage: requestedPage = 1, totalPages: requestedTotalPages, onPageChange, disabled = false, hasNextPage, standard, compact: compactPreference }) => {
    const totalPages = standard && Number.isFinite(requestedTotalPages) ? Math.max(1, requestedTotalPages) : requestedTotalPages;
    const currentPage = standard ? Math.max(1, Math.min(requestedPage, Number.isFinite(totalPages) ? totalPages : requestedPage)) : requestedPage;
    const navRef = React.useRef(null);
    const [automaticCompact, setAutomaticCompact] = React.useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches);
    const compact = !standard && (compactPreference ?? automaticCompact);
    React.useEffect(() => {
        if (standard || typeof window.matchMedia !== 'function') return undefined;
        const media = window.matchMedia('(max-width: 639px)');
        const update = () => setAutomaticCompact(media.matches);
        update();
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, [standard]);

    if (!Number.isFinite(totalPages)) {
        return (
            <nav ref={navRef} data-pagination={standard ? 'standard' : undefined} aria-label="Phân trang" className="flex flex-wrap items-center gap-1.5">
                <button type="button" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))} className="px-2.5 py-1.5 border border-platinum-tint rounded-lg text-[10.5px] font-bold hover:bg-cloud-mist disabled:opacity-50">Trước</button>
                {standard ? (
                    <button type="button" disabled={disabled} aria-current="page" onClick={() => onPageChange(currentPage)}
                        className="w-7 h-7 rounded-lg border bg-action-blue text-white border-action-blue shadow-sm">{currentPage}</button>
                ) : <span className="px-2 text-[10.5px] font-bold text-slate-blue" aria-current="page">Trang {currentPage}</span>}
                <button type="button" disabled={disabled || !hasNextPage} onClick={() => onPageChange(currentPage + 1)} className="px-2.5 py-1.5 border border-platinum-tint rounded-lg text-[10.5px] font-bold hover:bg-cloud-mist disabled:opacity-50">Sau</button>
            </nav>
        );
    }

    if (totalPages <= 1 && !standard) return null;

    const getPages = () => {
        const pages = [];
        if (compact && totalPages > 5) {
            const visible = new Set([1, currentPage, totalPages]);
            if (currentPage <= 2) visible.add(2);
            if (currentPage >= totalPages - 1) visible.add(totalPages - 1);
            const numbers = [...visible].sort((a, b) => a - b);
            numbers.forEach((page, index) => {
                if (index > 0 && page - numbers[index - 1] > 1) pages.push('...');
                pages.push(page);
            });
            return pages;
        }
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                end = 4;
            }
            if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
            }

            pages.push(1);
            if (start > 2) {
                pages.push('...');
            }
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            if (end < totalPages - 1) {
                pages.push('...');
            }
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <nav ref={navRef} data-pagination={standard ? 'standard' : undefined} aria-label="Phân trang" className="flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={disabled || currentPage <= 1}
                className="px-2.5 py-1.5 border border-platinum-tint rounded-lg text-[10.5px] font-bold hover:bg-cloud-mist disabled:opacity-50 disabled:hover:bg-transparent"
            >
                Trước
            </button>
            {getPages().map((p, idx) => (
                <React.Fragment key={idx}>
                    {p === '...' ? (
                        <span className="px-1 text-slate-blue font-bold tracking-widest text-[10.5px]">...</span>
                    ) : (
                        <button
                            type="button"
                            disabled={disabled || totalPages <= 1}
                            aria-current={currentPage === p ? 'page' : undefined}
                            onClick={() => onPageChange(p)}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg text-[10.5px] font-bold transition-all border ${currentPage === p
                                    ? 'bg-action-blue text-white border-action-blue shadow-sm'
                                    : 'border-platinum-tint hover:bg-cloud-mist text-slate-blue'
                                }`}
                        >
                            {p}
                        </button>
                    )}
                </React.Fragment>
            ))}
            <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={disabled || currentPage >= totalPages}
                className="px-2.5 py-1.5 border border-platinum-tint rounded-lg text-[10.5px] font-bold hover:bg-cloud-mist disabled:opacity-50 disabled:hover:bg-transparent"
            >
                Sau
            </button>
        </nav>
    );
};

const RoutedPagination = props => {
    const { pathname } = useLocation();
    return <PaginationControls {...props} standard={STANDARD_AREAS.has(pathname.split('/')[1])} />;
};

const Pagination = props => useInRouterContext()
    ? <RoutedPagination {...props} /> : <PaginationControls {...props} standard />;

export default Pagination;
