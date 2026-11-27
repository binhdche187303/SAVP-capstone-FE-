/**
 * [2026-11-23] Đăng ký FaceID bằng quét webcam 5 góc (tự duyệt) — dùng chung cho hộp thoại nhắc,
 * trang Hồ sơ và trang /<role>/face-register. Không còn "ảnh đại diện" / "tải từ thiết bị".
 *
 * Trạng thái người dùng thấy:
 * - Chưa đăng ký  → cam kết PDPA + đồng ý → quét 5 góc → TỰ GỬI (không bước xem lại ảnh) → "Quét xong"
 * - Đang xử lý    → máy chủ đang kiểm tra (1 khuôn mặt / ảnh, trùng định danh)
 * - Đã đăng ký    → Đăng ký lại (bộ mới chỉ thay khi qua kiểm tra)
 * - Cần kiểm tra  → chỉ thông báo (quản trị đang hậu kiểm)
 * - Bị gỡ         → lý do + Quét lại
 * Máy không có webcam → mã QR mở trang đăng ký trên điện thoại.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
    AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ScanFace, Shield, ShieldCheck, Smartphone, XCircle,
} from 'lucide-react';
import FaceScanner from './faceScan/FaceScanner';
import { POSE_KEYS } from './faceScan/config';
import { getBiometricStatus, submitBiometricScan } from '../../service/avatarService';

export const FACE_STATE = {
    not_uploaded: { label: 'Chưa đăng ký', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    processing: { label: 'Đang xử lý', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
    approved: { label: 'Đã đăng ký', badge: 'bg-green-50 text-green-700 border-green-200' },
    pending_review: { label: 'Cần kiểm tra', badge: 'bg-blue-50 text-action-blue border-blue-200' },
    rejected: { label: 'Bị gỡ', badge: 'bg-red-50 text-red-700 border-red-200' },
};

// [2026-11-23] Nội dung cam kết PDPA (NĐ 13/2023/NĐ-CP) — giữ nguyên văn bản pháp lý của trang đăng ký cũ.
const PDPA_COPY = {
    student: {
        purpose: 'VISMA IVA thu thập hình ảnh khuôn mặt của sinh viên để chuyển đổi thành vector sinh trắc học duy nhất nhằm phục vụ các tính năng: Điểm danh lớp học tự động, theo dõi chuyên cần và xác thực danh tính khi ra/vào khu vực học tập.',
        revoke: 'Bất cứ lúc nào, sinh viên có quyền yêu cầu xóa dữ liệu khuôn mặt và hủy liên kết FaceID thông qua bộ phận quản trị hệ thống hoặc đơn vị phụ trách học vụ.',
    },
    teacher: {
        purpose: 'VISMA IVA thu thập hình ảnh khuôn mặt của giảng viên để chuyển đổi thành vector sinh trắc học duy nhất nhằm phục vụ các tính năng: Điểm danh lớp học tự động, xác thực giảng viên phụ trách buổi học và kiểm soát ra/vào khu vực học tập.',
        revoke: 'Bất cứ lúc nào, giảng viên có quyền yêu cầu xóa dữ liệu khuôn mặt và hủy liên kết FaceID thông qua bộ phận quản trị hệ thống hoặc đơn vị phụ trách đào tạo.',
    },
    employee: {
        purpose: 'VISMA IVA thu thập hình ảnh khuôn mặt của nhân viên để chuyển đổi thành vector sinh trắc học duy nhất nhằm phục vụ các tính năng: Điểm danh tự động tại cửa phòng họp, kiểm soát ra vào bảo mật và chống giả mạo chấm công.',
        revoke: 'Bất cứ lúc nào, nhân viên có quyền yêu cầu xóa dữ liệu khuôn mặt và hủy liên kết FaceID thông qua bộ phận Quản lý tài nguyên hệ thống hoặc Phòng Nhân sự.',
    },
};
const PDPA_STORAGE = 'Ảnh khuôn mặt gốc và vector đặc trưng được mã hóa bảo mật cấp cao, lưu trữ độc lập trên hệ thống nội bộ của doanh nghiệp và tuân thủ chặt chẽ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Chúng tôi cam kết KHÔNG chia sẻ dữ liệu này cho bên thứ ba.';

/** Chọn văn bản PDPA theo vai trò của người đang đăng nhập (sinh viên / giảng viên / còn lại). */
const pdpaCopyForUser = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const roles = (user?.roles || []).map((r) => r?.roleCode || r?.role_code || r);
        if (roles.includes('STUDENT')) return PDPA_COPY.student;
        if (roles.includes('TEACHER')) return PDPA_COPY.teacher;
    } catch { /* ignore */ }
    return PDPA_COPY.employee;
};

