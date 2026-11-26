import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import toast from '../../utils/toast';
import { createHgCamera, getHgGroups } from '../../service/hgvisionService';

const EMPTY = {
    name: '', group: '', mainUrl: '', subUrl: '', latitude: '', longitude: '',
    usingAi: true, usingFace: true, usingPlate: false, usingRecord: true, isShowing: true,
};
const RTSP = /^rtsp:\/\/\S+$/i;
const input = 'w-full px-3 py-2 rounded-lg border border-platinum-tint text-sm focus:outline-none focus:border-action-blue';
const label = 'block text-[11px] font-bold text-slate-blue uppercase tracking-wide mb-1';

const Toggle = ({ checked, onChange, children, disabled }) => (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
        <input type="checkbox" className="w-4 h-4 accent-action-blue" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {children}
    </label>
);

/** Thêm camera RTSP sang HGVision từ web SAVP (BE gọi POST /api/cameras của HGVision). */
const AddHgCameraModal = ({ open, onClose, onCreated }) => {
    const [f, setF] = useState(EMPTY);
    const [groups, setGroups] = useState([]);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));

    useEffect(() => {
        if (!open) return;
        setF(EMPTY);
        setErr('');
        getHgGroups().then((r) => setGroups(Array.isArray(r?.data) ? r.data : [])).catch(() => setGroups([]));
    }, [open]);
    if (!open) return null;

    const submit = async (e) => {
        e.preventDefault();
        const name = f.name.trim();
        const mainUrl = f.mainUrl.trim();
        const subUrl = f.subUrl.trim();
        if (!name) return setErr('Nhập tên camera.');
        if (!RTSP.test(mainUrl)) return setErr('Luồng chính phải là URL rtsp://...');
        if (subUrl && !RTSP.test(subUrl)) return setErr('Luồng phụ phải là URL rtsp://...');
        const hasLat = f.latitude.trim() !== '';
        const hasLng = f.longitude.trim() !== '';
        if (hasLat !== hasLng) return setErr('Nhập đủ cả vĩ độ và kinh độ (hoặc bỏ trống cả hai).');
        const lat = Number(f.latitude);
        const lng = Number(f.longitude);
        if (hasLat && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)) {
            return setErr('Toạ độ không hợp lệ.');
        }
        setErr('');
        setSaving(true);
        try {
            await createHgCamera({
                name,
                mainUrl,
                ...(subUrl ? { subUrl } : {}),
                ...(f.group ? { group: f.group } : {}),
                ...(hasLat ? { latitude: lat, longitude: lng } : {}),
                usingAi: f.usingAi,
                usingFace: f.usingAi && f.usingFace,
                usingPlate: f.usingAi && f.usingPlate,
                usingRecord: f.usingRecord,
                isShowing: f.isShowing,
            });
            toast.success(`Đã thêm camera "${name}" sang HGVision`);
            onCreated?.();
            onClose();
        } catch (er) {
            setErr(er?.error?.message || er?.message || 'Không thêm được camera.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/60 backdrop-blur-sm p-4" onClick={onClose}>
            <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between">
                    <h3 className="font-bold text-midnight-indigo">Thêm camera (HGVision)</h3>
                    <button type="button" onClick={onClose} className="text-slate-blue hover:text-midnight-indigo" title="Đóng"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={label}>Tên camera *</label>
                            <input className={input} value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="VD: Cong A1 101 (không dấu)" />
                        </div>
                        <div>
                            <label className={label}>Nhóm</label>
                            <select className={input} value={f.group} onChange={(e) => set('group')(e.target.value)}>
                                <option value="">Vãng lai</option>
                                {groups.map((g) => <option key={g.GROUP_NAME} value={g.GROUP_NAME}>{g.GROUP_NAME}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className={label}>Luồng chính (RTSP) *</label>
                        <input className={`${input} font-mono`} value={f.mainUrl} onChange={(e) => set('mainUrl')(e.target.value)}
                            placeholder="rtsp://admin:matkhau@10.43.31.222:554/cam/realmonitor?channel=1&subtype=0" autoComplete="off" />
                        <p className="text-[11px] text-slate-blue mt-1">Dahua: /cam/realmonitor?channel=1&amp;subtype=0 · Hikvision: /Streaming/Channels/101</p>
                    </div>
                    <div>
                        <label className={label}>Luồng phụ</label>
                        <input className={`${input} font-mono`} value={f.subUrl} onChange={(e) => set('subUrl')(e.target.value)} placeholder="Để trống — HGVision tự quét" autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={label}>Vĩ độ</label>
                            <input className={input} inputMode="decimal" value={f.latitude} onChange={(e) => set('latitude')(e.target.value)} placeholder="10.822000" />
                        </div>
                        <div>
                            <label className={label}>Kinh độ</label>
                            <input className={input} inputMode="decimal" value={f.longitude} onChange={(e) => set('longitude')(e.target.value)} placeholder="106.625700" />
                        </div>
                    </div>
                    <div className="p-3 rounded-xl border border-platinum-tint space-y-2">
                        <Toggle checked={f.usingAi} onChange={set('usingAi')}>Xử lý AI</Toggle>
                        <div className="flex flex-wrap gap-5 pl-6">
                            <Toggle checked={f.usingFace} onChange={set('usingFace')} disabled={!f.usingAi}>Nhận diện khuôn mặt</Toggle>
                            <Toggle checked={f.usingPlate} onChange={set('usingPlate')} disabled={!f.usingAi}>Nhận diện biển số</Toggle>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-5">
                        <Toggle checked={f.usingRecord} onChange={set('usingRecord')}>Ghi hình tự động</Toggle>
                        <Toggle checked={f.isShowing} onChange={set('isShowing')}>Hiển thị trực tiếp</Toggle>
                    </div>
                    {err && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-platinum-tint font-semibold text-midnight-indigo hover:bg-cloud-mist">Huỷ</button>
                        <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-action-blue text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Thêm camera
                        </button>
                    </div>
                </div>
            </form>
        </div>,
        document.body
    );
};

export default AddHgCameraModal;
