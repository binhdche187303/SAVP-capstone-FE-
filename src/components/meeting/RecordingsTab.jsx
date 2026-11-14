import RefreshButton from '../common/RefreshButton';
import React, { useEffect, useCallback } from 'react';
import {
    Film, RefreshCw, Play, Download, Clock, FileAudio,
    HardDrive, AlertCircle, CheckCircle, Loader, ExternalLink, Mic
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Chỉ nhận biết audio/video recordings — không nhầm với agenda attachments
const AUDIO_TYPES = ['audio/', 'video/', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm'];
const isRecordingFile = (file) => {
    if (!file) return false;
    const mt = (file.mimeType || file.mime_type || file.fileType || file.contentType || '').toLowerCase();
    if (mt && AUDIO_TYPES.some(t => mt.startsWith(t))) return true;
    // Nếu không có mimeType, kiểm tra extension
    const name = (file.fileName || file.file_name || file.title || '').toLowerCase();
    return /\.(mp3|wav|ogg|webm|mp4|m4a|aac|flac)$/.test(name);
};

const STATUS_MAP = {
    completed: { label: 'Hoàn thành', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle },
    recording: { label: 'Đang ghi', cls: 'bg-red-50 text-red-600 border-red-200', Icon: null },
    processing: { label: 'Đang xử lý', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: null },
    failed: { label: 'Thất bại', cls: 'bg-red-50 text-red-600 border-red-200', Icon: AlertCircle },
    stopped: { label: 'Đã dừng', cls: 'bg-slate-50 text-slate-600 border-slate-200', Icon: null },
};

const formatBytes = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
};

const formatDate = (str) => {
    if (!str) return '';
    return new Date(str).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

// ─── Component ────────────────────────────────────────────────────────────────

const RecordingsTab = ({
    meetingId,
    recordingSessions,
    setRecordingSessions,
    recordingsLoading,
    setRecordingsLoading,
    playbackUrls,
    setPlaybackUrls,
    formatDuration,
    meetingStatus,
}) => {
    const loadAll = useCallback(async () => {
        setRecordingsLoading(true);
        try {
            const { getRecordingSessions } = await import('../../service/managerServices');
            const res = await getRecordingSessions(meetingId);
            if (res?.success) setRecordingSessions(res.data || []);
        } catch (_) {
            try {
                const { getRecordingSessions: getEmp } = await import('../../service/employeeServices');
                const res = await getEmp(meetingId);
                if (res?.success) setRecordingSessions(res.data || []);
            } catch (__) { }
        } finally {
            setRecordingsLoading(false);
        }
    }, [meetingId, setRecordingSessions, setRecordingsLoading]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // BUG (2026-08-15): endpoint /playback trả binary audio thô, nhưng bị gọi qua
    // wrapper get() chỉ hiểu JSON (request.js không liệt kê audio/* trong danh sách
    // blob) → response.json() luôn throw. Dùng thẳng /media-files/:id (JSON, có sẵn
    // field downloadUrl — signed URL phát trực tiếp được) thay vì gọi /playback.
    // Xem BAO_CAO_LOI_FE_PHAT_LAI_GHI_AM_MAT_TIENG_2026-08-15.md.
    const handleGetPlayback = async (fileId) => {
        if (playbackUrls[fileId]) { window.open(playbackUrls[fileId], '_blank'); return; }
        let url = '';
        try {
            const { getMediaFile } = await import('../../service/managerServices');
            const res = await getMediaFile(fileId);
            url = res?.data?.downloadUrl || res?.data?.url || '';
        } catch (_) {
            try {
                const { getMediaFile: getMediaFileEmp } = await import('../../service/employeeServices');
                const res = await getMediaFileEmp(fileId);
                url = res?.data?.downloadUrl || res?.data?.url || '';
            } catch (__) { }
        }
        if (url) { setPlaybackUrls(prev => ({ ...prev, [fileId]: url })); window.open(url, '_blank'); }
    };

    const hasSessions = recordingSessions.length > 0;
    const isEmpty = !hasSessions;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-platinum-tint bg-white shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-sm">
                        <Film className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                        <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo">Quản lý ghi âm</p>
                        <p data-ui-text="secondary" className="text-[9px] text-slate-blue">{recordingSessions.length} phiên ghi âm</p>
                    </div>
                </div>
                <RefreshButton
                    onClick={loadAll}
                    disabled={recordingsLoading}
                    legacyClassName="p-1.5 rounded-lg text-slate-blue hover:text-action-blue hover:bg-blue-50 transition-colors disabled:opacity-50"
                    title="Làm mới"
                    busy={recordingsLoading}
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${recordingsLoading ? 'animate-spin' : ''}`} />
                </RefreshButton>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {recordingsLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <Loader className="w-6 h-6 text-action-blue animate-spin" />
                        <p className="text-xs text-slate-blue">Đang tải dữ liệu ghi âm...</p>
                    </div>
                )}

                {!recordingsLoading && isEmpty && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                            <FileAudio className="w-7 h-7 text-pale-gray" />
                        </div>
                        <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo">Chưa có bản ghi âm</p>
                        <p data-ui-text="secondary" className="text-[9px] text-slate-blue max-w-[180px] leading-relaxed">
                            Bắt đầu ghi âm từ tab Quản lý. Các tệp sẽ xuất hiện ở đây sau khi hoàn thành.
                        </p>
                    </div>
                )}

                {/* ── Phiên ghi âm ── */}
                {!recordingsLoading && hasSessions && (
                    <section>
                        <h4 data-ui-text="label" className="text-[9px] font-bold text-slate-blue uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Mic className="w-3 h-3 text-violet-500" /> Phiên ghi âm ({recordingSessions.length})
                        </h4>
                        <div className="space-y-2">
                            {recordingSessions.map((session, idx) => {
                                const info = STATUS_MAP[session.status] || STATUS_MAP['stopped'];
                                const { Icon } = info;
                                // Chỉ lấy file thật sự là audio/video — loại bỏ agenda attachments
                                const recordingFiles = (session.mediaFiles || []).filter(isRecordingFile);
                                return (
                                    <div key={session.id || idx}
                                        className="bg-white border border-platinum-tint rounded-xl p-3 hover:border-slate-200 hover:shadow-sm transition-all">
                                        <div className="flex items-start gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center shrink-0 shadow-sm">
                                                <Mic className="w-4 h-4 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo">Phiên #{idx + 1}</p>
                                                    <span data-ui-text="badge" className={`inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 border rounded font-bold ${info.cls}`}>
                                                        {Icon && <Icon className="w-2.5 h-2.5" />}
                                                        {session.status === 'recording' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                                        {info.label}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                                    {session.startedAt && <span data-ui-text="secondary" className="text-[9px] text-slate-blue">BĐ: {formatDate(session.startedAt)}</span>}
                                                    {session.endedAt && <span data-ui-text="secondary" className="text-[9px] text-slate-blue">KT: {formatDate(session.endedAt)}</span>}
                                                    {session.durationSeconds && (
                                                        <span data-ui-text="secondary" className="flex items-center gap-0.5 text-[9px] text-slate-blue">
                                                            <Clock className="w-2.5 h-2.5" />{formatDuration(session.durationSeconds)}
                                                        </span>
                                                    )}
                                                    {session.fileSizeBytes && (
                                                        <span data-ui-text="secondary" className="flex items-center gap-0.5 text-[9px] text-slate-blue">
                                                            <HardDrive className="w-2.5 h-2.5" />{formatBytes(session.fileSizeBytes)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Chỉ hiển thị tệp audio/video thật sự — không hiện agenda */}
                                        {recordingFiles.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {recordingFiles.map((mf, mfIdx) => (
                                                    <button key={mf.id || mfIdx} onClick={() => handleGetPlayback(mf.id)}
                                                        className="w-full flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left">
                                                        <Play className="w-3 h-3 text-action-blue shrink-0" />
                                                        <span data-ui-text="primary" className="text-[9px] font-semibold text-action-blue truncate flex-1">
                                                            {mf.title || mf.fileName || `Tệp ghi âm ${mfIdx + 1}`}
                                                        </span>
                                                        <ExternalLink className="w-2.5 h-2.5 text-action-blue shrink-0" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {!recordingsLoading && !isEmpty && (
                    <p data-ui-text="secondary" className="text-[9px] text-slate-400 text-center pb-2 leading-relaxed">
                        Sau khi phiên kết thúc, vào tab "Bản ghi (STT)" để chạy Speech to Text theo yêu cầu.<br />
                        Dữ liệu lưu trữ trong vòng 90 ngày.
                    </p>
                )}
            </div>
        </div>
    );
};

export default RecordingsTab;
