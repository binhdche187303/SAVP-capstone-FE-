import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Upload } from 'lucide-react';
import { btnGhost, btnPrimary } from '../common/uiClasses';

const WIDTH = 320;
const HEIGHT = 240;
const SHRINK_ABOVE_BYTES = 150 * 1024;

// Không dùng FileReader: thư viện pptxviewjs (nạp ở InMeetingRoom) ghi đè window.FileReader toàn cục bằng bản
// không có readAsDataURL, nên ở bản build mọi `new FileReader().readAsDataURL` đều hỏng.
const readFile = async (file) => {
    if (typeof file.arrayBuffer !== 'function') {
        // Môi trường cũ (và jsdom khi chạy test) chưa có Blob.arrayBuffer: dùng FileReader gốc.
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`;
};

// Thu nhỏ ảnh tải lên còn rộng tối đa 320 px để không làm đầy localStorage.
const shrink = (dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
        try {
            const scale = Math.min(1, WIDTH / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
            resolve(dataUrl);
        }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
});

// Chụp ảnh khuôn mặt bằng webcam, hoặc tải ảnh lên khi không có/không cấp quyền camera.
// value: data URL hoặc null.
const FaceCapture = ({ value, onChange }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const fileRef = useRef(null);
    const [cameraOn, setCameraOn] = useState(false);
    const [cameraError, setCameraError] = useState(null);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    useEffect(() => stopCamera, []);

    useEffect(() => {
        if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    }, [cameraOn]);

    const startCamera = async () => {
        setCameraError(null);
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
            streamRef.current = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            });
            setCameraOn(true);
        } catch {
            setCameraError('Không truy cập được camera. Bạn có thể tải ảnh lên thay thế.');
        }
    };

    const capture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0, WIDTH, HEIGHT);
        onChange(canvas.toDataURL('image/jpeg', 0.7));
        stopCamera();
    };

    const upload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setCameraError('Tệp đã chọn không phải là ảnh.');
            return;
        }
        setCameraError(null);
        const dataUrl = await readFile(file);
        onChange(file.size > SHRINK_ABOVE_BYTES ? await shrink(dataUrl) : dataUrl);
        stopCamera();
    };

    return (
        <div className="space-y-3">
            <div className="mx-auto rounded-2xl overflow-hidden bg-midnight-indigo/5 border border-platinum-tint flex items-center justify-center" style={{ width: WIDTH, maxWidth: '100%', aspectRatio: '4 / 3' }}>
                {value && <img src={value} alt="Ảnh khuôn mặt đã chụp" className="w-full h-full object-cover" />}
                {!value && cameraOn && <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />}
                {!value && !cameraOn && (
                    <div className="text-center text-xs text-slate-blue px-6">
                        <Camera className="w-8 h-8 mx-auto mb-2 text-steel-gray" />
                        Nhìn thẳng, đủ sáng, không đeo kính râm hoặc khẩu trang.
                    </div>
                )}
            </div>
            {cameraError && <p className="text-xs text-red-600 text-center" role="alert">{cameraError}</p>}
            <div className="flex flex-wrap justify-center gap-2">
                {value && (
                    <button type="button" className={btnGhost} onClick={() => onChange(null)}>
                        <RotateCcw className="w-4 h-4" /> Chụp lại
                    </button>
                )}
                {!value && !cameraOn && (
                    <button type="button" className={btnPrimary} onClick={startCamera}>
                        <Camera className="w-4 h-4" /> Bật camera
                    </button>
                )}
                {!value && cameraOn && (
                    <button type="button" className={btnPrimary} onClick={capture}>
                        <Camera className="w-4 h-4" /> Chụp
                    </button>
                )}
                {!value && (
                    <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
                        <Upload className="w-4 h-4" /> Tải ảnh lên
                    </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Tải ảnh khuôn mặt" onChange={upload} />
            </div>
        </div>
    );
};

export default FaceCapture;
