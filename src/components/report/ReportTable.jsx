import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Pagination from '../common/Pagination';
import { cardCls, thCls, tdCls } from '../common/uiClasses';
import { formatCell } from '../../utils/reportFormat';

const NUMERIC = ['number', 'percent', 'hours', 'minutes', 'duration'];

const ReportTable = ({ columns, rows = [], total = 0, page = 1, limit = 20, sortKey, sortDir, onSort, onPageChange, loading }) => {
    const first = total === 0 ? 0 : (page - 1) * limit + 1;
    const last = Math.min(page * limit, total);
    return (
        <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
                <table className="w-full">
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
                </table>
            </div>
            <div className="px-4 py-3 border-t border-platinum-tint flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-blue">Hiển thị {first}–{last} / {total.toLocaleString('vi-VN')}</span>
                <Pagination currentPage={page} totalPages={Math.ceil(total / limit)} onPageChange={onPageChange} />
            </div>
        </div>
    );
};

export default ReportTable;
