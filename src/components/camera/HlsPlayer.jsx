import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, VideoOff } from 'lucide-react';
import { getAccessToken } from '../../utils/request';

const RETRY_MS = 5000;

/**
 * Phát HLS qua proxy BE. Mọi request playlist/segment gắn Bearer token hiện tại
 * (đọc lại mỗi lần nên token được refresh vẫn dùng được). Lỗi mạng → tự thử lại.
 * `vod`: phát lại đoạn ghi (không phải live) — 404 nghĩa là không có đoạn ghi, không thử lại.
 * `onTimeUpdate(seconds)`, `onEnded()`: theo dõi vị trí phát (dùng cho thanh thời gian xem lại).
 */
const HlsPlayer = ({ src, muted = true, controls = false, className = '', title, vod = false, onTimeUpdate, onEnded }) => {
    const videoRef = useRef(null);
    const [state, setState] = useState('loading'); // loading | playing | error
    const [errorText, setErrorText] = useState('');

    useEffect(() => {
        const video = videoRef.current;
        if (!src || !video) return undefined;
        setState('loading');
        setErrorText('');

        if (!Hls.isSupported()) {
            setState('error');
            setErrorText('Trình duyệt không hỗ trợ phát HLS. Dùng Chrome/Edge/Firefox.');
            return undefined;
        }

        let retryTimer;
        const hls = new Hls({
            // Tắt LL-HLS: proxy BE không chuyển tham số chặn _HLS_msn/_HLS_part.
            lowLatencyMode: false,
            liveSyncDurationCount: 3,
            manifestLoadingMaxRetry: 2,
            xhrSetup: (xhr) => {
                const token = getAccessToken();
                if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => setState('playing'));
        hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return;
            const code = data.response?.code;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
                return;
            }
            setState('error');
            setErrorText(
                code === 403 ? 'Bạn chưa được cấp quyền xem camera.'
                    : code === 404 ? (vod ? 'Không có đoạn ghi hình trong khoảng này.' : 'Camera chưa có luồng trực tiếp.')
                    : vod && code === 400 ? 'Khoảng thời gian không hợp lệ.'
                        : code === 503 ? 'Không kết nối được máy chủ camera.'
                            : code === 502 ? 'Máy chủ camera không trả luồng video — đang thử lại…'
                            : 'Mất luồng video — đang thử lại…',
            );
            if (code !== 403 && !(vod && (code === 404 || code === 400))) {
                retryTimer = setTimeout(() => {
                    setState('loading');
                    hls.loadSource(src);
                }, RETRY_MS);
            }
        });

        hls.loadSource(src);
        hls.attachMedia(video);

        return () => {
            clearTimeout(retryTimer);
            hls.destroy();
        };
    }, [src, vod]);

    return (
        <div className={`relative bg-slate-900 overflow-hidden ${className}`}>
            <video
                ref={videoRef}
                muted={muted}
                controls={controls}
                playsInline
                autoPlay
                title={title}
                onTimeUpdate={onTimeUpdate ? (e) => onTimeUpdate(e.currentTarget.currentTime) : undefined}
                onEnded={onEnded}
                className="w-full h-full object-contain bg-black"
            />
            {state === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80">
                    <Loader2 className="w-6 h-6 animate-spin" aria-label="Đang tải video" />
                </div>
            )}
            {state === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/85 text-xs text-center px-4">
                    <VideoOff className="w-6 h-6" />
                    <span>{errorText}</span>
                </div>
            )}
        </div>
    );
};

export default HlsPlayer;
