import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock3, Download, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
    buildGuardSummary,
    exportGuardGateEventsCsv,
    GUARD_GATE_EVENTS_STORAGE_KEY,
    getGuardGateEvents
} from '../../service/guardAccessService';

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

const formatDateInputLabel = (value) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return formatDate(date);
};

const formatRangeLabel = (rangeMode, anchorDate) => {
    const anchor = new Date(`${anchorDate}T00:00:00`);
    if (Number.isNaN(anchor.getTime())) return '';
    if (rangeMode === 'week') {
        const day = anchor.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const start = new Date(anchor);
        start.setDate(anchor.getDate() + mondayOffset);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return `${formatDate(start)} - ${formatDate(end)}`;
    }
    return formatDate(anchor);
};

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
    const [rangeMode, setRangeMode] = useState('day');
    const [anchorDate, setAnchorDate] = useState(() => todayKey());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    useEffect(() => {
        const handler = () => {
            setEvents(getGuardGateEvents());
            setPage(1);
        };
        const storageHandler = (event) => {
            if (event.key !== GUARD_GATE_EVENTS_STORAGE_KEY) return;
            handler();
        };
        window.addEventListener('guard-gate-events-updated', handler);
        window.addEventListener('storage', storageHandler);
        return () => {
            window.removeEventListener('guard-gate-events-updated', handler);
            window.removeEventListener('storage', storageHandler);
        };
    }, []);

    const summary = useMemo(
        () => buildGuardSummary(events, { rangeMode, anchorDate }),
        [anchorDate, events, rangeMode]
    );
    const rows = useMemo(() => summary.presenceByPerson || [], [summary.presenceByPerson]);
    const rangeLabel = formatRangeLabel(rangeMode, anchorDate);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const paginatedRows = rows.slice(pageStart, pageStart + pageSize);
    const pageEnd = Math.min(pageStart + paginatedRows.length, rows.length);
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
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <Clock3 className="w-5 h-5 text-action-blue" />
                        Quản lý hiện diện khuôn viên
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">Chỉ hiển thị người đã phát sinh tín hiệu vào/ra từ cổng trong khoảng lọc, phù hợp hệ thống có số lượng hồ sơ lớn.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1 bg-cloud-mist/70 rounded-xl p-1">
                        {[
                            { value: 'day', label: 'Ngày' },
                            { value: 'week', label: 'Tuần' }
                        ].map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => { setRangeMode(option.value); setPage(1); }}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${rangeMode === option.value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <label className="relative min-w-[150px] px-3 py-2 rounded-xl border border-platinum-tint text-midnight-indigo bg-white text-xs font-bold flex items-center justify-between gap-2 cursor-pointer">
                        <span>{formatDateInputLabel(anchorDate)}</span>
                        <Calendar className="w-4 h-4 text-slate-blue" />
                        <input
                            type="date"
                            value={anchorDate}
                            onChange={(event) => { setAnchorDate(event.target.value || todayKey()); setPage(1); }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label="Chọn ngày mốc"
                        />
                    </label>
                    <button type="button" onClick={() => { setEvents(getGuardGateEvents()); setPage(1); }} className="px-3 py-2 rounded-xl border border-platinum-tint text-slate-blue bg-white text-xs font-bold flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Làm mới
                    </button>
                    <button type="button" onClick={() => exportGuardGateEventsCsv(events)} className="px-3 py-2 rounded-xl border border-blue-200 text-action-blue bg-blue-50 text-xs font-bold flex items-center gap-2">
                        <Download className="w-4 h-4" /> Xuất nhật ký CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Users className="w-5 h-5 text-action-blue" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{summary.present}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Đang có mặt</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{summary.entries}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Lượt vào</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
                    <Clock3 className="w-5 h-5 text-amber-600" />
                    <p className="text-2xl font-bold text-midnight-indigo mt-3">{summary.presencePeopleCount}</p>
                    <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Người có dữ liệu hiện diện</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm min-h-[150px]">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <Clock3 className="w-5 h-5 text-action-blue" />
                            <p className="text-xl font-bold text-midnight-indigo mt-3">{summary.presenceText}</p>
                            <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">Tổng thời gian quy đổi</p>
                        </div>
                    </div>
                    <div className="h-14 mt-3">
                        {presenceChartData.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={presenceChartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#4f6b91', fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
                                    <Tooltip
                                        cursor={{ fill: '#eff6ff' }}
                                        formatter={(value) => [formatMinutes(value), 'Thời gian']}
                                        labelStyle={{ color: '#003459', fontWeight: 700 }}
                                        contentStyle={{ borderRadius: 12, borderColor: '#d8e3ef', fontSize: 12 }}
                                    />
                                    <Bar dataKey="minutes" fill="#007BFF" radius={[6, 6, 0, 0]} maxBarSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full rounded-xl bg-cloud-mist/50 flex items-center justify-center text-[11px] font-bold text-slate-blue">
                                Chưa có dữ liệu
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Hiện diện theo từng người</h2>
                    <p className="text-xs text-slate-blue mt-1">Khoảng lọc: <span className="font-bold text-midnight-indigo">{rangeLabel}</span>. Người đã ra vẫn được tính đủ thời gian từ cặp vào/ra; người chưa ra được tính đến hiện tại nếu khoảng lọc gồm hôm nay.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
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
                                            <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[state]}`}>
                                                {statusText}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-midnight-indigo">{person.lastGateName}</td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 text-action-blue text-xs font-bold">
                                                {person.plateNumber || '--'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-slate-blue">{person.lastSeenText}</td>
                                        <td className="px-5 py-4 font-bold text-midnight-indigo">{person.totalPresenceText}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="px-5 py-4 border-t border-platinum-tint bg-cloud-mist/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-xs text-slate-blue">
                        Hiển thị <span className="font-bold text-midnight-indigo">{rows.length ? pageStart + 1 : 0}</span>
                        {' - '}
                        <span className="font-bold text-midnight-indigo">{pageEnd}</span>
                        {' / '}
                        <span className="font-bold text-midnight-indigo">{rows.length}</span> người
                    </p>
                    <div className="flex items-center gap-2">
                        <select
                            value={pageSize}
                            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                            className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo"
                        >
                            {[5, 10, 15].map(size => (
                                <option key={size} value={size}>{size} dòng</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => setPage(value => Math.max(1, value - 1))}
                            disabled={safePage <= 1}
                            className="w-9 h-9 rounded-xl border border-platinum-tint bg-white text-slate-blue disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
                            aria-label="Trang trước"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold text-midnight-indigo min-w-[72px] text-center">
                            {safePage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage(value => Math.min(totalPages, value + 1))}
                            disabled={safePage >= totalPages}
                            className="w-9 h-9 rounded-xl border border-platinum-tint bg-white text-slate-blue disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
                            aria-label="Trang sau"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GatePresenceManagement;
