import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import ReportExportAction from '../../components/common/ReportExportAction';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Award, CalendarDays, Download, Search, Users, X, AlertTriangle, Clock, XCircle, CheckCircle, LogOut } from 'lucide-react';
import {
    getPenaltyReportScope,
    getMyPenaltyReport,
    getUserPenaltyReport,
    getPenaltySummary,
    getPenaltyMeetingSummary,
    getPenaltyMeetingDetail,
} from '../../service/managerServices';

const CATEGORY_MAP = {
    present:    { label: 'Có mặt',       cls: 'bg-emerald-50 text-emerald-700' },
    late:       { label: 'Đi trễ',       cls: 'bg-amber-50 text-amber-700' },
    left_early: { label: 'Về sớm',       cls: 'bg-orange-50 text-orange-700' },
    absent:     { label: 'Vắng mặt',     cls: 'bg-rose-50 text-rose-700' },
    excused:    { label: 'Có lý do',     cls: 'bg-sky-50 text-sky-700' },
};

const EXCUSE_MAP = {
    pending:  'Lý do chờ duyệt',
    approved: 'Lý do đã duyệt',
    rejected: 'Lý do bị từ chối',
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthRange = (offset = 0) => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { from: ymd(first), to: ymd(last) };
};
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('vi-VN') : '');
const fmtTime = (s) => (s ? new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtDateTime = (s) => (s ? `${fmtTime(s)} ${fmtDate(s)}` : '');
const categoryText = (i) => `${CATEGORY_MAP[i.category]?.label || i.category}${i.category === 'late' && i.lateMinutes ? ` (${i.lateMinutes}p)` : ''}`;
const excuseText = (i) => (i.excuseStatus ? `${EXCUSE_MAP[i.excuseStatus]}${i.excuseReason ? `: ${i.excuseReason}` : ''}${i.excuseStatus === 'rejected' && i.excuseReviewNote ? ` (Từ chối: ${i.excuseReviewNote})` : ''}` : '');
const writeBook = (rows, sheetName, fileName) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheetName);
    XLSX.writeFile(book, fileName);
};
const ExportButton = ({ onClick, disabled }) => (
    <ReportExportAction format="xlsx" label="Xuất Excel"
        onClick={onClick}
        disabled={disabled}
        legacyClassName="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
    >
        <Download className="w-3.5 h-3.5" /> Xuất Excel
    </ReportExportAction>
);
const fmtPoints = (p) => (p > 0 ? `+${p}` : `${p}`);
const pointsCls = (p) => (p < 0 ? 'text-rose-600' : 'text-emerald-600');

const SummaryCards = ({ s, label = 'Số buổi họp' }) => {
    const cards = [
        { label, value: s.totalMeetings, icon: Users, cls: 'text-action-blue bg-blue-50' },
        { label: 'Đi trễ', value: s.late, icon: Clock, cls: 'text-amber-600 bg-amber-50' },
        { label: 'Về sớm', value: s.leftEarly, icon: LogOut, cls: 'text-orange-600 bg-orange-50' },
        { label: 'Vắng mặt', value: s.absent, icon: XCircle, cls: 'text-rose-600 bg-rose-50' },
        { label: 'Có lý do', value: s.excused, icon: CheckCircle, cls: 'text-sky-600 bg-sky-50' },
        { label: 'Tổng điểm trừ', value: fmtPoints(s.totalPoints), icon: AlertTriangle, cls: 'text-rose-600 bg-rose-50' },
    ];
    return (
        <StatisticGrid columns={6} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
                <StatisticCard key={c.label} label={c.label} value={c.value} icon={c.icon} tone={statisticTone(c.cls)} legacy={(
                <div key={c.label} className="bg-white rounded-2xl border border-platinum-tint p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.cls}`}>
                        <c.icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase text-slate-blue">{c.label}</p>
                        <p className="text-xl font-black text-midnight-indigo">{c.value}</p>
                    </div>
                </div>
                )} />
            ))}
        </StatisticGrid>
    );
};

