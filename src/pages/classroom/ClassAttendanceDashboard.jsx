import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, Check, Download, Info, LogIn, LogOut, RefreshCw, Trash2, Users, X } from 'lucide-react';
import {
    buildClassAttendanceRows,
    clearClassAttendanceRecords,
    exportClassAttendanceCsv,
    getClassAttendanceSettings,
    getClassAttendanceSummary,
    mockClassFaceScan,
    mockClassrooms
} from '../../service/classAttendanceService';

const statusClass = {
    on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    late: 'bg-amber-50 text-amber-700 border-amber-200',
    left: 'bg-blue-50 text-action-blue border-blue-200',
    not_checked: 'bg-slate-50 text-slate-blue border-platinum-tint'
};

const popupTone = {
    success: { background: '#059669', border: '#10b981', icon: Check },
    warning: { background: '#d97706', border: '#f59e0b', icon: AlertTriangle },
    error: { background: '#dc2626', border: '#ef4444', icon: X },
    info: { background: '#003865', border: '#1d4ed8', icon: Info }
};

const ClassScanPopup = ({ notice, onClose }) => {
    if (!notice) return null;
    const tone = popupTone[notice.type] || popupTone.info;
    const Icon = tone.icon;

    return createPortal(
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                right: 24,
                bottom: 24,
                zIndex: 100000,
                width: 'min(420px, calc(100vw - 32px))',
                background: tone.background,
                color: '#fff',
                border: `1px solid ${tone.border}`,
                borderRadius: 12,
                boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12
            }}
        >
            <Icon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}>{notice.message}</p>
                {notice.detail && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, fontWeight: 600, opacity: 0.9 }}>{notice.detail}</p>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Đóng thông báo"
                style={{
                    width: 28,
                    height: 28,
                    border: 0,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                }}
            >
                <X style={{ width: 15, height: 15 }} />
            </button>
        </div>,
        document.body
    );
};

const captureFrame = (videoRef) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 360;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return null;
    }
};

const StatCard = ({ label, value, helper }) => (
    <div className="bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-blue">{label}</p>
        <p className="text-2xl font-bold text-midnight-indigo mt-1">{value}</p>
        <p className="text-xs text-steel-gray mt-1">{helper}</p>
    </div>
);

