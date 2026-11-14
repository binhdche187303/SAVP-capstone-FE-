import DateInput from './DateInput';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Bell, Mail, MessageSquare, X, CheckCircle, AlertTriangle,
    Send, Clock, Users, FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import {
    sendMeetingInvitations,
    sendMeetingReminder,
    sendCancellationNotification,
    sendMinutesDistribution
} from '../../service/businessAdminServices';
import { motion, AnimatePresence } from 'framer-motion';

// ──────────────────────────────────────────
// Channel Toggle — đồng bộ phong cách AlertRules
// ──────────────────────────────────────────
const ChannelToggle = ({ channels, onChange }) => {
    const options = [
        { value: 'in_app', label: 'Trong ứng dụng', icon: Bell },
        { value: 'email', label: 'Email', icon: Mail },
    ];
    const toggle = (val) => {
        if (channels.includes(val)) {
            if (channels.length === 1) return; // phải chọn ít nhất 1
            onChange(channels.filter(c => c !== val));
        } else {
            onChange([...channels, val]);
        }
    };
    return (
        <div className="flex gap-2">
            {options.map(({ value, label, icon: Icon }) => {
                const active = channels.includes(value);
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => toggle(value)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                            active
                                ? 'bg-action-blue/10 border-action-blue text-action-blue'
                                : 'bg-slate-50 border-platinum-tint text-slate-500 hover:border-action-blue/40'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

// ──────────────────────────────────────────
// ACTION MODAL BASE
// ──────────────────────────────────────────
const ActionModal = ({ open, onClose, title, description, icon: Icon, iconColor, onConfirm, loading, children }) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${iconColor}`}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-midnight-indigo text-sm">{title}</h3>
                            <p className="text-[11px] text-slate-blue mt-0.5">{description}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {/* Body */}
                <div className="p-6 space-y-4">{children}</div>
                {/* Footer */}
                <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-midnight-indigo bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[100px] justify-center"
                    >
                        {loading
                            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Send className="w-3.5 h-3.5" /> Gửi ngay</>
                        }
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ──────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────
/**
 * NotificationActionsPanel — M7
 * Props:
 *   meetingId: string
 *   meetingStatus: string ('scheduled'|'in_progress'|'completed'|'cancelled')
 *   minutesList: Array<{id, title}> — danh sách biên bản để chọn khi phân phối
 *   onSuccess: (message: string) => void
 *   onError: (message: string) => void
 */
const NotificationActionsPanel = ({ meetingId, meetingStatus, minutesList = [], onSuccess, onError }) => {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);

    // Modal states
    const [inviteModal, setInviteModal] = useState(false);
    const [reminderModal, setReminderModal] = useState(false);
    const [cancelNotifModal, setCancelNotifModal] = useState(false);
    const [distributeModal, setDistributeModal] = useState(false);

    // Form states
    const [inviteChannels, setInviteChannels] = useState(['in_app']);
    const [inviteMsg, setInviteMsg] = useState('');
    const [includeAgenda, setIncludeAgenda] = useState(false);

    const [reminderChannels, setReminderChannels] = useState(['in_app']);
    const [reminderType, setReminderType] = useState('manual');
    const [reminderSendAt, setReminderSendAt] = useState('');

    const [cancelChannels, setCancelChannels] = useState(['in_app', 'email']);
    const [cancelReason, setCancelReason] = useState('');

    const [distMinutesId, setDistMinutesId] = useState(minutesList[0]?.id || '');
    const [distScope, setDistScope] = useState('participants');
    const [distChannels, setDistChannels] = useState(['in_app']);

    const handleSend = async (action) => {
        setLoading(true);
        try {
            let res;
            // HTTP 202 responses — không check res.message
            if (action === 'invite') {
                const body = { channels: inviteChannels, includeAgenda };
                if (inviteMsg.trim()) body.message = inviteMsg.trim();
                res = await sendMeetingInvitations(meetingId, body);
            } else if (action === 'reminder') {
                const body = { channels: reminderChannels, reminderType };
                if (reminderType === 'scheduled' && reminderSendAt) body.sendAt = reminderSendAt;
                res = await sendMeetingReminder(meetingId, body);
            } else if (action === 'cancel') {
                const body = { channels: cancelChannels };
                if (cancelReason.trim()) body.reason = cancelReason.trim();
                res = await sendCancellationNotification(meetingId, body);
            } else if (action === 'distribute') {
                if (!distMinutesId) { onError?.('Vui lòng chọn biên bản để phân phối.'); return; }
                const body = { minutesId: distMinutesId, recipientScope: distScope, channels: distChannels };
                res = await sendMinutesDistribution(meetingId, body);
            }

            // 202 Accepted — success regardless of res.message
            onSuccess?.('Đã gửi thông báo thành công!');
            setInviteModal(false); setReminderModal(false); setCancelNotifModal(false); setDistributeModal(false);
        } catch (e) {
            onError?.(e?.message || 'Không thể gửi thông báo. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const isCancelled = meetingStatus === 'cancelled';
    const isActive = meetingStatus === 'scheduled' || meetingStatus === 'in_progress';

    return (
        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
            {/* Toggle Header */}
            <button
                onClick={() => setExpanded(p => !p)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-cloud-mist/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-action-blue rounded-xl">
                        <Bell className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-bold text-midnight-indigo text-sm">Gửi Thông báo</h3>
                        <p className="text-[11px] text-slate-blue mt-0.5">Mời họp, nhắc nhở, thông báo hủy và phân phối biên bản</p>
                    </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-platinum-tint"
                    >
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Lời mời họp */}
                            <button
                                onClick={() => setInviteModal(true)}
                                disabled={!isActive}
                                className="flex items-center gap-3 p-4 rounded-xl border border-platinum-tint hover:border-action-blue hover:bg-blue-50/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                                <div className="p-2 bg-blue-100 text-action-blue rounded-xl group-hover:bg-blue-200 transition-colors">
                                    <Send className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Gửi lời mời họp</p>
                                    <p className="text-[11px] text-slate-blue mt-0.5">Gửi email hoặc thông báo trong app</p>
                                </div>
                            </button>

                            {/* Nhắc nhở */}
                            <button
                                onClick={() => setReminderModal(true)}
                                disabled={!isActive}
                                className="flex items-center gap-3 p-4 rounded-xl border border-platinum-tint hover:border-orange-400 hover:bg-orange-50/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                            >
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-xl group-hover:bg-orange-200 transition-colors">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Nhắc nhở tham dự</p>
                                    <p className="text-[11px] text-slate-blue mt-0.5">Thủ công hoặc lên lịch tự động</p>
                                </div>
                            </button>

                            {/* Phân phối biên bản */}
                            <button
                                onClick={() => setDistributeModal(true)}
                                disabled={minutesList.length === 0}
                                className="flex items-center gap-3 p-4 rounded-xl border border-platinum-tint hover:border-purple-400 hover:bg-purple-50/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                                title={minutesList.length === 0 ? 'Chưa có biên bản nào cho cuộc họp này' : ''}
                            >
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-xl group-hover:bg-purple-200 transition-colors">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Phân phối biên bản</p>
                                    <p className="text-[11px] text-slate-blue mt-0.5">Chia sẻ biên bản cuộc họp</p>
                                </div>
                            </button>

                            {/* Thông báo hủy — chỉ active khi meeting cancelled */}
                            <button
                                onClick={() => setCancelNotifModal(true)}
                                disabled={!isCancelled}
                                className="flex items-center gap-3 p-4 rounded-xl border border-platinum-tint hover:border-red-400 hover:bg-red-50/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group"
                                title={!isCancelled ? 'Chỉ khả dụng khi cuộc họp đã bị hủy' : ''}
                            >
                                <div className="p-2 bg-red-100 text-red-600 rounded-xl group-hover:bg-red-200 transition-colors">
                                    <AlertTriangle className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-midnight-indigo">Thông báo hủy họp</p>
                                    <p className="text-[11px] text-slate-blue mt-0.5">
                                        {isCancelled ? 'Gửi thông báo đến người tham dự' : 'Chỉ dùng khi họp đã bị hủy'}
                                    </p>
                                </div>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── MODAL: Lời mời ── */}
            <ActionModal
                open={inviteModal}
                onClose={() => setInviteModal(false)}
                title="Gửi lời mời họp"
                description="Thông báo sẽ được gửi đến tất cả người tham gia."
                icon={Send}
                iconColor="bg-blue-100 text-action-blue"
                onConfirm={() => handleSend('invite')}
                loading={loading}
            >
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Kênh gửi <span className="text-red-500">*</span></label>
                    <ChannelToggle channels={inviteChannels} onChange={setInviteChannels} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={includeAgenda} onChange={e => setIncludeAgenda(e.target.checked)} className="rounded border-slate-300 accent-action-blue" />
                    <span className="text-sm text-midnight-indigo font-medium">Đính kèm nội dung chương trình họp</span>
                </label>
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Nội dung thêm (không bắt buộc)</label>
                    <textarea
                        value={inviteMsg}
                        onChange={e => setInviteMsg(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        placeholder="Thêm ghi chú hoặc thông tin bổ sung..."
                        className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:bg-white focus:border-action-blue transition-colors resize-none"
                    />
                    <p className="text-[10px] text-slate-blue/60 text-right">{inviteMsg.length}/1000</p>
                </div>
            </ActionModal>

            {/* ── MODAL: Nhắc nhở ── */}
            <ActionModal
                open={reminderModal}
                onClose={() => setReminderModal(false)}
                title="Gửi nhắc nhở tham dự"
                description="Nhắc nhở người tham gia về cuộc họp sắp diễn ra."
                icon={Clock}
                iconColor="bg-orange-100 text-orange-600"
                onConfirm={() => handleSend('reminder')}
                loading={loading}
            >
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Kênh gửi <span className="text-red-500">*</span></label>
                    <ChannelToggle channels={reminderChannels} onChange={setReminderChannels} />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Loại nhắc nhở <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                        {[{ v: 'manual', l: 'Thủ công (gửi ngay)' }, { v: 'scheduled', l: 'Lên lịch' }].map(({ v, l }) => (
                            <button key={v} type="button" onClick={() => setReminderType(v)}
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${reminderType === v ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-slate-50 border-platinum-tint text-slate-500 hover:border-orange-300'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
                {reminderType === 'scheduled' && (
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Thời điểm gửi</label>
                        <DateInput
                            type="datetime-local"
                            value={reminderSendAt}
                            onChange={e => setReminderSendAt(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:bg-white focus:border-action-blue transition-colors"
                        />
                    </div>
                )}
            </ActionModal>

            {/* ── MODAL: Thông báo hủy ── */}
            <ActionModal
                open={cancelNotifModal}
                onClose={() => setCancelNotifModal(false)}
                title="Thông báo hủy cuộc họp"
                description="Thông báo sẽ được gửi đến tất cả người tham gia."
                icon={AlertTriangle}
                iconColor="bg-red-100 text-red-600"
                onConfirm={() => handleSend('cancel')}
                loading={loading}
            >
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Kênh gửi <span className="text-red-500">*</span></label>
                    <ChannelToggle channels={cancelChannels} onChange={setCancelChannels} />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Lý do hủy (không bắt buộc)</label>
                    <textarea
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        placeholder="Nhập lý do hủy cuộc họp..."
                        className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:bg-white focus:border-action-blue transition-colors resize-none"
                    />
                </div>
            </ActionModal>

            {/* ── MODAL: Phân phối biên bản ── */}
            <ActionModal
                open={distributeModal}
                onClose={() => setDistributeModal(false)}
                title="Phân phối biên bản"
                description="Gửi biên bản cuộc họp đến người nhận được chọn."
                icon={FileText}
                iconColor="bg-purple-100 text-purple-600"
                onConfirm={() => handleSend('distribute')}
                loading={loading}
            >
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Biên bản <span className="text-red-500">*</span></label>
                    <select
                        value={distMinutesId}
                        onChange={e => setDistMinutesId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:bg-white focus:border-action-blue transition-colors"
                    >
                        <option value="">-- Chọn biên bản --</option>
                        {minutesList.map(m => (
                            <option key={m.id} value={m.id}>{m.title || `Biên bản #${m.id.slice(0, 8)}`}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Người nhận <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                        {[{ v: 'participants', l: 'Tất cả người tham dự' }, { v: 'custom', l: 'Tùy chỉnh' }].map(({ v, l }) => (
                            <button key={v} type="button" onClick={() => setDistScope(v)}
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${distScope === v ? 'bg-purple-100 border-purple-400 text-purple-700' : 'bg-slate-50 border-platinum-tint text-slate-500 hover:border-purple-300'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Kênh gửi <span className="text-red-500">*</span></label>
                    <ChannelToggle channels={distChannels} onChange={setDistChannels} />
                </div>
            </ActionModal>
        </div>
    );
};

export default NotificationActionsPanel;
