import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, User, Mail, KeyRound, AlertTriangle, Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import { getGuestInvite, sendGuestOtp, verifyGuestOtp, clearGuestSession, getGuestMeeting } from '../../service/guestService';

const ERROR_MAP = {
    GUEST_INVITE_INVALID: 'Đường link mời không hợp lệ hoặc không tồn tại.',
    GUEST_INVITE_EXPIRED: 'Đường link mời đã hết hạn.',
    GUEST_INVITE_REVOKED: 'Đường link mời đã bị thu hồi bởi người tổ chức.',
    GUEST_JOIN_WINDOW_CLOSED: 'Ngoài thời gian được phép tham dự (trước 30 phút hoặc sau khi cuộc họp kết thúc).',
    GUEST_MEETING_CANCELLED: 'Cuộc họp đã bị hủy.',
    GUEST_OTP_INVALID: 'Mã xác nhận không đúng hoặc đã hết hạn. Vui lòng thử lại.',
    GUEST_OTP_BLOCKED: 'Tài khoản tạm thời bị khóa do nhập sai mã quá nhiều lần. Vui lòng thử lại sau.',
    GUEST_OTP_TOO_MANY_REQUESTS: 'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng chờ rồi thử lại.',
};

const fmt = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
};

// 3 bước trên cùng 1 trang: info → otp → lobby
const STEP = { INFO: 'info', OTP: 'otp', LOBBY: 'lobby', ERROR: 'error' };
const OTP_DURATION = 600; // 10 phút

