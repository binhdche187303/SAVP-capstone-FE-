import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
    getVisit, approveVisit, rejectVisit, cancelVisit, revokeVisit, extendVisit,
    attachVisitorPhoto, checkInVisit, checkOutVisit, closeVisitManually,
} from '../../service/visitorService';
import toast from '../../utils/toast';
import { inputCls, labelCls, btnPrimary, btnGhost, btnDanger, errorBoxCls, spinnerCls } from '../common/uiClasses';
import VisitorAvatar from './VisitorAvatar';
import VisitStatusBadge from './VisitStatusBadge';
import VisitTimeline from './VisitTimeline';
import AccessGrantCard from './AccessGrantCard';
import FaceCapture from './FaceCapture';
import {
    VISIT_CHANNEL_LABELS, CLOSE_REASON_LABELS, fmtDateTime, fmtTimeRange, fmtScore, fmtLastSeen, toLocalInput, fromLocalInput,
} from './visitLabels';

const Section = ({ title, children }) => (
    <section className="space-y-2">
        <h4 className="text-[10px] font-bold text-slate-blue uppercase">{title}</h4>
        {children}
    </section>
);

const Row = ({ label, children }) => (
    <div className="flex justify-between gap-4 text-xs">
        <span className="text-slate-blue">{label}</span>
        <span className="font-semibold text-midnight-indigo text-right">{children || '—'}</span>
    </div>
);

// Mỗi thao tác cần nhập thêm: nhãn ô nhập, nút xác nhận, hàm gọi service.
const TEXT_ACTIONS = {
    reject: { field: 'Lý do từ chối', confirm: 'Xác nhận từ chối', danger: true, run: (id, text) => rejectVisit(id, { reason: text }), done: 'Đã từ chối lượt khách' },
    revoke: { field: 'Lý do thu hồi', confirm: 'Xác nhận thu hồi', danger: true, run: (id, text) => revokeVisit(id, { reason: text }), done: 'Đã thu hồi quyền ra vào' },
    check_in: { field: 'Ghi chú xác minh', confirm: 'Xác nhận check-in', run: (id, text) => checkInVisit(id, { note: text }), done: 'Đã check-in thủ công' },
};