const ERROR_MAP = {
    BIOMETRIC_NO_FACE: null, // dùng message của BE (có tên góc)
    BIOMETRIC_MULTIPLE_FACES: null,
    BIOMETRIC_SCAN_INCOMPLETE: 'Chưa đủ ảnh các góc. Vui lòng quét lại đủ 5 góc.',
    BIOMETRIC_SUBMIT_IN_PROGRESS: 'Đang xử lý lần đăng ký trước của bạn, vui lòng đợi giây lát rồi thử lại.',
    BIOMETRIC_CONSENT_REQUIRED: 'Bạn cần đồng ý cho phép sử dụng ảnh khuôn mặt trước khi tiếp tục.',
    BIOMETRIC_FILE_TOO_LARGE: 'Ảnh quá lớn. Vui lòng quét lại.',
    BIOMETRIC_FILE_TYPE_INVALID: 'Định dạng ảnh không hợp lệ. Vui lòng quét lại.',
    BIOMETRIC_STORAGE_FAILED: 'Không lưu được ảnh lên hệ thống. Vui lòng thử lại.',
    BIOMETRIC_UPLOAD_FAILED: 'Có lỗi khi xử lý ảnh. Vui lòng thử lại sau.',
    BIOMETRIC_NOT_APPLICABLE_FOR_ROLE: 'Tài khoản của bạn không cần đăng ký FaceID.',
    ACCOUNT_NOT_ACTIVE: 'Tài khoản của bạn hiện không ở trạng thái hoạt động.',
};

const errorMessage = (err) => {
    const code = err?.error?.code;
    return (code && ERROR_MAP[code]) || err?.error?.message || err?.message || 'Đăng ký FaceID thất bại. Vui lòng thử lại.';
};


/** Trạng thái hiển thị từ GET /me/biometric-status. */
const resolveState = (data) => {
    const s = data?.biometricReviewStatus;
    return FACE_STATE[s] ? s : 'not_uploaded';
};

const isTouchDevice = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** Link mở trên điện thoại: đăng nhập xong vào thẳng trang quét FaceID của vai trò. */
const phoneLink = () => `${window.location.origin}/login?next=face`;

