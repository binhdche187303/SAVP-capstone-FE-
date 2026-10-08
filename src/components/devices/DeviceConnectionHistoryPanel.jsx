import { Activity, AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getDeviceConnectionHistory } from '../../service/sysAdminServices';

// Panel trượt phải: lịch sử kết nối 1 thiết bị (uptime, thanh 7 ngày, danh sách sự cố).
// Dữ liệu dựng từ audit đổi trạng thái ở BE (GET /iot-devices/:id/connection-history).

const DAY_MS = 86400000;
const SEGMENT_COLOR = { online: 'bg-green-500', offline: 'bg-red-500' };
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds} giây`;
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} phút`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ ${m % 60} phút`;
    return `${Math.floor(h / 24)} ngày ${h % 24} giờ`;
};

const formatTime = (iso) =>
    new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Cắt các đoạn trạng thái theo từng ngày (giờ địa phương) cho 7 ngày gần nhất.
const buildDays = (segments, to) => {
    const end = new Date(to);
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
        const stop = new Date(start.getTime() + DAY_MS);
        const pieces = segments
            .map((s) => ({
                status: s.status,
                from: Math.max(new Date(s.from).getTime(), start.getTime()),
                to: Math.min(new Date(s.to).getTime(), stop.getTime()),
            }))
            .filter((p) => p.to > p.from);
        let online = 0;
        let offline = 0;
        pieces.forEach((p) => {
            if (p.status === 'online') online += p.to - p.from;
            if (p.status === 'offline') offline += p.to - p.from;
        });
        days.push({
            start,
            pieces,
            uptime: online + offline > 0 ? Math.round((online / (online + offline)) * 100) : null,
        });
    }
    return days;
};

const UptimeStat = ({ label, value }) => (
    <div className="bg-cloud-mist rounded-xl p-3">
        <p className="text-[11px] text-slate-blue font-medium">{label}</p>
        <p className={`text-lg font-bold leading-tight ${value == null ? 'text-steel-gray' : value >= 99 ? 'text-green-600' : value >= 95 ? 'text-amber-600' : 'text-red-600'}`}>
            {value == null ? '—' : `${value}%`}
        </p>
    </div>
);

const DeviceConnectionHistoryPanel = ({ device, onClose }) => {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getDeviceConnectionHistory(device.id, days)
            .then((res) => {
                if (cancelled) return;
                if (res?.success) setData(res.data);
                else setError(res?.message || 'Không tải được lịch sử kết nối.');
            })
            .catch((err) => !cancelled && setError(err?.error?.message || err?.message || 'Không tải được lịch sử kết nối.'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [device.id, days]);

    const dayRows = data ? buildDays(data.segments, data.to) : [];

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-midnight-indigo/30" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col animate-fade-in-up">
                <div className="px-6 py-4 border-b border-platinum-tint flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-action-blue">
                            <Activity className="w-3.5 h-3.5" /> Lịch sử kết nối
                        </p>
                        <h3 className="text-base font-bold text-midnight-indigo truncate">{device.device_name}</h3>
                        <p className="text-[10px] font-mono text-steel-gray tracking-wider">{device.device_code}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={days}
                            onChange={(e) => setDays(Number(e.target.value))}
                            className="px-2 py-1 border border-platinum-tint rounded-lg text-xs text-slate-blue bg-white focus:outline-none focus:border-action-blue"
                        >
                            <option value={7}>7 ngày</option>
                            <option value={30}>30 ngày</option>
                            <option value={90}>90 ngày</option>
                        </select>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-steel-gray hover:bg-cloud-mist">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-8 h-8 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <UptimeStat label="Uptime 7 ngày" value={data.uptime_7d_percent} />
                                <UptimeStat label={`Uptime ${days} ngày`} value={data.uptime_percent} />
                                <div className="bg-cloud-mist rounded-xl p-3">
                                    <p className="text-[11px] text-slate-blue font-medium">Số lần mất kết nối</p>
                                    <p className="text-lg font-bold text-midnight-indigo leading-tight">{data.offline_count}</p>
                                </div>
                                <div className="bg-cloud-mist rounded-xl p-3">
                                    <p className="text-[11px] text-slate-blue font-medium">Lâu nhất</p>
                                    <p className="text-lg font-bold text-midnight-indigo leading-tight">
                                        {data.longest_offline_seconds > 0 ? formatDuration(data.longest_offline_seconds) : '—'}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-bold text-midnight-indigo mb-2">7 ngày qua</p>
                                <div className="space-y-1.5">
                                    {dayRows.map((d) => (
                                        <div key={d.start.toISOString()} className="flex items-center gap-2">
                                            <span className="w-14 text-[11px] text-slate-blue shrink-0">
                                                {WEEKDAY[d.start.getDay()]} {d.start.getDate()}/{d.start.getMonth() + 1}
                                            </span>
                                            <div className="relative flex-1 h-3 rounded bg-platinum-tint overflow-hidden">
                                                {d.pieces.map((p) => (
                                                    <div
                                                        key={p.from}
                                                        title={`${p.status} · ${formatTime(p.from)} → ${formatTime(p.to)}`}
                                                        className={`absolute top-0 h-full ${SEGMENT_COLOR[p.status] || 'bg-gray-300'}`}
                                                        style={{
                                                            left: `${((p.from - d.start.getTime()) / DAY_MS) * 100}%`,
                                                            width: `${((p.to - p.from) / DAY_MS) * 100}%`,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-midnight-indigo shrink-0">
                                                {d.uptime == null ? '—' : `${d.uptime}%`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-4 mt-2 text-[10px] text-slate-blue">
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Online</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Offline</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Vô hiệu / bảo trì</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-bold text-midnight-indigo mb-2">Sự cố gần đây</p>
                                {data.incidents.length === 0 ? (
                                    <p className="text-xs text-steel-gray italic">Không có lần mất kết nối nào trong {days} ngày.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {data.incidents.map((i) => (
                                            <li key={i.started_at} className="border border-platinum-tint rounded-xl px-3 py-2 flex items-start gap-2">
                                                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${i.ended_at ? 'text-amber-500' : 'text-red-500'}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-midnight-indigo">
                                                        {formatTime(i.started_at)} → {i.ended_at ? formatTime(i.ended_at) : <span className="text-red-600">đang mất kết nối</span>}
                                                    </p>
                                                    <p className="text-[11px] text-slate-blue">Mất kết nối {formatDuration(i.duration_seconds)}</p>
                                                </div>
                                                {i.alert_id && (
                                                    <Link to="/system-admin/security-alerts" className="text-[11px] font-semibold text-action-blue hover:underline shrink-0">
                                                        Xem cảnh báo
                                                    </Link>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default DeviceConnectionHistoryPanel;
