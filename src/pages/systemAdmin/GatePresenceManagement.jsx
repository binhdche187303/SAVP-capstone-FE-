import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import ReportActions from '../../components/common/ReportActions';
import ReportExportAction from '../../components/common/ReportExportAction';
import StatisticCard from '../../components/common/StatisticCard';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import PaginationFooter from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, ShieldCheck, Users } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
    buildGuardSummary,
    exportGuardGateEventsCsv,
    fetchGuardGateEventsInRange,
    filterGuardGateEvents,
    GUARD_GATE_EVENTS_STORAGE_KEY,
    getGuardGateEvents
} from '../../service/guardAccessService';
import SharedStatCard, { STAT_VALUE_CLS } from '../../components/common/StatCard';

const statusClass = {
    present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    open: 'bg-amber-50 text-amber-700 border-amber-200',
    left: 'bg-blue-50 text-action-blue border-blue-200',
    none: 'bg-slate-100 text-slate-blue border-platinum-tint'
};

const todayKey = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDate = (date) => date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

const formatMinutes = (minutes) => {
    const safeMinutes = Math.max(0, Math.round(minutes || 0));
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    if (!hours) return `${mins} phút`;
    if (!mins) return `${hours} giờ`;
    return `${hours} giờ ${mins} phút`;
};

