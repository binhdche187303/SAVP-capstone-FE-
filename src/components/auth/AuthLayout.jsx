import React from 'react';
import AuthHeroPanel from './AuthHeroPanel';
import logo from '../../assets/images/SmarTracking.png';

const AuthLayout = ({ children, variant = 'login' }) => {
    return (
        <main className="flex h-screen w-full bg-midnight-indigo font-sans overflow-hidden">
            {/* Left Column - Hero Area (Dark Background spans full screen) */}
            <section className="hidden lg:flex flex-col flex-1 relative items-center justify-center p-8 overflow-hidden">
                <AuthHeroPanel variant={variant} />
            </section>

            {/* Right Column - Form Area (White Card floating on the right) */}
            <section className="flex flex-col flex-1 lg:flex-[0_0_50%] bg-white lg:rounded-[40px] relative px-6 sm:px-12 xl:px-16 py-6 sm:py-8 shadow-[-10px_0_40px_rgba(0,0,0,0.15)] lg:my-4 lg:mr-4 overflow-y-auto">

                {/* Top bar: logo trái, liên hệ quản trị viên phải.
                    KHÔNG dùng "Sign Up" như bản tham chiếu — hệ thống này không có API tự đăng ký
                    (tài khoản do SysAdmin/BusinessAdmin cấp qua POST /users), xem
                    docs/auth-payoneer-style-redesign-plan.md mục 3. */}
                <div className="flex items-center justify-between w-full shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white flex items-center justify-center shrink-0">
                            <img src={logo} alt="VISMA IVA Logo" className="w-full h-full object-contain scale-[1.3]" />
                        </div>
                        <span className="font-gilroy font-bold text-midnight-indigo text-xl tracking-tight">VISMA IVA</span>
                    </div>
                    <span className="hidden sm:flex items-center gap-1.5 text-sm font-sans text-slate-blue">
                        Cần tài khoản?
                        <span className="font-semibold text-action-blue">Liên hệ quản trị viên</span>
                    </span>
                </div>

                {/* Form Container */}
                <div className="flex-1 flex flex-col justify-center w-full max-w-[440px] mx-auto py-8">
                    {children}
                </div>

                {/* Bottom bar: copyright trái, liên hệ hỗ trợ + ngôn ngữ phải.
                    Nhãn ngôn ngữ hiển thị tĩnh vì dự án chưa có hệ thống i18n thật —
                    không làm dropdown giả để tránh tạo cảm giác tính năng đã hoạt động. */}
                <div className="flex items-center justify-between w-full shrink-0 pt-4 border-t border-platinum-tint text-xs font-sans text-slate-blue">
                    <span>© {new Date().getFullYear()} VISMA Intelligent Video Analytics (IVA)</span>
                    <div className="flex items-center gap-4">
                        <span className="hidden sm:inline">Liên hệ hỗ trợ</span>
                        <span>Tiếng Việt</span>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default AuthLayout;
