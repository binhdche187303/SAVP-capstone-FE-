import PaginatedCollection from '../../components/common/PaginatedCollection';
import { syncMessage } from './uelSyncMessages';
import StatisticCard from '../../components/common/StatisticCard';
import RefreshButton from '../../components/common/RefreshButton';
import StatisticGrid from '../../components/common/StatisticGrid';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import { useCallback, useEffect, useState } from 'react';
import {
    Play, ChevronDown, ChevronRight, DatabaseZap,
    CircleCheck, CircleX, LoaderCircle, CircleMinus, TriangleAlert, History, Settings2, Download, Loader2,
} from 'lucide-react';
import {
    UEL_SYNC_PREVIEW,
    UEL_SYNC_STEPS,
    downloadUelGaps,
    getUelSyncRuns,
    getUelSyncStatus,
    runUelSyncAll,
    stepLabel,
    updateUelSyncSettings,
} from '../../service/uelSyncService';
import { WEEKDAYS, formatRunAt, nextRunOf, scheduleLabelOf } from '../../utils/uelSyncSchedule';

/**
 * Đồng bộ dữ liệu từ API Đào tạo UEL.
 * - 1 nút "Đồng bộ toàn bộ": BE chạy đủ 6 bước theo thứ tự, tự nhận học kỳ đang học; trang hỏi lại mỗi 2 giây để hiện tiến trình.
 * - Cài đặt tự động: hằng ngày / hằng tuần + giờ chạy; phạm vi (số ngày lịch học, học kỳ tự nhận hoặc chỉ định) dùng chung cho cả nút bấm.
 */

const POLL_MS = 2000;

const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtNum = (n) => Number(n ?? 0).toLocaleString('vi-VN');

const durationOf = (run) => {
    if (!run?.finishedAt) return null;
    const s = Math.max(0, (new Date(run.finishedAt) - new Date(run.startedAt)) / 1000);
    return s < 60 ? `${s.toFixed(1)} giây` : `${Math.round(s / 60)} phút`;
};

const termsText = (terms) => (terms ?? []).map((t) => `${t.namHoc} ${t.hocKy}`).join(' · ');

