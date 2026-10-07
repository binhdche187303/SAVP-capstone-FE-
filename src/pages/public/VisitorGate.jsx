import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CheckCircle2, DoorOpen, Info, LogOut, ScanFace, VideoOff, XCircle } from 'lucide-react';
import { getVisitorLookups, scanAtGate } from '../../service/visitorService';
import VisitorAvatar from '../../components/visitor/VisitorAvatar';
import { GATE_REASON_LABELS, fmtScore } from '../../components/visitor/visitLabels';
import { registrationUrl } from '../../components/visitor/RegistrationQrCard';

// S12 (spec §12.2): màn hình thiết bị tại cổng, bản mô phỏng. Webcam chạy thật để khách hàng thấy
// trải nghiệm đứng trước camera; phần SO KHỚP khuôn mặt là giả lập — hệ thống thật dùng FaceGate/camera AI
// và tự nhận ra khách, không cần nhập mã lượt.
const SCAN_MS = process.env.NODE_ENV === 'test' ? 0 : 1100;
const RESULT_MS = 12000;

const SCENARIOS = [
    ['normal', 'Khách đến đúng hẹn'],
    ['low_score', 'Độ khớp thấp'],
    ['outside_window', 'Đến ngoài khung giờ'],
];

const RESULT_VIEW = {
    checked_in: { cls: 'bg-green-600', icon: CheckCircle2, title: 'Cho phép vào' },
    checked_out: { cls: 'bg-sky-600', icon: LogOut, title: 'Đã ghi nhận khách ra' },
    manual_review: { cls: 'bg-amber-500', icon: AlertTriangle, title: 'Vui lòng đến quầy lễ tân' },
    access_denied: { cls: 'bg-red-600', icon: XCircle, title: 'Từ chối' },
};

const fieldCls = 'w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white';
const labelCls = 'block text-[10px] font-bold uppercase text-white/60';

