import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Search, Video, X } from 'lucide-react';

const WINDOWS = [
    { label: '±5 giây', sec: 5 },
    { label: '±15 giây', sec: 15 },
    { label: '±30 giây', sec: 30 },
    { label: '±1 phút', sec: 60 },
    { label: '±30 phút', sec: 1800 },
    { label: '±1 giờ', sec: 3600 },
];
const TYPES = [
    { value: 'car', label: 'Ô tô' },
    { value: 'motorbike', label: 'Xe máy' },
    { value: 'bus', label: 'Xe buýt' },
    { value: 'truck', label: 'Xe tải' },
];

const fmt = (d) => d.toLocaleString('vi-VN');
const chip = (on) => `px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${on
    ? 'bg-blue-50 border-action-blue text-action-blue'
    : 'bg-white border-platinum-tint text-slate-blue hover:border-slate-300'}`;

/**
 * "Tìm kiếm gần đây" — lọc lịch sử xe quanh thời điểm của 1 lượt xe.
 * onApply({ from: Date, to: Date, vehicleTypes: string[], cameraName: string|'' }).
 */
const RecentSearchModal = ({ item, onClose, onApply }) => {
    const [sec, setSec] = useState(5);
    const [types, setTypes] = useState(TYPES.map((t) => t.value));
    const [currentCamera, setCurrentCamera] = useState(true);
    if (!item) return null;

    const first = new Date(item.firstSeenAt || item.eventTime);
    const last = new Date(item.lastSeenAt || item.eventTime);
    const allOn = types.length === TYPES.length;
    const toggle = (v) => setTypes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

    const apply = () => onApply({
        from: new Date(first.getTime() - sec * 1000),
        to: new Date(last.getTime() + sec * 1000),
        vehicleTypes: allOn ? [] : types,
        cameraName: currentCamera ? (item.cameraName || '') : '',
    });

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between">
                    <h3 className="font-bold text-midnight-indigo">Tìm kiếm gần đây</h3>
                    <button onClick={onClose} className="text-slate-blue hover:text-midnight-indigo" title="Đóng"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="flex items-center gap-2 text-sm bg-cloud-mist/60 border border-platinum-tint rounded-xl px-4 py-2.5">
                        <Clock className="w-4 h-4 text-action-blue" />
                        <span className="font-semibold text-midnight-indigo">Thời gian:</span>
                        <span className="text-slate-blue">{fmt(first)} → {fmt(last)}</span>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-blue uppercase tracking-wide mb-2">Mở rộng trước/sau</p>
                        <div className="flex flex-wrap gap-2">
                            {WINDOWS.map((w) => <button key={w.sec} type="button" className={chip(sec === w.sec)} onClick={() => setSec(w.sec)}>{w.label}</button>)}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-blue uppercase tracking-wide">Loại phương tiện</p>
                            <button type="button" className="text-xs font-semibold text-action-blue" onClick={() => setTypes(allOn ? [] : TYPES.map((t) => t.value))}>
                                {allOn ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {TYPES.map((t) => <button key={t.value} type="button" className={chip(types.includes(t.value))} onClick={() => toggle(t.value)}>{t.label}</button>)}
                        </div>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-blue uppercase tracking-wide mb-2">Camera</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={`${chip(currentCamera)} inline-flex items-center gap-1.5`} onClick={() => setCurrentCamera(true)} disabled={!item.cameraName}>
                                <Video className="w-4 h-4" /> Camera hiện tại {item.cameraName ? `(${item.cameraName})` : ''}
                            </button>
                            <button type="button" className={chip(!currentCamera)} onClick={() => setCurrentCamera(false)}>Toàn bộ camera</button>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-platinum-tint font-semibold text-midnight-indigo hover:bg-cloud-mist">Huỷ</button>
                        <button type="button" onClick={apply} disabled={types.length === 0}
                            className="flex-1 py-2.5 rounded-xl bg-action-blue text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            <Search className="w-4 h-4" /> Áp dụng & tìm kiếm
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default RecentSearchModal;
