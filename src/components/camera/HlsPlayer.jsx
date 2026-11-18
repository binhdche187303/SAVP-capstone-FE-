import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, VideoOff } from 'lucide-react';
import { getAccessToken } from '../../utils/request';

const RETRY_MS = 5000;

/**
 * Phát HLS qua proxy BE. Mọi request playlist/segment gắn Bearer token hiện tại
 * (đọc lại mỗi lần nên token được refresh vẫn dùng được). Lỗi mạng → tự thử lại.
 */
const HlsPlayer = ({ src, muted = true, controls = false, className = '', title }) => {
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
            lowLatencyMode: true,
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
                    : code === 404 ? 'Camera chưa có luồng trực tiếp.'
                        : code === 503 ? 'Không kết nối được máy chủ camera.'
                            : 'Mất luồng video — đang thử lại…',
            );
            if (code !== 403) {
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
    }, [src]);

    return (
        <div className={`relative bg-slate-900 overflow-hidden ${className}`}>
            <video
                ref={videoRef}
                muted={muted}
                controls={controls}
                playsInline
                autoPlay
                title={title}
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
