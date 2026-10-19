/**
 * DashboardBanner — VISMA IVA Slide Banner
 *
 * Cấu hình slide:  src/components/common/banner/slideConfig.js
 * Ảnh slide:       public/images/banner/
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SLIDES from './banner/slideConfig';
import websiteLogo from '../../assets/images/logo.png';

// ── Fade transition hook ───────────────────────────────────────────────────────
const useContentTransition = (slideIndex) => {
    const [animating, setAnimating] = useState(false);
    const prev = useRef(slideIndex);
    useEffect(() => {
        if (prev.current === slideIndex) return;
        setAnimating(true);
        const t = setTimeout(() => setAnimating(false), 400);
        prev.current = slideIndex;
        return () => clearTimeout(t);
    }, [slideIndex]);
    return animating;
};

// ── Navigation pill — dùng chung cho TẤT CẢ slide ────────────────────────────
const BottomNav = ({ slideIndex, paused, accent, goTo }) => (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center" style={{ zIndex: 10 }}>
        <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-full"
            style={{
                background: 'rgba(0,0,0,0.32)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.13)',
            }}
        >
            <button
                onClick={() => goTo(slideIndex - 1)}
                className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-white/10 hover:bg-white/22 transition-colors"
            >
                <ChevronLeft className="w-3.5 h-3.5 text-white" />
            </button>

            <div className="flex items-center gap-1.5">
                {SLIDES.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => goTo(i)}
                        aria-label={`Slide ${i + 1}`}
                        style={{
                            height: 6,
                            width: i === slideIndex ? 26 : 7,
                            borderRadius: 99,
                            background: i === slideIndex ? '#fff' : 'rgba(255,255,255,0.30)',
                            boxShadow: i === slideIndex ? '0 0 7px rgba(255,255,255,0.85)' : 'none',
                            transition: 'all 0.42s cubic-bezier(0.34,1.56,0.64,1)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                        }}
                    />
                ))}
            </div>

            <button
                onClick={() => goTo(slideIndex + 1)}
                className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-white/10 hover:bg-white/22 transition-colors"
            >
                <ChevronRight className="w-3.5 h-3.5 text-white" />
            </button>

            {/* Progress bar */}
            <div className="w-20 h-0.5 bg-white/15 rounded-full overflow-hidden">
                <div
                    key={`prog-${slideIndex}-${paused}`}
                    className="h-full rounded-full"
                    style={{
                        background: accent,
                        opacity: 0.85,
                        animation: paused ? 'none' : 'banner-progress 7s linear forwards',
                    }}
                />
            </div>
        </div>
    </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
