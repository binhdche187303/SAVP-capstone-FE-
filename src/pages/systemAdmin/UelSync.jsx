import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshCw, Play, Plus, Trash2, ChevronDown, ChevronRight, DatabaseZap, Search,
    CircleCheck, CircleX, LoaderCircle, CircleMinus, TriangleAlert, CalendarClock, History, Settings2,
} from 'lucide-react';
import {
    UEL_LOOKUP_TYPES,
    UEL_SYNC_PREVIEW,
    UEL_SYNC_STEPS,
    getStudyPeriods,
    getUelSyncRuns,
    getUelSyncStatus,
    lookupUel,
    replaceStudyPeriods,
    runUelSyncAll,
    stepLabel,
    updateUelSyncSettings,
} from '../../service/uelSyncService';
import { WEEKDAYS, formatRunAt, nextRunOf, scheduleLabelOf } from '../../utils/uelSyncSchedule';

/**
 * Đồng bộ dữ liệu từ API Đào tạo UEL.
 * - 1 nút "Đồng bộ toàn bộ": BE chạy đủ 6 bước theo thứ tự, tự nhận học kỳ đang học; trang hỏi lại mỗi 2 giây để hiện tiến trình.
 * - Cài đặt tự động: hằng ngày / hằng tuần + giờ chạy; phạm vi (số ngày lịch học, học kỳ tự nhận hoặc chỉ định) dùng chung cho cả nút bấm.
 * - Nâng cao (thu gọn): bảng giờ tiết, tra cứu trực tiếp 1 người / 1 ngày.
 */

const POLL_MS = 2000;

