import ResponsiveTable from '../common/ResponsiveTable';
import PaginationFooter from '../common/PaginationFooter';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cardCls, thCls, tdCls } from '../common/uiClasses';
import { formatCell } from '../../utils/reportFormat';
import './ReportTable.css';

const NUMERIC = ['number', 'percent', 'hours', 'minutes', 'duration'];
const ROOM_COLUMN_WIDTHS = {
    roomName: '18.5%', building: '14%', capacity: '10%', meetingCount: '12%',
    bookedHours: '8.5%', usedHours: '13.5%', utilizationRate: '12.5%', noShowCount: '11%',
};

// Độ rộng tối thiểu (px) theo loại cột; tổng = min-width của bảng.
// Màn rộng: các cột giãn theo tỉ lệ; màn hẹp: bảng cuộn ngang, không chồng chữ.
const NOWRAP_KEYS = ['severityLabel', 'code', 'plateNumber'];
const keepOneLine = col => col.format === 'datetime' || NUMERIC.includes(col.format) || NOWRAP_KEYS.includes(col.key);
const columnMinWidth = col => {
    if (col.format === 'datetime') return 118;
    if (col.format === 'duration') return 80;
    if (NUMERIC.includes(col.format)) return 76;
    if (NOWRAP_KEYS.includes(col.key)) return col.key === 'severityLabel' ? 96 : 92;
    if (/(?:fullName|ownerName|hostName|visitorName)$/.test(col.key)) return 116;
    if (/(?:departmentName|organization|classSectionName|subjectName|roomName|zoneName|cameraName|purpose|typeLabel|handlerName|subject)$/.test(col.key)) return 104;
    if (col.key === 'statusLabel') return 100;
    return 88;
};

const ReportTable = ({ columns, rows = [], total = 0, page = 1, limit = 10, sortKey, sortDir, onSort, onPageChange, onPageSizeChange, loading }) => {

    const tableMinWidth = columns.reduce((total, col) => total + columnMinWidth(col), 0);
    const isRoomReport = columns.some(col => col.key === 'usedHours') && columns.every(col => ROOM_COLUMN_WIDTHS[col.key]);

    return (
        <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
                <ResponsiveTable className={`w-full report-data-table${isRoomReport ? ' report-room-usage-table' : ''}`} minTableWidth={720} style={isRoomReport ? undefined : { minWidth: tableMinWidth }}>
                    <colgroup>
                        {columns.map(col => <col key={col.key} style={{ width: isRoomReport ? ROOM_COLUMN_WIDTHS[col.key] : `${100 * columnMinWidth(col) / tableMinWidth}%` }} />)}
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
                                    {loading ? 'Đang tải dữ liệu...' : 'Không có dữ liệu trong kỳ đã chọn'}
                                </td>
                            </tr>
                        ) : rows.map((row, i) => (
                            <tr key={i} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40">
                                {columns.map((col) => (
                                    <td key={col.key} className={`${tdCls} ${NUMERIC.includes(col.format) ? 'text-right tabular-nums' : ''}`} data-nowrap={keepOneLine(col) || undefined}>
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
