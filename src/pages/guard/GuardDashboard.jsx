import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Camera, Car, CheckCircle2, Clock, LogIn, LogOut, RefreshCw, ShieldAlert, UserCheck, XCircle } from 'lucide-react';
import { acknowledgeSecurityAlert, getSecurityAlerts, resolveSecurityAlert } from '../../service/securityAlertService';
import { getAdminGateAccessLogs } from '../../service/sysAdminServices';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';
import { fetchGuardGateEvents, guardGates, scanGuardGateEvent } from '../../service/guardAccessService';
import useFaceGuidance from '../../hooks/useFaceGuidance';
import DashboardBanner from '../../components/common/DashboardBanner';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';

const REFRESH_MS = 15000;
const AUTO_SCAN_COOLDOWN_MS = 4000;
const MAX_SNAPSHOT_WIDTH = 640;
const MAX_SNAPSHOT_HEIGHT = 480;
const SNAPSHOT_JPEG_QUALITY = 0.82;
const SEVERITY_CLS = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

const formatTime = (value) => (value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--');

const alertPayload = (alert) => alert?.payload_json || {};
const getAlertLocation = (alert) => {
    const payload = alertPayload(alert);
    return payload.zoneName || payload.zone_name || alert?.zone?.zone_name || alert?.zone_name || 'Chưa xác định';
};
const getAlertCamera = (alert) => {
    const payload = alertPayload(alert);
    return payload.cameraName || payload.camera_name || payload.cameraId || payload.camera_id || 'Chưa xác định';
};
const getAlertCameraGroup = (alert) => {
    const payload = alertPayload(alert);
    return payload.cameraGroupName || payload.camera_group_name || payload.cameraGroupId || payload.camera_group_id || 'Chưa xác định';
};
const getAlertSubject = (alert) => {
    const payload = alertPayload(alert);
    return payload.visitorName || payload.fullName || payload.visitor_name || payload.code || payload.plateNumber || null;
};

const captureFrame = (videoRef) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(
        1,
        MAX_SNAPSHOT_WIDTH / video.videoWidth,
        MAX_SNAPSHOT_HEIGHT / video.videoHeight
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', SNAPSHOT_JPEG_QUALITY);
};

const getErrorMessage = (error) => error?.error?.message
    || error?.message
    || 'Không kết nối được backend hoặc backend từ chối thao tác.';

const getFaceGuidanceLabel = (guidance) => {
    switch (guidance?.state) {
        case 'perfect': return 'Đã thấy mặt';
        case 'no_face': return 'Chưa thấy khuôn mặt';
        case 'low_light': return 'Cần thêm ánh sáng';
        case 'too_far': return 'Đưa khuôn mặt lại gần';
        case 'too_close': return 'Đưa khuôn mặt ra xa';
        case 'off_center': return 'Đưa khuôn mặt vào giữa khung hình';
        default: return 'Đang tải nhận diện khuôn mặt';
    }
};

const StatCard = ({ icon: Icon, label, value, tone, to }) => {
    const body = (
        <div className={`rounded-2xl border p-5 bg-white shadow-sm-2 flex items-center gap-4 ${to ? 'hover:border-action-blue transition-colors' : ''}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tone}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-xs font-semibold text-slate-blue">{label}</p>
                <p className="text-2xl font-bold text-midnight-indigo">{value ?? '--'}</p>
            </div>
        </div>
    );
    return to ? <Link to={to} className="no-underline">{body}</Link> : body;
};

const ScanNotice = ({ notice, onClose }) => {
    if (!notice) return null;
    const ok = notice.type === 'success';
    const warn = notice.type === 'warning';
    const color = ok
        ? 'bg-emerald-600 text-white'
        : warn
            ? 'bg-amber-500 text-white'
            : 'bg-red-600 text-white';
    const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
    return (
        <div className={`rounded-2xl p-4 shadow-lg ${color} flex items-start justify-between gap-4`}>
            <div className="flex items-start gap-3">
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                    <p className="font-bold text-sm">{notice.message}</p>
                    {notice.detail && <p className="text-xs mt-1 opacity-90">{notice.detail}</p>}
                </div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">
                ×
            </button>
        </div>
    );
};

const GuardDashboard = () => {
    const [alerts, setAlerts] = useState([]);
    const [counts, setCounts] = useState({ new: null, acknowledged: null });
    const [logs, setLogs] = useState([]);
    const [traffic, setTraffic] = useState({ in: null, out: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [alertActionId, setAlertActionId] = useState(null);
    const [snapshotEventId, setSnapshotEventId] = useState(null);

    const [selectedGateId, setSelectedGateId] = useState(guardGates[0]?.id || 'main-in');
    const [scenario, setScenario] = useState('authorized');
    const [webcamEnabled, setWebcamEnabled] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [autoScan, setAutoScan] = useState(false);
    const [autoScanCooling, setAutoScanCooling] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanNotice, setScanNotice] = useState(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const lastWebcamFrameRef = useRef(null);
    const scanningRef = useRef(false);
    const autoScanCooldownTimerRef = useRef(null);

    const selectedGate = useMemo(
        () => guardGates.find(item => item.id === selectedGateId) || guardGates[0],
        [selectedGateId]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const from = startOfToday();
        try {
            const [newRes, ackRes, logRes, inRes, outRes] = await Promise.all([
                getSecurityAlerts({ status: 'new', page: 1, limit: 8 }),
                getSecurityAlerts({ status: 'acknowledged', page: 1, limit: 8 }),
                getAdminGateAccessLogs({ from, page: 1, limit: 15 }),
                getAdminGateAccessLogs({ from, direction: 'enter', page: 1, limit: 1 }),
                getAdminGateAccessLogs({ from, direction: 'leave', page: 1, limit: 1 }),
            ]);
            setAlerts([...(newRes?.data || []), ...(ackRes?.data || [])].slice(0, 8));
            setCounts({ new: newRes?.meta?.total ?? 0, acknowledged: ackRes?.meta?.total ?? 0 });
            setLogs(logRes?.data || []);
            setTraffic({ in: inRes?.meta?.total ?? 0, out: outRes?.meta?.total ?? 0 });
        } catch (err) {
            setError(err?.message || 'Không tải được dữ liệu trực cổng.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAcknowledge = async (alertId) => {
        setAlertActionId(alertId);
        try {
            await acknowledgeSecurityAlert(alertId);
            await load();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setAlertActionId(null);
        }
    };

    const handleResolve = async (alert) => {
        const note = window.prompt('Nhập ghi chú xử lý cảnh báo:', 'Đã kiểm tra và xử lý tại hiện trường');
        if (note === null) return;
        if (!note.trim()) {
            setError('Vui lòng nhập ghi chú trước khi đóng cảnh báo.');
            return;
        }
        setAlertActionId(alert.id);
        try {
            await resolveSecurityAlert(alert.id, { resolution_note: note.trim() });
            await load();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setAlertActionId(null);
        }
    };

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        return () => {
            clearInterval(timer);
            unsubscribe();
        };
    }, [load]);

    useEffect(() => () => {
        streamRef.current?.getTracks?.().forEach(track => track.stop());
        if (autoScanCooldownTimerRef.current) clearTimeout(autoScanCooldownTimerRef.current);
    }, []);

    useEffect(() => {
        if (!webcamEnabled || !streamRef.current || !videoRef.current) return undefined;
        const video = videoRef.current;
        const stream = streamRef.current;
        let readyAnnounced = false;
        const markCameraReady = () => {
            if (!video.videoWidth || !video.videoHeight) return;
            setCameraReady(true);
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
            if (readyAnnounced) return;
            readyAnnounced = true;
            setScanNotice({
                type: 'success',
                message: 'Webcam đã sẵn sàng.',
                detail: 'Bạn có thể quét thủ công hoặc bật tự động quét.'
            });
        };
        const handleTrackEnded = () => {
            setCameraReady(false);
            setAutoScan(false);
            setScanNotice({
                type: 'warning',
                message: 'Webcam đã ngắt kết nối.',
                detail: 'Vui lòng bật lại webcam trước khi tiếp tục quét.'
            });
        };

        setCameraReady(false);
        video.srcObject = stream;
        video.addEventListener('loadedmetadata', markCameraReady);
        video.addEventListener('canplay', markCameraReady);
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', handleTrackEnded));
        video.play?.().then(markCameraReady).catch(() => {});
        const timer = setInterval(() => {
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
        }, 500);
        return () => {
            clearInterval(timer);
            video.removeEventListener('loadedmetadata', markCameraReady);
            video.removeEventListener('canplay', markCameraReady);
            stream.getVideoTracks().forEach(track => track.removeEventListener('ended', handleTrackEnded));
        };
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
            setCameraReady(false);
            setAutoScan(false);
            setWebcamEnabled(false);
            setScanNotice({ type: 'warning', message: 'Đã tắt webcam.' });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: MAX_SNAPSHOT_WIDTH },
                    height: { ideal: MAX_SNAPSHOT_HEIGHT }
                },
                audio: false
            });
            streamRef.current = stream;
            setCameraReady(false);
            setWebcamEnabled(true);
            setScanNotice({
                type: 'warning',
                message: 'Đang khởi động webcam...',
                detail: 'Hệ thống sẽ mở chức năng quét khi camera có khung hình.'
            });
        } catch {
            setScanNotice({
                type: 'warning',
                message: 'Không mở được webcam.',
                detail: 'Vui lòng cấp quyền camera rồi thử lại.'
            });
        }
    };

    const handleScan = useCallback(async ({ automatic = false } = {}) => {
        if (!webcamEnabled || !cameraReady) {
            setScanNotice({
                type: 'warning',
                message: 'Webcam chưa sẵn sàng.',
                detail: 'Vui lòng bật webcam và chờ camera hiển thị rõ rồi quét lại.'
            });
            return;
        }
        if (scanningRef.current) return;
        scanningRef.current = true;
        setScanning(true);
        const snapshotImageBase64 = captureFrame(videoRef) || lastWebcamFrameRef.current;
        if (webcamEnabled && !snapshotImageBase64) {
            setScanNotice({
                type: 'warning',
                message: 'Chưa chụp được ảnh từ webcam.',
                detail: 'Vui lòng chờ camera hiển thị rõ rồi quét lại.'
            });
            scanningRef.current = false;
            setScanning(false);
            return;
        }

        try {
            const result = await scanGuardGateEvent({ gateId: selectedGateId, scenario, snapshotImageBase64 });
            await load();
            await fetchGuardGateEvents().catch(() => []);

            if (!result.success || !result.event) {
                setScanNotice({
                    type: 'warning',
                    message: result.message || 'Không tạo nhật ký ra/vào mới.',
                    detail: result.duplicate
                        ? `Camera vẫn nhận diện cùng đối tượng; hệ thống không ghi trùng. Có thể quét lại sau ${result.retryAfterSeconds || 30} giây.`
                        : 'Backend không trả event mới cho lượt quét này.'
                });
                return;
            }

            const event = result.event;
            const isOk = event.status === 'authorized';
            setScanNotice({
                type: isOk ? 'success' : 'error',
                message: `${event.personName} ${event.direction === 'in' ? 'vào cổng' : 'ra cổng'}: ${event.statusLabel}.`,
                detail: `${event.reason} Dữ liệu đã ghi vào backend. Ảnh bằng chứng lấy từ webcam. Kiểm tra: ${event.recognitionProvider === 'approved-faceid-profile' ? 'tài khoản có FaceID đã duyệt' : 'dữ liệu mô phỏng'}.`
            });
        } catch (err) {
            setScanNotice({
                type: 'error',
                message: 'Quét cổng thất bại.',
                detail: getErrorMessage(err)
            });
        } finally {
            scanningRef.current = false;
            setScanning(false);
            if (automatic) {
                setAutoScanCooling(true);
                if (autoScanCooldownTimerRef.current) clearTimeout(autoScanCooldownTimerRef.current);
                autoScanCooldownTimerRef.current = setTimeout(() => {
                    setAutoScanCooling(false);
                    autoScanCooldownTimerRef.current = null;
                }, AUTO_SCAN_COOLDOWN_MS);
            }
        }
    }, [cameraReady, load, scenario, selectedGateId, webcamEnabled]);

    const handleStableFace = useCallback(() => {
        if (!autoScan || autoScanCooling || scanningRef.current) return;
        handleScan({ automatic: true });
    }, [autoScan, autoScanCooling, handleScan]);

    const { guidance: faceGuidance, modelError: faceModelError } = useFaceGuidance({
        videoRef,
        active: webcamEnabled && cameraReady && autoScan && !scanning && !autoScanCooling,
        onStable: handleStableFace,
        stableFramesRequired: 8,
        intervalMs: 180
    });

    useEffect(() => {
        if (!scanNotice || scanNotice.type !== 'success') return undefined;
        const timer = setTimeout(() => setScanNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [scanNotice]);

    return (
        <div className="space-y-6">
            <DashboardBanner roleName="Bảo vệ" />
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Trực cổng</h1>
                    <p className="text-slate-blue text-sm mt-1">Cảnh báo cần xử lý, lượt ra vào cổng hôm nay và quét cổng bằng camera.</p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </button>
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            <ScanNotice notice={scanNotice} onClose={() => setScanNotice(null)} />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={AlertTriangle} label="Cảnh báo mới" value={counts.new} tone="bg-red-50 text-red-600" to="/guard/security-alerts?status=new" />
                <StatCard icon={Clock} label="Đang xử lý" value={counts.acknowledged} tone="bg-yellow-50 text-yellow-700" to="/guard/security-alerts?status=acknowledged" />
                <StatCard icon={LogIn} label="Lượt vào hôm nay" value={traffic.in} tone="bg-emerald-50 text-emerald-700" />
                <StatCard icon={LogOut} label="Lượt ra hôm nay" value={traffic.out} tone="bg-blue-50 text-action-blue" />
            </div>

            <section className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <Camera className="w-5 h-5 text-action-blue" /> Camera FaceID cổng
                        </h2>
                        <p className="text-xs text-slate-blue mt-1">Quét thử lượt qua cổng, BE ghi vào gate_access_logs.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select value={selectedGateId} onChange={(event) => setSelectedGateId(event.target.value)} className="px-3 py-2 rounded-xl border border-platinum-tint text-xs font-bold text-midnight-indigo bg-white">
                            {guardGates.map(gate => (
                                <option key={gate.id} value={gate.id}>{gate.name} - {gate.direction === 'in' ? 'Vào' : 'Ra'}</option>
                            ))}
                        </select>
                        <select value={scenario} onChange={(event) => setScenario(event.target.value)} className="px-3 py-2 rounded-xl border border-platinum-tint text-xs font-bold text-midnight-indigo bg-white">
                            <option value="authorized">Hợp lệ</option>
                            <option value="plate_mismatch">Sai biển số</option>
                            <option value="unknown">Người lạ</option>
                        </select>
                        <button type="button" onClick={toggleWebcam} className="px-4 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                            {webcamEnabled ? 'Tắt webcam' : 'Bật webcam'}
                        </button>
                        <button type="button" onClick={() => handleScan()} disabled={scanning || !webcamEnabled || !cameraReady} className="px-4 py-2 rounded-xl bg-midnight-indigo text-white text-xs font-bold flex items-center gap-2 disabled:opacity-60">
                            {selectedGate?.direction === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                            {scanning ? 'Đang quét...' : !webcamEnabled ? 'Bật webcam để quét' : !cameraReady ? 'Đang khởi động camera...' : 'Quét người qua cổng'}
                        </button>
                        <button type="button" onClick={() => setAutoScan(v => !v)} disabled={!webcamEnabled || !cameraReady} className={`px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-60 ${autoScan ? 'bg-red-600 text-white' : 'bg-action-blue text-white'}`}>
                            {autoScan ? 'Dừng tự động' : 'Bật tự động quét'}
                        </button>
                    </div>
                </div>
                <div className="p-5 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
                    <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center text-white text-sm font-bold relative">
                        {webcamEnabled ? (
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300">
                                <Camera className="w-8 h-8 mb-2 text-blue-300" />
                                <span>Camera FaceID chưa bật</span>
                            </div>
                        )}
                        {webcamEnabled && !cameraReady && (
                            <span className="absolute inset-x-3 bottom-3 px-2 py-1 rounded-lg bg-amber-500/90 text-white text-[11px] text-center">
                                Đang chờ khung hình từ webcam...
                            </span>
                        )}
                        {autoScan && cameraReady && (
                            <span className={`absolute top-3 left-3 px-2 py-1 rounded-lg text-[11px] font-bold ${faceGuidance.state === 'perfect' && !autoScanCooling ? 'bg-emerald-500 text-white' : 'bg-black/60 text-white'}`}>
                                {scanning
                                    ? 'Đang xử lý FaceID'
                                    : autoScanCooling
                                        ? 'Đang chờ lượt quét tiếp theo'
                                        : getFaceGuidanceLabel(faceGuidance)}
                            </span>
                        )}
                    </div>
                    <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4">
                        <p className="text-sm font-bold text-midnight-indigo">{selectedGate?.name}</p>
                        <p className="text-xs text-slate-blue mt-1">{selectedGate?.cameraName} · {selectedGate?.direction === 'in' ? 'Lượt vào' : 'Lượt ra'}</p>
                        <p className="mt-4 text-xs text-slate-blue">Bảo vệ chỉ thao tác quét và xem kết quả. Cảnh báo phát sinh sẽ xử lý trong màn Cảnh báo an ninh.</p>
                        {autoScan && (
                            <p className="mt-3 text-xs text-slate-blue">
                                Camera chỉ gửi ảnh khi khuôn mặt đủ sáng, đúng khoảng cách và ổn định. Sau mỗi lượt quét, hệ thống chờ 4 giây để hạn chế ghi trùng.
                            </p>
                        )}
                        {faceModelError && <p className="mt-3 text-xs font-semibold text-red-600">{faceModelError}</p>}
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <section className="xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" /> Cảnh báo cần xử lý
                        </h2>
                        <Link to="/guard/visitor-alerts" className="text-xs font-bold text-action-blue no-underline">Cảnh báo khách →</Link>
                    </div>
                    {alerts.length === 0 ? (
                        <p className="text-sm text-slate-blue py-8 text-center">Không có cảnh báo đang chờ.</p>
                    ) : (
                        <ul className="space-y-2">
                            {alerts.map(alert => {
                                const payload = alertPayload(alert);
                                const subject = getAlertSubject(alert);
                                const evidenceId = alert.source_event_id || payload.sourceEventId || payload.source_event_id;
                                const busy = alertActionId === alert.id;
                                return (
                                    <li key={alert.id} className="p-3 rounded-xl border border-platinum-tint space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-midnight-indigo">
                                                    {getAlertTypeLabel(alert.alert_type)}
                                                    {subject && <span className="ml-2 font-semibold text-slate-blue">· {subject}</span>}
                                                </p>
                                                <p className="text-xs text-slate-blue mt-1">{formatTime(alert.triggered_at || alert.created_at)} · {alert.status === 'new' ? 'Mới' : 'Đã tiếp nhận'}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${SEVERITY_CLS[alert.severity] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{alert.severity || 'low'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-slate-blue">
                                            <span><b className="text-midnight-indigo">Zone/cổng:</b> {getAlertLocation(alert)}</span>
                                            <span><b className="text-midnight-indigo">Nhóm camera:</b> {getAlertCameraGroup(alert)}</span>
                                            <span><b className="text-midnight-indigo">Camera:</b> {getAlertCamera(alert)}</span>
                                        </div>
                                        {(payload.detail || payload.reason || payload.message) && <p className="text-[11px] text-slate-blue">{payload.detail || payload.reason || payload.message}</p>}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {evidenceId && <button type="button" onClick={() => setSnapshotEventId(evidenceId)} className="px-2.5 py-1.5 rounded-lg border border-platinum-tint text-[11px] font-bold text-slate-blue hover:text-action-blue">Xem ảnh bằng chứng</button>}
                                            {alert.status === 'new' && <button type="button" disabled={busy} onClick={() => handleAcknowledge(alert.id)} className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold disabled:opacity-60">{busy ? 'Đang xử lý...' : 'Tiếp nhận'}</button>}
                                            {alert.status === 'acknowledged' && <button type="button" disabled={busy} onClick={() => handleResolve(alert)} className="px-2.5 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-bold disabled:opacity-60">{busy ? 'Đang xử lý...' : 'Đóng cảnh báo'}</button>}
                                            <Link to="/guard/security-alerts" className="px-2.5 py-1.5 rounded-lg border border-action-blue/30 text-action-blue text-[11px] font-bold no-underline">Mở trung tâm</Link>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="xl:col-span-3 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-action-blue" /> Ra vào cổng gần nhất
                        </h2>
                        <Link to="/guard/anpr" className="text-xs font-bold text-action-blue no-underline flex items-center gap-1">
                            <Car className="w-3.5 h-3.5" /> Xe vào ra →
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-blue border-b border-platinum-tint">
                                    <th className="py-2 pr-3">Giờ</th>
                                    <th className="py-2 pr-3">Hướng</th>
                                    <th className="py-2 pr-3">Người</th>
                                    <th className="py-2 pr-3">Biển số</th>
                                    <th className="py-2">Cổng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan={5} className="py-8 text-center text-slate-blue">Chưa có lượt ra vào hôm nay.</td></tr>
                                ) : logs.map(log => (
                                    <tr key={log.id} className="border-b border-platinum-tint/60 last:border-0">
                                        <td className="py-2 pr-3 font-mono text-xs">{formatTime(log.access_time)}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${log.direction === 'enter' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-action-blue'}`}>
                                                {log.direction === 'enter' ? 'Vào' : 'Ra'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-midnight-indigo font-semibold">{log.user?.full_name || <span className="text-slate-blue font-normal">Không xác định</span>}</td>
                                        <td className="py-2 pr-3 font-mono text-xs">{log.plate_number || '--'}</td>
                                        <td className="py-2 text-slate-blue">{log.zone_name || '--'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
            <EventSnapshotModal
                isOpen={Boolean(snapshotEventId)}
                eventId={snapshotEventId}
                onClose={() => setSnapshotEventId(null)}
            />
        </div>
    );
};

export default GuardDashboard;
