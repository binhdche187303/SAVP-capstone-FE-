import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Camera, Grid2x2, Search, Square, Wifi, WifiOff } from 'lucide-react';
import RefreshButton from '../../components/common/RefreshButton';
import HlsPlayer from '../../components/camera/HlsPlayer';
import { getHgCameraLogs, getHgCameras, toBackendUrl } from '../../service/hgvisionService';

const REFRESH_MS = 10000;
const GRID_MAX = 4;

const ERROR_TEXT = {
    HGVISION_NOT_CONFIGURED: 'Máy chủ chưa cấu hình kết nối HGVision. Liên hệ quản trị hệ thống.',
    HGVISION_UNAVAILABLE: 'Không kết nối được máy chủ camera HGVision.',
    HGVISION_AUTH_FAILED: 'Máy chủ camera từ chối tài khoản kết nối của hệ thống.',
    HGVISION_SCOPE_MISSING: 'Tài khoản kết nối HGVision chưa được cấp quyền xem camera.',
};

const LEVEL = {
    good: { label: 'Tốt', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    weak: { label: 'Yếu', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    offline: { label: 'Mất kết nối', cls: 'bg-red-50 text-red-700 border-red-200' },
};

export const errorMessage = (err) => {
    if (!err) return '';
    if (err.status === 403) return 'Bạn chưa được cấp quyền xem camera.';
    return ERROR_TEXT[err.error?.code] || err.error?.message || 'Không tải được danh sách camera.';
};

const levelOf = (cam) => LEVEL[cam.health?.level] || (cam.status === 'online' ? LEVEL.good : LEVEL.offline);

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('vi-VN', { hour12: false }) : '—');

const StatusBadge = ({ cam }) => {
    const lv = levelOf(cam);
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${lv.cls}`}>{cam.health?.level ? lv.label : cam.status === 'online' ? 'Trực tuyến' : 'Mất kết nối'}</span>;
};

const Stat = ({ icon: Icon, label, value, tone }) => (
    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-5 h-5" /></div>
        <div role="group" aria-label={label}>
            <div className="text-xs text-slate-blue">{label}</div>
            <div className="text-xl font-bold text-midnight-indigo">{value}</div>
        </div>
    </div>
);

const CameraDetail = ({ cam }) => {
    const [logs, setLogs] = useState([]);
    useEffect(() => {
        let alive = true;
        setLogs([]);
        getHgCameraLogs(cam.name, { limit: 10 })
            .then((res) => alive && setLogs(res?.data?.items ?? []))
            .catch(() => alive && setLogs([]));
        return () => { alive = false; };
    }, [cam.name]);
    const h = cam.health;
    const rows = [
        ['FPS', h ? `${h.fps ?? '—'} / ${h.fpsExpected ?? '—'}` : '—'],
        ['Bitrate', h?.bitrateKbps != null ? `${h.bitrateKbps} kbps` : '—'],
        ['Độ trễ', h?.latencyMs != null ? `${h.latencyMs} ms` : '—'],
        ['Mất kết nối 24h', h?.disconnects24h ?? '—'],
    ];
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rows.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-cloud-mist border border-platinum-tint px-3 py-2">
                        <div className="text-[11px] text-slate-blue">{k}</div>
                        <div className="text-sm font-bold text-midnight-indigo">{v}</div>
                    </div>
                ))}
            </div>
            {h?.reasons?.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {h.reasons.join(' · ')}
                </div>
            )}
            <div>
                <div className="text-xs font-bold text-midnight-indigo mb-1">Nhật ký kết nối gần nhất</div>
                {logs.length === 0 ? (
                    <div className="text-xs text-slate-blue">Không có sự kiện.</div>
                ) : (
                    <ul className="text-xs divide-y divide-platinum-tint/60 max-h-40 overflow-auto">
                        {logs.map((l) => (
                            <li key={l.id} className="py-1.5 flex gap-2">
                                <span className="font-mono text-slate-blue shrink-0">{fmtTime(l.timestamp_ms)}</span>
                                <span className={l.level === 'error' ? 'text-red-700' : 'text-midnight-indigo'}>{l.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const GuardLive = () => {
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [group, setGroup] = useState('all');
    const [status, setStatus] = useState('all');
    const [keyword, setKeyword] = useState('');
    const [layout, setLayout] = useState('single'); // single | grid
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getHgCameras();
            setCameras(res?.data ?? []);
            setError(null);
            return res;
        } catch (err) {
            setError(err);
            return { success: false };
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);

    const groups = useMemo(() => [...new Set(cameras.map((c) => c.group).filter(Boolean))], [cameras]);

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return cameras.filter((c) =>
            (group === 'all' || c.group === group)
            && (status === 'all' || c.status === status)
            && (!kw || c.name.toLowerCase().includes(kw)));
    }, [cameras, group, status, keyword]);

    // Giữ camera đang chọn; nếu chưa chọn/không còn trong danh sách → chọn camera online đầu tiên.
    useEffect(() => {
        if (selected && filtered.some((c) => c.name === selected)) return;
        const first = filtered.find((c) => c.status === 'online') || filtered[0];
        setSelected(first?.name ?? null);
    }, [filtered, selected]);

    const current = cameras.find((c) => c.name === selected) || null;
    const gridCams = filtered.filter((c) => c.status === 'online' && c.liveUrl).slice(0, GRID_MAX);
    const online = cameras.filter((c) => c.status === 'online').length;
    const weak = cameras.filter((c) => c.health?.level === 'weak').length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Camera trực tiếp</h1>
                    <p className="text-slate-blue text-sm mt-1">Xem trực tiếp và tình trạng kết nối toàn bộ camera trong khuôn viên.</p>
                </div>
                <RefreshButton type="button" onClick={load} disabled={loading} busy={loading} />
            </div>

            {error && (
                <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{errorMessage(error)}</div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat icon={Camera} label="Tổng camera" value={cameras.length} tone="bg-blue-50 text-action-blue" />
                <Stat icon={Wifi} label="Trực tuyến" value={online} tone="bg-emerald-50 text-emerald-600" />
                <Stat icon={WifiOff} label="Mất kết nối" value={cameras.length - online} tone="bg-red-50 text-red-600" />
                <Stat icon={Activity} label="Tín hiệu yếu" value={weak} tone="bg-amber-50 text-amber-600" />
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo khu vực">
                    {['all', ...groups].map((g) => (
                        <button
                            key={g}
                            type="button"
                            onClick={() => setGroup(g)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${group === g ? 'bg-action-blue text-white border-action-blue' : 'bg-white text-slate-blue border-platinum-tint hover:bg-cloud-mist'}`}
                        >
                            {g === 'all' ? 'Tất cả khu vực' : g}
                        </button>
                    ))}
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
                    <select
                        aria-label="Lọc trạng thái"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="h-9 rounded-xl border border-platinum-tint px-3 text-sm text-midnight-indigo"
                    >
                        <option value="all">Mọi trạng thái</option>
                        <option value="online">Trực tuyến</option>
                        <option value="offline">Mất kết nối</option>
                    </select>
                    <label className="relative">
                        <Search className="w-4 h-4 text-slate-blue absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="Tìm camera…"
                            className="h-9 w-48 rounded-xl border border-platinum-tint pl-9 pr-3 text-sm"
                        />
                    </label>
                    <div className="flex rounded-xl border border-platinum-tint overflow-hidden" role="group" aria-label="Bố cục">
                        <button type="button" title="1 camera" aria-pressed={layout === 'single'} onClick={() => setLayout('single')} className={`h-9 w-9 flex items-center justify-center ${layout === 'single' ? 'bg-action-blue text-white' : 'text-slate-blue'}`}><Square className="w-4 h-4" /></button>
                        <button type="button" title={`Lưới ${GRID_MAX} camera`} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} className={`h-9 w-9 flex items-center justify-center ${layout === 'grid' ? 'bg-action-blue text-white' : 'text-slate-blue'}`}><Grid2x2 className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <section aria-label="Màn hình xem" className="xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4 space-y-4">
                    {layout === 'grid' ? (
                        gridCams.length === 0 ? (
                            <div className="aspect-video rounded-xl bg-cloud-mist flex items-center justify-center text-sm text-slate-blue">Không có camera trực tuyến để xem.</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {gridCams.map((c) => (
                                    <button key={c.name} type="button" onClick={() => { setSelected(c.name); setLayout('single'); }} className="relative text-left rounded-xl overflow-hidden">
                                        <HlsPlayer src={toBackendUrl(c.liveUrl)} title={c.name} className="aspect-video" />
                                        <span className="absolute left-2 top-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] font-bold">{c.name}</span>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : current ? (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2"><Camera className="w-5 h-5 text-action-blue" /> {current.name}</h2>
                                <div className="flex items-center gap-2 text-xs text-slate-blue">
                                    {current.group && <span>{current.group}</span>}
                                    <StatusBadge cam={current} />
                                </div>
                            </div>
                            {current.status === 'online' && current.liveUrl ? (
                                <HlsPlayer key={current.name} src={toBackendUrl(current.liveUrl)} controls title={current.name} className="aspect-video rounded-xl" />
                            ) : (
                                <div className="aspect-video rounded-xl bg-slate-900 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
                                    <WifiOff className="w-7 h-7" /> Camera đang mất kết nối
                                </div>
                            )}
                            <CameraDetail cam={current} />
                        </>
                    ) : (
                        <div className="aspect-video rounded-xl bg-cloud-mist flex items-center justify-center text-sm text-slate-blue">
                            {loading ? 'Đang tải camera…' : 'Chưa có camera nào.'}
                        </div>
                    )}
                </section>

                <section aria-label="Danh sách camera" className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4">
                    <h2 className="text-base font-bold text-midnight-indigo mb-3">Danh sách camera ({filtered.length})</h2>
                    <ul className="space-y-2 max-h-[640px] overflow-auto pr-1">
                        {filtered.map((c) => (
                            <li key={c.name}>
                                <button
                                    type="button"
                                    onClick={() => { setSelected(c.name); setLayout('single'); }}
                                    aria-current={selected === c.name && layout === 'single' ? 'true' : undefined}
                                    className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${selected === c.name && layout === 'single' ? 'border-action-blue bg-blue-50/60' : 'border-platinum-tint hover:bg-cloud-mist'}`}
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold text-midnight-indigo truncate">{c.name}</span>
                                        <span className="block text-[11px] text-slate-blue truncate">
                                            {[c.group, c.fps != null && c.status === 'online' ? `${c.fps} fps` : null, c.usingFace ? 'Khuôn mặt' : null, c.usingPlate ? 'Biển số' : null].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <StatusBadge cam={c} />
                                </button>
                            </li>
                        ))}
                        {filtered.length === 0 && !loading && <li className="text-sm text-slate-blue py-6 text-center">Không có camera phù hợp.</li>}
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default GuardLive;
