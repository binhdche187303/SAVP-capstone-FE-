import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Check, X, Mail, Trash2, Loader2, Clock } from 'lucide-react';
import toast from '../../utils/toast';
import {
    listMeetingGuests,
    admitGuest, rejectGuest, resendGuestInvite, revokeGuestAccess
} from '../../service/guestService';

const STATUS_LABEL = {
    not_invited: { text: 'Chưa gửi link', cls: 'text-slate-blue bg-cloud-mist' },
    active:      { text: 'Link còn hiệu lực', cls: 'text-blue-700 bg-blue-50' },
    used:        { text: 'Đã tham dự', cls: 'text-emerald-700 bg-emerald-50' },
    revoked:     { text: 'Đã thu hồi', cls: 'text-red-600 bg-red-50' },
};

const GuestPanel = ({ meetingId, onGuestsUpdate }) => {
    const [guests, setGuests] = useState([]);
    const [lobby, setLobby] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null); // id đang xử lý

    const showToast = (msg, type = 'success') => {
        (toast[type] || toast.info)(msg);
    };

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const gRes = await listMeetingGuests(meetingId);
            const guestList = gRes?.success ? (gRes.data || []) : [];
            setGuests(guestList);
            setLobby(guestList.filter(g => g.lobbyStatus === 'waiting'));
            const admittedGuests = guestList.filter(g => g.lobbyStatus === 'admitted');
            onGuestsUpdate?.(admittedGuests);
        } catch {
            /* bỏ qua lỗi mạng tạm thời */
        } finally {
            if (!silent) setLoading(false);
        }
    }, [meetingId, onGuestsUpdate]);

    // Poll 10 giây/lần — silent = true để không hiện loading giật giao diện
    useEffect(() => {
        fetchAll();
        const interval = setInterval(() => fetchAll(true), 10000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const handle = async (fn, id, successMsg) => {
        setActionLoading(id);
        try {
            const res = await fn(meetingId, id);
            if (res?.success) {
                showToast(successMsg);
                fetchAll();
            } else {
                showToast(res?.error?.message || 'Lỗi thao tác', 'error');
            }
        } catch {
            showToast('Lỗi kết nối', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="p-4 space-y-4 relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-action-blue" /> Khách ngoài công ty
                </h4>
                <button
                    onClick={fetchAll}
                    disabled={loading}
                    className="p-1 text-slate-blue hover:text-action-blue transition-colors disabled:opacity-40"
                >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Hàng chờ duyệt */}
            {lobby.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <h5 className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Phòng chờ ({lobby.length})
                    </h5>
                    {lobby.map(guest => (
                        <div key={guest.externalParticipantId} className="bg-white border border-amber-100 rounded-lg p-2.5">
                            <p className="text-xs font-bold text-midnight-indigo truncate">{guest.fullName || guest.externalName || 'Khách'}</p>
                            {guest.organizationName && (
                                <p className="text-[10px] text-slate-blue">{guest.organizationName}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                                <button
                                    disabled={actionLoading === guest.externalParticipantId}
                                    onClick={() => handle(admitGuest, guest.externalParticipantId, `Đã duyệt ${guest.fullName || 'khách'}`)}
                                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1"
                                >
                                    {actionLoading === guest.externalParticipantId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Duyệt
                                </button>
                                <button
                                    disabled={actionLoading === guest.externalParticipantId}
                                    onClick={() => handle(rejectGuest, guest.externalParticipantId, 'Đã từ chối khách')}
                                    className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1"
                                >
                                    <X className="w-3 h-3" /> Từ chối
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Danh sách khách */}
            <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-platinum-tint bg-cloud-mist">
                    <span className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider">
                        Danh sách ({guests.length})
                    </span>
                </div>
                {guests.length === 0 ? (
                    <p className="text-[11px] text-slate-blue italic text-center py-4">
                        Chưa có khách ngoài công ty nào được mời.
                    </p>
                ) : (
                    <div className="divide-y divide-platinum-tint max-h-60 overflow-y-auto">
                        {guests.map(guest => {
                            const statusMeta = STATUS_LABEL[guest.inviteStatus] || STATUS_LABEL.not_invited;
                            return (
                                <div key={guest.externalParticipantId} className="px-3 py-2.5 hover:bg-cloud-mist transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-midnight-indigo truncate">
                                                {guest.fullName || guest.externalName || 'Khách'}
                                            </p>
                                            {guest.organizationName && (
                                                <p className="text-[10px] text-slate-blue truncate">{guest.organizationName}</p>
                                            )}
                                            <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${statusMeta.cls}`}>
                                                {statusMeta.text}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            {guest.inviteStatus !== 'revoked' && (
                                                <button
                                                    title="Gửi lại link mời"
                                                    disabled={actionLoading === guest.externalParticipantId}
                                                    onClick={() => handle(resendGuestInvite, guest.externalParticipantId, 'Đã gửi lại link mời')}
                                                    className="p-1.5 text-action-blue hover:bg-blue-50 disabled:opacity-40 rounded-lg transition-colors"
                                                >
                                                    {actionLoading === guest.externalParticipantId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                                </button>
                                            )}
                                            {guest.inviteStatus === 'used' && (
                                                <button
                                                    title="Thu hồi quyền truy cập"
                                                    disabled={actionLoading === guest.externalParticipantId}
                                                    onClick={() => handle(revokeGuestAccess, guest.externalParticipantId, 'Đã thu hồi quyền truy cập')}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GuestPanel;