const MeetingRows = ({ items, basePath }) => (
    <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
        <PaginatedCollection items={items} itemLabel="cuộc họp">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '13%' }} />
<col style={{ width: '30%' }} />
<col style={{ width: '18%' }} />
<col style={{ width: '30%' }} />
<col style={{ width: '9%' }} />
</colgroup>
            <thead className="bg-cloud-mist/50 text-[10px] uppercase text-slate-blue font-bold">
                <tr>
                    <th className="px-4 py-3 text-left">Ngày</th>
                    <th className="px-4 py-3 text-left">Cuộc họp</th>
                    <th className="px-4 py-3 text-left">Hình thức</th>
                    <th className="px-4 py-3 text-left">Lý do</th>
                    <th className="px-4 py-3 text-right">Điểm</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-platinum-tint">
                {items.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-blue text-sm">Không có cuộc họp nào có điểm danh trong khoảng thời gian này.</td></tr>
                ) : camaiPageItems.map((camaiRecord, camaiIndex) => ((i) => (
                    <tr key={i.meetingId} className="hover:bg-cloud-mist/20">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{fmtDate(i.startTime)}</td>
                        <td className="px-4 py-3">
                            <Link to={`${basePath}/meeting/${i.meetingId}`} className="font-bold text-xs text-midnight-indigo hover:text-action-blue">{i.title}</Link>
                            <p data-ui-text="secondary" className="text-[10px] text-slate-400">{i.meetingCode}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                            <span data-ui-text="badge" className={`text-[10px] font-bold px-2 py-0.5 rounded ${CATEGORY_MAP[i.category]?.cls || ''}`}>
                                {CATEGORY_MAP[i.category]?.label || i.category}
                                {i.category === 'late' && i.lateMinutes ? ` (${i.lateMinutes}p)` : ''}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600 max-w-[260px]">
                            {i.excuseStatus ? (
                                <>
                                    <span className="font-bold">{EXCUSE_MAP[i.excuseStatus]}</span>
                                    {i.excuseReason && <span className="block break-words">"{i.excuseReason}"</span>}
                                    {i.excuseStatus === 'rejected' && i.excuseReviewNote && (
                                        <span className="block text-rose-600 break-words">Từ chối: {i.excuseReviewNote}</span>
                                    )}
                                </>
                            ) : '--'}
                        </td>
                        <td className={`px-4 py-3 text-right font-black ${pointsCls(i.points)}`}>{fmtPoints(i.points)}</td>
                    </tr>
                ))(camaiRecord, camaiStartIndex + camaiIndex, (items)))}
            </tbody>
        </ResponsiveTable>
)}
</PaginatedCollection>
    </div>
);

const ParticipantRows = ({ items }) => (
    <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
        <PaginatedCollection items={items} itemLabel="người tham gia">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '25%' }} />