// Ngăn chi tiết một lượt khách + mọi thao tác trên lượt (S3, dùng lại ở S4–S6).
const VisitDetailDrawer = ({ visitId, zones = [], onClose, onChanged }) => {
    const [visit, setVisit] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [action, setAction] = useState(null);
    const [text, setText] = useState('');
    const [access, setAccess] = useState(null);
    const [extendTo, setExtendTo] = useState('');
    const [photo, setPhoto] = useState(null);
    const [closeForm, setCloseForm] = useState({ reason: '', exitAt: '', note: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const res = await getVisit(visitId);
        if (res?.success) {
            setVisit(res.data);
            setLoadError(null);
        } else {
            setLoadError(res?.message || 'Không tải được lượt khách');
        }
    }, [visitId]);

    useEffect(() => {
        setVisit(null);
        setAction(null);
        load();
    }, [load]);

    if (!visitId) return null;

    const open = (name) => {
        setError(null);
        setText('');
        setPhoto(null);
        if (name === 'approve') setAccess({ ...visit.access });
        if (name === 'extend') setExtendTo(toLocalInput(visit.access.validTo));
        if (name === 'close') setCloseForm({ reason: '', exitAt: toLocalInput(new Date().toISOString()), note: '' });
        setAction(name);
    };

    const perform = async (call, doneMessage) => {
        setBusy(true);
        setError(null);
        const res = await call();
        setBusy(false);
        if (!res?.success) {
            setError(res?.message || 'Thao tác không thành công');
            return;
        }
        toast.success(doneMessage);
        setAction(null);
        await load();
        onChanged?.();
    };

    const can = (name) => visit?.availableActions.includes(name);
    const canExtend = visit && ['approved', 'checked_in'].includes(visit.status);
    const needsPhoto = visit && visit.visitor.hasPhoto === false && ['approved', 'pending_approval'].includes(visit.status);
    const textAction = TEXT_ACTIONS[action];

    return createPortal(
        <div className="fixed inset-0 z-[900] flex justify-end bg-midnight-indigo/30" role="dialog" aria-modal="true" aria-label="Chi tiết lượt khách">
            <button type="button" className="flex-1 cursor-default" aria-label="Đóng ngăn chi tiết" onClick={onClose} />
            <aside className="w-full max-w-xl h-full bg-white shadow-sm-2 flex flex-col">
                <header className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between">
                    <h3 className="font-bold text-midnight-indigo">Chi tiết lượt khách</h3>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-slate-blue hover:bg-cloud-mist"><X className="w-4 h-4" /></button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {loadError && <div className={errorBoxCls}>{loadError}</div>}
                    {!loadError && !visit && <div className="flex justify-center py-16"><div className={spinnerCls} /></div>}

                    {visit && (
                        <>
                            <div className="flex items-center gap-4">
                                <VisitorAvatar visitor={visit.visitor} size={72} />
                                <div className="min-w-0 space-y-1">
                                    <p className="text-lg font-bold text-midnight-indigo truncate">{visit.visitor.fullName}</p>
                                    <p className="text-xs text-slate-blue">{visit.code} · {visit.visitor.organization || 'Không rõ đơn vị'}</p>
                                    <VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} />
                                </div>
                            </div>

                            {visit.status === 'must_leave' && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                                    <p className="font-bold">Khách phải rời khuôn viên</p>
                                    <p>Quyền ra vào bị thu hồi lúc {fmtDateTime(visit.revokedAt)}. Người được gặp và bảo vệ đã được báo. Cổng vẫn cho khách ra; bấm "Xác nhận khách đã rời" khi khách ra khỏi cổng.</p>
                                </div>
                            )}
                            {visit.status === 'exit_unrecorded' && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                                    <p className="font-bold">Chưa ghi nhận giờ ra</p>
                                    <p>Hệ thống không thấy khách ra khỏi cổng. Rà lại và "Đóng lượt thủ công" khi xác định được khách đã rời.</p>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {can('approve') && <button type="button" className={btnPrimary} onClick={() => open('approve')}>Duyệt</button>}
                                {can('reject') && <button type="button" className={btnGhost} onClick={() => open('reject')}>Từ chối</button>}
                                {can('check_in') && <button type="button" className={btnPrimary} onClick={() => open('check_in')}>Check-in tay</button>}
                                {can('check_out') && <button type="button" className={btnPrimary} disabled={busy} onClick={() => perform(() => checkOutVisit(visit.id), 'Đã ghi nhận khách rời khuôn viên')}>{visit.status === 'must_leave' ? 'Xác nhận khách đã rời' : 'Check-out'}</button>}
                                {can('close_manual') && <button type="button" className={btnGhost} onClick={() => open('close')}>Đóng lượt thủ công</button>}
                                {canExtend && <button type="button" className={btnGhost} onClick={() => open('extend')}>Gia hạn</button>}
                                {needsPhoto && <button type="button" className={btnGhost} onClick={() => open('photo')}>Chụp bổ sung ảnh</button>}
                                {can('revoke') && <button type="button" className={btnGhost} onClick={() => open('revoke')}>Thu hồi quyền</button>}
                                {can('cancel') && <button type="button" className={btnGhost} disabled={busy} onClick={() => perform(() => cancelVisit(visit.id), 'Đã hủy lượt khách')}>Hủy lượt</button>}
                            </div>

                            {action && (
                                <div className="rounded-xl border border-action-blue/30 bg-blue-50/40 p-4 space-y-3">
                                    {action === 'approve' && (
                                        <>
                                            <p className="text-xs font-semibold text-midnight-indigo">Kiểm tra quyền ra vào trước khi duyệt</p>
                                            <AccessGrantCard access={access} zones={zones} editable onChange={setAccess} />
                                        </>
                                    )}
                                    {textAction && (
                                        <div className="space-y-1">
                                            <label className={labelCls} htmlFor="visit-action-text">{textAction.field}</label>
                                            <textarea id="visit-action-text" rows={2} className={`${inputCls} w-full`} value={text} onChange={(e) => setText(e.target.value)} />
                                        </div>
                                    )}
                                    {action === 'extend' && (
                                        <div className="space-y-1">
                                            <label className={labelCls} htmlFor="visit-extend-to">Hiệu lực mới đến</label>
                                            <input id="visit-extend-to" type="datetime-local" className={`${inputCls} w-full`} value={extendTo} onChange={(e) => setExtendTo(e.target.value)} />
                                        </div>
                                    )}
                                    {action === 'photo' && <FaceCapture value={photo} onChange={setPhoto} />}
                                    {action === 'close' && (
                                        <div className="space-y-3">
                                            <p className="text-xs font-semibold text-midnight-indigo">Vì sao đóng lượt mà không có lượt ra tại cổng?</p>
                                            {Object.entries(CLOSE_REASON_LABELS).map(([value, label]) => (
                                                <label key={value} className="flex items-center gap-2 text-xs text-midnight-indigo">
                                                    <input type="radio" name="close-reason" checked={closeForm.reason === value} onChange={() => setCloseForm((f) => ({ ...f, reason: value }))} />
                                                    {label}
                                                </label>
                                            ))}
                                            {closeForm.reason === 'left_unrecorded' && (
                                                <div className="space-y-1">
                                                    <label className={labelCls} htmlFor="visit-close-exit">Giờ ra ước tính</label>
                                                    <input id="visit-close-exit" type="datetime-local" className={`${inputCls} w-full`} value={closeForm.exitAt} onChange={(e) => setCloseForm((f) => ({ ...f, exitAt: e.target.value }))} />
                                                </div>
                                            )}
                                            <div className="space-y-1">
                                                <label className={labelCls} htmlFor="visit-close-note">Ghi chú</label>
                                                <textarea id="visit-close-note" rows={2} className={`${inputCls} w-full`} placeholder="Ai xác nhận, đã tìm ở đâu…" value={closeForm.note} onChange={(e) => setCloseForm((f) => ({ ...f, note: e.target.value }))} />
                                            </div>
                                        </div>
                                    )}

                                    {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
                                    <div className="flex justify-end gap-2">
                                        <button type="button" className={btnGhost} onClick={() => setAction(null)} disabled={busy}>Bỏ qua</button>
                                        {action === 'approve' && <button type="button" className={btnPrimary} disabled={busy} onClick={() => perform(() => approveVisit(visit.id, { access }), 'Đã duyệt lượt khách')}>Xác nhận duyệt</button>}
                                        {textAction && <button type="button" className={textAction.danger ? btnDanger : btnPrimary} disabled={busy} onClick={() => perform(() => textAction.run(visit.id, text), textAction.done)}>{textAction.confirm}</button>}
                                        {action === 'extend' && <button type="button" className={btnPrimary} disabled={busy} onClick={() => perform(() => extendVisit(visit.id, { validTo: fromLocalInput(extendTo) }), 'Đã gia hạn quyền ra vào')}>Xác nhận gia hạn</button>}
                                        {action === 'close' && <button type="button" className={btnPrimary} disabled={busy} onClick={() => perform(() => closeVisitManually(visit.id, { reason: closeForm.reason, exitAt: closeForm.reason === 'left_unrecorded' ? fromLocalInput(closeForm.exitAt) : undefined, note: closeForm.note }), 'Đã đóng lượt khách')}>Xác nhận đóng lượt</button>}
                                        {action === 'photo' && <button type="button" className={btnPrimary} disabled={busy || !photo} onClick={() => perform(() => attachVisitorPhoto(visit.id, { photo }), 'Đã bổ sung ảnh khuôn mặt')}>Lưu ảnh</button>}
                                    </div>
                                </div>
                            )}

                            <Section title="Thông tin khách">
                                <Row label="Số CCCD / hộ chiếu">{visit.visitor.idNumber}</Row>
                                <Row label="Điện thoại">{visit.visitor.phone}</Row>
                                <Row label="Email">{visit.visitor.email}</Row>
                                <Row label="Biển số xe">{visit.visitor.plateNumber}</Row>
                            </Section>

                            <Section title="Chuyến thăm">
                                <Row label="Người được gặp">{visit.hostName}</Row>
                                <Row label="Đơn vị tiếp">{visit.departmentName}</Row>
                                <Row label="Mục đích">{visit.purpose}</Row>
                                <Row label="Giờ hẹn">{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}</Row>
                                <Row label="Kênh đăng ký">{VISIT_CHANNEL_LABELS[visit.channel]}</Row>
                                <Row label="Số người đi cùng">{String(visit.companions)}</Row>
                                {visit.rejectReason && <Row label="Lý do từ chối">{visit.rejectReason}</Row>}
                            </Section>

                            <Section title="Xác thực khuôn mặt">
                                <Row label="Ảnh khuôn mặt">{visit.visitor.hasPhoto ? 'Đã có' : 'Chưa có ảnh khuôn mặt'}</Row>
                                <Row label="Độ khớp tại cổng">{visit.faceScore === null ? 'Chưa xác thực' : fmtScore(visit.faceScore)}</Row>
                                <Row label="Giờ vào">{visit.checkInAt ? fmtDateTime(visit.checkInAt) : ''}</Row>
                                <Row label="Giờ ra">{visit.checkOutAt ? `${fmtDateTime(visit.checkOutAt)}${visit.manualExit ? ' (nhập tay)' : ''}` : ''}</Row>
                                <Row label="Lần cuối camera thấy">{visit.lastSeen ? fmtLastSeen(visit.lastSeen) : ''}</Row>
                            </Section>

                            <Section title="Quyền ra vào">
                                <AccessGrantCard access={visit.access} zones={zones} />
                            </Section>

                            <Section title="Dòng thời gian">
                                <VisitTimeline events={visit.events} zones={zones} />
                            </Section>
                        </>
                    )}
                </div>
            </aside>
        </div>,
        document.body,
    );
};

export default VisitDetailDrawer;
