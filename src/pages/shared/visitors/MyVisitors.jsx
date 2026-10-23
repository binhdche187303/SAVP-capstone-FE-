import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Link2, UserCheck, UserPlus } from 'lucide-react';
import {
    getMyVisits, getMyNotifications, markMyNotificationsRead, rejectVisit, createVisit, getVisitorLookups,
} from '../../../service/visitorService';
import toast from '../../../utils/toast';
import { VISITOR_MOCK_ENABLED } from '../../../config/featureFlags';
import SimpleModal from '../../../components/common/SimpleModal';
import VisitForm from '../../../components/visitor/VisitForm';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import { fmtDateTime, fmtTimeRange } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, inputCls, btnPrimary, btnGhost, btnDanger, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';

// Dữ liệu minh hoạ: người đang đăng nhập là cán bộ `host-me`. BE thật: id của tài khoản đang đăng nhập.
const myHostId = () => {
    if (VISITOR_MOCK_ENABLED) return 'host-me';
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return user?.id || user?.userId || '';
    } catch {
        return '';
    }
};

// S5 (2.10): màn của người được gặp — duyệt khách xin gặp mình, mời khách, nhận thông báo.
const REFRESH_MS = 20000;
const PAGE_SIZE = 10;
const VISIT_STATUS_OPTIONS = [
    ['', 'Tất cả trạng thái'],
    ['pending_approval', 'Chờ duyệt'],
    ['approved', 'Đã duyệt'],
    ['checked_in', 'Đang trong khuôn viên'],
    ['must_leave', 'Phải rời khuôn viên'],
    ['checked_out', 'Đã rời'],
    ['rejected', 'Từ chối'],
    ['cancelled', 'Đã hủy'],
];
const localDateKey = (value) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

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

const Pager = ({ page, total, onChange }) => {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return null;
    return (
        <div className="px-6 py-3 border-t border-pale-gray flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-blue">Trang {page}/{pages}</span>
            <div className="flex gap-2">
                <button type="button" className="px-3 py-1.5 rounded-lg border border-platinum-tint text-midnight-indigo font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</button>
                <button type="button" className="px-3 py-1.5 rounded-lg border border-platinum-tint text-midnight-indigo font-semibold disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</button>
            </div>
        </div>
    );
};

