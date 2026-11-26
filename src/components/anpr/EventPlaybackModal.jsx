import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Film, Loader2, X } from 'lucide-react';
import HlsPlayer from '../camera/HlsPlayer';
import { downloadBlob } from '../../utils/cameraSnapshot';
import toast from '../../utils/toast';
import { downloadHgPlayback, hgPlaybackPlaylistUrl } from '../../service/hgvisionService';

const PADS = [5, 15, 30, 60];
const pad2 = (n) => String(n).padStart(2, '0');
const clock = (ms) => new Date(ms).toLocaleTimeString('vi-VN');

/** Xem lại video quanh thời điểm 1 lượt xe (camera = cameraName, ±N giây quanh lần đầu → lần cuối). */
const EventPlaybackModal = ({ item, onClose }) => {
    const [padSec, setPadSec] = useState(5);
    const [downloading, setDownloading] = useState(false);
    if (!item?.cameraName) return null;
    const camera = item.cameraName;
    const first = new Date(item.firstSeenAt || item.eventTime).getTime();
    const last = new Date(item.lastSeenAt || item.eventTime).getTime();
    const from = first - padSec * 1000;
    const to = Math.max(last, first) + padSec * 1000;

    const download = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            const res = await downloadHgPlayback({ camera, from, to });
            if (!(res?.data instanceof Blob)) throw res;
            const safe = camera.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9_-]+/g, '_');
            const d = new Date(from);
            downloadBlob(res.data, `${safe}_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.mp4`);
        } catch (er) {
            toast.error(er?.error?.message || 'Không tải được video (HGVision chưa có đoạn ghi hoặc chưa mở quyền).');
        } finally {
            setDownloading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-platinum-tint flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-50 text-orange-600"><Film className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-midnight-indigo truncate">Xem lại video — {camera}</h3>
                        <p className="text-xs text-slate-blue">{clock(from)} → {clock(to)} · {new Date(from).toLocaleDateString('vi-VN')}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-blue hover:text-midnight-indigo" title="Đóng"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 space-y-3">
                    <HlsPlayer key={`${camera}-${from}-${to}`} src={hgPlaybackPlaylistUrl({ camera, from, to })}
                        vod controls title={`${camera} – xem lại`} className="aspect-video rounded-xl" />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-blue">Mở rộng:</span>
                        {PADS.map((s) => (
                            <button key={s} type="button" onClick={() => setPadSec(s)}
                                className={`px-3 py-1 rounded-lg text-sm font-semibold border ${padSec === s ? 'bg-blue-50 border-action-blue text-action-blue' : 'bg-white border-platinum-tint text-slate-blue'}`}>
                                ±{s < 60 ? `${s} giây` : '1 phút'}
                            </button>
                        ))}
                        <button type="button" onClick={download} disabled={downloading}
                            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-action-blue text-white text-sm font-semibold disabled:opacity-50">
                            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Tải MP4
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EventPlaybackModal;
