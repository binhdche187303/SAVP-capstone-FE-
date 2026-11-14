import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileAudio, CheckCircle, AlertCircle, X, Loader2, Sparkles } from 'lucide-react';
import { uploadAudio, createTranscriptionJob } from '../../service/transcriptionServices';

const AudioUploader = ({ meetingId, onUploadSuccess }) => {
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, uploading, uploaded, processing, success, error
    const [errorMsg, setErrorMsg] = useState('');
    const [featureDisabled, setFeatureDisabled] = useState(false);
    const [recordingSessionId, setRecordingSessionId] = useState(null);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        validateAndSetFile(droppedFile);
    };

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        validateAndSetFile(selectedFile);
    };

    const validateAndSetFile = (selectedFile) => {
        if (!selectedFile) return;
        const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
        // Cảnh báo nếu > 50MB (50 * 1024 * 1024 bytes)
        if (selectedFile.size > MAX_FILE_SIZE) {
            setErrorMsg('Dung lượng file vượt quá giới hạn 500MB.');
            setStatus('error');
            return;
        }

        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/aac'];
        // Tạm thời nới lỏng validate mime types vì m4a có thể trả type rỗng

        setFile(selectedFile);
        setStatus('idle');
        setErrorMsg('');
    };

    const handleUpload = async () => {
        if (!file || !meetingId) return;

        setStatus('uploading');
        setErrorMsg('');

        try {
            const uploadRes = await uploadAudio(meetingId, file);
            if (!uploadRes?.success) {
                throw new Error(uploadRes?.error?.message || uploadRes?.message || 'Lỗi khi tải lên tệp âm thanh.');
            }

            const newSessionId = uploadRes.data?.recordingSessionId;
            if (!newSessionId) throw new Error('Không nhận được phiên ghi âm từ máy chủ.');

            setRecordingSessionId(newSessionId);
            setStatus('uploaded');
        } catch (err) {
            setStatus('error');
            setErrorMsg(err?.error?.message || err?.message || 'Có lỗi xảy ra trong quá trình xử lý.');
        }
    };

    const handleRunStt = async () => {
        if (!recordingSessionId || !meetingId) return;

        setStatus('processing');
        setErrorMsg('');

        try {
            const jobRes = await createTranscriptionJob(meetingId, {
                recordingSessionId,
                language: 'vi-VN',
                speakerMappingMode: 'diarization_only'
            });

            if (!jobRes?.success) {
                // Xử lý case bị tắt feature flag 403
                throw new Error(jobRes?.error?.message || jobRes?.message || 'Lỗi khi khởi tạo quá trình xử lý giọng nói.');
            }

            setStatus('success');
            setTimeout(() => {
                onUploadSuccess?.(); // Trigger parent to reload/polling
                setStatus('idle');
                setFile(null);
                setRecordingSessionId(null);
            }, 2000);

        } catch (err) {
            setStatus('error');
            if (err?.error?.code === 'TRANSCRIPTION_DISABLED') {
                setFeatureDisabled(true);
                setErrorMsg('Tính năng Speech-to-Text hiện đang bị tắt. Vui lòng liên hệ quản trị viên.');
            } else {
                setErrorMsg(err?.error?.message || err?.message || 'Có lỗi xảy ra trong quá trình xử lý.');
            }
        }
    };

    if (featureDisabled) {
        return (
            <div className="bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm-2 rounded-3xl p-6 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-midnight-indigo">Tính năng Speech-to-Text hiện đang bị tắt</p>
                <p className="text-xs text-slate-blue mt-1">Vui lòng liên hệ quản trị viên hệ thống để biết thêm chi tiết.</p>
            </div>
        );
    }

    return (
        <div className="bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm-2 rounded-3xl p-6 relative overflow-hidden">
            {/* Nền trang trí */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200/50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-action-blue/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />

            <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wider flex items-center gap-2 mb-4 relative z-10">
                <UploadCloud className="w-5 h-5 text-action-blue" />
                Cập nhật bản ghi âm
            </h3>

            {/* Vùng kéo thả */}
            <div
                className={`relative z-10 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all duration-300 ${isDragging
                    ? 'border-action-blue bg-blue-50/50 scale-[1.02]'
                    : 'border-platinum-tint/80 bg-cloud-mist/40 hover:bg-cloud-mist'
                    } ${file ? 'border-none bg-transparent' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {!file ? (
                    <>
                        <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                            <UploadCloud className="w-6 h-6 text-slate-blue" />
                        </div>
                        <p className="text-sm font-bold text-midnight-indigo mb-1">
                            Kéo thả file âm thanh vào đây
                        </p>
                        <p className="text-xs text-slate-blue mb-4">
                            Hỗ trợ .mp3, .wav, .m4a (Tối đa 500MB)
                        </p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-white border border-platinum-tint shadow-sm rounded-xl text-xs font-bold text-midnight-indigo hover:text-action-blue hover:border-action-blue/30 transition-all"
                        >
                            Chọn File từ máy tính
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="audio/*"
                            className="hidden"
                        />
                    </>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-white border border-platinum-tint rounded-2xl p-4 shadow-sm flex items-center gap-4"
                    >
                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                            <FileAudio className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1 truncate">
                            <p data-ui-text="primary" className="text-sm font-bold text-midnight-indigo truncate">{file.name}</p>
                            <p className="text-xs text-slate-blue">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        {status === 'idle' && (
                            <button
                                onClick={() => setFile(null)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-blue hover:text-red-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </motion.div>
                )}
            </div>

            {/* Trạng thái Upload & Processing */}
            <AnimatePresence>
                {status !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 relative z-10"
                    >
                        {status === 'uploading' && (
                            <div className="flex flex-col gap-2 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                <div className="flex justify-between items-center text-xs font-bold text-action-blue">
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải file lên...
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-action-blue rounded-full"
                                        initial={{ width: '0%' }}
                                        animate={{ width: '100%' }}
                                        transition={{ duration: 2, ease: "easeInOut" }} // Fake progress
                                    />
                                </div>
                            </div>
                        )}

                        {status === 'uploaded' && (
                            <div className="flex flex-col gap-3 p-4 bg-green-50/50 rounded-xl border border-green-100">
                                <div className="flex items-center gap-3 text-green-700">
                                    <CheckCircle className="w-5 h-5" />
                                    <span data-ui-text="primary" className="text-xs font-bold">Tải file thành công. Bấm để bắt đầu chuyển đổi giọng nói.</span>
                                </div>
                                <button
                                    onClick={handleRunStt}
                                    className="self-end px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                                >
                                    <Sparkles className="w-4 h-4" /> Chạy Speech to Text
                                </button>
                            </div>
                        )}

                        {status === 'processing' && (
                            <div className="flex items-center gap-3 p-4 bg-purple-50/50 rounded-xl border border-purple-100 text-purple-700">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span data-ui-text="primary" className="text-xs font-bold">Đang khởi tạo AI xử lý (Speech-to-Text)...</span>
                            </div>
                        )}

                        {status === 'success' && (
                            <div className="flex items-center gap-3 p-4 bg-green-50/50 rounded-xl border border-green-100 text-green-700">
                                <CheckCircle className="w-5 h-5" />
                                <span data-ui-text="primary" className="text-xs font-bold">Khởi tạo thành công! Hệ thống đang tiến hành chuyển đổi.</span>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="flex items-start gap-3 p-4 bg-red-50/50 rounded-xl border border-red-100 text-red-700">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span data-ui-text="secondary" className="text-xs font-medium leading-relaxed">{errorMsg}</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Nút Thực Hiện */}
            {file && status === 'idle' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 flex justify-end relative z-10"
                >
                    <button
                        onClick={handleUpload}
                        className="px-6 py-2.5 bg-midnight-indigo hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm transform active:scale-95 flex items-center gap-2"
                    >
                        <UploadCloud className="w-4 h-4" />
                        Tiến hành Upload
                    </button>
                </motion.div>
            )}
        </div>
    );
};

export default AudioUploader;
