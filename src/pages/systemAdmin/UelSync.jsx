import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Play, Plus, Trash2, ChevronDown, ChevronRight, DatabaseZap, Search } from 'lucide-react';
import {
    UEL_LOOKUP_TYPES,
    UEL_SYNC_STEPS,
    getStudyPeriods,
    getUelSyncRuns,
    getUelSyncStatus,
    lookupUel,
    replaceStudyPeriods,
    runUelSync,
    stepLabel,
    updateUelSyncSettings,
} from '../../service/uelSyncService';

/**
 * Đồng bộ dữ liệu từ API Đào tạo UEL (đơn vị, cán bộ, SV, lớp HP, đăng ký, lịch học).
 * - Chạy tay theo từng bước; theo dõi lượt đang chạy (hỏi lại mỗi 2 giây).
 * - Lịch sử các lượt (bấm tay / tự động 02:00) lưu ở BE, xem lại được sau khi server khởi động lại.
 * - Cài học kỳ hiện tại (cho lượt tự động) và bảng giờ tiết (quy đổi tiết → giờ cho lịch học).
 */

const POLL_MS = 2000;

const localDate = (addDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** "GV0001, 22.001\nK24..." → ['GV0001', '22.001', 'K24...'] (bỏ trống, bỏ trùng). */
const codesOf = (text) => [...new Set(String(text ?? '').split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];

const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const durationOf = (run) => {
    if (!run?.finishedAt) return null;
    const s = Math.max(0, (new Date(run.finishedAt) - new Date(run.startedAt)) / 1000);
    return s < 60 ? `${s.toFixed(1)} giây` : `${Math.round(s / 60)} phút`;
};

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

const Card = ({ title, children, action }) => (
    <section className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-platinum-tint/60 pb-3">
            <h2 className="text-base font-bold text-midnight-indigo">{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

const Fact = ({ label, value, tone = 'neutral', hint }) => {
    const tones = {
        ok: 'text-green-700',
        warn: 'text-amber-700',
        neutral: 'text-midnight-indigo',
    };
    return (
        <div className="p-4 bg-cloud-mist/50 border border-platinum-tint/70 rounded-xl min-w-0">
            <span className="block text-xs font-bold text-slate-blue uppercase tracking-wide">{label}</span>
            <span className={`block mt-1 text-sm font-semibold ${tones[tone]}`}>{value}</span>
            {hint && <span className="block mt-1 text-xs text-steel-gray break-all">{hint}</span>}
        </div>
    );
};

const inputCls =
    'w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm text-midnight-indigo bg-white focus:outline-none focus:ring-2 focus:ring-action-blue/30 focus:border-action-blue disabled:bg-cloud-mist';
const btnPrimary =
    'px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
    'px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-2 disabled:opacity-50';

// ───────────────────────── Lịch sử lượt chạy ─────────────────────────

const RunRow = ({ run, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);
    const errors = run.results.filter((r) => r.error).length;
    return (
        <li className="border border-platinum-tint rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-cloud-mist/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-blue/40"
                aria-expanded={open}
            >
                {open ? <ChevronDown className="w-4 h-4 text-slate-blue" /> : <ChevronRight className="w-4 h-4 text-slate-blue" />}
                <span className="text-sm font-semibold text-midnight-indigo tabular-nums">{fmtTime(run.startedAt)}</span>
                <StatusPill status={run.status} />
                <span className="text-xs text-slate-blue">
                    {run.trigger === 'schedule' ? 'Tự động' : `Bấm tay${run.requestedByName ? ` · ${run.requestedByName}` : ''}`}
                </span>
                <span className="text-xs text-steel-gray ml-auto">
                    {run.results.map((r) => stepLabel(r.step)).join(' → ') || '—'}
                    {durationOf(run) ? ` · ${durationOf(run)}` : ''}
                    {errors ? ` · ${errors} bước lỗi` : ''}
                </span>
            </button>
            {open && (
                <div className="border-t border-platinum-tint px-4 py-3 space-y-3 bg-cloud-mist/30">
                    {(run.options?.namHoc || run.options?.fromDate) && (
                        <p className="text-xs text-slate-blue">
                            {run.options.namHoc && <>Năm học {run.options.namHoc}, học kỳ {run.options.hocKy}. </>}
                            {run.options.fromDate && <>Lịch học {run.options.fromDate} → {run.options.toDate}. </>}
                            {(run.options.lecturerCodes?.length || run.options.studentCodes?.length) ? (
                                <>Theo mã: {[...(run.options.lecturerCodes ?? []), ...(run.options.studentCodes ?? [])].join(', ')}.</>
                            ) : null}
                        </p>
                    )}
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
                                        <td className="py-2 px-3 text-right">{r.fetched}</td>
                                        <td className="py-2 px-3 text-right">{r.upserted}</td>
                                        <td className={`py-2 px-3 text-right ${r.skipped ? 'text-amber-700 font-semibold' : ''}`}>{r.skipped}</td>
                                        <td className="py-2 px-3 text-right">{r.deactivated}</td>
                                        <td className="py-2 pl-3 min-w-[220px]">
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

// ───────────────────────── Trang ─────────────────────────

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
        <Card title="Tra cứu trực tiếp từ UEL">
            <p className="text-xs text-slate-blue">
                Hỏi thẳng hệ thống của Trường cho 1 người, 1 ngày hoặc 1 buổi. Chỉ xem, không lưu vào hệ thống — dùng để đối chiếu khi dữ liệu đồng bộ có vẻ sai.
            </p>
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <label className="block" htmlFor="uel-lk-type">
                    <span className="block text-xs font-bold text-slate-blue mb-1">Tra cứu</span>
                    <select id="uel-lk-type" className={inputCls} value={form.type}
                        onChange={(e) => { setForm({ ...form, type: e.target.value }); setResult(null); setError(null); }}>
                        {UEL_LOOKUP_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                </label>
                <label className="block" htmlFor="uel-lk-code">
                    <span className="block text-xs font-bold text-slate-blue mb-1">{t.codeLabel}</span>
                    <input id="uel-lk-code" className={inputCls} placeholder={t.placeholder} maxLength={50}
                        value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </label>
                <label className="block" htmlFor="uel-lk-date">
                    <span className="block text-xs font-bold text-slate-blue mb-1">Ngày</span>
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

const UelSync = () => {
    const [status, setStatus] = useState(null);
    const [runs, setRuns] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    // Form chạy tay
    const [steps, setSteps] = useState(UEL_SYNC_STEPS.map((s) => s.key));
    const [runForm, setRunForm] = useState({ namHoc: '', hocKy: '', fromDate: localDate(), toDate: localDate(13), lecturerCodes: '', studentCodes: '' });
    const [starting, setStarting] = useState(false);
    const [runError, setRunError] = useState(null);

    // Cài đặt
    const [settingsForm, setSettingsForm] = useState({ namHoc: '', hocKy: '', sessionDaysAhead: 14 });
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState(null);

    // Bảng giờ tiết
    const [periodRows, setPeriodRows] = useState([]);
    const [savingPeriods, setSavingPeriods] = useState(false);
    const [periodsMsg, setPeriodsMsg] = useState(null);

    const pollRef = useRef(null);

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
            const [st, ps] = await Promise.all([refresh(), getStudyPeriods()]);
            setPeriods(ps ?? []);
            setPeriodRows(ps ?? []);
            const s = st?.settings ?? {};
            setSettingsForm({ namHoc: s.namHoc ?? '', hocKy: s.hocKy ?? '', sessionDaysAhead: s.sessionDaysAhead ?? 14 });
            setRunForm((f) => ({
                ...f,
                namHoc: s.namHoc || f.namHoc,
                hocKy: s.hocKy || f.hocKy,
                toDate: localDate(Math.max(0, (s.sessionDaysAhead ?? 14) - 1)),
            }));
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
        pollRef.current = setInterval(() => {
            refresh().catch(() => undefined);
        }, POLL_MS);
        return () => clearInterval(pollRef.current);
    }, [status?.running, refresh]);

    const needSemester = steps.includes('sections') || steps.includes('enrollments');
    const needDates = steps.includes('sessions');

    const runBlocker = useMemo(() => {
        if (!status) return null;
        if (!status.configured) return 'Chưa cấu hình API key UEL trên server (UEL_API_BASE_URL, UEL_API_KEY).';
        if (status.running) return 'Đang có một lượt đồng bộ chạy.';
        if (!steps.length) return 'Chọn ít nhất một bước.';
        if (needSemester && (!runForm.namHoc.trim() || !runForm.hocKy.trim())) return 'Lớp học phần và đăng ký cần năm học và học kỳ.';
        if (needDates && (!runForm.fromDate || !runForm.toDate || runForm.fromDate > runForm.toDate)) return 'Lịch học cần khoảng ngày hợp lệ.';
        return null;
    }, [status, steps, needSemester, needDates, runForm]);

    const toggleStep = (key) =>
        setSteps((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : UEL_SYNC_STEPS.map((s) => s.key).filter((k) => k === key || cur.includes(k))));

    const handleRun = async () => {
        setRunError(null);
        setStarting(true);
        try {
            const payload = { steps };
            if (needSemester) Object.assign(payload, { namHoc: runForm.namHoc.trim(), hocKy: runForm.hocKy.trim() });
            if (needDates) {
                Object.assign(payload, { fromDate: runForm.fromDate, toDate: runForm.toDate });
                const lecturerCodes = codesOf(runForm.lecturerCodes);
                const studentCodes = codesOf(runForm.studentCodes);
                if (lecturerCodes.length) payload.lecturerCodes = lecturerCodes;
                if (studentCodes.length) payload.studentCodes = studentCodes;
            }
            await runUelSync(payload);
            await refresh();
        } catch (e) {
            setRunError(errorText(e, 'Không bắt đầu được lượt đồng bộ.'));
        } finally {
            setStarting(false);
        }
    };

    const handleSaveSettings = async (ev) => {
        ev.preventDefault();
        setSettingsMsg(null);
        setSavingSettings(true);
        try {
            const saved = await updateUelSyncSettings({
                namHoc: settingsForm.namHoc.trim(),
                hocKy: settingsForm.hocKy.trim(),
                sessionDaysAhead: Number(settingsForm.sessionDaysAhead),
            });
            setSettingsForm(saved);
            setSettingsMsg({ ok: true, text: 'Đã lưu cài đặt.' });
            await refresh();
        } catch (e) {
            setSettingsMsg({ ok: false, text: errorText(e, 'Không lưu được cài đặt.') });
        } finally {
            setSavingSettings(false);
        }
    };

    const setPeriod = (i, field, value) =>
        setPeriodRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: field === 'periodNo' ? Number(value) : value } : r)));

    const addPeriod = () =>
        setPeriodRows((rows) => {
            const last = rows[rows.length - 1];
            return [...rows, { periodNo: (last?.periodNo ?? 0) + 1, startTime: last?.endTime ?? '07:00', endTime: '' }];
        });

    const handleSavePeriods = async () => {
        setPeriodsMsg(null);
        setSavingPeriods(true);
        try {
            const saved = await replaceStudyPeriods(periodRows);
            setPeriods(saved);
            setPeriodRows(saved);
            setPeriodsMsg({ ok: true, text: `Đã lưu ${saved.length} tiết. Buổi học đã đồng bộ sẽ cập nhật giờ ở lần đồng bộ lịch học kế tiếp.` });
            await refresh();
        } catch (e) {
            setPeriodsMsg({ ok: false, text: errorText(e, 'Không lưu được bảng giờ tiết.') });
        } finally {
            setSavingPeriods(false);
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

    const s = status?.settings ?? {};
    const periodsDirty = JSON.stringify(periodRows) !== JSON.stringify(periods);

    return (
        <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
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
                    <RefreshCw className={`w-4 h-4 ${status?.running ? 'animate-spin' : ''}`} />
                    Làm mới
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Fact
                    label="Kết nối API"
                    value={status?.configured ? 'Đã cấu hình' : 'Chưa có API key'}
                    tone={status?.configured ? 'ok' : 'warn'}
                    hint={status?.configured ? null : 'Đặt UEL_API_KEY trên server'}
                />
                <Fact
                    label="Chạy tự động"
                    value={status?.schedule?.enabled ? status.schedule.label : 'Đang tắt'}
                    tone={status?.schedule?.enabled ? 'ok' : 'neutral'}
                    hint={status?.schedule?.enabled ? null : 'Bật bằng SCHEDULER_UEL_SYNC_ENABLED'}
                />
                <Fact
                    label="Học kỳ hiện tại"
                    value={s.namHoc ? `${s.namHoc} · HK${s.hocKy}` : 'Chưa cài'}
                    tone={s.namHoc ? 'neutral' : 'warn'}
                    hint={s.namHoc ? `Lịch học kéo trước ${s.sessionDaysAhead} ngày` : 'Lượt tự động sẽ bỏ qua lớp HP'}
                />
                <Fact
                    label="Bảng giờ tiết"
                    value={status?.periodCount ? `${status.periodCount} tiết` : 'Chưa nhập'}
                    tone={status?.periodCount ? 'neutral' : 'warn'}
                    hint={status?.periodCount ? null : 'Chưa có thì không đồng bộ được lịch học'}
                />
            </div>

            <Card title="Chạy đồng bộ">
                <fieldset className="space-y-2">
                    <legend className="text-xs font-bold text-slate-blue uppercase mb-2">Các bước</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {UEL_SYNC_STEPS.map((st, i) => (
                            <label
                                key={st.key}
                                htmlFor={`uel-step-${st.key}`}
                                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                    steps.includes(st.key) ? 'border-action-blue/50 bg-blue-50/50' : 'border-platinum-tint bg-white'
                                }`}
                            >
                                <input
                                    id={`uel-step-${st.key}`}
                                    type="checkbox"
                                    className="mt-0.5 accent-action-blue"
                                    checked={steps.includes(st.key)}
                                    onChange={() => toggleStep(st.key)}
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-midnight-indigo">{i + 1}. {st.label}</span>
                                    <span className="block text-xs text-steel-gray">{st.hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label className="block" htmlFor="uel-run-namhoc">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Năm học</span>
                        <input id="uel-run-namhoc" className={inputCls} placeholder="2026-2027" disabled={!needSemester}
                            value={runForm.namHoc} onChange={(e) => setRunForm({ ...runForm, namHoc: e.target.value })} />
                    </label>
                    <label className="block" htmlFor="uel-run-hocky">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Học kỳ</span>
                        <input id="uel-run-hocky" className={inputCls} placeholder="HK01" disabled={!needSemester}
                            value={runForm.hocKy} onChange={(e) => setRunForm({ ...runForm, hocKy: e.target.value })} />
                    </label>
                    <label className="block" htmlFor="uel-run-from">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Lịch học từ ngày</span>
                        <input id="uel-run-from" type="date" className={inputCls} disabled={!needDates}
                            value={runForm.fromDate} onChange={(e) => setRunForm({ ...runForm, fromDate: e.target.value })} />
                    </label>
                    <label className="block" htmlFor="uel-run-to">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Đến ngày</span>
                        <input id="uel-run-to" type="date" className={inputCls} disabled={!needDates}
                            value={runForm.toDate} onChange={(e) => setRunForm({ ...runForm, toDate: e.target.value })} />
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block" htmlFor="uel-run-gv">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Lịch học theo mã giảng viên (tùy chọn)</span>
                        <input id="uel-run-gv" className={inputCls} placeholder="VD: GV0001, 22.001" disabled={!needDates} maxLength={500}
                            value={runForm.lecturerCodes} onChange={(e) => setRunForm({ ...runForm, lecturerCodes: e.target.value })} />
                    </label>
                    <label className="block" htmlFor="uel-run-sv">
                        <span className="block text-xs font-bold text-slate-blue mb-1">Lịch học theo mã sinh viên (tùy chọn)</span>
                        <input id="uel-run-sv" className={inputCls} placeholder="VD: K240000001" disabled={!needDates} maxLength={500}
                            value={runForm.studentCodes} onChange={(e) => setRunForm({ ...runForm, studentCodes: e.target.value })} />
                    </label>
                </div>
                {needDates && (
                    <p className="text-xs text-steel-gray">
                        Có nhập mã: chỉ lấy lịch của những người đó (mỗi mã × mỗi ngày = 1 lần gọi API, tối đa 600) và không hủy buổi nào.
                        Để trống: lấy lịch toàn trường theo ngày. Giờ buổi học lấy từ API; bảng giờ tiết chỉ dùng khi API không trả giờ.
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={handleRun} disabled={!!runBlocker || starting} className={btnPrimary}>
                        <Play className="w-4 h-4" />
                        {status?.running ? 'Đang đồng bộ...' : starting ? 'Đang bắt đầu...' : 'Chạy đồng bộ'}
                    </button>
                    {runBlocker && <span className="text-sm text-amber-700">{runBlocker}</span>}
                    {runError && <span className="text-sm text-red-700">{runError}</span>}
                </div>
            </Card>

            <Card title="Các lượt gần đây">
                {runs.length === 0 ? (
                    <p className="text-sm text-steel-gray">Chưa có lượt đồng bộ nào. Bấm "Chạy đồng bộ" ở trên để chạy lượt đầu tiên.</p>
                ) : (
                    <ul className="space-y-2">
                        {runs.map((r, i) => <RunRow key={r.id ?? r.startedAt} run={r} defaultOpen={i === 0} />)}
                    </ul>
                )}
            </Card>

            <LookupCard />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Cài đặt chạy tự động">
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <p className="text-xs text-slate-blue">
                            Lượt tự động ({status?.schedule?.label ?? '02:00 hằng ngày'}) dùng học kỳ này cho lớp học phần và đăng ký,
                            và kéo lịch học từ hôm nay đến số ngày bên dưới. Để trống học kỳ thì lượt tự động chỉ chạy đơn vị, cán bộ, sinh viên.
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <label className="block col-span-1" htmlFor="uel-set-namhoc">
                                <span className="block text-xs font-bold text-slate-blue mb-1">Năm học</span>
                                <input id="uel-set-namhoc" className={inputCls} placeholder="2026-2027"
                                    value={settingsForm.namHoc} onChange={(e) => setSettingsForm({ ...settingsForm, namHoc: e.target.value })} />
                            </label>
                            <label className="block" htmlFor="uel-set-hocky">
                                <span className="block text-xs font-bold text-slate-blue mb-1">Học kỳ</span>
                                <input id="uel-set-hocky" className={inputCls} placeholder="HK01"
                                    value={settingsForm.hocKy} onChange={(e) => setSettingsForm({ ...settingsForm, hocKy: e.target.value })} />
                            </label>
                            <label className="block" htmlFor="uel-set-days">
                                <span className="block text-xs font-bold text-slate-blue mb-1">Số ngày lịch học</span>
                                <input id="uel-set-days" type="number" min={1} max={120} className={inputCls}
                                    value={settingsForm.sessionDaysAhead}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, sessionDaysAhead: e.target.value })} />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="submit" disabled={savingSettings} className={btnPrimary}>
                                {savingSettings ? 'Đang lưu...' : 'Lưu cài đặt'}
                            </button>
                            {settingsMsg && (
                                <span className={`text-sm ${settingsMsg.ok ? 'text-green-700' : 'text-red-700'}`}>{settingsMsg.text}</span>
                            )}
                        </div>
                    </form>
                </Card>

                <Card
                    title="Bảng giờ tiết"
                    action={
                        <button type="button" onClick={addPeriod} className={btnGhost} disabled={periodRows.length >= 30}>
                            <Plus className="w-4 h-4" /> Thêm tiết
                        </button>
                    }
                >
                    <p className="text-xs text-slate-blue">
                        Thời khóa biểu của Trường trả về tiết bắt đầu và số tiết; bảng này quy đổi tiết sang giờ để mở điểm danh bằng camera đúng giờ.
                    </p>
                    {periodRows.length === 0 ? (
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
                                    {periodRows.map((p, i) => (
                                        <tr key={i} className="border-t border-platinum-tint/60">
                                            <td className="py-1.5 pr-2 w-20">
                                                <input id={`uel-p-no-${i}`} aria-label="Số tiết" type="number" min={1} max={30} className={inputCls}
                                                    value={p.periodNo} onChange={(e) => setPeriod(i, 'periodNo', e.target.value)} />
                                            </td>
                                            <td className="py-1.5 px-2">
                                                <input id={`uel-p-start-${i}`} aria-label={`Giờ bắt đầu tiết ${p.periodNo}`} type="time" className={inputCls}
                                                    value={p.startTime} onChange={(e) => setPeriod(i, 'startTime', e.target.value)} />
                                            </td>
                                            <td className="py-1.5 px-2">
                                                <input id={`uel-p-end-${i}`} aria-label={`Giờ kết thúc tiết ${p.periodNo}`} type="time" className={inputCls}
                                                    value={p.endTime} onChange={(e) => setPeriod(i, 'endTime', e.target.value)} />
                                            </td>
                                            <td className="py-1.5 pl-2">
                                                <button type="button" aria-label={`Xóa tiết ${p.periodNo}`}
                                                    onClick={() => setPeriodRows((rows) => rows.filter((_, idx) => idx !== i))}
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
                        <button type="button" onClick={handleSavePeriods} disabled={savingPeriods || !periodsDirty} className={btnPrimary}>
                            {savingPeriods ? 'Đang lưu...' : 'Lưu bảng giờ tiết'}
                        </button>
                        {periodsMsg && (
                            <span className={`text-sm ${periodsMsg.ok ? 'text-green-700' : 'text-red-700'}`}>{periodsMsg.text}</span>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default UelSync;
