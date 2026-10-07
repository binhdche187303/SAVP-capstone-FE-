import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Link2, UserCheck, UserPlus } from 'lucide-react';
import {
    getMyVisits, getMyNotifications, markMyNotificationsRead, approveVisit, rejectVisit, createVisit, getVisitorLookups,
} from '../../../service/visitorService';
import toast from '../../../utils/toast';
import SimpleModal from '../../../components/common/SimpleModal';
import VisitForm from '../../../components/visitor/VisitForm';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { fmtDateTime, fmtTimeRange } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, inputCls, btnPrimary, btnGhost, btnDanger, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';

// Trong dữ liệu minh hoạ, người đang đăng nhập là cán bộ `host-me`.
const MY_HOST_ID = 'host-me';

// S5 (2.10): màn của người được gặp — duyệt khách xin gặp mình, mời khách, nhận thông báo.
const REFRESH_MS = 20000;
const PAST_PAGE = 10;

const VisitLine = ({ visit, onOpen, children }) => (
    <li className="px-6 py-3 flex flex-wrap items-center gap-3">
        <VisitorAvatar visitor={visit.visitor} size={40} />
        <div className="flex-1 min-w-[180px]">
            <button type="button" className="text-sm font-semibold text-midnight-indigo hover:text-action-blue text-left" onClick={() => onOpen(visit.id)}>
                {visit.visitor.fullName}
            </button>
            <p className="text-[11px] text-slate-blue">
                {visit.visitor.organization || 'Không rõ đơn vị'} · {visit.purpose} · {fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}
                {visit.visitor.hasPhoto ? '' : ' · Chưa có ảnh'}
            </p>
        </div>
        {children}
    </li>
);

