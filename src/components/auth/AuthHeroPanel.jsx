import React from 'react';
import slide1 from "../../assets/images/Slideauth/uel/uel1.jpg";
import slide2 from "../../assets/images/Slideauth/uel/uel2.jpg";
import slide3 from "../../assets/images/Slideauth/uel/uel3.jpg";
import slide4 from "../../assets/images/Slideauth/uel/uel4.jpg";
import slide5 from "../../assets/images/Slideauth/uel/uel5.jpg";

const AuthHeroPanel = ({ variant = 'login' }) => {
    
    // Header content per variant
    const headerContent = {
        login: {
            tag: "Trường ĐH Kinh tế – Luật · ĐHQG-HCM",
            title: "VISMA IVA",
            slogan: "Nền tảng camera AI cho khuôn viên số: giám sát an ninh, điểm danh và quản lý ra vào trên một hệ thống.",
        },
        forgot: {
            tag: "Bảo mật tài khoản",
            title: "BẢO VỆ DỮ LIỆU",
            slogan: "Khôi phục quyền truy cập nhanh chóng và an toàn tuyệt đối với chuẩn mã hóa doanh nghiệp.",
        },
        otp: {
            tag: "Xác thực 2 lớp",
            title: "AN TOÀN TUYỆT ĐỐI",
            slogan: "Mã OTP đảm bảo chỉ có bạn mới có quyền can thiệp vào tài khoản cá nhân.",
        },
        changepass: {
            tag: "Cập nhật bảo mật",
            title: "KIỂM SOÁT QUYỀN LỰC",
            slogan: "Thiết lập lớp phòng thủ vững chắc mới. Giám sát không gian của bạn an tâm hơn.",
        }
    };

    const content = headerContent[variant] || headerContent.login;

    const renderVisuals = () => {
        switch (variant) {
            case 'login':
                return (
                    <div className="relative w-full flex-grow overflow-hidden flex items-center justify-center mt-6 px-0">
                        {/* Fade masks */}
                        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-midnight-indigo to-transparent z-20 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-midnight-indigo via-midnight-indigo/80 to-transparent z-20 pointer-events-none" />
                        
                        {/* Wrapper for 3D layout - significantly larger scale */}
                        <div className="tilt-3d-login flex gap-8 w-full max-w-[1000px] h-[250%] absolute top-[-75%]">
                            
                            {/* Column 1 (Scroll Up) */}
                            <div className="flex flex-col w-1/2 animate-scroll-up px-2">
                                {/* Wrap in pb-8 to perfectly match the gap for seamless infinite scroll */}
                                {[1, 2].map((group) => (
                                    <div key={`col1-${group}`} className="flex flex-col gap-8 pb-8">
                                        <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/10 bg-white/5 backdrop-blur-md p-4">
                                            <img src={slide1} className="w-full h-auto rounded-[20px] opacity-100 object-contain bg-white" alt="Slide 1" />
                                        </div>
                                        <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/10 bg-white/5 backdrop-blur-md p-4">
                                            <img src={slide3} className="w-full h-auto rounded-[20px] opacity-100 object-contain bg-white" alt="Slide 3" />
                                        </div>
                                        <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/10 bg-white/5 backdrop-blur-md p-4">
                                            <img src={slide5} className="w-full h-auto rounded-[20px] opacity-100 object-contain bg-white" alt="Slide 5" />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Column 2 (Scroll Down) */}
                            <div className="flex flex-col w-1/2 animate-scroll-down px-2">
                                {[1, 2].map((group) => (
                                    <div key={`col2-${group}`} className="flex flex-col gap-8 pb-8">
                                        <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/10 bg-white/5 backdrop-blur-md p-4">
                                            <img src={slide2} className="w-full h-auto rounded-[20px] opacity-100 object-contain bg-white" alt="Slide 2" />
                                        </div>
                                        <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/10 bg-white/5 backdrop-blur-md p-4">
                                            <img src={slide4} className="w-full h-auto rounded-[20px] opacity-100 object-contain bg-white" alt="Slide 4" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'forgot':
                return (
                    <div className="relative w-full flex-grow flex items-center justify-center mt-12 px-2">
                        {/* Floating single showcase image */}
                        <div className="relative w-full max-w-[800px] animate-float">
                            <div className="absolute inset-0 bg-red-500/20 blur-[80px] rounded-full" />
                            <div className="rounded-[32px] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,0.6)] border-2 border-white/20 bg-white/10 backdrop-blur-md p-5 relative z-10">
                                <img src={slide3} className="w-full h-auto rounded-3xl bg-white/95 object-contain" alt="Security Dashboard" />
                            </div>
                        </div>
                    </div>
                );
            case 'otp':
                return (
                    <div className="relative w-full flex-grow flex items-center justify-center mt-12 px-2">
                        {/* Stacked Fan-out Cards */}
                        <div className="relative w-full max-w-[700px] h-[500px] flex items-center justify-center perspective-1000 group">
                            {/* Left card */}
                            <div className="absolute w-[80%] transition-all duration-700 transform -rotate-12 -translate-x-28 group-hover:-translate-x-40 group-hover:-rotate-12 opacity-60 group-hover:opacity-80 rounded-[32px] border-2 border-white/10 p-3 bg-white/5 backdrop-blur-sm">
                                <img src={slide1} className="w-full h-auto rounded-2xl object-contain bg-white/80" alt="Background Card 1" />
                            </div>
                            {/* Right card */}
                            <div className="absolute w-[80%] transition-all duration-700 transform rotate-12 translate-x-28 group-hover:translate-x-40 group-hover:rotate-12 opacity-60 group-hover:opacity-80 rounded-[32px] border-2 border-white/10 p-3 bg-white/5 backdrop-blur-sm">
                                <img src={slide2} className="w-full h-auto rounded-2xl object-contain bg-white/80" alt="Background Card 2" />
                            </div>
                            {/* Center focus card */}
                            <div className="absolute w-[95%] z-10 transition-all duration-700 transform group-hover:scale-105 group-hover:-translate-y-6 rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.7)] border-2 border-white/20 p-4 bg-white/10 backdrop-blur-md">
                                <img src={slide4} className="w-full h-auto rounded-3xl object-contain bg-white" alt="OTP Focus" />
                            </div>
                        </div>
                    </div>
                );
            case 'changepass':
                return (
                    <div className="relative w-full flex-grow flex items-center justify-center mt-12 px-2 overflow-visible">
                        {/* Central focus ring with pulse effect */}
                        <div className="absolute w-[600px] h-[600px] border-2 border-action-blue/20 rounded-full animate-[spin_15s_linear_infinite]" />
                        <div className="absolute w-[450px] h-[450px] border-2 border-purple-500/20 rounded-full animate-[spin_10s_linear_infinite_reverse]" />
                        <div className="absolute w-[300px] h-[300px] bg-action-blue/15 blur-[60px] rounded-full animate-pulse" />
                        
                        <div className="relative z-10 w-full max-w-[750px] transform hover:scale-[1.03] hover:rotate-1 transition-all duration-500 cursor-pointer">
                            <div className="rounded-[32px] overflow-hidden shadow-[0_0_60px_rgba(0,112,234,0.25)] hover:shadow-[0_0_100px_rgba(0,112,234,0.4)] border-2 border-action-blue/50 bg-black/40 backdrop-blur-lg p-5 transition-shadow duration-500">
                                <img src={slide2} className="w-full h-auto rounded-3xl bg-white object-contain" alt="Change Password Dashboard" />
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col w-full h-full max-w-[1000px] gap-8 relative z-10 text-white items-start justify-start py-8">
            {/* Decorative ring behind headline — theo tinh thần vòng tròn mảnh phía sau chữ ở bản tham chiếu */}
            <div className="absolute top-[8%] left-[-5%] w-[520px] h-[520px] border border-white/10 rounded-full pointer-events-none" />

            {/* Top Text Content — căn trái thay vì căn giữa, theo bố cục tham chiếu */}
            <div className="flex flex-col w-full items-start text-left gap-5 z-20">
                <div className="inline-flex items-center px-5 py-2 bg-white/10 rounded-full backdrop-blur-md border border-white/20 shadow-lg">
                    <span className="font-gilroy font-bold text-[#87b1fd] text-sm tracking-[0.2em] uppercase">
                        {content.tag}
                    </span>
                </div>
                <h1 className="font-gilroy font-extrabold text-white text-5xl lg:text-6xl xl:text-7xl leading-tight tracking-tight drop-shadow-[0_6px_16px_rgba(0,0,0,0.6)]">
                    {content.title}
                </h1>
                <p className="font-sans font-medium text-platinum-tint text-lg lg:text-xl max-w-[560px] leading-relaxed drop-shadow-md">
                    {content.slogan}
                </p>
            </div>

            {/* Dynamic Visual Content */}
            {renderVisuals()}

            {/* Glowing Orbs - Background Atmosphere */}
            {variant === 'login' && (
                <>
                    <div className="absolute -top-[5%] -right-[15%] w-[600px] h-[600px] bg-action-blue/20 rounded-full blur-[140px] pointer-events-none" />
                    <div className="absolute bottom-[-10%] -left-[15%] w-[500px] h-[500px] bg-[#e55cff]/15 rounded-full blur-[120px] pointer-events-none" />
                </>
            )}
            {variant === 'forgot' && (
                <>
                    <div className="absolute -top-[5%] -right-[15%] w-[600px] h-[600px] bg-red-500/15 rounded-full blur-[140px] pointer-events-none" />
                    <div className="absolute bottom-[-10%] -left-[15%] w-[500px] h-[500px] bg-orange-500/15 rounded-full blur-[120px] pointer-events-none" />
                </>
            )}
            {variant === 'otp' && (
                <>
                    <div className="absolute -top-[5%] -right-[15%] w-[600px] h-[600px] bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none" />
                    <div className="absolute bottom-[-10%] -left-[15%] w-[500px] h-[500px] bg-teal-500/15 rounded-full blur-[120px] pointer-events-none" />
                </>
            )}
            {variant === 'changepass' && (
                <>
                    <div className="absolute -top-[5%] -right-[15%] w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[140px] pointer-events-none" />
                    <div className="absolute bottom-[-10%] -left-[15%] w-[500px] h-[500px] bg-action-blue/15 rounded-full blur-[120px] pointer-events-none" />
                </>
            )}

            {/* CSS styles */}
            <style>{`
                .perspective-1000 {
                    perspective: 1200px;
                }
                .tilt-3d-login {
                    /* Refined tilt and scale for huge scrolling images */
                    transform: rotateX(12deg) rotateY(-12deg) rotateZ(3deg) scale(1.05);
                    transform-style: preserve-3d;
                }
                @keyframes scrollUp {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-50%); }
                }
                @keyframes scrollDown {
                    0% { transform: translateY(-50%); }
                    100% { transform: translateY(0); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-25px); }
                }
                .animate-scroll-up {
                    animation: scrollUp 45s linear infinite;
                }
                .animate-scroll-down {
                    animation: scrollDown 45s linear infinite;
                }
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                
                /* Removed pause on hover to ensure it scrolls endlessly without stopping */
            `}</style>
        </div>
    );
};

export default AuthHeroPanel;
