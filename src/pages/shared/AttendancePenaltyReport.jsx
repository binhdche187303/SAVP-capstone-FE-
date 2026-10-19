import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Award, Download, Search, Users, X, AlertTriangle, Clock, XCircle, CheckCircle, LogOut } from 'lucide-react';
import {
    getPenaltyReportScope,
    getMyPenaltyReport,
    getUserPenaltyReport,
    getPenaltySummary,
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
const fmtPoints = (p) => (p > 0 ? `+${p}` : `${p}`);
const pointsCls = (p) => (p < 0 ? 'text-rose-600' : 'text-emerald-600');

const SummaryCards = ({ s }) => {
    const cards = [
        { label: 'Số buổi họp', value: s.totalMeetings, icon: Users, cls: 'text-action-blue bg-blue-50' },
        { label: 'Đi trễ', value: s.late, icon: Clock, cls: 'text-amber-600 bg-amber-50' },
        { label: 'Về sớm', value: s.leftEarly, icon: LogOut, cls: 'text-orange-600 bg-orange-50' },
        { label: 'Vắng mặt', value: s.absent, icon: XCircle, cls: 'text-rose-600 bg-rose-50' },
        { label: 'Có lý do', value: s.excused, icon: CheckCircle, cls: 'text-sky-600 bg-sky-50' },
        { label: 'Tổng điểm trừ', value: fmtPoints(s.totalPoints), icon: AlertTriangle, cls: 'text-rose-600 bg-rose-50' },
    ];
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
                <div key={c.label} className="bg-white rounded-2xl border border-platinum-tint p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.cls}`}>
                        <c.icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase text-slate-blue">{c.label}</p>
                        <p className="text-xl font-black text-midnight-indigo">{c.value}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

const MeetingRows = ({ items, basePath }) => (
    <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
        <table className="w-full text-sm">
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
                ) : items.map((i) => (
                    <tr key={i.meetingId} className="hover:bg-cloud-mist/20">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{fmtDate(i.startTime)}</td>
                        <td className="px-4 py-3">
                            <Link to={`${basePath}/meeting/${i.meetingId}`} className="font-bold text-xs text-midnight-indigo hover:text-action-blue">{i.title}</Link>
                            <p className="text-[10px] text-slate-400">{i.meetingCode}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${CATEGORY_MAP[i.category]?.cls || ''}`}>
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
                ))}
            </tbody>
        </table>
    </div>
);

const AttendancePenaltyReport = () => {
    const location = useLocation();
    const basePath = '/' + (location.pathname.split('/')[1] || 'employee');
    const isAdminArea = basePath === '/business-admin';

    const [range, setRange] = useState(monthRange(0));
    const [scope, setScope] = useState(null);
    const [tab, setTab] = useState(isAdminArea ? 'summary' : 'me');
    const [mine, setMine] = useState(null);
    const [summary, setSummary] = useState(null);
    const [departmentId, setDepartmentId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);

    useEffect(() => {
        getPenaltyReportScope()
            .then((res) => setScope(res?.data?.scope || null))
            .catch(() => setScope(null));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (tab === 'me') {
                const res = await getMyPenaltyReport(range);
                setMine(res?.data || null);
            } else {
                const res = await getPenaltySummary({ ...range, departmentId: departmentId || undefined, search: search.trim() || undefined });
                setSummary(res?.data || null);
            }
        } catch (err) {
            setError(err?.message || 'Không tải được dữ liệu.');
        } finally {
            setLoading(false);
        }
    }, [tab, range, departmentId, search]);

    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => clearTimeout(t);
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
        ...(!isAdminArea ? [{ id: 'me', label: 'Của tôi' }] : []),
        ...(scope ? [{ id: 'summary', label: summaryTitle }] : []),
    ], [isAdminArea, scope, summaryTitle]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl font-black text-midnight-indigo flex items-center gap-2">
                        <Award className="w-6 h-6 text-action-blue" /> Điểm chuyên cần cuộc họp
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">
                        Tính các cuộc họp đã kết thúc có điểm danh. Lý do được duyệt = 0 điểm; chờ duyệt hoặc bị từ chối vẫn giữ điểm trừ.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setRange(monthRange(0))} className="px-3 py-2 text-xs font-bold rounded-xl border border-platinum-tint bg-white hover:bg-cloud-mist">Tháng này</button>
                    <button onClick={() => setRange(monthRange(-1))} className="px-3 py-2 text-xs font-bold rounded-xl border border-platinum-tint bg-white hover:bg-cloud-mist">Tháng trước</button>
                    <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className="px-3 py-2 text-xs rounded-xl border border-platinum-tint" />
                    <span className="text-xs text-slate-blue">đến</span>
                    <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="px-3 py-2 text-xs rounded-xl border border-platinum-tint" />
                </div>
            </div>

            {tabs.length > 1 && (
                <div className="flex gap-1 border-b border-platinum-tint">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2.5 text-xs font-bold border-b-2 ${tab === t.id ? 'border-action-blue text-action-blue' : 'border-transparent text-slate-blue hover:text-midnight-indigo'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{error}</div>}
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
                    <div className="flex flex-wrap items-center gap-2">
                        {scope === 'school' ? (
                            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-platinum-tint bg-white">
                                <option value="">Tất cả đơn vị</option>
                                {summary?.departments?.map((d) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                            </select>
                        ) : (
                            <span className="px-3 py-2 text-xs font-bold rounded-xl bg-cloud-mist text-midnight-indigo">{summary?.departments?.[0]?.departmentName}</span>
                        )}
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email" className="pl-8 pr-3 py-2 text-xs rounded-xl border border-platinum-tint w-56" />
                        </div>
                        <button
                            onClick={exportExcel}
                            disabled={!summary?.rows?.length}
                            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" /> Xuất Excel
                        </button>
                    </div>

                    {summary && (
                        <div className="bg-white rounded-2xl border border-platinum-tint overflow-x-auto">
                            <table className="w-full text-sm">
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
                                    ) : summary.rows.map((r) => (
                                        <tr key={r.userId} onClick={() => openDetail(r)} className="hover:bg-cloud-mist/30 cursor-pointer">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-xs text-midnight-indigo">{r.fullName}</p>
                                                <p className="text-[10px] text-slate-blue">{r.departmentName || 'N/A'}{r.positionTitle ? ` • ${r.positionTitle}` : ''}</p>
                                            </td>
                                            <td className="px-3 py-3 text-center text-xs font-bold">{r.totalMeetings}</td>
                                            <td className="px-3 py-3 text-center text-xs">{r.present}</td>
                                            <td className="px-3 py-3 text-center text-xs text-amber-700">{r.late || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-orange-700">{r.leftEarly || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-rose-700">{r.absent || '-'}</td>
                                            <td className="px-3 py-3 text-center text-xs text-sky-700">
                                                {r.excused || '-'}
                                                {r.pendingExcuses > 0 && <span className="block text-[9px] text-amber-600">{r.pendingExcuses} chờ duyệt</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-black ${pointsCls(r.totalPoints)}`}>{fmtPoints(r.totalPoints)}</td>
                                        </tr>
                                    ))}
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
                            </table>
                        </div>
                    )}
                </div>
            )}

            {loading && <p className="text-center text-xs text-slate-blue">Đang tải...</p>}

            {detail && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDetail(null)}>
                    <div className="bg-cloud-mist rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-midnight-indigo">{detail.row.fullName}</h3>
                                <p className="text-xs text-slate-blue">{detail.row.departmentName} • {fmtDate(range.from)} – {fmtDate(range.to)}</p>
                            </div>
                            <button onClick={() => setDetail(null)} className="text-slate-blue hover:text-midnight-indigo"><X className="w-5 h-5" /></button>
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