const VisitorGate = () => {
    const [searchParams] = useSearchParams();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const clearRef = useRef(null);
    const [cameraOn, setCameraOn] = useState(false);
    const [zones, setZones] = useState([]);
    const [zoneId, setZoneId] = useState('zone-gate-main');
    const [direction, setDirection] = useState('in');
    const [code, setCode] = useState(searchParams.get('code') || '');
    const [scenario, setScenario] = useState('normal');
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setZones(res.data.zones); });
    }, []);

    // Bật webcam ngay khi mở màn hình; không có camera thì vẫn mô phỏng được.
    useEffect(() => {
        let cancelled = false;
        const start = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) return;
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                setCameraOn(true);
            } catch {
                setCameraOn(false);
            }
        };
        start();
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            clearTimeout(clearRef.current);
        };
    }, []);

    useEffect(() => {
        if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    }, [cameraOn]);

    const takeSnapshot = () => {
        try {
            const video = videoRef.current;
            if (!cameraOn || !video?.videoWidth) return null;
            const canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 240;
            const side = Math.min(video.videoWidth, video.videoHeight);
            canvas.getContext('2d').drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, 240, 240);
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch {
            return null;
        }
    };

    const scan = async () => {
        clearTimeout(clearRef.current);
        setResult(null);
        setError(null);
        if (!code.trim()) {
            setError('Vui lòng nhập hoặc quét mã lượt khách');
            return;
        }
        setSnapshot(takeSnapshot());
        setScanning(true);
        await new Promise((resolve) => setTimeout(resolve, SCAN_MS));
        const res = await scanAtGate(code, { zoneId, direction, scenario });
        setScanning(false);
        if (!res?.success) {
            setError(res?.message || 'Không quét được');
            return;
        }
        setResult(res.data);
        clearRef.current = setTimeout(() => setResult(null), RESULT_MS);
    };

    const view = result ? RESULT_VIEW[result.outcome] : null;
    const zoneName = zones.find((z) => z.id === zoneId)?.name || 'Cổng chính';

    return (
        <div className="min-h-screen bg-midnight-indigo text-white flex flex-col">
            <header className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <DoorOpen className="w-6 h-6" />
                    <div>
                        <p className="text-lg font-bold">{zoneName}</p>
                        <p className="text-xs text-white/60">Kiểm soát khách ra vào bằng khuôn mặt</p>
                    </div>
                </div>
                <p className="flex items-center gap-2 text-[11px] text-amber-200 bg-amber-500/15 border border-amber-300/30 rounded-xl px-3 py-2 max-w-xl">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    Màn hình mô phỏng thiết bị tại cổng. Phần so khớp khuôn mặt là giả lập; hệ thống thật dùng FaceGate hoặc camera AI và tự nhận ra khách, không cần nhập mã.
                </p>
            </header>

            <main className="flex-1 grid lg:grid-cols-3 gap-6 p-6">
                <section className="lg:col-span-2 relative rounded-3xl overflow-hidden bg-black/40 border border-white/10 min-h-[360px] flex items-center justify-center">
                    {cameraOn ? (
                        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    ) : (
                        <div className="text-center text-white/50 text-sm px-8">
                            <VideoOff className="w-10 h-10 mx-auto mb-3" />
                            Chưa có hình ảnh camera. Cho phép trình duyệt dùng camera để thấy hình trực tiếp; vẫn mô phỏng được khi không có camera.
                        </div>
                    )}
                    {/* Khung ngắm khuôn mặt: chỉ hiện khi có hình camera, luôn nằm giữa khung hình */}
                    {cameraOn && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`w-56 h-72 rounded-[40%] border-4 ${scanning ? 'border-sky-300 animate-pulse' : 'border-white/50'}`} />
                        </div>
                    )}
                    {scanning && <p className="absolute bottom-6 left-0 right-0 text-center text-sm font-semibold">Đang nhận diện khuôn mặt…</p>}

                    {view && (
                        <div className={`absolute inset-0 ${view.cls} flex flex-col items-center justify-center text-center gap-4 p-8`} role="status">
                            <view.icon className="w-16 h-16" />
                            <p className="text-4xl font-bold">{view.title}</p>
                            {result.outcome === 'checked_in' && <p className="text-xl">Xin chào {result.visit.visitor.fullName}</p>}
                            {result.outcome === 'checked_out' && <p className="text-xl">Hẹn gặp lại {result.visit.visitor.fullName}</p>}
                            {result.reason && <p className="text-lg font-semibold">{GATE_REASON_LABELS[result.reason]}</p>}
                            {result.outcome === 'checked_in' && <p className="text-sm text-white/90">Đã báo {result.visit.hostName} · {result.visit.departmentName}</p>}
                            {result.outcome === 'access_denied' && result.reason === 'access_revoked' && <p className="text-sm text-white/90">Vui lòng rời khuôn viên. Chọn "Chiều ra" để ra cổng.</p>}
                            {result.outcome === 'manual_review' && <p className="text-sm text-white/90">Lễ tân sẽ xác minh và cho bạn vào.</p>}
                            <div className="flex items-center gap-5 mt-2 bg-black/20 rounded-2xl px-5 py-3">
                                <div className="text-center space-y-1">
                                    <VisitorAvatar visitor={result.visit.visitor} size={64} />
                                    <p className="text-[10px] uppercase text-white/70">Ảnh đăng ký</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold">{fmtScore(result.score)}</p>
                                    <p className="text-[10px] uppercase text-white/70">Độ khớp</p>
                                </div>
                                <div className="text-center space-y-1">
                                    {snapshot
                                        ? <img src={snapshot} alt="Ảnh camera vừa chụp" className="w-16 h-16 rounded-full object-cover border border-white/40" style={{ transform: 'scaleX(-1)' }} />
                                        : <span className="w-16 h-16 rounded-full border border-dashed border-white/50 flex items-center justify-center"><ScanFace className="w-6 h-6" /></span>}
                                    <p className="text-[10px] uppercase text-white/70">Ảnh camera</p>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                <aside className="space-y-5">
                    <div className="space-y-1">
                        <span className={labelCls}>Chiều</span>
                        <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-white/20">
                            {[['in', 'Chiều vào'], ['out', 'Chiều ra']].map(([value, label]) => (
                                <button key={value} type="button" aria-pressed={direction === value} onClick={() => setDirection(value)} className={`py-2.5 text-sm font-semibold ${direction === value ? 'bg-white text-midnight-indigo' : 'bg-white/5 text-white'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls} htmlFor="gate-code">Mã lượt khách</label>
                        <input id="gate-code" className={`${fieldCls} uppercase font-mono tracking-wider`} placeholder="VS-261008-0001" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') scan(); }} />
                        <p className="text-[11px] text-white/50">Trong bản mô phỏng, mã lượt thay cho việc camera tự nhận ra khách.</p>
                    </div>
                    <button type="button" onClick={scan} disabled={scanning} className="w-full py-3.5 rounded-xl bg-action-blue hover:bg-glacier-blue text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                        <ScanFace className="w-5 h-5" /> Quét khuôn mặt
                    </button>
                    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}

                    <details className="rounded-xl border border-white/15 bg-white/5 p-4" open>
                        <summary className="text-xs font-bold cursor-pointer">Tùy chọn mô phỏng</summary>
                        <div className="mt-3 space-y-3">
                            <div className="space-y-1">
                                <label className={labelCls} htmlFor="gate-zone">Camera đặt tại</label>
                                <select id="gate-zone" className={fieldCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                                    {zones.map((z) => <option key={z.id} value={z.id} className="text-midnight-indigo">{z.name}{z.hasFaceGate ? ' (FaceGate)' : ' (chỉ camera)'}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls} htmlFor="gate-scenario">Tình huống</label>
                                <select id="gate-scenario" className={fieldCls} value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={direction === 'out'}>
                                    {SCENARIOS.map(([value, label]) => <option key={value} value={value} className="text-midnight-indigo">{label}</option>)}
                                </select>
                            </div>
                        </div>
                    </details>

                    <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex items-center gap-4">
                        <span className="p-2 bg-white rounded-lg flex-shrink-0"><QRCodeSVG value={registrationUrl()} size={84} level="M" /></span>
                        <p className="text-xs text-white/80">
                            Chưa đăng ký? Quét mã bằng điện thoại để đăng ký, hoặc{' '}
                            <Link to="/visitor/register" className="font-semibold underline">Đăng ký tại đây</Link>.
                        </p>
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default VisitorGate;