const StatusFilter = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const selected = VISIT_STATUS_OPTIONS.find(([option]) => option === value) || VISIT_STATUS_OPTIONS[0];
    return (
        <div className="relative min-w-[190px]">
            <button
                id="my-visitors-status"
                type="button"
                className={`${inputCls} w-full flex items-center justify-between gap-3 text-xs font-semibold text-left`}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                <span className="truncate">{selected[1]}</span>
                <span className="text-[10px] text-slate-blue">▾</span>
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-platinum-tint bg-white p-1 shadow-lg" role="listbox" aria-label="Trạng thái">
                    {VISIT_STATUS_OPTIONS.map(([option, label]) => (
                        <button
                            key={option || 'all'}
                            type="button"
                            role="option"
                            aria-selected={option === value}
                            className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs leading-5 font-sans ${option === value ? 'bg-blue-50 font-semibold text-action-blue' : 'text-midnight-indigo hover:bg-cloud-mist'}`}
                            onClick={() => { onChange(option); setOpen(false); }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const Block = ({ title, countId, count, empty, footer, children }) => (
    <div className={`${cardCls} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between">
            <h3 className="font-bold text-midnight-indigo text-sm">{title}</h3>
            <span data-testid={countId} className="px-2 py-0.5 rounded-md bg-pale-gray text-[11px] font-bold text-midnight-indigo">{count}</span>
        </div>
        {count === 0 ? <p className="px-6 py-8 text-center text-xs text-slate-blue">{empty}</p> : <><ul className="divide-y divide-pale-gray">{children}</ul>{footer}</>}
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
    const [pages, setPages] = useState({ pending: 1, upcoming: 1, past: 1 });
    const [inviteLink, setInviteLink] = useState(null);
    const [filter, setFilter] = useState({ q: '', status: '', from: '', to: '' });
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
        const link = `${window.location.origin}/visitor/register?host=${myHostId()}`;
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
    const filteredVisits = useMemo(() => {
        if (!visits) return null;
        const q = filter.q.trim().toLocaleLowerCase('vi-VN');
        const matches = (visit) => {
            const haystack = [
                visit.visitor.fullName,
                visit.code,
                visit.visitor.phone,
                visit.visitor.email,
                visit.visitor.organization,
                visit.purpose,
            ].filter(Boolean).join(' ').toLocaleLowerCase('vi-VN');
            const day = localDateKey(visit.scheduledFrom);
            return (!q || haystack.includes(q))
                && (!filter.status || visit.status === filter.status || (filter.status === 'checked_in' && visit.status === 'must_leave'))
                && (!filter.from || day >= filter.from)
                && (!filter.to || day <= filter.to);
        };
        return {
            pending: visits.pending.filter(matches),
            upcoming: visits.upcoming.filter(matches),
            past: visits.past.filter(matches),
        };
    }, [visits, filter]);

    const clearFilter = () => {
        setFilter({ q: '', status: '', from: '', to: '' });
        setPages({ pending: 1, upcoming: 1, past: 1 });
    };

    const visibleVisits = useMemo(() => {
        if (!filteredVisits) return null;
        const slice = (items, page) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return {
            pending: slice(filteredVisits.pending, pages.pending),
            upcoming: slice(filteredVisits.upcoming, pages.upcoming),
            past: slice(filteredVisits.past, pages.past),
        };
    }, [filteredVisits, pages]);

    const updateFilter = (changes) => {
        setFilter((prev) => ({ ...prev, ...changes }));
        setPages({ pending: 1, upcoming: 1, past: 1 });
    };

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
                    <p>Khách chưa có ảnh khuôn mặt, bảo vệ sẽ chụp khi khách đến.</p>
                </div>
            )}
            <div className={`${cardCls} p-4 flex flex-wrap items-end gap-3 font-sans`}>
                <div className="flex-1 min-w-[220px]">
                    <label htmlFor="my-visitors-search" className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Tìm kiếm</label>
                    <input
                        id="my-visitors-search"
                        className={`${inputCls} w-full text-sm`}
                        value={filter.q}
                        onChange={(e) => updateFilter({ q: e.target.value })}
                        placeholder="Tên khách, mã lượt, email, số điện thoại..."
                    />
                </div>
                <div className="min-w-[180px]">
                    <label htmlFor="my-visitors-status" className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Trạng thái</label>
                    <StatusFilter value={filter.status} onChange={(status) => updateFilter({ status })} />
                </div>
                <div>
                    <label htmlFor="my-visitors-from" className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Từ ngày</label>
                    <input id="my-visitors-from" type="date" className={`${inputCls} text-sm font-semibold`} value={filter.from} onChange={(e) => updateFilter({ from: e.target.value })} />
                </div>
                <div>
                    <label htmlFor="my-visitors-to" className="block text-[10px] font-bold text-slate-blue uppercase mb-1.5">Đến ngày</label>
                    <input id="my-visitors-to" type="date" className={`${inputCls} text-sm font-semibold`} value={filter.to} onChange={(e) => updateFilter({ to: e.target.value })} />
                </div>
                <button type="button" className={btnGhost} onClick={clearFilter} disabled={!filter.q && !filter.status && !filter.from && !filter.to}>Xóa lọc</button>
            </div>
            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !visits && <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>}

            {visits && (
                <div className="grid lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <Block title="Cần bạn duyệt" countId="my-pending-count" count={filteredVisits.pending.length} empty="Không có khách nào phù hợp" footer={<Pager page={pages.pending} total={filteredVisits.pending.length} onChange={(page) => setPages((prev) => ({ ...prev, pending: page }))} />}>
                            {visibleVisits.pending.map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <div className="flex gap-2">
                                        <button type="button" aria-label="Duyệt" className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-semibold hover:bg-glacier-blue" onClick={() => setDetailId(visit.id)}>Duyệt</button>
                                        <button type="button" className="px-3 py-1.5 rounded-lg border border-platinum-tint text-[11px] font-semibold text-midnight-indigo hover:bg-cloud-mist" onClick={() => { setRejecting(visit); setReason(''); setRejectError(null); }}>Từ chối</button>
                                    </div>
                                </VisitLine>
                            ))}
                        </Block>

                        <Block title="Sắp đến / đang tiếp" countId="my-upcoming-count" count={filteredVisits.upcoming.length} empty="Không có khách nào phù hợp" footer={<Pager page={pages.upcoming} total={filteredVisits.upcoming.length} onChange={(page) => setPages((prev) => ({ ...prev, upcoming: page }))} />}>
                            {visibleVisits.upcoming.map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <VisitStatusBadge status={visit.status} overstay={visit.overstay} />
                                </VisitLine>
                            ))}
                        </Block>

                        <Block title="Đã tiếp" countId="my-past-count" count={filteredVisits.past.length} empty="Không có khách nào phù hợp" footer={<Pager page={pages.past} total={filteredVisits.past.length} onChange={(page) => setPages((prev) => ({ ...prev, past: page }))} />}>
                            {visibleVisits.past.map((visit) => (
                                <VisitLine key={visit.id} visit={visit} onOpen={setDetailId}>
                                    <VisitStatusBadge status={visit.status} />
                                </VisitLine>
                            ))}
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

            {detailId && <VisitDetailDrawer canManage visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />}
        </div>
    );
};

export default MyVisitors;
