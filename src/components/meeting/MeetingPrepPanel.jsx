import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Download, FileText, PenLine, Repeat, RotateCcw, Upload, XCircle } from 'lucide-react';
import toast from '../../utils/toast';
import {
    getMeetingPrep,
    submitMeetingReport,
    submitMinutesSignoff,
    reviewMinutesSignoff,
    getMediaFile,
} from '../../service/employeeServices';

const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtDay = (d) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });

const SIGNOFF_BADGE = {
    pending: { label: 'Chờ ký duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    approved: { label: 'Đã ký duyệt', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    returned: { label: 'Bị trả lại', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const ACTION_LABEL = { submitted: 'Trình ký', approved: 'Ký duyệt', returned: 'Trả lại' };
const SERIES_TYPE = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' };
const WEEKDAY_LABEL = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

/**
 * Nộp báo cáo trước họp (UEL 12), trình ký biên bản (UEL 13) và thông tin chuỗi lặp (UEL 16)
 * trên trang chi tiết. `onSeries` báo chuỗi lặp cho trang cha để hỏi phạm vi khi sửa / huỷ.
 */
const MeetingPrepPanel = ({ meetingId, onSeries, onOpenMeeting }) => {
    const [prep, setPrep] = useState(null);
    const [busy, setBusy] = useState(false);
    const [returnNote, setReturnNote] = useState('');
    const [showReturn, setShowReturn] = useState(false);
    const fileRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await getMeetingPrep(meetingId);
            setPrep(res?.data || null);
            onSeries?.(res?.data?.series || null);
        } catch {
            setPrep(null);
        }
    }, [meetingId, onSeries]);

    useEffect(() => { load(); }, [load]);

    // Trình ký / ký duyệt ở nơi khác (tab Biên bản) ⇒ tải lại; ngược lại báo cho tab Biên bản.
    useEffect(() => {
        const onChanged = (e) => { if (e.detail?.meetingId === meetingId && e.detail.source !== 'prep') load(); };
        window.addEventListener('meeting-signoff-changed', onChanged);
        return () => window.removeEventListener('meeting-signoff-changed', onChanged);
    }, [meetingId, load]);

    const run = async (fn, okMsg) => {
        setBusy(true);
        try {
            await fn();
            toast.success(okMsg);
            await load();
            window.dispatchEvent(new CustomEvent('meeting-signoff-changed', { detail: { meetingId, source: 'prep' } }));
            return true;
        } catch {
            return false; // request.js đã toast lỗi
        } finally {
            setBusy(false);
        }
    };

    const download = async (fileId) => {
        try {
            const res = await getMediaFile(fileId);
            if (res?.data?.downloadUrl) window.open(res.data.downloadUrl, '_blank', 'noopener');
        } catch { /* đã toast */ }
    };

    const onPickFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        await run(() => submitMeetingReport(meetingId, fd), 'Đã nộp báo cáo');
    };

    if (!prep || (!prep.report && !prep.signoff && !prep.series)) return null;
    const { report, signoff, series } = prep;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {series && (
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Repeat className="w-4 h-4 text-violet-500" />
                            <span className="text-sm font-bold text-midnight-indigo uppercase tracking-wider">Lịch lặp lại</span>
                        </div>
                        <span className="text-xs text-slate-blue">
                            {SERIES_TYPE[series.type] || 'Lặp lại'}
                            {series.type === 'weekly' && series.daysOfWeek?.length ? ` (${series.daysOfWeek.map(d => WEEKDAY_LABEL[d]).join(', ')})` : ''}
                            {' · '}Buổi {series.index}/{series.total}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {series.occurrences.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => o.id !== meetingId && onOpenMeeting?.(o.id)}
                                className={`px-2.5 py-1 text-xs rounded-lg border ${o.id === meetingId ? 'bg-violet-500 text-white border-violet-500' : o.status === 'cancelled' ? 'bg-slate-50 text-slate-400 border-platinum-tint line-through' : 'bg-white text-midnight-indigo border-platinum-tint hover:border-violet-400'}`}
                                title={o.status}
                            >
                                {fmtDay(o.startTime)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {report && (
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-bold text-midnight-indigo uppercase tracking-wider">Báo cáo trước họp</span>
                        </div>
                        {prep.canManage && (
                            <span className="text-xs font-semibold text-slate-blue">Đã nộp {report.submittedCount}/{report.totalCount}</span>
                        )}
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${report.isOverdue ? 'text-rose-600' : 'text-slate-blue'}`}>
                        <Clock className="w-3.5 h-3.5" /> Hạn nộp: {fmt(report.deadline)}{report.isOverdue ? ' (đã quá hạn)' : ''}
                    </div>
                    {report.note && <p className="text-sm text-midnight-indigo bg-cloud-mist/50 rounded-lg px-3 py-2">{report.note}</p>}

                    {report.mine && (
                        <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50/40 rounded-xl px-3 py-2.5">
                            <div className="min-w-0 text-sm">
                                {report.mine.file ? (
                                    <button type="button" onClick={() => download(report.mine.file.id)} className="text-action-blue hover:underline truncate block max-w-full text-left">
                                        {report.mine.file.fileName}
                                    </button>
                                ) : (
                                    <span className="text-amber-700 font-medium">Bạn chưa nộp báo cáo</span>
                                )}
                                {report.mine.submittedAt && <span className="text-xs text-slate-blue">Nộp lúc {fmt(report.mine.submittedAt)}</span>}
                            </div>
                            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={onPickFile} />
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => fileRef.current?.click()}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                                <Upload className="w-3.5 h-3.5" /> {report.mine.file ? 'Nộp lại' : 'Nộp báo cáo'}
                            </button>
                        </div>
                    )}

                    {report.items && (
                        <ul className="divide-y divide-cloud-mist border border-platinum-tint rounded-xl">
                            {report.items.map((it) => (
                                <li key={it.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="flex items-center gap-2 min-w-0">
                                        {it.submittedAt
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            : <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
                                        <span className="truncate text-midnight-indigo">{it.fullName}</span>
                                    </span>
                                    {it.file ? (
                                        <button type="button" onClick={() => download(it.file.id)} className="flex items-center gap-1 text-xs text-action-blue hover:underline truncate max-w-[55%]">
                                            <Download className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{it.file.fileName}</span>
                                        </button>
                                    ) : (
                                        <span className="text-xs text-slate-blue">Chưa nộp</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {signoff && (
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PenLine className="w-4 h-4 text-rose-500" />
                            <span className="text-sm font-bold text-midnight-indigo uppercase tracking-wider">Trình ký biên bản</span>
                        </div>
                        {signoff.status
                            ? <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${SIGNOFF_BADGE[signoff.status].cls}`}>{SIGNOFF_BADGE[signoff.status].label}</span>
                            : <span className="px-2 py-0.5 text-xs font-semibold rounded-full border bg-slate-50 text-slate-blue border-platinum-tint">Chưa trình</span>}
                    </div>
                    <p className="text-sm text-slate-blue">Người ký duyệt: <span className="font-semibold text-midnight-indigo">{signoff.signer?.fullName || '—'}</span></p>
                    {signoff.status === 'returned' && signoff.note && (
                        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Góp ý: {signoff.note}</p>
                    )}
                    {signoff.minutes && signoff.canReview && (
                        <div className="border border-platinum-tint rounded-xl p-3 max-h-56 overflow-y-auto">
                            <div className="text-sm font-semibold text-midnight-indigo mb-1">{signoff.minutes.title}</div>
                            {/<[a-z][\s\S]*>/i.test(signoff.minutes.content || '')
                                ? <div className="prose prose-sm max-w-none text-midnight-indigo" dangerouslySetInnerHTML={{ __html: signoff.minutes.content }} />
                                : <div className="text-sm text-midnight-indigo whitespace-pre-wrap">{signoff.minutes.content}</div>}
                        </div>
                    )}

                    {signoff.needsEdit && prep.canManage && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                            Biên bản bị trả lại. Sửa theo góp ý ở tab <b>Biên bản</b> rồi mới trình ký lại được.
                        </p>
                    )}
                    {signoff.canSubmit && !signoff.hasDraft && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Chưa có biên bản nháp. Thư ký soạn biên bản ở tab <b>Biên bản</b>, sau đó quay lại trình ký.
                        </p>
                    )}
                    {signoff.canSubmit && (
                        <button
                            type="button"
                            disabled={busy || !signoff.hasDraft}
                            onClick={() => run(() => submitMinutesSignoff(meetingId), 'Đã trình ký biên bản')}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-action-blue hover:opacity-90 text-white disabled:opacity-50"
                        >
                            <PenLine className="w-3.5 h-3.5" /> {signoff.status === 'returned' ? 'Trình ký lại' : 'Trình ký biên bản'}
                        </button>
                    )}
                    {!signoff.canSubmit && prep.canManage && !signoff.status && (
                        <p className="text-xs text-slate-blue">Trình ký được sau khi cuộc họp kết thúc và đã có biên bản nháp.</p>
                    )}

                    {signoff.canReview && (
                        <div className="space-y-2">
                            {showReturn && (
                                <textarea
                                    value={returnNote}
                                    onChange={(e) => setReturnNote(e.target.value)}
                                    rows={2}
                                    maxLength={2000}
                                    placeholder="Nội dung cần chỉnh sửa, VD: Bổ sung người chịu trách nhiệm và hạn hoàn thành"
                                    className="w-full px-3 py-2 text-sm border border-platinum-tint rounded-lg focus:outline-none focus:border-rose-400 resize-none"
                                />
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => run(() => reviewMinutesSignoff(meetingId, { decision: 'approve' }), 'Đã ký duyệt biên bản')}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Ký duyệt
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || (showReturn && !returnNote.trim())}
                                    onClick={async () => {
                                        if (!showReturn) { setShowReturn(true); return; }
                                        const ok = await run(() => reviewMinutesSignoff(meetingId, { decision: 'return', note: returnNote.trim() }), 'Đã trả lại biên bản');
                                        if (ok) { setShowReturn(false); setReturnNote(''); }
                                    }}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                >
                                    <XCircle className="w-3.5 h-3.5" /> {showReturn ? 'Gửi trả lại' : 'Trả lại'}
                                </button>
                            </div>
                        </div>
                    )}

                    {signoff.history?.length > 0 && (
                        <ol className="border-l-2 border-cloud-mist pl-3 space-y-1.5">
                            {signoff.history.map((h, i) => (
                                <li key={i} className="text-xs text-slate-blue">
                                    <span className="font-semibold text-midnight-indigo">{ACTION_LABEL[h.action]}</span>
                                    {' · '}{h.actorName}{' · '}{fmt(h.at)}
                                    {h.note && <span className="block text-midnight-indigo"><RotateCcw className="inline w-3 h-3 mr-1" />{h.note}</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
};

export default MeetingPrepPanel;