<col style={{ width: '12%' }} />
<col style={{ width: '12%' }} />
<col style={{ width: '16%' }} />
<col style={{ width: '26%' }} />
<col style={{ width: '9%' }} />
</colgroup>
            <thead className="bg-cloud-mist/50 text-[10px] uppercase text-slate-blue font-bold">
                <tr>
                    <th className="px-4 py-3 text-left">Nhân sự</th>
                    <th className="px-3 py-3 text-center">Giờ vào</th>
                    <th className="px-3 py-3 text-center">Giờ ra</th>
                    <th className="px-3 py-3 text-left">Tình trạng</th>
                    <th className="px-3 py-3 text-left">Lý do / ghi chú</th>
                    <th className="px-4 py-3 text-right">Điểm</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-platinum-tint">
                {items.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-blue text-sm">Không có thành viên nào.</td></tr>
                ) : camaiPageItems.map((camaiRecord, camaiIndex) => ((i) => (
                    <tr key={i.userId} className="hover:bg-cloud-mist/20">
                        <td className="px-4 py-3">
                            <p data-ui-text="primary" className="font-bold text-xs text-midnight-indigo">{i.fullName}</p>
                            <p data-ui-text="secondary" className="text-[10px] text-slate-blue">{[i.employeeCode, i.departmentName].filter(Boolean).join(' • ') || i.email}</p>
                        </td>
                        <td className="px-3 py-3 text-center text-xs">{fmtTime(i.checkInTime) || '--'}</td>
                        <td className="px-3 py-3 text-center text-xs">{fmtTime(i.checkOutTime) || '--'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                            <span data-ui-text="badge" className={`text-[10px] font-bold px-2 py-0.5 rounded ${CATEGORY_MAP[i.category]?.cls || ''}`}>{categoryText(i)}</span>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-600 max-w-[280px]">
                            {i.excuseStatus && (
                                <>
                                    <span className="font-bold">{EXCUSE_MAP[i.excuseStatus]}</span>
                                    {i.excuseReason && <span className="block break-words">"{i.excuseReason}"</span>}
                                    {i.excuseStatus === 'rejected' && i.excuseReviewNote && (
                                        <span className="block text-rose-600 break-words">Từ chối: {i.excuseReviewNote}</span>
                                    )}
                                </>
                            )}
                            {i.note && <span className="block break-words text-slate-blue">Ghi chú: {i.note}</span>}
                            {!i.excuseStatus && !i.note && '--'}
                        </td>
                        <td className={`px-4 py-3 text-right font-black ${pointsCls(i.points)}`}>{fmtPoints(i.points)}</td>
                    </tr>
                ))(camaiRecord, camaiStartIndex + camaiIndex, (items)))}
            </tbody>
        </ResponsiveTable>
)}
</PaginatedCollection>
    </div>
);

