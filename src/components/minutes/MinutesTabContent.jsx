import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Sparkles, Plus, AlertTriangle, Loader2, Lock, PenLine, Columns2 } from 'lucide-react';
import {
    getAiDraftConfig,
    createAiDraftJob,
    getAiDraftJobs,
    createManualMinutes,
    getMeetingMinutesById,
    compareMeetingMinutes
} from '../../service/minutesServices';
import { get } from '../../utils/request';
import { getSocket, subscribeToMeeting } from '../../utils/socket';

import AiGeneratorProgress from './AiGeneratorProgress';
import MinutesViewerEditor from './MinutesViewerEditor';
import CreateManualMinutesModal from './CreateManualMinutesModal';

const MinutesTabContent = ({ meetingId, isHost, isSecretary = false, transcriptStatus, allowAiCreate = true }) => {
    // Thư ký được soạn biên bản thủ công; AI + ban hành vẫn chỉ chủ trì.
    const canCompose = isHost || isSecretary;
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, empty, ai_running, has_minutes, error
    const [manualSummary, setManualSummary] = useState(null); // MinutesListItemDto | null — nguồn 'manual'
    const [aiSummary, setAiSummary] = useState(null); // MinutesListItemDto | null — nguồn 'ai'
    const [manualDetail, setManualDetail] = useState(null); // MinutesDetailResponseDto đầy đủ
    const [aiDetail, setAiDetail] = useState(null);
    const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'ai' | 'compare'
    const [activeJobId, setActiveJobId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [showCreateManualModal, setShowCreateManualModal] = useState(false);
    const [creatingManual, setCreatingManual] = useState(false);

    // MKM-MANUAL-01: 1 meeting có thể có song song tối đa 2 biên bản active
    // (1 nguồn 'manual', 1 nguồn 'ai'). Fetch cả 2 qua endpoint compare, rồi
    // tải chi tiết đầy đủ cho bên nào đang tồn tại để MinutesViewerEditor dùng.
    const fetchState = useCallback(async () => {
        setStatus('loading');
        try {
            // 1. Fetch AI config — chỉ host mới có quyền truy cập endpoint này
            if (isHost) {
                const cfgRes = await getAiDraftConfig(meetingId);
                if (cfgRes?.success) {
                    setConfig(cfgRes.data);
                }

                // 2. Fetch active AI jobs — chỉ host mới có quyền
                const jobsRes = await getAiDraftJobs(meetingId);
                if (jobsRes?.success && jobsRes.data?.length > 0) {
                    const latestJob = jobsRes.data[0];
                    if (latestJob.status === 'queued' || latestJob.status === 'scheduled' || latestJob.status === 'running') {
                        setActiveJobId(latestJob.jobId);
                        setStatus('ai_running');
                        return;
                    }
                }
            }

            // 3. So sánh song song 2 nguồn — thay cho việc chỉ lấy 1 bản ghi duy nhất trước đây
            const cmpRes = await compareMeetingMinutes(meetingId);
            const manual = cmpRes?.success ? cmpRes.data?.manual ?? null : null;
            const ai = cmpRes?.success ? cmpRes.data?.ai ?? null : null;
            setManualSummary(manual);
            setAiSummary(ai);

            if (!manual && !ai) {
                setManualDetail(null);
                setAiDetail(null);
                setStatus('empty');
                return;
            }

            const [manualDetailRes, aiDetailRes] = await Promise.all([
                manual ? getMeetingMinutesById(manual.id) : Promise.resolve(null),
                ai ? getMeetingMinutesById(ai.id) : Promise.resolve(null),
            ]);
            setManualDetail(manualDetailRes?.success ? manualDetailRes.data : null);
            setAiDetail(aiDetailRes?.success ? aiDetailRes.data : null);

            // Giữ nguyên tab đang xem nếu vẫn còn hợp lệ, không thì fallback về bên đang có
            setActiveTab((prev) => {
                if (prev === 'compare' && manual && ai) return 'compare';
                if (prev === 'ai' && ai) return 'ai';
                if (prev === 'manual' && manual) return 'manual';
                return manual ? 'manual' : 'ai';
            });
            setStatus('has_minutes');
        } catch (err) {
            console.error('Error fetching minutes state:', err);
            // Default to empty if not found, rather than blocking the UI with error
            if (err?.message?.includes('404')) {
                setStatus('empty');
            } else {
                setErrorMsg('Không thể tải thông tin biên bản. Vui lòng thử lại sau.');
                setStatus('error');
            }
        }
    }, [meetingId, isHost]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    // MKM-LIVE-01: subscribe room meeting:${meetingId} — mirror đúng pattern
    // subscribeToMeeting/getSocket đã dùng ở MeetingAttendanceBoard.jsx (KHÔNG
    // tự nghĩ cách kết nối mới). Bất kỳ tín hiệu live-share nào (bật/tắt/có
    // nội dung mới) đều refetch qua đúng fetchState() hiện có — debounce nhẹ
    // để tránh gọi API dồn dập khi Host lưu liên tục (spec mục 4.4).
    const refreshTimerRef = useRef(null);
    useEffect(() => {
        if (!meetingId) return;
        const cleanup = subscribeToMeeting(meetingId);
        const s = getSocket();
        const scheduleRefresh = (payload) => {
            if (payload?.meetingId && payload.meetingId !== meetingId) return;
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
                fetchState();
            }, 600);
        };
        s.on('minutes.draft.live_started', scheduleRefresh);
        s.on('minutes.draft.live_stopped', scheduleRefresh);
        s.on('minutes.draft.updated', scheduleRefresh);
        return () => {
            s.off('minutes.draft.live_started', scheduleRefresh);
            s.off('minutes.draft.live_stopped', scheduleRefresh);
            s.off('minutes.draft.updated', scheduleRefresh);
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            cleanup();
        };
    }, [meetingId, fetchState]);

    const handleCreateAiDraft = async () => {
        try {
            // Transcript status need to be ready (draft, reviewed, approved)
            if (transcriptStatus === 'processing' || transcriptStatus === 'loading' || transcriptStatus === 'empty') {
                setErrorMsg('Cần có biên bản giọng nói (STT) hoàn chỉnh trước khi dùng AI.');
                return;
            }

            // We need a transcriptId. It's assumed the backend will resolve it from meetingId.
            // If the API strictly requires transcriptId in body, we might need to fetch transcript first.
            // But per API docs: { transcriptId, language, forceRerun }.
            // So we need to fetch transcriptId for this meeting.
            const tRes = await get(`/meetings/${meetingId}/transcript`);
            if (!tRes?.success || !tRes.data?.transcriptId) {
                setErrorMsg('Không tìm thấy bản ghi STT để phân tích.');
                return;
            }

            setStatus('loading');
            const res = await createAiDraftJob(meetingId, {
                transcriptId: tRes.data.transcriptId,
                language: 'vi-VN'
            });

            if (res?.success) {
                setActiveJobId(res.data.jobId);
                setStatus('ai_running');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Không thể tạo bản nháp AI.');
            setStatus('error');
        }
    };

    const handleCreateManual = async (contentFormat) => {
        try {
            setCreatingManual(true);
            const res = await createManualMinutes(meetingId, { title: 'Biên bản cuộc họp', contentFormat });
            if (res?.success) {
                setShowCreateManualModal(false);
                await fetchState();
            }
        } catch (err) {
            setErrorMsg(err.message || 'Không thể tạo biên bản thủ công.');
            setStatus('error');
        } finally {
            setCreatingManual(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-10 text-center space-y-4">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
                <h3 className="text-sm font-bold text-midnight-indigo uppercase">Đang tải dữ liệu biên bản...</h3>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="bg-white rounded-3xl border border-red-200 shadow-sm-2 p-10 text-center space-y-4 text-red-600">
                <AlertTriangle className="w-10 h-10 mx-auto" />
                <h3 className="text-sm font-bold uppercase">{errorMsg}</h3>
                <button onClick={fetchState} className="px-4 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors">
                    Thử lại
                </button>
            </div>
        );
    }

    if (status === 'ai_running') {
        return (
            <AiGeneratorProgress
                jobId={activeJobId}
                onComplete={fetchState}
                onError={(msg) => {
                    setErrorMsg(msg);
                    setStatus('error');
                }}
            />
        );
    }

    if (status === 'has_minutes') {
        const hasManual = !!manualSummary;
        const hasAi = !!aiSummary;
        const hasBoth = hasManual && hasAi;

        return (
            <div className="space-y-4">
                {hasBoth && (
                    <div className="inline-flex bg-cloud-mist rounded-2xl p-1 gap-1">
                        <button
                            onClick={() => setActiveTab('manual')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                activeTab === 'manual' ? 'bg-white text-midnight-indigo shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'
                            }`}
                        >
                            <PenLine className="w-3.5 h-3.5" /> Bản thủ công
                        </button>
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                activeTab === 'ai' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-blue hover:text-purple-700'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Bản AI
                        </button>
                        <button
                            onClick={() => setActiveTab('compare')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                activeTab === 'compare' ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-action-blue'
                            }`}
                        >
                            <Columns2 className="w-3.5 h-3.5" /> So sánh song song
                        </button>
                    </div>
                )}

                {!hasBoth && (hasManual ? isHost && allowAiCreate : canCompose) && (
                    <div className="bg-cloud-mist/60 border border-platinum-tint rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <p className="text-xs text-slate-blue leading-relaxed">
                            {hasManual
                                ? 'Cuộc họp này chưa có bản tóm tắt AI. Bạn có thể tạo thêm để đối chiếu song song với bản thủ công.'
                                : 'Cuộc họp này chưa có biên bản thủ công. Bạn có thể tự soạn thêm để đối chiếu song song với bản AI.'}
                        </p>
                        {hasManual ? (
                            config?.enabled !== false && (
                                <button
                                    onClick={handleCreateAiDraft}
                                    className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                    <Sparkles className="w-3.5 h-3.5" /> Tóm tắt bằng AI
                                </button>
                            )
                        ) : (
                            <button
                                onClick={() => setShowCreateManualModal(true)}
                                className="shrink-0 px-4 py-2 border-2 border-platinum-tint text-slate-700 hover:bg-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <Plus className="w-3.5 h-3.5" /> Tạo thủ công
                            </button>
                        )}
                    </div>
                )}

                {activeTab === 'compare' && hasBoth ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                            <h4 className="text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <PenLine className="w-3.5 h-3.5" /> Bản thủ công
                            </h4>
                            {manualDetail && (
                                <MinutesViewerEditor
                                    minutes={manualDetail}
                                    meetingId={meetingId}
                                    isHost={isHost}
                                    isSecretary={isSecretary}
                                    onRefresh={fetchState}
                                />
                            )}
                        </div>
                        <div>
                            <h4 className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Bản AI
                            </h4>
                            {aiDetail && (
                                <MinutesViewerEditor
                                    minutes={aiDetail}
                                    meetingId={meetingId}
                                    isHost={isHost}
                                    isSecretary={isSecretary}
                                    onRefresh={fetchState}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {activeTab === 'manual' && manualDetail && (
                            <MinutesViewerEditor
                                minutes={manualDetail}
                                meetingId={meetingId}
                                isHost={isHost}
                                isSecretary={isSecretary}
                                onRefresh={fetchState}
                            />
                        )}
                        {activeTab === 'ai' && aiDetail && (
                            <MinutesViewerEditor
                                minutes={aiDetail}
                                meetingId={meetingId}
                                isHost={isHost}
                                isSecretary={isSecretary}
                                onRefresh={fetchState}
                            />
                        )}
                    </>
                )}

                <CreateManualMinutesModal
                    open={showCreateManualModal}
                    creating={creatingManual}
                    onClose={() => setShowCreateManualModal(false)}
                    onSelect={handleCreateManual}
                />
            </div>
        );
    }

    // Empty state — non-host: hiển thị trạng thái khóa
    if (!canCompose) {
        return (
            <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Lock className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-midnight-indigo mb-2">Chưa có Biên bản cuộc họp</h3>
                <p className="text-xs text-slate-blue max-w-sm leading-relaxed">
                    Chủ trì hoặc thư ký cuộc họp chưa tạo biên bản.
                </p>
            </div>
        );
    }

    // Empty state — host: hiển thị các tuỳ chọn tạo biên bản
    return (
        <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-cloud-mist rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-blue" />
            </div>
            <h3 className="text-base font-bold text-midnight-indigo mb-2">Chưa có Biên bản cuộc họp</h3>
            <p className="text-xs text-slate-blue max-w-sm mb-8 leading-relaxed">
                {allowAiCreate
                    ? 'Cuộc họp này hiện chưa có biên bản chính thức nào được lưu. Bạn có thể tự soạn thảo thủ công hoặc để AI phân tích và tự động tạo — cả 2 bản có thể cùng tồn tại song song để đối chiếu.'
                    : 'Cuộc họp này hiện chưa có biên bản chính thức nào được lưu. Bạn có thể tự soạn thảo ngay trong lúc họp.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {isHost && allowAiCreate && config?.enabled !== false && (
                    <button
                        onClick={handleCreateAiDraft}
                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                    >
                        <Sparkles className="w-4 h-4" /> Tóm tắt bằng AI
                    </button>
                )}
                <button
                    onClick={() => setShowCreateManualModal(true)}
                    className="px-5 py-2.5 border-2 border-platinum-tint text-slate-700 hover:bg-cloud-mist rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Tạo thủ công
                </button>
            </div>

            {isHost && allowAiCreate && config?.enabled !== false && (transcriptStatus === 'empty' || transcriptStatus === 'loading') && (
                <p className="text-[10px] text-amber-600 mt-4 bg-amber-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Tính năng AI yêu cầu phải có Bản ghi (Transcript) trước.
                </p>
            )}

            <CreateManualMinutesModal
                open={showCreateManualModal}
                creating={creatingManual}
                onClose={() => setShowCreateManualModal(false)}
                onSelect={handleCreateManual}
            />
        </div>
    );
};

export default MinutesTabContent;
