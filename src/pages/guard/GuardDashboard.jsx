import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Download, Info, LogIn, LogOut, RefreshCw, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import {
    buildGuardSummary,
    clearGuardGateEvents,
    exportGuardGateEventsCsv,
    getGuardGateEvents,
    guardGates,
    mockGuardGateEvent
} from '../../service/guardAccessService';

const statusClass = {
    authorized: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    denied: 'bg-red-50 text-red-700 border-red-200'
};

const popupTone = {
    success: { background: '#059669', border: '#10b981', icon: Check },
    warning: { background: '#d97706', border: '#f59e0b', icon: AlertTriangle },
    error: { background: '#dc2626', border: '#ef4444', icon: X },
    info: { background: '#003865', border: '#1d4ed8', icon: Info }
};

const GuardScanPopup = ({ notice, onClose }) => {
    if (!notice) return null;
    const tone = popupTone[notice.type] || popupTone.info;
    const Icon = tone.icon;

    return createPortal(
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                right: 24,
                bottom: 24,
                zIndex: 100000,
                width: 'min(420px, calc(100vw - 32px))',
                background: tone.background,
                color: '#fff',
                border: `1px solid ${tone.border}`,
                borderRadius: 12,
                boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12
            }}
        >
            <Icon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}>{notice.message}</p>
                {notice.detail && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, fontWeight: 600, opacity: 0.9 }}>{notice.detail}</p>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Đóng thông báo"
                style={{
                    width: 28,
                    height: 28,
                    border: 0,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                }}
            >
                <X style={{ width: 15, height: 15 }} />
            </button>
        </div>,
        document.body
    );
};

const captureFrame = (videoRef) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 360;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return null;
    }
};

