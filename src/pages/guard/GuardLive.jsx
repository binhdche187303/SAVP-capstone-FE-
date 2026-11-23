import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Camera, ChevronDown, ChevronLeft, ChevronRight, Download, ImageDown, Loader2, Filter, Grid2x2, Grid3x3, MapPin, Maximize2, Minimize2, Search, Square, Wifi, WifiOff } from 'lucide-react';
import RefreshButton from '../../components/common/RefreshButton';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard from '../../components/common/StatisticCard';
import FilterBar from '../../components/common/FilterBar';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import { matchesFilter } from '../../utils/filterSelection';
import { downloadBlob } from '../../utils/cameraSnapshot';
import toast from '../../utils/toast';
import HlsPlayer from '../../components/camera/HlsPlayer';
import { captureHgSnapshot, getHgCameraLogs, getHgCameras, getHgSnapshotFile, getHgSnapshots, toBackendUrl } from '../../service/hgvisionService';

const REFRESH_MS = 10000;
/** Số camera mỗi trang lưới: 2×2 hoặc 3×3 (mỗi ô là 1 luồng video trực tiếp). */
const GRID_SIZES = [4, 9];
export const NO_ZONE = 'Chưa gán khu vực';

/** Khu vực hiển thị: khu vực SAVP gán cho camera, sau đó nhóm HGVision, cuối cùng là "chưa gán". */
export const zoneOf = (cam) => cam.zoneName || cam.group || NO_ZONE;

/** online | weak | offline — dùng cho thẻ thống kê và bộ lọc trạng thái. */
export const stateOf = (cam) => (cam.status !== 'online' ? 'offline' : cam.health?.level === 'weak' ? 'weak' : 'online');

const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

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

const SNAPSHOT_ERROR = {
    CAMERA_OFFLINE: 'Camera đang mất kết nối, không chụp được ảnh.',
    SNAPSHOT_FAILED: 'Không lấy được khung hình từ camera. Thử lại sau vài giây.',
};
export const snapshotErrorMessage = (err) => (err?.status === 403 ? 'Bạn chưa được cấp quyền chụp ảnh camera.'
    : SNAPSHOT_ERROR[err?.error?.code] || err?.error?.message || errorMessage(err));

export const downloadSnapshot = async (snap) => {
    const res = await getHgSnapshotFile(snap.id);
    if (!(res?.data instanceof Blob)) throw new Error('Không tải được ảnh.');
    downloadBlob(res.data, snap.fileName);
};

const levelOf = (cam) => LEVEL[cam.health?.level] || (cam.status === 'online' ? LEVEL.good : LEVEL.offline);

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('vi-VN', { hour12: false }) : '—');