const localDate = (addDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
    if (Array.isArray(m)) return m.join(' ');
    return typeof m === 'string' && m ? m : fallback;
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

const Fact = ({ label, value, tone = 'neutral', hint }) => {
    const tones = { ok: 'text-green-700', warn: 'text-amber-700', neutral: 'text-midnight-indigo' };
    return (
        <div className="p-4 bg-cloud-mist/50 border border-platinum-tint/70 rounded-xl min-w-0">
            <span className="block text-xs font-bold text-slate-blue uppercase tracking-wide">{label}</span>
            <span className={`block mt-1 text-sm font-semibold ${tones[tone]}`}>{value}</span>
            {hint && <span className="block mt-1 text-xs text-steel-gray">{hint}</span>}
        </div>
    );
};

const inputCls =
    'w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm text-midnight-indigo bg-white focus:outline-none focus:ring-2 focus:ring-action-blue/30 focus:border-action-blue disabled:bg-cloud-mist disabled:text-steel-gray';
const btnPrimary =
    'px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
    'px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-2 disabled:opacity-50';
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
    running: { icon: LoaderCircle, ring: 'border-action-blue/60 bg-blue-50/60', iconCls: 'text-action-blue animate-spin', text: 'Đang chạy…' },
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase text-slate-blue">
                                    <th className="py-1.5 pr-3 font-semibold">Bước</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Lấy về</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Đã ghi</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Bỏ qua</th>
                                    <th className="py-1.5 px-3 font-semibold text-right">Vô hiệu hóa</th>
                                    <th className="py-1.5 pl-3 font-semibold">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody className="tabular-nums">
                                {run.results.length === 0 && (
                                    <tr><td colSpan={6} className="py-2 text-steel-gray">Chưa có kết quả.</td></tr>
                                )}
                                {run.results.map((r) => (
                                    <tr key={r.step} className="border-t border-platinum-tint/60 align-top">
                                        <td className="py-2 pr-3 font-semibold text-midnight-indigo whitespace-nowrap">{stepLabel(r.step)}</td>
                                        <td className="py-2 px-3 text-right">{fmtNum(r.fetched)}</td>
                                        <td className="py-2 px-3 text-right">{fmtNum(r.upserted)}</td>
                                        <td className={`py-2 px-3 text-right ${r.skipped ? 'text-amber-700 font-semibold' : ''}`}>{fmtNum(r.skipped)}</td>
                                        <td className="py-2 px-3 text-right">{fmtNum(r.deactivated)}</td>
                                        <td className="py-2 pl-3 min-w-[200px]">
                                            {r.error && <p className="text-red-700 font-medium">{r.error}</p>}
                                            {r.warnings?.length > 0 && (
                                                <details className="text-xs text-slate-blue">
                                                    <summary className="cursor-pointer text-amber-700 font-semibold">{r.warnings.length} cảnh báo</summary>
                                                    <ul className="mt-1 space-y-0.5 list-disc pl-4">
                                                        {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                                    </ul>
                                                </details>
                                            )}
                                            {!r.error && !r.warnings?.length && <span className="text-steel-gray">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </li>
    );
};

// ───────────────────────── Tra cứu trực tiếp ─────────────────────────

/** Tên cột dễ đọc cho các trường API UEL hay gặp; trường khác giữ nguyên tên gốc. */
const FIELD_LABELS = {
    ma_nhan_su: 'Mã cán bộ', ho: 'Họ', ten: 'Tên', ho_ten: 'Họ tên', ngay_sinh: 'Ngày sinh', gioi_tinh: 'Giới tính',
    email: 'Email', ma_phong_ban: 'Mã đơn vị', ten_phong_ban: 'Đơn vị', ma_quan_ly: 'Quản lý', loai: 'Loại',
    khong_con_cong_tac: 'Nghỉ việc', cccd: 'CCCD', ma_sinh_vien: 'Mã SV', ten_sinh_vien: 'Tên SV', ho_ten_sinh_vien: 'Tên SV',
    lop: 'Lớp', khoa: 'Khoa', khoa_hoc: 'Khóa', noi_sinh: 'Nơi sinh', dan_toc: 'Dân tộc', ton_giao: 'Tôn giáo', dia_chi: 'Địa chỉ',
    ma_lop_hoc_phan: 'Lớp HP', ma_hoc_phan: 'Mã HP', ten_hoc_phan: 'Học phần', so_tin_chi: 'TC', nam_hoc: 'Năm học', hoc_ky: 'HK',
    ngay_dang_ky: 'Ngày ĐK', hinh_thuc_dang_ky: 'Hình thức ĐK', ngay_hoc: 'Ngày', thu: 'Thứ', tiet_bat_dau: 'Tiết BĐ', so_tiet: 'Số tiết',
    ma_phong_hoc: 'Phòng', ma_phong: 'Phòng', ten_co_so: 'Cơ sở', ma_lich_hoc: 'Mã buổi', ma_buoi_hoc: 'Mã buổi', buoi_hoc: 'Buổi',
    ma_giang_vien: 'Mã GV', ten_giang_vien: 'Giảng viên', buoi_hoc_thu: 'Buổi thứ',
};
/** Trường dư thừa / nội bộ không cần hiện trong bảng. */
const HIDDEN_FIELDS = new Set(['stt', 'ma_hinh_thuc_dang_ky', 'ten_phong_hoc', 'ten_phong', 'ma_day_nha', 'ma_co_so', 'ten_day_nha', 'ma_don_vi', 'ten_don_vi']);

const cellText = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : String(v));

const LookupCard = () => {
    const [form, setForm] = useState({ type: 'staff', code: '', date: localDate() });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const t = UEL_LOOKUP_TYPES.find((x) => x.key === form.type) ?? UEL_LOOKUP_TYPES[0];

    const columns = useMemo(() => {
        const keys = [];
        for (const row of result?.items ?? []) for (const k of Object.keys(row)) if (!HIDDEN_FIELDS.has(k) && !keys.includes(k)) keys.push(k);
        return keys;
    }, [result]);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.code.trim()) return setError('Nhập mã cần tra cứu.');
        setBusy(true);
        setError(null);
        try {
            setResult(await lookupUel({ type: form.type, code: form.code.trim(), ...(t.needsDate ? { date: form.date } : {}) }));
        } catch (err) {
            setResult(null);
            setError(errorText(err, 'Không tra cứu được.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card title="Tra cứu trực tiếp từ UEL" icon={Search}>
            <p className="text-xs text-slate-blue">
                Hỏi thẳng hệ thống của Trường cho 1 người, 1 ngày hoặc 1 buổi. Chỉ xem, không lưu vào hệ thống — dùng để đối chiếu khi dữ liệu đồng bộ có vẻ sai.
            </p>
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <label className="block" htmlFor="uel-lk-type">
                    <span className={labelCls}>Tra cứu</span>
                    <select id="uel-lk-type" className={inputCls} value={form.type}
                        onChange={(e) => { setForm({ ...form, type: e.target.value }); setResult(null); setError(null); }}>
                        {UEL_LOOKUP_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                </label>
                <label className="block" htmlFor="uel-lk-code">
                    <span className={labelCls}>{t.codeLabel}</span>
                    <input id="uel-lk-code" className={inputCls} placeholder={t.placeholder} maxLength={50}
                        value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </label>
                <label className="block" htmlFor="uel-lk-date">
                    <span className={labelCls}>Ngày</span>
                    <input id="uel-lk-date" type="date" className={inputCls} disabled={!t.needsDate}
                        value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </label>
                <button type="submit" disabled={busy} className={btnPrimary}>
                    <Search className="w-4 h-4" /> {busy ? 'Đang tra...' : 'Tra cứu'}
                </button>
            </form>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {result && (result.items.length === 0 ? (
                <p className="text-sm text-steel-gray">Trường không có dữ liệu cho mã này.</p>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-slate-blue">
                        {result.total} dòng{result.truncated ? ` (hiện ${result.items.length} dòng đầu)` : ''} · API <code>{result.api}</code>
                    </p>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-platinum-tint/70 rounded-xl">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-cloud-mist">
                                <tr className="text-left text-slate-blue">
                                    {columns.map((c) => <th key={c} className="py-2 px-2 font-semibold whitespace-nowrap">{FIELD_LABELS[c] ?? c}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {result.items.map((row, i) => (
                                    <tr key={i} className="border-t border-platinum-tint/60">
                                        {columns.map((c) => <td key={c} className="py-1.5 px-2 whitespace-nowrap text-midnight-indigo">{cellText(row[c])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </Card>
    );
};

// ───────────────────────── Bảng giờ tiết ─────────────────────────

const PeriodsCard = ({ periods: initial, onSaved }) => {
    const [periods, setPeriods] = useState(initial);
    const [rows, setRows] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const setPeriod = (i, field, value) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: field === 'periodNo' ? Number(value) : value } : r)));
    const addPeriod = () =>
        setRows((rs) => {
            const last = rs[rs.length - 1];
            return [...rs, { periodNo: (last?.periodNo ?? 0) + 1, startTime: last?.endTime ?? '07:00', endTime: '' }];
        });

    const save = async () => {
        setMsg(null);
        setSaving(true);
        try {
            const saved = await replaceStudyPeriods(rows);
            setPeriods(saved);
            setRows(saved);
            onSaved(saved);
            setMsg({ ok: true, text: `Đã lưu ${saved.length} tiết. Buổi học đã đồng bộ sẽ cập nhật giờ ở lần đồng bộ kế tiếp.` });
        } catch (e) {
            setMsg({ ok: false, text: errorText(e, 'Không lưu được bảng giờ tiết.') });
        } finally {
            setSaving(false);
        }
    };

    const dirty = JSON.stringify(rows) !== JSON.stringify(periods);

    return (
        <Card
            title="Bảng giờ tiết"
            icon={CalendarClock}
            action={
                <button type="button" onClick={addPeriod} className={btnGhost} disabled={rows.length >= 30}>
                    <Plus className="w-4 h-4" /> Thêm tiết
                </button>
            }
        >
            <p className="text-xs text-slate-blue">
                Giờ buổi học lấy thẳng từ API của Trường. Bảng này chỉ dùng khi một buổi không có giờ, để quy đổi tiết sang giờ.
            </p>
            {rows.length === 0 ? (
                <p className="text-sm text-amber-700">Chưa có tiết nào. Bấm "Thêm tiết" để nhập theo lịch tiết của Trường.</p>
            ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                            <tr className="text-left text-xs uppercase text-slate-blue">
                                <th className="py-1.5 pr-2 font-semibold">Tiết</th>
                                <th className="py-1.5 px-2 font-semibold">Bắt đầu</th>
                                <th className="py-1.5 px-2 font-semibold">Kết thúc</th>
                                <th className="py-1.5 pl-2 w-10"><span className="sr-only">Xóa</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((p, i) => (
                                <tr key={i} className="border-t border-platinum-tint/60">
                                    <td className="py-1.5 pr-2 w-20">
                                        <input aria-label="Số tiết" type="number" min={1} max={30} className={inputCls}
                                            value={p.periodNo} onChange={(e) => setPeriod(i, 'periodNo', e.target.value)} />
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <input aria-label={`Giờ bắt đầu tiết ${p.periodNo}`} type="time" className={inputCls}
                                            value={p.startTime} onChange={(e) => setPeriod(i, 'startTime', e.target.value)} />
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <input aria-label={`Giờ kết thúc tiết ${p.periodNo}`} type="time" className={inputCls}
                                            value={p.endTime} onChange={(e) => setPeriod(i, 'endTime', e.target.value)} />
                                    </td>
                                    <td className="py-1.5 pl-2">
                                        <button type="button" aria-label={`Xóa tiết ${p.periodNo}`}
                                            onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                                            className="p-2 text-slate-blue hover:text-red-600 rounded-lg">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={save} disabled={saving || !dirty} className={btnPrimary}>
                    {saving ? 'Đang lưu...' : 'Lưu bảng giờ tiết'}
                </button>
                {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
            </div>
        </Card>
    );
};

// ───────────────────────── Cài đặt tự động ─────────────────────────

const DEFAULT_SETTINGS = { autoEnabled: false, frequency: 'daily', weekday: 0, time: '02:00', sessionDaysAhead: 14, termMode: 'auto', namHoc: '', hocKy: '' };

/** Cài đặt BE trả về (có thể là bản cũ chỉ có namHoc/hocKy/sessionDaysAhead) → form đủ trường. */
const formOf = (s = {}) => {
    const f = { ...DEFAULT_SETTINGS, ...s };
    if (!s.termMode) f.termMode = s.namHoc && s.hocKy ? 'fixed' : 'auto';
    return { ...f, weekday: Number(f.weekday), sessionDaysAhead: Number(f.sessionDaysAhead), namHoc: f.namHoc ?? '', hocKy: f.hocKy ?? '' };
};

const payloadOf = (f) => ({
    autoEnabled: !!f.autoEnabled,
    frequency: f.frequency,
    weekday: Number(f.weekday),
    time: f.time,
    sessionDaysAhead: Number(f.sessionDaysAhead),
    termMode: f.termMode,
    namHoc: f.termMode === 'fixed' ? f.namHoc.trim() : '',
    hocKy: f.termMode === 'fixed' ? f.hocKy.trim() : '',
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

const SettingsCard = ({ saved: initial, serverAllowed, onSaved }) => {
    const [saved, setSaved] = useState(initial);
    const [form, setForm] = useState(() => formOf(initial));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };
    const dirty = JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(formOf(saved)));

    const blocker = (() => {
        if (form.autoEnabled && !/^\d{2}:\d{2}$/.test(form.time || '')) return 'Chọn giờ chạy.';
        const d = Number(form.sessionDaysAhead);
        if (!Number.isInteger(d) || d < 1 || d > 120) return 'Số ngày lịch học từ 1 đến 120.';
        if (form.termMode === 'fixed' && (!form.namHoc.trim() || !form.hocKy.trim())) return 'Nhập năm học và học kỳ.';
        return null;
    })();

    const next = nextRunOf(form);

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
                            options={[{ value: 'daily', label: 'Hằng ngày' }, { value: 'weekly', label: 'Hằng tuần' }]}
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
                    <label className="block" htmlFor="uel-set-days">
                        <span className={labelCls}>Lấy lịch học trước</span>
                        <div className="flex items-center gap-2">
                            <input id="uel-set-days" type="number" min={1} max={120} className={`${inputCls} w-24`}
                                value={form.sessionDaysAhead} onChange={(e) => set({ sessionDaysAhead: e.target.value })} />
                            <span className="text-sm text-slate-blue">ngày, tính từ hôm nay</span>
                        </div>
                    </label>
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
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [starting, setStarting] = useState(false);
    const [runError, setRunError] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const refresh = useCallback(async () => {
        const [st, rs] = await Promise.all([getUelSyncStatus(), getUelSyncRuns(10)]);
        setStatus(st);
        setRuns(rs ?? []);
        return st;
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [, ps] = await Promise.all([refresh(), getStudyPeriods()]);
            setPeriods(ps ?? []);
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
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
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
        ? 'Chưa cấu hình API key UEL trên server (UEL_API_BASE_URL, UEL_API_KEY).'
        : null;

    return (
        <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
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
                    <p className="text-slate-blue text-sm mt-1 max-w-2xl">
                        Lấy đơn vị, cán bộ, sinh viên, lớp học phần, đăng ký và lịch học từ hệ thống của Trường. Dữ liệu nhập tay không bị ghi đè;
                        bản ghi không còn ở Trường chỉ bị vô hiệu hóa, không bị xóa.
                    </p>
                </div>
                <button type="button" onClick={() => refresh().catch(() => undefined)} className={btnGhost}>
                    <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
                    Làm mới
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                            ? `Lần tới: ${formatRunAt(nextAt ?? nextRunOf(settings))}`
                            : settings.autoEnabled ? 'Server chưa bật bộ hẹn giờ' : 'Chỉ chạy khi bấm nút'
                    }
                />
                <Fact
                    label="Lần gần nhất"
                    value={lastRun ? (STATUS[lastRun.status]?.label ?? lastRun.status) : 'Chưa chạy'}
                    tone={!lastRun ? 'neutral' : lastRun.status === 'succeeded' ? 'ok' : lastRun.status === 'running' ? 'neutral' : 'warn'}
                    hint={lastRun ? `${fmtTime(lastRun.startedAt)} · ${lastRun.trigger === 'schedule' ? 'tự động' : 'bấm tay'}` : null}
                />
            </div>

            <Card title="Đồng bộ ngay" icon={Play}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm text-midnight-indigo">
                            Một lần bấm chạy đủ 6 bước theo thứ tự. Học kỳ{' '}
                            {settings.termMode === 'fixed' ? <strong>{settings.namHoc} {settings.hocKy}</strong> : 'tự nhận theo thời khóa biểu'},
                            lịch học {settings.sessionDaysAhead} ngày tới.
                        </p>
                        <p className="text-xs text-steel-gray">Chạy nền trên server: có thể rời trang, quay lại vẫn thấy tiến trình.</p>
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
                    onSaved={() => refresh().catch(() => undefined)}
                />
                <Card title="Lịch sử đồng bộ" icon={History} className="lg:col-span-3">
                    {runs.length === 0 ? (
                        <p className="text-sm text-steel-gray">Chưa có lượt đồng bộ nào. Bấm "Đồng bộ toàn bộ" ở trên để chạy lượt đầu tiên.</p>
                    ) : (
                        <ul className="space-y-2">
                            {runs.map((r, i) => <RunRow key={r.id ?? r.startedAt} run={r} defaultOpen={i === 0 && r.status !== 'running'} />)}
                        </ul>
                    )}
                </Card>
            </div>

            <section className="space-y-4">
                <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    aria-expanded={showAdvanced}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-blue hover:text-midnight-indigo"
                >
                    {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Nâng cao: bảng giờ tiết, tra cứu trực tiếp
                    {!status?.periodCount && <span className="text-xs text-amber-700 font-semibold">· chưa nhập bảng giờ tiết</span>}
                </button>
                {showAdvanced && (
                    <div className="space-y-6">
                        <PeriodsCard
                            periods={periods}
                            onSaved={(saved) => { setPeriods(saved); refresh().catch(() => undefined); }}
                        />
                        <LookupCard />
                    </div>
                )}
            </section>
        </div>
    );
};

export default UelSync;