const StatCard = ({ icon: Icon, label, value, helper, tone = 'blue' }) => {
    const colors = {
        blue: 'bg-blue-50 text-action-blue',
        green: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        red: 'bg-red-50 text-red-600'
    };
    return (
        <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colors[tone] || colors.blue}`}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-midnight-indigo mt-3">{value}</p>
            <p className="text-[10px] text-slate-blue font-bold uppercase tracking-wide">{label}</p>
            {helper && <p className="text-xs text-steel-gray mt-1">{helper}</p>}
        </div>
    );
};

const GuardDashboard = () => {
    const [events, setEvents] = useState(() => getGuardGateEvents());
    const [selectedGateId, setSelectedGateId] = useState(guardGates[0].id);
    const [scenario, setScenario] = useState('authorized');
    const [webcamEnabled, setWebcamEnabled] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const [scanNotice, setScanNotice] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(8);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const lastWebcamFrameRef = useRef(null);

    useEffect(() => {
        const handler = () => {
            setEvents(getGuardGateEvents());
            setPage(1);
        };
        window.addEventListener('guard-gate-events-updated', handler);
        return () => window.removeEventListener('guard-gate-events-updated', handler);
    }, []);

    const summary = useMemo(() => buildGuardSummary(events), [events]);
    const latestAlert = events.find(item => item.status === 'denied');
    const selectedGate = useMemo(
        () => guardGates.find(item => item.id === selectedGateId) || guardGates[0],
        [selectedGateId]
    );

    useEffect(() => () => {
        streamRef.current?.getTracks?.().forEach(track => track.stop());
    }, []);

    useEffect(() => {
        if (!webcamEnabled || !streamRef.current || !videoRef.current) return;
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play?.().catch(() => {});
        const timer = setTimeout(() => {
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
        }, 500);
        return () => clearTimeout(timer);
    }, [webcamEnabled]);

    useEffect(() => {
        if (!webcamEnabled) {
            lastWebcamFrameRef.current = null;
            return undefined;
        }
        const timer = setInterval(() => {
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
        }, 400);
        return () => clearInterval(timer);
    }, [webcamEnabled]);

    const toggleWebcam = async () => {
        if (webcamEnabled) {
            streamRef.current?.getTracks?.().forEach(track => track.stop());
            streamRef.current = null;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
            lastWebcamFrameRef.current = null;
            setAutoScan(false);
            setWebcamEnabled(false);
            setScanNotice({ type: 'info', message: 'Đã tắt webcam.' });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            streamRef.current = stream;
            setWebcamEnabled(true);
            setScanNotice({
                type: 'info',
                message: 'Đã bật webcam. Khi có lượt qua cổng, ảnh bằng chứng sẽ lấy từ khung hình tại thời điểm quét.'
            });
        } catch {
            setScanNotice({
                type: 'warning',
                message: 'Không mở được webcam. Hệ thống sẽ dùng cam ảo để test quét FaceID ra/vào cổng.'
            });
        }
    };

    const handleMock = useCallback(() => {
        const snapshotImageBase64 = captureFrame(videoRef) || lastWebcamFrameRef.current;
        if (webcamEnabled && !snapshotImageBase64) {
            const nextNotice = {
                type: 'warning',
                message: 'Chưa chụp được ảnh từ webcam. Vui lòng chờ camera hiển thị rõ rồi quét lại.'
            };
            setScanNotice(nextNotice);
            return;
        }

        const result = mockGuardGateEvent({ gateId: selectedGateId, scenario, snapshotImageBase64 });
        setEvents(getGuardGateEvents());
        setPage(1);
        if (!result.success) {
            const nextNotice = {
                type: 'warning',
                message: result.message || 'Không tạo nhật ký ra/vào mới.',
                detail: 'Hệ thống chỉ ghi nhận một lượt vào cho đến khi người đó được ghi nhận ra.'
            };
            setScanNotice(nextNotice);
            return;
        }

        const event = result.event;
        const isOk = event.status === 'authorized';
        const nextNotice = {
            type: isOk ? 'success' : 'error',
            message: `${event.personName} ${event.direction === 'in' ? 'vào cổng' : 'ra cổng'}: ${event.statusLabel}.`,
            detail: `${event.reason} Biển số: ${event.plateNumber || '--'}. Ảnh bằng chứng lấy từ ${snapshotImageBase64 ? 'webcam' : 'cam ảo'}.`
        };
        setScanNotice(nextNotice);
    }, [scenario, selectedGateId, webcamEnabled]);

    useEffect(() => {
        if (!autoScan) return undefined;
        handleMock();
        const timer = setInterval(handleMock, 4000);
        return () => clearInterval(timer);
    }, [autoScan, handleMock]);

    useEffect(() => {
        if (!scanNotice || scanNotice.type === 'warning' || scanNotice.type === 'error') return undefined;
        const timer = setTimeout(() => setScanNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [scanNotice]);

    const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const paginatedEvents = events.slice(pageStart, pageStart + pageSize);
    const pageEnd = Math.min(pageStart + paginatedEvents.length, events.length);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-midnight-indigo flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-action-blue" />
                        Dashboard trực cổng
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">Tự động ghi nhận ra/vào bằng FaceID và biển số, không cần thẻ hoặc QR.</p>
                </div>
                <div className="bg-white border border-platinum-tint rounded-2xl p-2 shadow-sm flex flex-wrap items-center gap-2">
                    <select
                        value={selectedGateId}
                        onChange={(event) => setSelectedGateId(event.target.value)}
                        className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                    >
                        {guardGates.map(gate => (
                            <option key={gate.id} value={gate.id}>{gate.cameraName}</option>
                        ))}
                    </select>
                    <select
                        value={scenario}
                        onChange={(event) => setScenario(event.target.value)}
                        className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                    >
                        <option value="authorized">Hợp lệ</option>
                        <option value="plate_mismatch">Sai biển số</option>
                        <option value="unknown">Người lạ</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Đang có mặt" value={summary.present} helper="Ước tính từ log vào/ra" />
                <StatCard icon={LogIn} label="Lượt vào hôm nay" value={summary.entries} helper="Tất cả cổng" tone="green" />
                <StatCard icon={LogOut} label="Lượt ra hôm nay" value={summary.exits} helper="Tất cả cổng" tone="blue" />
                <StatCard icon={AlertTriangle} label="Cảnh báo hôm nay" value={summary.alerts} helper="Người lạ/sai biển số" tone="red" />
            </div>

            {latestAlert && (
                <div className="rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center gap-4 bg-red-50 border-red-200">
                    <img src={latestAlert.snapshot} alt="Ảnh cảnh báo cổng" className="w-36 h-20 object-cover rounded-xl border border-white/70" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-midnight-indigo">Cảnh báo mới nhất: {latestAlert.personName}</p>
                        <p className="text-xs text-slate-blue mt-1">{latestAlert.reason}</p>
                        <p className="text-xs text-slate-blue mt-1">{latestAlert.gateName} · {latestAlert.timeText} · Biển số {latestAlert.plateNumber || '--'}</p>
                    </div>
                    <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[latestAlert.status]}`}>
                        {latestAlert.statusLabel}
                    </span>
                </div>
            )}

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide flex items-center gap-2">
                            <Camera className="w-5 h-5 text-action-blue" />
                            Camera FaceID cổng
                        </h2>
                        <p className="text-xs text-slate-blue mt-1">Bật webcam để test ảnh thật. Nếu không có webcam, lượt qua cổng sẽ dùng cam ảo.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={toggleWebcam} className="px-4 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                            {webcamEnabled ? 'Tắt webcam' : 'Bật webcam'}
                        </button>
                        <button type="button" onClick={handleMock} className="px-4 py-2 rounded-xl bg-midnight-indigo text-white text-xs font-bold flex items-center gap-2">
                            {selectedGate.direction === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                            Mô phỏng người qua cổng
                        </button>
                        <button type="button" onClick={() => setAutoScan(v => !v)} className={`px-4 py-2 rounded-xl text-xs font-bold ${autoScan ? 'bg-red-600 text-white' : 'bg-action-blue text-white'}`}>
                            {autoScan ? 'Dừng tự động' : 'Bật tự động quét'}
                        </button>
                    </div>
                </div>
                <div className="p-5 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
                    <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center text-white text-sm font-bold relative">
                        {webcamEnabled ? (
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300">
                                <Camera className="w-8 h-8 mb-2 text-blue-300" />
                                <span>Cam ảo FaceID cổng</span>
                            </div>
                        )}
                        {autoScan && <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-white/90 text-midnight-indigo text-[11px]">Đang tự quét {selectedGate.direction === 'in' ? 'vào' : 'ra'}</span>}
                    </div>
                    <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4">
                        <p className="text-sm font-bold text-midnight-indigo">{selectedGate.name}</p>
                        <p className="text-xs text-slate-blue mt-1">{selectedGate.cameraName} · {selectedGate.direction === 'in' ? 'Lượt vào' : 'Lượt ra'}</p>
                        <p className="mt-4 text-xs text-slate-blue">
                            Khi có người đi qua cổng, hệ thống tự xác định cổng/camera, quét FaceID và biển số, sau đó chỉ hiển thị kết quả quyền ra/vào cho bảo vệ. Người hợp lệ chỉ được ghi nhận vào một lần cho đến khi có lượt ra.
                        </p>
                    </div>
                </div>
            </div>

            <GuardScanPopup notice={scanNotice} onClose={() => setScanNotice(null)} />

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Nhật ký ra/vào khuôn viên</h2>
                        <p className="text-xs text-slate-blue mt-1">Mock camera ảo hiện tại. Khi có API camera thật, thay provider ở service là giữ nguyên màn này.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setEvents(getGuardGateEvents()); setPage(1); }} className="px-3 py-2 rounded-xl border border-platinum-tint text-slate-blue bg-white text-xs font-bold flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" /> Làm mới
                        </button>
                        <button type="button" onClick={() => exportGuardGateEventsCsv(events)} className="px-3 py-2 rounded-xl border border-blue-200 text-action-blue bg-blue-50 text-xs font-bold flex items-center gap-2">
                            <Download className="w-4 h-4" /> Xuất CSV
                        </button>
                        <button type="button" onClick={() => { setEvents(clearGuardGateEvents()); setPage(1); }} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 text-xs font-bold flex items-center gap-2">
                            <Trash2 className="w-4 h-4" /> Reset mock
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr>
                                <th className="text-left px-5 py-4">Thời gian</th>
                                <th className="text-left px-5 py-4">Người qua cổng</th>
                                <th className="text-left px-5 py-4">Cổng / camera</th>
                                <th className="text-left px-5 py-4">Biển số</th>
                                <th className="text-left px-5 py-4">Hướng</th>
                                <th className="text-left px-5 py-4">Đối chiếu</th>
                                <th className="text-left px-5 py-4">Ảnh</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedEvents.map(event => (
                                <tr key={event.id} className="border-t border-platinum-tint/70">
                                    <td className="px-5 py-4">
                                        <p className="font-bold text-midnight-indigo">{event.timeText}</p>
                                        <p className="text-xs text-slate-blue">{event.dateText}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <p className="font-bold text-midnight-indigo">{event.personName}</p>
                                        <p className="text-xs text-slate-blue">{event.personRole} · {event.personCode}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-midnight-indigo">{event.gateName}</p>
                                        <p className="text-xs text-slate-blue">{event.cameraName}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-lg border text-xs font-bold ${event.plateStatus === 'matched' ? 'bg-blue-50 text-action-blue border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {event.plateNumber || '--'}
                                        </span>
                                        <p className="text-[11px] text-slate-blue mt-1">
                                            {event.plateStatus === 'matched' ? 'Khớp hồ sơ' : event.plateStatus === 'mismatch' ? 'Không khớp' : 'Chưa xác minh'}
                                        </p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${event.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-action-blue'}`}>
                                            {event.direction === 'in' ? 'Vào' : 'Ra'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[event.status] || statusClass.denied}`}>
                                            {event.statusLabel}
                                        </span>
                                        <p className="text-xs text-slate-blue mt-1">{event.reason}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <img src={event.snapshot} alt="Ảnh quét cổng" className="w-28 h-16 object-cover rounded-lg border border-platinum-tint" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-5 py-4 border-t border-platinum-tint bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-blue">
                        <span>
                            Hiển thị <b className="text-midnight-indigo">{events.length ? pageStart + 1 : 0}-{pageEnd}</b> / <b className="text-midnight-indigo">{events.length}</b> lượt
                        </span>
                        <label className="flex items-center gap-2">
                            Số dòng
                            <select
                                value={pageSize}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value));
                                    setPage(1);
                                }}
                                className="px-2 py-1.5 rounded-lg border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo"
                            >
                                <option value={5}>5</option>
                                <option value={8}>8</option>
                                <option value={10}>10</option>
                                <option value={15}>15</option>
                            </select>
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage(value => Math.max(1, value - 1))}
                            disabled={safePage <= 1}
                            className="w-9 h-9 rounded-xl border border-platinum-tint bg-white text-slate-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 py-2 rounded-xl bg-cloud-mist text-xs font-bold text-midnight-indigo">
                            Trang {safePage}/{totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage(value => Math.min(totalPages, value + 1))}
                            disabled={safePage >= totalPages}
                            className="w-9 h-9 rounded-xl border border-platinum-tint bg-white text-slate-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GuardDashboard;
