import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, AlertTriangle, Eye, EyeOff, CheckCircle, Check, X } from 'lucide-react';
import { changePassword } from '../../service/authService';

/**
 * forced = true: tài khoản bắt buộc đổi mật khẩu (mật khẩu tạm do quản trị cấp/import).
 * Không cho đóng; đổi xong backend thu hồi mọi phiên → đưa về trang đăng nhập.
 */
const ChangePasswordModal = ({ isOpen, onClose, forced = false }) => {
    const [formData, setFormData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    if (!isOpen) return null;

    // Password criteria analysis
    const hasMinLength = formData.newPassword.length >= 8;
    const hasUppercase = /[A-Z]/.test(formData.newPassword);
    const hasLowercase = /[a-z]/.test(formData.newPassword);
    const hasDigit = /[0-9]/.test(formData.newPassword);
    const hasSpecial = /[@$!%*?&\-_#^()+={}[\]|\\:;<>,.?/`~'"]/.test(formData.newPassword);

    const getStrength = () => {
        if (!formData.newPassword) return { score: 0, label: 'Chưa nhập', color: 'bg-slate-200', textColor: 'text-slate-400' };
        let score = 0;
        if (hasMinLength) score++;
        if (hasUppercase) score++;
        if (hasLowercase) score++;
        if (hasDigit) score++;
        if (hasSpecial) score++;

        if (score <= 2) return { score, label: 'Yếu', color: 'bg-red-500', textColor: 'text-red-500' };
        if (score <= 4) return { score, label: 'Trung bình', color: 'bg-amber-500', textColor: 'text-amber-500' };
        return { score, label: 'Mạnh', color: 'bg-green-500', textColor: 'text-green-500' };
    };

    const strength = getStrength();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        // Validation
        if (!formData.oldPassword || !formData.newPassword || !formData.confirmPassword) {
            setError('Vui lòng điền đầy đủ các trường.');
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
            return;
        }

        if (!hasMinLength || !hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
            setError('Mật khẩu mới chưa đáp ứng đủ các quy tắc bảo mật.');
            return;
        }

        if (formData.oldPassword === formData.newPassword) {
            setError('Mật khẩu mới không được giống mật khẩu hiện tại.');
            return;
        }

        setLoading(true);
        try {
            // BE ChangePasswordDto: { currentPassword, newPassword, confirmPassword }
            const res = await changePassword(formData.oldPassword, formData.newPassword, formData.confirmPassword);
            if (res?.success) {
                setSuccessMessage(forced ? 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại bằng mật khẩu mới.' : 'Đổi mật khẩu thành công!');
                // Clear form
                setFormData({ oldPassword: '', newPassword: '', confirmPassword: '' });
                // Tự đóng sau 2 giây
                setTimeout(() => {
                    if (forced) {
                        window.dispatchEvent(new Event('auth-expired'));
                        return;
                    }
                    onClose();
                    setSuccessMessage(null);
                }, 2000);
            } else {
                setError(res?.error?.message || res?.message || 'Đổi mật khẩu thất bại.');
            }
        } catch (err) {
            setError(err?.message || 'Có lỗi xảy ra khi đổi mật khẩu.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                    <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                        <Lock className="w-5 h-5 text-action-blue" />
                        Đổi mật khẩu
                    </h3>
                    {!forced && (
                    <button 
                        onClick={onClose} 
                        disabled={loading}
                        className="text-slate-blue hover:text-midnight-indigo transition-colors"
                    >
                        ✕
                    </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {forced && (
                        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
                            Tài khoản của bạn đang dùng mật khẩu tạm. Vui lòng đặt mật khẩu mới để tiếp tục sử dụng hệ thống.
                        </div>
                    )}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start text-sm animate-fade-in-up">
                            <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-start text-sm font-medium animate-fade-in-up">
                            <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                            <p>{successMessage}</p>
                        </div>
                    )}

                    {/* Old Password */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                            Mật khẩu hiện tại <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <input 
                                required 
                                type={showOldPassword ? "text" : "password"} 
                                value={formData.oldPassword} 
                                onChange={e => setFormData({...formData, oldPassword: e.target.value})} 
                                className="w-full pl-3 pr-10 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" 
                                placeholder="Nhập mật khẩu hiện tại" 
                            />
                            <button 
                                type="button"
                                onClick={() => setShowOldPassword(!showOldPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-blue hover:text-midnight-indigo"
                            >
                                {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* New Password */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                            Mật khẩu mới <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <input 
                                required 
                                type={showNewPassword ? "text" : "password"} 
                                value={formData.newPassword} 
                                onChange={e => setFormData({...formData, newPassword: e.target.value})} 
                                className="w-full pl-3 pr-10 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" 
                                placeholder="Nhập mật khẩu mới" 
                            />
                            <button 
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-blue hover:text-midnight-indigo"
                            >
                                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        {/* Password Strength Meter */}
                        {formData.newPassword && (
                            <div className="mt-2 space-y-2 animate-fade-in-up">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-blue">Độ mạnh mật khẩu:</span>
                                    <span className={`font-bold ${strength.textColor}`}>{strength.label}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                                    <div className={`h-full flex-1 transition-all duration-300 ${strength.score >= 1 ? strength.color : 'bg-slate-200'}`} />
                                    <div className={`h-full flex-1 transition-all duration-300 ${strength.score >= 3 ? strength.color : 'bg-slate-200'}`} />
                                    <div className={`h-full flex-1 transition-all duration-300 ${strength.score >= 5 ? strength.color : 'bg-slate-200'}`} />
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] pt-1">
                                    <span className={`flex items-center gap-1 ${hasMinLength ? 'text-green-600' : 'text-slate-400'}`}>
                                        {hasMinLength ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Tối thiểu 8 ký tự
                                    </span>
                                    <span className={`flex items-center gap-1 ${hasUppercase ? 'text-green-600' : 'text-slate-400'}`}>
                                        {hasUppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Có chữ in hoa (A-Z)
                                    </span>
                                    <span className={`flex items-center gap-1 ${hasLowercase ? 'text-green-600' : 'text-slate-400'}`}>
                                        {hasLowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Có chữ thường (a-z)
                                    </span>
                                    <span className={`flex items-center gap-1 ${hasDigit ? 'text-green-600' : 'text-slate-400'}`}>
                                        {hasDigit ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Có chữ số (0-9)
                                    </span>
                                    <span className={`flex items-center gap-1 col-span-2 ${hasSpecial ? 'text-green-600' : 'text-slate-400'}`}>
                                        {hasSpecial ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Có ký tự đặc biệt (!, @, #, $, %,...)
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                            Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <input 
                                required 
                                type={showConfirmPassword ? "text" : "password"} 
                                value={formData.confirmPassword} 
                                onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
                                className="w-full pl-3 pr-10 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" 
                                placeholder="Nhập lại mật khẩu mới" 
                            />
                            <button 
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-blue hover:text-midnight-indigo"
                            >
                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                        {!forced && (
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={loading}
                            className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist disabled:opacity-50"
                        >
                            Hủy
                        </button>
                        )}
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-4 py-2 text-sm font-semibold text-white bg-action-blue rounded-xl hover:bg-glacier-blue disabled:opacity-50 flex items-center"
                        >
                            {loading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Đang xử lý...
                                </span>
                            ) : 'Đổi mật khẩu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default ChangePasswordModal;