const GuestJoin = () => {
    const { token } = useParams();
    const navigate = useNavigate();

    const [step, setStep] = useState(STEP.INFO);
    const [invite, setInvite] = useState(null);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [otpCountdown, setOtpCountdown] = useState(OTP_DURATION);
    const [canResend, setCanResend] = useState(false);
    const [verifiedMeetingId, setVerifiedMeetingId] = useState(null);

    const countdownRef = useRef(null);
    const lobbyPollRef = useRef(null);

    // Xoá session cũ mỗi khi vào trang mời mới
    useEffect(() => {
        clearGuestSession();
    }, [token]);

    // Load thông tin lời mời
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await getGuestInvite(token);
                if (res?.success) {
                    setInvite(res.data);
                } else {
                    setError(ERROR_MAP[res?.error?.code] || 'Không thể tải thông tin lời mời.');
                    setStep(STEP.ERROR);
                }
            } catch (err) {
                const code = err?.error?.code;
                setError(ERROR_MAP[code] || 'Không thể kết nối đến máy chủ.');
                setStep(STEP.ERROR);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    const startCountdown = () => {
        setOtpCountdown(OTP_DURATION);
        setCanResend(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setOtpCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    setCanResend(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => () => {
        clearInterval(countdownRef.current);
        clearInterval(lobbyPollRef.current);
    }, []);

    const handleSendOtp = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await sendGuestOtp(token);
            if (res?.success) {
                setStep(STEP.OTP);
                startCountdown();
            } else {
                setError(ERROR_MAP[res?.error?.code] || 'Không thể gửi mã xác nhận.');
            }
        } catch (err) {
            setError(ERROR_MAP[err?.error?.code] || 'Lỗi kết nối, vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (!canResend) return;
        setError('');
        setLoading(true);
        try {
            const res = await sendGuestOtp(token);
            if (res?.success) {
                setOtp('');
                startCountdown();
            } else {
                setError(ERROR_MAP[res?.error?.code] || 'Không thể gửi lại mã.');
            }
        } catch (err) {
            setError(ERROR_MAP[err?.error?.code] || 'Lỗi kết nối.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (otp.trim().length !== 6) { setError('Vui lòng nhập đủ 6 số.'); return; }
        setLoading(true);
        setError('');
        try {
            const res = await verifyGuestOtp(token, otp.trim());
            if (res?.success) {
                clearInterval(countdownRef.current);
                if (res.data.lobbyRequired) {
                    setVerifiedMeetingId(res.data.meetingId);
                    setStep(STEP.LOBBY);
                } else {
                    navigate(`/guest/meeting/${res.data.meetingId}`);
                }
            } else {
                setError(ERROR_MAP[res?.error?.code] || 'Mã xác nhận không hợp lệ.');
            }
        } catch (err) {
            setError(ERROR_MAP[err?.error?.code] || 'Lỗi kết nối.');
        } finally {
            setLoading(false);
        }
    };

    // Poll lobby: thử gọi trang họp, nếu không còn GUEST_LOBBY_PENDING → vào thẳng
    useEffect(() => {
        if (step !== STEP.LOBBY || !verifiedMeetingId) return;
        const poll = async () => {
            try {
                const res = await getGuestMeeting(verifiedMeetingId);
                if (res?.success) {
                    clearInterval(lobbyPollRef.current);
                    navigate(`/guest/meeting/${verifiedMeetingId}`);
                }
            } catch (err) {
                const code = err?.error?.code;
                if (code === 'GUEST_LOBBY_PENDING') return; // tiếp tục chờ
                if (code === 'GUEST_SESSION_INVALID') {
                    clearInterval(lobbyPollRef.current);
                    setError('Phiên khách đã hết hạn. Vui lòng bắt đầu lại.');
                    setStep(STEP.ERROR);
                }
            }
        };
        poll();
        lobbyPollRef.current = setInterval(poll, 5000);
        return () => clearInterval(lobbyPollRef.current);
    }, [step, verifiedMeetingId, navigate]);

    const fmtCountdown = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div className="min-h-screen bg-cloud-mist flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-action-blue rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-action-blue/30">
                        <span className="text-white font-extrabold text-lg">S</span>
                    </div>
                    <p className="text-xs text-slate-blue font-medium">VISMA IVA — Cổng vào cuộc họp cho khách</p>
                </div>

                <AnimatePresence mode="wait">
                    {/* ── Đang tải ── */}
                    {loading && step === STEP.INFO && (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="bg-white border border-platinum-tint rounded-3xl p-10 shadow-sm-2 flex flex-col items-center gap-4">
                            <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
                            <p className="text-sm text-slate-blue font-medium">Đang tải thông tin lời mời...</p>
                        </motion.div>
                    )}

                    {/* ── Lỗi không phục hồi ── */}
                    {step === STEP.ERROR && (
                        <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-red-200 rounded-3xl p-8 shadow-sm-2 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                                <AlertTriangle className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-base font-extrabold text-midnight-indigo">Không thể truy cập</h2>
                                <p className="text-sm text-slate-blue mt-2">{error}</p>
                            </div>
                        </motion.div>
                    )}

                    {/* ── BƯỚC 1: Thông tin lời mời ── */}
                    {step === STEP.INFO && invite && (
                        <motion.div key="info" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-platinum-tint rounded-3xl p-8 shadow-sm-2 space-y-6">
                            <div>
                                <h2 className="text-xl font-extrabold text-midnight-indigo">{invite.meetingTitle}</h2>
                                <p className="text-xs text-slate-blue mt-1">Bạn được mời tham dự cuộc họp này</p>
                            </div>

                            <div className="bg-cloud-mist rounded-2xl p-4 space-y-3 text-sm">
                                <div className="flex items-center gap-3">
                                    <User className="w-4 h-4 text-slate-blue shrink-0" />
                                    <span className="text-slate-blue">Chủ tọa:</span>
                                    <span className="font-bold text-midnight-indigo ml-auto">{invite.hostName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-slate-blue shrink-0" />
                                    <span className="text-slate-blue">Bắt đầu:</span>
                                    <span className="font-bold text-midnight-indigo ml-auto text-right">{fmt(invite.startTime)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-slate-blue shrink-0" />
                                    <span className="text-slate-blue">Kết thúc:</span>
                                    <span className="font-bold text-midnight-indigo ml-auto text-right">{fmt(invite.endTime)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-slate-blue shrink-0" />
                                    <span className="text-slate-blue">Email:</span>
                                    <span className="font-semibold text-midnight-indigo ml-auto">{invite.maskedEmail}</span>
                                </div>
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-medium">{error}</p>
                            )}

                            <button
                                onClick={handleSendOtp}
                                disabled={loading}
                                className="w-full py-3.5 bg-action-blue hover:bg-glacier-blue disabled:opacity-60 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-action-blue/30 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                Gửi mã xác nhận qua email
                            </button>
                        </motion.div>
                    )}

                    {/* ── BƯỚC 2: Nhập OTP ── */}
                    {step === STEP.OTP && (
                        <motion.div key="otp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-platinum-tint rounded-3xl p-8 shadow-sm-2 space-y-6">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <KeyRound className="w-7 h-7 text-action-blue" />
                                </div>
                                <h2 className="text-lg font-extrabold text-midnight-indigo">Nhập mã xác nhận</h2>
                                <p className="text-xs text-slate-blue mt-1">
                                    Mã đã được gửi đến <span className="font-bold text-midnight-indigo">{invite?.maskedEmail}</span>
                                </p>
                            </div>

                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={otp}
                                onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                placeholder="000000"
                                className="w-full text-center text-3xl font-extrabold tracking-[0.5em] py-4 border-2 border-platinum-tint focus:border-action-blue rounded-2xl outline-none text-midnight-indigo bg-cloud-mist transition-colors"
                            />

                            <div className="text-center text-xs text-slate-blue">
                                {canResend ? (
                                    <button
                                        onClick={handleResendOtp}
                                        disabled={loading}
                                        className="flex items-center gap-1.5 mx-auto text-action-blue font-bold hover:underline disabled:opacity-50"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Gửi lại mã
                                    </button>
                                ) : (
                                    <span>Mã hết hạn sau <span className="font-bold text-midnight-indigo">{fmtCountdown(otpCountdown)}</span></span>
                                )}
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-medium text-center">{error}</p>
                            )}

                            <button
                                onClick={handleVerify}
                                disabled={loading || otp.length !== 6}
                                className="w-full py-3.5 bg-action-blue hover:bg-glacier-blue disabled:opacity-60 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-action-blue/30 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Xác nhận
                            </button>
                        </motion.div>
                    )}

                    {/* ── BƯỚC 3: Phòng chờ duyệt ── */}
                    {step === STEP.LOBBY && (
                        <motion.div key="lobby" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-platinum-tint rounded-3xl p-10 shadow-sm-2 text-center space-y-5">
                            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                                <Clock className="w-8 h-8 text-amber-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold text-midnight-indigo">Đang chờ host duyệt</h2>
                                <p className="text-sm text-slate-blue mt-2">
                                    Yêu cầu tham dự của bạn đã được gửi đến người tổ chức.<br />
                                    Trang sẽ tự động chuyển khi được duyệt.
                                </p>
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-blue">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Đang chờ phản hồi...
                            </div>
                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-medium">{error}</p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default GuestJoin;
