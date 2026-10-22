import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, UserCheck, UserX, X } from 'lucide-react';
import ThumbnailImage from '../common/ThumbnailImage';
import {
    getStrangerCandidateMeetings, getStrangerSightings, getUsers, reviewStrangerEvents,
} from '../../service/businessAdminServices';
import { manualAttendanceCheckIn } from '../../service/managerServices';

/**
 * Hậu kiểm AI nhận sai (họp 20/10): người có thẩm quyền xác nhận "các lần xuất hiện này là ai"
 * và (tùy chọn) gán điểm danh vào buổi họp. Gán điểm danh dùng API điểm danh thủ công sẵn có
 * (kiểm tra chủ trì/người tham dự), rồi mới đánh dấu sự kiện đã hậu kiểm để rời hàng chờ.
 */

const fmtDateTime = (v) =>
    new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const errMsg = (e, fallback) => e?.error?.message || e?.message || fallback;

const inputCls = 'px-3 py-2 bg-white border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none';

const StrangerReviewModal = ({ stranger, onClose, onDone }) => {
    const [sightings, setSightings] = useState([]);
    const [picked, setPicked] = useState(new Set());
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState([]);
    const [user, setUser] = useState(null);
    const [meetings, setMeetings] = useState([]);
    const [meetingId, setMeetingId] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getStrangerSightings(stranger.deviceId, stranger.strangerId)
            .then((res) => {
                const list = res?.data || [];
                setSightings(list);
                setPicked(new Set(list.map((x) => x.eventId)));
            })
            .catch(() => setSightings([]));
        getStrangerCandidateMeetings(stranger.latestEventId)
            .then((res) => setMeetings(res?.data || []))
            .catch(() => setMeetings([]));
    }, [stranger]);

    useEffect(() => {
        const t = setTimeout(() => {
            getUsers({ search: query || undefined, limit: 8 })
                .then((res) => setUsers(res?.data || []))
                .catch(() => setUsers([]));
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    const pickedList = useMemo(() => sightings.filter((x) => picked.has(x.eventId)), [sightings, picked]);
    const togglePick = (id) => setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const submit = async (e) => {
        e.preventDefault();
        if (!user) { setError('Hãy chọn người được xác nhận.'); return; }
        if (pickedList.length === 0) { setError('Hãy chọn ít nhất một lần xuất hiện.'); return; }
        setSaving(true);
        setError('');
        let attendanceNote = '';
        try {
            if (meetingId) {
                // Thời điểm vào = lần xuất hiện sớm nhất trong các lượt đã chọn (giờ ghi nhận thật của camera).
                const earliest = pickedList.map((x) => new Date(x.time).getTime()).sort((a, b) => a - b)[0];
                try {
                    await manualAttendanceCheckIn(meetingId, {
                        userId: user.id,
                        checkInTime: new Date(earliest).toISOString(),
                        note: `Hậu kiểm AI: camera nhận sai, xác nhận thủ công${note ? ` — ${note}` : ''}`,
                    }, { skipToast: true });
                    attendanceNote = ' và đã gán điểm danh vào buổi họp';
                } catch (err) {
                    const status = err?.status;
                    if (status === 409) attendanceNote = ' (người này đã có bản ghi điểm danh trong buổi họp, giữ nguyên)';
                    else throw err;
                }
            }
            await reviewStrangerEvents({
                eventIds: pickedList.map((x) => x.eventId),
                userId: user.id,
                ...(meetingId ? { meetingId } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            onDone(`Đã xác nhận ${pickedList.length} lượt là ${user.fullName}${attendanceNote}.`);
        } catch (err) {
            setError(errMsg(err, 'Không lưu được xác nhận. Có thể bạn không có quyền với người/buổi họp này.'));
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {stranger.snapshotEventId
                            ? <ThumbnailImage eventId={stranger.snapshotEventId} className="w-16 h-16" />
                            : <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center"><UserX className="w-6 h-6 text-slate-400" /></div>}
                        <div>
                            <p className="font-extrabold text-midnight-indigo">Xác nhận “đây là ai”</p>
                            <p className="text-xs text-slate-blue">AI nhận sai (khẩu trang, thiếu sáng…) — gán lại cho đúng người. Sự kiện đã xác nhận sẽ rời khỏi danh sách người lạ.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
                </div>

                <div>
                    <p className="text-xs font-bold text-slate-blue mb-1">Các lần xuất hiện là người này ({picked.size}/{sightings.length})</p>
                    <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto">
                        {sightings.map((x) => (
                            <label key={x.eventId} className={`relative rounded-lg border-2 cursor-pointer p-1 text-[10px] text-center ${picked.has(x.eventId) ? 'border-action-blue bg-blue-50' : 'border-slate-200 opacity-60'}`}>
                                <input type="checkbox" className="absolute top-1 left-1" checked={picked.has(x.eventId)} onChange={() => togglePick(x.eventId)} />
                                {x.hasSnapshot ? <ThumbnailImage eventId={x.eventId} className="w-full h-14 pointer-events-none" /> : <div className="h-14 flex items-center justify-center"><UserX className="w-4 h-4 text-slate-400" /></div>}
                                {fmtDateTime(x.time)}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-blue">Người được xác nhận *</p>
                    {user ? (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                            <span className="text-sm font-semibold text-emerald-800 inline-flex items-center gap-2">
                                <UserCheck className="w-4 h-4" />{user.fullName}{user.employeeCode ? ` · ${user.employeeCode}` : ''}
                            </span>
                            <button type="button" onClick={() => setUser(null)} className="text-xs font-semibold text-emerald-700 hover:underline">Đổi người</button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc mã nhân sự"
                                    className={`${inputCls} w-full pl-9`} />
                            </div>
                            <ul className="max-h-40 overflow-y-auto divide-y border border-platinum-tint rounded-xl">
                                {users.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Không tìm thấy người dùng.</li>}
                                {users.map((u) => (
                                    <li key={u.id}>
                                        <button type="button" onClick={() => setUser(u)} className="w-full text-left px-3 py-2 text-sm hover:bg-cloud-mist">
                                            <span className="font-semibold text-midnight-indigo">{u.fullName}</span>
                                            <span className="text-xs text-slate-400"> {u.employeeCode || u.employee_code ? `· ${u.employeeCode || u.employee_code}` : ''} {u.departmentName ? `· ${u.departmentName}` : ''}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

                <label className="block text-xs font-bold text-slate-blue">Gán điểm danh vào buổi họp (tùy chọn)
                    <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className={`${inputCls} w-full mt-1`}>
                        <option value="">Không gán — chỉ xác nhận danh tính</option>
                        {meetings.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.title} · {fmtDateTime(m.startTime)}{m.roomName ? ` · ${m.roomName}` : ''}
                            </option>
                        ))}
                    </select>
                    {meetings.length === 0 && <span className="block mt-1 font-normal text-slate-400">Không có buổi họp nào gần thời điểm và phòng của sự kiện này.</span>}
                </label>

                <label className="block text-xs font-bold text-slate-blue">Ghi chú
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${inputCls} w-full mt-1`}
                        placeholder="VD: Đeo khẩu trang nên camera không nhận ra" />
                </label>

                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-blue hover:bg-slate-100">Huỷ</button>
                    <button type="submit" disabled={saving || !user || picked.size === 0}
                        className="px-4 py-2 rounded-xl bg-action-blue hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                        {saving ? 'Đang lưu…' : 'Xác nhận'}
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
};

export default StrangerReviewModal;