const STATUS = {
    running: { label: 'Đang chạy', cls: 'bg-blue-50 text-action-blue border-blue-200' },
    succeeded: { label: 'Thành công', cls: 'bg-green-50 text-green-700 border-green-200' },
    partial: { label: 'Có bước lỗi', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed: { label: 'Thất bại', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const StatusPill = ({ status }) => {
    const s = STATUS[status] ?? STATUS.failed;
    return <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
};

const errorText = (e, fallback) => {
    const m = e?.error?.message;
    if (Array.isArray(m)) return m.map(syncMessage).join(' ');
    return typeof m === 'string' && m ? syncMessage(m) : fallback;
};

const Card = ({ title, icon: Icon, children, action, className = '' }) => (
    <section className={`bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-4 min-w-0 ${className}`}>
        <div className="flex items-center justify-between gap-3 border-b border-platinum-tint/60 pb-3">
            <h2 className="text-base font-bold text-midnight-indigo inline-flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 text-action-blue" />}
                {title}
            </h2>
            {action}
        </div>
        {children}
    </section>
);

const Fact = ({ label, value, tone = 'neutral', hint }) => <StatisticCard label={label} value={value} compactValue helper={hint} tone={tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : 'default'} />;

const inputCls =
    'w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm text-midnight-indigo bg-white focus:outline-none focus:ring-2 focus:ring-action-blue/30 focus:border-action-blue disabled:bg-cloud-mist disabled:text-steel-gray';
const btnPrimary =
    'px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
const labelCls = 'block text-xs font-bold text-slate-blue mb-1';

// ───────────────────────── Tiến trình 6 bước ─────────────────────────

const stepStateOf = (run, key) => {
    if (!run) return 'idle';
    const r = run.results?.find((x) => x.step === key);
    if (r) return r.error ? 'error' : 'done';
    if (run.status === 'running') return run.currentStep === key ? 'running' : 'pending';
    return 'skipped';
};

const STEP_LOOK = {
    idle: { icon: null, ring: 'border-platinum-tint bg-white', text: 'Chưa chạy' },
    pending: { icon: null, ring: 'border-platinum-tint bg-white', text: 'Chờ' },
    running: { icon: LoaderCircle, ring: 'border-action-blue/60 bg-blue-50/60', iconCls: 'text-action-blue animate-spin', text: 'Đang chạy...' },
    done: { icon: CircleCheck, ring: 'border-green-200 bg-green-50/50', iconCls: 'text-green-600', text: '' },
    error: { icon: CircleX, ring: 'border-red-200 bg-red-50/50', iconCls: 'text-red-600', text: 'Lỗi' },
    skipped: { icon: CircleMinus, ring: 'border-platinum-tint bg-cloud-mist/40', iconCls: 'text-steel-gray', text: 'Không chạy' },
};

const StepTracker = ({ run }) => (
    <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {UEL_SYNC_STEPS.map((st, i) => {
            const state = stepStateOf(run, st.key);
            const look = STEP_LOOK[state];
            const r = run?.results?.find((x) => x.step === st.key);
            const Icon = look.icon;
            return (
                <li key={st.key} className={`p-3 rounded-xl border min-w-0 ${look.ring}`} title={r?.error || st.hint}>
                    <div className="flex items-center gap-2">
                        {Icon ? (
                            <Icon className={`w-5 h-5 shrink-0 ${look.iconCls}`} aria-hidden="true" />
                        ) : (
                            <span className="w-5 h-5 shrink-0 rounded-full border border-platinum-tint text-[11px] font-bold text-slate-blue flex items-center justify-center">{i + 1}</span>
                        )}
                        <span className="text-sm font-semibold text-midnight-indigo truncate">{st.label}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-blue tabular-nums truncate">
                        {state === 'done' ? `${fmtNum(r.upserted)} bản ghi` : look.text}
                        {r?.warnings?.length ? <span className="text-amber-700 font-semibold"> · {r.warnings.length} cảnh báo</span> : null}
                    </p>
                </li>
            );
        })}
    </ol>
);

// ───────────────────────── Lịch sử lượt chạy ─────────────────────────

const DEACTIVATED_HINT =
    'Có trong hệ thống nhưng lần này UEL không còn trả về ⇒ đổi trạng thái, không xóa: cán bộ → nghỉ việc, ' +
    'đơn vị → ngừng hoạt động, đăng ký HP → đã hủy, buổi học chưa diễn ra → đã hủy.';

const GAP_REASONS = [
    ['not_assigned', 'UEL chưa phân công giảng viên'],
    ['ambiguous', 'Tên GV trùng nhiều cán bộ'],
    ['not_in_staff', 'GV không có trong danh sách nhân sự UEL'],
    ['pending', 'Đã khớp GV, gán ở lần đồng bộ lớp HP tới'],
];

/** Tóm tắt dữ liệu cần bổ sung lúc lượt kết thúc + nút xuất Excel danh sách chi tiết (theo dữ liệu hiện tại). */
const GapsPanel = ({ gaps }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const { students, staff, sections } = gaps;
    const exportFile = async () => {
        setBusy(true);
        setError('');
        try {
            await downloadUelGaps();
        } catch {
            setError('Không xuất được file. Vui lòng thử lại.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-midnight-indigo">Dữ liệu cần bổ sung</p>
                <button
                    type="button"
                    onClick={exportFile}
                    disabled={busy || UEL_SYNC_PREVIEW}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-platinum-tint bg-white px-2.5 py-1 text-xs font-semibold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50"
                >
                    {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Xuất Excel danh sách
                </button>
            </div>
            <ul className="space-y-1 text-slate-blue">
                <li>
                    <span className="font-semibold text-midnight-indigo">{fmtNum(students.noEmail)} / {fmtNum(students.total)} SV chưa có email</span>
                    {students.groups?.length > 0 && (
                        <span className="block text-xs">
                            {students.groups.map((g) => `${g.label === 'Khác' ? 'Khác (liên kết, SĐH, hệ khác)' : g.label}: ${fmtNum(g.noEmail)} / ${fmtNum(g.total)}`).join(' · ')}
                        </span>
                    )}
                </li>
                <li><span className="font-semibold text-midnight-indigo">{fmtNum(staff.noEmail)} / {fmtNum(staff.total)} cán bộ chưa có email</span></li>
                <li>
                    <span className="font-semibold text-midnight-indigo">{fmtNum(sections.noLecturer)} / {fmtNum(sections.total)} lớp HP chưa có giảng viên</span>
                    <span className="block text-xs">
                        {GAP_REASONS.filter(([k]) => sections.reasons?.[k]).map(([k, label]) => `${label}: ${fmtNum(sections.reasons[k])}`).join(' · ')}
                    </span>
                </li>
            </ul>
            <p className="text-xs text-steel-gray">
                Số liệu lúc lượt kết thúc. File xuất theo dữ liệu hiện tại, có cột trống để bổ sung email / giảng viên.
            </p>
            {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
    );
};

// Gộp cảnh báo trùng câu (VD 51 ngày lịch học cùng lỗi kết nối) → [{ text, count }].
const groupWarnings = (warnings = []) => {
    const groups = [];
    const byText = new Map();
    warnings.forEach((w) => {
        const text = syncMessage(w);
        if (byText.has(text)) byText.get(text).count += 1;
        else { const g = { text, count: 1 }; byText.set(text, g); groups.push(g); }
    });
    return groups;
};

// 1 bước đồng bộ. Cảnh báo không bung trong ô "Ghi chú" hẹp (chữ xuống dòng rất dài) mà mở ở 1 dòng phụ
// trải hết bề ngang bảng, câu trùng gộp "×N", khung tối đa ~10 dòng (cuộn bên trong nếu nhiều hơn).
const StepRow = ({ r }) => {
    const [open, setOpen] = useState(false);
    const groups = groupWarnings(r.warnings);
    return (
        <>
            <tr className="border-t border-platinum-tint/60 align-top">
                <td className="py-2 pr-3 text-midnight-indigo">
                    <p className="font-semibold whitespace-nowrap">{stepLabel(r.step)}</p>
                    {r.term && <p className="text-[11px] font-medium text-slate-blue whitespace-nowrap">{r.term}</p>}
                </td>
                <td className="py-2 px-3 text-right">{fmtNum(r.fetched)}</td>
                <td className="py-2 px-3 text-right">{fmtNum(r.upserted)}</td>
                <td className={`py-2 px-3 text-right ${r.skipped ? 'text-amber-700 font-semibold' : ''}`}>{fmtNum(r.skipped)}</td>
                <td className="py-2 px-3 text-right">{fmtNum(r.deactivated)}</td>
                <td className="py-2 pl-3">
                    {r.error && <p className="text-red-700 font-medium">{syncMessage(r.error)}</p>}
                    {groups.length > 0 && (
                        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline whitespace-nowrap">
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            {r.warnings.length} cảnh báo{groups.length < r.warnings.length ? ` · ${groups.length} loại` : ''}
                        </button>
                    )}
                    {!r.error && !groups.length && <span className="text-steel-gray">—</span>}
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={6} className="pb-2">
                        <ul className="max-h-40 overflow-auto rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1 text-xs text-slate-blue">
                            {groups.map((g) => (
                                <li key={g.text} className="flex items-start gap-2">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                                    <span className="flex-1">{g.text}</span>
                                    {g.count > 1 && <span className="shrink-0 px-1 rounded bg-amber-100 text-amber-800 font-bold">×{g.count}</span>}
                                </li>
                            ))}
                        </ul>
                    </td>
                </tr>
            )}
        </>
    );
};

const RunRow = ({ run, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);
    const errors = run.results.filter((r) => r.error).length;
    const warnings = run.results.reduce((n, r) => n + (r.warnings?.length ?? 0), 0);
    const o = run.options ?? {};
    return (
        <li className="border border-platinum-tint rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-cloud-mist/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-blue/40"
                aria-expanded={open}
            >
                {open ? <ChevronDown className="w-4 h-4 text-slate-blue" /> : <ChevronRight className="w-4 h-4 text-slate-blue" />}
                <span className="text-sm font-semibold text-midnight-indigo tabular-nums">{fmtTime(run.startedAt)}</span>
                <StatusPill status={run.status} />
                {run.interrupted && (
                    <span className="text-xs font-semibold text-amber-700">Bị gián đoạn (server khởi động lại)</span>
                )}
                <span className="text-xs text-slate-blue">
                    {run.trigger === 'schedule' ? 'Tự động' : `Bấm tay${run.requestedByName ? ` · ${run.requestedByName}` : ''}`}
                </span>
                <span className="text-xs text-steel-gray ml-auto">
                    {durationOf(run) ?? ''}
                    {errors ? ` · ${errors} bước lỗi` : ''}
                    {warnings ? ` · ${warnings} cảnh báo` : ''}
                </span>
            </button>
            {open && (
                <div className="border-t border-platinum-tint px-4 py-3 space-y-3 bg-cloud-mist/30">
                    <p className="text-xs text-slate-blue">
                        {o.terms?.length ? <>Học kỳ: {termsText(o.terms)}. </> : o.namHoc ? <>Học kỳ: {o.namHoc} {o.hocKy}. </> : null}
                        {o.fromDate && <>Lịch học {o.fromDate} → {o.toDate}.</>}
                    </p>
                    <div className="overflow-x-auto">
                        {/* Bảng 6 cột số ngắn → giữ dạng bảng tới 480px (mặc định ~790px mới đủ nên bị chuyển thành thẻ, màn rất dài). */}
                        <ResponsiveTable className="w-full text-sm" minTableWidth={480}>
                            {/* Bảng dùng chung ép table-layout: fixed (các cột chia đều) → cột Bước quá hẹp, "Lớp học phần" /
                                "2026-2027 SDH-HK01" bị ngắt giữa chừng. Đặt bề rộng: cột Bước rộng hơn, cột số vừa đủ. */}
                            <colgroup>
                                <col style={{ width: '27%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '13%' }} />
                                <col />
                            </colgroup>
                            <thead>
                                <tr className="text-left text-xs uppercase text-slate-blue">
                                    <th className="py-1.5 pr-3 font-semibold">Bước</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Lấy về</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Đã ghi</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Bỏ qua</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">
                                        <span title={DEACTIVATED_HINT} className="cursor-help underline decoration-dotted underline-offset-2">Vô hiệu hóa</span>
                                    </th>
                                    <th className="py-1.5 pl-3 font-semibold">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody className="tabular-nums">
                                {run.results.length === 0 && (
                                    <tr><td colSpan={6} className="py-2 text-steel-gray">Chưa có kết quả.</td></tr>
                                )}
                                {/* Lớp HP / đăng ký HP chạy riêng từng học kỳ → cùng tên bước, ghi kèm học kỳ (r.term) để không tưởng bị lặp. */}
                                {run.results.map((r, i) => <StepRow key={`${r.step}-${r.term ?? ''}-${i}`} r={r} />)}
                            </tbody>
                        </ResponsiveTable>
                    </div>
                    {run.gaps && <GapsPanel gaps={run.gaps} />}
                </div>
            )}
        </li>
    );
};

// ───────────────────────── Cài đặt tự động ─────────────────────────

const DEFAULT_SETTINGS = { autoEnabled: false, frequency: 'daily', weekday: 0, time: '02:00', termMode: 'auto', namHoc: '', hocKy: '', intervalDays: 3 };
const MIN_INTERVAL_DAYS = 2;
const MAX_INTERVAL_DAYS = 90;

/** 'yyyy-MM-dd' → 'dd/MM/yyyy'; sai dạng → null. */
const dmy = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** Cài đặt BE trả về (có thể là bản cũ chỉ có namHoc/hocKy) → form đủ trường. */
const formOf = (s = {}) => {
    const { sessionDaysAhead: _old, ...rest } = s; // trường cũ, không còn dùng
    const f = { ...DEFAULT_SETTINGS, ...rest };
    if (!s.termMode) f.termMode = s.namHoc && s.hocKy ? 'fixed' : 'auto';
    return { ...f, weekday: Number(f.weekday), intervalDays: Number(f.intervalDays ?? 3), namHoc: f.namHoc ?? '', hocKy: f.hocKy ?? '' };
};

const payloadOf = (f) => ({
    autoEnabled: !!f.autoEnabled,
    frequency: f.frequency,
    weekday: Number(f.weekday),
    time: f.time,
    termMode: f.termMode,
    namHoc: f.termMode === 'fixed' ? f.namHoc.trim() : '',
    hocKy: f.termMode === 'fixed' ? f.hocKy.trim() : '',
    intervalDays: Number(f.intervalDays),
});

const Segmented = ({ value, options, onChange, disabled, name }) => (
    <div role="radiogroup" aria-label={name} className="inline-flex p-1 rounded-xl bg-cloud-mist border border-platinum-tint">
        {options.map((o) => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={value === o.value}
                disabled={disabled}
                onClick={() => onChange(o.value)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                    value === o.value ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'
                }`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

const SettingsCard = ({ saved: initial, serverAllowed, lastRunAt, onSaved }) => {
    const [saved, setSaved] = useState(initial);
    const [form, setForm] = useState(() => formOf(initial));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };
    const dirty = JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(formOf(saved)));

    const blocker = (() => {
        if (form.autoEnabled && !/^\d{2}:\d{2}$/.test(form.time || '')) return 'Chọn giờ chạy.';
        if (form.frequency === 'interval') {
            const n = Number(form.intervalDays);
            if (!Number.isInteger(n) || n < MIN_INTERVAL_DAYS || n > MAX_INTERVAL_DAYS) {
                return `Số ngày giữa 2 lần phải từ ${MIN_INTERVAL_DAYS} đến ${MAX_INTERVAL_DAYS}.`;
            }
        }
        if (form.termMode === 'fixed' && (!form.namHoc.trim() || !form.hocKy.trim())) return 'Nhập năm học và học kỳ.';
        return null;
    })();

    const next = nextRunOf(form, new Date(), lastRunAt);

    const save = async (e) => {
        e.preventDefault();
        if (blocker) return;
        setSaving(true);
        setMsg(null);
        try {
            const res = await updateUelSyncSettings(payloadOf(form));
            setSaved(res);
            setForm(formOf(res));
            onSaved(res);
            setMsg({ ok: true, text: 'Đã lưu cài đặt.' });
        } catch (err) {
            setMsg({ ok: false, text: errorText(err, 'Không lưu được cài đặt.') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card title="Cài đặt đồng bộ" icon={Settings2} className="lg:col-span-2">
            <form onSubmit={save} className="space-y-5">
                <fieldset className="space-y-3">
                    <legend className="text-xs font-bold text-slate-blue uppercase tracking-wide mb-1">Chạy tự động</legend>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-midnight-indigo" id="uel-auto-label">Tự động đồng bộ toàn bộ</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={form.autoEnabled}
                            aria-labelledby="uel-auto-label"
                            onClick={() => set({ autoEnabled: !form.autoEnabled })}
                            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action-blue/40 ${
                                form.autoEnabled ? 'bg-action-blue' : 'bg-platinum-tint'
                            }`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoEnabled ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>
                    <div>
                        <span className={labelCls}>Tần suất</span>
                        <Segmented
                            name="Tần suất"
                            value={form.frequency}
                            disabled={!form.autoEnabled}
                            onChange={(v) => set({ frequency: v })}
                            options={[{ value: 'daily', label: 'Hằng ngày' }, { value: 'weekly', label: 'Hằng tuần' }, { value: 'interval', label: 'Mỗi N ngày' }]}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {form.frequency === 'weekly' && (
                            <label className="block" htmlFor="uel-set-weekday">
                                <span className={labelCls}>Vào ngày</span>
                                <select id="uel-set-weekday" className={inputCls} disabled={!form.autoEnabled}
                                    value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                                    {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                                </select>
                            </label>
                        )}
                        {form.frequency === 'interval' && (
                            <div>
                                <label className={labelCls} htmlFor="uel-set-interval">Số ngày giữa 2 lần</label>
                                <input id="uel-set-interval" type="number" aria-describedby="uel-set-interval-hint" min={MIN_INTERVAL_DAYS} max={MAX_INTERVAL_DAYS} step={1}
                                    className={inputCls} disabled={!form.autoEnabled}
                                    value={form.intervalDays} onChange={(e) => set({ intervalDays: e.target.value === '' ? '' : Number(e.target.value) })} />
                                <p id="uel-set-interval-hint" className="text-[11px] text-steel-gray mt-1">Ví dụ 3, 5, 7; 30 ≈ 1 tháng.</p>
                            </div>
                        )}
                        <label className="block" htmlFor="uel-set-time">
                            <span className={labelCls}>Giờ chạy</span>
                            <input id="uel-set-time" type="time" className={inputCls} disabled={!form.autoEnabled}
                                value={form.time} onChange={(e) => set({ time: e.target.value })} />
                        </label>
                    </div>
                    <p className={`text-xs rounded-lg px-3 py-2 ${form.autoEnabled ? 'bg-blue-50 text-action-blue' : 'bg-cloud-mist text-slate-blue'}`}>
                        {form.autoEnabled
                            ? <>Lần chạy kế tiếp: <strong>{formatRunAt(next)}</strong> ({scheduleLabelOf(form)}).</>
                            : 'Đang tắt: chỉ đồng bộ khi bấm nút.'}
                    </p>
                    {form.autoEnabled && serverAllowed === false && (
                        <p className="text-xs text-amber-700 flex gap-1.5">
                            <TriangleAlert className="w-4 h-4 shrink-0" />
                            Server này chưa bật bộ hẹn giờ (SCHEDULER_ENABLED), nên lưu xong vẫn chưa tự chạy.
                        </p>
                    )}
                </fieldset>

                <fieldset className="space-y-3 border-t border-platinum-tint/60 pt-4">
                    <legend className="text-xs font-bold text-slate-blue uppercase tracking-wide mb-1">Phạm vi (dùng cho cả nút bấm)</legend>
                    <p className="text-sm text-slate-blue">Lịch học luôn lấy từ hôm nay đến hết năm học (31/08).</p>
                    <div className="space-y-2">
                        <span className={labelCls}>Học kỳ</span>
                        <label className="flex items-start gap-2 text-sm text-midnight-indigo cursor-pointer" htmlFor="uel-term-auto">
                            <input id="uel-term-auto" type="radio" name="uel-term" className="mt-1 accent-action-blue"
                                checked={form.termMode === 'auto'} onChange={() => set({ termMode: 'auto' })} />
                            <span>
                                Tự nhận <span className="text-xs text-green-700 font-semibold">(khuyên dùng)</span>
                                <span className="block text-xs text-steel-gray">Xem thời khóa biểu những ngày tới; 2 kỳ chồng nhau thì lấy cả hai.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-sm text-midnight-indigo cursor-pointer" htmlFor="uel-term-fixed">
                            <input id="uel-term-fixed" type="radio" name="uel-term" className="mt-1 accent-action-blue"
                                checked={form.termMode === 'fixed'} onChange={() => set({ termMode: 'fixed' })} />
                            <span>Chỉ định</span>
                        </label>
                        {form.termMode === 'fixed' && (
                            <div className="grid grid-cols-2 gap-3 pl-6">
                                <input aria-label="Năm học" className={inputCls} placeholder="2026-2027" maxLength={20}
                                    value={form.namHoc} onChange={(e) => set({ namHoc: e.target.value })} />
                                <input aria-label="Học kỳ" className={inputCls} placeholder="HK01" maxLength={10}
                                    value={form.hocKy} onChange={(e) => set({ hocKy: e.target.value })} />
                            </div>
                        )}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={saving || !dirty || !!blocker} className={btnPrimary}>
                        {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
                    </button>
                    {dirty && blocker && <span className="text-sm text-amber-700">{blocker}</span>}
                    {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
                </div>
            </form>
        </Card>
    );
};

// ───────────────────────── Trang ─────────────────────────

const UelSync = () => {
    const [status, setStatus] = useState(null);
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [starting, setStarting] = useState(false);
    const [runError, setRunError] = useState(null);

    const refresh = useCallback(async () => {
        const [st, rs] = await Promise.all([getUelSyncStatus(), getUelSyncRuns(100)]);
        setStatus(st);
        setRuns(rs ?? []);
        return st;
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            await refresh();
        } catch (e) {
            setLoadError(errorText(e, 'Không tải được trạng thái đồng bộ.'));
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // Đang chạy → hỏi lại định kỳ đến khi xong.
    useEffect(() => {
        if (!status?.running) return undefined;
        const id = setInterval(() => refresh().catch(() => undefined), POLL_MS);
        return () => clearInterval(id);
    }, [status?.running, refresh]);

    const handleRunAll = async () => {
        setRunError(null);
        setStarting(true);
        try {
            await runUelSyncAll();
            await refresh();
        } catch (e) {
            setRunError(errorText(e, 'Không bắt đầu được lượt đồng bộ.'));
        } finally {
            setStarting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-action-blue animate-spin" />
                <p className="mt-4 text-slate-blue text-sm font-medium">Đang tải trạng thái đồng bộ...</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
                <p className="font-bold text-midnight-indigo">Không thể tải trang đồng bộ UEL</p>
                <p className="text-sm text-slate-blue max-w-md">{loadError}</p>
                <button type="button" onClick={loadAll} className={btnPrimary}>Thử lại</button>
            </div>
        );
    }

    const settings = formOf(status?.settings);
    const lastRun = status?.lastRun ?? runs[0] ?? null;
    const isRunning = !!status?.running;
    const doneSteps = lastRun?.results?.length ?? 0;
    const nextAt = status?.schedule?.nextRunAt ? new Date(status.schedule.nextRunAt) : null;
    const runBlocker = !status?.configured
        ? 'Chưa thiết lập kết nối với hệ thống UEL. Vui lòng liên hệ người quản trị.'
        : null;

    return (
        <div data-page-surface="wide" className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
            {UEL_SYNC_PREVIEW && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                    <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Bản xem trước: dữ liệu giả, không gọi BE hay API của Trường. Bấm "Đồng bộ toàn bộ" để xem tiến trình mô phỏng (~11 giây).</span>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <DatabaseZap className="w-3.5 h-3.5" />
                        Tích hợp
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Đồng bộ dữ liệu Đào tạo UEL</h1>
                </div>
                <RefreshButton onClick={() => refresh().catch(() => undefined)} busy={isRunning} />
            </div>

            <StatisticGrid columns={3} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Fact
                    label="Kết nối API"
                    value={status?.configured ? 'Đã cấu hình' : 'Chưa có API key'}
                    tone={status?.configured ? 'ok' : 'warn'}
                    hint={status?.configured ? null : 'Đặt UEL_API_KEY trên server'}
                />
                <Fact
                    label="Tự động"
                    value={settings.autoEnabled ? scheduleLabelOf(settings) : 'Đang tắt'}
                    tone={status?.schedule?.enabled ? 'ok' : settings.autoEnabled ? 'warn' : 'neutral'}
                    hint={
                        status?.schedule?.enabled
                            ? `Lần tới: ${formatRunAt(nextAt ?? nextRunOf(settings, new Date(), status?.schedule?.lastRunAt))}`
                            : settings.autoEnabled ? 'Server chưa bật bộ hẹn giờ' : 'Chỉ chạy khi bấm nút'
                    }
                />
                <Fact
                    label="Lần gần nhất"
                    value={lastRun ? (STATUS[lastRun.status]?.label ?? lastRun.status) : 'Chưa chạy'}
                    tone={!lastRun ? 'neutral' : lastRun.status === 'succeeded' ? 'ok' : lastRun.status === 'running' ? 'neutral' : 'warn'}
                    hint={lastRun ? `${fmtTime(lastRun.startedAt)} · ${lastRun.trigger === 'schedule' ? 'tự động' : 'bấm tay'}` : null}
                />
            </StatisticGrid>

            <Card title="Đồng bộ ngay" icon={Play}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm text-midnight-indigo">
                            Một lần bấm chạy đủ 6 bước theo thứ tự. Học kỳ{' '}
                            {settings.termMode === 'fixed' ? <strong>{settings.namHoc} {settings.hocKy}</strong> : 'tự nhận theo thời khóa biểu'},
                            lịch học từ hôm nay đến hết năm học{dmy(status?.plan?.toDate) ? ` (đến ${dmy(status.plan.toDate)})` : ''}.
                        </p>
                        <p className="text-xs text-steel-gray">Lấy cả năm nên một lượt có thể mất 1–2 giờ. Chạy nền trên server: có thể rời trang, quay lại vẫn thấy tiến trình.</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleRunAll}
                        disabled={isRunning || starting || !!runBlocker}
                        className={`${btnPrimary} px-6 py-3 text-base shrink-0`}
                    >
                        {isRunning || starting ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                        {isRunning ? `Đang đồng bộ ${Math.min(doneSteps + 1, 6)}/6...` : starting ? 'Đang bắt đầu...' : 'Đồng bộ toàn bộ'}
                    </button>
                </div>
                {runBlocker && <p className="text-sm text-amber-700">{runBlocker}</p>}
                {runError && <p className="text-sm text-red-700">{runError}</p>}

                {isRunning && (
                    <div className="h-1.5 rounded-full bg-cloud-mist overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-action-blue transition-all duration-500" style={{ width: `${(doneSteps / 6) * 100}%` }} />
                    </div>
                )}
                <div className="space-y-2">
                    <p className="text-xs text-slate-blue">
                        {isRunning ? 'Lượt đang chạy' : lastRun ? `Lượt gần nhất · ${fmtTime(lastRun.startedAt)}` : 'Chưa có lượt nào'}
                        {lastRun && (
                            <> · Học kỳ: {lastRun.options?.terms?.length ? termsText(lastRun.options.terms) : isRunning ? 'đang tự nhận…' : '—'}</>
                        )}
                    </p>
                    <StepTracker run={lastRun} />
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                <SettingsCard
                    saved={status?.settings}
                    serverAllowed={status?.schedule?.serverAllowed}
                    lastRunAt={status?.schedule?.lastRunAt ?? null}
                    onSaved={() => refresh().catch(() => undefined)}
                />
                <Card title="Lịch sử đồng bộ" icon={History} className="lg:col-span-3">
                    {runs.length === 0 ? (
                        <p className="text-sm text-steel-gray">Chưa có lượt đồng bộ nào. Bấm "Đồng bộ toàn bộ" ở trên để chạy lượt đầu tiên.</p>
                    ) : (
                        <PaginatedCollection items={runs} itemLabel="lượt đồng bộ">
{(camaiPageItems, camaiStartIndex) => (
<ul className="space-y-2">
                            {camaiPageItems.map((camaiRecord, camaiIndex) => ((r, i) => <RunRow key={r.id ?? r.startedAt} run={r} defaultOpen={i === 0 && r.status !== 'running'} />)(camaiRecord, camaiStartIndex + camaiIndex, (runs)))}
                        </ul>
)}
</PaginatedCollection>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default UelSync;