const Block = ({ title, countId, count, empty, children }) => (
    <div className={`${cardCls} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between">
            <h3 className="font-bold text-midnight-indigo text-sm">{title}</h3>
            <span data-testid={countId} className="px-2 py-0.5 rounded-md bg-pale-gray text-[11px] font-bold text-midnight-indigo">{count}</span>
        </div>
        {count === 0 ? <p className="px-6 py-8 text-center text-xs text-slate-blue">{empty}</p> : <ul className="divide-y divide-pale-gray">{children}</ul>}
    </div>
);

const MyVisitors = () => {
    const [lookups, setLookups] = useState({ zones: [], purposes: [] });
    const [visits, setVisits] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState('');
    const [rejectError, setRejectError] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteError, setInviteError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [invited, setInvited] = useState(null);
    const [pastShown, setPastShown] = useState(PAST_PAGE);
    const [inviteLink, setInviteLink] = useState(null);
    const lastUnread = useRef(null);

    const load = useCallback(async () => {
        const [visitsRes, notesRes] = await Promise.all([getMyVisits(), getMyNotifications()]);
        if (!visitsRes?.success) {
            setError(visitsRes?.message || 'Không tải được danh sách khách');
            return;
        }
        setError(null);
        setVisits(visitsRes.data);
        const notes = notesRes?.success ? notesRes.data : [];
        setNotifications(notes);
        // Có thông báo mới kể từ lần nạp trước: báo ngay cho người được gặp (BR-V7).
        const unread = notes.filter((n) => !n.read).length;
        if (lastUnread.current !== null && unread > lastUnread.current && notes[0]) toast.info(notes[0].message);
        lastUnread.current = unread;
    }, []);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const approve = async (visit) => {
        const res = await approveVisit(visit.id, {});
        if (res?.success) {
            toast.success(`Đã duyệt ${visit.visitor.fullName}`);
            load();
        } else {
            toast.error(res?.message || 'Không duyệt được');
        }
    };

    const confirmReject = async () => {
        const res = await rejectVisit(rejecting.id, { reason });
        if (!res?.success) {
            setRejectError(res?.message || 'Không từ chối được');
            return;
        }
        toast.success('Đã từ chối lượt khách');
        setRejecting(null);
        load();
    };

    const invite = async (payload) => {
        setSubmitting(true);
        setInviteError(null);
        const res = await createVisit(payload);
        setSubmitting(false);
        if (!res?.success) {
            setInviteError(res?.message || 'Không gửi được lời mời');
            return;
        }
        setInviteOpen(false);
        setInvited(res.data);
        load();
    };

    // Link đăng ký chọn sẵn mình là người cần gặp, để gửi cho khách qua email/Zalo.
    const copyInviteLink = async () => {
        const link = `${window.location.origin}/visitor/register?host=${MY_HOST_ID}`;
        setInviteLink(link);
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Đã sao chép link đăng ký');
        } catch {
            toast.info('Hãy sao chép link hiển thị bên dưới');
        }
    };

    const markRead = async () => {
        await markMyNotificationsRead();
        load();
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <UserCheck className="w-6 h-6 text-action-blue" />
                        Khách của tôi
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Duyệt khách xin gặp bạn, mời khách đến làm việc và nhận thông báo khi khách đến cổng.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} onClick={copyInviteLink}>
                        <Link2 className="w-4 h-4" /> Sao chép link đăng ký
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => { setInviteError(null); setInviteOpen(true); }}>
                        <UserPlus className="w-4 h-4" /> Mời khách
                    </button>
                </div>
            </div>

            {inviteLink && (
                <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-xs text-glacier-blue space-y-1">
                    <p>Gửi link này cho khách. Khách tự điền thông tin và chụp ảnh khuôn mặt; bạn là người cần gặp được chọn sẵn.</p>
                    <p className="font-mono font-semibold break-all">{inviteLink}</p>
                </div>
            )}

            {invited && (
                <div className="px-4 py-3 rounded-2xl bg-green-50 border border-green-200 text-xs text-green-800 space-y-1">
                    <p className="font-semibold">Đã mời {invited.visitor.fullName} · {invited.code}</p>
                    <p>Khách chưa có ảnh khuôn mặt, lễ tân sẽ chụp khi khách đến.</p>
                </div>
            )}
            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !visits && <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>}

            {visits && (
                <div className="grid lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <Block title="Cần bạn duyệt" countId="my-pending-count" count={visits.pending.length} empty="Không có khách nào đang chờ bạn duyệt">
                            {visits.pending.map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <div className="flex gap-2">
                                        <button type="button" aria-label="Duyệt" className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-semibold hover:bg-glacier-blue" onClick={() => approve(visit)}>Duyệt</button>
                                        <button type="button" className="px-3 py-1.5 rounded-lg border border-platinum-tint text-[11px] font-semibold text-midnight-indigo hover:bg-cloud-mist" onClick={() => { setRejecting(visit); setReason(''); setRejectError(null); }}>Từ chối</button>
                                    </div>
                                </VisitLine>
                            ))}
                        </Block>

                        <Block title="Sắp đến / đang tiếp" countId="my-upcoming-count" count={visits.upcoming.length} empty="Chưa có khách nào sắp đến">
                            {visits.upcoming.map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <VisitStatusBadge status={visit.status} overstay={visit.overstay} />
                                </VisitLine>
                            ))}
                        </Block>

                        <Block title="Đã tiếp" countId="my-past-count" count={visits.past.length} empty="Chưa có lượt khách nào trước đây">
                            {visits.past.slice(0, pastShown).map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <VisitStatusBadge status={visit.status} />
                                </VisitLine>
                            ))}
                            {visits.past.length > pastShown && (
                                <li className="px-6 py-3 text-center">
                                    <button type="button" className="text-xs font-semibold text-action-blue hover:underline" onClick={() => setPastShown((n) => n + PAST_PAGE)}>Xem thêm</button>
                                </li>
                            )}
                        </Block>
                    </div>

                    <div className={`${cardCls} overflow-hidden`}>
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between gap-2">
                            <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2">
                                <Bell className="w-4 h-4 text-action-blue" /> Thông báo
                                <span data-testid="my-unread-count" className="px-2 py-0.5 rounded-md bg-action-blue text-white text-[11px] font-bold">{unreadCount}</span>
                            </h3>
                            <button type="button" className="text-[11px] font-semibold text-action-blue hover:underline disabled:opacity-40" disabled={unreadCount === 0} onClick={markRead}>Đánh dấu đã đọc</button>
                        </div>
                        {notifications.length === 0 ? (
                            <p className="px-6 py-8 text-center text-xs text-slate-blue">Chưa có thông báo nào</p>
                        ) : (
                            <ul className="divide-y divide-pale-gray max-h-[32rem] overflow-y-auto">
                                {notifications.map((note) => (
                                    <li key={note.id} className="px-6 py-3 flex gap-2">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${note.read ? 'bg-transparent' : 'bg-action-blue'}`} />
                                        <button type="button" className="text-left" onClick={() => setDetailId(note.visitId)}>
                                            <p className={`text-xs ${note.read ? 'text-slate-blue' : 'font-semibold text-midnight-indigo'}`}>{note.message}</p>
                                            <p className="text-[11px] text-steel-gray">{fmtDateTime(note.createdAt)}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            <SimpleModal
                isOpen={Boolean(rejecting)}
                title="Từ chối lượt khách"
                size="sm"
                onClose={() => setRejecting(null)}
                footer={(
                    <>
                        <button type="button" className={btnGhost} onClick={() => setRejecting(null)}>Bỏ qua</button>
                        <button type="button" className={btnDanger} onClick={confirmReject}>Xác nhận từ chối</button>
                    </>
                )}
            >
                <div className="space-y-2">
                    <p className="text-xs text-midnight-indigo">Lý do sẽ được gửi cho {rejecting?.visitor.fullName} qua email.</p>
                    <textarea aria-label="Lý do từ chối" rows={3} className={`${inputCls} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} />
                    {rejectError && <p className="text-xs text-red-600" role="alert">{rejectError}</p>}
                </div>
            </SimpleModal>

            <SimpleModal isOpen={inviteOpen} title="Mời khách đến làm việc" onClose={() => setInviteOpen(false)}>
                <VisitForm mode="host_invite" lookups={lookups} onSubmit={invite} submitting={submitting} error={inviteError} />
            </SimpleModal>

            {detailId && <VisitDetailDrawer visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />}
        </div>
    );
};

export default MyVisitors;
