import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from 'lucide-react';
import { getBiometricStatus } from '../../service/avatarService';
import { BIOMETRIC_POPUP_ENABLED } from '../../config/featureFlags';
import FaceEnrollmentPanel from './FaceEnrollmentPanel';

/** Trạng thái cần đăng ký — luôn nhắc lại ở mỗi phiên đăng nhập mới. */
const needsEnrollment = (s) => s === 'not_uploaded' || s === 'rejected';

/**
 * Hộp thoại nhắc đăng ký FaceID khi vào hệ thống (bật mặc định; tắt bằng REACT_APP_BIOMETRIC_POPUP_ENABLED=false).
 * [2026-11-23] Chỉ còn quét webcam 5 góc (FaceEnrollmentPanel) — bỏ "ảnh đại diện" / "tải từ thiết bị".
 * Luôn cho đóng (không phải ai cũng có webcam/điện thoại ngay lúc đó). Đóng = hoãn trong phiên này
 * (sessionStorage); phiên đăng nhập sau sẽ nhắc lại. Ngoài ra chấm cam trên avatar + nhãn "Khuôn mặt"
 * trong menu tài khoản (FaceMenuItem) nhắc thường trực cho tới khi đăng ký xong.
 */
const BiometricReminderModal = () => {
    const [open, setOpen] = useState(false);
    const [faceState, setFaceState] = useState('not_uploaded');
    const [userId, setUserId] = useState('anon');

    useEffect(() => {
        if (!BIOMETRIC_POPUP_ENABLED) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const user = JSON.parse(localStorage.getItem('user') || 'null');
                if (!user) return;
                const roles = user.roles?.map((r) => r.roleCode || r.role_code || r) || [];
                if (roles.some((r) => ['SYSTEM_ADMIN', 'BUSINESS_ADMIN'].includes(r))) return;
                const id = user.id || 'anon';
                setUserId(id);
                const res = await getBiometricStatus();
                if (cancelled || !res?.success || !res.data) return;
                const s = res.data.biometricReviewStatus;
                setFaceState(s);
                if (sessionStorage.getItem('avatarPopupDismissed_' + id) === 'true') return;
                if (res.data.shouldShowBiometricPopup === true || needsEnrollment(s)) setOpen(true);
            } catch {
                // Silent fail
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const pending = needsEnrollment(faceState);

    const close = () => {
        try { sessionStorage.setItem('avatarPopupDismissed_' + userId, 'true'); } catch { /* ignore */ }
        setOpen(false);
    };

    // Escape = "Để tôi thực hiện sau".
    useEffect(() => {
        if (!open) return undefined;
        const handler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, userId]);

    if (!open) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Đăng ký FaceID"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xl"
        >
            <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-platinum-tint bg-white shadow-xl animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-platinum-tint bg-cloud-mist/30 px-6 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-action-blue/10 text-action-blue">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-midnight-indigo">Đăng ký FaceID</h3>
                            <p className="text-[11px] text-slate-blue">Để camera nhận diện điểm danh và ra vào khuôn viên</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Đóng"
                        className="rounded-xl p-2 text-slate-blue transition-all hover:bg-cloud-mist hover:text-midnight-indigo"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <FaceEnrollmentPanel onStateChange={setFaceState} onDone={() => setOpen(false)} />
                </div>
                <div className="border-t border-platinum-tint px-6 py-3 text-center">
                    <button
                        type="button"
                        onClick={close}
                        className="text-xs font-bold text-slate-blue underline underline-offset-2 hover:text-midnight-indigo"
                    >
                        Để tôi thực hiện sau
                    </button>
                    {pending && (
                        <p className="mt-1 text-[11px] text-steel-gray">
                            Bạn có thể đăng ký bất cứ lúc nào tại menu tài khoản → Khuôn mặt. Hệ thống sẽ nhắc lại ở lần đăng nhập sau.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default BiometricReminderModal;
