import { Calendar, Camera, Clock, Eye, EyeOff, RefreshCw, ShieldPlus, UserX, X } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { getStrangerAlerts, getStrangerSightings } from '../../service/businessAdminServices';
import { createPersonControlRecord } from '../../service/personControlListService';
import { getDevices } from '../../service/sysAdminServices';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import Pagination from '../../components/common/Pagination';

/**
 * Trang "Người lạ" (2.3) — gom các lần camera khuôn mặt báo người lạ theo (thiết bị, mã người lạ),
 * cho phép thêm nhanh vào Danh sách người giám sát với ảnh chụp làm ảnh hồ sơ.
 * "Bỏ qua" chỉ ẩn trên trình duyệt này (localStorage) — chưa có trạng thái xử lý phía BE.
 */

const HIDDEN_KEY = 'strangers.hidden';
const PAGE_SIZE = 12;

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const daysAgo = (n) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() - n * 86400000));
const fmtDateTime = (v) =>
    new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const keyOf = (s) => `${s.deviceId}|${s.strangerId || ''}`;
const placeOf = (s) => s.roomName || s.zoneName || s.deviceCode || 'Không rõ vị trí';

const loadHidden = () => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
};

const inputCls = 'px-3 py-2 bg-white border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none';

const Strangers = () => {
    const [from, setFrom] = useState(daysAgo(6));
    const [to, setTo] = useState(vnToday());
    const [deviceId, setDeviceId] = useState('');
    const [devices, setDevices] = useState([]);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hidden, setHidden] = useState(loadHidden);
    const [showHidden, setShowHidden] = useState(false);

    const [detail, setDetail] = useState(null); // { stranger, sightings, loading }
    const [snapshot, setSnapshot] = useState({ open: false, ids: [], index: 0 });
    const [addForm, setAddForm] = useState(null); // { stranger, display_name, list_type, priority, reason }
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        getDevices({ limit: 100 })
            .then(res => {
                const list = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
                setDevices(list.filter(d => d.device_type === 'face_server'));
            })
            .catch(() => setDevices([]));
    }, []);

    const fetchData = useCallback(async () => {
        if (to < from) { setError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'); return; }
        setLoading(true); setError(null);
        try {
            // lấy rộng 1 lần (tối đa 100 nhóm) để "Bỏ qua" lọc phía FE không làm lệch phân trang
            const res = await getStrangerAlerts({ from, to, limit: 100, ...(deviceId ? { deviceId } : {}) });
            if (res?.success) { setItems(res.data || []); setTotal(res.meta?.total ?? (res.data || []).length); }
            else setError(res?.message || 'Không tải được danh sách người lạ.');
        } catch (e) {
            setError(e?.response?.data?.message || 'Không tải được danh sách người lạ.');
        } finally { setLoading(false); }
    }, [from, to, deviceId]);

    useEffect(() => { fetchData(); setPage(1); }, [fetchData]);

    const visible = useMemo(
        () => items.filter(s => showHidden || !hidden.has(keyOf(s))),
        [items, hidden, showHidden],
    );
    const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const hiddenCount = items.filter(s => hidden.has(keyOf(s))).length;

    const toggleHidden = (s) => {
        const next = new Set(hidden);
        next.has(keyOf(s)) ? next.delete(keyOf(s)) : next.add(keyOf(s));
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
        setHidden(next);
    };

    const openDetail = async (s) => {
        setDetail({ stranger: s, sightings: [], loading: true });
        try {
            const res = await getStrangerSightings(s.deviceId, s.strangerId);
            setDetail({ stranger: s, sightings: res?.data || [], loading: false });
        } catch {
            setDetail({ stranger: s, sightings: [], loading: false });
        }
    };

    const openAdd = (s, known) => {
        setAddForm({
            stranger: s,
            sightings: known || [],
            picked: new Set((known || []).map(x => x.eventId)),
        display_name: s.strangerId ? `Người lạ ${s.strangerId}` : 'Người lạ chưa rõ danh tính',
        list_type: 'watchlist',
        priority: s.hitCount >= 3 ? 'high' : 'medium',
            reason: `Người lạ xuất hiện ${s.hitCount} lần tại ${placeOf(s)}, lần cuối ${fmtDateTime(s.lastSeen)}`,
        });
        // các lượt để bảo vệ tick chọn "cùng 1 người" → cảnh báo chứa lượt đó chuyển sang theo dõi
        if (!known) getStrangerSightings(s.deviceId, s.strangerId).then(res => {
            const list = res?.data || [];
            setAddForm(f => f && f.stranger === s ? { ...f, sightings: list, picked: new Set(list.map(x => x.eventId)) } : f);
        }).catch(() => {});
    };

    const togglePick = (id) => setAddForm(f => {
        const picked = new Set(f.picked);
        picked.has(id) ? picked.delete(id) : picked.add(id);
        return { ...f, picked };
    });

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!addForm.display_name.trim()) return;
        setSaving(true);
        try {
            const res = await createPersonControlRecord({
                display_name: addForm.display_name.trim(),
                list_type: addForm.list_type,
                priority: addForm.priority,
                reason: addForm.reason.trim().slice(0, 255) || undefined,
                active: true,
                ...(addForm.stranger.snapshotFileId ? { photo_media_file_id: addForm.stranger.snapshotFileId } : {}),
                ...(addForm.picked.size ? { source_event_ids: [...addForm.picked] } : {}),
            });
            if (res?.success) {
                setToast('Đã thêm vào Danh sách người giám sát.');
                setAddForm(null);
                setTimeout(() => setToast(null), 4000);
            } else setToast(res?.message || 'Thêm thất bại.');
        } catch (err) {
            setToast(err?.response?.data?.message || 'Thêm thất bại.');
        } finally { setSaving(false); }
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo flex items-center gap-2">
                        <UserX className="w-6 h-6 text-amber-600" /> Người lạ
                    </h1>
                    <p className="text-sm text-slate-blue mt-1">
                        Khuôn mặt camera không nhận ra, gom theo từng người. Thêm người đáng chú ý vào{' '}
                        <Link to="/system-admin/person-control-list" className="text-action-blue font-semibold hover:underline">Danh sách người giám sát</Link>.
                    </p>
                </div>
                <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-platinum-tint text-sm font-semibold text-midnight-indigo hover:bg-cloud-mist">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint p-4 flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-blue" />
                <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={inputCls} />
                <span className="text-slate-blue">→</span>
                <input type="date" value={to} min={from} max={vnToday()} onChange={e => e.target.value && setTo(e.target.value)} className={inputCls} />
                <Camera className="w-4 h-4 text-slate-blue ml-2" />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className={inputCls}>
                    <option value="">Tất cả camera</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.device_code}{d.device_name ? ` — ${d.device_name}` : ''}</option>)}
                </select>
                {hiddenCount > 0 && (
                    <button onClick={() => setShowHidden(v => !v)} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-action-blue hover:underline">
                        {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showHidden ? 'Ẩn mục đã bỏ qua' : `Hiện ${hiddenCount} mục đã bỏ qua`}
                    </button>
                )}
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            {!loading && visible.length === 0 && !error && (
                <div className="bg-white rounded-2xl border border-platinum-tint p-12 text-center text-slate-blue text-sm">
                    Không có người lạ nào trong khoảng thời gian này.
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pageItems.map(s => {
                    const isHidden = hidden.has(keyOf(s));
                    return (
                        <div key={keyOf(s)} className={`bg-white rounded-2xl border overflow-hidden flex flex-col ${s.hitCount >= 3 ? 'border-amber-300' : 'border-platinum-tint'} ${isHidden ? 'opacity-50' : ''}`}>
                            <div className="relative">
                                {s.snapshotEventId ? (
                                    <ThumbnailImage eventId={s.snapshotEventId} className="w-full aspect-square rounded-none border-0" alt="Ảnh người lạ" onClick={() => openDetail(s)} />
                                ) : (
                                    <button onClick={() => openDetail(s)} className="w-full aspect-square bg-slate-100 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                                        <UserX className="w-8 h-8" /> Không có ảnh
                                    </button>
                                )}
                                <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold shadow ${s.hitCount >= 3 ? 'bg-amber-500 text-white' : 'bg-white text-midnight-indigo'}`}>
                                    {s.hitCount} lần
                                </span>
                            </div>
                            <div className="p-3 space-y-1 flex-1">
                                <p className="text-sm font-bold text-midnight-indigo truncate" title={placeOf(s)}>{placeOf(s)}</p>
                                <p className="text-xs text-slate-blue flex items-center gap-1"><Clock className="w-3 h-3" /> Lần cuối {fmtDateTime(s.lastSeen)}</p>
                                <p className="text-[11px] text-slate-400 truncate">{s.deviceCode}{s.strangerId ? ` · mã ${s.strangerId}` : ' · thiết bị không gán mã'}</p>
                            </div>
                            <div className="flex border-t border-platinum-tint">
                                <button onClick={() => openAdd(s)} className="flex-1 py-2 text-xs font-bold text-action-blue hover:bg-blue-50 inline-flex items-center justify-center gap-1">
                                    <ShieldPlus className="w-3.5 h-3.5" /> Theo dõi
                                </button>
                                <button onClick={() => toggleHidden(s)} className="flex-1 py-2 text-xs font-semibold text-slate-blue hover:bg-cloud-mist border-l border-platinum-tint">
                                    {isHidden ? 'Hiện lại' : 'Bỏ qua'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {visible.length > PAGE_SIZE && (
                <Pagination currentPage={page} totalPages={Math.ceil(visible.length / PAGE_SIZE)} onPageChange={setPage} />
            )}
            {total > items.length && (
                <p className="text-xs text-slate-blue text-center">Đang hiện {items.length}/{total} nhóm mới nhất — thu hẹp khoảng ngày để xem các nhóm còn lại.</p>
            )}

            {/* modal chi tiết các lần xuất hiện */}
            {detail && createPortal(
                <AnimatePresence>
                    <motion.div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setDetail(null)}>
                        <motion.div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b border-platinum-tint">
                                <div>
                                    <p className="font-extrabold text-midnight-indigo">{placeOf(detail.stranger)}</p>
                                    <p className="text-xs text-slate-blue">{detail.stranger.hitCount} lần xuất hiện · {detail.stranger.deviceCode}</p>
                                </div>
                                <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="overflow-y-auto p-4 space-y-2">
                                {detail.loading && <p className="text-sm text-slate-blue">Đang tải…</p>}
                                {detail.sightings.map((x, i) => (
                                    <div key={x.eventId} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100">
                                        {x.hasSnapshot ? (
                                            <ThumbnailImage eventId={x.eventId} className="w-16 h-16" onClick={() => {
                                                const ids = detail.sightings.filter(y => y.hasSnapshot).map(y => y.eventId);
                                                setSnapshot({ open: true, ids, index: ids.indexOf(x.eventId) });
                                            }} />
                                        ) : <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center"><UserX className="w-5 h-5 text-slate-400" /></div>}
                                        <div className="text-sm">
                                            <p className="font-bold text-midnight-indigo">#{detail.sightings.length - i} · {fmtDateTime(x.time)}</p>
                                            {x.similarity && <p className="text-xs text-slate-blue">Độ giống gần nhất: {x.similarity}%</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-platinum-tint">
                                <button onClick={() => { const s = detail.stranger; const known = detail.sightings; setDetail(null); openAdd(s, known); }} className="w-full py-2.5 rounded-xl bg-action-blue hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2">
                                    <ShieldPlus className="w-4 h-4" /> Thêm vào danh sách theo dõi
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                </AnimatePresence>,
                document.body,
            )}

            {/* modal thêm vào danh sách người giám sát */}
            {addForm && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={() => setAddForm(null)}>
                    <form onSubmit={handleAdd} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center gap-3">
                            {addForm.stranger.snapshotEventId
                                ? <ThumbnailImage eventId={addForm.stranger.snapshotEventId} className="w-16 h-16" />
                                : <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center"><UserX className="w-6 h-6 text-slate-400" /></div>}
                            <div>
                                <p className="font-extrabold text-midnight-indigo">Thêm vào danh sách người giám sát</p>
                                <p className="text-xs text-slate-blue">{addForm.stranger.snapshotFileId ? 'Ảnh chụp này sẽ dùng làm ảnh hồ sơ.' : 'Người lạ này không có ảnh chụp.'}</p>
                            </div>
                        </div>
                        <label className="block text-xs font-bold text-slate-blue">Tên hiển thị *
                            <input value={addForm.display_name} maxLength={255} onChange={e => setAddForm({ ...addForm, display_name: e.target.value })} className={`${inputCls} w-full mt-1`} required />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-bold text-slate-blue">Loại danh sách
                                <select value={addForm.list_type} onChange={e => setAddForm({ ...addForm, list_type: e.target.value })} className={`${inputCls} w-full mt-1`}>
                                    <option value="watchlist">Danh sách theo dõi</option>
                                    <option value="blocklist">Danh sách đen</option>
                                </select>
                            </label>
                            <label className="block text-xs font-bold text-slate-blue">Mức ưu tiên
                                <select value={addForm.priority} onChange={e => setAddForm({ ...addForm, priority: e.target.value })} className={`${inputCls} w-full mt-1`}>
                                    <option value="low">Thấp</option>
                                    <option value="medium">Trung bình</option>
                                    <option value="high">Cao</option>
                                    <option value="critical">Nghiêm trọng</option>
                                </select>
                            </label>
                        </div>
                        <label className="block text-xs font-bold text-slate-blue">Lý do
                            <textarea value={addForm.reason} maxLength={255} rows={3} onChange={e => setAddForm({ ...addForm, reason: e.target.value })} className={`${inputCls} w-full mt-1`} />
                        </label>
                        {addForm.sightings.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-slate-blue mb-1">Các lượt là người này ({addForm.picked.size}/{addForm.sightings.length}) — cảnh báo chứa các lượt được chọn sẽ chuyển sang "Đối tượng theo dõi"</p>
                                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                    {addForm.sightings.map(x => (
                                        <label key={x.eventId} className={`relative rounded-lg border-2 cursor-pointer p-1 text-[10px] text-center ${addForm.picked.has(x.eventId) ? 'border-action-blue bg-blue-50' : 'border-slate-200 opacity-60'}`}>
                                            <input type="checkbox" className="absolute top-1 left-1" checked={addForm.picked.has(x.eventId)} onChange={() => togglePick(x.eventId)} />
                                            {x.hasSnapshot ? <ThumbnailImage eventId={x.eventId} className="w-full h-14 pointer-events-none" /> : <div className="h-14 flex items-center justify-center"><UserX className="w-4 h-4 text-slate-400" /></div>}
                                            {fmtDateTime(x.time)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setAddForm(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-blue hover:bg-slate-100">Huỷ</button>
                            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-action-blue hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Đang lưu…' : 'Thêm'}</button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            <EventSnapshotModal isOpen={snapshot.open} onClose={() => setSnapshot({ open: false, ids: [], index: 0 })} eventIds={snapshot.ids} initialIndex={snapshot.index} />

            {toast && (
                <div className="fixed bottom-6 right-6 z-[10000] px-4 py-3 rounded-xl bg-midnight-indigo text-white text-sm font-semibold shadow-lg">
                    {toast}{' '}
                    {toast.startsWith('Đã thêm') && <Link to="/system-admin/person-control-list" className="underline ml-1">Xem danh sách</Link>}
                </div>
            )}
        </div>
    );
};

export default Strangers;
