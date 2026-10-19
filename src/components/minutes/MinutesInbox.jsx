import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Eye, FileText, MapPin, PenLine, RefreshCw, RotateCcw, Send, X } from 'lucide-react';
import toast from '../../utils/toast';
import { getMinutesInbox, submitMinutesSignoff, reviewMinutesSignoff } from '../../service/employeeServices';
import { getMeetingMinutesById, updateMeetingMinutes, issueMeetingMinutes } from '../../service/minutesServices';

const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const STAGE = {
    not_drafted: { label: 'Chưa soạn', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    not_submitted: { label: 'Chưa trình ký', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    returned: { label: 'Bị trả lại', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    pending_review: { label: 'Chờ ký duyệt', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    approved: { label: 'Đã duyệt · chờ ban hành', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/**
 * Kho biên bản › "Cần xử lý": các cuộc họp yêu cầu trình ký mà user là chủ trì / thư ký / người ký.
 * Duyệt, trả lại, sửa (modal), trình ký, ban hành ngay tại chỗ; soạn mới thì mở trang chi tiết cuộc họp.
 */
const MinutesInbox = ({ onOpenMinutes, onCount }) => {
    const [items, setItems] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [returning, setReturning] = useState(null); // meetingId đang nhập góp ý trả lại
    const [note, setNote] = useState('');
    const [editing, setEditing] = useState(null); // { item, minutes, content }
    const [saving, setSaving] = useState(false);
    const [issuing, setIssuing] = useState(null); // item đang chờ xác nhận ban hành
    const navigate = useNavigate();

    const load = useCallback(async () => {
        try {
            const res = await getMinutesInbox();
            const data = res?.data || { items: [], mineCount: 0 };
            setItems(data.items);
            onCount?.(data.mineCount);
        } catch {
            setItems([]);
        }
    }, [onCount]);

    useEffect(() => { load(); }, [load]);

    const meetingPath = (id) => `/${window.location.pathname.split('/')[1]}/meeting/${id}`;

    const run = async (id, fn, okMsg) => {
        setBusyId(id);
        try {
            const res = await fn();
            if (res?.success) {
                toast.success(okMsg);
                setReturning(null);
                setNote('');
                await load();
            }
        } catch {
            // request.js đã hiện toast lỗi
        } finally {
            setBusyId(null);
        }
    };

    const openEdit = async (it) => {
        setBusyId(it.meetingId);
        try {
            const res = await getMeetingMinutesById(it.minutesId);
            const m = res?.data;
            if (m) setEditing({ item: it, minutes: m, content: m.mainContent?.minutesContent || '' });
        } catch {
            // request.js đã hiện toast lỗi
        } finally {
            setBusyId(null);
        }
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            const res = await updateMeetingMinutes(editing.minutes.id, { versionNo: editing.minutes.versionNo, minutesContent: editing.content });
            if (res?.success) {
                toast.success('Đã lưu biên bản, bạn có thể trình ký lại');
                setEditing(null);
                await load();
            }
        } catch {
            // request.js đã hiện toast lỗi
        } finally {
            setSaving(false);
        }
    };

    if (items === null) {
        return <div className="py-16 text-center text-xs text-slate-blue">Đang tải…</div>;
    }
    if (items.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-platinum-tint p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm font-bold text-midnight-indigo">Không có biên bản nào cần xử lý</p>
                <p className="text-xs text-slate-blue mt-1">Các cuộc họp yêu cầu trình ký biên bản sẽ hiện ở đây khi đến lượt bạn.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <button onClick={load} className="flex items-center gap-1.5 text-xs font-bold text-slate-blue hover:text-midnight-indigo">
                    <RefreshCw className="w-3.5 h-3.5" /> Làm mới
                </button>
            </div>
            {items.map((it) => {
                const st = STAGE[it.stage];
                const busy = busyId === it.meetingId;
                return (
                    <div
                        key={it.meetingId}
                        className={`bg-white rounded-2xl border p-4 ${it.mine ? 'border-action-blue/40 shadow-sm' : 'border-platinum-tint'}`}
                    >
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                                    {it.mine && <span className="text-[10px] font-bold text-action-blue">Đến lượt bạn</span>}
                                </div>
                                <p className="text-sm font-bold text-midnight-indigo truncate">{it.title}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-blue">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(it.startTime)}</span>
                                    {it.roomName && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{it.roomName}</span>}
                                    <span>Thư ký: <b>{it.secretaryName || '—'}</b></span>
                                    <span>Người ký: <b>{it.signerName || it.hostName}</b></span>
                                </div>
                                {it.stage === 'returned' && it.note && (
                                    <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                                        <b>Góp ý:</b> {it.note}
                                        {it.needsEdit && it.canEdit && <span className="block mt-1 text-rose-600/80">Bấm Sửa để chỉnh theo góp ý, lưu xong nút Trình ký lại sẽ hiện.</span>}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 shrink-0">
                                {it.minutesId && (
                                    <button
                                        onClick={() => onOpenMinutes?.({ id: it.minutesId, title: it.minutesTitle || it.title, status: 'draft' })}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-platinum-tint text-slate-blue hover:bg-cloud-mist"
                                    >
                                        <Eye className="w-3.5 h-3.5" /> Xem
                                    </button>
                                )}
                                {it.canReview && (
                                    <>
                                        <button
                                            disabled={busy}
                                            onClick={() => run(it.meetingId, () => reviewMinutesSignoff(it.meetingId, { decision: 'approve' }), 'Đã ký duyệt biên bản')}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                                        </button>
                                        <button
                                            disabled={busy}
                                            onClick={() => { setReturning(returning === it.meetingId ? null : it.meetingId); setNote(''); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" /> Trả lại
                                        </button>
                                    </>
                                )}
                                {it.canSubmit && (
                                    <button
                                        disabled={busy}
                                        onClick={() => run(it.meetingId, () => submitMinutesSignoff(it.meetingId), 'Đã trình ký biên bản')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-action-blue hover:opacity-90 text-white disabled:opacity-50"
                                    >
                                        <Send className="w-3.5 h-3.5" /> {it.stage === 'returned' ? 'Trình ký lại' : 'Trình ký'}
                                    </button>
                                )}
                                {it.stage === 'returned' && it.mine && it.canEdit && it.minutesId && (
                                    <button
                                        disabled={busy}
                                        onClick={() => openEdit(it)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-platinum-tint text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50"
                                    >
                                        <PenLine className="w-3.5 h-3.5" /> Sửa
                                    </button>
                                )}
                                {it.stage === 'approved' && it.canIssue && it.minutesId && (
                                    <button
                                        disabled={busy}
                                        onClick={() => setIssuing(it)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                    >
                                        <FileText className="w-3.5 h-3.5" /> Ban hành
                                    </button>
                                )}
                                {it.mine && ['not_drafted', 'not_submitted'].includes(it.stage) && it.canEdit && (
                                    <button
                                        onClick={() => navigate(meetingPath(it.meetingId))}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-platinum-tint text-midnight-indigo hover:bg-cloud-mist"
                                    >
                                        <PenLine className="w-3.5 h-3.5" /> Soạn biên bản
                                    </button>
                                )}
                            </div>
                        </div>

                        {returning === it.meetingId && (
                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={2}
                                    placeholder="Góp ý cho thư ký (bắt buộc), ví dụ: bổ sung người chịu trách nhiệm và hạn hoàn thành"
                                    className="flex-1 text-xs border border-platinum-tint rounded-lg px-3 py-2 focus:outline-none focus:border-action-blue"
                                />
                                <button
                                    disabled={busy || !note.trim()}
                                    onClick={() => run(it.meetingId, () => reviewMinutesSignoff(it.meetingId, { decision: 'return', note: note.trim() }), 'Đã trả lại biên bản')}
                                    className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 self-start"
                                >
                                    Gửi trả lại
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {issuing && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-midnight-indigo mb-2">Xác nhận ban hành biên bản</h3>
                        <p className="text-sm text-slate-blue leading-relaxed">
                            Ban hành biên bản <b className="text-midnight-indigo">{issuing.title}</b>? Biên bản sẽ chuyển sang trạng thái <b className="text-midnight-indigo">Published</b> và hệ thống gửi thông báo đến tất cả thành viên cuộc họp. Bạn sẽ không thể sửa nội dung sau bước này.
                        </p>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                disabled={busyId === issuing.meetingId}
                                onClick={() => setIssuing(null)}
                                className="px-5 py-2 text-sm font-bold rounded-xl border border-platinum-tint text-slate-blue hover:bg-cloud-mist disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                disabled={busyId === issuing.meetingId}
                                onClick={async () => {
                                    await run(issuing.meetingId, () => issueMeetingMinutes(issuing.minutesId), 'Đã ban hành biên bản');
                                    setIssuing(null);
                                }}
                                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                                <Send className="w-4 h-4" /> {busyId === issuing.meetingId ? 'Đang ban hành…' : 'Ban hành'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {editing && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-platinum-tint">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-midnight-indigo truncate">Sửa biên bản · {editing.item.title}</p>
                                <p className="text-[11px] text-slate-blue">Phiên bản {editing.minutes.versionNo}</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-cloud-mist"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-5 space-y-3 overflow-y-auto">
                            {editing.item.note && (
                                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2"><b>Góp ý:</b> {editing.item.note}</p>
                            )}
                            <textarea
                                value={editing.content}
                                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                                rows={16}
                                className="w-full text-sm border border-platinum-tint rounded-lg px-3 py-2 focus:outline-none focus:border-action-blue"
                            />
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-platinum-tint">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs font-bold rounded-lg border border-platinum-tint text-slate-blue hover:bg-cloud-mist">Hủy</button>
                            <button
                                disabled={saving || editing.content === (editing.minutes.mainContent?.minutesContent || '')}
                                onClick={saveEdit}
                                className="px-4 py-2 text-xs font-bold rounded-lg bg-action-blue hover:opacity-90 text-white disabled:opacity-50"
                            >
                                {saving ? 'Đang lưu…' : 'Lưu'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default MinutesInbox;