const StateBadge = ({ state }) => (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${FACE_STATE[state].badge}`}>
        {FACE_STATE[state].label}
    </span>
);

const PhoneQr = () => (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-platinum-tint bg-cloud-mist/30 p-4 text-center">
        <div className="rounded-xl bg-white p-2 shadow-sm">
            <QRCodeSVG value={phoneLink()} size={148} />
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-slate-blue">
            Dùng camera điện thoại quét mã, đăng nhập bằng tài khoản của bạn rồi làm theo hướng dẫn quét khuôn mặt.
            Xong trên điện thoại, trang này tự cập nhật.
        </p>
    </div>
);

/**
 * @param {object} props
 * @param {(state: string) => void} [props.onStateChange] gọi khi trạng thái FaceID đổi (đã tải / vừa đăng ký)
 * @param {() => void} [props.onDone] bấm "Hoàn tất" sau khi đăng ký
 * @param {() => void} [props.onCancel] nút "Quay lại hồ sơ" ở màn cam kết PDPA (ẩn khi không truyền)
 */
const FaceEnrollmentPanel = ({ onStateChange, onDone, onCancel }) => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    // intro | scan | review | processing | result | (null = màn trạng thái)
    const [view, setView] = useState(null);
    const [consent, setConsent] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [hasCamera, setHasCamera] = useState(true);
    const [error, setError] = useState(null);
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
    const touch = useMemo(isTouchDevice, []);
    const pdpa = useMemo(pdpaCopyForUser, []);

    const load = useCallback(async () => {
        try {
            const res = await getBiometricStatus();
            if (res?.success && res.data) {
                setStatus(res.data);
                onStateChangeRef.current?.(resolveState(res.data));
                return res.data;
            }
        } catch {
            // giữ trạng thái cũ
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    useEffect(() => { load(); }, [load]);

    // Phát hiện máy không có webcam → gợi ý dùng điện thoại.
    useEffect(() => {
        const md = navigator.mediaDevices;
        if (!md?.enumerateDevices) { setHasCamera(false); return; }
        md.enumerateDevices()
            .then((ds) => setHasCamera(ds.some((d) => d.kind === 'videoinput')))
            .catch(() => {});
    }, []);

    // Đang hiện QR → kiểm tra lại định kỳ để biết người dùng đã đăng ký xong trên điện thoại.
    const qrVisible = showQr || (!hasCamera && !touch && (view === 'intro' || resolveState(status) === 'not_uploaded'));
    useEffect(() => {
        if (!qrVisible) return undefined;
        const before = status?.profile?.faceProfileId ?? null;
        const t = setInterval(async () => {
            const d = await load();
            if (d?.profile && d.profile.faceProfileId !== before) {
                setShowQr(false);
                setView(null);
            }
        }, 5000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qrVisible, status?.profile?.faceProfileId]);

    const startScan = () => {
        setError(null);
        setView('scan');
    };

    // Quét đủ 5 góc → gửi luôn (tự duyệt), không có bước xem lại ảnh.
    const handleScanComplete = async (caps) => {
        const list = POSE_KEYS.map((pose) => ({ pose, ...caps[pose] }));
        if (list.some((c) => !c.blob)) {
            setError(ERROR_MAP.BIOMETRIC_SCAN_INCOMPLETE);
            setView('intro');
            return;
        }
        setError(null);
        setView('processing');
        try {
            await submitBiometricScan(list, consent);
            setView('result');
            await load();
        } catch (err) {
            setError(errorMessage(err));
            setView('intro');
        } finally {
            // Ảnh đã gửi đi — giải phóng object URL xem trước của FaceScanner.
            list.forEach((c) => c.url && URL.revokeObjectURL(c.url));
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-blue">
                <Loader2 className="h-5 w-5 animate-spin text-action-blue" /> Đang tải trạng thái FaceID...
            </div>
        );
    }

    const state = resolveState(status);
    const profile = status?.profile ?? null;
    const errorBox = error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
        </div>
    );

    // ── Quét ────────────────────────────────────────────────────────────────
    if (view === 'scan') {
        return (
            <FaceScanner
                poses={POSE_KEYS}
                debug={debug}
                onComplete={handleScanComplete}
                onCancel={() => setView('intro')}
            />
        );
    }

    // ── Đang xử lý ──────────────────────────────────────────────────────────
    if (view === 'processing') {
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-action-blue" />
                <p className="max-w-xs text-sm text-slate-blue">Đang lưu dữ liệu khuôn mặt... Vui lòng không đóng trang.</p>
            </div>
        );
    }

    // ── Quét xong ───────────────────────────────────────────────────────────
    if (view === 'result') {
        return (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                <h4 className="text-lg font-bold text-midnight-indigo">Quét khuôn mặt hoàn tất!</h4>
                <button
                    type="button"
                    onClick={() => { setView(null); onDone?.(); }}
                    className="mt-2 rounded-xl bg-action-blue px-8 py-2.5 text-sm font-bold text-white hover:bg-glacier-blue"
                >
                    Hoàn tất
                </button>
            </div>
        );
    }

    // ── Giới thiệu + đồng ý ─────────────────────────────────────────────────
    if (view === 'intro' || state === 'not_uploaded') {
        const qrFirst = !hasCamera && !touch;
        return (
            <div className="space-y-4">
                {state !== 'not_uploaded' && (
                    <button type="button" onClick={() => setView(null)} className="text-xs font-semibold text-action-blue hover:underline">
                        ← Quay lại
                    </button>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-action-blue">
                        <Shield className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-lg font-bold text-midnight-indigo">Cam kết Bảo vệ dữ liệu cá nhân (PDPA)</h2>
                        <p className="text-xs text-slate-blue">Vui lòng đọc kỹ và xác nhận sự đồng thuận trước khi đăng ký sinh trắc học</p>
                    </div>
                </div>

                <div className="max-h-60 md:max-h-72 space-y-3 overflow-y-auto rounded-xl border border-outline-gray bg-cloud-mist p-4 text-sm leading-relaxed text-slate-blue">
                    <p data-ui-text="primary" className="text-xs font-semibold text-midnight-indigo">1. Mục đích thu thập dữ liệu:</p>
                    <p className="text-xs">{pdpa.purpose}</p>
                    <p data-ui-text="primary" className="text-xs font-semibold text-midnight-indigo">2. Bảo mật và lưu trữ:</p>
                    <p className="text-xs">{PDPA_STORAGE}</p>
                    <p data-ui-text="primary" className="text-xs font-semibold text-midnight-indigo">3. Quyền rút lại sự đồng thuận:</p>
                    <p className="text-xs">{pdpa.revoke}</p>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-platinum-tint p-3 transition-colors hover:bg-cloud-mist">
                    <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-platinum-tint text-action-blue focus:ring-action-blue"
                    />
                    <span data-ui-text="secondary" className="text-xs font-medium leading-relaxed text-midnight-indigo">
                        Tôi đã đọc, hiểu rõ và đồng ý cho phép hệ thống VISMA IVA thu thập, xử lý và lưu trữ dữ liệu sinh trắc học khuôn mặt của tôi cho các mục đích quản lý nêu trên.
                    </span>
                </label>
                </div>

                <div className="space-y-4 md:border-l md:border-platinum-tint md:pl-6">
                <p className="text-[11px] leading-relaxed text-steel-gray">
                    Camera sẽ hướng dẫn bạn quét 5 góc (thẳng, trái, phải, ngẩng, cúi) và tự chụp khi đúng tư thế — khoảng 30 giây. Ngồi nơi đủ sáng, bỏ khẩu trang / kính râm / mũ, chỉ một mình bạn trong khung hình.
                </p>
                {errorBox}
                {qrFirst ? (
                    <div className="space-y-3">
                        <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-4 w-4" /> Không tìm thấy webcam trên máy này — hãy dùng điện thoại.
                        </p>
                        <PhoneQr />
                    </div>
                ) : (
                    <>
                        <div className="flex gap-3 pt-2">
                            {onCancel && (
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 rounded-xl border border-platinum-tint py-2.5 text-sm font-semibold text-slate-blue transition-all hover:bg-cloud-mist"
                                >
                                    Quay lại hồ sơ
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={startScan}
                                disabled={!consent}
                                className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all ${
                                    consent ? 'bg-action-blue shadow-sm hover:bg-glacier-blue' : 'cursor-not-allowed bg-steel-gray'
                                }`}
                            >
                                Bắt đầu quét khuôn mặt
                            </button>
                        </div>
                        {!touch && (
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => setShowQr((v) => !v)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-blue hover:text-action-blue"
                                >
                                    <Smartphone className="h-3.5 w-3.5" /> {showQr ? 'Ẩn mã QR' : 'Máy không có webcam? Dùng điện thoại'}
                                </button>
                            </div>
                        )}
                        {showQr && <PhoneQr />}
                    </>
                )}
                </div>
                </div>
            </div>
        );
    }

    // ── Màn trạng thái: Đã đăng ký / Cần kiểm tra / Bị gỡ ────────────────────
    const submittedAt = profile?.submittedAt ? new Date(profile.submittedAt).toLocaleString('vi-VN') : null;
    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    state === 'approved' ? 'bg-emerald-50 text-emerald-600' : state === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-action-blue'
                }`}
                >
                    {state === 'approved' ? <ShieldCheck className="h-5 w-5" /> : state === 'rejected' ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-midnight-indigo">FaceID</h4>
                        <StateBadge state={state} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-blue">
                        {state === 'approved' && 'Khuôn mặt đã sẵn sàng để camera nhận diện.'}
                        {state === 'pending_review' && 'Quản trị viên đang kiểm tra hồ sơ khuôn mặt của bạn. Bạn chưa cần làm gì thêm.'}
                        {state === 'rejected' && 'Hồ sơ khuôn mặt của bạn đã bị gỡ. Vui lòng quét lại.'}
                        {submittedAt && <span className="block text-[11px] text-slate-blue/70">Đăng ký lúc {submittedAt}</span>}
                    </p>
                </div>
            </div>
            {profile?.reason && state !== 'approved' && (
                <div className={`rounded-xl border p-3 text-xs ${state === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-action-blue'}`}>
                    <span className="font-bold">{state === 'rejected' ? 'Lý do gỡ: ' : 'Lý do: '}</span>{profile.reason}
                </div>
            )}
            {state === 'approved' && (
                <>
                    <button
                        type="button"
                        onClick={() => { setConsent(false); setView('intro'); }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-platinum-tint bg-white py-2.5 text-xs font-bold text-midnight-indigo hover:bg-cloud-mist"
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Đăng ký lại
                    </button>
                    <p className="text-center text-[11px] text-slate-blue/80">Bộ ảnh mới chỉ thay bộ hiện tại khi qua kiểm tra.</p>
                </>
            )}
            {state === 'rejected' && (
                <button
                    type="button"
                    onClick={() => { setConsent(false); setView('intro'); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-action-blue py-3 text-sm font-bold text-white hover:bg-glacier-blue"
                >
                    <ScanFace className="h-4 w-4" /> Quét lại
                </button>
            )}
        </div>
    );
};

export default FaceEnrollmentPanel;