const DashboardBanner = ({ roleName = 'bạn' }) => {
    const [slideIndex, setSlideIndex] = useState(0);
    const [paused, setPaused]         = useState(false);
    const [userName, setUserName]     = useState('');
    const [mx, setMx]                 = useState(0);
    const [my, setMy]                 = useState(0);
    const animating = useContentTransition(slideIndex);
    const bgRef     = useRef();
    const wrapRef   = useRef();

    useEffect(() => {
        try {
            const s = JSON.parse(localStorage.getItem('user') || 'null');
            if (s?.fullName) setUserName(s.fullName);
        } catch { /* silent */ }
    }, []);

    // GSAP: gradient background khi đổi slide
    useEffect(() => {
        const sl = SLIDES[slideIndex];
        if (!bgRef.current) return;
        gsap.to(bgRef.current, {
            background: `linear-gradient(135deg, ${sl.bgFrom} 0%, ${sl.bgTo} 100%)`,
            duration: 0.9, ease: 'power2.inOut',
        });
    }, [slideIndex]);

    // Auto-advance 7s
    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => setSlideIndex(i => (i + 1) % SLIDES.length), 7000);
        return () => clearInterval(id);
    }, [paused]);

    // Mouse parallax
    const handleMouseMove = useCallback((e) => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMx((e.clientX - rect.left) / rect.width - 0.5);
        setMy((e.clientY - rect.top)  / rect.height - 0.5);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setPaused(false);
        setMx(0);
        setMy(0);
    }, []);

    const goTo = useCallback((idx) => {
        setSlideIndex(((idx % SLIDES.length) + SLIDES.length) % SLIDES.length);
    }, []);

    const slide   = SLIDES[slideIndex];
    const Icon    = slide.Icon;
    const visible = !animating;

    return (
        <div
            ref={wrapRef}
            className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl select-none"
            style={{ height: 320 }}
            onMouseEnter={() => setPaused(true)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {/* Background gradient */}
            <div
                ref={bgRef}
                className="absolute inset-0"
                style={{ borderRadius: 'inherit', background: `linear-gradient(135deg, ${slide.bgFrom} 0%, ${slide.bgTo} 100%)` }}
            />

            {/* ══ photo: ảnh khuôn viên phủ full + lớp phủ tối bên trái cho chữ dễ đọc ══ */}
            {slide.photo && (
                <div
                    key={`ph-${slideIndex}`}
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 1, opacity: visible ? 1 : 0, transition: 'opacity 0.45s ease' }}
                >
                    <img
                        src={slide.photo}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    />
                    <div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(90deg, ${slide.bgFrom}d9 0%, ${slide.bgFrom}a6 35%, ${slide.bgTo}40 65%, transparent 90%)` }}
                    />
                </div>
            )}

            {/* ══ fullImage: ảnh phủ full banner ═══════════════════════════ */}
            {slide.fullImage && (
                <div
                    key={`fi-${slideIndex}`}
                    className="absolute inset-0"
                    style={{ zIndex: 1, opacity: visible ? 1 : 0, transition: 'opacity 0.45s ease' }}
                >
                    <img
                        src={slide.image}
                        alt="VISMA IVA"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    />
                </div>
            )}

            {/* ══ Slide thường: ảnh phải + text trái ════════════════════════ */}
            {!slide.fullImage && (
                <>
                    {!slide.photo && (<>
                    {/* Ảnh bên phải — bounded, không tràn */}
                    <div
                        className="absolute top-0 right-0 bottom-0 pointer-events-none"
                        style={{ zIndex: 1, width: '52%', overflow: 'hidden' }}
                    >
                        {/* float wrapper */}
                        <div
                            key={`img-${slideIndex}`}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                right: '-2%',
                                transform: 'translateY(-50%)',
                                animation: 'banner-float 6s ease-in-out infinite',
                                opacity: visible ? 1 : 0,
                                transition: 'opacity 0.42s ease',
                            }}
                        >
                            {/* parallax wrapper */}
                            <div style={{ transform: `translate(${-mx * 20}px, ${-my * 12}px)`, transition: 'transform 0.14s ease-out' }}>
                                <img
                                    src={slide.image}
                                    alt=""
                                    style={{
                                        display: 'block',
                                        height: 270,
                                        width: 'auto',
                                        maxWidth: 460,
                                        objectFit: 'contain',
                                        mixBlendMode: slide.blendMode || 'normal',
                                        filter: `drop-shadow(0 0 26px ${slide.accent}65) drop-shadow(0 0 65px ${slide.accent}20)`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* glow blob */}
                        <div style={{
                            position: 'absolute', right: '8%', bottom: '-35%',
                            width: 240, height: 240, borderRadius: '50%',
                            background: slide.accent, opacity: 0.10,
                            filter: 'blur(50px)', transition: 'background 0.9s ease',
                        }} />
                    </div>
                    </>)}

                    {/* Text panel trái — CHỈ text, không có controls */}
                    <div
                        className="absolute left-0 top-0 bottom-0 flex flex-col justify-center py-7 pl-8 pr-4"
                        style={{ zIndex: 2, width: '52%', pointerEvents: 'none' }}
                    >
                        <div
                            className="space-y-3"
                            style={{
                                opacity: visible ? 1 : 0,
                                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                                transition: 'opacity 0.42s ease, transform 0.42s ease',
                            }}
                        >
                            {/* Greeting row: logo + tên */}
                            <div className="flex items-center gap-2.5">
                                <img
                                    src={websiteLogo}
                                    alt="VISMA IVA"
                                    style={{
                                        height: 28,
                                        width: 'auto',
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.45))',
                                        flexShrink: 0,
                                    }}
                                />
                                <span
                                    className="text-white font-bold leading-tight"
                                    style={{ fontSize: '1.15rem', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
                                >
                                    Xin chào,&nbsp;
                                    <span style={{ color: slide.accent, filter: `drop-shadow(0 0 8px ${slide.accent})` }}>
                                        {userName || roleName}
                                    </span>!
                                </span>
                            </div>

                            {/* Badge tag */}
                            <span
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border uppercase tracking-widest backdrop-blur-md ${slide.badgeClass}`}
                                style={{ pointerEvents: 'auto' }}
                            >
                                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                                {slide.tag}
                            </span>

                            {/* Title */}
                            <h2
                                className="text-white font-extrabold leading-tight tracking-tight"
                                style={{
                                    fontSize: '1.5rem',
                                    textShadow: `0 0 32px ${slide.accent}80, 0 2px 16px rgba(0,0,0,0.7)`,
                                }}
                            >
                                {slide.title}
                            </h2>

                            {/* Description */}
                            <p className="text-white/75 leading-relaxed line-clamp-2 max-w-xs" style={{ fontSize: '0.82rem' }}>
                                {slide.description}
                            </p>
                        </div>
                    </div>

                    {/* Vignette trái */}
                    <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{
                            zIndex: 3, width: '56%',
                            background: 'linear-gradient(to right, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.06) 75%, transparent 100%)',
                        }}
                    />
                </>
            )}

            {/* ══ Gradient đáy + BottomNav — CHUNG cho mọi slide ════════════ */}
            <div
                className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{ zIndex: 8, height: 70, background: 'linear-gradient(to top, rgba(0,0,0,0.50) 0%, transparent 100%)' }}
            />
            {SLIDES.length > 1 && <BottomNav slideIndex={slideIndex} paused={paused} accent={slide.accent} goTo={goTo} />}

            {/* Ambient glow */}
            <div className="absolute pointer-events-none" style={{
                top: -50, left: -50, width: 200, height: 200,
                borderRadius: '50%', opacity: 0.08,
                background: slide.accent, filter: 'blur(55px)',
                zIndex: 0, transition: 'background 0.9s ease',
            }} />

            <style>{`
                @keyframes banner-float {
                    0%, 100% { transform: translateY(-50%); }
                    50%       { transform: translateY(calc(-50% - 10px)); }
                }
                @keyframes banner-progress {
                    from { width: 0%; }
                    to   { width: 100%; }
                }
            `}</style>
        </div>
    );
};

export default DashboardBanner;
