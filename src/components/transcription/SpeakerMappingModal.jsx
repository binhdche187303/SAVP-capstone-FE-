import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, AlertCircle, CheckCircle, Headphones } from 'lucide-react';
import { getTranscriptSpeakers, updateSpeakerMappings } from '../../service/transcriptionServices';
import { getMeetingById as getMeetingEmployee, getMeetingMediaFiles as getMediaEmp, getMediaFile as getFileEmp } from '../../service/employeeServices';
import { getMeetingById as getMeetingManager, getMeetingMediaFiles as getMediaMgr, getMediaFile as getFileMgr } from '../../service/managerServices';
import UserAvatar, { resolveAvatarUrl } from '../common/UserAvatar';

const SpeakerMappingModal = ({ isOpen, onClose, transcriptId, meetingId, onMappingSuccess }) => {
    const [speakers, setSpeakers] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mappings, setMappings] = useState({}); // { speakerLabel: participantId }
    const [errorMsg, setErrorMsg] = useState('');
    const [resultData, setResultData] = useState(null); // To show merged/conflicts after save
    const [audioUrl, setAudioUrl] = useState(null);
    const audioRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !transcriptId) return;
        
        const loadData = async () => {
            setLoading(true);
            setErrorMsg('');
            setResultData(null);
            
            try {
                // Fetch speakers (B4)
                const resSpeakers = await getTranscriptSpeakers(transcriptId);
                if (resSpeakers?.success) {
                    setSpeakers(resSpeakers.data?.items || resSpeakers.data || []);
                } else {
                    throw new Error(resSpeakers?.error?.message || 'Lỗi khi tải danh sách người nói');
                }

                // Fetch participants
                let meetingData = null;
                try {
                    const resEmp = await getMeetingEmployee(meetingId);
                    if (resEmp?.success) meetingData = resEmp.data;
                } catch (e) {
                    const resMgr = await getMeetingManager(meetingId);
                    if (resMgr?.success) meetingData = resMgr.data;
                }
                
                if (meetingData?.participants) {
                    setParticipants(meetingData.participants);
                }

                // Fetch media files to get audio downloadUrl
                let fetchedAudioUrl = null;
                try {
                    let mediaRes = await getMediaEmp(meetingId);
                    if (!mediaRes?.success) throw new Error();
                    const audioFile = mediaRes.data?.find(f => (f.fileType || f.file_type || '').toLowerCase() === 'audio');
                    if (audioFile) {
                        const fileRes = await getFileEmp(audioFile.id);
                        if (fileRes?.success) fetchedAudioUrl = fileRes.data?.downloadUrl;
                    }
                } catch (e) {
                    try {
                        let mediaRes = await getMediaMgr(meetingId);
                        if (mediaRes?.success) {
                            const audioFile = mediaRes.data?.find(f => (f.fileType || f.file_type || '').toLowerCase() === 'audio');
                            if (audioFile) {
                                const fileRes = await getFileMgr(audioFile.id);
                                if (fileRes?.success) fetchedAudioUrl = fileRes.data?.downloadUrl;
                            }
                        }
                    } catch (err) {}
                }
                setAudioUrl(fetchedAudioUrl);

                // Init mappings từ dữ liệu đã gán trước đó (nếu có)
                const initialMappings = {};
                (resSpeakers.data?.items || resSpeakers.data || []).forEach(spk => {
                    if (spk.currentMapping?.mappedUserId) {
                        initialMappings[spk.speakerLabel] = spk.currentMapping.mappedUserId;
                    }
                });
                setMappings(initialMappings);

            } catch (err) {
                setErrorMsg(err.message);
            } finally {
                setLoading(false);
            }
        };
        
        loadData();
    }, [isOpen, transcriptId, meetingId]);

    const handleSelectParticipant = (speakerLabel, participantId) => {
        setMappings(prev => ({ ...prev, [speakerLabel]: participantId }));
    };

    const handleSave = async () => {
        setSaving(true);
        setErrorMsg('');
        try {
            // Build B5 payload
            const mappingPayload = Object.entries(mappings).map(([speakerLabel, participantId]) => {
                if (!participantId) return null;
                const p = participants.find(part => part.id === participantId || part.userId === participantId || part.user_id === participantId);
                if (!p) return null;
                
                return {
                    speakerLabel,
                    speakerUserId: p.userId || p.user_id || p.id,
                    displayName: p.fullName || p.full_name
                };
            }).filter(Boolean);

            if (mappingPayload.length === 0) {
                throw new Error('Vui lòng gán ít nhất một người nói.');
            }

            const res = await updateSpeakerMappings(transcriptId, mappingPayload);
            if (res?.success) {
                setResultData(res.data);
                if (onMappingSuccess) onMappingSuccess();
                // We keep modal open to show merged/conflicts, user must click close
            } else {
                if ((res?.error?.code === 400 && res?.error?.details?.code === 'SPEAKER_MAPPING_CONFLICT') || res?.error?.code === 409) {
                    setErrorMsg('Có xung đột với mốc gán thủ công (conflict). Vui lòng thử lại.');
                } else {
                    setErrorMsg(res?.error?.message || 'Lỗi khi lưu.');
                }
            }
        } catch (err) {
            setErrorMsg(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-indigo/40 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
                >
                    <div className="flex justify-between items-center px-6 py-4 border-b border-platinum-tint bg-cloud-mist/50">
                        <div>
                            <h2 className="text-lg font-extrabold text-midnight-indigo">Gán danh tính người nói</h2>
                            <p data-ui-text="primary" className="text-xs font-semibold text-slate-blue mt-0.5">Xác định ai là ai dựa vào mẫu âm thanh</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 bg-white rounded-xl text-slate-blue hover:text-red-500 hover:bg-red-50 transition-all border border-platinum-tint"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm font-semibold text-slate-blue mt-4">Đang phân tích các cụm giọng nói...</p>
                            </div>
                        ) : resultData ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-bold text-emerald-700">Đã gán thành công!</h4>
                                        <p className="text-xs text-emerald-600 mt-1">Các đoạn hội thoại đã được cập nhật tên.</p>
                                    </div>
                                </div>
                                
                                {resultData.conflicts && resultData.conflicts.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-amber-700">Phát hiện mâu thuẫn ({resultData.conflicts.length})</h4>
                                            <p className="text-xs text-amber-600 mt-1">Một số cụm giọng nói có sự chồng chéo với mốc gán thủ công (C2).</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end pt-4 border-t border-platinum-tint">
                                    <button onClick={onClose} className="px-5 py-2 bg-action-blue text-white rounded-xl text-sm font-bold hover:bg-glacier-blue transition-colors">
                                        Hoàn tất & Đóng
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {errorMsg && (
                                    <div data-ui-text="badge" className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold border border-red-100 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {errorMsg}
                                    </div>
                                )}

                                <div data-ui-text="badge" className="text-[11px] font-semibold text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 mb-4">
                                    Mẹo: Nghe đoạn mẫu và đọc nội dung văn bản bên dưới để dễ dàng nhận diện xem "Người nói X" là ai.
                                </div>

                                {speakers.length === 0 ? (
                                    <div className="text-center py-10 text-slate-blue text-sm font-semibold">
                                        Không tìm thấy cụm giọng nói nào cần gán.
                                    </div>
                                ) : (
                                    <div className="grid gap-4">
                                        {speakers.map((spk, index) => (
                                            <div key={spk.speakerLabel} className="bg-white border border-platinum-tint rounded-2xl p-4 flex gap-4 shadow-sm-1 hover:border-blue-200 transition-colors">
                                                <div className="w-20 shrink-0 flex flex-col items-center justify-center">
                                                    <div className="w-12 h-12 bg-cloud-mist rounded-full flex items-center justify-center mb-2">
                                                        <Headphones className="w-5 h-5 text-slate-blue" />
                                                    </div>
                                                    <span data-ui-text="primary" className="text-xs font-extrabold text-midnight-indigo text-center">
                                                        {spk.speakerLabel === 'unknown' ? 'Chưa xác định' : spk.speakerLabel.replace('Speaker_', 'Người nói ')}
                                                    </span>
                                                </div>
                                                
                                                <div className="flex-1 flex flex-col justify-center border-l border-platinum-tint pl-4">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span data-ui-text="code" className="text-[10px] font-mono font-bold text-action-blue bg-blue-50 px-2 py-0.5 rounded">
                                                            {Math.floor((spk.totalSpeakingMs || 0) / 1000 / 60)} phút {Math.floor(((spk.totalSpeakingMs || 0) / 1000) % 60)} giây
                                                        </span>
                                                        <span data-ui-text="primary" className="text-[10px] font-bold text-slate-blue">
                                                            {spk.segmentCount || 0} đoạn
                                                        </span>
                                                    </div>
                                                    <div data-ui-text="badge" className="text-xs italic text-slate-blue line-clamp-2 bg-cloud-mist/50 p-2 rounded-lg border border-platinum-tint/50">
                                                        "{spk.sampleText || 'Không có đoạn text mẫu'}"
                                                    </div>
                                                </div>

                                                <div className="w-56 shrink-0 flex flex-col justify-center gap-3 pl-4 border-l border-platinum-tint">
                                                    <button data-ui-text="action"
                                                        className="w-full py-1.5 bg-white border border-platinum-tint text-action-blue hover:bg-blue-50 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                        disabled={!audioUrl}
                                                        onClick={() => {
                                                            if (audioRef.current && audioUrl) {
                                                                audioRef.current.currentTime = (spk.sampleStartMs || 0) / 1000;
                                                                audioRef.current.play();
                                                            }
                                                        }}
                                                    >
                                                        <Play className="w-3.5 h-3.5" /> Nghe thử đoạn mẫu
                                                    </button>

                                                    <select
                                                        value={mappings[spk.speakerLabel] || ''}
                                                        onChange={(e) => handleSelectParticipant(spk.speakerLabel, e.target.value)}
                                                        className="w-full text-xs font-semibold text-midnight-indigo border-platinum-tint focus:border-action-blue focus:ring-action-blue rounded-lg py-1.5 px-2 bg-cloud-mist"
                                                    >
                                                        <option value="">-- Chọn người dự họp --</option>
                                                        {participants.map(p => (
                                                            <option key={p.id || p.userId || p.user_id} value={p.id || p.userId || p.user_id}>
                                                                {p.fullName || p.full_name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {!resultData && (
                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="px-5 py-2 text-slate-blue bg-white border border-platinum-tint hover:bg-cloud-mist rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || Object.keys(mappings).length === 0}
                                className="px-5 py-2 bg-action-blue text-white rounded-xl text-xs font-bold shadow-md shadow-action-blue/20 hover:bg-glacier-blue transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {saving ? (
                                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Đang lưu...</>
                                ) : (
                                    <>Lưu tất cả</>
                                )}
                            </button>
                        </div>
                    )}
                    
                    {audioUrl && (
                        <audio ref={audioRef} src={audioUrl} className="hidden" />
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default SpeakerMappingModal;
