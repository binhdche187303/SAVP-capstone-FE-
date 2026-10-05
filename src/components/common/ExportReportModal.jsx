import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, CheckCircle, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { post, get } from '../../utils/request';

// BE bắt buộc from/to (YYYY-MM-DD) — quy đổi preset sang khoảng ngày theo giờ local.
const toYmd = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const presetToRange = (preset) => {
    const today = new Date();
    if (preset === 'week') {
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        return { from: toYmd(monday), to: toYmd(today) };
    }
    if (preset === 'month') {
        return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYmd(today) };
    }
    return { from: toYmd(today), to: toYmd(today) };
};

const ExportReportModal = ({
    isOpen,
    onClose,
    endpoint = '/reports/room-utilization/exports',
    title = 'Xuất báo cáo hiệu năng',
    formats = ['xlsx', 'pdf', 'csv'],
}) => {
    const [format, setFormat] = useState('xlsx');
    const [preset, setPreset] = useState('month');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    
    // Status
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(''); // queued, running, completed, failed
    const [outputFileId, setOutputFileId] = useState(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            // Reset state
            setFormat('xlsx');
            setPreset('month');
            setFrom('');
            setTo('');
            setLoading(false);
            setError(null);
            setJobId(null);
            setJobStatus('');
            setOutputFileId(null);
        }
    }, [isOpen]);

    // Polling job status
    useEffect(() => {
        let intervalId;
        if (jobId && (jobStatus === 'queued' || jobStatus === 'running')) {
            intervalId = setInterval(async () => {
                try {
                    const res = await get(`/background-jobs/${jobId}`);
                    if (res?.success) {
                        const status = res.data.status;
                        setJobStatus(status);
                        if (status === 'completed') {
                            setOutputFileId(res.data.outputFileId);
                            setLoading(false);
                            clearInterval(intervalId);
                        } else if (status === 'failed') {
                            setError(res.data.errorMessage || 'Xuất báo cáo thất bại.');
                            setLoading(false);
                            clearInterval(intervalId);
                        }
                    }
                } catch (err) {
                    setError('Lỗi khi kiểm tra tiến trình.');
                    setLoading(false);
                    clearInterval(intervalId);
                }
            }, 2000);
        }
        return () => clearInterval(intervalId);
    }, [jobId, jobStatus]);

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    const handleExport = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setJobStatus('queued');
        try {
            const range = preset === 'custom' ? { from, to } : presetToRange(preset);
            const payload = { format, ...range };
            const res = await post(endpoint, payload);
            if (res?.success) {
                setJobId(res.data.jobId);
                setJobStatus(res.data.status || 'queued');
            } else {
                throw new Error(res?.message || 'Không thể tạo tác vụ xuất báo cáo.');
            }
        } catch (err) {
            setError(err.message || 'Lỗi khi khởi tạo tác vụ.');
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!outputFileId) return;
        setDownloading(true);
        setError(null);
        try {
            // secure-download cần signed token → lấy downloadUrl (đã ký) từ API detail.
            const res = await get(`/media-files/${outputFileId}`);
            if (res?.success && res.data?.downloadUrl) {
                window.open(res.data.downloadUrl, '_blank');
            } else {
                setError(res?.message || 'Không thể tạo liên kết tải xuống.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Lỗi khi tải xuống báo cáo. Vui lòng thử lại.');
        } finally {
            setDownloading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col overflow-hidden animate-fade-in-up">
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                    <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                        <FileText className="w-5 h-5 text-action-blue" />
                        {title}
                    </h3>
                    <button 
                        onClick={onClose} 
                        disabled={loading}
                        className="text-slate-blue hover:text-midnight-indigo"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleExport} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start text-sm animate-fade-in-up">
                            <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {jobStatus === 'completed' && outputFileId && (
                        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl space-y-3 animate-fade-in-up">
                            <div className="flex items-start text-sm font-semibold text-green-700">
                                <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                                <p>Báo cáo đã sẵn sàng tải về!</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDownload}
                                disabled={downloading}
                                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                            >
                                {downloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Tải xuống file ({format.toUpperCase()})
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="p-6 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in-up">
                            <RefreshCw className="w-8 h-8 text-action-blue animate-spin" />
                            <div>
                                <p className="text-xs font-bold text-midnight-indigo">Đang tạo báo cáo...</p>
                                <p className="text-[10px] text-slate-blue mt-1">Trạng thái: {jobStatus === 'running' ? 'Đang chạy' : 'Đang chờ xếp hàng'}</p>
                            </div>
                        </div>
                    )}

                    {!loading && jobStatus !== 'completed' && (
                        <>
                            {/* Format Selection */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">Định dạng file</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {formats.map((fmt) => (
                                        <button
                                            key={fmt}
                                            type="button"
                                            onClick={() => setFormat(fmt)}
                                            className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all ${
                                                format === fmt 
                                                    ? 'border-action-blue bg-blue-50/50 text-action-blue shadow-sm' 
                                                    : 'border-platinum-tint hover:bg-slate-50 text-slate-blue'
                                            }`}
                                        >
                                            {fmt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preset Selection */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">Khoảng thời gian báo cáo</label>
                                <select
                                    value={preset}
                                    onChange={(e) => setPreset(e.target.value)}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo font-medium"
                                >
                                    <option value="day">Hôm nay</option>
                                    <option value="week">Tuần này</option>
                                    <option value="month">Tháng này</option>
                                    <option value="custom">Tùy chọn khoảng</option>
                                </select>
                            </div>

                            {preset === 'custom' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase">Từ ngày</label>
                                        <input 
                                            required
                                            type="date" 
                                            value={from} 
                                            onChange={(e) => setFrom(e.target.value)}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase">Đến ngày</label>
                                        <input 
                                            required
                                            type="date" 
                                            value={to} 
                                            onChange={(e) => setTo(e.target.value)}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button 
                                    type="button" 
                                    onClick={onClose}
                                    className="px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue hover:bg-cloud-mist"
                                >
                                    Đóng
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                                >
                                    Bắt đầu xuất
                                </button>
                            </div>
                        </>
                    )}
                </form>
            </div>
        </div>,
        document.body
    );
};

export default ExportReportModal;