const ClassAttendanceDashboard = ({ mode = 'teacher' }) => {
    const [selectedClassId, setSelectedClassId] = useState(mockClassrooms[0].id);
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(getClassAttendanceSummary(selectedClassId));
    const [settings, setSettings] = useState(getClassAttendanceSettings(selectedClassId));
    const [scanDirection, setScanDirection] = useState('in');
    const [autoScan, setAutoScan] = useState(false);
    const [scanNotice, setScanNotice] = useState(null);
    const [webcamEnabled, setWebcamEnabled] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const lastWebcamFrameRef = useRef(null);

    const selectedClass = useMemo(
        () => mockClassrooms.find(item => item.id === selectedClassId) || mockClassrooms[0],
        [selectedClassId]
    );

    const refresh = useCallback(() => {
        setRows(buildClassAttendanceRows(selectedClassId));
        setSummary(getClassAttendanceSummary(selectedClassId));
        setSettings(getClassAttendanceSettings(selectedClassId));
    }, [selectedClassId]);

    useEffect(() => {
        refresh();
        const handler = () => refresh();
        window.addEventListener('class-attendance-updated', handler);
        return () => window.removeEventListener('class-attendance-updated', handler);
    }, [refresh]);

    useEffect(() => () => {
        streamRef.current?.getTracks?.().forEach(track => track.stop());
    }, []);

    useEffect(() => {
        if (!webcamEnabled) {
            lastWebcamFrameRef.current = null;
            return undefined;
        }
        const timer = setInterval(() => {
            const frame = captureFrame(videoRef);
            if (frame) lastWebcamFrameRef.current = frame;
        }, 400);
        return () => clearInterval(timer);
    }, [webcamEnabled]);

    const toggleWebcam = async () => {
        if (webcamEnabled) {
            streamRef.current?.getTracks?.().forEach(track => track.stop());
            streamRef.current = null;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
            lastWebcamFrameRef.current = null;
            setAutoScan(false);
            setWebcamEnabled(false);
            setScanNotice({
                type: 'info',
                message: 'Đã tắt webcam.'
            });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try {
                    await videoRef.current.play();
                } catch {}
                setTimeout(() => {
                    const frame = captureFrame(videoRef);
                    if (frame) lastWebcamFrameRef.current = frame;
                }, 500);
            }
            setWebcamEnabled(true);
            setScanNotice({
                type: 'info',
                message: 'Đã bật webcam. Khi quét thành công, ảnh bằng chứng sẽ là khung hình chụp tại thời điểm quét.'
            });
        } catch {
            setScanNotice({
                type: 'warning',
                message: 'Không mở được webcam. Hệ thống sẽ dùng cam ảo để test điểm danh.'
            });
        }
    };

    const performScan = useCallback(() => {
        const snapshotImageBase64 = captureFrame(videoRef) || lastWebcamFrameRef.current;
        if (webcamEnabled && !snapshotImageBase64) {
            const nextNotice = {
                type: 'warning',
                message: 'Chưa chụp được ảnh từ webcam. Vui lòng chờ camera hiển thị rõ rồi quét lại.'
            };
            setScanNotice(nextNotice);
            return;
        }

        const result = mockClassFaceScan({ classId: selectedClassId, direction: scanDirection, snapshotImageBase64 });
        const nextMessage = result?.data?.message || result.message || 'Đã xử lý lượt quét.';
        const nextNotice = {
            type: result.success ? 'success' : (result.warning ? 'warning' : 'error'),
            message: nextMessage,
            detail: result.success
                ? `Đã lưu ảnh bằng chứng từ ${snapshotImageBase64 ? 'webcam' : 'cam ảo'} tại thời điểm quét.`
                : 'Không tạo bản ghi điểm danh mới.'
        };
        setScanNotice(nextNotice);
        refresh();
    }, [refresh, scanDirection, selectedClassId, webcamEnabled]);

    useEffect(() => {
        if (!autoScan) return undefined;
        performScan();
        const timer = setInterval(() => {
            performScan();
        }, Math.max(2, Number(settings.autoScanIntervalSeconds || 4)) * 1000);
        return () => clearInterval(timer);
    }, [autoScan, performScan, settings.autoScanIntervalSeconds]);

    useEffect(() => {
        if (!scanNotice || scanNotice.type === 'warning' || scanNotice.type === 'error') return undefined;
        const timer = setTimeout(() => setScanNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [scanNotice]);

    const canOperateCamera = mode === 'teacher';

    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-action-blue text-[11px] font-bold">
                        <Users className="w-4 h-4" />
                        Điểm danh lớp học
                    </span>
                    <h1 className="text-xl font-bold text-midnight-indigo tracking-tight mt-3">
                        {mode === 'manager' ? 'Quản lý chuyên cần lớp học' : 'Dashboard giáo viên'}
                    </h1>
                    <p className="text-xs text-slate-blue mt-1">
                        Tự động quét FaceID, ghi nhận giờ vào/ra, xác định đi muộn và lưu ảnh bằng chứng.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-semibold text-midnight-indigo"
                    >
                        {mockClassrooms.map(item => (
                            <option key={item.id} value={item.id}>{item.code} - {item.subject}</option>
                        ))}
                    </select>
                    <button type="button" onClick={refresh} className="px-4 py-2.5 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-slate-blue flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Làm mới
                    </button>
                    <button type="button" onClick={() => exportClassAttendanceCsv(selectedClassId)} className="px-4 py-2.5 rounded-xl bg-action-blue text-white text-xs font-bold flex items-center gap-2">
                        <Download className="w-4 h-4" /> Xuất CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Sĩ số" value={summary.total} helper={selectedClass.room} />
                <StatCard label="Đã vào lớp" value={summary.checkedIn} helper={`Bắt đầu ${settings.classStartTime}`} />
                <StatCard label="Đi muộn" value={summary.late} helper={`Ngưỡng ${settings.lateThresholdMinutes} phút`} />
                <StatCard label="Đã rời lớp" value={summary.left} helper={selectedClass.semester} />
            </div>

            {canOperateCamera && (
                <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-platinum-tint flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide flex items-center gap-2">
                                <Camera className="w-5 h-5 text-action-blue" />
                                Camera FaceID lớp học
                            </h2>
                            <p className="text-xs text-slate-blue mt-1">Bật tự động quét để test bằng webcam. Nếu không có webcam, hệ thống tự dùng cam ảo.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={toggleWebcam} className="px-4 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                                {webcamEnabled ? 'Tắt webcam' : 'Bật webcam'}
                            </button>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-platinum-tint bg-white text-xs font-bold text-midnight-indigo">
                                {scanDirection === 'in' ? <LogIn className="w-4 h-4 text-emerald-600" /> : <LogOut className="w-4 h-4 text-orange-600" />}
                                <select
                                    value={scanDirection}
                                    onChange={(event) => setScanDirection(event.target.value)}
                                    className="bg-transparent outline-none"
                                >
                                    <option value="in">Quét vào</option>
                                    <option value="out">Quét ra</option>
                                </select>
                            </label>
                            <button type="button" onClick={() => setAutoScan(v => !v)} className={`px-4 py-2 rounded-xl text-xs font-bold ${autoScan ? 'bg-red-600 text-white' : 'bg-action-blue text-white'}`}>
                                {autoScan ? 'Dừng tự động' : 'Bật tự động quét'}
                            </button>
                        </div>
                    </div>
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
                        <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center text-white text-sm font-bold relative">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            {autoScan && <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-white/90 text-midnight-indigo text-[11px]">Đang quét {scanDirection === 'in' ? 'vào' : 'ra'}</span>}
                        </div>
                        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4">
                            <p className="text-sm font-bold text-midnight-indigo">{selectedClass.subject}</p>
                            <p className="text-xs text-slate-blue mt-1">{selectedClass.schedule} · {selectedClass.teacher}</p>
                            <p className="mt-4 text-xs text-slate-blue">Camera sẽ tự nhận diện sinh viên, đối chiếu FaceID đã đăng ký, ghi nhận giờ vào/ra và lưu ảnh bằng chứng tại thời điểm quét.</p>
                        </div>
                    </div>
                </div>
            )}

            {canOperateCamera && (
                <ClassScanPopup notice={scanNotice} onClose={() => setScanNotice(null)} />
            )}

            <div className="bg-white border border-platinum-tint rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint bg-cloud-mist/10 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Danh sách sinh viên trong lớp</h2>
                    {canOperateCamera && (
                        <button type="button" onClick={() => { clearClassAttendanceRecords(); refresh(); }} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 text-xs font-bold flex items-center gap-2">
                            <Trash2 className="w-4 h-4" /> Xóa dữ liệu test
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-cloud-mist/60 text-[11px] uppercase text-slate-blue">
                            <tr>
                                <th className="text-left px-5 py-4">Sinh viên</th>
                                <th className="text-left px-5 py-4">Giờ vào</th>
                                <th className="text-left px-5 py-4">Giờ ra</th>
                                <th className="text-left px-5 py-4">Trạng thái</th>
                                <th className="text-left px-5 py-4">Ảnh bằng chứng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.id} className="border-t border-platinum-tint/70">
                                    <td className="px-5 py-4">
                                        <p className="font-bold text-midnight-indigo">{row.name}</p>
                                        <p className="text-xs text-slate-blue">{row.code}</p>
                                    </td>
                                    <td className="px-5 py-4 font-semibold text-midnight-indigo">{row.checkInText}</td>
                                    <td className="px-5 py-4 font-semibold text-midnight-indigo">{row.checkOutText}</td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass[row.status] || statusClass.not_checked}`}>
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        {row.evidenceImage ? (
                                            <img src={row.evidenceImage} alt="Bằng chứng điểm danh" className="w-28 h-16 object-cover rounded-lg border border-platinum-tint" />
                                        ) : (
                                            <span className="text-xs text-steel-gray">Chưa có ảnh</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClassAttendanceDashboard;
