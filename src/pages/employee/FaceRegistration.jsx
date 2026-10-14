import { AlertCircle, Check, RefreshCw, ScanFace, Shield } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserById } from '../../service/employeeServices';
import { submitBiometric, updateSelfAvatar } from '../../service/avatarService';

import { motion } from 'framer-motion';
import useFaceGuidance from '../../hooks/useFaceGuidance';

/**
 * Face Registration Component for Employee with guided webcam scan
 */
const EmployeeFaceRegistration = () => {
    const navigate = useNavigate();
    // Dùng chung cho EMPLOYEE / TEACHER / STUDENT — điều hướng về đúng khu vực đang đứng.
    const basePath = '/' + useLocation().pathname.split('/')[1];

    // Steps: 'consent' | 'scanner' | 'submitting' | 'avatar_sync' | 'success'
    const [step, setStep] = useState('consent');
    const [pdpaAgreed, setPdpaAgreed] = useState(false);
    const [consentAgreed, setConsentAgreed] = useState(false);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // API and user details
    const [currentUser, setCurrentUser] = useState(null);
    const [employeeCode, setEmployeeCode] = useState('--');

    // Webcam capture states
    const [cameraStream, setCameraStream] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    // 'guiding' (đang phân tích khung hình thật) -> 'countdown' -> 'captured'
    const [phase, setPhase] = useState('guiding');
    const [countdownVal, setCountdownVal] = useState(3);
    const [capturedFile, setCapturedFile] = useState(null);
    const [capturedPreview, setCapturedPreview] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const countdownTimerRef = useRef(null);

    useEffect(() => {
        const localUserStr = localStorage.getItem('user');
        if (localUserStr) {
            try {
                const userObj = JSON.parse(localUserStr);
                setCurrentUser(userObj);
                getUserById(userObj.id).then(res => {
                    if (res?.success && res.data) {
                        setEmployeeCode(res.data.employeeCode || res.data.studentCode || res.data.username || '--');
                    }
                }).catch(() => {});
            } catch (e) {}
        }
    }, []);

    // Stop webcam helper
    const stopWebcam = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraStream(null);
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    };

    const startWebcam = async () => {
        setCameraError(null);
        setCapturedPreview(null);
        setCapturedFile(null);
        setPhase('guiding');
        setError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            streamRef.current = stream;
            setCameraStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setCameraError('Không thể truy cập camera. Vui lòng cấp quyền sử dụng camera cho trình duyệt.');
        }
    };

    // Clean up and initialize webcam on step change
    useEffect(() => {
        if (step === 'scanner') {
            startWebcam();
        } else {
            stopWebcam();
        }
        return () => {
            stopWebcam();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // Bind stream to video element when stream is ready
    useEffect(() => {
        if (cameraStream && videoRef.current) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], 'face_register.jpg', { type: 'image/jpeg' });
                setCapturedFile(file);
                setCapturedPreview(URL.createObjectURL(blob));
                setPhase('captured');
                stopWebcam();
            }
        }, 'image/jpeg', 0.95);
    };

    const abortCountdown = () => {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
        setPhase('guiding');
    };

    const startCaptureCountdown = () => {
        if (countdownTimerRef.current) return; // đã đang đếm ngược, tránh chồng
        setPhase('countdown');
        let count = 3;
        setCountdownVal(3);
        countdownTimerRef.current = setInterval(() => {
            count -= 1;
            setCountdownVal(count);
            if (count === 0) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
                capturePhoto();
            }
        }, 1000);
    };

    // Phân tích khung hình thật (MediaPipe, chạy client-side) để hướng dẫn căn mặt —
    // thay cho setInterval hẹn giờ giả lập trước đây. Xem src/hooks/useFaceGuidance.js.
    // Lưu ý: hook vẫn phải chạy tiếp trong lúc 'countdown' (không chỉ 'guiding') để phát hiện
    // trường hợp người dùng che camera/rời khỏi khung hình giữa lúc đang đếm ngược 3-2-1.
    const { guidance, modelError } = useFaceGuidance({
        videoRef,
        active: step === 'scanner' && (phase === 'guiding' || phase === 'countdown') && !!cameraStream,
        onStable: startCaptureCountdown,
        stableFramesRequired: 8,
        intervalMs: 150
    });

    // Huỷ đếm ngược nếu mất điều kiện 'perfect' giữa chừng (che camera, mất mặt, quay đi...)
    useEffect(() => {
        if (phase === 'countdown' && guidance.state !== 'perfect') {
            abortCountdown();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, guidance.state]);

    const handleWebcamSubmit = async () => {
        if (!capturedFile) return;
        if (!consentAgreed) {
            setError('Bạn cần đồng ý cho phép sử dụng ảnh cho mục đích sinh trắc học.');
            return;
        }

        setStep('submitting');
        setError(null);
        try {
            // Step 1: Upload raw image as biometric submission
            const uploadRes = await submitBiometric(capturedFile, true);

            if (uploadRes?.success) {
                // Check if user has display avatar
                if (!currentUser?.avatarUrl) {
                    setStep('avatar_sync');
                } else {
                    setStep('success');
                }
            } else {
                setError(uploadRes?.message || uploadRes?.error?.message || 'Gửi dữ liệu khuôn mặt thất bại.');
                setStep('scanner');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Có lỗi xảy ra trong quá trình truyền tải khuôn mặt.');
            setStep('scanner');
        }
    };

    const handleSyncAvatar = async (sync) => {
        if (sync && capturedFile) {
            try {
                const res = await updateSelfAvatar(capturedFile);
                if (res?.success && res.data?.avatarUrl) {
                    const newUrl = res.data.avatarUrl;
                    if (currentUser) {
                        currentUser.avatarUrl = newUrl;
                        localStorage.setItem('user', JSON.stringify(currentUser));
                        window.dispatchEvent(new Event('storage'));
                    }
                }
            } catch (err) {
                console.error('Failed to sync avatar:', err);
            }
        }
        setStep('success');
    };

    // Bản đồ trạng thái hướng dẫn thật (từ useFaceGuidance) -> style khung/HUD hiển thị
    const guidanceState = guidance.state; // loading | no_face | low_light | too_far | too_close | off_center | perfect
    const directionLabel = { left: 'trái', right: 'phải', up: 'lên', down: 'xuống' };

    const getHudText = () => {
        if (modelError) return `⚠️ ${modelError}`;
        switch (guidanceState) {
            case 'loading': return '⏳ ĐANG TẢI MÔ HÌNH NHẬN DIỆN...';
            case 'no_face': return '⚠️ KHÔNG PHÁT HIỆN KHUÔN MẶT - VUI LÒNG NHÌN VÀO CAMERA';
            case 'low_light': return '⚠️ ÁNH SÁNG YẾU - VUI LÒNG DI CHUYỂN ĐẾN NƠI SÁNG HƠN';
            case 'too_far': return '⚠️ CHƯA ĐỦ GẦN - HÃY DI CHUYỂN LẠI GẦN HƠN';
            case 'too_close': return '⚠️ QUÁ GẦN - HÃY LÙI XA HƠN MỘT CHÚT';
            case 'off_center': return `⚠️ DI CHUYỂN SANG ${directionLabel[guidance.direction]?.toUpperCase() || ''}`;
            case 'perfect': return '✅ CỰ LY ĐẠT CHUẨN! GIỮ YÊN KHUÔN MẶT...';
            default: return '';
        }
    };

    const getOverlayClass = () => {
        if (phase === 'countdown' || guidanceState === 'perfect') {
            return 'border-solid border-emerald-500 scale-100 shadow-[0_0_20px_rgba(16,185,129,0.7)] animate-pulse-soft';
        }
        if (guidanceState === 'too_far') {
            return 'border-dashed border-yellow-500 scale-[0.8] shadow-[0_0_15px_rgba(234,179,8,0.5)]';
        }
        if (guidanceState === 'too_close') {
            return 'border-dashed border-yellow-500 scale-[1.25] shadow-[0_0_15px_rgba(234,179,8,0.5)]';
        }
        if (guidanceState === 'off_center') {
            return 'border-dashed border-yellow-500 scale-100 shadow-[0_0_15px_rgba(234,179,8,0.5)]';
        }
        if (guidanceState === 'low_light') {
            return 'border-dashed border-amber-500 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]';
        }
        // 'loading' | 'no_face'
        return 'border-dashed border-red-500 scale-95 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
            <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                    <ScanFace className="w-3.5 h-3.5" />
                    Sinh trắc học
                </span>
                <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Đăng ký dữ liệu khuôn mặt FaceID (Nhân viên)</h1>
                <p className="text-slate-blue text-sm mt-1">
                    Liên kết khuôn mặt của bạn để sử dụng tính năng điểm danh và kiểm soát ra vào phòng họp.
                </p>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3 animate-pulse-soft">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* STAGE 1: PDPA Consent */}
            {step === 'consent' && (
                <div className="bg-white p-8 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-action-blue flex-shrink-0">
                            <Shield className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-lg font-bold text-midnight-indigo">Cam kết Bảo vệ dữ liệu cá nhân (PDPA)</h2>
                            <p className="text-xs text-slate-blue">Vui lòng đọc kỹ và xác nhận sự đồng thuận trước khi đăng ký sinh trắc học</p>
                        </div>
                    </div>

                    <div className="p-4 bg-cloud-mist rounded-xl border border-outline-gray text-sm text-slate-blue leading-relaxed space-y-3 max-h-60 overflow-y-auto">
                        <p className="font-semibold text-midnight-indigo text-xs">1. Mục đích thu thập dữ liệu:</p>
                        <p className="text-xs">
                            SmarTracking thu thập hình ảnh khuôn mặt của nhân viên để chuyển đổi thành vector sinh trắc học duy nhất nhằm phục vụ các tính năng: Điểm danh tự động tại cửa phòng họp, kiểm soát ra vào bảo mật và chống giả mạo chấm công.
                        </p>
                        <p className="font-semibold text-midnight-indigo text-xs">2. Bảo mật và lưu trữ:</p>
                        <p className="text-xs">
                            Ảnh khuôn mặt gốc và vector đặc trưng được mã hóa bảo mật cấp cao, lưu trữ độc lập trên hệ thống nội bộ của doanh nghiệp và tuân thủ chặt chẽ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Chúng tôi cam kết KHÔNG chia sẻ dữ liệu này cho bên thứ ba.
                        </p>
                        <p className="font-semibold text-midnight-indigo text-xs">3. Quyền rút lại sự đồng thuận:</p>
                        <p className="text-xs">
                            Bất cứ lúc nào, nhân viên có quyền yêu cầu xóa dữ liệu khuôn mặt và hủy liên kết FaceID thông qua bộ phận Quản lý tài nguyên hệ thống hoặc Phòng Nhân sự.
                        </p>
                    </div>

                    <label className="flex items-start gap-3 p-3 rounded-xl border border-platinum-tint hover:bg-cloud-mist transition-colors cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-1 w-4 h-4 rounded text-action-blue border-platinum-tint focus:ring-action-blue"
                            checked={pdpaAgreed}
                            onChange={(e) => setPdpaAgreed(e.target.checked)}
                        />
                        <span className="text-xs text-midnight-indigo font-medium leading-relaxed">
                            Tôi đã đọc, hiểu rõ và đồng ý cho phép hệ thống SmarTracking thu thập, xử lý và lưu trữ dữ liệu sinh trắc học khuôn mặt của tôi cho các mục đích quản lý nêu trên.
                        </span>
                    </label>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => navigate(`${basePath}/profile`)}
                            className="flex-1 py-2.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all"
                        >
                            Quay lại hồ sơ
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep('scanner')}
                            disabled={!pdpaAgreed}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${
                                pdpaAgreed
                                    ? 'bg-action-blue hover:bg-glacier-blue shadow-sm'
                                    : 'bg-steel-gray cursor-not-allowed'
                            }`}
                        >
                            Bắt đầu quét khuôn mặt
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE 2: Guided Scanner View */}
            {step === 'scanner' && (
                <div className="bg-white p-8 rounded-2xl border border-platinum-tint shadow-sm-2 flex flex-col space-y-6">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-blue uppercase tracking-wider">
                            {phase === 'captured' ? 'Xác nhận khuôn mặt' : 'Quét sinh trắc học FaceID'}
                        </span>
                        {phase !== 'captured' && cameraStream && (
                            <button
                                type="button"
                                onClick={startWebcam}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-action-blue bg-action-blue/10 px-2.5 py-1 rounded-full hover:bg-action-blue/20 transition-all"
                            >
                                <RefreshCw className="w-3 h-3" /> Thiết lập lại
                            </button>
                        )}
                    </div>

                    {/* Camera Capture Box */}
                    <div className="relative w-full aspect-[4/3] max-w-md mx-auto rounded-2xl overflow-hidden bg-slate-950 border border-platinum-tint flex items-center justify-center">
                        {cameraError ? (
                            <div className="p-6 text-center text-rose-400 text-xs flex flex-col items-center gap-2">
                                <AlertCircle className="w-8 h-8" />
                                <p>{cameraError}</p>
                                <button type="button" onClick={startWebcam} className="mt-3 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold">Thử lại</button>
                            </div>
                        ) : phase === 'captured' && capturedPreview ? (
                            <img src={capturedPreview} alt="Captured Snapshot" className="w-full h-full object-cover" />
                        ) : cameraStream ? (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={`w-full h-full object-cover scale-x-[-1] transition-all duration-300 ${
                                        guidanceState === 'loading' ? 'blur-md brightness-50' : ''
                                    }`}
                                />

                                {/* Interactive Scanner Overlay HUD */}
                                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                                    <div className={`w-44 h-60 rounded-[50%] border-4 transition-all duration-500 relative flex items-center justify-center ${getOverlayClass()}`}>

                                        {(guidanceState === 'perfect' || phase === 'countdown') && (
                                            <div className="absolute inset-x-0 h-0.5 bg-emerald-400/80 shadow-[0_0_10px_#34d399] animate-scanner" />
                                        )}

                                        <div className="absolute top-0 w-2 h-2 bg-emerald-500 rounded-full -translate-y-1" />
                                        <div className="absolute bottom-0 w-2 h-2 bg-emerald-500 rounded-full translate-y-1" />
                                        <div className="absolute left-0 w-2 h-2 bg-emerald-500 rounded-full -translate-x-1" />
                                        <div className="absolute right-0 w-2 h-2 bg-emerald-500 rounded-full translate-x-1" />
                                    </div>

                                    {/* HUD instruction text — phản ánh trạng thái thật từ phân tích khung hình */}
                                    <div className="absolute bottom-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl text-center max-w-[85%] border border-white/10">
                                        <p className="text-[10px] font-bold text-white tracking-wide uppercase">
                                            {phase === 'countdown' ? `📸 CHUẨN BỊ CHỤP TRONG ${countdownVal}s` : getHudText()}
                                        </p>
                                    </div>

                                    {phase === 'countdown' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                                            <motion.span
                                                key={countdownVal}
                                                initial={{ scale: 0.5, opacity: 0 }}
                                                animate={{ scale: 1.2, opacity: 1 }}
                                                className="text-6xl font-black text-emerald-400 drop-shadow-[0_4px_12px_rgba(16,185,129,0.5)]"
                                            >
                                                {countdownVal}
                                            </motion.span>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="py-12 text-center text-slate-blue flex flex-col items-center gap-2">
                                <RefreshCw className="w-8 h-8 text-action-blue animate-spin" />
                                <span className="text-xs font-semibold mt-2">Đang kết nối webcam...</span>
                            </div>
                        )}
                    </div>

                    <canvas ref={canvasRef} className="hidden" />

                    {/* Verification Controls */}
                    {phase === 'captured' ? (
                        <div className="space-y-4 max-w-md mx-auto w-full">
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={consentAgreed}
                                    onChange={(e) => setConsentAgreed(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded border-steel-gray text-action-blue focus:ring-action-blue/30"
                                />
                                <span className="text-xs text-slate-blue leading-relaxed">
                                    Tôi đồng ý cho phép sử dụng hình ảnh vừa chụp này để liên kết với tài khoản sinh trắc học chấm công.
                                </span>
                            </label>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleWebcamSubmit}
                                    disabled={submitting || !consentAgreed}
                                    className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40"
                                >
                                    Liên kết khuôn mặt
                                </button>
                                <button
                                    type="button"
                                    onClick={startWebcam}
                                    className="px-5 py-2.5 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                                >
                                    Chụp lại
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center text-[10.5px] text-slate-blue border border-platinum-tint p-3 rounded-xl bg-cloud-mist/20 max-w-md mx-auto w-full">
                            <span>⚠️ Hãy đảm bảo ánh sáng đủ tốt và không đội mũ bảo hiểm/kính râm.</span>
                            <button
                                type="button"
                                onClick={capturePhoto}
                                disabled={!cameraStream}
                                className="px-3 py-1 bg-white border border-platinum-tint rounded-lg text-[10px] font-bold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-40"
                            >
                                Chụp
                            </button>
                        </div>
                    )}

                    {phase !== 'captured' && (
                        <button
                            type="button"
                            onClick={() => { stopWebcam(); setStep('consent'); }}
                            className="px-6 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-all max-w-[200px] mx-auto"
                        >
                            Quay lại PDPA
                        </button>
                    )}
                </div>
            )}

            {/* STAGE 3: Submitting */}
            {step === 'submitting' && (
                <div className="bg-white p-10 rounded-2xl border border-platinum-tint shadow-sm-2 flex flex-col items-center text-center space-y-6">
                    <div className="w-14 h-14 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                    <div className="space-y-2">
                        <h2 className="text-lg font-bold text-midnight-indigo">Đang liên kết dữ liệu sinh trắc học</h2>
                        <p className="text-xs text-slate-blue max-w-sm leading-relaxed">
                            Mã hóa đặc trưng vector khuôn mặt và liên kết bảo mật với tài khoản của bạn. Vui lòng giữ nguyên màn hình.
                        </p>
                    </div>
                </div>
            )}

            {/* STAGE 4: Sync Avatar Modal */}
            {step === 'avatar_sync' && (
                <div className="bg-white p-8 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-5 text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-200 flex items-center justify-center">
                        <Check className="w-8 h-8" />
                    </div>
                    <h4 className="text-base font-bold text-midnight-indigo">Liên kết khuôn mặt thành công!</h4>

                    <p className="text-sm text-slate-blue leading-relaxed max-w-sm mx-auto">
                        Hiện tại bạn chưa thiết lập ảnh đại diện hiển thị trên hệ thống. Bạn có muốn dùng chính ảnh sinh trắc học vừa chụp để làm ảnh đại diện hiển thị của mình không?
                    </p>

                    <div className="pt-4 flex gap-3 max-w-xs mx-auto">
                        <button
                            type="button"
                            onClick={() => handleSyncAvatar(true)}
                            className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                        >
                            Đồng ý sử dụng
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSyncAvatar(false)}
                            className="flex-1 py-2.5 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-all"
                        >
                            Không, để sau
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE 5: Success Notification */}
            {step === 'success' && (
                <div className="bg-white p-8 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-green-50 border-2 border-green-200 text-green-600 flex items-center justify-center mx-auto animate-float">
                        <Check className="w-8 h-8" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-midnight-indigo">Đăng ký thành công FaceID</h2>
                        <p className="text-sm text-slate-blue max-md mx-auto leading-relaxed">
                            Khuôn mặt của bạn đã được liên kết thành công vào tài khoản nhân viên. Bạn có thể sử dụng dữ liệu sinh trắc học này để điểm danh ra vào các phòng họp SmarTracking.
                        </p>
                    </div>

                    <div className="max-w-md mx-auto p-4 bg-cloud-mist rounded-xl border border-outline-gray/60 grid grid-cols-2 gap-4 text-left text-xs text-slate-blue">
                        <div>
                            <span className="block font-bold text-midnight-indigo uppercase text-[10px]">Mã nhân viên</span>
                            <span className="font-semibold text-sm mt-0.5 block">{employeeCode}</span>
                        </div>
                        <div>
                            <span className="block font-bold text-midnight-indigo uppercase text-[10px]">Trạng thái liên kết</span>
                            <span className="font-semibold text-sm text-green-600 mt-0.5 block">Đã liên kết (Active)</span>
                        </div>
                        <div>
                            <span className="block font-bold text-midnight-indigo uppercase text-[10px]">Phiên bản mô hình</span>
                            <span className="font-semibold text-sm mt-0.5 block">v2.1 (DeepFace ID)</span>
                        </div>
                        <div>
                            <span className="block font-bold text-midnight-indigo uppercase text-[10px]">Thời gian cam kết</span>
                            <span className="font-semibold text-sm mt-0.5 block">{new Date().toLocaleDateString('vi-VN')}</span>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => navigate(basePath)}
                            className="flex-1 py-2.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all"
                        >
                            Về trang chủ
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(`${basePath}/profile`)}
                            className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                        >
                            Quay lại Hồ sơ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeFaceRegistration;
