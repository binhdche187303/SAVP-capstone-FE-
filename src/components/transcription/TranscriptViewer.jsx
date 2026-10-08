import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, FileText, CheckCircle, AlertTriangle,
    RefreshCw, Edit3, Save, X, Loader2, Users, Trash2,
    Play, Pause
} from 'lucide-react';
import toast from '../../utils/toast';
import SpeakerMappingModal from './SpeakerMappingModal';
import {
    getTranscriptionJobs,
    getTranscript,
    updateTranscriptSegments,
    updateTranscriptStatus,
    deleteTranscript
} from '../../service/transcriptionServices';

const TranscriptViewer = ({ meetingId, isHost, mediaFiles }) => {
    const [status, setStatus] = useState('loading'); // loading, processing, ready, error, empty
    const [transcript, setTranscript] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Nghe lại đúng đoạn audio của 1 segment (hỗ trợ host đối chiếu khi sửa transcript).
    // File audio phải đúng recording session đã sinh ra transcript này — 1 meeting có
    // thể có nhiều audio track (session chính + track cá nhân từng người).
    const audioRef = useRef(null);
    const stopAtRef = useRef(null);
    const [playingSegmentId, setPlayingSegmentId] = useState(null);
    const audioUrl = useMemo(() => {
        const audioFiles = (mediaFiles || []).filter(f =>
            (f.fileType || f.type || f.file_type || '').toLowerCase() === 'audio' && f.downloadUrl
        );
        if (!audioFiles.length) return null;
        const sessionId = transcript?.recordingSessionId;
        const matched = sessionId && audioFiles.find(f => (f.recordingSessionId || f.recording_session_id) === sessionId);
        // Fallback: track ghi âm chính (không phải track cá nhân) nếu không match được session.
        const fallback = audioFiles.find(f => !f.channelUserId) || audioFiles[0];
        return (matched || fallback)?.downloadUrl || null;
    }, [mediaFiles, transcript?.recordingSessionId]);

    // Edit state
    const [editingSegmentId, setEditingSegmentId] = useState(null);
    const [editForm, setEditForm] = useState({ text: '', speakerLabel: '', revisionNote: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isChangingStatus, setIsChangingStatus] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Speaker Mapping Modal state
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    
    const [errorMsg, setErrorMsg] = useState('');

    const fetchJobs = useCallback(async () => {
        try {
            const res = await getTranscriptionJobs(meetingId);
            if (res?.success) {
                const currentJobs = res.data || [];
                setJobs(currentJobs);
                
                // Chỉ xét job MỚI NHẤT (BE đã sort newest-first theo completedAt/startedAt).
                // Không dùng .some() trên toàn bộ mảng — 1 job cũ bị kẹt (vd: worker chưa
                // bao giờ nhặt lên chạy) sẽ khóa UI vĩnh viễn dù job mới nhất đã xong.
                const latestJob = currentJobs[0];
                const hasProcessing = !!latestJob && (
                    latestJob.status === 'queued' ||
                    latestJob.status === 'running' ||
                    latestJob.status === 'scheduled' ||
                    latestJob.status === 'retrying' ||
                    latestJob.transcriptStatus === 'processing'
                );

                if (hasProcessing) {
                    setStatus('processing');
                    return 'poll'; // continue polling
                } else if (currentJobs.length > 0) {
                    setStatus('loading');
                    return 'fetch'; // stop polling, fetch transcript
                } else {
                    setStatus('empty');
                    return 'empty';
                }
            }
        } catch (err) {
            // Ignore if 404/empty
            setStatus('empty');
            return 'empty';
        }
        return 'empty';
    }, [meetingId]);

    const fetchTranscript = useCallback(async () => {
        try {
            setStatus('loading');
            const res = await getTranscript(meetingId, { includeSegments: true, limit: 1000 });
            if (res?.success && res.data) {
                setTranscript(res.data);
                setStatus('ready');
            } else {
                setStatus('empty');
            }
        } catch (err) {
            if (err.status === 404 || err.error?.code === 'NOT_FOUND' || (err.error?.message && err.error.message.includes('Không tìm thấy'))) {
                setStatus('empty');
            } else {
                setErrorMsg(err.error?.message || err.message || 'Không thể tải chi tiết transcript.');
                setStatus('error');
            }
        }
    }, [meetingId]);

    // Polling Logic
    useEffect(() => {
        let cancelled = false;
        let timeoutId;
        const checkStatus = async () => {
            const action = await fetchJobs();
            if (cancelled) return;
            if (action === 'poll') {
                timeoutId = setTimeout(checkStatus, 3000); // poll every 3s
            } else if (action === 'fetch') {
                fetchTranscript();
            }
        };

        checkStatus();

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [fetchJobs, fetchTranscript]); // eslint-disable-line react-hooks/exhaustive-deps

    // Toast auto-hide
    const showToast = (message, type = 'success') => {
        toast[type]?.(message) ?? toast.info(message);
    };

    // Tự dừng audio đúng lúc hết đoạn (endMs) thay vì phát tràn sang câu kế tiếp.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const stopIfPastSegment = () => {
            if (stopAtRef.current != null && audio.currentTime >= stopAtRef.current) {
                audio.pause();
                setPlayingSegmentId(null);
                stopAtRef.current = null;
            }
        };
        const clearPlaying = () => { setPlayingSegmentId(null); stopAtRef.current = null; };
        audio.addEventListener('timeupdate', stopIfPastSegment);
        audio.addEventListener('ended', clearPlaying);
        audio.addEventListener('pause', clearPlaying);
        return () => {
            audio.removeEventListener('timeupdate', stopIfPastSegment);
            audio.removeEventListener('ended', clearPlaying);
            audio.removeEventListener('pause', clearPlaying);
        };
    }, []);

    // Nguồn audio đổi (vd transcript được refetch sau khi chạy STT lại) — dừng phát
    // để không giữ state trỏ vào 1 segment đã không còn khớp file audio hiện tại.
    useEffect(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) audio.pause();
        setPlayingSegmentId(null);
        stopAtRef.current = null;
    }, [audioUrl]);

    const handlePlaySegment = (segment) => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;
        if (playingSegmentId === segment.segmentId) {
            audio.pause(); // trigger 'pause' listener ở trên -> tự clear state
            return;
        }
        const startSec = (segment.startMs || 0) / 1000;
        const endSec = segment.endMs ? segment.endMs / 1000 : startSec + 5;
        stopAtRef.current = endSec;
        audio.currentTime = startSec;
        setPlayingSegmentId(segment.segmentId);
        audio.play().catch(() => { setPlayingSegmentId(null); stopAtRef.current = null; });
    };

    const handleEditClick = (segment) => {
        if (!isHost) return;
        setEditingSegmentId(segment.segmentId);
        setEditForm({ text: segment.text, speakerLabel: segment.speakerLabel || '', revisionNote: '' });
    };

    const handleSaveEdit = async () => {
        if (!editingSegmentId || !transcript) return;
        setIsSaving(true);
        try {
            const res = await updateTranscriptSegments(
                transcript.transcriptId,
                [{ segmentId: editingSegmentId, text: editForm.text, speakerLabel: editForm.speakerLabel }],
                editForm.revisionNote || undefined
            );

            if (res?.success && res.data?.updatedSegments?.includes(editingSegmentId)) {
                showToast('Cập nhật nội dung thành công!');
                // BE chỉ trả về danh sách segmentId đã sửa + metadata audit — nội dung mới lấy từ editForm cục bộ
                setTranscript(prev => ({
                    ...prev,
                    segments: prev.segments.map(seg =>
                        seg.segmentId === editingSegmentId
                        ? { ...seg, text: editForm.text, speakerLabel: editForm.speakerLabel }
                        : seg
                    )
                }));
            } else {
                showToast('Lỗi khi cập nhật', 'error');
            }
        } catch (err) {
            showToast(err?.error?.message || err?.message || 'Lỗi kết nối', 'error');
        } finally {
            setIsSaving(false);
            setEditingSegmentId(null);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!transcript || isChangingStatus) return;
        setIsChangingStatus(true);
        try {
            const res = await updateTranscriptStatus(transcript.transcriptId, newStatus);
            if (res?.success) {
                showToast(newStatus === 'approved' ? 'Đã duyệt toàn bộ biên bản!' : 'Đã đánh dấu đã xem.');
                setTranscript(prev => ({ ...prev, status: res.data?.status || newStatus }));
            } else {
                showToast(res?.message || 'Không thể chuyển trạng thái.', 'error');
            }
        } catch (err) {
            if (err?.error?.code === 'INVALID_TRANSCRIPT_STATUS_TRANSITION') {
                showToast('Transcript đã ở trạng thái cuối, không thể chuyển tiếp.', 'error');
            } else {
                showToast(err?.error?.message || err?.message || 'Không thể chuyển trạng thái.', 'error');
            }
        } finally {
            setIsChangingStatus(false);
        }
    };

    const handleDeleteTranscript = async () => {
        if (!transcript || isDeleting) return;
        if (!window.confirm('Xóa nội dung transcript này? Thao tác không thể hoàn tác.')) return;

        setIsDeleting(true);
        try {
            const res = await deleteTranscript(transcript.transcriptId);
            if (res?.success) {
                showToast('Đã xóa transcript.');
                setTranscript(null);
                setJobs([]);
                setStatus('empty');
            } else {
                showToast(res?.message || 'Không thể xóa transcript.', 'error');
            }
        } catch (err) {
            if (err?.error?.code === 'TRANSCRIPT_NOT_DRAFT') {
                showToast('Transcript đã được xem/duyệt, không thể xóa.', 'error');
            } else {
                showToast(err?.error?.message || err?.message || 'Không thể xóa transcript.', 'error');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    // Filter segments
    const filteredSegments = (transcript?.segments || []).filter(s => 
        (s.text || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (s.speakerLabel || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    const transcriptWarnings = Array.isArray(transcript?.warnings) ? transcript.warnings : [];
    const rawConfidenceScore = Number(transcript?.confidenceScore);
    const normalizedConfidenceScore = Number.isFinite(rawConfidenceScore)
        ? (rawConfidenceScore > 1 ? rawConfidenceScore / 100 : rawConfidenceScore)
        : null;
    const hasTranscriptSegments = (transcript?.segments || []).length > 0;
    const passesDisplayThreshold = normalizedConfidenceScore !== null && normalizedConfidenceScore > 0.6;
    const hasUnreliableSpeechWarning = transcriptWarnings.includes('no_reliable_speech_detected');
    const isUnreliableTranscript = hasUnreliableSpeechWarning && !passesDisplayThreshold;
    const shouldShowQualityWarning = hasUnreliableSpeechWarning && passesDisplayThreshold;
    const shouldShowConfidenceScore = normalizedConfidenceScore !== null && (hasTranscriptSegments || normalizedConfidenceScore > 0);

    // Renders
    if (status === 'processing') {
        return (
            <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-8 text-center space-y-5 animate-pulse">
                <div className="w-16 h-16 bg-purple-50 rounded-full mx-auto flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wider mb-2">Đang xử lý Speech-to-Text</h3>
                    <p className="text-xs text-slate-blue max-w-sm mx-auto leading-relaxed">
                        Hệ thống AI đang phân tích và chuyển đổi giọng nói thành văn bản. Quá trình này có thể mất vài phút tùy thuộc vào độ dài âm thanh...
                    </p>
                </div>
                <div className="flex justify-center gap-2">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        );
    }

    if (status === 'empty') {
        return (
            <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-8 text-center">
                <FileText className="w-10 h-10 text-platinum-tint mx-auto mb-3" />
                <h3 className="text-sm font-bold text-midnight-indigo uppercase">Chưa có Transcript</h3>
                <p className="text-xs text-slate-blue mt-1">Cuộc họp này chưa có dữ liệu STT. Tải file âm thanh lên hoặc bấm "Chạy Speech to Text" trên bản ghi có sẵn để tạo transcript.</p>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-6 text-center text-red-600">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm font-bold">{errorMsg}</p>
                <button onClick={fetchTranscript} className="mt-3 px-4 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors">Thử lại</button>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 flex flex-col h-[600px] overflow-hidden relative">
            {/* Player ẩn dùng chung để phát lại từng đoạn (nghe đối chiếu khi sửa transcript) */}
            {audioUrl && <audio ref={audioRef} src={audioUrl} preload="none" className="hidden" />}
            {/* Header */}
            <div className="p-5 border-b border-platinum-tint flex flex-col sm:flex-row justify-between items-center gap-4 bg-cloud-mist/30">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-action-blue" />
                    <div>
                        <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wider">Nội dung cuộc họp (Transcript)</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                transcript?.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                                transcript?.status === 'reviewed' ? 'bg-blue-100 text-blue-700' : 
                                'bg-purple-100 text-purple-700'
                            }`}>
                                {transcript?.status || 'Bản nháp'}
                            </span>
                            {shouldShowConfidenceScore ? (
                                <span className="text-[10px] text-slate-blue font-medium">Độ chính xác: {(normalizedConfidenceScore * 100).toFixed(0)}%</span>
                            ) : hasUnreliableSpeechWarning ? (
                                <span className="text-[10px] text-amber-600 font-bold">Không đủ dữ liệu phiên âm</span>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-48">
                        <input
                            type="text"
                            placeholder="Tìm kiếm nội dung..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue focus:ring-1 focus:ring-action-blue"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-blue absolute left-2.5 top-2" />
                    </div>
                    
                    {isHost && transcript?.status === 'draft' && (
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setIsMappingModalOpen(true)}
                                className="px-3 py-1.5 bg-white border border-platinum-tint text-action-blue hover:bg-blue-50 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                                <Users className="w-3.5 h-3.5" /> Gán người nói
                            </button>
                            <button
                                onClick={() => handleStatusChange('reviewed')}
                                disabled={isChangingStatus}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                                <CheckCircle className="w-3.5 h-3.5" /> Đánh dấu đã xem
                            </button>
                            <button
                                onClick={handleDeleteTranscript}
                                disabled={isDeleting}
                                title="Xóa transcript chưa xem"
                                className="px-3 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Xóa
                            </button>
                        </div>
                    )}
                    {isHost && transcript?.status === 'reviewed' && (
                        <button
                            onClick={() => handleStatusChange('approved')}
                            disabled={isChangingStatus}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1 shrink-0 shadow-sm disabled:opacity-50"
                        >
                            <CheckCircle className="w-3.5 h-3.5" /> Duyệt toàn bộ
                        </button>
                    )}
                </div>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin bg-cloud-mist/10">
                {shouldShowQualityWarning && (
                    <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                            Âm thanh có cảnh báo chất lượng, nhưng độ chính xác trên 60% nên hệ thống vẫn hiển thị transcript để kiểm tra và chỉnh sửa.
                        </p>
                    </div>
                )}
                {isUnreliableTranscript && (
                    <div className="text-center py-12 px-4">
                        <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto mb-3" />
                        <h4 className="text-sm font-bold text-midnight-indigo">Âm thanh không đủ rõ để phiên âm</h4>
                        <p className="text-xs text-slate-blue mt-2 max-w-md mx-auto leading-relaxed">
                            AI không tạo được đoạn lời nói đáng tin cậy từ file này nên độ chính xác được ghi nhận là 0%. Vui lòng kiểm tra lại âm lượng, tiếng ồn, thời lượng nói hoặc tải lên bản ghi rõ hơn.
                        </p>
                    </div>
                )}
                {!isUnreliableTranscript && filteredSegments.map((segment) => {
                    const isLowConfidence = segment.lowConfidence || segment.manualReviewRequired;
                    const isEditing = editingSegmentId === segment.segmentId;
                    
                    // Format time
                    const startSec = Math.floor((segment.startMs || 0) / 1000);
                    const timeStr = `${Math.floor(startSec / 60)}:${(startSec % 60).toString().padStart(2, '0')}`;

                    return (
                        <motion.div 
                            key={segment.segmentId}
                            layout
                            className={`p-3 rounded-2xl border transition-all ${
                                isEditing ? 'bg-white border-action-blue shadow-md' :
                                isLowConfidence ? 'bg-amber-50/40 border-amber-200/60 hover:bg-amber-50' : 
                                'bg-white border-platinum-tint hover:bg-cloud-mist/50'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-1.5">
                                {isEditing ? (
                                    <input 
                                        type="text" 
                                        value={editForm.speakerLabel} 
                                        onChange={(e) => setEditForm(prev => ({...prev, speakerLabel: e.target.value}))}
                                        className="text-xs font-bold text-midnight-indigo border-b border-platinum-tint focus:border-action-blue outline-none px-1 py-0.5"
                                        placeholder="Tên người nói"
                                    />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-midnight-indigo">
                                            {segment.displayName ? segment.displayName :
                                             segment.speakerLabel === 'unknown' ? 'Chưa xác định' :
                                             segment.speakerLabel?.startsWith('Speaker_') ? segment.speakerLabel.replace('Speaker_', 'Người nói ') :
                                             segment.speakerLabel}
                                        </span>
                                        {isLowConfidence && !isEditing && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md font-bold flex items-center gap-1" title="Độ chính xác thấp, cần kiểm tra lại">
                                                <AlertTriangle className="w-3 h-3" /> Chú ý
                                            </span>
                                        )}
                                    </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                    {audioUrl && (
                                        <button
                                            onClick={() => handlePlaySegment(segment)}
                                            className={`p-1 rounded transition-colors ${
                                                playingSegmentId === segment.segmentId
                                                    ? 'text-action-blue bg-blue-50'
                                                    : 'text-slate-blue hover:text-action-blue hover:bg-blue-50'
                                            }`}
                                            title={playingSegmentId === segment.segmentId ? 'Dừng' : 'Nghe lại đoạn này'}
                                        >
                                            {playingSegmentId === segment.segmentId
                                                ? <Pause className="w-3.5 h-3.5" />
                                                : <Play className="w-3.5 h-3.5" />}
                                        </button>
                                    )}
                                    <span className="text-[10px] text-slate-blue font-mono font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                                        {timeStr}
                                    </span>
                                    {isHost && !isEditing && transcript?.status !== 'approved' && (
                                        <button 
                                            onClick={() => handleEditClick(segment)}
                                            className="p-1 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded transition-colors"
                                            title="Sửa nội dung"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {isEditing ? (
                                <div className="mt-2 space-y-2">
                                    <textarea
                                        value={editForm.text}
                                        onChange={(e) => setEditForm(prev => ({...prev, text: e.target.value}))}
                                        className="w-full min-h-[60px] p-2 text-xs border border-platinum-tint rounded-lg focus:outline-none focus:border-action-blue focus:ring-1 focus:ring-action-blue resize-none leading-relaxed"
                                    />
                                    <input
                                        type="text"
                                        value={editForm.revisionNote}
                                        onChange={(e) => setEditForm(prev => ({...prev, revisionNote: e.target.value}))}
                                        placeholder="Ghi chú lý do sửa (tuỳ chọn)"
                                        className="w-full p-2 text-[11px] border border-platinum-tint rounded-lg focus:outline-none focus:border-action-blue focus:ring-1 focus:ring-action-blue"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => setEditingSegmentId(null)}
                                            disabled={isSaving}
                                            className="px-3 py-1.5 border border-platinum-tint text-slate-blue rounded-lg text-[11px] font-bold hover:bg-cloud-mist transition-colors"
                                        >
                                            Hủy
                                        </button>
                                        <button 
                                            onClick={handleSaveEdit}
                                            disabled={isSaving}
                                            className="px-3 py-1.5 bg-action-blue text-white rounded-lg text-[11px] font-bold hover:bg-glacier-blue transition-colors flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                            Lưu
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className={`text-xs leading-relaxed ${isLowConfidence ? 'text-amber-900' : 'text-slate-700'}`}>
                                    {segment.text}
                                </p>
                            )}
                        </motion.div>
                    );
                })}
                {!isUnreliableTranscript && filteredSegments.length === 0 && (
                    <div className="text-center py-10">
                        <Search className="w-8 h-8 text-platinum-tint mx-auto mb-2" />
                        <p className="text-xs text-slate-blue italic">Không tìm thấy nội dung phù hợp.</p>
                    </div>
                )}
            </div>
            {/* Speaker Mapping Modal */}
            <SpeakerMappingModal
                isOpen={isMappingModalOpen}
                onClose={() => setIsMappingModalOpen(false)}
                transcriptId={transcript?.id || transcript?.transcriptId}
                meetingId={meetingId}
                onMappingSuccess={() => {
                    fetchTranscript(); // Refresh to show new names
                }}
            />
        </div>
    );
};

export default TranscriptViewer;
