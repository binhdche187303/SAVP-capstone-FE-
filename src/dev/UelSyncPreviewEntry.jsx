import { Navigate } from 'react-router-dom';

/**
 * Chỉ có khi chạy dev với REACT_APP_UEL_SYNC_MOCK=true (route không được đăng ký ở bản production).
 * Chưa đăng nhập thì gắn phiên giả SYSTEM_ADMIN vào localStorage để xem trang Đồng bộ UEL khi BE đang tắt.
 * Đã có phiên thật thì giữ nguyên. Khi bật BE lại, phiên giả bị BE trả 401 và FE tự về trang đăng nhập.
 */
const UelSyncPreviewEntry = () => {
    if (!localStorage.getItem('accessToken')) {
        localStorage.setItem('accessToken', 'dev-preview');
        localStorage.setItem('refreshToken', 'dev-preview');
        localStorage.setItem('user', JSON.stringify({
            fullName: 'Quản trị (xem trước)',
            roles: ['SYSTEM_ADMIN'],
            permissions: ['admin.manage_config'],
        }));
    }
    return <Navigate to="/system-admin/uel-sync" replace />;
};

export default UelSyncPreviewEntry;
