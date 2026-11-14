import { useLayoutEffect, useRef } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import './ResponsiveTable.css';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const Table = ({ standard, children, className = '', ...props }) => {
    const ref = useRef(null);
    useLayoutEffect(() => {
        if (!standard) return undefined;
        const table = ref.current;
        const container = table.parentElement;
        const update = () => {
            const heading = table.tHead?.rows[table.tHead.rows.length - 1];
            const headers = [...(heading?.cells || [])].flatMap(cell =>
                Array(cell.colSpan || 1).fill(cell.textContent.replace(/\s+/g, ' ').trim() ||
                    (cell.querySelector('input[type="checkbox"]') ? 'Chọn' : cell.querySelector('[aria-label]')?.getAttribute('aria-label') || ''))
            );
            const columns = headers.length || Math.max(1, ...[...table.tBodies].flatMap(body => [...body.rows].map(row => row.cells.length)));
            container.dataset.tableLayout = container.clientWidth < Math.max(560, columns * 132) ? 'cards' : 'table';
            table.setAttribute('role', props.role || 'table');
            [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])].forEach(body => {
                body.setAttribute('role', 'rowgroup');
                [...body.rows].forEach(row => {
                    row.setAttribute('role', 'row');
                    let column = 0;
                    [...row.cells].forEach(cell => {
                        cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell');
                        const emptyTotal = body.tagName === 'TFOOT' && !cell.textContent.trim() && !cell.children.length;
                        if (emptyTotal) cell.dataset.tableEmpty = 'true';
                        else delete cell.dataset.tableEmpty;
                        if (cell.colSpan > 1) {
                            cell.dataset.tableSpan = 'true';
                            delete cell.dataset.tableLabel;
                        } else if (!emptyTotal) {
                            delete cell.dataset.tableSpan;
                            cell.dataset.tableLabel = headers[column] || (column === columns - 1 ? 'Thao tác' : 'Thông tin');
                        } else delete cell.dataset.tableLabel;
                        column += cell.colSpan || 1;
                    });
                });
            });
        };
        update();
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        resize?.observe(container);
        if (!resize) window.addEventListener('resize', update);
        // Descendant components can fetch rows or change columns independently.
        const mutations = new MutationObserver(update);
        mutations.observe(table, { childList: true, subtree: true, characterData: true });
        return () => { resize?.disconnect(); window.removeEventListener('resize', update); mutations.disconnect(); };
    }, [standard, children, props.role]);

    const table = <table {...props} ref={ref} className={`${className}${standard ? ' camai-responsive-table' : ''}`}>{children}</table>;
    return standard ? <div className="camai-table-container">{table}</div> : table;
};

const Routed = props => {
    const { pathname } = useLocation();
    return <Table {...props} standard={AREAS.has(pathname.split('/')[1])} />;
};
const ResponsiveTable = props => useInRouterContext() ? <Routed {...props} /> : <Table {...props} standard />;
export default ResponsiveTable;