const StatusBadge = ({ cam }) => {
    const lv = levelOf(cam);
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${lv.cls}`}>{cam.health?.level ? lv.label : cam.status === 'online' ? 'Trực tuyến' : 'Mất kết nối'}</span>;
};

const CameraDetail = ({ cam, snapshotVersion = 0 }) => {
    const [logs, setLogs] = useState([]);
    const [snaps, setSnaps] = useState([]);
    useEffect(() => {
        let alive = true;
        setSnaps([]);
        getHgSnapshots({ camera: cam.name, limit: 5 })
            .then((res) => alive && setSnaps(res?.data ?? []))
            .catch(() => alive && setSnaps([]));
        return () => { alive = false; };
    }, [cam.name, snapshotVersion]);
    const download = (snap) => downloadSnapshot(snap).catch((e) => toast.error(snapshotErrorMessage(e)));
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
                <div className="text-xs font-bold text-midnight-indigo mb-1">Ảnh đã chụp gần đây</div>
                {snaps.length === 0 ? (
                    <div className="text-xs text-slate-blue">Chưa có ảnh chụp.</div>
                ) : (
                    <ul className="text-xs divide-y divide-platinum-tint/60">
                        {snaps.map((sn) => (
                            <li key={sn.id} className="py-1.5 flex items-center justify-between gap-2">
                                <span className="min-w-0">
                                    <span className="font-mono text-slate-blue">{fmtTime(Date.parse(sn.capturedAt))}</span>
                                    <span className="text-midnight-indigo"> · {sn.capturedByName || 'Không rõ người chụp'}</span>
                                </span>
                                <button type="button" onClick={() => download(sn)} title={`Tải ${sn.fileName}`} aria-label={`Tải ảnh chụp lúc ${fmtTime(Date.parse(sn.capturedAt))}`} className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-action-blue hover:bg-blue-50">
                                    <Download className="w-3.5 h-3.5" /> Tải
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
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
    const [zone, setZone] = useState('');
    const [status, setStatus] = useState('');
    // Khu vực đang mở trong danh sách: mặc định đóng, bấm vào khu vực mới liệt kê camera.
    const [openZones, setOpenZones] = useState({});
    const [capturing, setCapturing] = useState(null);
    const [snapshotVersion, setSnapshotVersion] = useState(0);
    const [keyword, setKeyword] = useState('');
    const [layout, setLayout] = useState('single'); // single | grid
    const [gridPage, setGridPage] = useState(1);
    // Khu vực đang xem dạng lưới (bấm tên khu vực ở danh sách) — null = lưới mọi camera trực tuyến.
    const [gridZone, setGridZone] = useState(null);
    const [gridSize, setGridSize] = useState(GRID_SIZES[0]);
    // Đổi bộ lọc / cỡ lưới → về trang 1 của lưới.
    useEffect(() => { setGridPage(1); }, [keyword, zone, status, gridZone, gridSize]);
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

    const zones = useMemo(() => [...new Set(cameras.map(zoneOf))]
        .sort((a, b) => (a === NO_ZONE) - (b === NO_ZONE) || a.localeCompare(b, 'vi')), [cameras]);

    // Tìm không phân biệt dấu, theo tên camera hoặc khu vực; bỏ qua khoảng trắng thừa.
    const searched = useMemo(() => {
        const words = normalize(keyword).split(/\s+/).filter(Boolean);
        if (!words.length) return cameras;
        return cameras.filter((c) => {
            const text = normalize(`${c.name} ${zoneOf(c)}`);
            return words.every((w) => text.includes(w));
        });
    }, [cameras, keyword]);

    const filtered = useMemo(() => searched.filter((c) => matchesFilter(zone, zoneOf(c)) && matchesFilter(status, stateOf(c))),
        [searched, zone, status]);

    const zoneCounts = useMemo(() => searched.filter((c) => matchesFilter(status, stateOf(c)))
        .reduce((acc, c) => ({ ...acc, [zoneOf(c)]: (acc[zoneOf(c)] || 0) + 1 }), {}), [searched, status]);
    const statusCounts = useMemo(() => searched.filter((c) => matchesFilter(zone, zoneOf(c)))
        .reduce((acc, c) => ({ ...acc, [stateOf(c)]: (acc[stateOf(c)] || 0) + 1 }), {}), [searched, zone]);

    const grouped = useMemo(() => zones
        .map((z) => ({ zone: z, items: filtered.filter((c) => zoneOf(c) === z) }))
        .filter((g) => g.items.length > 0), [zones, filtered]);

    const hasFilter = !!(keyword.trim() || zone || status);
    const clearFilters = () => { setKeyword(''); setZone(''); setStatus(''); };

    // Giữ camera đang chọn; nếu chưa chọn/không còn trong danh sách → chọn camera online đầu tiên.
    useEffect(() => {
        if (selected && filtered.some((c) => c.name === selected)) return;
        const first = filtered.find((c) => c.status === 'online') || filtered[0];
        setSelected(first?.name ?? null);
    }, [filtered, selected]);

    const current = cameras.find((c) => c.name === selected) || null;
    const currentZone = current ? zoneOf(current) : null;
    // Đang tìm kiếm hoặc lọc khu vực thì mở sẵn các khu vực khớp để thấy ngay kết quả.
    const autoOpen = !!keyword.trim() || !!zone;
    const isZoneOpen = (z) => openZones[z] ?? (autoOpen || z === currentZone);
    const canCapture = !!current && current.status === 'online' && !!current.liveUrl;
    // Chụp ảnh 1 camera (camera đang xem, hoặc 1 ô trong lưới). capturing = tên camera đang chụp.
    const snapshotCamera = async (cam) => {
        if (!cam || capturing) return;
        setCapturing(cam.name);
        try {
            // BE chụp từ luồng live, lưu lịch sử; sau đó tải file về máy.
            const res = await captureHgSnapshot(cam.name);
            const snap = res?.data;
            if (!snap?.id) throw res;
            setSnapshotVersion((v) => v + 1);
            await downloadSnapshot(snap);
            toast.success(`Đã chụp và lưu ảnh ${snap.fileName}`);
        } catch (e) {
            toast.error(snapshotErrorMessage(e));
        } finally {
            setCapturing(false);
        }
    };
    const takeSnapshot = () => snapshotCamera(current);
    // Bấm khu vực: mở/đóng danh sách camera của khu vực; khi MỞ thì màn hình xem chuyển sang lưới camera của khu vực đó.
    const toggleZone = (z) => {
        const opening = !isZoneOpen(z);
        setOpenZones((prev) => ({ ...prev, [z]: opening }));
        if (opening) { setGridZone(z); setLayout('grid'); } else if (gridZone === z) setGridZone(null);
    };
    const showAllGrid = () => { setGridZone(null); setLayout('grid'); };

    // Toàn màn hình cho CẢ lưới camera (không chỉ 1 camera): dùng Fullscreen API trên khối lưới; Esc / nút để thoát.
    const wallRef = useRef(null);
    const [wallFullscreen, setWallFullscreen] = useState(false);
    useEffect(() => {
        const onChange = () => setWallFullscreen(Boolean(wallRef.current) && document.fullscreenElement === wallRef.current);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);
    // Nút phân trang: ghi rõ màu mũi tên (trước đây mũi tên kế thừa chữ trắng khi toàn màn hình → trắng trên nền trắng, mất mũi tên).
    const pagerButton = wallFullscreen
        ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
        : 'border-platinum-tint bg-white text-midnight-indigo hover:bg-cloud-mist';
    const toggleWallFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else wallRef.current?.requestFullscreen?.().catch(() => toast.error('Trình duyệt không cho phép xem toàn màn hình.'));
    };
    // Lưới: mỗi trang gridSize camera (giới hạn số luồng video mở cùng lúc), chuyển trang để xem hết.
    // Lưới khu vực hiện MỌI camera của khu vực (camera mất kết nối hiện ô báo lỗi); lưới chung chỉ camera trực tuyến.
    const liveCams = gridZone
        ? filtered.filter((c) => zoneOf(c) === gridZone)
        : filtered.filter((c) => c.status === 'online' && c.liveUrl);
    const gridPages = Math.max(1, Math.ceil(liveCams.length / gridSize));
    const safeGridPage = Math.min(gridPage, gridPages);
    const gridStart = (safeGridPage - 1) * gridSize;
    const gridCams = liveCams.slice(gridStart, gridStart + gridSize);
    const online = cameras.filter((c) => c.status === 'online').length;
    const weak = cameras.filter((c) => stateOf(c) === 'weak').length;
    const toggleStatus = (value) => setStatus((prev) => (prev === value ? '' : value));

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight">Camera trực tiếp</h1>
                    <p className="text-xs text-slate-blue mt-1">Xem trực tiếp và tình trạng kết nối toàn bộ camera trong khuôn viên.</p>
                </div>
                <RefreshButton type="button" onClick={load} disabled={loading} busy={loading} />
            </div>

            {error && (
                <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{errorMessage(error)}</div>
            )}

            <StatisticGrid columns={4}>
                <StatisticCard icon={Camera} label="Tổng camera" value={cameras.length} loading={loading && !cameras.length} selected={!status} onClick={() => setStatus('')} />
                <StatisticCard icon={Wifi} label="Trực tuyến" value={online} tone="success" loading={loading && !cameras.length} selected={status === 'online'} onClick={() => toggleStatus('online')} />
                <StatisticCard icon={WifiOff} label="Mất kết nối" value={cameras.length - online} tone="danger" loading={loading && !cameras.length} selected={status === 'offline'} onClick={() => toggleStatus('offline')} />
                <StatisticCard icon={Activity} label="Tín hiệu yếu" value={weak} tone="warning" loading={loading && !cameras.length} selected={status === 'weak'} onClick={() => toggleStatus('weak')} />
            </StatisticGrid>

            <FilterBar data-filter-grid variant="card" className="grid gap-4">
                <div data-filter-search className="camai-filter-field">
                    <label htmlFor="guard-live-search">Tìm kiếm</label>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-blue absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            id="guard-live-search"
                            type="search"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="Tên camera hoặc khu vực…"
                            className="w-full pl-9 pr-3"
                        />
                    </div>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="guard-live-zone">Khu vực</label>
                    <FilterMultiSelect id="guard-live-zone" counts={zoneCounts} value={zone} onChange={(e) => setZone(e.target.value)}>
                        <option value="">Tất cả khu vực</option>
                        {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                    </FilterMultiSelect>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="guard-live-status">Trạng thái</label>
                    <FilterMultiSelect id="guard-live-status" counts={statusCounts} value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Mọi trạng thái</option>
                        <option value="online">Trực tuyến</option>
                        <option value="weak">Tín hiệu yếu</option>
                        <option value="offline">Mất kết nối</option>
                    </FilterMultiSelect>
                </div>
                <div className="camai-filter-field">
                    <span className="block">Bố cục</span>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl border border-platinum-tint overflow-hidden" role="group" aria-label="Bố cục">
                            <button type="button" title="1 camera" aria-pressed={layout === 'single'} onClick={() => setLayout('single')} className={`h-10 w-10 flex items-center justify-center ${layout === 'single' ? 'bg-action-blue text-white' : 'bg-white text-slate-blue'}`}><Square className="w-4 h-4" /></button>
                            {GRID_SIZES.map((size) => {
                                const active = layout === 'grid' && gridSize === size;
                                const Icon = size === 9 ? Grid3x3 : Grid2x2;
                                return (
                                    <button key={size} type="button" title={`Lưới ${size} camera/trang`} aria-pressed={active}
                                        onClick={() => { setGridSize(size); if (layout !== 'grid') showAllGrid(); }}
                                        className={`h-10 w-10 flex items-center justify-center ${active ? 'bg-action-blue text-white' : 'bg-white text-slate-blue'}`}>
                                        <Icon className="w-4 h-4" />
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" data-filter-action onClick={clearFilters} disabled={!hasFilter} className="flex-1 h-10 px-4 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors disabled:opacity-50"><Filter className="w-4 h-4 inline mr-2" />Xóa bộ lọc</button>
                    </div>
                </div>
            </FilterBar>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <section aria-label="Màn hình xem" className="xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4 space-y-4">
                    {layout === 'grid' ? (
                        // Khối lưới camera: nút "Toàn màn hình" phóng to CẢ lưới (Fullscreen API), Esc để thoát.
                        <div ref={wallRef} className={wallFullscreen ? 'h-screen bg-slate-950 p-3 flex flex-col gap-2 overflow-auto' : 'space-y-4'}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 className={`text-base font-bold flex items-center gap-2 min-w-0 ${wallFullscreen ? 'text-white' : 'text-midnight-indigo'}`}>
                                <MapPin className="w-5 h-5 text-action-blue shrink-0" />
                                <span className="truncate">{gridZone || 'Tất cả camera trực tuyến'}</span>
                                <span className={`text-xs font-semibold whitespace-nowrap ${wallFullscreen ? 'text-white/70' : 'text-slate-blue'}`}>· {liveCams.length} camera</span>
                            </h2>
                            <div className="flex items-center gap-3 shrink-0">
                                {gridZone && (
                                    <button type="button" onClick={showAllGrid} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap ${wallFullscreen ? 'bg-action-blue text-white hover:bg-blue-600' : 'border border-action-blue/30 bg-blue-50 text-action-blue hover:bg-blue-100'}`}>
                                        <Grid3x3 className="w-3.5 h-3.5" /> Xem tất cả camera
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleWallFullscreen}
                                    title={wallFullscreen ? 'Thoát toàn màn hình (Esc)' : 'Xem toàn màn hình cả lưới camera'}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${wallFullscreen ? 'border-white/20 bg-white/10 text-white hover:bg-white/20' : 'border-platinum-tint bg-white text-midnight-indigo hover:bg-cloud-mist'}`}
                                >
                                    {wallFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                    {wallFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                                </button>
                            </div>
                        </div>
                        {gridCams.length === 0 ? (
                            <div className="aspect-video rounded-xl bg-cloud-mist flex items-center justify-center text-sm text-slate-blue">
                                {gridZone ? 'Khu vực này chưa có camera phù hợp.' : 'Không có camera trực tuyến để xem.'}
                            </div>
                        ) : (
                            <>
                                {/* Toàn màn hình: giới hạn bề ngang theo chiều cao màn để cả lưới (2 hoặc 3 hàng 16:9) vừa khít, không phải cuộn. */}
                                <div
                                    className={`grid gap-2 ${gridSize === 9 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} ${wallFullscreen ? 'w-full mx-auto' : ''}`}
                                    style={wallFullscreen ? { maxWidth: `calc((100vh - ${liveCams.length > gridSize ? 110 : 70}px) * 16 / 9)` } : undefined}
                                >
                                    {gridCams.map((c) => {
                                        const tileOnline = c.status === 'online' && !!c.liveUrl;
                                        return (
                                        <div key={c.name} className="group relative">
                                        <button type="button" onClick={() => { setSelected(c.name); setLayout('single'); }} className={`relative block w-full text-left overflow-hidden ${gridSize === 9 ? 'rounded-lg' : 'rounded-xl'}`}>
                                            {c.status === 'online' && c.liveUrl ? (
                                                <HlsPlayer src={toBackendUrl(c.liveUrl)} title={c.name} className="aspect-video" />
                                            ) : (
                                                <div className="aspect-video bg-slate-900 flex flex-col items-center justify-center gap-1.5 text-white/80 text-xs">
                                                    <WifiOff className="w-6 h-6" /> Mất kết nối
                                                </div>
                                            )}
                                            <span className={`absolute left-1.5 top-1.5 max-w-[calc(100%-48px)] truncate px-2 py-0.5 rounded-md bg-black/60 text-white font-bold ${gridSize === 9 ? 'text-[10px]' : 'text-[11px]'}`}>{c.name}</span>
                                        </button>
                                        {/* Chụp ảnh ngay trên ô (không phải mở từng camera); hiện khi rê chuột, luôn hiện khi toàn màn hình. */}
                                        {tileOnline && (
                                            <button
                                                type="button"
                                                onClick={() => snapshotCamera(c)}
                                                disabled={Boolean(capturing)}
                                                aria-label={`Chụp ảnh ${c.name}`}
                                                title="Chụp ảnh camera này"
                                                className={`absolute right-1.5 top-1.5 h-7 w-7 inline-flex items-center justify-center rounded-md bg-black/60 text-white hover:bg-action-blue disabled:opacity-60 transition-opacity ${wallFullscreen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                                            >
                                                {capturing === c.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                        </div>
                                        );
                                    })}
                                    {/* Trang cuối thiếu camera: thêm ô màn đen để lưới luôn đủ 2×2 / 3×3 → khung và nút phân trang không nhảy vị trí. */}
                                    {liveCams.length > gridSize && Array.from({ length: gridSize - gridCams.length }, (_, i) => (
                                        <div key={`empty-${i}`} aria-hidden="true" className={`aspect-video bg-black ${gridSize === 9 ? 'rounded-lg' : 'rounded-xl'}`} />
                                    ))}
                                </div>
                                {liveCams.length > gridSize && (
                                    <div className={`flex items-center justify-between gap-3 text-xs ${wallFullscreen ? 'mt-auto text-white/80' : 'text-slate-blue'}`}>
                                        <span>Hiển thị {gridStart + 1}–{gridStart + gridCams.length} / {liveCams.length} camera{gridZone ? '' : ' trực tuyến'}</span>
                                        <div className="flex items-center gap-2">
                                            <button type="button" aria-label="Trang trước" onClick={() => setGridPage(safeGridPage - 1)} disabled={safeGridPage <= 1} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${pagerButton}`}><ChevronLeft className="w-4 h-4" /></button>
                                            <span className={`font-semibold ${wallFullscreen ? 'text-white' : 'text-midnight-indigo'}`}>Trang {safeGridPage}/{gridPages}</span>
                                            <button type="button" aria-label="Trang sau" onClick={() => setGridPage(safeGridPage + 1)} disabled={safeGridPage >= gridPages} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${pagerButton}`}><ChevronRight className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        </div>
                    ) : current ? (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2"><Camera className="w-5 h-5 text-action-blue" /> {current.name}</h2>
                                <div className="flex items-center gap-2 text-xs text-slate-blue">
                                    <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{zoneOf(current)}</span>
                                    <StatusBadge cam={current} />
                                    <button
                                        type="button"
                                        onClick={takeSnapshot}
                                        disabled={!canCapture || Boolean(capturing)}
                                        title={canCapture ? 'Chụp ảnh màn hình camera' : 'Camera đang mất kết nối'}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-platinum-tint bg-white px-2.5 text-xs font-semibold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                                        Chụp ảnh
                                    </button>
                                </div>
                            </div>
                            {current.status === 'online' && current.liveUrl ? (
                                <HlsPlayer key={current.name} src={toBackendUrl(current.liveUrl)} controls title={current.name} className="aspect-video rounded-xl" />
                            ) : (
                                <div className="aspect-video rounded-xl bg-slate-900 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
                                    <WifiOff className="w-7 h-7" /> Camera đang mất kết nối
                                </div>
                            )}
                            <CameraDetail cam={current} snapshotVersion={snapshotVersion} />
                        </>
                    ) : (
                        <div className="aspect-video rounded-xl bg-cloud-mist flex items-center justify-center text-sm text-slate-blue">
                            {loading ? 'Đang tải camera…' : 'Chưa có camera nào.'}
                        </div>
                    )}
                </section>

                <section aria-label="Danh sách camera" className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4">
                    <h2 className="text-base font-bold text-midnight-indigo mb-3">Danh sách camera ({filtered.length})</h2>
                    <div className="space-y-3 max-h-[640px] overflow-auto pr-1">
                        {grouped.map(({ zone: z, items }) => {
                            const isOpen = isZoneOpen(z);
                            const onlineInZone = items.filter((c) => c.status === 'online').length;
                            const offlineInZone = items.filter((c) => c.status !== 'online').length;
                            return (
                                <div key={z} role="group" aria-label={`Khu vực ${z}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleZone(z)}
                                        aria-expanded={isOpen}
                                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${isOpen ? 'border-action-blue/40 bg-blue-50/60' : 'border-platinum-tint bg-cloud-mist/40 hover:bg-cloud-mist'}`}
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? 'bg-action-blue text-white' : 'bg-white text-action-blue border border-platinum-tint'}`}>
                                                <MapPin className="w-4 h-4" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-bold text-midnight-indigo truncate">{z}</span>
                                                <span className="block text-[11px] text-slate-blue">
                                                    {items.length} camera · {onlineInZone} trực tuyến{offlineInZone ? ` · ${offlineInZone} mất kết nối` : ''}
                                                </span>
                                            </span>
                                        </span>
                                        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-blue transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isOpen && (
                                        <ul className="space-y-2 mt-2 pl-3 ml-4 border-l-2 border-platinum-tint">
                                            {items.map((c) => (
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
                                                                {[c.fps != null && c.status === 'online' ? `${c.fps} fps` : null, c.usingFace ? 'Khuôn mặt' : null, c.usingPlate ? 'Biển số' : null].filter(Boolean).join(' · ')}
                                                            </span>
                                                        </span>
                                                        <StatusBadge cam={c} />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                        {filtered.length === 0 && !loading && <p className="text-sm text-slate-blue py-6 text-center">Không có camera phù hợp.</p>}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default GuardLive;