const AttendancePenaltyReport = () => {
    const location = useLocation();
    const basePath = '/' + (location.pathname.split('/')[1] || 'employee');
    const isAdminArea = basePath === '/business-admin';

    const [range, setRange] = useState(monthRange(0));
    const [rangePreset, setRangePreset] = useState('this-month');
    const [scope, setScope] = useState(null);
    const [tab, setTab] = useState(isAdminArea ? 'summary' : 'me');
    const [mine, setMine] = useState(null);
    const [summary, setSummary] = useState(null);
    const [meetingSummary, setMeetingSummary] = useState(null);
    const [meetingDetail, setMeetingDetail] = useState(null);
    const [departmentId, setDepartmentId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);
    const loadVersion = useRef(0);

    useEffect(() => {
        getPenaltyReportScope()
            .then((res) => setScope(res?.data?.scope || null))
            .catch(() => setScope(null));
    }, []);

    const load = useCallback(async () => {
        const version = ++loadVersion.current;
        setLoading(true);
        setError(null);
        try {
            const params = { ...range, departmentId: departmentId || undefined, search: search.trim() || undefined };
            const [personal, people, meetings] = await Promise.all([
                isAdminArea ? null : getMyPenaltyReport(range),
                scope ? getPenaltySummary(params) : null,
                scope ? getPenaltyMeetingSummary(params) : null,
            ]);
            if (version !== loadVersion.current) return;
            setMine(personal?.data || null);
            setSummary(people?.data || null);
            setMeetingSummary(meetings?.data || null);
        } catch (err) {
            if (version === loadVersion.current) setError(err?.message || 'Không tải được dữ liệu.');
        } finally {
            if (version === loadVersion.current) setLoading(false);
        }
    }, [range, departmentId, search, isAdminArea, scope]);

    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => { clearTimeout(t); loadVersion.current += 1; };
    }, [load]);

    const openDetail = async (row) => {
        setDetail({ loading: true, row });
        try {
            const res = await getUserPenaltyReport(row.userId, range);
            setDetail({ row, data: res?.data });
        } catch (err) {
            setDetail(null);
            setError(err?.message || 'Không tải được chi tiết.');
        }
    };

    const openMeetingDetail = async (row) => {
        setMeetingDetail({ loading: true, row });
        try {
            const res = await getPenaltyMeetingDetail(row.meetingId, { departmentId: departmentId || undefined });
            setMeetingDetail({ row, data: res?.data });
        } catch (err) {
            setMeetingDetail(null);
            setError(err?.message || 'Không tải được chi tiết.');
        }
    };

    const exportMeetings = () => {
        if (!meetingSummary?.rows?.length) return;
        writeBook(meetingSummary.rows.map((r, idx) => ({
            'STT': idx + 1,
            'Mã cuộc họp': r.meetingCode || '',
            'Cuộc họp': r.title,
            'Ngày họp': fmtDate(r.startTime),
            'Bắt đầu': fmtTime(r.startTime),
            'Kết thúc': fmtTime(r.endTime),
            'Phòng': r.roomName || '',
            'Chủ trì': r.hostName || '',
            'Số được mời': r.invited,
            'Có mặt': r.present,
            'Đi trễ': r.late,
            'Về sớm': r.leftEarly,
            'Vắng mặt': r.absent,
            'Có lý do': r.excused,
            'Lý do chờ duyệt': r.pendingExcuses,
            'Tổng điểm trừ': r.totalPoints,
        })), 'Theo cuoc hop', `bao-cao-diem-danh-theo-cuoc-hop_${range.from}_${range.to}.xlsx`);
    };

    const exportMeetingDetail = () => {
        const d = meetingDetail?.data;
        if (!d?.items?.length) return;
        writeBook(d.items.map((i, idx) => ({
            'STT': idx + 1,
            'Họ tên': i.fullName,
            'Mã CB': i.employeeCode || '',
            'Email': i.email,
            'Đơn vị': i.departmentName || '',
            'Giờ vào': fmtDateTime(i.checkInTime),
            'Giờ ra': fmtDateTime(i.checkOutTime),
            'Tình trạng': categoryText(i),
            'Lý do': excuseText(i),
            'Ghi chú': i.note || '',
            'Điểm': i.points,
        })), 'Chi tiet', `diem-danh_${d.meeting.meetingCode || d.meeting.id}_${ymd(new Date(d.meeting.startTime))}.xlsx`);
    };

    const exportUserDetail = () => {
        const d = detail?.data;
        if (!d?.items?.length) return;
        writeBook(d.items.map((i, idx) => ({
            'STT': idx + 1,
            'Ngày họp': fmtDate(i.startTime),
            'Mã cuộc họp': i.meetingCode || '',
            'Cuộc họp': i.title,
            'Tình trạng': categoryText(i),
            'Lý do': excuseText(i),
            'Điểm': i.points,
        })), 'Chi tiet', `diem-chuyen-can_${(detail.row.email || detail.row.userId).split('@')[0]}_${range.from}_${range.to}.xlsx`);
    };

    const exportExcel = () => {
        if (!summary?.rows?.length) return;
        const sheet = XLSX.utils.json_to_sheet(summary.rows.map((r, idx) => ({
            'STT': idx + 1,
            'Họ tên': r.fullName,
            'Email': r.email,
            'Đơn vị': r.departmentName || '',
            'Chức danh': r.positionTitle || '',
            'Số buổi họp': r.totalMeetings,
            'Có mặt': r.present,
            'Đi trễ': r.late,
            'Về sớm': r.leftEarly,
            'Vắng mặt': r.absent,
            'Có lý do': r.excused,
            'Lý do chờ duyệt': r.pendingExcuses,
            'Tổng điểm trừ': r.totalPoints,
        })));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Diem chuyen can cuoc hop');
        XLSX.writeFile(book, `diem-chuyen-can-cuoc-hop_${range.from}_${range.to}.xlsx`);
    };

    const summaryTitle = scope === 'school' ? 'Tổng hợp toàn trường' : 'Tổng hợp đơn vị';
    const tabs = useMemo(() => [
        ...(!isAdminArea ? [{ id: 'me', label: 'Của tôi', title: 'Của tôi', value: mine?.summary?.totalMeetings ?? '—', description: 'Số cuộc họp có điểm danh của bạn.', icon: Award }] : []),
        ...(scope ? [
            { id: 'summary', label: 'Theo nhân sự', name: `${summaryTitle} · Theo nhân sự`, title: 'Theo nhân sự', value: summary?.totals?.people ?? summary?.rows?.length ?? '—', description: scope === 'school' ? 'Phạm vi toàn trường.' : 'Phạm vi đơn vị.', icon: Users },
            { id: 'meetings', label: 'Theo cuộc họp', title: 'Theo cuộc họp', value: meetingSummary?.totals?.meetings ?? meetingSummary?.rows?.length ?? '—', description: 'Cuộc họp trong bộ lọc hiện tại.', icon: CalendarDays },
        ] : []),
    ], [isAdminArea, scope, summaryTitle, mine, summary, meetingSummary]);

    return (
        <div data-page-surface="wide" className="max-w-7xl mx-auto px-4 py-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl font-black text-midnight-indigo flex items-center gap-2">
                        <Award className="w-6 h-6 text-action-blue" /> Điểm chuyên cần cuộc họp
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">
                        Tính các cuộc họp đã kết thúc có điểm danh. Lý do được duyệt = 0 điểm; chờ duyệt hoặc bị từ chối vẫn giữ điểm trừ.
                    </p>
                </div>
            </div>

            <FilterBar variant="card" className="flex flex-wrap items-end gap-4">
                <FilterField label="Lọc nhanh">
                    <select value={rangePreset} onChange={event => {
                        const preset = event.target.value;
                        setRangePreset(preset);
                        if (preset !== 'custom') setRange(monthRange(preset === 'this-month' ? 0 : -1));
                    }}>
                        <option value="this-month">Tháng này</option>
                        <option value="last-month">Tháng trước</option>
                        <option value="custom">Tùy chọn khoảng ngày</option>
                    </select>
                </FilterField>
                <FilterField label="Từ ngày">
                    <input type="date" value={range.from} max={range.to} onChange={event => {
                        if (!event.target.value) return;
                        setRangePreset('custom');
                        setRange({ ...range, from: event.target.value });
                    }} />
                </FilterField>
                <FilterField label="Đến ngày">
                    <input type="date" value={range.to} min={range.from} onChange={event => {
                        if (!event.target.value) return;
                        setRangePreset('custom');
                        setRange({ ...range, to: event.target.value });
                    }} />
                </FilterField>
            </FilterBar>

            {tabs.length > 1 && (
                <StatisticGrid columns={tabs.length} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="group" aria-label="Chế độ xem điểm chuyên cần">
                    {tabs.map((t) => (
                        <StatisticCard
                            key={t.id}
                            label={t.label}
                            value={t.value}
                            helper={t.description}
                            icon={t.icon}
                            loading={loading}
                            selected={tab === t.id}
                            aria-label={t.name || t.label}
                            onClick={() => setTab(t.id)}
                        />
                    ))}
                </StatisticGrid>
            )}

            {error && <div data-ui-text="badge" className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{error}</div>}
            {isAdminArea && scope === null && !loading && (
                <div className="p-6 text-center text-sm text-slate-blue bg-white rounded-2xl border border-platinum-tint">Bạn không có quyền xem bảng tổng hợp.</div>
            )}

            {tab === 'me' && mine && (
                <>
                    <SummaryCards s={mine.summary} />
                    <MeetingRows items={mine.items} basePath={basePath} />
                </>
            )}

            {tab === 'summary' && scope && (
                <div className="space-y-4">
                    <FilterBar variant="card" className="flex flex-wrap items-center gap-2">
                        {scope === 'school' ? (
                            <FilterField label="Đơn vị"><select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-platinum-tint bg-white">
                                <option value="">Tất cả đơn vị</option>
                                {summary?.departments?.map((d) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                            </select></FilterField>
                        ) : (
                            <span data-ui-text="badge" className="px-3 py-2 text-xs font-bold rounded-xl bg-cloud-mist text-midnight-indigo">{summary?.departments?.[0]?.departmentName}</span>
                        )}
                        <FilterField label="Tìm kiếm"><div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email" className="pl-8 pr-3 py-2 text-xs rounded-xl border border-platinum-tint w-56" />
                        </div></FilterField>
                        <ReportExportAction format="xlsx" label="Xuất Excel" alignEnd
                            onClick={exportExcel}
                            disabled={!summary?.rows?.length}
                            legacyClassName="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" /> Xuất Excel
                        </ReportExportAction>
                    </FilterBar>

                    {summary && (
                        <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
                            <PaginatedCollection items={summary?.rows} itemLabel="nhân sự">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '32%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '11%' }} />
<col style={{ width: '12%' }} />
</colgroup>
                                <thead className="bg-cloud-mist/50 text-[10px] uppercase text-slate-blue font-bold">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Nhân sự</th>
                                        <th className="px-3 py-3 text-center">Số buổi</th>
                                        <th className="px-3 py-3 text-center">Có mặt</th>
                                        <th className="px-3 py-3 text-center">Đi trễ</th>
                                        <th className="px-3 py-3 text-center">Về sớm</th>
                                        <th className="px-3 py-3 text-center">Vắng</th>
                                        <th className="px-3 py-3 text-center">Có lý do</th>
                                        <th className="px-4 py-3 text-right">Tổng điểm</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint">
                                    {summary.rows.length === 0 ? (
                                        <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-blue text-sm">Không có dữ liệu trong khoảng thời gian này.</td></tr>
                                    ) : camaiPageItems.map((camaiRecord, camaiIndex) => ((r) => (
                                        <tr key={r.userId} onClick={() => openDetail(r)} className="hover:bg-cloud-mist/30 cursor-pointer">
                                            <td className="px-4 py-3">
                                                <p data-ui-text="primary" className="font-bold text-xs text-midnight-indigo">{r.fullName}</p>
                                                <p data-ui-text="secondary" className="text-[10px] text-slate-blue">{r.departmentName || 'N/A'}{r.positionTitle ? ` • ${r.positionTitle}` : ''}</p>
                                            </td>
                                            <td className="px-3 py-3 text-center text-xs font-bold">{r.totalMeetings}</td>
                                            <td className="px-3 py-3 text-center text-xs">{r.present}</td>
                                            <td className="px-3 py-3 text-center text-xs text-amber-700">{r.late || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-orange-700">{r.leftEarly || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-rose-700">{r.absent || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-sky-700">
                                                {r.excused || '-'}
                                                {r.pendingExcuses > 0 && <span data-ui-text="secondary" className="block text-[9px] text-amber-600">{r.pendingExcuses} chờ duyệt</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-black ${pointsCls(r.totalPoints)}`}>{fmtPoints(r.totalPoints)}</td>
                                        </tr>
                                    ))(camaiRecord, camaiStartIndex + camaiIndex, (summary.rows)))}
                                </tbody>
                                {summary.rows.length > 0 && (
                                    <tfoot className="bg-cloud-mist/40 text-xs font-bold">
                                        <tr>
                                            <td className="px-4 py-3">Tổng ({summary.totals.people} người)</td>
                                            <td />
                                            <td />
                                            <td className="px-3 py-3 text-center text-amber-700">{summary.totals.late}</td>
                                            <td className="px-3 py-3 text-center text-orange-700">{summary.totals.leftEarly}</td>
                                            <td className="px-3 py-3 text-center text-rose-700">{summary.totals.absent}</td>
                                            <td className="px-3 py-3 text-center text-sky-700">{summary.totals.excused}</td>
                                            <td className={`px-4 py-3 text-right font-black ${pointsCls(summary.totals.totalPoints)}`}>{fmtPoints(summary.totals.totalPoints)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </ResponsiveTable>
)}
</PaginatedCollection>
                        </div>
                    )}
                </div>
            )}

            {tab === 'meetings' && scope && (
                <div className="space-y-4">
                    <FilterBar variant="card" className="flex flex-wrap items-center gap-2">
                        {scope === 'school' ? (
                            <FilterField label="Đơn vị"><select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-platinum-tint bg-white">
                                <option value="">Tất cả đơn vị</option>
                                {meetingSummary?.departments?.map((d) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                            </select></FilterField>
                        ) : (
                            <span data-ui-text="badge" className="px-3 py-2 text-xs font-bold rounded-xl bg-cloud-mist text-midnight-indigo">{meetingSummary?.departments?.[0]?.departmentName}</span>
                        )}
                        <FilterField label="Tìm kiếm"><div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mã cuộc họp" className="pl-8 pr-3 py-2 text-xs rounded-xl border border-platinum-tint w-56" />
                        </div></FilterField>
                        <div className="ml-auto">
                            <ExportButton onClick={exportMeetings} disabled={!meetingSummary?.rows?.length} />
                        </div>
                    </FilterBar>
                    {scope === 'unit' && (
                        <p data-ui-text="secondary" className="text-[11px] text-slate-blue">Số liệu chỉ tính thành viên thuộc đơn vị của bạn.</p>
                    )}

                    {meetingSummary && (
                        <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
                            <PaginatedCollection items={meetingSummary?.rows} itemLabel="cuộc họp">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '25%' }} />
<col style={{ width: '15%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '9%' }} />
<col style={{ width: '11%' }} />
</colgroup>
                                <thead className="bg-cloud-mist/50 text-[10px] uppercase text-slate-blue font-bold">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Cuộc họp</th>
                                        <th className="px-3 py-3 text-left">Thời gian</th>
                                        <th className="px-3 py-3 text-center">Được mời</th>
                                        <th className="px-3 py-3 text-center">Có mặt</th>
                                        <th className="px-3 py-3 text-center">Đi trễ</th>
                                        <th className="px-3 py-3 text-center">Về sớm</th>
                                        <th className="px-3 py-3 text-center">Vắng</th>
                                        <th className="px-3 py-3 text-center">Có lý do</th>
                                        <th className="px-4 py-3 text-right">Tổng điểm</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint">
                                    {meetingSummary.rows.length === 0 ? (
                                        <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-blue text-sm">Không có cuộc họp nào có điểm danh trong khoảng thời gian này.</td></tr>
                                    ) : camaiPageItems.map((camaiRecord, camaiIndex) => ((r) => (
                                        <tr key={r.meetingId} onClick={() => openMeetingDetail(r)} className="hover:bg-cloud-mist/30 cursor-pointer">
                                            <td className="px-4 py-3">
                                                <p data-ui-text="primary" className="font-bold text-xs text-midnight-indigo">{r.title}</p>
                                                <p data-ui-text="secondary" className="text-[10px] text-slate-blue">{[r.roomName, r.hostName && `Chủ trì: ${r.hostName}`].filter(Boolean).join(' • ')}</p>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                                                {fmtDate(r.startTime)}
                                                <span data-ui-text="primary" className="block text-[10px] text-slate-blue">{fmtTime(r.startTime)}{r.endTime ? ` – ${fmtTime(r.endTime)}` : ''}</span>
                                            </td>
                                            <td className="px-3 py-3 text-center text-xs font-bold">{r.invited}</td>
                                            <td className="px-3 py-3 text-center text-xs">{r.present}</td>
                                            <td className="px-3 py-3 text-center text-xs text-amber-700">{r.late || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-orange-700">{r.leftEarly || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-rose-700">{r.absent || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-sky-700">
                                                {r.excused || '-'}
                                                {r.pendingExcuses > 0 && <span data-ui-text="secondary" className="block text-[9px] text-amber-600">{r.pendingExcuses} chờ duyệt</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-black ${pointsCls(r.totalPoints)}`}>{fmtPoints(r.totalPoints)}</td>
                                        </tr>
                                    ))(camaiRecord, camaiStartIndex + camaiIndex, (meetingSummary.rows)))}
                                </tbody>
                                {meetingSummary.rows.length > 0 && (
                                    <tfoot className="bg-cloud-mist/40 text-xs font-bold">
                                        <tr>
                                            <td className="px-4 py-3">Tổng ({meetingSummary.totals.meetings} cuộc họp)</td>
                                            <td />
                                            <td className="px-3 py-3 text-center">{meetingSummary.totals.invited}</td>
                                            <td />
                                            <td className="px-3 py-3 text-center text-amber-700">{meetingSummary.totals.late}</td>
                                            <td className="px-3 py-3 text-center text-orange-700">{meetingSummary.totals.leftEarly}</td>
                                            <td className="px-3 py-3 text-center text-rose-700">{meetingSummary.totals.absent}</td>
                                            <td className="px-3 py-3 text-center text-sky-700">{meetingSummary.totals.excused}</td>
                                            <td className={`px-4 py-3 text-right font-black ${pointsCls(meetingSummary.totals.totalPoints)}`}>{fmtPoints(meetingSummary.totals.totalPoints)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </ResponsiveTable>
)}
</PaginatedCollection>
                        </div>
                    )}
                </div>
            )}

            {loading && <p className="text-center text-xs text-slate-blue">Đang tải...</p>}

            {meetingDetail && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMeetingDetail(null)}>
                    <div className="bg-cloud-mist rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-base font-black text-midnight-indigo">{meetingDetail.row.title}</h3>
                                <p className="text-xs text-slate-blue">
                                    {fmtDateTime(meetingDetail.row.startTime)}
                                    {meetingDetail.row.roomName ? ` • ${meetingDetail.row.roomName}` : ''}
                                    {meetingDetail.data?.meeting?.hostName ? ` • Chủ trì: ${meetingDetail.data.meeting.hostName}` : ''}
                                    {meetingDetail.data?.meeting?.secretaryName ? ` • Thư ký: ${meetingDetail.data.meeting.secretaryName}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <ExportButton onClick={exportMeetingDetail} disabled={!meetingDetail.data?.items?.length} />
                                <Link to={`${basePath}/meeting/${meetingDetail.row.meetingId}`} className="px-3 py-2 text-xs font-bold rounded-xl border border-platinum-tint bg-white hover:bg-cloud-mist">Mở cuộc họp</Link>
                                <button onClick={() => setMeetingDetail(null)} className="text-slate-blue hover:text-midnight-indigo"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                        {meetingDetail.loading ? (
                            <p className="text-center text-xs text-slate-blue py-6">Đang tải...</p>
                        ) : (
                            <>
                                <SummaryCards s={{ ...meetingDetail.data.summary, totalMeetings: meetingDetail.data.items.length }} label="Được mời" />
                                <ParticipantRows items={meetingDetail.data.items} />
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {detail && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDetail(null)}>
                    <div className="bg-cloud-mist rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-midnight-indigo">{detail.row.fullName}</h3>
                                <p className="text-xs text-slate-blue">{detail.row.departmentName} • {fmtDate(range.from)} – {fmtDate(range.to)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <ExportButton onClick={exportUserDetail} disabled={!detail.data?.items?.length} />
                                <button onClick={() => setDetail(null)} className="text-slate-blue hover:text-midnight-indigo"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                        {detail.loading ? (
                            <p className="text-center text-xs text-slate-blue py-6">Đang tải...</p>
                        ) : (
                            <>
                                <SummaryCards s={detail.data.summary} />
                                <MeetingRows items={detail.data.items} basePath={basePath} />
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AttendancePenaltyReport;
