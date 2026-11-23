import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Clock, Download, Film, ImageOff, Loader2, MapPin, Search } from 'lucide-react';
import FilterBar from '../../components/common/FilterBar';
import HlsPlayer from '../../components/camera/HlsPlayer';
import { downloadBlob } from '../../utils/cameraSnapshot';
import toast from '../../utils/toast';
import { downloadHgPlayback, getHgCameras, getHgMediaBlob, getHgPlaybackRecordings, hgPlaybackPlaylistUrl } from '../../service/hgvisionService';
import { errorMessage, NO_ZONE, zoneOf } from './GuardLive';

const MIN = 60_000;
const HOUR = 60 * MIN;
export const MAX_WINDOW_MS = 24 * HOUR;
export const MAX_DOWNLOAD_MS = HOUR;
const QUICK_RANGES = [
    { label: '15 phút', ms: 15 * MIN },
    { label: '1 giờ', ms: HOUR },
    { label: '3 giờ', ms: 3 * HOUR },
    { label: '1 ngày', ms: 24 * HOUR },
];
const SEGMENT_PAGE = 30;

const pad = (n) => String(n).padStart(2, '0');
/** Date → giá trị input datetime-local (giờ máy). */
export const toLocalInput = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
};
const fmtClock = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour12: false });
const fmtDateTime = (ms) => new Date(ms).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtDuration = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h} giờ ${m} phút`;
    if (m) return sec ? `${m} phút ${sec} giây` : `${m} phút`;
    return `${sec} giây`;
};

/** Kiểm tra khoảng tìm; trả thông báo lỗi hoặc null. */
export const validateWindow = ({ camera, from, to, now = Date.now() }) => {
    if (!camera) return 'Chọn camera cần xem lại.';
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Nhập thời gian bắt đầu và kết thúc.';
    if (from >= now) return 'Thời gian bắt đầu phải trước thời điểm hiện tại.';
    if (to <= from) return 'Thời gian kết thúc phải sau thời gian bắt đầu.';
    if (to - from > MAX_WINDOW_MS) return 'Khoảng tìm tối đa 1 ngày.';
    return null;
};

const PLAYBACK_ERROR = {
    HGVISION_NOT_FOUND: 'Không tìm thấy camera hoặc đoạn ghi trên máy chủ camera.',
};
const playbackError = (err) => PLAYBACK_ERROR[err?.error?.code] || (err?.status === 400 && err?.error?.message) || errorMessage(err);

/** Ảnh thu nhỏ đoạn ghi: tải qua BE (cần token) khi cuộn tới. */
const SegmentThumb = ({ url }) => {
    const ref = useRef(null);
    const [src, setSrc] = useState(null);
    const [failed, setFailed] = useState(!url);
    useEffect(() => {
        if (!url) return undefined;
        let alive = true;
        let objectUrl = null;
        const load = () => getHgMediaBlob(url)
            .then((res) => {
                if (!alive || !(res?.data instanceof Blob) || typeof URL.createObjectURL !== 'function') { if (alive) setFailed(true); return; }
                objectUrl = URL.createObjectURL(res.data);
                setSrc(objectUrl);
            })
            .catch(() => alive && setFailed(true));
        let observer;
        if (typeof IntersectionObserver === 'function' && ref.current) {
            observer = new IntersectionObserver((entries) => {
                if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); load(); }
            }, { rootMargin: '120px' });
            observer.observe(ref.current);
        } else {
            load();
        }
        return () => {
            alive = false;
            observer?.disconnect();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);
    return (
        <span ref={ref} className="w-24 aspect-video shrink-0 rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center">
            {src ? <img src={src} alt="" className="w-full h-full object-cover" />
                : failed ? <ImageOff className="w-4 h-4 text-white/50" />
                    : <Loader2 className="w-4 h-4 text-white/50 animate-spin" />}
        </span>
    );
};

/** Thanh thời gian của khoảng tìm: khối xanh = có ghi hình, vạch đỏ = vị trí đang phát. Bấm để tua. */
const Timeline = ({ from, to, ranges, playhead, onSeek }) => {
    const span = to - from;
    const pct = (t) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%`;
    const ticks = Array.from({ length: 5 }, (_, i) => from + (span * i) / 4);
    const click = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        onSeek(from + ((e.clientX - rect.left) / rect.width) * span);
    };
    return (
        <div>
            <div
                role="slider"
                tabIndex={0}
                aria-label="Thanh thời gian ghi hình"
                aria-valuemin={from}
                aria-valuemax={to}
                aria-valuenow={playhead ?? from}
                aria-valuetext={playhead ? fmtDateTime(playhead) : 'Chưa phát'}
                onClick={click}
                onKeyDown={(e) => {
                    if (playhead == null) return;
                    if (e.key === 'ArrowRight') onSeek(playhead + span / 50);
                    if (e.key === 'ArrowLeft') onSeek(playhead - span / 50);
                }}
                className="relative h-9 rounded-lg bg-cloud-mist border border-platinum-tint cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-action-blue/40"
            >
                {ranges.map((r) => (
                    <span
                        key={r.startMs}
                        data-testid="timeline-range"
                        className="absolute inset-y-1 rounded bg-action-blue/70"
                        style={{ left: pct(r.startMs), width: `calc(${pct(r.endMs)} - ${pct(r.startMs)})`, minWidth: 2 }}
                        title={`${fmtClock(r.startMs)} – ${fmtClock(r.endMs)}`}
                    />
                ))}
                {playhead != null && (
                    <span className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: pct(playhead) }} aria-hidden="true">
                        <span className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-red-500" />
                    </span>
                )}
            </div>
            <div className="relative h-4 mt-1 text-[10px] text-slate-blue font-mono">
                {ticks.map((t, i) => (
                    <span key={t} className={`absolute ${i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: pct(t) }}>
                        {span > 12 * HOUR ? new Date(t).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : fmtClock(t).slice(0, 5)}
                    </span>
                ))}
            </div>
        </div>
    );
};

const EmptyState = ({ title, hint, icon: Icon = Film }) => (
    <div className="aspect-video rounded-xl bg-cloud-mist/60 border border-dashed border-platinum-tint flex flex-col items-center justify-center gap-2 text-center px-6">
        <span className="w-14 h-14 rounded-2xl bg-white border border-platinum-tint flex items-center justify-center text-slate-blue"><Icon className="w-6 h-6" /></span>
        <p className="text-sm font-bold text-midnight-indigo">{title}</p>
        {hint && <p className="text-xs text-slate-blue">{hint}</p>}
    </div>
);

const GuardPlayback = () => {
    const [params, setParams] = useSearchParams();
    const [cameras, setCameras] = useState([]);
    const [camError, setCamError] = useState(null);
    const now = useMemo(() => Date.now(), []);
    const [camera, setCamera] = useState(params.get('camera') || '');
    const [fromInput, setFromInput] = useState(toLocalInput(now - 15 * MIN));
    const [toInput, setToInput] = useState(toLocalInput(now));
    const [formError, setFormError] = useState('');
    const [searching, setSearching] = useState(false);
    const [result, setResult] = useState(null); // { camera, fromMs, toMs, ranges, segments }
    const [searchError, setSearchError] = useState(null);
    const [clip, setClip] = useState(null); // { from, to } đang phát
    const [position, setPosition] = useState(null); // giây trong clip
    const [downloading, setDownloading] = useState(false);
    const [segLimit, setSegLimit] = useState(SEGMENT_PAGE);

    useEffect(() => {
        getHgCameras().then((res) => setCameras(res?.data ?? [])).catch(setCamError);
    }, []);

    const grouped = useMemo(() => {
        const zones = [...new Set(cameras.map(zoneOf))].sort((a, b) => (a === NO_ZONE) - (b === NO_ZONE) || a.localeCompare(b, 'vi'));
        return zones.map((z) => ({ zone: z, items: cameras.filter((c) => zoneOf(c) === z) }));
    }, [cameras]);
    const camInfo = cameras.find((c) => c.name === (result?.camera ?? camera));

    const applyQuick = (ms) => {
        const end = Date.now();
        setFromInput(toLocalInput(end - ms));
        setToInput(toLocalInput(end));
        setFormError('');
    };
    const activeQuick = QUICK_RANGES.find((q) => fromLocalInput(toInput) - fromLocalInput(fromInput) === q.ms)?.ms;

    const search = useCallback(async (e) => {
        e?.preventDefault();
        const from = fromLocalInput(fromInput);
        const to = Math.min(fromLocalInput(toInput), Date.now());
        const err = validateWindow({ camera, from, to });
        setFormError(err || '');
        if (err) return;
        setSearching(true);
        setSearchError(null);
        setClip(null);
        setPosition(null);
        setSegLimit(SEGMENT_PAGE);
        setParams((p) => { const n = new URLSearchParams(p); n.set('camera', camera); return n; }, { replace: true });
        try {
            const res = await getHgPlaybackRecordings({ camera, from, to });
            const data = res?.data ?? { ranges: [], segments: [] };
            setResult({ ...data, camera, fromMs: from, toMs: to });
            const first = data.ranges?.[0];
            if (first) setClip({ from: first.startMs, to: first.endMs });
        } catch (er) {
            setResult(null);
            setSearchError(er);
        } finally {
            setSearching(false);
        }
    }, [camera, fromInput, toInput, setParams]);

    // Mở từ trang camera trực tiếp (?camera=…) thì tự tìm 15 phút gần nhất.
    const autoSearched = useRef(false);
    useEffect(() => {
        if (autoSearched.current || !params.get('camera') || !cameras.length) return;
        autoSearched.current = true;
        if (cameras.some((c) => c.name === params.get('camera'))) search();
    }, [cameras, params, search]);

    const ranges = useMemo(() => result?.ranges ?? [], [result]);
    const segments = useMemo(() => {
        if (result?.segments?.length) return result.segments;
        return ranges.map((r) => ({ ...r, thumbUrl: null }));
    }, [result, ranges]);
    const playhead = clip ? clip.from + (position ?? 0) * 1000 : null;
    const totalRecorded = ranges.reduce((s, r) => s + (r.endMs - r.startMs), 0);

    const playFrom = (t) => {
        if (!ranges.length) return;
        const inRange = ranges.find((r) => t >= r.startMs && t < r.endMs);
        const target = inRange || ranges.find((r) => r.startMs > t) || ranges[ranges.length - 1];
        const from = inRange ? Math.floor(t) : target.startMs;
        setPosition(0);
        setClip({ from, to: target.endMs });
    };
    // Hết 1 khoảng ghi → tự chuyển sang khoảng kế tiếp.
    const onEnded = () => {
        const next = clip && ranges.find((r) => r.startMs >= clip.to);
        if (next) { setPosition(0); setClip({ from: next.startMs, to: next.endMs }); }
    };

    const dlFrom = clip ? Math.floor(playhead ?? clip.from) : null;
    const dlTo = clip ? Math.min(clip.to, dlFrom + MAX_DOWNLOAD_MS) : null;
    const download = async () => {
        if (!clip || downloading) return;
        setDownloading(true);
        try {
            const res = await downloadHgPlayback({ camera: result.camera, from: dlFrom, to: dlTo });
            if (!(res?.data instanceof Blob)) throw res;
            const safe = result.camera.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9_-]+/g, '_');
            const d = new Date(dlFrom);
            downloadBlob(res.data, `${safe}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.mp4`);
            toast.success(`Đã tải video ${fmtClock(dlFrom)} – ${fmtClock(dlTo)}`);
        } catch (er) {
            toast.error(playbackError(er) || 'Không tải được video.');
        } finally {
            setDownloading(false);
        }
    };

    const activeSegment = playhead != null ? segments.find((s) => playhead >= s.startMs && playhead < s.endMs) : null;

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div>
                <h1 className="text-xl font-bold text-midnight-indigo tracking-tight">Xem lại camera</h1>
                <p className="text-xs text-slate-blue mt-1">Tìm và phát lại đoạn ghi hình của camera trong khuôn viên theo khoảng thời gian.</p>
            </div>

            {camError && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{errorMessage(camError)}</div>}

            <FilterBar as="form" onSubmit={search} data-filter-grid variant="card" className="grid gap-4">
                <div className="camai-filter-field">
                    <label htmlFor="guard-playback-camera">Camera</label>
                    <select id="guard-playback-camera" value={camera} onChange={(e) => { setCamera(e.target.value); setFormError(''); }}>
                        <option value="">Chọn camera…</option>
                        {grouped.map(({ zone, items }) => (
                            <optgroup key={zone} label={zone}>
                                {items.map((c) => (
                                    <option key={c.name} value={c.name}>{c.name}{c.usingRecord === false ? ' (không ghi hình)' : ''}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="guard-playback-from">Bắt đầu</label>
                    <input id="guard-playback-from" type="datetime-local" value={fromInput} max={toInput} onChange={(e) => { setFromInput(e.target.value); setFormError(''); }} />
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="guard-playback-to">Kết thúc</label>
                    <input id="guard-playback-to" type="datetime-local" value={toInput} min={fromInput} onChange={(e) => { setToInput(e.target.value); setFormError(''); }} />
                </div>
                <div className="camai-filter-field">
                    <span className="block">Chọn nhanh</span>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl border border-platinum-tint overflow-hidden" role="group" aria-label="Chọn nhanh khoảng thời gian">
                            {QUICK_RANGES.map((q) => (
                                <button
                                    key={q.ms}
                                    type="button"
                                    aria-pressed={activeQuick === q.ms}
                                    onClick={() => applyQuick(q.ms)}
                                    className={`h-10 px-2.5 text-xs font-semibold whitespace-nowrap border-r last:border-r-0 border-platinum-tint ${activeQuick === q.ms ? 'bg-blue-50 text-action-blue' : 'bg-white text-slate-blue hover:bg-cloud-mist'}`}
                                >
                                    {q.label}
                                </button>
                            ))}
                        </div>
                        <button type="submit" data-filter-action disabled={searching} className="flex-1 h-10 px-4 bg-action-blue text-white font-semibold rounded-xl text-sm hover:bg-action-blue/90 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
                            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Tìm
                        </button>
                    </div>
                </div>
            </FilterBar>
            {formError && <p role="alert" className="-mt-2 text-xs font-semibold text-red-600">{formError}</p>}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <section aria-label="Trình phát xem lại" className="xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4 space-y-4">
                    {result && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2"><Camera className="w-5 h-5 text-action-blue" /> {result.camera}</h2>
                                <p className="text-[11px] text-slate-blue mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {camInfo && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{zoneOf(camInfo)}</span>}
                                    <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDateTime(result.fromMs)} – {fmtDateTime(result.toMs)}</span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={download}
                                disabled={!clip || downloading}
                                title={clip ? `Tải ${fmtClock(dlFrom)} – ${fmtClock(dlTo)} (tối đa 1 giờ từ vị trí đang xem)` : 'Chưa có đoạn ghi để tải'}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-platinum-tint bg-white px-2.5 text-xs font-semibold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                {downloading ? 'Đang tải…' : 'Tải video'}
                            </button>
                        </div>
                    )}

                    {searchError ? (
                        <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{playbackError(searchError)}</div>
                    ) : null}

                    {searching ? (
                        <div className="aspect-video rounded-xl bg-cloud-mist/60 flex items-center justify-center text-sm text-slate-blue gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Đang tìm đoạn ghi hình…</div>
                    ) : clip ? (
                        <HlsPlayer
                            key={`${result.camera}-${clip.from}-${clip.to}`}
                            src={hgPlaybackPlaylistUrl({ camera: result.camera, from: clip.from, to: clip.to })}
                            vod
                            controls
                            title={`${result.camera} – xem lại`}
                            onTimeUpdate={setPosition}
                            onEnded={onEnded}
                            className="aspect-video rounded-xl"
                        />
                    ) : result ? (
                        <EmptyState title="Không có đoạn ghi hình" hint={camInfo?.usingRecord === false ? 'Camera này đang tắt ghi hình trên máy chủ camera.' : 'Thử chọn khoảng thời gian khác.'} />
                    ) : (
                        <EmptyState title="Chưa có video nào" hint="Chọn camera và khoảng thời gian để tìm kiếm đoạn ghi hình." />
                    )}

                    {result && (
                        <>
                            <Timeline from={result.fromMs} to={result.toMs} ranges={ranges} playhead={playhead} onSeek={playFrom} />
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    ['Đang xem', playhead != null ? fmtClock(playhead) : '—'],
                                    ['Thời lượng có ghi', fmtDuration(totalRecorded)],
                                    ['Độ phủ', `${Math.round((totalRecorded / (result.toMs - result.fromMs)) * 100)}%`],
                                ].map(([k, v]) => (
                                    <div key={k} className="rounded-xl bg-cloud-mist border border-platinum-tint px-3 py-2">
                                        <div className="text-[11px] text-slate-blue">{k}</div>
                                        <div className="text-sm font-bold text-midnight-indigo font-mono">{v}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                <section aria-label="Danh sách đoạn ghi" className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-4">
                    <h2 className="text-base font-bold text-midnight-indigo mb-3">Đoạn ghi hình ({segments.length})</h2>
                    {!result ? (
                        <p className="text-sm text-slate-blue py-6 text-center">Kết quả tìm kiếm sẽ hiện ở đây.</p>
                    ) : segments.length === 0 ? (
                        <p className="text-sm text-slate-blue py-6 text-center">Không có đoạn ghi trong khoảng đã chọn.</p>
                    ) : (
                        <ul className="space-y-2 max-h-[640px] overflow-auto pr-1">
                            {segments.slice(0, segLimit).map((s) => {
                                const active = activeSegment === s;
                                return (
                                    <li key={`${s.startMs}-${s.endMs}`}>
                                        <button
                                            type="button"
                                            onClick={() => playFrom(s.startMs)}
                                            aria-current={active ? 'true' : undefined}
                                            className={`w-full text-left rounded-xl border p-2 flex items-center gap-3 ${active ? 'border-action-blue bg-blue-50/60' : 'border-platinum-tint hover:bg-cloud-mist'}`}
                                        >
                                            <SegmentThumb url={s.thumbUrl} />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-bold text-midnight-indigo font-mono">{fmtClock(s.startMs)} – {fmtClock(s.endMs)}</span>
                                                <span className="block text-[11px] text-slate-blue">{new Date(s.startMs).toLocaleDateString('vi-VN')} · {fmtDuration(s.endMs - s.startMs)}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                            {segments.length > segLimit && (
                                <li>
                                    <button type="button" onClick={() => setSegLimit((n) => n + SEGMENT_PAGE)} className="w-full h-9 rounded-xl border border-platinum-tint text-xs font-semibold text-action-blue hover:bg-blue-50">
                                        Xem thêm ({segments.length - segLimit})
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default GuardPlayback;
