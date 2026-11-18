import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldOff, UserX, X } from 'lucide-react';
import ThumbnailImage from '../common/ThumbnailImage';
import { dismissStrangerEvents, getStrangerSightings } from '../../service/businessAdminServices';

/**
 * Đóng cảnh báo người lạ: bắt buộc chọn lý do (lưu phía máy chủ cùng người đóng + audit), mở lại được.
 * Thay cho nút "Bỏ qua" cũ vốn chỉ ẩn trong trình duyệt, không ai chịu trách nhiệm.
 */

export const DISMISS_REASONS = [
    { value: 'legit_visitor', label: 'Khách / đối tác hợp lệ', hint: 'Người này được phép có mặt (khách, nhà thầu, phụ huynh…)' },
    { value: 'ai_false_positive', label: 'AI nhận nhầm', hint: 'Không phải người thật hoặc ảnh chụp lỗi (bóng, phản chiếu, ảnh poster…)' },
    { value: 'handled_offline', label: 'Đã xử lý ngoài hệ thống', hint: 'Bảo vệ / quản lý đã kiểm tra trực tiếp' },
    { value: 'other', label: 'Lý do khác', hint: 'Cần ghi chú rõ' },
];
export const dismissReasonLabel = (v) => DISMISS_REASONS.find((r) => r.value === v)?.label || v || '—';

const fmtDateTime = (v) =>
    new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const errMsg = (e, fallback) => e?.error?.message || e?.message || fallback;
const inputCls = 'px-3 py-2 bg-white border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none';

const EVENT_BATCH = 100; // BE nhận tối đa 100 eventIds mỗi lần

/** Lượt cần đóng của 1 người lạ: 1 lượt ⇒ dùng luôn latestEventId, nhiều lượt ⇒ hỏi BE. */
const sightingsOf = async (s) => {
    if (s.hitCount === 1 && s.latestEventId) return [{ eventId: s.latestEventId, time: s.lastSeen }];
    const res = await getStrangerSightings(s.deviceId, s.strangerId);
    return res?.data || [];
};

/** `stranger` = đóng 1 người lạ; `strangers` = đóng hàng loạt (cùng 1 lý do). */
const StrangerDismissModal = ({ stranger, strangers, onClose, onDone }) => {
    const list = strangers?.length ? strangers : [stranger];
    const first = list[0];
    const bulk = list.length > 1;
    const [sightings, setSightings] = useState(null);
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        Promise.all(list.map((s) => sightingsOf(s).catch(() => [])))
            .then((all) => {
                if (!alive) return;
                const merged = all.flat().sort((a, b) => new Date(b.time) - new Date(a.time));
                setSightings(merged);
            });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stranger, strangers]);

    const noteRequired = reason === 'other';
    const canSubmit = Boolean(reason) && (!noteRequired || note.trim().length >= 5) && sightings?.length > 0 && !saving;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        setError('');
        try {
            const ids = [...new Set(sightings.map((x) => x.eventId))];
            for (let i = 0; i < ids.length; i += EVENT_BATCH) {
                await dismissStrangerEvents({
                    eventIds: ids.slice(i, i + EVENT_BATCH),
                    reason,
                    ...(note.trim() ? { note: note.trim() } : {}),
                });
            }
            onDone(`Đã đóng ${bulk ? `${list.length} người lạ (${ids.length} lượt)` : `${ids.length} lượt`} — lý do: ${dismissReasonLabel(reason)}.`);
        } catch (err) {
            setError(errMsg(err, 'Không đóng được cảnh báo. Có thể bạn không có quyền.'));
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {first.snapshotEventId
                            ? <ThumbnailImage eventId={first.snapshotEventId} className="w-16 h-16 shrink-0" />
                            : <div className="w-16 h-16 shrink-0 rounded-lg bg-slate-200 flex items-center justify-center"><UserX className="w-6 h-6 text-slate-400" /></div>}
                        <div className="min-w-0">
                            <p className="font-extrabold text-midnight-indigo">{bulk ? `Đóng cảnh báo ${list.length} người lạ` : 'Đóng cảnh báo người lạ'}</p>
                            <p className="text-xs text-slate-blue">
                                Ghi nhận lý do để người khác biết vì sao không cần xử lý thêm. Có thể mở lại trong tab “Đã đóng”.
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-lg hover:bg-slate-100 shrink-0"><X className="w-5 h-5" /></button>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-blue">
                    {sightings === null
                        ? 'Đang tải các lượt xuất hiện...'
                        : sightings.length === 0
                            ? 'Không còn lượt nào ở trạng thái chờ xử lý.'
                            : <>Sẽ đóng <b className="text-midnight-indigo">{bulk ? `${list.length} người lạ · ` : ''}{sightings.length} lượt</b> (gần nhất {fmtDateTime(sightings[0].time)}).</>}
                </div>

                <fieldset className="space-y-2">
                    <legend className="text-xs font-bold text-slate-blue mb-1">Lý do đóng *</legend>
                    {DISMISS_REASONS.map((r) => (
                        <label key={r.value} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${reason === r.value ? 'border-action-blue bg-blue-50' : 'border-platinum-tint hover:bg-cloud-mist'}`}>
                            <input type="radio" name="dismiss-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1" />
                            <span>
                                <span className="block text-sm font-semibold text-midnight-indigo">{r.label}</span>
                                <span data-ui-text="secondary" className="block text-[11px] text-slate-blue">{r.hint}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>

                <label className="block text-xs font-bold text-slate-blue">Ghi chú{noteRequired ? ' *' : ' (tùy chọn)'}
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${inputCls} w-full mt-1`}
                        placeholder={noteRequired ? 'Ghi rõ lý do (ít nhất 5 ký tự)' : 'VD: Khách đã đăng ký với bảo vệ cổng A'} />
                </label>

                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-blue hover:bg-slate-100">Hủy</button>
                    <button type="submit" disabled={!canSubmit}
                        className="px-4 py-2 rounded-xl bg-midnight-indigo hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
                        <ShieldOff className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Đóng cảnh báo'}
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
};

export default StrangerDismissModal;
