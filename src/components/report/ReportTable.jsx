import ResponsiveTable from '../common/ResponsiveTable';
import PaginationFooter from '../common/PaginationFooter';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cardCls, thCls, tdCls } from '../common/uiClasses';
import { formatCell } from '../../utils/reportFormat';

const NUMERIC = ['number', 'percent', 'hours', 'minutes', 'duration'];

// Give descriptive columns more space than counts, across all report types.
const columnWeight = col => {
    if (/(?:fullName|ownerName|hostName|visitorName|handlerName|subject)$/.test(col.key)) return 3.2;
    if (/(?:departmentName|organization|classSectionName|subjectName|roomName|zoneName|cameraName|purpose)$/.test(col.key)) return 2.8;
    if (col.key === 'code') return 2.3;
    if (col.format === 'datetime') return 2;
    if (NUMERIC.includes(col.format)) return 1;
    return 1.5;
};

const ReportTable = ({ columns, rows = [], total = 0, page = 1, limit = 10, sortKey, sortDir, onSort, onPageChange, onPageSizeChange, loading }) => {

    const totalWeight = columns.reduce((total, col) => total + columnWeight(col), 0);

    return (
        <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
                <ResponsiveTable className="w-full">
                    <colgroup>
                        {columns.map(col => <col key={col.key} style={{ width: `${100 * columnWeight(col) / totalWeight}%` }} />)}
                    </colgroup>
                    <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                        <tr>
                            {columns.map((col) => {
                                const active = sortKey === col.key;
                                const Icon = !active ? ArrowUpDown : sortDir === 'desc' ? ArrowDown : ArrowUp;
                                return (
                                    <th key={col.key} className={`${thCls} ${NUMERIC.includes(col.format) ? 'text-right' : ''}`}>
                                        <button type="button" onClick={() => onSort?.(col.key)} className="inline-flex items-center gap-1 uppercase hover:text-action-blue">
                                            {col.label}
                                            <Icon className={`w-3 h-3 ${active ? 'text-action-blue' : 'text-steel-gray'}`} />
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className={loading ? 'opacity-50' : ''}>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-xs text-slate-blue">
                                    {loading ? 'Đang tải dữ liệu…' : 'Không có dữ liệu trong kỳ đã chọn'}
                                </td>
                            </tr>
                        ) : rows.map((row, i) => (
                            <tr key={i} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40">
                                {columns.map((col) => (
                                    <td key={col.key} className={`${tdCls} ${NUMERIC.includes(col.format) ? 'text-right tabular-nums' : ''}`}>
                                        {formatCell(row[col.key], col.format)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </ResponsiveTable>
            </div>
            <PaginationFooter
                currentPage={page}
                totalPages={Math.ceil(total / limit)}
                totalItems={total}
                pageSize={limit}
                onPageSizeChange={onPageSizeChange}
                onPageChange={onPageChange}
                itemLabel={"bản ghi"}
                loading={loading}
            />
        </div>
    );
};

export default ReportTable;
