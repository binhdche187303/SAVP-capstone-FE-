import { ScanFace } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import FaceEnrollmentPanel from '../../components/biometric/FaceEnrollmentPanel';
import { getCalendarRoleLabel } from '../../utils/calendarRoleLabel';

const ROLE_LABEL = {
    '/student': 'Sinh viên',
    '/teacher': 'Giảng viên',
    '/manager': 'Quản lý',
    '/guard': 'Bảo vệ',
    '/employee': 'Nhân viên',
};

/**
 * [2026-11-23] Trang /<role>/face-register dùng chung mọi vai trò — quét webcam 5 góc (tự duyệt).
 * Cũng là trang mã QR "Dùng điện thoại" dẫn tới (qua /login?next=face).
 */
const FaceRegistration = () => {
    const navigate = useNavigate();
    const basePath = '/' + useLocation().pathname.split('/')[1];
    let roleLabel = ROLE_LABEL[basePath];
    if (basePath === '/employee') {
        try {
            roleLabel = getCalendarRoleLabel(JSON.parse(localStorage.getItem('user') || 'null')) || roleLabel;
        } catch { /* ignore */ }
    }
    const toProfile = () => navigate(basePath + '/profile');

    return (
        <div className="mx-auto max-w-2xl space-y-6 animate-fade-in-up">
            <div>
                <span data-ui-text="badge" className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-action-blue">
                    <ScanFace className="h-3.5 w-3.5" />
                    Sinh trắc học
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-midnight-indigo">
                    Đăng ký dữ liệu khuôn mặt FaceID{roleLabel ? ` (${roleLabel})` : ''}
                </h1>
                <p className="mt-1 text-sm text-slate-blue">
                    Liên kết khuôn mặt của bạn để sử dụng tính năng điểm danh và kiểm soát ra vào phòng họp.
                </p>
            </div>
            <div className="rounded-2xl border border-platinum-tint bg-white p-5 shadow-sm-2 sm:p-8">
                <FaceEnrollmentPanel onDone={toProfile} onCancel={toProfile} />
            </div>
        </div>
    );
};

export default FaceRegistration;
