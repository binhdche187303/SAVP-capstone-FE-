import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, Download, CheckCircle, AlertTriangle, Clock, RefreshCw, FileDown, Loader2 } from 'lucide-react';
import { exportMinutes, getMediaFile } from '../../service/businessAdminServices';
import usePollJob from '../../hooks/usePollJob';
import { motion } from 'framer-motion';

/**
 * ExportMinutesModal — M6.6
 * Luồng: POST /exports → nhận jobId → poll → tải file khi completed
 * Props:
 *   minutesId: string
 *   open: boolean
 *   onClose: () => void
 */
const ExportMinutesModal = ({ minutesId, open, onClose }) => {
    const [format, setFormat] = useState('pdf');
    const [includeTranscript, setIncludeTranscript] = useState(false);
    const [includeActionItems, setIncludeActionItems] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);

    // Poll job status
    const { status, progress, isPolling, error: pollError } = usePollJob(jobId, {
        intervalMs: 2000,
        maxAttempts: 90,
        onCompleted: async (job) => {
            // Khi completed, lấy downloadUrl từ result
            if (job.result?.outputFileId) {
                try {
                    const res = await getMediaFile(job.result.outputFileId);
                    if (res?.success && res.data?.downloadUrl) {
                        setDownloadUrl(res.data.downloadUrl);
                    }
                } catch (e) {
                    console.error('Failed to get download url', e);
                }
            } else {
                const url = job.result?.downloadUrl || job.result?.fileUrl || null;
                setDownloadUrl(url);
            }
        },
        onFailed: () => {},
    });

    if (!open) return null;

    const handleReset = () => {
        setJobId(null);
        setDownloadUrl(null);
        setSubmitError(null);
        setSubmitting(false);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleExport = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await exportMinutes(minutesId, {
                format,
                includeTranscript,
                includeActionItems,
            });
            if (res?.success && res.data?.jobId) {
                setJobId(res.data.jobId);
            } else {
                setSubmitError(res?.message || 'Không thể tạo yêu cầu xuất file. Vui lòng thử lại.');
            }
        } catch (e) {
            setSubmitError(e?.message || 'Lỗi kết nối khi xuất file.');
        } finally {
            setSubmitting(false);
        }
    };

    const formatConfig = {
        pdf: { label: 'PDF', icon: '📄', desc: 'Định dạng in ấn, không chỉnh sửa' },
        docx: { label: 'Word (DOCX)', icon: '📝', desc: 'Định dạng chỉnh sửa được' },
    };

    const statusLabel = {
        queued: 'Đang xếp hàng...',
        running: 'Đang xuất file...',
        completed: 'Hoàn thành!',
        failed: 'Xuất file thất bại',
    };

    const isExporting = isPolling || (status && status !== 'completed' && status !== 'failed');
    const isFailed = status === 'failed' || !!pollError;
    const isCompleted = status === 'completed';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in-up">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                            <FileDown className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-midnight-indigo">Xuất biên bản</h3>
                            <p className="text-xs text-slate-blue mt-0.5">Tải biên bản cuộc họp về máy</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Phase 1: Config (khi chưa submit) */}
                    {!jobId && (
                        <>
                            {/* Format selector */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Định dạng xuất <span className="text-red-500">*</span></label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {Object.entries(formatConfig).map(([val, cfg]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setFormat(val)}
                                            className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border-2 text-center transition-all ${
                                                format === val
                                                    ? 'border-action-blue bg-blue-50'
                                                    : 'border-platinum-tint hover:border-action-blue/40 bg-slate-50'
                                            }`}
                                        >
                                            <span className="text-2xl">{cfg.icon}</span>
                                            <span className={`text-sm font-bold ${format === val ? 'text-action-blue' : 'text-midnight-indigo'}`}>{cfg.label}</span>
                                            <span data-ui-text="action" className="text-[10px] text-slate-blue">{cfg.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider">Tùy chọn nội dung</label>
                                {[
                                    { key: 'includeActionItems', val: includeActionItems, setter: setIncludeActionItems, label: 'Bao gồm danh sách hành động (Action Items)' },
                                    { key: 'includeTranscript', val: includeTranscript, setter: setIncludeTranscript, label: 'Bao gồm bản ghi âm tự động (Transcript)' },
                                ].map(({ key, val, setter, label }) => (
                                    <label key={key} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-cloud-mist transition-colors">
                                        <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-action-blue" />
                                        <span className="text-sm text-midnight-indigo font-medium">{label}</span>
                                    </label>
                                ))}
                            </div>

                            {submitError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    <span className="font-medium">{submitError}</span>
                                </div>
                            )}
                        </>
                    )}

                    {/* Phase 2: Đang xử lý */}
                    {jobId && !isCompleted && !isFailed && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="relative w-16 h-16">
                                <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                                <div className="absolute inset-0 rounded-full border-4 border-action-blue border-t-transparent animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-action-blue" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-midnight-indigo">{statusLabel[status] || 'Đang xử lý...'}</p>
                                <p className="text-xs text-slate-blue mt-1">Vui lòng chờ trong giây lát. Trang có thể bị đóng, tiến trình vẫn chạy.</p>
                            </div>
                            {progress > 0 && (
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div className="bg-action-blue rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Phase 3: Hoàn thành */}
                    {isCompleted && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-midnight-indigo">Xuất file thành công!</p>
                                <p className="text-xs text-slate-blue mt-1">File {format.toUpperCase()} đã sẵn sàng để tải xuống.</p>
                            </div>
                            {downloadUrl ? (
                                <a
                                    href={downloadUrl}
                                    download
                                    className="flex items-center gap-2 px-6 py-3 bg-action-blue text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Tải xuống {format.toUpperCase()}
                                </a>
                            ) : (
                                <p className="text-xs text-slate-blue text-center">File đã được xử lý. Nếu không tự tải, liên hệ quản trị viên.</p>
                            )}
                        </div>
                    )}

                    {/* Phase 4: Lỗi */}
                    {isFailed && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="w-8 h-8 text-red-600" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-midnight-indigo">Xuất file thất bại</p>
                                <p className="text-xs text-slate-blue mt-1">{pollError || 'Có lỗi xảy ra. Vui lòng thử lại.'}</p>
                            </div>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-blue border border-platinum-tint hover:bg-cloud-mist rounded-xl transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Thử lại
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!jobId && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end gap-3">
                        <button onClick={handleClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all">
                            Hủy bỏ
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={submitting}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting
                                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                                : <><FileDown className="w-4 h-4" /> Xuất file</>
                            }
                        </button>
                    </div>
                )}

                {(isCompleted || isFailed) && (
                    <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end">
                        <button onClick={handleClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all">
                            Đóng
                        </button>
                    </div>
                )}
            </motion.div>
        </div>,
        document.body
    );
};

export default ExportMinutesModal;
