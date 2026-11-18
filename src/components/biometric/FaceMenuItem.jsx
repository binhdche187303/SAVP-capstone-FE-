import { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { BIOMETRIC_STATUS_EVENT, getBiometricStatus } from '../../service/avatarService';

// Trạng thái khuôn mặt hiển thị trong menu tài khoản (giống LearningLayout của Giảng viên/Sinh viên).
export const FACE_STATUS = {
    not_uploaded: { label: 'Chưa đăng ký', className: 'bg-amber-50 text-amber-700 border-amber-200', needsAction: true },
    rejected: { label: 'Bị từ chối', className: 'bg-red-50 text-red-700 border-red-200', needsAction: true },
    pending_review: { label: 'Chờ duyệt', className: 'bg-blue-50 text-action-blue border-blue-200' },
    approved: { label: 'Đã đăng ký', className: 'bg-green-50 text-green-700 border-green-200' },
};

/** Lấy trạng thái sinh trắc học của chính người dùng; null khi chưa tải xong hoặc lỗi. */
export const useFaceStatus = () => {
    const [faceStatus, setFaceStatus] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            getBiometricStatus().then(res => {
                if (!cancelled && res?.success && res.data) {
                    setFaceStatus(res.data.biometricReviewStatus || 'not_uploaded');
                }
            }).catch(() => {});
        };
        load();
        // Tải lại khi vừa nộp ảnh, và khi quay lại tab (admin có thể vừa duyệt/từ chối).
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        window.addEventListener(BIOMETRIC_STATUS_EVENT, load);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.removeEventListener(BIOMETRIC_STATUS_EVENT, load);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);
    return faceStatus ? FACE_STATUS[faceStatus] || FACE_STATUS.not_uploaded : null;
};

/** Chấm cam trên avatar khi người dùng cần đăng ký lại khuôn mặt. */
export const FaceAlertDot = ({ faceInfo }) => (
    faceInfo?.needsAction
        ? <span title="Chưa đăng ký khuôn mặt" className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
        : null
);

/** Mục "Khuôn mặt" trong menu tài khoản. */
const FaceMenuItem = ({ faceInfo, onClick }) => (
    <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-midnight-indigo hover:bg-cloud-mist transition-colors duration-150"
    >
        <ScanFace className="w-4 h-4" />
        <span className="flex-1 whitespace-nowrap">Khuôn mặt</span>
        {faceInfo && (
            <span className={`shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${faceInfo.className}`}>
                {faceInfo.label}
            </span>
        )}
    </button>
);

export default FaceMenuItem;
