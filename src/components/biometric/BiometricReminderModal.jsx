import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getBiometricStatus, submitBiometric, updateSelfAvatar } from '../../service/avatarService';
import { Shield, Camera, Image, ArrowLeft, Check, AlertCircle, RefreshCw, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useFaceGuidance from '../../hooks/useFaceGuidance';
import BiometricUploadForm from './BiometricUploadForm';

const STATUS_LABEL = {
    not_uploaded: { label: 'Chưa nộp ảnh', badge: 'bg-amber-50 text-amber-700 border border-amber-200' },
    pending_review: { label: 'Đang chờ duyệt', badge: 'bg-blue-50 text-action-blue border border-blue-200' },
    rejected: { label: 'Bị từ chối', badge: 'bg-red-50 text-red-700 border border-red-200' },
    approved: { label: 'Đã duyệt', badge: 'bg-green-50 text-green-700 border border-green-200' },
};

const BIOMETRIC_ERROR_MAP = {
    BIOMETRIC_FILE_REQUIRED: 'Vui lòng chọn một ảnh để tải lên.',
    BIOMETRIC_FILE_TOO_LARGE: 'Ảnh vượt quá dung lượng cho phép (tối đa 5MB).',
    BIOMETRIC_FILE_TYPE_INVALID: 'Định dạng ảnh không hợp lệ. Chỉ hỗ trợ JPG, PNG, WEBP.',
    BIOMETRIC_CONSENT_REQUIRED: 'Bạn cần đồng ý cho phép sử dụng ảnh cho mục đích nhận diện khuôn mặt trước khi tiếp tục.',
    ACCOUNT_NOT_ACTIVE: 'Tài khoản của bạn hiện không ở trạng thái hoạt động.',
    BIOMETRIC_ALREADY_PENDING_REVIEW: 'Ảnh sinh trắc học của bạn đang chờ duyệt, vui lòng đợi kết quả trước khi nộp ảnh khác.',
    BIOMETRIC_STORAGE_FAILED: 'Không thể lưu ảnh vào hệ thống lưu trữ. Vui lòng thử lại.',
    BIOMETRIC_UPLOAD_FAILED: 'Có lỗi xảy ra khi xử lý ảnh. Vui lòng thử lại sau.',
};

const getBiometricErrorMessage = (err, fallback = 'Gửi ảnh sinh trắc học thất bại.') => {
    const code = err?.error?.code;
    return (code && BIOMETRIC_ERROR_MAP[code]) || err?.error?.message || err?.message || fallback;
};

const BiometricReminderModal = () => {
    const [open, setOpen] = useState(false);
    const [biometricData, setBiometricData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Modal state machine: 'options', 'confirm_avatar', 'webcam', 'confirm_avatar_sync', 'success'
    const [view, setView] = useState('options');
    const [consentAgreed, setConsentAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Current logged-in user profile info
    const [userProfile, setUserProfile] = useState(null);

    // Webcam capture states
    const [cameraStream, setCameraStream] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    // 'guiding' (đang phân tích khung hình thật) -> 'countdown' -> 'captured'
    const [phase, setPhase] = useState('guiding');
    const [countdownVal, setCountdownVal] = useState(3);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [capturedFile, setCapturedFile] = useState(null);
    const [capturedPreview, setCapturedPreview] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const countdownTimerRef = useRef(null);

    // Load user and check biometric requirement
    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const userStr = localStorage.getItem('user');
                if (!userStr) { setLoading(false); return; }
                const user = JSON.parse(userStr);
                setUserProfile(user);
                const userId = user.id || 'anon';

                const res = await getBiometricStatus();
                if (cancelled) return;
                if (res?.success && res.data) {
                    const data = res.data;
                    setBiometricData(data);

                    // Dùng `user` (đọc từ localStorage) thay vì `userProfile` state
                    // vì setState là async — userProfile vẫn là null tại thời điểm này
                    const userRoles = user.roles?.map(r => r.roleCode || r.role_code || r) || [];
                    const isAdmin = userRoles.some(r => ['SYSTEM_ADMIN', 'BUSINESS_ADMIN'].includes(r));

                    if (isAdmin) {
                        setLoading(false);
                        return; // Bỏ qua cơ chế nhắc nhở sinh trắc học đối với Admin
                    }

                    // Sử dụng chính xác cờ biometricRequired do BE trả về trong login-response
                    // kết hợp với trạng thái lấy từ API getBiometricStatus
                    const needsUpload = data.biometricReviewStatus === 'not_uploaded' || data.biometricReviewStatus === 'rejected';
                    // Đã bật lại bắt buộc đối với tất cả người dùng (trừ Admin đã chặn ở trên) nếu chưa nộp
                    const isForced = needsUpload;

                    const dismissed = sessionStorage.getItem('avatarPopupDismissed_' + userId);
                    if (!isForced && dismissed === 'true') { setLoading(false); return; }

                    if (data.shouldShowBiometricPopup === true || isForced) {
                        // Luôn mở màn hình options để user chọn phương thức (webcam/upload/avatar)
                        // Không force thẳng vào webcam — tránh kẹt khi camera unavailable
                        setView('options');
                        setOpen(true);
                    }
                }
            } catch {
                // Silent fail
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        check();
        return () => { cancelled = true; };
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



    const handleDismiss = () => {
        // Defense-in-depth: không cho đóng khi trạng thái bắt buộc nộp
        const status = biometricData?.biometricReviewStatus;
        if (status === 'not_uploaded' || status === 'rejected') return;
        try {
            if (userProfile) {
                sessionStorage.setItem('avatarPopupDismissed_' + (userProfile.id || 'anon'), 'true');
            }
        } catch {}
        stopWebcam();
        setOpen(false);
    };

    const handleUploadSuccess = () => {
        try {
            if (userProfile) {
                userProfile.biometricReviewStatus = 'pending_review';
                userProfile.shouldShowBiometricPopup = false;
                userProfile.biometricRequired = false; // Xoá cờ bắt buộc sau khi đã upload
                localStorage.setItem('user', JSON.stringify(userProfile));
                window.dispatchEvent(new Event('storage'));
            }
        } catch {}
        stopWebcam();
        setOpen(false);
    };

    // Option 1: Existing avatar submission
    const handleUseExistingAvatar = async () => {
        if (!userProfile?.avatarUrl) return;
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(userProfile.avatarUrl);
            const blob = await response.blob();
            const file = new File([blob], 'avatar_biometric.jpg', { type: blob.type || 'image/jpeg' });

            const res = await submitBiometric(file, true);
            if (res?.success) {
                handleUploadSuccess();
            } else {
                setError(res?.error?.message || 'Gửi ảnh sinh trắc học thất bại.');
            }
        } catch (err) {
            setError(getBiometricErrorMessage(err, 'Không thể tải ảnh đại diện hiện tại. Vui lòng sử dụng tính năng Chụp ảnh bằng Webcam.'));
        } finally {
            setSubmitting(false);
        }
    };

    // Option 2: Live webcam capture screen flow
    const startWebcam = async () => {
        setCameraError(null);
        setCapturedBlob(null);
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

    // Clean up and initialize webcam on view change or modal close
    useEffect(() => {
        if (view === 'webcam' && open) {
            startWebcam();
        } else {
            stopWebcam();
        }
        return () => {
            stopWebcam();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, open]);

    // Bind stream to video element when stream is ready
    useEffect(() => {
        if (cameraStream && videoRef.current) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

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
        active: view === 'webcam' && open && (phase === 'guiding' || phase === 'countdown') && !!cameraStream,
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

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d');
        // Mirror the canvas image to match webcam preview
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], 'biometric_webcam.jpg', { type: 'image/jpeg' });
                setCapturedBlob(blob);
                setCapturedFile(file);
                setCapturedPreview(URL.createObjectURL(blob));
                setPhase('captured');
                stopWebcam();
            }
        }, 'image/jpeg', 0.95);
    };

    const handleWebcamSubmit = async () => {
        if (!capturedFile) return;
        if (!consentAgreed) {
            setError('Bạn cần đồng ý cho phép sử dụng ảnh cho mục đích sinh trắc học.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const res = await submitBiometric(capturedFile, true);
            if (res?.success) {
                // If user doesn't have an avatar, show synchronization option
                if (!userProfile?.avatarUrl) {
                    setView('confirm_avatar_sync');
                } else {
                    handleUploadSuccess();
                }
            } else {
                setError(res?.error?.message || 'Gửi ảnh sinh trắc học thất bại.');
            }
        } catch (err) {
            setError(getBiometricErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    // Synchronize captured biometric photo to display avatar
    const handleSyncAvatar = async (sync) => {
        if (sync && capturedFile) {
            setSubmitting(true);
            try {
                const res = await updateSelfAvatar(capturedFile);
                if (res?.success && res.data?.avatarUrl) {
                    const newUrl = res.data.avatarUrl;
                    if (userProfile) {
                        userProfile.avatarUrl = newUrl;
                        localStorage.setItem('user', JSON.stringify(userProfile));
                        window.dispatchEvent(new Event('storage'));
                    }
                }
            } catch (err) {
                console.error('Failed to sync avatar:', err);
            } finally {
                setSubmitting(false);
            }
        }
        handleUploadSuccess();
    };

    // Chặn Escape và tất cả phím tắt có thể thoát khi modal bắt buộc
    useEffect(() => {
        if (!open) return;
        const needsUploadNow = biometricData?.biometricReviewStatus === 'not_uploaded' || biometricData?.biometricReviewStatus === 'rejected';
        if (!needsUploadNow) return;
        const handler = (e) => {
            if (e.key === 'Escape') e.preventDefault();
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [open, biometricData]);

    if (!open || loading) return null;

    const status = biometricData?.biometricReviewStatus || 'not_uploaded';
    const statusInfo = STATUS_LABEL[status] || STATUS_LABEL.not_uploaded;

    const hasAvatar = !!userProfile?.avatarUrl;

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

    const needsUpload = biometricData?.biometricReviewStatus === 'not_uploaded' || biometricData?.biometricReviewStatus === 'rejected';
    const isForced = needsUpload;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Cấu hình Sinh trắc học FaceID"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xl p-4"
        >
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-platinum-tint flex flex-col max-h-[95vh] animate-fade-in-up">
                
                {/* Header */}
                <div className="px-6 py-5 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/30">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-action-blue/10 flex items-center justify-center text-action-blue">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-midnight-indigo text-base">Cấu hình Sinh trắc học FaceID</h3>
                            <span className={`inline-block mt-0.5 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusInfo.badge}`}>
                                {statusInfo.label}
                            </span>
                        </div>
                    </div>
                    {view !== 'confirm_avatar_sync' && !isForced && (
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="p-2 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Content body */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col justify-between">
                    
                    {error && (
                        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2 animate-shake">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* PHASE 1: Choice Selection */}
                    {view === 'options' && (
                        <div className="space-y-5 py-2">
                            <p className="text-sm text-slate-blue leading-relaxed">
                                Để tham gia chấm công tự động bằng hệ thống Camera AI, bạn cần cung cấp một ảnh sinh trắc học rõ nét khuôn mặt và được ban quản trị phê duyệt.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                                {/* Option A: Use Avatar */}
                                <div 
                                    onClick={() => hasAvatar && setView('confirm_avatar')}
                                    className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-between text-center select-none group h-40 ${
                                        hasAvatar 
                                            ? 'border-platinum-tint hover:border-action-blue hover:bg-action-blue/5 cursor-pointer' 
                                            : 'border-platinum-tint/40 opacity-50 cursor-not-allowed bg-cloud-mist/10'
                                    }`}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-cloud-mist border border-platinum-tint flex items-center justify-center">
                                            {hasAvatar ? (
                                                <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <Image className="w-5 h-5 text-slate-blue/60" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-midnight-indigo text-xs">Sử dụng Ảnh đại diện</h4>
                                            <p className="text-[9.5px] text-slate-blue mt-0.5 leading-normal">Dùng ảnh hiện tại làm FaceID</p>
                                        </div>
                                    </div>
                                    {!hasAvatar && (
                                        <span className="text-[8px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Chưa có avatar</span>
                                    )}
                                </div>

                                {/* Option B: Take Camera */}
                                <div 
                                    onClick={() => setView('webcam')}
                                    className="p-4 rounded-2xl border-2 border-platinum-tint hover:border-action-blue hover:bg-action-blue/5 transition-all flex flex-col items-center justify-between text-center cursor-pointer select-none group h-40"
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-action-blue/10 flex items-center justify-center text-action-blue group-hover:scale-105 transition-transform duration-300">
                                            <Camera className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-midnight-indigo text-xs">Chụp qua Webcam</h4>
                                            <p className="text-[9.5px] text-slate-blue mt-0.5 leading-normal">Chụp ảnh trực tiếp với AI</p>
                                        </div>
                                    </div>
                                    <span className="text-[8px] text-action-blue font-bold bg-action-blue/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Hỗ trợ AI</span>
                                </div>

                                {/* Option C: Upload Image */}
                                <div 
                                    onClick={() => setView('upload')}
                                    className="p-4 rounded-2xl border-2 border-platinum-tint hover:border-emerald-500 hover:bg-emerald-50 transition-all flex flex-col items-center justify-between text-center cursor-pointer select-none group h-40"
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform duration-300">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-midnight-indigo text-xs">Tải từ thiết bị</h4>
                                            <p className="text-[9.5px] text-slate-blue mt-0.5 leading-normal">Chọn ảnh có sẵn từ máy của bạn</p>
                                        </div>
                                    </div>
                                    <span className="text-[8px] text-emerald-600 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Tệp ảnh</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PHASE 2: Confirm Existing Avatar */}
                    {view === 'confirm_avatar' && (
                        <div className="space-y-5 py-2 flex-1 flex flex-col justify-between">
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setView('options')} className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-bold text-slate-blue uppercase tracking-wider">Sử dụng ảnh đại diện hiện tại</span>
                            </div>

                            <div className="flex flex-col items-center gap-4 py-4">
                                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-action-blue/20 shadow-md">
                                    <img src={userProfile?.avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-center text-xs text-slate-blue max-w-xs">
                                    Hệ thống sẽ sử dụng ảnh đại diện hiện tại của bạn và gửi phê duyệt làm ảnh sinh trắc học FaceID.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={consentAgreed}
                                        onChange={(e) => setConsentAgreed(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-steel-gray text-action-blue focus:ring-action-blue/30"
                                    />
                                    <span className="text-xs text-slate-blue leading-relaxed">
                                        Tôi đồng ý cho phép sử dụng hình ảnh này làm ảnh sinh trắc học FaceID phục vụ nhận diện khuôn mặt chấm công.
                                    </span>
                                </label>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleUseExistingAvatar}
                                        disabled={submitting || !consentAgreed}
                                        className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40"
                                    >
                                        {submitting ? 'Đang gửi...' : 'Xác nhận nộp ảnh'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('options')}
                                        className="px-5 py-2.5 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                                    >
                                        Quay lại
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PHASE 3: Live Webcam Capture Screen */}
                    {view === 'webcam' && (
                        <div className="space-y-4 flex-1 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {phase !== 'captured' && !isForced && (
                                        <button
                                            type="button"
                                            onClick={() => { stopWebcam(); setView('options'); }}
                                            className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                        </button>
                                    )}
                                    <span className="text-xs font-bold text-slate-blue uppercase tracking-wider">
                                        {phase === 'captured' ? 'Xác nhận ảnh chụp' : 'Giao diện chụp ảnh FaceID'}
                                    </span>
                                </div>
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

                            {/* Camera Area */}
                            <div className="relative w-full max-w-[340px] aspect-[4/3] mx-auto rounded-2xl overflow-hidden bg-slate-950 border border-platinum-tint flex items-center justify-center">
                                {cameraError ? (
                                    <div className="p-6 text-center text-rose-400 text-xs flex flex-col items-center gap-2">
                                        <AlertCircle className="w-8 h-8" />
                                        <p>{cameraError}</p>
                                        <button type="button" onClick={startWebcam} className="mt-3 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold">Thử lại</button>
                                        <button type="button" onClick={() => { stopWebcam(); setView('options'); }} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold text-white/80">
                                            Chọn phương thức khác
                                        </button>
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

                                        {/* Biometric Scan Overlay Target Guides */}
                                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                                            {/* Oval Frame Mask */}
                                            <div className={`w-32 h-44 sm:w-36 sm:h-48 rounded-[50%] border-4 transition-all duration-500 relative flex items-center justify-center ${getOverlayClass()}`}>

                                                {/* High-tech Horizontal Scanning line */}
                                                {(guidanceState === 'perfect' || phase === 'countdown') && (
                                                    <div className="absolute inset-x-0 h-0.5 bg-emerald-400/80 shadow-[0_0_10px_#34d399] animate-scanner" />
                                                )}

                                                {/* Oval target dots */}
                                                <div className="absolute top-0 w-2.5 h-2.5 bg-emerald-500 rounded-full -translate-y-1.5" />
                                                <div className="absolute bottom-0 w-2.5 h-2.5 bg-emerald-500 rounded-full translate-y-1.5" />
                                                <div className="absolute left-0 w-2.5 h-2.5 bg-emerald-500 rounded-full -translate-x-1.5" />
                                                <div className="absolute right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full translate-x-1.5" />
                                            </div>

                                            {/* Guided HUD Text overlay on top of video — phản ánh trạng thái thật */}
                                            <div className="absolute bottom-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl text-center max-w-[85%] border border-white/10">
                                                <p className="text-[11px] font-bold text-white tracking-wide uppercase">
                                                    {phase === 'countdown' ? `📸 CHUẨN BỊ CHỤP TRONG ${countdownVal}s` : getHudText()}
                                                </p>
                                            </div>

                                            {/* Countdown overlay indicator */}
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

                            {/* Controls and Submission */}
                            {phase === 'captured' ? (
                                <div className="space-y-4 pt-1">
                                    <label className="flex items-start gap-2.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={consentAgreed}
                                            onChange={(e) => setConsentAgreed(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 rounded border-steel-gray text-action-blue focus:ring-action-blue/30"
                                        />
                                        <span className="text-xs text-slate-blue leading-relaxed">
                                            Tôi đồng ý cho phép sử dụng hình ảnh vừa chụp này làm ảnh sinh trắc học FaceID.
                                        </span>
                                    </label>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleWebcamSubmit}
                                            disabled={submitting || !consentAgreed}
                                            className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40"
                                        >
                                            {submitting ? 'Đang gửi...' : 'Nộp ảnh sinh trắc học'}
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
                                <div className="flex justify-between items-center text-[10.5px] text-slate-blue border border-platinum-tint p-3 rounded-xl bg-cloud-mist/20">
                                    <span>⚠️ Đảm bảo ánh sáng rõ mặt, không đeo khẩu trang/kính râm.</span>
                                    <button 
                                        type="button" 
                                        onClick={capturePhoto} 
                                        disabled={!cameraStream}
                                        className="px-3.5 py-1.5 bg-white border border-platinum-tint rounded-lg text-[10px] font-bold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-40"
                                    >
                                        Chụp thủ công
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PHASE 4: Confirm Avatar Sync (displayed if user had NO avatar previously) */}
                    {view === 'confirm_avatar_sync' && (
                        <div className="space-y-5 py-4 text-center">
                            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-200 flex items-center justify-center mb-2">
                                <Check className="w-8 h-8" />
                            </div>
                            <h4 className="text-base font-bold text-midnight-indigo">Gửi ảnh sinh trắc học thành công!</h4>
                            
                            <p className="text-sm text-slate-blue leading-relaxed max-w-sm mx-auto">
                                Hiện tại bạn chưa thiết lập ảnh đại diện hiển thị trên hệ thống. Bạn có muốn dùng chính ảnh sinh trắc học vừa chụp để làm ảnh đại diện của mình không?
                            </p>

                            <div className="pt-4 flex gap-3 max-w-xs mx-auto">
                                <button
                                    type="button"
                                    onClick={() => handleSyncAvatar(true)}
                                    disabled={submitting}
                                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                                >
                                    Đồng ý sử dụng
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSyncAvatar(false)}
                                    disabled={submitting}
                                    className="flex-1 py-2.5 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-all"
                                >
                                    Không, để sau
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PHASE 5: Upload Image from device */}
                    {view === 'upload' && (
                        <div className="space-y-4 py-2 flex-1">
                            <div className="flex items-center gap-3 mb-6">
                                <button type="button" onClick={() => setView('options')} className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-bold text-slate-blue uppercase tracking-wider">Tải ảnh từ thiết bị</span>
                            </div>
                            <BiometricUploadForm 
                                onSuccess={() => {
                                    handleUploadSuccess();
                                }}
                                onCancel={() => setView('options')}
                            />
                        </div>
                    )}

                </div>

                {/* Footer disclaimer */}
                {view === 'options' && !isForced && (
                    <div className="px-6 pb-6 pt-2 border-t border-platinum-tint flex flex-col items-center gap-3">
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="text-xs font-bold text-slate-blue hover:text-midnight-indigo underline underline-offset-2 transition-all"
                        >
                            Để tôi thực hiện sau
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default BiometricReminderModal;