const GatePresenceManagement = () => {
    const [events, setEvents] = useState(() => getGuardGateEvents());
    const [fromDate, setFromDate] = useState(todayKey);
    const [toDate, setToDate] = useState(todayKey);
    const [reloadCount, setReloadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');
        setEvents([]);
        fetchGuardGateEventsInRange(fromDate, toDate)
            .then(apiEvents => {
                if (!active) return;
                // API trả danh sách rỗng là trạng thái hợp lệ, không được giữ lại dữ liệu demo cũ.
                setEvents(Array.isArray(apiEvents) ? apiEvents : []);
                setPage(1);
            })
            .catch(() => { if (active) setLoadError('Không tải được dữ liệu hiện diện trong khoảng ngày đã chọn.'); })
            .finally(() => { if (active) setLoading(false); });
        const handler = () => {
            setReloadCount(value => value + 1);
            setPage(1);
        };
        const storageHandler = (event) => {
            if (event.key !== GUARD_GATE_EVENTS_STORAGE_KEY) return;
            handler();
        };
        window.addEventListener('guard-gate-events-updated', handler);
        window.addEventListener('storage', storageHandler);
        return () => {
            active = false;
            window.removeEventListener('guard-gate-events-updated', handler);
            window.removeEventListener('storage', storageHandler);
        };
    }, [fromDate, toDate, reloadCount]);

    const summary = useMemo(
        () => buildGuardSummary(events, { fromDate, toDate }),
        [fromDate, toDate, events]
    );
    const rows = useMemo(() => summary.presenceByPerson || [], [summary.presenceByPerson]);
    const rangeLabel = `${formatDate(new Date(`${fromDate}T00:00:00`))} - ${formatDate(new Date(`${toDate}T00:00:00`))}`;
    const filteredEvents = useMemo(() => filterGuardGateEvents(events, { fromDate, toDate }), [events, fromDate, toDate]);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const paginatedRows = rows.slice(pageStart, pageStart + pageSize);

    const presenceChartData = useMemo(() => {
        const grouped = rows.reduce((acc, person) => {
            if (!person.totalPresenceMinutes) return acc;
            const role = person.personRole || 'Khác';
            acc[role] = (acc[role] || 0) + person.totalPresenceMinutes;
            return acc;
        }, {});
        const roleOrder = ['Sinh viên', 'Giảng viên', 'Nhân viên', 'Bảo vệ', 'Khác'];
        return Object.entries(grouped)
            .sort(([roleA], [roleB]) => {
                const indexA = roleOrder.indexOf(roleA);
                const indexB = roleOrder.indexOf(roleB);
                return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
            })
            .map(([role, minutes]) => ({
                name: role,
                minutes
            }));
    }, [rows]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <Clock3 className="w-5 h-5 text-action-blue" />
                        Quản lý hiện diện khuôn viên
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">Chỉ hiển thị người đã phát sinh tín hiệu vào/ra từ cổng trong khoảng lọc, phù hợp hệ thống có số lượng hồ sơ lớn.</p>
                </div>
                <ReportActions>
                    <ReportExportAction format="csv" initialRange={{ from: fromDate, to: toDate }} filterSummary={['Các lượt ghi nhận trong khoảng ngày đang chọn.']} label="Xuất nhật ký CSV" type="button" disabled={loading || Boolean(loadError) || !filteredEvents.length} onClick={() => exportGuardGateEventsCsv(filteredEvents)} legacyClassName="px-3 py-2 rounded-xl border border-blue-200 text-action-blue bg-blue-50 text-xs font-bold flex items-center gap-2">
                        <Download className="w-4 h-4" /> Xuất nhật ký CSV
                    </ReportExportAction>
                    <RefreshButton
                        type="button"
                        busy={loading}
                        onClick={() => { setReloadCount(value => value + 1); setPage(1); }}
                    />
                </ReportActions>
            </div>

            <FilterBar variant="card" data-filter-grid className="grid gap-4">

                <div className="camai-filter-period-row">
                    <CalendarRangePresets from={fromDate} to={toDate} onChange={range => { setFromDate(range.from); setToDate(range.to); setPage(1); }} />
                    <div className="camai-filter-period-dates">
                        <FilterField label="Từ ngày">
                            <input
                                type="date"
                                value={fromDate}
                                max={toDate}
                                onChange={(event) => { if (event.target.value) { setFromDate(event.target.value); setPage(1); } }}
                                className="w-full"
                            />
                        </FilterField>
                        <FilterField label="Đến ngày">
                            <input
                                type="date"
                                value={toDate}
                                min={fromDate}
                                onChange={(event) => { if (event.target.value) { setToDate(event.target.value); setPage(1); } }}
                                className="w-full"
                            />
                        </FilterField>
                    </div>
                </div>
            </FilterBar>

            {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}

            <StatisticGrid columns={4} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatisticCard loading={loading} label="Đang có mặt" value={summary.present} icon={Users} />
                <StatisticCard loading={loading} label="Lượt vào" value={summary.entries} icon={ShieldCheck} tone="success" />
                <StatisticCard loading={loading} label="Người có dữ liệu hiện diện" value={summary.presencePeopleCount} icon={Clock3} />
                <StatisticCard label="Tổng thời gian quy đổi" value={summary.presenceText} icon={Clock3} compactValue loading={loading} />
            </StatisticGrid>

            {!loading && presenceChartData.length > 0 && (
                <section className="bg-white border border-platinum-tint rounded-2xl shadow-sm p-[20px]">
                    <h2 className="text-sm font-bold text-midnight-indigo mb-4">Thời gian hiện diện theo nhóm đối tượng</h2>
                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={presenceChartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#4f6b91', fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                                <Tooltip cursor={{ fill: '#eff6ff' }} formatter={value => [formatMinutes(value), 'Thời gian']}
                                    labelStyle={{ color: '#003459', fontWeight: 700 }} contentStyle={{ borderRadius: 12, borderColor: '#d8e3ef', fontSize: 12 }} />
                                <Bar dataKey="minutes" fill="#007BFF" radius={[6, 6, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-[20px] border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Hiện diện theo từng người</h2>
                    <p className="text-xs text-slate-blue mt-1">Khoảng lọc: <span className="font-bold text-midnight-indigo">{rangeLabel}</span>. Người đã ra vẫn được tính đủ thời gian từ cặp vào/ra; người chưa ra được tính đến hiện tại nếu khoảng lọc gồm hôm nay.</p>
                </div>
                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '29%' }} />
<col style={{ width: '14%' }} />
<col style={{ width: '14%' }} />
<col style={{ width: '13%' }} />
<col style={{ width: '16%' }} />
<col style={{ width: '14%' }} />
</colgroup>
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr>
                                <th className="text-left px-5 py-4">Người</th>
                                <th className="text-left px-5 py-4">Trạng thái</th>
                                <th className="text-left px-5 py-4">Cổng cuối</th>
                                <th className="text-left px-5 py-4">Biển số</th>
                                <th className="text-left px-5 py-4">Lần ghi nhận cuối</th>
                                <th className="text-left px-5 py-4">Thời gian hiện diện</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map(person => {
                                const state = person.isPresent ? 'present' : person.isOpenInRange ? 'open' : person.lastDirection ? 'left' : 'none';
                                const statusText = person.isPresent
                                    ? 'Đang có mặt'
                                    : person.isOpenInRange
                                        ? 'Chưa ghi nhận ra'
                                        : person.lastDirection
                                            ? 'Đã ra'
                                            : 'Chưa vào';
                                return (
                                    <tr key={person.userId} className="border-t border-platinum-tint/70">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-midnight-indigo">{person.personName}</p>
                                            <p className="text-xs text-slate-blue">{person.personRole} · {person.personCode}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span data-ui-text="badge" className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[state]}`}>
                                                {statusText}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-midnight-indigo">{person.lastGateName}</td>
                                        <td className="px-5 py-4">
                                            <span data-ui-text="badge" className="inline-flex px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 text-action-blue text-xs font-bold">
                                                {person.plateNumber || '--'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-slate-blue">{person.lastSeenText}</td>
                                        <td className="px-5 py-4 font-bold text-midnight-indigo">{person.totalPresenceText}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </ResponsiveTable>
                </div>
                <PaginationFooter
                    currentPage={safePage}
                    totalPages={totalPages}
                    totalItems={rows.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    itemLabel={"người"}
                    onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                />
            </div>
        </div>
    );
};

export default GatePresenceManagement;
