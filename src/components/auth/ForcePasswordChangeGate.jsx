import { useEffect, useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

export const MUST_CHANGE_PASSWORD_EVENT = 'auth-must-change-password';

/** Đã đăng nhập và tài khoản đang bị đánh dấu phải đổi mật khẩu (cờ từ lúc đăng nhập)? */
const storedUserMustChange = () => {
    if (!localStorage.getItem('accessToken')) return false;
    try {
        return JSON.parse(localStorage.getItem('user') || 'null')?.mustChangePassword === true;
    } catch {
        return false;
    }
};

/**
 * Bắt buộc đổi mật khẩu (tài khoản được cấp/import với mật khẩu tạm).
 * Mở hộp thoại KHÔNG đóng được khi:
 *  - đăng nhập xong mà user.mustChangePassword = true, hoặc
 *  - bất kỳ API nào trả 403 MUST_CHANGE_PASSWORD (request.js phát sự kiện).
 */
const ForcePasswordChangeGate = () => {
    const [open, setOpen] = useState(storedUserMustChange);

    useEffect(() => {
        const onMustChange = () => setOpen(true);
        window.addEventListener(MUST_CHANGE_PASSWORD_EVENT, onMustChange);
        return () => window.removeEventListener(MUST_CHANGE_PASSWORD_EVENT, onMustChange);
    }, []);

    if (!open || !localStorage.getItem('accessToken')) return null;
    return <ChangePasswordModal isOpen forced onClose={() => {}} />;
};

export default ForcePasswordChangeGate;
