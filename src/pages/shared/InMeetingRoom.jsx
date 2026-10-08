import {
    AlertTriangle, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
    ClipboardList, Clock, Cpu, Download, ExternalLink, Eye, FileText, Film, Loader, Mail, Mic, MicOff,
    MonitorUp, Play, Plus, RefreshCw, Shield, Smile,
    StickyNote, Timer, UserCheck, UserX, Users, Video as VideoIcon, VideoOff,
    VolumeX, X, Edit2
} from 'lucide-react';
import { IoMic, IoMicOff, IoHandLeft, IoVolumeHigh, IoHappy, IoTime, IoCall, IoArrowBack } from 'react-icons/io5';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { renderAsync as renderDocxAsync } from 'docx-preview';
import { PPTXViewer } from 'pptxviewjs';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../../assets/images/SmarTracking.png';

import { getSocket, subscribeToMeeting } from '../../utils/socket';
import { request, patch } from '../../utils/request';
import {
    getMeetingById as getMeetingEmployee,
    startMeeting as startEmployee,
    endMeeting as endEmployee,
    getMeetingAttendance as getEmployeeAttendance,
    createMeetingNote as createEmployeeNote,
    listMeetingNotes as listEmployeeNotes,
    startVideoRecording as startEmployeeVideoRecording,
    pauseVideoRecording as pauseEmployeeVideoRecording,
    resumeVideoRecording as resumeEmployeeVideoRecording,
    stopVideoRecording as stopEmployeeVideoRecording,
    createMockCamera as createEmployeeMockCamera,
    getRecordingStatus as getEmployeeRecordingStatus,
    getMeetingMediaFiles as getEmployeeMediaFiles,
    getRecordingSessions as getEmployeeRecordingSessions,
    requestExtension as requestEmployeeExtension,
    decideExtension as decideEmployeeExtension,
    getRoomDevices as getEmployeeRoomDevices,
    getMediaFile as getEmployeeMediaFile,
} from '../../service/employeeServices';
import {
    getMeetingById as getMeetingManager,
    startMeeting as startManager,
    endMeeting as endManager,
    getMeetingAttendance as getManagerAttendance,
    createMeetingNote as createManagerNote,
    listMeetingNotes as listManagerNotes,
    startVideoRecording as startManagerVideoRecording,
    pauseVideoRecording as pauseManagerVideoRecording,
    resumeVideoRecording as resumeManagerVideoRecording,
    stopVideoRecording as stopManagerVideoRecording,
    createMockCamera as createManagerMockCamera,
    getRecordingStatus as getManagerRecordingStatus,
    getMeetingMediaFiles as getManagerMediaFiles,
    manualAttendanceCheckIn,
    requestExtension as requestManagerExtension,
    decideExtension as decideManagerExtension,
    getRoomDevices as getManagerRoomDevices,
    invalidateAttendanceRecord,
    getMediaFile as getManagerMediaFile,
    getRecordingSessions as getManagerRecordingSessions,
} from '../../service/managerServices';
import UserAvatar, { resolveAvatarUrl } from '../../components/common/UserAvatar';
import MeetingGrid from '../../components/meeting/MeetingGrid';
import StationRecorder from '../../components/transcription/StationRecorder';
import MinutesTabContent from '../../components/minutes/MinutesTabContent';
import GuestPanel from '../../components/meeting/GuestPanel';
import RecordingsTab from '../../components/meeting/RecordingsTab';
import { startRecordingMarker, createLiveSpeakerTag } from '../../service/transcriptionServices';
import { LIVE_SPEAKER_TAGGING_ENABLED } from '../../config/featureFlags';
import useFaceGuidance from '../../hooks/useFaceGuidance';

const customStyles = `
@keyframes floatUp {
  0% { transform: translateY(0) scale(0.8); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-120px) scale(1.3); opacity: 0; }
}
.animate-float-up {
  animation: floatUp 2.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}
@keyframes voiceWave {
  0%, 100% { height: 4px; }
  50% { height: 18px; }
}
.voice-bar {
  animation: voiceWave 0.6s ease-in-out infinite;
}
`;

const defaultMeeting = {
    title: 'Họp kỹ thuật dự án SmarTracking',
    roomName: 'Phòng Apollo 101',
    host: 'Nguyễn Văn A',
    hostId: 'mgr-uuid',
    host_id: 'mgr-uuid',
    status: 'scheduled',
    currentAgendaIndex: 0,
    agendaTimeLeft: 600,
    participants: [
        { id: 'mgr-uuid', fullName: 'Nguyễn Văn A', role: 'Chủ tọa', isMuted: false, isSpeaking: false, isBot: false },
        { id: 'bot-1', fullName: 'Lê Hoàng Hải', role: 'Thành viên', isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-2', fullName: 'Nguyễn Thị Minh', role: 'Thành viên', isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-3', fullName: 'Phan Văn Minh', role: 'Thành viên', isMuted: false, isSpeaking: false, isBot: true },
    ],
    agenda: [],
    reactionsLocked: false,
    lastReaction: null,
};

const callWithFallback = async (employeeFn, managerFn, ...args) => {
    try {
        const res = await employeeFn(...args);
        if (res?.success) return res;
        throw new Error('Employee scope failed');
    } catch (e) {
        if (e && (e.status === 403 || e.status === 409 || e.status === 404)) {
            throw e;
        }
        console.warn(`[InMeetingRoom] ${employeeFn.name || 'employeeFn'} thất bại, fallback sang ${managerFn.name || 'managerFn'}.`);
        return await managerFn(...args);
    }
};

const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const PRESENCE_MAP = {
    present: { label: 'Có mặt', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    late: { label: 'Muộn', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    maybe_present: { label: 'Có mặt', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    checked_in: { label: 'Đã điểm danh', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    absent: { label: 'Vắng mặt', color: 'bg-red-50 text-red-600 border-red-200' },
    unknown: { label: 'Chưa điểm danh', color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const RecordingTimer = ({ meetingId, sessionId, initialStatus, onStatusChange }) => {
    const [duration, setDuration] = useState(0);
    const [localStatus, setLocalStatus] = useState(initialStatus);
    const [fileSize, setFileSize] = useState(null);

    useEffect(() => { setLocalStatus(initialStatus); }, [initialStatus]);

    useEffect(() => {
        if (localStatus !== 'recording') return;
        const interval = setInterval(() => setDuration(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, [localStatus]);

    useEffect(() => {
        if (!sessionId || ['inactive', 'completed', 'failed'].includes(localStatus)) return;
        const interval = setInterval(async () => {
            try {
                const res = await callWithFallback(getEmployeeRecordingStatus, getManagerRecordingStatus, meetingId, sessionId);
                if (res?.success) {
                    const data = res.data;
                    if (data.status && data.status !== localStatus) {
                        setLocalStatus(data.status);
                        if (onStatusChange) onStatusChange(data.status);
                    }
                    if (data.durationSeconds != null) setDuration(data.durationSeconds);
                    if (data.fileSizeBytes != null) setFileSize(data.fileSizeBytes);
                }
            } catch (e) { }
        }, 5000);
        return () => clearInterval(interval);
    }, [sessionId, localStatus, meetingId, onStatusChange]);

    const formatSize = (bytes) => {
        if (!bytes) return '';
        return ` · ${(parseInt(bytes) / (1024 * 1024)).toFixed(1)}MB`;
    };

    if (!['recording', 'starting', 'stopping', 'paused', 'failed'].includes(localStatus)) return null;

    if (localStatus === 'failed') {
        return (
            <div className="px-3 py-2 rounded-xl border flex items-start gap-2 text-xs font-bold bg-red-50 text-red-700 border-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                    <span>Ghi hình đã dừng do lỗi</span>
                    <span className="text-[10px] font-normal opacity-80">Vui lòng kiểm tra camera và bắt đầu lại nếu cần.</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`px-3 py-2 rounded-xl border flex flex-col gap-1 text-xs font-bold ${localStatus === 'recording' ? 'bg-red-50 text-red-600 border-red-200' :
            localStatus === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-blue-50 text-action-blue border-blue-100'
            }`}>
            <div className="flex items-center gap-2">
                {localStatus === 'recording' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                <span>
                    {localStatus === 'recording' ? `GHI HÌNH · ${formatDuration(duration)}${formatSize(fileSize)}` :
                        localStatus === 'paused' ? `TẠM DỪNG · ${formatDuration(duration)}${formatSize(fileSize)}` :
                            'Đang xử lý...'}
                </span>
            </div>
            {localStatus === 'paused' && (
                <div className="text-[10px] font-normal opacity-70">Khoảng dừng sẽ không có trong file ghi hình</div>
            )}
        </div>
    );
};

const InMeetingRoom = ({ isPublic = false }) => {
    const { id } = useParams();
    const navigate = useNavigate();

    // Core states
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [meetingState, setMeetingState] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [renameModal, setRenameModal] = useState({ isOpen: false, targetId: null, currentName: '', isSelf: true });
    const [confirmLeaveModal, setConfirmLeaveModal] = useState(false);
    const [notes, setNotes] = useState([]);
    const [noteInput, setNoteInput] = useState('');
    const [shareNoteWithGuest, setShareNoteWithGuest] = useState(false);
    const [presentedFile, setPresentedFile] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [actionLoading, setActionLoading] = useState(false);

    // Recording
    const [recordingStatus, setRecordingStatus] = useState('inactive');
    const [recordingSessionId, setRecordingSessionId] = useState(null);
    const [recordingStartedAt, setRecordingStartedAt] = useState(null);
    // GA-32: Live Speaker Tag states
    const [liveTagSelected, setLiveTagSelected] = useState('');
    const [liveTagSubmitting, setLiveTagSubmitting] = useState(false);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [editingMediaId, setEditingMediaId] = useState(null);
    const [editingMediaTitle, setEditingMediaTitle] = useState('');
    const [recordingSessions, setRecordingSessions] = useState([]);
    const [recordingsLoading, setRecordingsLoading] = useState(false);
    const [playbackUrls, setPlaybackUrls] = useState({});

    // Local settings
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCamOn, setIsCamOn] = useState(false);
    const [localVideoStream, setLocalVideoStream] = useState(null);
    const [autoFaceCameraStream, setAutoFaceCameraStream] = useState(null);
    const [autoFaceCameraError, setAutoFaceCameraError] = useState('');
    const [autoFaceScanLoading, setAutoFaceScanLoading] = useState(false);
    const [lastAutoFaceScan, setLastAutoFaceScan] = useState(null);
    const [autoFaceScanDirection, setAutoFaceScanDirection] = useState('in');
    const [localName, setLocalName] = useState('');
    const [isLobbyReady, setIsLobbyReady] = useState(false);
    const [activeChatTab, setActiveChatTab] = useState('');
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);

    // New features
    const [expandedAgendaIdx, setExpandedAgendaIdx] = useState(null);
    const [roomDevices, setRoomDevices] = useState([]);
    const [isRoomDevicesExpanded, setIsRoomDevicesExpanded] = useState(false);
    const [extensionModal, setExtensionModal] = useState({ isOpen: false, minutes: 15, reason: '' });
    const [pendingExtensions, setPendingExtensions] = useState([]);
    const [extensionRejectedInfo, setExtensionRejectedInfo] = useState(null);
    const [noShowWarning, setNoShowWarning] = useState(null);
    const [meetingTimeLeft, setMeetingTimeLeft] = useState(null); // seconds until scheduled end
    const [meetingOverdue, setMeetingOverdue] = useState(false);  // true when past end time
    const [manualCheckInLoading, setManualCheckInLoading] = useState(null);
    const [isManualAttendanceExpanded, setIsManualAttendanceExpanded] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(() => Math.round(window.innerWidth / 3));
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const meetingLayoutRef = useRef(null);
    const isResizingSidebarRef = useRef(false);
    const localVideoStreamRef = useRef(null);
    const autoFaceCameraStreamRef = useRef(null);
    const autoFaceVideoRef = useRef(null);
    const autoFaceScanLockRef = useRef(false);
    const autoEndMeetingTriggeredRef = useRef(false);

    const stopLocalCamera = () => {
        if (localVideoStreamRef.current) {
            localVideoStreamRef.current.getTracks().forEach(track => track.stop());
            localVideoStreamRef.current = null;
        }
        setLocalVideoStream(null);
        setIsCamOn(false);
    };

    const startLocalCamera = async () => {
        if (!navigator?.mediaDevices?.getUserMedia) {
            showToast('Trình duyệt không hỗ trợ camera.', 'error');
            return false;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                },
                audio: false,
            });
            if (localVideoStreamRef.current) {
                localVideoStreamRef.current.getTracks().forEach(track => track.stop());
            }
            localVideoStreamRef.current = stream;
            setLocalVideoStream(stream);
            setIsCamOn(true);
            showToast('Đã bật camera', 'success');
            return true;
        } catch (err) {
            const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
            showToast(denied ? 'Bạn cần cấp quyền camera cho trình duyệt.' : 'Không thể mở camera trên thiết bị này.', 'error');
            setIsCamOn(false);
            setLocalVideoStream(null);
            return false;
        }
    };

    const handleCamToggle = async () => {
        if (localVideoStreamRef.current) {
            stopLocalCamera();
            showToast('Đã tắt camera', 'info');
            return;
        }
        await startLocalCamera();
    };

    useEffect(() => {
        return () => {
            if (localVideoStreamRef.current) {
                localVideoStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (autoFaceCameraStreamRef.current) {
                autoFaceCameraStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (autoFaceVideoRef.current) {
            autoFaceVideoRef.current.srcObject = autoFaceCameraStream || null;
        }
    }, [autoFaceCameraStream]);

    useEffect(() => {
        const handlePointerMove = (e) => {
            if (!isResizingSidebarRef.current || !meetingLayoutRef.current) return;
            const rect = meetingLayoutRef.current.getBoundingClientRect();
            const minWidth = 320;
            const maxWidth = Math.max(minWidth, rect.width - 360);
            const newWidth = Math.min(Math.max(rect.right - e.clientX, minWidth), maxWidth);
            setSidebarWidth(newWidth);
        };
        const stopResizing = () => {
            if (!isResizingSidebarRef.current) return;
            isResizingSidebarRef.current = false;
            setIsResizingSidebar(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResizing);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResizing);
        };
    }, []);

    const handleSidebarResizeStart = (e) => {
        e.preventDefault();
        isResizingSidebarRef.current = true;
        setIsResizingSidebar(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };
    const [agendaDocView, setAgendaDocView] = useState(null);
    const [agendaDocUrl, setAgendaDocUrl] = useState(null);
    const [agendaDocLoading, setAgendaDocLoading] = useState(false);
    const [agendaDocxError, setAgendaDocxError] = useState(false);
    const [agendaImgError, setAgendaImgError] = useState(false);
    const [agendaPptxError, setAgendaPptxError] = useState(false);
    const [agendaPptxSlides, setAgendaPptxSlides] = useState({ current: 0, total: 0 });
    const agendaDocxContainerRef = useRef(null);
    const agendaPptxCanvasRef = useRef(null);
    const agendaPptxViewerRef = useRef(null);
    const [admittedGuests, setAdmittedGuests] = useState([]);
    const admittedGuestCount = admittedGuests.length;
    // agendaDocView: { agendaItem, selectedAttachmentIdx }

    // Fetch download URL whenever the viewed attachment changes
    useEffect(() => {
        if (!agendaDocView) {
            setAgendaDocUrl(null);
            return;
        }
        const att = agendaDocView.agendaItem.attachments?.[agendaDocView.selectedAttachmentIdx ?? 0];
        if (!att?.id) {
            setAgendaDocUrl(null);
            return;
        }
        let cancelled = false;
        setAgendaDocUrl(null);
        setAgendaDocLoading(true);
        callWithFallback(getEmployeeMediaFile, getManagerMediaFile, att.id)
            .then(res => {
                if (!cancelled && res?.success && res.data?.downloadUrl) {
                    setAgendaDocUrl(res.data.downloadUrl);
                }
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setAgendaDocLoading(false); });
        return () => { cancelled = true; };
    }, [agendaDocView]);

    // Render Word (.doc/.docx) attachments client-side instead of relying on
    // Microsoft's public Office Online Viewer, which cannot reach files served
    // from a private/local backend (only the user's own browser can).
    useEffect(() => {
        setAgendaDocxError(false);
        setAgendaImgError(false);
        setAgendaPptxError(false);
        setAgendaPptxSlides({ current: 0, total: 0 });
        if (!agendaDocUrl || !agendaDocView) return;
        const att = agendaDocView.agendaItem.attachments?.[agendaDocView.selectedAttachmentIdx ?? 0];
        const ext = (att?.fileName || '').split('.').pop()?.toLowerCase();
        if (!['doc', 'docx'].includes(ext)) return;
        let cancelled = false;
        fetch(agendaDocUrl)
            .then(res => {
                if (!res.ok) throw new Error('download failed');
                return res.arrayBuffer();
            })
            .then(arrayBuffer => {
                if (cancelled || !agendaDocxContainerRef.current) return;
                agendaDocxContainerRef.current.innerHTML = '';
                return renderDocxAsync(arrayBuffer, agendaDocxContainerRef.current);
            })
            .catch((err) => { console.error('[AgendaDocxPreview]', err); if (!cancelled) setAgendaDocxError(true); });
        return () => { cancelled = true; };
    }, [agendaDocUrl, agendaDocView]);

    // Render PowerPoint (.ppt/.pptx) attachments client-side via HTML5 Canvas
    // (pptxviewjs) — same reasoning as the Word renderer: no reliable inline
    // preview service works with a non-public backend URL, so parse/render
    // the file directly in the user's own browser instead.
    useEffect(() => {
        if (!agendaDocUrl || !agendaDocView) return;
        const att = agendaDocView.agendaItem.attachments?.[agendaDocView.selectedAttachmentIdx ?? 0];
        const ext = (att?.fileName || '').split('.').pop()?.toLowerCase();
        if (!['ppt', 'pptx'].includes(ext)) return;
        let cancelled = false;
        fetch(agendaDocUrl)
            .then(res => {
                if (!res.ok) throw new Error('download failed');
                return res.arrayBuffer();
            })
            .then(async arrayBuffer => {
                if (cancelled || !agendaPptxCanvasRef.current) return;
                const viewer = new PPTXViewer({ canvas: agendaPptxCanvasRef.current });
                agendaPptxViewerRef.current = viewer;
                await viewer.loadFile(arrayBuffer);
                if (cancelled) return;
                await viewer.render();
                if (cancelled) return;
                setAgendaPptxSlides({ current: 1, total: viewer.getSlideCount() });
            })
            .catch((err) => { console.error('[AgendaPptxPreview]', err); if (!cancelled) setAgendaPptxError(true); });
        return () => {
            cancelled = true;
            agendaPptxViewerRef.current = null;
        };
    }, [agendaDocUrl, agendaDocView]);

    const goToAgendaPptxSlide = async (delta) => {
        const viewer = agendaPptxViewerRef.current;
        if (!viewer) return;
        try {
            if (delta > 0) await viewer.nextSlide();
            else await viewer.previousSlide();
            setAgendaPptxSlides({ current: viewer.getCurrentSlideIndex() + 1, total: viewer.getSlideCount() });
        } catch {
            setAgendaPptxError(true);
        }
    };

    // Refs
    const speakingOverrideRef = useRef(null);
    const prevMutedRef = useRef(false);
    const prevReactionsLockedRef = useRef(false);
    const myParticipantIdRef = useRef(null);
    const toastTimersRef = useRef([]);
    const reactionTimersRef = useRef([]);
    const participantsRef = useRef(null);
    const attendanceErrorRef = useRef(false);
    // Debounce cho việc nạp lại ghi chú khi nhận `meeting.note.created` qua WS.
    const noteRefreshTimerRef = useRef(null);
    // Debounce cho việc nạp lại điểm danh khi nhận `meeting.attendance.updated` qua WS.
    const attendanceRefreshTimerRef = useRef(null);
    const devicesErrorRef = useRef(false);

    // Clear all pending timers on unmount
    useEffect(() => {
        return () => {
            toastTimersRef.current.forEach(clearTimeout);
            reactionTimersRef.current.forEach(clearTimeout);
        };
    }, []);

    // Load current user
    const localUserStr = localStorage.getItem('user');
    let currentUser = null;
    if (localUserStr) {
        try { currentUser = JSON.parse(localUserStr); } catch (e) { }
    }

    if (!myParticipantIdRef.current) {
        if (currentUser) {
            myParticipantIdRef.current = currentUser.id;
        } else {
            let guestId = sessionStorage.getItem(`meeting_guest_id_${id}`);
            if (!guestId) {
                guestId = `guest-${Math.floor(Math.random() * 10000)}`;
                sessionStorage.setItem(`meeting_guest_id_${id}`, guestId);
            }
            myParticipantIdRef.current = guestId;
        }
    }
    const myParticipantId = myParticipantIdRef.current;

    const showToast = (message, type = 'info') => {
        const toastId = `toast-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        setToasts(prev => [...prev, { id: toastId, message, type }]);
        const timerId = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== toastId));
        }, 3500);
        toastTimersRef.current.push(timerId);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const stopAutoFaceCamera = useCallback(() => {
        if (autoFaceCameraStreamRef.current) {
            autoFaceCameraStreamRef.current.getTracks().forEach(track => track.stop());
            autoFaceCameraStreamRef.current = null;
        }
        setAutoFaceCameraStream(null);
        setAutoFaceCameraError('');
    }, []);

    const startAutoFaceCamera = useCallback(async () => {
        if (!navigator?.mediaDevices?.getUserMedia) {
            setAutoFaceCameraError('Trình duyệt không hỗ trợ camera.');
            return false;
        }
        setAutoFaceCameraError('');
        setLastAutoFaceScan(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            });
            if (autoFaceCameraStreamRef.current) {
                autoFaceCameraStreamRef.current.getTracks().forEach(track => track.stop());
            }
            autoFaceCameraStreamRef.current = stream;
            setAutoFaceCameraStream(stream);
            showToast('Đã bật camera tự quét FaceID.', 'success');
            return true;
        } catch (err) {
            const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
            const message = denied
                ? 'Bạn cần cấp quyền camera để test điểm danh FaceID.'
                : 'Không mở được camera trên thiết bị này.';
            setAutoFaceCameraError(message);
            showToast(message, 'error');
            return false;
        }
    }, []);

    // ─── Data Loading ──────────────────────────────────────────────────
    const initMeetingState = async () => {
        setLoading(true);
        setLoadError(false);
        let baseMeeting = null;
        try {
            const res = await getMeetingEmployee(id);
            if (res?.success && res.data) {
                const dto = res.data;
                const meetingObj = dto.meeting || dto;
                baseMeeting = {
                    ...dto,
                    title: meetingObj.title || dto.title,
                    status: meetingObj.status || dto.status,
                    startTime: meetingObj.startTime || dto.startTime || meetingObj.start_time || dto.start_time,
                    endTime: meetingObj.endTime || dto.endTime || meetingObj.end_time || dto.end_time,
                    hostId: dto.host?.id || dto.hostId || dto.host_id || dto.organizer?.id,
                    host_id: dto.host?.id || dto.hostId || dto.host_id || dto.organizer?.id,
                };
            }
        } catch (e) {
            try {
                const res = await getMeetingManager(id);
                if (res?.success && res.data) {
                    const dto = res.data;
                    const meetingObj = dto.meeting || dto;
                    baseMeeting = {
                        ...dto,
                        title: meetingObj.title || dto.title,
                        status: meetingObj.status || dto.status,
                        startTime: meetingObj.startTime || dto.startTime || meetingObj.start_time || dto.start_time,
                        endTime: meetingObj.endTime || dto.endTime || meetingObj.end_time || dto.end_time,
                        hostId: dto.host?.id || dto.hostId || dto.host_id || dto.organizer?.id,
                        host_id: dto.host?.id || dto.hostId || dto.host_id || dto.organizer?.id,
                    };
                }
            } catch (err) { }
        }

        const savedStateStr = localStorage.getItem(`meeting_state_${id}`);
        if (savedStateStr) {
            const savedState = JSON.parse(savedStateStr);
            if (baseMeeting) {
                // Luôn cập nhật status từ API để tránh cache cũ giữ 'scheduled'
                // khi host đã bắt đầu họp sớm — không cập nhật thì participant bị kẹt ở lobby
                if (baseMeeting.status) savedState.status = baseMeeting.status;
                if (baseMeeting.endTime) savedState.endTime = baseMeeting.endTime;
                savedState.title = baseMeeting.title || savedState.title;
                savedState.roomName = baseMeeting.room?.room_name || baseMeeting.room?.roomName || savedState.roomName;
                savedState.room = baseMeeting.room || savedState.room || null;
                // Fix: Luôn sử dụng danh sách agenda mới nhất từ API, không gộp với cache localStorage
                // để tránh tình trạng dữ liệu của tài khoản khác bị rò rỉ nếu dùng chung trình duyệt
                savedState.agenda = (baseMeeting.agendas || []).map((a, idx) => ({
                    id: a.id,
                    title: a.title,
                    description: a.description || '',
                    durationMin: a.plannedDurationMinutes,
                    orderIndex: a.agendaOrder ?? idx,
                    attachments: a.attachments || [],
                }));
                savedState.participants = savedState.participants?.map((savedP) => {
                    const apiP = baseMeeting.participants?.find(p => (p.userId || p.user_id || p.user?.id || p.id) === savedP.id);
                    return apiP ? { ...savedP, avatarUrl: resolveAvatarUrl(apiP) || savedP.avatarUrl } : savedP;
                });
                // Thêm khách mới xuất hiện sau khi cache đã tồn tại (chưa có trong savedState)
                const existingIds = new Set(savedState.participants?.map(p => p.id) || []);
                const newExternal = (baseMeeting.externalParticipants || baseMeeting.external_participants || [])
                    .filter(ep => ep.id && !existingIds.has(ep.id))
                    .map(ep => ({
                        id: ep.id,
                        fullName: ep.name || ep.fullName || ep.full_name || ep.email || 'Khách mời',
                        avatarUrl: '',
                        role: 'Khách mời',
                        isExternal: true,
                        isMuted: false,
                        isSpeaking: false,
                        isBot: false,
                    }));
                if (newExternal.length > 0) {
                    savedState.participants = [...(savedState.participants || []), ...newExternal];
                }
            }
            setMeetingState(savedState);
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(savedState));
        } else if (!baseMeeting) {
            // Cả 2 API (employee/manager) đều fail VÀ chưa có cache nào cho meeting này
            // trong trình duyệt — KHÔNG có dữ liệu thật lẫn dữ liệu cũ để dùng tạm.
            // Trước đây rơi vào dữ liệu bịa cứng (defaultMeeting: tên họp/phòng/host/
            // participant giả) mà không cảnh báo gì — chặn hẳn, không cho vào phòng họp
            // với dữ liệu giả, để người dùng biết rõ và có thể thử lại.
            setLoadError(true);
            setLoading(false);
            return;
        } else {
            const initial = { ...defaultMeeting, id };
            if (baseMeeting) {
                initial.title = baseMeeting.title || initial.title;
                initial.roomName = baseMeeting.room?.room_name || baseMeeting.room?.roomName || initial.roomName;
                initial.room = baseMeeting.room || null;
                initial.agenda = (baseMeeting.agendas || []).map((a, idx) => ({
                    id: a.id,
                    title: a.title,
                    description: a.description || '',
                    durationMin: a.plannedDurationMinutes,
                    orderIndex: a.agendaOrder ?? idx,
                    attachments: a.attachments || [],
                }));
                let hostId = baseMeeting.host_id || baseMeeting.hostId || baseMeeting.organizer_id || baseMeeting.organizerId || initial.hostId;
                const apiHost = baseMeeting.participants?.find(p =>
                    (p.userId || p.user_id || p.user?.id || p.id) === hostId ||
                    p.participantRole === 'host' || p.participant_role === 'host'
                ) || (typeof baseMeeting.host === 'object' ? baseMeeting.host : null);

                if (apiHost) {
                    hostId = apiHost.userId || apiHost.user_id || apiHost.user?.id || apiHost.id || hostId;
                }
                initial.hostId = hostId;
                initial.status = baseMeeting.status || initial.status;
                initial.endTime = baseMeeting.endTime || null;

                initial.host = apiHost?.fullName || apiHost?.full_name || baseMeeting.hostName ||
                    (typeof baseMeeting.host === 'string' ? baseMeeting.host : initial.host);

                const parts = [];
                if (initial.hostId) {
                    parts.push({
                        id: initial.hostId,
                        fullName: initial.host,
                        avatarUrl: resolveAvatarUrl(apiHost) || '',
                        role: 'Chủ tọa',
                        isMuted: false,
                        isSpeaking: false,
                        isBot: false,
                        isPresent: false,
                    });
                }

                baseMeeting.participants?.forEach(p => {
                    const pid = p.userId || p.user_id || p.user?.id || p.id;
                    if (pid && pid !== initial.hostId) {
                        parts.push({
                            id: pid,
                            fullName: p.fullName || p.full_name || p.user?.fullName || 'Thành viên',
                            avatarUrl: resolveAvatarUrl(p),
                            role: 'Thành viên',
                            isMuted: false,
                            isSpeaking: false,
                            isBot: false,
                            isPresent: false,
                        });
                    }
                });

                (baseMeeting.externalParticipants || baseMeeting.external_participants || []).forEach(ep => {
                    if (ep.id) {
                        parts.push({
                            id: ep.id,
                            fullName: ep.name || ep.fullName || ep.full_name || ep.email || 'Khách mời',
                            avatarUrl: '',
                            role: 'Khách mời',
                            isExternal: true,
                            isMuted: false,
                            isSpeaking: false,
                            isBot: false,
                            isPresent: false,
                        });
                    }
                });
                initial.participants = parts;

                // Nếu meeting đang diễn ra (vào muộn hoặc refresh page),
                // tự động mark người dùng hiện tại là isPresent = true để hiện lên grid.
                if (initial.status === 'in_progress' && myParticipantId) {
                    const selfIdx = initial.participants.findIndex(p => p.id === myParticipantId);
                    if (selfIdx !== -1) {
                        initial.participants[selfIdx] = { ...initial.participants[selfIdx], isPresent: true };
                    } else {
                        // User vào muộn và không có trong danh sách participants ban đầu
                        initial.participants.push({
                            id: myParticipantId,
                            fullName: currentUser?.fullName || currentUser?.full_name || 'Thành viên',
                            avatarUrl: resolveAvatarUrl(currentUser) || '',
                            role: initial.hostId === myParticipantId ? 'Chủ tọa' : 'Thành viên',
                            isMuted: false,
                            isSpeaking: false,
                            isBot: false,
                            isPresent: true,
                        });
                    }
                }
            }
            setMeetingState(initial);
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(initial));
        }
        setLoading(false);
    };

    const loadNotes = async () => {
        try {
            const res = await callWithFallback(listEmployeeNotes, listManagerNotes, id, { limit: 100 });
            if (res?.success) {
                setNotes(Array.isArray(res.data) ? res.data : (res.data?.items || []));
            }
        } catch (err) { }
    };

    const loadAttendance = useCallback(async () => {
        if (attendanceErrorRef.current) return;
        try {
            const res = await callWithFallback(getEmployeeAttendance, getManagerAttendance, id);
            if (res?.success) {
                const dataItems = res.data?.items || res.data?.records || (Array.isArray(res.data) ? res.data : []);
                setAttendance(dataItems);
            }
        } catch (err) {
            if (err?.status === 403 || err?.status === 409 || err?.status === 404) {
                attendanceErrorRef.current = true;
            }
        }
    }, [id]);

    const loadRoomDevices = async (roomId, options = {}) => {
        if (!roomId || (devicesErrorRef.current && !options.force)) return [];
        try {
            const res = await callWithFallback(getEmployeeRoomDevices, getManagerRoomDevices, roomId);
            if (res?.success) {
                const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
                setRoomDevices(items);
                devicesErrorRef.current = false;
                return items;
            }
        } catch (err) {
            if (err?.status === 403 || err?.status === 409 || err?.status === 404) {
                devicesErrorRef.current = true;
            }
        }
        return [];
    };

    const fetchMediaFiles = async () => {
        try {
            const res = await callWithFallback(getEmployeeMediaFiles, getManagerMediaFiles, id);
            if (res?.success) setMediaFiles(res.data || []);
        } catch (e) { }
    };

    const fetchRecordingSessions = async () => {
        try {
            const res = await callWithFallback(getEmployeeRecordingSessions, getManagerRecordingSessions, id);
            if (res?.success) setRecordingSessions(res.data || []);
        } catch (e) { }
    };

    const isRecordingNotActiveError = (err) => {
        const code = err?.error?.code || err?.code;
        const message = String(err?.error?.message || err?.message || '').toLowerCase();
        return code === 'RECORDING_NOT_ACTIVE' || message.includes('recording session is not active');
    };

    const markRecordingInactive = async () => {
        setRecordingStatus('inactive');
        setRecordingSessionId(null);
        setRecordingStartedAt(null);
        await Promise.all([fetchMediaFiles(), fetchRecordingSessions()]);
    };

    const handleRenameMedia = async (fileId) => {
        if (!editingMediaTitle.trim()) {
            showToast('Tên bản ghi không được để trống', 'error');
            return;
        }

        // Optimistic update
        const originalMedia = [...mediaFiles];
        setMediaFiles(prev => prev.map(f => f.id === fileId ? { ...f, title: editingMediaTitle.trim() } : f));
        setEditingMediaId(null);

        try {
            const res = await request(`/media-files/${fileId}`, {
                method: 'PATCH',
                data: { title: editingMediaTitle.trim() }
            });
            if (res?.success || res?.data) {
                showToast('Đổi tên bản ghi thành công', 'success');
                fetchMediaFiles();
            } else {
                setMediaFiles(originalMedia);
                showToast(res?.error?.message || res?.message || 'Chức năng đổi tên chưa được hỗ trợ', 'error');
            }
        } catch (error) {
            setMediaFiles(originalMedia);
            showToast('Lỗi API đổi tên bản ghi (đang chờ BE hỗ trợ)', 'error');
        }
    };

    // ─── Effects ──────────────────────────────────────────────────────
    useEffect(() => {
        let interval;
        if (['recording', 'starting', 'stopping'].includes(recordingStatus) && recordingSessionId) {
            interval = setInterval(async () => {
                try {
                    const res = await callWithFallback(getEmployeeRecordingStatus, getManagerRecordingStatus, id, recordingSessionId);
                    if (res?.success) {
                        const newStatus = res.data?.status?.toLowerCase() || 'inactive';
                        if (newStatus !== recordingStatus) {
                            if (newStatus === 'stopped') {
                                await markRecordingInactive();
                                showToast('Ghi hình đã hoàn tất.', 'success');
                                return;
                            }
                            setRecordingStatus(newStatus);
                            if (newStatus === 'failed') {
                                showToast('Ghi hình đã dừng do lỗi — vui lòng kiểm tra camera.', 'error');
                            }
                        }
                        if (res.data?.startedAt && !recordingStartedAt) {
                            setRecordingStartedAt(new Date(res.data.startedAt));
                        }
                    }
                } catch (e) { }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [recordingStatus, recordingSessionId, id]);


    useEffect(() => {
        // Subscribe khi cả 'scheduled' lẫn 'in_progress' để participant nhận được
        // sự kiện meeting.session.started dù đang ở trang chờ (waiting lobby).
        // Trước đây chỉ subscribe khi 'in_progress' → participant bị kẹt ở lobby mãi
        // vì không nhận được real-time event khi host bắt đầu họp sớm.
        if (!meetingState?.status || ['completed', 'cancelled'].includes(meetingState.status)) return;

        const cleanup = subscribeToMeeting(id);
        const s = getSocket();

        const onSessionStarted = (data) => {
            setMeetingState(prev => {
                // Tự động mark người dùng hiện tại là isPresent khi host bắt đầu họp
                const updatedParticipants = [...(prev.participants || [])];
                const selfIdx = updatedParticipants.findIndex(p => p.id === myParticipantId);
                if (selfIdx !== -1) {
                    updatedParticipants[selfIdx] = { ...updatedParticipants[selfIdx], isPresent: true };
                } else if (myParticipantId) {
                    updatedParticipants.push({
                        id: myParticipantId,
                        fullName: currentUser?.fullName || currentUser?.full_name || 'Thành viên',
                        avatarUrl: resolveAvatarUrl(currentUser) || '',
                        role: prev.hostId === myParticipantId ? 'Chủ tọa' : 'Thành viên',
                        isMuted: false,
                        isSpeaking: false,
                        isBot: false,
                        isPresent: true,
                    });
                }
                const next = {
                    ...prev,
                    status: 'in_progress',
                    participants: updatedParticipants,
                    ...(data?.scheduledEndTime ? { endTime: data.scheduledEndTime } : {}),
                };
                localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                return next;
            });
        };
        const onSessionEnded = () => setMeetingState(prev => ({ ...prev, status: 'completed' }));
        const onAgendaPresented = (payload) => setPresentedFile(payload);
        const onAgendaPresentStopped = () => setPresentedFile(null);
        const onExtensionCreated = (payload) => {
            setPendingExtensions(prev => [...prev, payload]);
            showToast(`Yêu cầu gia hạn ${payload.requestedExtensionMinutes || '?'} phút từ ${payload.requesterName || 'thành viên'}.`, 'warning');
        };
        const onAgendaChanged = (payload) => {
            if (payload?.currentAgendaIndex !== undefined) {
                setMeetingState(prev => {
                    const nextIdx = payload.currentAgendaIndex;
                    if (!prev.agenda || nextIdx >= prev.agenda.length || nextIdx === prev.currentAgendaIndex) return prev;
                    const next = { ...prev, currentAgendaIndex: nextIdx, agendaTimeLeft: (prev.agenda[nextIdx].durationMin || 10) * 60 };
                    localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                    return next;
                });
            }
        };
        const onNoShowAlert = (data) => {
            if (data?.kind === 'warning') {
                setNoShowWarning({ caseId: data.noShowCaseId, kind: 'warning' });
            } else if (data?.kind === 'released') {
                setNoShowWarning({ kind: 'released' });
            }
        };
        const onTimeWarning = (payload) => {
            const { warningLevel, remainingMinutes, nextBooking } = payload || {};
            if (warningLevel === 'overdue') {
                setMeetingOverdue(true);
                showToast('Cuộc họp đã hết giờ. Vui lòng kết thúc để giải phóng phòng.', 'error');
            } else if (warningLevel === 'urgent' || remainingMinutes <= 5) {
                showToast(`Còn ${remainingMinutes} phút — cuộc họp sắp kết thúc!`, 'error');
            } else {
                showToast(`Còn ${remainingMinutes} phút trước khi kết thúc cuộc họp.`, 'warning');
            }
            if (nextBooking?.reservedStartTime) {
                const nextStart = new Date(nextBooking.reservedStartTime)
                    .toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                showToast(`Lưu ý: Phòng có lịch họp tiếp theo lúc ${nextStart}.`, 'info');
            }
        };

        // [2026-08-22] Ghi chú real-time: BE bắn `meeting.note.created` vào room
        // meeting:{id} khi BẤT KỲ ai thêm ghi chú (live-meeting.service.ts).
        // Payload CỐ Ý không kèm nội dung (room có cả socket khách ngoài công
        // ty) nên ở đây nạp lại qua loadNotes() — endpoint đọc vốn đã lọc đúng
        // quyền/visibility của từng người. Debounce nhẹ để nhiều người gõ liên
        // tục không gọi API dồn dập, mirror MinutesTabContent.jsx.
        const onNoteCreated = (payload) => {
            if (payload?.meetingId && payload.meetingId !== id) return;
            if (noteRefreshTimerRef.current) clearTimeout(noteRefreshTimerRef.current);
            noteRefreshTimerRef.current = setTimeout(() => { loadNotes(); }, 400);
        };

        // BE bắn `meeting.attendance.updated` vào room meeting:{id} khi có check-in MỚI
        // qua camera (face-attendance.service.ts, [FIX 2026-08-16]) — hiện CHỈ phủ nhánh
        // check-in camera, chưa phủ check-out/điểm danh thủ công. Nạp lại qua
        // loadAttendance() (đã dùng cho polling 15s + sau handleManualCheckIn/
        // handleInvalidateAttendance) thay vì tự vá state từ payload, để mọi nơi đọc
        // attendance đều đi qua 1 nguồn nhất quán. Debounce mirror ĐÚNG onNoteCreated.
        const onAttendanceUpdated = (payload) => {
            if (payload?.meetingId && payload.meetingId !== id) return;
            if (attendanceRefreshTimerRef.current) clearTimeout(attendanceRefreshTimerRef.current);
            attendanceRefreshTimerRef.current = setTimeout(() => { loadAttendance(); }, 400);
        };

        s.on('meeting.note.created', onNoteCreated);
        s.on('meeting.attendance.updated', onAttendanceUpdated);
        s.on('meeting.session.started', onSessionStarted);
        s.on('meeting.session.ended', onSessionEnded);
        s.on('agenda:presented', onAgendaPresented);
        s.on('agenda:present_stopped', onAgendaPresentStopped);
        s.on('meeting.extension_request.created', onExtensionCreated);
        s.on('agenda:changed', onAgendaChanged);
        s.on('meeting.noshow.alert', onNoShowAlert);
        s.on('meeting.time.warning', onTimeWarning);

        return () => {
            if (noteRefreshTimerRef.current) clearTimeout(noteRefreshTimerRef.current);
            if (attendanceRefreshTimerRef.current) clearTimeout(attendanceRefreshTimerRef.current);
            s.off('meeting.note.created', onNoteCreated);
            s.off('meeting.attendance.updated', onAttendanceUpdated);
            s.off('meeting.session.started', onSessionStarted);
            s.off('meeting.session.ended', onSessionEnded);
            s.off('agenda:presented', onAgendaPresented);
            s.off('agenda:present_stopped', onAgendaPresentStopped);
            s.off('meeting.extension_request.created', onExtensionCreated);
            s.off('agenda:changed', onAgendaChanged);
            s.off('meeting.noshow.alert', onNoShowAlert);
            s.off('meeting.time.warning', onTimeWarning);
            cleanup();
        };
    }, [meetingState?.status, id]);

    useEffect(() => {
        let attendanceInterval;
        // Reset stop-flags whenever the meeting enters (or re-enters) in_progress so that
        // a fresh session gets a clean chance — previous 403/409 flags are stale.
        attendanceErrorRef.current = false;
        devicesErrorRef.current = false;

        if (meetingState?.status === 'in_progress') {
            loadNotes();
            loadAttendance();
            fetchMediaFiles();
            fetchRecordingSessions();
            const roomId = meetingState?.room?.id || meetingState?.room?.room_id;
            if (roomId) loadRoomDevices(roomId);
            attendanceInterval = setInterval(loadAttendance, 15000);
        }
        return () => { if (attendanceInterval) clearInterval(attendanceInterval); };
    }, [meetingState?.status, meetingState?.hostId, myParticipantId, id]);

    useEffect(() => { initMeetingState(); }, [id]);

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === `meeting_state_${id}`) {
                try {
                    const newState = JSON.parse(e.newValue);
                    if (newState) setMeetingState(newState);
                } catch (err) { }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [id]);

    useEffect(() => {
        if (!meetingState) return;
        const me = meetingState.participants?.find(p => p.id === myParticipantId);
        if (me?.isMuted && !prevMutedRef.current) {
            showToast('Bạn đã bị Chủ tọa tắt tiếng!', 'error');
            setIsMicOn(false);
        }
        prevMutedRef.current = me?.isMuted;

        if (meetingState.reactionsLocked && !prevReactionsLockedRef.current) {
            showToast('Chủ tọa đã khóa tính năng thả cảm xúc!', 'warning');
        } else if (!meetingState.reactionsLocked && prevReactionsLockedRef.current) {
            showToast('Chủ tọa đã mở khóa cảm xúc.', 'success');
        }
        prevReactionsLockedRef.current = meetingState.reactionsLocked;
    }, [meetingState, myParticipantId]);

    useEffect(() => {
        if (!meetingState?.lastReaction) return;
        const { senderId, emoji, timestamp } = meetingState.lastReaction;
        if (Date.now() - timestamp < 1500) {
            const reactionId = `reaction-${Date.now()}-${Math.random()}`;
            setFloatingReactions(prev => [...prev, { id: reactionId, emoji, participantId: senderId }]);
            const timerId = setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== reactionId)), 2200);
            reactionTimersRef.current.push(timerId);
        }
    }, [meetingState?.lastReaction]);

    useEffect(() => {
        participantsRef.current = meetingState?.participants;
    }, [meetingState?.participants]);

    useEffect(() => {
        if (!meetingState || meetingState.status !== 'in_progress') return;
        const interval = setInterval(() => {
            if (speakingOverrideRef.current && Date.now() - speakingOverrideRef.current < 15000) return;
            const unmutedBots = participantsRef.current?.filter(p => p.isBot && !p.isMuted) || [];
            if (unmutedBots.length === 0) return;
            const randomBot = unmutedBots[Math.floor(Math.random() * unmutedBots.length)];
            setMeetingState(prev => {
                const next = { ...prev, participants: prev.participants.map(p => ({ ...p, isSpeaking: p.id === randomBot.id })) };
                localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                return next;
            });
        }, 12000);
        return () => clearInterval(interval);
    }, [meetingState?.status, id]);

    const isHost = meetingState?.hostId === myParticipantId;

    const initialTabSet = useRef(false);

    useEffect(() => {
        if (!meetingState) return;
        
        if (!initialTabSet.current) {
            setActiveChatTab(isHost ? 'host' : 'agenda');
            initialTabSet.current = true;
            return;
        }

        const hostTabs = ['host', 'guests', 'recordings'];
        if (!isHost && hostTabs.includes(activeChatTab)) {
            showToast('Hệ thống chỉ dành cho host!', 'error');
            setActiveChatTab('agenda');
        }
    }, [activeChatTab, isHost, meetingState]);

    // FE-MB: Countdown đến scheduled end time
    useEffect(() => {
        if (!meetingState?.endTime || meetingState?.status !== 'in_progress') {
            setMeetingTimeLeft(null);
            return;
        }
        const tick = () => {
            const left = Math.floor((new Date(meetingState.endTime) - Date.now()) / 1000);
            setMeetingTimeLeft(left);
            if (left <= 0) setMeetingOverdue(true);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [meetingState?.endTime, meetingState?.status]);

    useEffect(() => {
        if (!meetingState || meetingState.status !== 'in_progress') return;
        const countdown = setInterval(() => {
            if (isHost) {
                setMeetingState(prev => {
                    const next = { ...prev, agendaTimeLeft: Math.max(0, prev.agendaTimeLeft - 1) };
                    localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                    return next;
                });
            } else {
                setMeetingState(prev => ({ ...prev, agendaTimeLeft: Math.max(0, prev.agendaTimeLeft - 1) }));
            }
        }, 1000);
        return () => clearInterval(countdown);
    }, [meetingState?.status, isHost, id]);

    // ─── Helpers ──────────────────────────────────────────────────────
    const getActualUserId = (p) => {
        if (!p) return null;
        if (typeof p === 'string') return p;
        return p.userId || p.user_id || p.user?.id || p.id;
    };

    const getAttendanceRecord = (p) =>
        attendance.find(a => (a.userId || a.user_id || a.id) === getActualUserId(p));

    const isCheckedIn = (p) => {
        const record = getAttendanceRecord(p);
        if (!record) return false;
        const status = record.presenceStatus || record.attendanceStatus || '';
        return ['present', 'late', 'checked_in', 'maybe_present'].includes(status);
    };

    const isCheckedOut = (p) => {
        const record = getAttendanceRecord(p);
        return !!(record?.checkOutTime || record?.check_out_time);
    };

    const getPresenceStatus = (p) => {
        const record = getAttendanceRecord(p);
        return record ? (record.presenceStatus || record.attendanceStatus || 'unknown') : 'unknown';
    };

    const getDeviceType = (device) => device?.device_type || device?.deviceType || device?.type;
    const isRecordingCamera = (device) => ['room_camera', 'ip_camera'].includes(getDeviceType(device));
    const pickRecordingCamera = () =>
        roomDevices.find(d => isRecordingCamera(d) && getDeviceType(d) === 'room_camera')
        || roomDevices.find(d => isRecordingCamera(d) && getDeviceType(d) === 'ip_camera');

    const checkedInCount = meetingState?.participants?.filter(p => isCheckedIn(p)).length || 0;
    const uncheckedAttendanceParticipants = (meetingState?.participants || []).filter(p => !isCheckedIn(p));
    const hasUncheckedAttendanceParticipants = uncheckedAttendanceParticipants.length > 0;
    const pendingExitParticipants = (meetingState?.participants || []).filter(p => isCheckedIn(p) && !isCheckedOut(p));
    const hasAutoFaceScanTargets = autoFaceScanDirection === 'out'
        ? pendingExitParticipants.length > 0
        : hasUncheckedAttendanceParticipants;

    const captureAutoFaceSnapshot = useCallback(() => {
        const video = autoFaceVideoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return null;
        try {
            const canvas = document.createElement('canvas');
            const width = Math.min(video.videoWidth, 640);
            const height = Math.round((video.videoHeight / video.videoWidth) * width);
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(video, 0, 0, width, height);
            return canvas.toDataURL('image/jpeg', 0.82);
        } catch (_) {
            return null;
        }
    }, []);

    const handleAutoFaceScan = useCallback(async () => {
        if (!id || !hasAutoFaceScanTargets || autoFaceScanLoading || autoFaceScanLockRef.current) return;
        autoFaceScanLockRef.current = true;
        setAutoFaceScanLoading(true);
        setAutoFaceCameraError('');
        try {
            const snapshotImageBase64 = captureAutoFaceSnapshot();
            const res = await request('/dev/mock-camera-face-scan', {
                method: 'POST',
                body: { meetingId: id, direction: autoFaceScanDirection, snapshotImageBase64 }
            });
            if (!res?.success) {
                throw new Error(res?.error?.message || res?.message || 'Camera API không xử lý được lượt quét.');
            }

            const data = res.data || {};
            setLastAutoFaceScan({
                at: new Date().toISOString(),
                matched: data.matched === true,
                skipped: data.skipped === true,
                userName: data.fullName || data.userName || '',
                note: data.note || '',
                hasSnapshot: !!snapshotImageBase64,
                direction: data.direction || autoFaceScanDirection
            });

            await loadAttendance();
            if (data.skipped) {
                showToast(autoFaceScanDirection === 'out'
                    ? 'Người này đã có lượt ra, hệ thống bỏ qua lượt quét lặp.'
                    : 'Người này đã được điểm danh, hệ thống bỏ qua lượt quét lặp.', 'info');
            } else if (data.matched) {
                showToast(`${autoFaceScanDirection === 'out' ? 'Đã ghi nhận ra khỏi phòng' : 'Đã tự động điểm danh vào phòng'}${data.fullName ? `: ${data.fullName}` : ''}.`, 'success');
            } else {
                showToast('Không khớp FaceID đã đăng ký, đã ghi nhận cảnh báo.', 'warning');
            }
        } catch (err) {
            const message = err?.error?.message || err?.message || 'Không xử lý được lượt quét từ camera.';
            setAutoFaceCameraError(message);
            showToast(message, 'error');
        } finally {
            setAutoFaceScanLoading(false);
            setTimeout(() => { autoFaceScanLockRef.current = false; }, 4500);
        }
    }, [autoFaceScanDirection, autoFaceScanLoading, captureAutoFaceSnapshot, hasAutoFaceScanTargets, id, loadAttendance]);

    const { guidance: autoFaceGuidance, modelError: autoFaceModelError } = useFaceGuidance({
        videoRef: autoFaceVideoRef,
        active: !!autoFaceCameraStream && hasAutoFaceScanTargets && !autoFaceScanLoading,
        onStable: handleAutoFaceScan,
        stableFramesRequired: 8,
        intervalMs: 180
    });

    useEffect(() => {
        if (!autoFaceCameraStream || hasAutoFaceScanTargets) return;
        setLastAutoFaceScan(prev => prev || {
            at: new Date().toISOString(),
            matched: true,
            skipped: true,
            userName: '',
            note: autoFaceScanDirection === 'out'
                ? 'Tất cả người đã vào phòng đều đã có lượt ra.'
                : 'Tất cả người tham gia đã được điểm danh.'
        });
    }, [autoFaceCameraStream, autoFaceScanDirection, hasAutoFaceScanTargets]);

    const handleEndMeeting = useCallback(async (options = {}) => {
        if (!isHost) return;
        const isAuto = options?.auto === true;
        setActionLoading(true);
        try {
            const res = await callWithFallback(endEmployee, endManager, id);
            if (res?.success) {
                setMeetingState(prev => {
                    const next = { ...prev, status: 'completed' };
                    localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                    return next;
                });
                showToast(isAuto ? 'Cuộc họp đã hết giờ và được tự động kết thúc.' : 'Cuộc họp đã kết thúc', 'info');
                setTimeout(() => navigate(isPublic ? '/' : '/employee'), 1200);
            } else {
                autoEndMeetingTriggeredRef.current = false;
                showToast(res?.message || res?.error?.message || 'Lỗi khi kết thúc', 'error');
            }
        } catch (err) {
            autoEndMeetingTriggeredRef.current = false;
            showToast(err?.error?.message || err?.message || 'Lỗi kết nối', 'error');
        } finally {
            setActionLoading(false);
            setConfirmLeaveModal(false);
        }
    }, [id, isHost, isPublic, navigate]);

    useEffect(() => {
        if (!isHost || !meetingOverdue || meetingState?.status !== 'in_progress') return;
        if (actionLoading || autoEndMeetingTriggeredRef.current) return;
        autoEndMeetingTriggeredRef.current = true;
        handleEndMeeting({ auto: true });
    }, [actionLoading, handleEndMeeting, isHost, meetingOverdue, meetingState?.status]);

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-cloud-mist px-4 text-center">
                <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
                <p className="text-midnight-indigo text-base font-bold">Không thể tải thông tin cuộc họp</p>
                <p className="mt-1 text-slate-blue text-sm max-w-md">
                    Vui lòng kiểm tra kết nối mạng và thử lại. Nếu tình trạng này tiếp diễn, hãy liên hệ quản trị viên.
                </p>
                <button
                    onClick={initMeetingState}
                    className="mt-5 px-5 py-2.5 rounded-xl bg-action-blue text-white text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" /> Thử lại
                </button>
            </div>
        );
    }

    if (loading || !meetingState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-cloud-mist">
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-slate-blue text-sm font-semibold">Đang nạp dữ liệu phòng họp...</p>
            </div>
        );
    }

    const getDefaultGuestName = () =>
        sessionStorage.getItem(`guest_name_${id}`) || `Khách ${myParticipantId.split('-')[1] || myParticipantId.substring(0, 4)}`;

    // ─── Handlers ─────────────────────────────────────────────────────
    const handleJoinLobby = () => {
        const selectedName = localName.trim() || (currentUser ? currentUser.fullName || currentUser.full_name : getDefaultGuestName());
        sessionStorage.setItem(`guest_name_${id}`, selectedName);
        setMeetingState(prev => {
            const list = [...prev.participants];
            const exists = list.find(p => p.id === myParticipantId);
            const userRole = isPublic ? 'Khách' : (prev.hostId === myParticipantId ? 'Chủ tọa' : 'Thành viên');
            if (exists) {
                exists.fullName = selectedName;
                exists.avatarUrl = resolveAvatarUrl(currentUser) || exists.avatarUrl;
                exists.role = userRole;
                exists.isMuted = !isMicOn;
                exists.isPresent = true;
            } else {
                list.push({ id: myParticipantId, fullName: selectedName, avatarUrl: resolveAvatarUrl(currentUser), role: userRole, isMuted: !isMicOn, isSpeaking: false, isBot: false, isPresent: true });
            }
            const next = { ...prev, participants: list };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        setIsLobbyReady(true);
        showToast('Đã tham gia phòng chờ!', 'success');
    };

    const handleStartMeeting = async () => {
        if (!isHost) return;
        setActionLoading(true);
        try {
            const res = await callWithFallback(startEmployee, startManager, id);
            if (res?.success) {
                setMeetingState(prev => {
                    const next = { ...prev, status: 'in_progress', agendaTimeLeft: (prev.agenda?.[0]?.durationMin || 10) * 60 };
                    localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                    return next;
                });
                showToast('Cuộc họp đã bắt đầu!', 'success');
            } else {
                showToast(res?.message || res?.error?.message || 'Lỗi khi bắt đầu', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleStartRecording = async () => {
        if (!isHost) return;

        let camera = pickRecordingCamera();
        const roomId = meetingState?.room?.id || meetingState?.room?.room_id;
        if (!camera) {
            const latestDevices = await loadRoomDevices(roomId, { force: true });
            camera = latestDevices.find(d => isRecordingCamera(d) && getDeviceType(d) === 'room_camera')
                || latestDevices.find(d => isRecordingCamera(d) && getDeviceType(d) === 'ip_camera');
        }

        if (!camera) {
            if (!roomId) {
                showToast('Cuộc họp chưa có phòng để tạo camera ảo.', 'error');
                return;
            }
            setActionLoading(true);
            try {
                const res = await callWithFallback(createEmployeeMockCamera, createManagerMockCamera, {
                    roomId,
                    deviceName: `Camera ảo - ${meetingState?.roomName || meetingState?.room?.name || 'Phòng họp'}`,
                });
                if (!res?.success || !res.data?.id) {
                    showToast(res?.message || 'Không thể tạo camera ảo cho phòng.', 'error');
                    return;
                }
                camera = res.data;
                setRoomDevices(prev => [camera, ...prev.filter(d => d.id !== camera.id)]);
                showToast('Đã tạo camera phòng ảo. Đang khởi động ghi hình...', 'info');
            } catch (err) {
                showToast(err?.error?.message || err?.message || 'Không thể tạo camera ảo cho phòng.', 'error');
                setActionLoading(false);
                return;
            }
        }

        setActionLoading(true);
        try {
            const res = await callWithFallback(startEmployeeVideoRecording, startManagerVideoRecording, id, { cameraDeviceId: camera.id });
            if (res?.success) {
                setRecordingStatus('starting');
                setRecordingSessionId(res.data?.recordingSessionId);
                setRecordingStartedAt(new Date());
                showToast('Đang khởi động ghi hình...', 'info');
                // GA-30: Đóng dấu mốc t=0 cho live speaker tag — không await để không chặn UI.
                // Mốc này CHỈ phục vụ live speaker tag (BE chỉ đọc nó cho event tagSource='live'),
                // nên tắt kèm theo cờ; gán người nói sau họp neo theo recording_sessions.started_at,
                // không dùng mốc này. Xem src/config/featureFlags.js.
                if (LIVE_SPEAKER_TAGGING_ENABLED) {
                    startRecordingMarker(id).catch(err =>
                        console.error('[LiveTag] Không ghi được mốc bắt đầu, live speaker tag sẽ không hoạt động:', err)
                    );
                }
            } else {
                showToast('Lỗi khi bắt đầu ghi hình', 'error');
            }
        } catch (err) {
            showToast(err?.error?.message || err?.message || 'Lỗi kết nối server camera', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // GA-32: Handler gắn thẻ người đang nói
    const handleLiveSpeakerTag = async () => {
        const p = (meetingState.participants || []).find(x => x.id === liveTagSelected);
        if (!p) return;
        setLiveTagSubmitting(true);
        try {
            const isExternal = p.isExternal === true;
            const payload = {
                ...(isExternal ? { externalParticipantId: p.id } : { speakerUserId: p.id }),
                displayName: p.fullName,
            };
            const res = await createLiveSpeakerTag(id, payload);
            if (res?.success) {
                showToast(`Đã gắn: ${p.fullName}`, 'success');
                setLiveTagSelected('');
            } else {
                showToast(res?.message || 'Gắn thẻ thất bại', 'error');
            }
        } catch (err) {
            showToast(err?.error?.message || err?.message || 'Có lỗi khi gắn thẻ người nói', 'error');
        } finally {
            setLiveTagSubmitting(false);
        }
    };

    const handlePauseRecording = async () => {
        if (!isHost || !recordingSessionId) return;
        setActionLoading(true);
        try {
            const res = await callWithFallback(pauseEmployeeVideoRecording, pauseManagerVideoRecording, id, recordingSessionId);
            if (res?.success) { setRecordingStatus('paused'); showToast('Đã tạm dừng ghi hình', 'info'); }
        } catch (err) { showToast('Lỗi kết nối', 'error'); } finally { setActionLoading(false); }
    };

    const handleResumeRecording = async () => {
        if (!isHost || !recordingSessionId) return;
        setActionLoading(true);
        try {
            const res = await callWithFallback(resumeEmployeeVideoRecording, resumeManagerVideoRecording, id, recordingSessionId);
            if (res?.success) { setRecordingStatus('recording'); showToast('Đã tiếp tục ghi hình', 'success'); }
        } catch (err) { showToast('Lỗi kết nối', 'error'); } finally { setActionLoading(false); }
    };

    const handleStopRecording = async () => {
        if (!isHost || !recordingSessionId) return;
        if (!['recording', 'paused', 'starting'].includes(recordingStatus)) return;
        setActionLoading(true);
        try {
            const res = await callWithFallback(stopEmployeeVideoRecording, stopManagerVideoRecording, id, recordingSessionId);
            if (res?.success) {
                await markRecordingInactive();
                showToast('Ghi hình đã hoàn tất.', 'success');
            }
        } catch (err) {
            if (isRecordingNotActiveError(err)) {
                await markRecordingInactive();
                showToast('Phiên ghi hình đã được dừng trước đó.', 'info');
                return;
            }
            showToast(err?.error?.message || err?.message || 'Lỗi kết nối', 'error');
        } finally { setActionLoading(false); }
    };

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!noteInput.trim()) return;
        try {
            const payload = { content: noteInput, noteType: 'in_meeting' };
            if (shareNoteWithGuest) payload.visibilityLevel = 'guest_shared';
            const res = await callWithFallback(createEmployeeNote, createManagerNote, id, payload);
            if (res?.success) {
                setNoteInput('');
                setShareNoteWithGuest(false);
                loadNotes();
                showToast('Đã thêm ghi chú', 'success');
            }
        } catch (err) { showToast('Lỗi khi thêm ghi chú', 'error'); }
    };

    const handleMicToggle = () => {
        const me = meetingState.participants?.find(p => p.id === myParticipantId);
        if (me?.isMuted && isMicOn) { showToast('Bạn đã bị Chủ tọa tắt tiếng!', 'error'); return; }
        const nextVal = !isMicOn;
        setIsMicOn(nextVal);
        setMeetingState(prev => {
            const next = { ...prev, participants: prev.participants.map(p => p.id === myParticipantId ? { ...p, isMuted: !nextVal } : p) };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
    };

    const handleSelfSpeak = () => {
        speakingOverrideRef.current = Date.now();
        setMeetingState(prev => {
            const next = { ...prev, participants: prev.participants.map(p => ({ ...p, isSpeaking: p.id === myParticipantId })) };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        showToast('Bạn đang phát biểu!', 'success');
    };

    const handleToggleRaiseHand = () => {
        const next = !isHandRaised;
        setIsHandRaised(next);
        showToast(next ? 'Bạn đã giơ tay.' : 'Bạn đã hạ tay.', 'info');
    };

    const sendReaction = (emoji) => {
        if (meetingState.reactionsLocked && !isHost) { showToast('Cảm xúc đang bị Chủ tọa khóa!', 'error'); return; }
        setMeetingState(prev => {
            const next = { ...prev, lastReaction: { senderId: myParticipantId, emoji, timestamp: Date.now() } };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        setShowReactionPicker(false);
    };

    const handleHostMuteToggle = (pId, currentMuteState) => {
        if (!isHost) return;
        setMeetingState(prev => {
            const next = { ...prev, participants: prev.participants.map(p => p.id === pId ? { ...p, isMuted: !currentMuteState } : p) };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        showToast(currentMuteState ? 'Đã bật tiếng cho thành viên.' : 'Đã tắt tiếng thành viên.', 'info');
    };

    const handleHostMuteAll = () => {
        if (!isHost) return;
        setMeetingState(prev => {
            const next = { ...prev, participants: prev.participants.map(p => p.id !== myParticipantId ? { ...p, isMuted: true } : p) };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        showToast('Đã tắt tiếng tất cả!', 'warning');
    };

    const handleHostToggleLockReactions = () => {
        if (!isHost) return;
        const nextLocked = !meetingState.reactionsLocked;
        setMeetingState(prev => {
            const next = { ...prev, reactionsLocked: nextLocked };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
    };

    const handleNextAgenda = () => {
        if (!isHost) return;
        if (meetingState.currentAgendaIndex + 1 < (meetingState.agenda?.length || 0)) {
            const nextIdx = meetingState.currentAgendaIndex + 1;
            setMeetingState(prev => {
                const next = { ...prev, currentAgendaIndex: nextIdx, agendaTimeLeft: (prev.agenda[nextIdx].durationMin || 10) * 60 };
                localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                return next;
            });
            try {
                getSocket().emit('agenda:changed', { meetingId: id, currentAgendaIndex: nextIdx });
            } catch (e) { }
            showToast('Đã chuyển sang mục tiếp theo trong chương trình.', 'success');
        } else {
            showToast('Chương trình đã kết thúc.', 'warning');
        }
    };

    const handleManualCheckIn = async (participant) => {
        setManualCheckInLoading(participant.id);
        try {
            const actualUserId = participant.userId || participant.user_id || participant.user?.id || participant.id;
            const res = await manualAttendanceCheckIn(id, { userId: actualUserId });
            if (res?.success) {
                showToast(`Đã điểm danh thủ công cho ${participant.fullName}`, 'success');
                await loadAttendance();
            } else {
                showToast(res?.error?.message || 'Lỗi khi điểm danh thủ công', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server', 'error');
        } finally {
            setManualCheckInLoading(null);
        }
    };

    const handleInvalidateAttendance = async (participant) => {
        const actualUserId = participant.userId || participant.user_id || participant.user?.id || participant.id;
        const record = getAttendanceRecord(actualUserId);
        if (!record?.id) return;
        setManualCheckInLoading(participant.id);
        try {
            const res = await invalidateAttendanceRecord(id, record.id, { reason: 'Chủ tọa hủy điểm danh thủ công' });
            if (res?.success) {
                showToast(`Đã hủy điểm danh của ${participant.fullName}`, 'info');
                await loadAttendance();
            } else {
                showToast(res?.error?.message || 'Lỗi khi hủy điểm danh', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server', 'error');
        } finally {
            setManualCheckInLoading(null);
        }
    };

    // [Việc B, tái đánh giá 2026-08-21] "Tôi vẫn đến" giờ gia hạn (snoozed, có hạn
    // chót snoozeUntil), KHÔNG còn dismiss vĩnh viễn — banner giữ nguyên hiển thị,
    // chỉ đổi sang trạng thái "đã xác nhận, đang chờ" thay vì tự đóng hẳn.
    const handleDismissNoShow = async () => {
        const caseId = noShowWarning?.caseId;
        if (!caseId) return;
        try {
            const res = await patch(`/no-show-cases/${caseId}`, { detectionStatus: 'snoozed' });
            if (res?.success) {
                setNoShowWarning((prev) => (prev ? { ...prev, kind: 'snoozed', snoozeUntil: res.data?.snoozeUntil ?? null } : null));
            } else {
                showToast(res?.error?.message || 'Không kịp — phòng có thể đã được giải phóng. Vui lòng kiểm tra lại.', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server, vui lòng thử lại.', 'error');
        }
    };

    const handleRequestExtension = async () => {
        if (!extensionModal.minutes || extensionModal.minutes < 1) return;
        setActionLoading(true);
        try {
            const res = await callWithFallback(requestEmployeeExtension, requestManagerExtension, id, {
                extensionMinutes: Number(extensionModal.minutes),
                reason: extensionModal.reason || 'Cần thêm thời gian để hoàn thành chương trình',
            });
            if (res?.success) {
                const data = res.data || {};
                setExtensionModal({ isOpen: false, minutes: 15, reason: '' });
                if (data.status === 'rejected') {
                    setExtensionRejectedInfo(data);
                } else {
                    showToast(`Đã gia hạn thêm ${extensionModal.minutes} phút.`, 'success');
                }
            } else {
                showToast(res?.error?.message || 'Lỗi khi gửi yêu cầu gia hạn', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDecideExtension = async (requestId, decision) => {
        setActionLoading(true);
        try {
            const res = await callWithFallback(decideEmployeeExtension, decideManagerExtension, id, requestId, {
                decision,
                reason: decision === 'approved' ? 'Đã duyệt gia hạn' : 'Từ chối gia hạn',
            });
            if (res?.success) {
                setPendingExtensions(prev => prev.filter(r => r.id !== requestId));
                showToast(decision === 'approved' ? 'Đã duyệt yêu cầu gia hạn.' : 'Đã từ chối yêu cầu gia hạn.', decision === 'approved' ? 'success' : 'info');
            }
        } catch (err) {
            showToast('Lỗi kết nối server', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRenameSelf = () => {
        const currentName = meetingState.participants?.find(p => p.id === myParticipantId)?.fullName || '';
        setRenameModal({ isOpen: true, targetId: myParticipantId, currentName, isSelf: true });
    };

    const handleHostRename = (pId, currentName) => {
        if (!isHost) return;
        setRenameModal({ isOpen: true, targetId: pId, currentName, isSelf: false });
    };

    const submitRename = (name) => {
        if (name?.trim()) {
            setMeetingState(prev => {
                const next = { ...prev, participants: prev.participants.map(p => p.id === renameModal.targetId ? { ...p, fullName: name.trim() } : p) };
                localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
                return next;
            });
            showToast(renameModal.isSelf ? 'Đổi tên thành công!' : 'Đã thay đổi tên thành viên!', 'success');
        }
        setRenameModal({ isOpen: false, targetId: null, currentName: '', isSelf: true });
    };

    const handleLeaveRoom = () => {
        // Nếu cuộc họp đã kết thúc thì không cần hỏi xác nhận, navigate thẳng
        if (meetingState.status === 'completed') {
            navigate(isPublic ? '/' : '/employee');
            return;
        }
        setConfirmLeaveModal(true);
    };

    const confirmLeave = () => {
        setMeetingState(prev => {
            const next = { ...prev, participants: prev.participants.map(p => p.id === myParticipantId ? { ...p, isPresent: false } : p) };
            localStorage.setItem(`meeting_state_${id}`, JSON.stringify(next));
            return next;
        });
        navigate(isPublic ? '/' : '/employee');
    };

    // ─── Computed ─────────────────────────────────────────────────────
    // Only show participants who have actively joined (isPresent) + admitted external guests
    const activeGridParticipants = [
        ...(meetingState.participants || []).filter(p => p.isPresent),
        ...admittedGuests.map(g => ({
            id: g.externalParticipantId,
            fullName: g.fullName || g.externalName || 'Khách ngoài',
            role: 'Khách mời',
            isSpeaking: false,
            isMuted: true
        }))
    ];

    // fullLabel dùng cho tooltip title, label ngắn để hiển thị trong tab (tránh xuống dòng)
    const tabs = [
        ...(isHost ? [{ id: 'host', label: 'Q.Lý', fullLabel: 'Quản lý', icon: Shield }] : []),
        { id: 'agenda', label: 'C.Trình', fullLabel: 'Chương trình', icon: Calendar },
        { id: 'notes', label: 'Ghi chú', fullLabel: 'Ghi chú', icon: StickyNote },
        { id: 'minutes', label: 'Biên bản', fullLabel: 'Biên bản họp', icon: ClipboardList },
        { id: 'attendance', label: 'T.Gia', fullLabel: 'Người tham gia', icon: Users },
        ...(isHost ? [{ id: 'guests', label: 'Khách', fullLabel: 'Khách', icon: UserCheck }] : []),
        ...(isHost ? [{ id: 'recordings', label: 'Ghi âm', fullLabel: 'Quản lý ghi âm', icon: Film }] : []),
    ];

    // ─── RENDER ───────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[100] bg-cloud-mist text-midnight-indigo flex flex-col overflow-hidden">
            <style dangerouslySetInnerHTML={{ __html: customStyles }} />

            {/* FE-MC: OVERDUE MODAL — chỉ hiện cho host khi meeting hết giờ */}
            {isHost && meetingOverdue && meetingState?.status === 'in_progress' && (
                <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center border border-red-100">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <h2 className="text-lg font-bold text-midnight-indigo mb-1">Cuộc họp đã hết giờ</h2>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                            Vui lòng kết thúc để giải phóng phòng cho lịch sử dụng tiếp theo.
                        </p>
                        <button
                            onClick={handleEndMeeting}
                            disabled={actionLoading}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {actionLoading ? (
                                <><Loader className="w-4 h-4 animate-spin" /> Đang kết thúc...</>
                            ) : (
                                'Kết thúc & Giải phóng phòng'
                            )}
                        </button>
                        <button
                            onClick={() => setExtensionModal({ isOpen: true, minutes: 15, reason: '' })}
                            disabled={actionLoading}
                            className="w-full mt-2.5 py-3 bg-white hover:bg-cloud-mist text-midnight-indigo border border-platinum-tint rounded-xl font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <IoTime className="w-4 h-4" /> Yêu cầu gia hạn thêm giờ
                        </button>
                    </div>
                </div>
            )}

            {/* FE-MB: COUNTDOWN BANNER — hiện khi còn ≤ 10 phút */}
            {meetingTimeLeft !== null && meetingTimeLeft <= 600 && meetingState?.status === 'in_progress' && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-lg font-bold text-sm pointer-events-none select-none
                    ${meetingTimeLeft <= 0
                        ? 'bg-red-600 text-white'
                        : meetingTimeLeft <= 300
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-amber-500 text-white'}`}
                >
                    <IoTime className="w-4 h-4 shrink-0" />
                    {meetingTimeLeft > 0
                        ? `Còn ${Math.floor(meetingTimeLeft / 60)}:${String(meetingTimeLeft % 60).padStart(2, '0')} — sắp hết giờ họp`
                        : 'Cuộc họp đã hết giờ'}
                </div>
            )}

            {/* HEADER */}
            <header className="h-14 border-b border-platinum-tint bg-white px-5 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLeaveRoom}
                        className="w-10 h-10 rounded-full border border-platinum-tint/70 bg-white hover:bg-slate-50 hover:shadow-sm text-slate-500 hover:text-midnight-indigo flex items-center justify-center transition-all duration-200 group mr-2"
                        title="Quay lại"
                    >
                        <IoArrowBack className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div className="flex items-center gap-3.5 border-l border-platinum-tint/50 pl-4">
                        <img src={logo} alt="Logo" className="h-9 w-auto object-contain shrink-0 drop-shadow-sm" />
                        <div className="flex flex-col justify-center">
                            <h1 className="text-[17px] font-extrabold text-midnight-indigo leading-tight tracking-tight">
                                {meetingState.title}
                            </h1>
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{meetingState.roomName}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {meetingState.status === 'in_progress' && (
                        <>
                            {admittedGuestCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    {admittedGuestCount} khách ngoài đang xem
                                </span>
                            )}
                            {pendingExtensions.length > 0 && isHost && (
                                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                                    {pendingExtensions.length} yêu cầu gia hạn
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 font-bold text-[11px] rounded-full border border-red-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Đang diễn ra
                            </span>
                        </>
                    )}
                </div>
            </header>

            {/* VIEW A: LOBBY */}
            {!isLobbyReady && meetingState.status === 'scheduled' && (
                <div className="flex-1 flex items-center justify-center p-6 z-10">
                    <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-platinum-tint shadow-sm-2 space-y-6">
                        <div className="text-center space-y-2">
                            <div className="w-20 h-20 bg-blue-50/50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
                                <img src={logo} alt="Logo" className="w-12 h-12 object-contain drop-shadow-sm" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-midnight-indigo leading-tight">{meetingState.title}</h2>
                            <p className="text-sm text-slate-blue">{meetingState.roomName}</p>
                        </div>

                        <div className="bg-cloud-mist rounded-2xl p-4 border border-platinum-tint space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-blue font-medium">Chủ tọa</span>
                                <span className="font-bold text-midnight-indigo">{meetingState.host}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-blue font-medium">Thành viên</span>
                                <span className="font-bold text-midnight-indigo">{meetingState.participants?.length || 0} người</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {(!currentUser || isPublic) && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider mb-1.5">Tên hiển thị của bạn</label>
                                    <input
                                        type="text"
                                        value={localName}
                                        onChange={(e) => setLocalName(e.target.value)}
                                        placeholder={getDefaultGuestName()}
                                        className="w-full px-4 py-3 bg-cloud-mist border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue transition-colors text-midnight-indigo font-semibold"
                                    />
                                    {isPublic && (
                                        <p className="text-[10px] text-emerald-600 mt-1 font-medium">Tham gia với tư cách Khách ngoài hệ thống.</p>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between p-3 bg-cloud-mist rounded-xl border border-platinum-tint">
                                <div className="flex items-center gap-2 text-xs font-semibold text-midnight-indigo">
                                    {isMicOn ? <Mic className="w-4 h-4 text-action-blue" /> : <MicOff className="w-4 h-4 text-red-500" />}
                                    Microphone
                                </div>
                                <button
                                    onClick={() => setIsMicOn(!isMicOn)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isMicOn ? 'bg-action-blue' : 'bg-pale-gray'}`}
                                >
                                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isMicOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            </div>

                            <button
                                onClick={handleJoinLobby}
                                className="w-full py-3 bg-action-blue hover:bg-glacier-blue active:scale-[0.98] text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-action-blue/20"
                            >
                                Tham gia phòng chờ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW B: WAITING LOBBY */}
            {isLobbyReady && meetingState.status === 'scheduled' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 z-10">
                    <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-platinum-tint shadow-sm-2 space-y-6">
                        <div className="w-14 h-14 border-4 border-action-blue border-t-transparent rounded-full animate-spin mx-auto" />
                        <div className="text-center space-y-1.5">
                            <h2 className="text-lg font-extrabold text-midnight-indigo">Chờ chủ tọa bắt đầu...</h2>
                            <p className="text-xs text-slate-blue leading-relaxed">
                                Cuộc họp sẽ tự động bắt đầu khi <strong>{meetingState.host}</strong> nhấn bắt đầu.
                            </p>
                        </div>

                        <div className="bg-cloud-mist rounded-2xl p-4 border border-platinum-tint space-y-2">
                            <span className="text-[10px] font-bold text-action-blue uppercase tracking-wider block">
                                Trong phòng chờ ({meetingState.participants?.length || 0})
                            </span>
                            <div className="max-h-40 overflow-y-auto space-y-1.5">
                                {meetingState.participants?.map(p => (
                                    <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-platinum-tint/60">
                                        <div className="flex items-center gap-2">
                                            <UserAvatar user={p} className="w-6 h-6 rounded-full shrink-0 text-[10px] font-bold" />
                                            <span className="font-semibold text-midnight-indigo">{p.fullName}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${p.role === 'Chủ tọa' ? 'bg-red-50 text-red-600' :
                                            p.role === 'Khách' ? 'bg-emerald-50 text-emerald-600' :
                                                'bg-blue-50 text-action-blue'
                                            }`}>{p.role}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isHost && (
                            <button
                                onClick={handleStartMeeting}
                                disabled={actionLoading}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                            >
                                <Play className="w-4 h-4 fill-white" />
                                {actionLoading ? 'Đang bắt đầu...' : 'Bắt đầu cuộc họp'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW D: COMPLETED */}
            {meetingState.status === 'completed' && (
                <div className="flex-1 flex items-center justify-center p-6 z-10">
                    <div className="max-w-sm w-full bg-white p-8 rounded-3xl border border-platinum-tint shadow-sm-2 text-center space-y-5">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                            <Check className="w-8 h-8 text-action-blue" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-midnight-indigo">Cuộc họp đã kết thúc</h2>
                            <p className="text-xs text-slate-blue mt-1">Cảm ơn bạn đã tham dự!</p>
                        </div>
                        <button onClick={handleLeaveRoom} className="w-full py-3 bg-cloud-mist hover:bg-pale-gray text-midnight-indigo border border-platinum-tint rounded-xl text-sm font-bold transition-all">
                            Quay về trang chủ
                        </button>
                    </div>
                </div>
            )}

            {/* VIEW C: IN PROGRESS */}
            {meetingState.status === 'in_progress' && (
                <div ref={meetingLayoutRef} className="flex-1 flex flex-col lg:flex-row relative z-10 overflow-hidden" style={{ '--sidebar-w': `${sidebarWidth}px` }}>

                    {/* Left: Video Grid + Controls */}
                    <div className="flex-1 flex flex-col bg-slate-950 relative select-none overflow-hidden">

                        {/* Document Presentation Banner */}
                        {presentedFile && (
                            <motion.div
                                initial={{ opacity: 0, y: -16 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute top-3 left-3 right-3 z-20 bg-midnight-indigo/90 backdrop-blur-md border border-white/10 p-3 rounded-xl flex items-center justify-between shadow-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-action-blue flex items-center justify-center text-white shrink-0">
                                        <MonitorUp className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-action-blue uppercase tracking-wider">Đang trình chiếu</div>
                                        <div className="text-sm font-bold text-white truncate max-w-[220px]">{presentedFile.fileName || 'Tài liệu'}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isHost && (
                                        <button
                                            onClick={() => getSocket().emit('agenda:present_stop', { meetingId: id })}
                                            className="px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold"
                                        >
                                            Dừng chiếu
                                        </button>
                                    )}
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await request(`/media-files/${presentedFile.fileId}`, { method: 'GET' });
                                                const url = res.data?.data?.downloadUrl || res.data?.downloadUrl;
                                                if (url) {
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = presentedFile.fileName || '';
                                                    a.style.display = 'none';
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                } else showToast('Không tìm thấy link tài liệu', 'error');
                                            } catch (e) { showToast('Lỗi khi mở tài liệu', 'error'); }
                                        }}
                                        className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                                    >
                                        Mở <ExternalLink className="w-3 h-3" />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Participant Grid / Agenda Doc Viewer */}
                        <div className="flex-1 overflow-hidden relative">
                            {agendaDocView ? (
                                <div className="w-full h-full flex flex-col bg-slate-950">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-action-blue" />
                                            <span className="text-sm font-bold text-white truncate max-w-[280px]">
                                                {agendaDocView.agendaItem.title}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setAgendaDocView(null)}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Attachment tabs */}
                                    {agendaDocView.agendaItem.attachments?.length > 1 && (
                                        <div className="flex gap-1 px-4 py-2 border-b border-white/10 overflow-x-auto shrink-0">
                                            {agendaDocView.agendaItem.attachments.map((att, idx) => (
                                                <button
                                                    key={att.id}
                                                    onClick={() => setAgendaDocView(v => ({ ...v, selectedAttachmentIdx: idx }))}
                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${agendaDocView.selectedAttachmentIdx === idx
                                                        ? 'bg-action-blue text-white'
                                                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                        }`}
                                                >
                                                    {att.fileName}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Description */}
                                    {agendaDocView.agendaItem.description && (
                                        <div className="px-4 py-2 bg-white/5 border-b border-white/10 shrink-0">
                                            <p className="text-[11px] text-white/70 leading-relaxed">{agendaDocView.agendaItem.description}</p>
                                        </div>
                                    )}

                                    {/* File viewer */}
                                    {(() => {
                                        const att = agendaDocView.agendaItem.attachments?.[agendaDocView.selectedAttachmentIdx ?? 0];
                                        if (!att) return (
                                            <div className="flex-1 flex items-center justify-center text-white/40 text-sm">Không có file đính kèm</div>
                                        );
                                        const ext = (att.fileName || '').split('.').pop()?.toLowerCase();
                                        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
                                        const isPdf = ext === 'pdf';
                                        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
                                        const isWord = ['doc', 'docx'].includes(ext);
                                        const isPptx = ['ppt', 'pptx'].includes(ext);

                                        return (
                                            <div className="flex-1 overflow-hidden flex flex-col">
                                                {agendaDocLoading ? (
                                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/50">
                                                        <Loader className="w-8 h-8 animate-spin" />
                                                        <p className="text-xs">Đang tải tài liệu...</p>
                                                    </div>
                                                ) : agendaDocUrl ? (
                                                    isImage ? (
                                                        agendaImgError ? (
                                                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/60">
                                                                <FileText className="w-12 h-12" />
                                                                <p className="text-sm font-medium">{att.fileName}</p>
                                                                <p className="text-xs text-white/40">Không thể tải ảnh này</p>
                                                                <a
                                                                    href={agendaDocUrl}
                                                                    download={att.fileName}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-glacier-blue transition-colors"
                                                                >
                                                                    <Download className="w-4 h-4" /> Tải xuống
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                                                <img
                                                                    src={agendaDocUrl}
                                                                    alt={att.fileName}
                                                                    onError={() => setAgendaImgError(true)}
                                                                    className="max-w-full max-h-full object-contain rounded-xl"
                                                                />
                                                            </div>
                                                        )
                                                    ) : isPdf ? (
                                                        <iframe
                                                            src={agendaDocUrl}
                                                            title={att.fileName}
                                                            className="flex-1 w-full border-0"
                                                        />
                                                    ) : isWord ? (
                                                        agendaDocxError ? (
                                                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/60">
                                                                <FileText className="w-12 h-12" />
                                                                <p className="text-sm font-medium">{att.fileName}</p>
                                                                <p className="text-xs text-white/40">Không thể xem trước tài liệu này</p>
                                                                <a
                                                                    href={agendaDocUrl}
                                                                    download={att.fileName}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-glacier-blue transition-colors"
                                                                >
                                                                    <Download className="w-4 h-4" /> Tải xuống
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 overflow-auto bg-white p-4">
                                                                <div ref={agendaDocxContainerRef} />
                                                            </div>
                                                        )
                                                    ) : isPptx ? (
                                                        agendaPptxError ? (
                                                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/60">
                                                                <FileText className="w-12 h-12" />
                                                                <p className="text-sm font-medium">{att.fileName}</p>
                                                                <p className="text-xs text-white/40">Không thể xem trước tài liệu này</p>
                                                                <a
                                                                    href={agendaDocUrl}
                                                                    download={att.fileName}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-glacier-blue transition-colors"
                                                                >
                                                                    <Download className="w-4 h-4" /> Tải xuống
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center gap-3 bg-slate-900 p-4">
                                                                <canvas ref={agendaPptxCanvasRef} className="flex-1 w-full min-h-0 max-w-full object-contain rounded-xl shadow-lg" />
                                                                {agendaPptxSlides.total > 0 && (
                                                                    <div className="flex items-center gap-3 shrink-0">
                                                                        <button
                                                                            onClick={() => goToAgendaPptxSlide(-1)}
                                                                            disabled={agendaPptxSlides.current <= 1}
                                                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                                                                        >
                                                                            <ChevronLeft className="w-4 h-4" />
                                                                        </button>
                                                                        <span className="text-[11px] text-white/60 font-medium">
                                                                            Slide {agendaPptxSlides.current}/{agendaPptxSlides.total}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => goToAgendaPptxSlide(1)}
                                                                            disabled={agendaPptxSlides.current >= agendaPptxSlides.total}
                                                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                                                                        >
                                                                            <ChevronRight className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    ) : isVideo ? (
                                                        <div className="flex-1 flex items-center justify-center p-4">
                                                            <video src={agendaDocUrl} controls className="max-w-full max-h-full rounded-xl" />
                                                        </div>
                                                    ) : (
                                                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/60">
                                                            <FileText className="w-12 h-12" />
                                                            <p className="text-sm font-medium">{att.fileName}</p>
                                                            <a
                                                                href={agendaDocUrl}
                                                                download={att.fileName}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-glacier-blue transition-colors"
                                                            >
                                                                <Download className="w-4 h-4" /> Tải xuống
                                                            </a>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/50">
                                                        <FileText className="w-10 h-10 opacity-40" />
                                                        <p className="text-xs text-white/40">Không thể tải tài liệu</p>
                                                    </div>
                                                )}
                                                {/* Download bar */}
                                                <div className="shrink-0 px-4 py-2.5 border-t border-white/10 flex items-center justify-between bg-slate-900">
                                                    <span className="text-[11px] text-white/60 truncate max-w-[200px]">{att.fileName}</span>
                                                    {agendaDocUrl && (
                                                        <a
                                                            href={agendaDocUrl}
                                                            download={att.fileName}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="w-full h-full p-4 flex items-start overflow-auto">
                                    <MeetingGrid
                                        participants={activeGridParticipants}
                                        myParticipantId={myParticipantId}
                                        isHost={isHost}
                                        localVideoStream={localVideoStream}
                                        onHostMuteToggle={handleHostMuteToggle}
                                        onRename={(pId, currentName, isSelf) => {
                                            if (isSelf) handleRenameSelf();
                                            else handleHostRename(pId, currentName);
                                        }}
                                        reactionsByParticipantId={floatingReactions.reduce((acc, fr) => {
                                            acc[fr.participantId] = fr.emoji;
                                            return acc;
                                        }, {})}
                                        sidebarOpen={isSidebarOpen}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Bottom Control Bar */}
                        <div className="h-20 bg-midnight-indigo/95 backdrop-blur-sm border-t border-white/10 px-5 flex items-center justify-between gap-3 shrink-0">

                            {/* Mic */}
                            <button
                                onClick={handleMicToggle}
                                className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl transition-all text-white shadow-sm ${isMicOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600/90 hover:bg-red-600 shadow-red-900/20'}`}
                                title={isMicOn ? 'Tắt mic' : 'Bật mic'}
                            >
                                {isMicOn ? <IoMic className="w-5 h-5" /> : <IoMicOff className="w-5 h-5" />}
                                <span className="text-[9px] font-extrabold uppercase tracking-widest">{isMicOn ? 'Mic bật' : 'Mic tắt'}</span>
                            </button>

                            {/* Webcam */}
                            <button
                                onClick={handleCamToggle}
                                className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl transition-all text-white shadow-sm ${isCamOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600/90 hover:bg-red-600 shadow-red-900/20'}`}
                                title={isCamOn ? 'Tắt webcam' : 'Bật webcam'}
                            >
                                {isCamOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                <span className="text-[9px] font-extrabold uppercase tracking-widest">{isCamOn ? 'Cam bật' : 'Cam tắt'}</span>
                            </button>

                            <div className="w-px h-10 bg-white/10 mx-1" />

                            {/* Interactions */}
                            <div className="flex items-center gap-2 relative">
                                {!isHost && (
                                    <>
                                        <button
                                            onClick={handleToggleRaiseHand}
                                            className={`p-3 rounded-2xl transition-all text-white shadow-sm ${isHandRaised ? 'bg-amber-500/90 shadow-amber-900/20' : 'bg-white/10 hover:bg-white/20'}`}
                                            title="Giơ tay"
                                        >
                                            <IoHandLeft className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={handleSelfSpeak}
                                            className="p-3 rounded-2xl text-white bg-white/10 hover:bg-white/20 transition-all shadow-sm"
                                            title="Phát biểu"
                                        >
                                            <IoVolumeHigh className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setShowReactionPicker(v => !v)}
                                            disabled={meetingState.reactionsLocked}
                                            className="p-3 rounded-2xl text-white bg-white/10 hover:bg-white/20 transition-all shadow-sm disabled:opacity-30"
                                            title="Cảm xúc"
                                        >
                                            <IoHappy className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setExtensionModal({ isOpen: true, minutes: 15, reason: '' })}
                                            className="p-3 rounded-2xl text-white bg-white/10 hover:bg-white/20 transition-all shadow-sm"
                                            title="Yêu cầu gia hạn"
                                        >
                                            <IoTime className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                                {showReactionPicker && !isHost && (
                                    <div className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 flex gap-1.5 bg-midnight-indigo border border-white/10 p-2.5 rounded-2xl shadow-2xl z-20">
                                        {['👏', '❤️', '👍', '🎉', '😂', '🔥'].map(emoji => (
                                            <button key={emoji} onClick={() => sendReaction(emoji)} className="text-xl hover:scale-125 transition-transform px-1">
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Leave */}
                            <button
                                onClick={handleLeaveRoom}
                                className="ml-auto px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center gap-2.5 shadow-lg shadow-red-900/30"
                            >
                                <IoCall className="w-4 h-4" /> Rời khỏi
                            </button>
                        </div>
                    </div>

                    {/* Sidebar Toggle Button */}
                    <button
                        onClick={() => setIsSidebarOpen(v => !v)}
                        className="hidden lg:flex items-center justify-center w-5 bg-slate-900 hover:bg-slate-800 border-x border-white/10 text-white/50 hover:text-white transition-all shrink-0 z-20"
                        title={isSidebarOpen ? 'Đóng bảng' : 'Mở bảng'}
                    >
                        {isSidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                    </button>

                    {/* Resize Handle */}
                    {isSidebarOpen && (
                        <div
                            onPointerDown={handleSidebarResizeStart}
                            className="hidden lg:block w-1.5 shrink-0 cursor-col-resize z-30 relative group bg-slate-900"
                            title="Kéo để thay đổi kích thước"
                        >
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 group-hover:bg-action-blue/50 group-active:bg-action-blue transition-colors" />
                        </div>
                    )}

                    {/* Right: Room Panel */}
                    <div className={`overflow-hidden bg-white flex flex-col shrink-0 ${isResizingSidebar ? '' : 'transition-all duration-300'} ${isSidebarOpen ? 'w-full h-[50vh] lg:h-auto lg:w-[var(--sidebar-w)] border-t lg:border-t-0 lg:border-l border-platinum-tint' : 'w-0 h-0 lg:h-auto'}`}>

                        {/* Tabs — flex-1 chia đều, label viết tắt, whitespace-nowrap */}
                        <nav className="flex border-b border-platinum-tint shrink-0 bg-white">
                            {tabs.map(tab => {
                                const isActive = activeChatTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveChatTab(tab.id)}
                                        title={tab.fullLabel || tab.label}
                                        className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 transition-all border-b-2 ${isActive
                                                ? 'border-action-blue bg-blue-50/60'
                                                : 'border-transparent hover:bg-cloud-mist'
                                            }`}
                                    >
                                        <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-action-blue' : 'text-slate-400'
                                            }`} />
                                        <span className={`text-[8px] font-bold tracking-wide whitespace-nowrap leading-none ${isActive ? 'text-action-blue' : 'text-slate-400'
                                            }`}>
                                            {tab.label}
                                        </span>
                                        {tab.id === 'attendance' && (
                                            <span className="text-[7px] font-extrabold text-emerald-600 leading-none">
                                                {checkedInCount}/{meetingState.participants?.length}
                                            </span>
                                        )}
                                        {tab.id === 'guests' && admittedGuestCount > 0 && (
                                            <span className="absolute top-0.5 right-0.5 min-w-[12px] h-3 flex items-center justify-center text-[6px] font-extrabold bg-amber-400 text-white rounded-full px-0.5">
                                                {admittedGuestCount}
                                            </span>
                                        )}
                                        {tab.id === 'host' && pendingExtensions.length > 0 && (
                                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 border border-white" />
                                        )}
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto">

                            {/* ── TAB: Quản lý (host only) ── */}
                            <div className={`p-4 space-y-4 ${activeChatTab === 'host' && isHost ? 'block' : 'hidden'}`}>

                                {/* Pending Extension Requests */}
                                {pendingExtensions.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                                        <h4 className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <Timer className="w-3.5 h-3.5" /> Yêu cầu gia hạn ({pendingExtensions.length})
                                        </h4>
                                        {pendingExtensions.map(req => (
                                            <div key={req.id} className="bg-white border border-amber-100 rounded-lg p-2.5 space-y-1.5">
                                                <p className="text-xs font-semibold text-midnight-indigo">
                                                    <span className="font-bold">{req.requesterName || 'Thành viên'}</span> yêu cầu gia hạn <span className="text-action-blue font-extrabold">+{req.requestedExtensionMinutes} phút</span>
                                                </p>
                                                {req.reason && <p className="text-[10px] text-slate-blue italic">"{req.reason}"</p>}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDecideExtension(req.id, 'approved')}
                                                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1"
                                                    >
                                                        <Check className="w-3 h-3" /> Duyệt
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecideExtension(req.id, 'rejected')}
                                                        className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1"
                                                    >
                                                        <VolumeX className="w-3 h-3" /> Từ chối
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Điểm danh camera AI */}
	                                <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
	                                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-platinum-tint bg-cloud-mist">
	                                        <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
	                                            <VideoIcon className="w-3.5 h-3.5 text-action-blue" /> Camera AI ra/vào
	                                        </h4>
	                                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${hasAutoFaceScanTargets ? 'bg-blue-50 text-action-blue' : 'bg-emerald-50 text-emerald-700'}`}>
	                                            Vào {checkedInCount}/{meetingState.participants?.length || 0} · Ra {pendingExitParticipants.length}
	                                        </span>
	                                    </div>
	                                    <div className="p-3 space-y-3">
                                            <div className="grid grid-cols-2 gap-1 rounded-lg border border-platinum-tint bg-cloud-mist p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setAutoFaceScanDirection('in'); setLastAutoFaceScan(null); }}
                                                    className={`py-1.5 rounded-md text-[10px] font-extrabold transition-colors ${autoFaceScanDirection === 'in' ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                                                >
                                                    Quét vào phòng
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setAutoFaceScanDirection('out'); setLastAutoFaceScan(null); }}
                                                    className={`py-1.5 rounded-md text-[10px] font-extrabold transition-colors ${autoFaceScanDirection === 'out' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                                                >
                                                    Quét ra khỏi phòng
                                                </button>
                                            </div>

	                                        {autoFaceCameraStream && (
	                                            <div className="relative aspect-video overflow-hidden rounded-lg border border-platinum-tint bg-slate-950">
	                                                <video
                                                    ref={autoFaceVideoRef}
                                                    autoPlay
                                                    muted
                                                    playsInline
                                                    className="w-full h-full object-cover scale-x-[-1]"
                                                />
	                                                <span className={`absolute left-2 top-2 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${autoFaceGuidance.state === 'perfect' ? 'bg-emerald-500 text-white' : 'bg-black/60 text-white'}`}>
	                                                    {autoFaceScanLoading ? 'Đang xử lý' : autoFaceGuidance.state === 'perfect' ? 'Đã thấy mặt' : autoFaceScanDirection === 'out' ? 'Đang quét ra' : 'Đang quét vào'}
	                                                </span>
	                                            </div>
	                                        )}

                                        <div className="flex gap-2">
                                            {autoFaceCameraStream ? (
                                                <button
                                                    onClick={stopAutoFaceCamera}
                                                    className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                                                >
                                                    <VideoOff className="w-3.5 h-3.5" /> Tắt camera
                                                </button>
                                            ) : (
	                                                <button
	                                                    onClick={startAutoFaceCamera}
	                                                    disabled={!hasAutoFaceScanTargets}
	                                                    className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-action-blue border border-blue-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
	                                                >
	                                                    <VideoIcon className="w-3.5 h-3.5" /> Bật tự quét
                                                </button>
                                            )}
                                            <button
                                                onClick={loadAttendance}
                                                className="px-3 py-2 bg-white hover:bg-cloud-mist text-slate-blue border border-platinum-tint rounded-lg text-[10px] font-bold flex items-center justify-center transition-all"
                                                title="Làm mới điểm danh"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <p className={`text-[10px] font-semibold leading-relaxed ${autoFaceCameraError || autoFaceModelError ? 'text-red-600' : hasUncheckedAttendanceParticipants ? 'text-slate-blue' : 'text-emerald-700'}`}>
	                                            {autoFaceCameraError
	                                                || autoFaceModelError
	                                                || (lastAutoFaceScan?.skipped
	                                                    ? (autoFaceScanDirection === 'out' ? 'Đã ghi nhận lượt ra rồi, hệ thống bỏ qua lượt quét lặp.' : 'Đã điểm danh rồi, hệ thống bỏ qua lượt quét lặp.')
	                                                    : lastAutoFaceScan?.matched
	                                                        ? `${lastAutoFaceScan.direction === 'out' ? 'Đã ghi nhận ra khỏi phòng' : 'Đã tự động điểm danh vào phòng'}${lastAutoFaceScan.userName ? ` ${lastAutoFaceScan.userName}` : ''}${lastAutoFaceScan.hasSnapshot ? ', đã lưu ảnh bằng chứng' : ''}.`
	                                                        : autoFaceCameraStream
	                                                            ? `Camera đang tự quét ${autoFaceScanDirection === 'out' ? 'lượt ra khỏi phòng' : 'lượt vào phòng'}. Khi khuôn mặt ổn định, hệ thống sẽ tự kiểm tra FaceID.`
	                                                            : hasAutoFaceScanTargets
	                                                                ? `Bật camera để test luồng API camera nhận diện FaceID tự động cho lượt ${autoFaceScanDirection === 'out' ? 'ra khỏi phòng' : 'vào phòng'}.`
	                                                                : autoFaceScanDirection === 'out'
	                                                                    ? 'Chưa có ai đang ở trong phòng cần ghi nhận ra.'
	                                                                    : 'Tất cả người tham gia đã được điểm danh vào phòng.')}
	                                        </p>
                                    </div>
                                </div>

                                {/* Điểm danh thủ công */}
                                <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-platinum-tint bg-cloud-mist">
                                        <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                                            <UserCheck className="w-3.5 h-3.5 text-action-blue" /> Điểm danh thủ công
                                        </h4>
                                        <div className="flex items-center gap-1">
                                            <button onClick={loadAttendance} className="p-1 text-slate-blue hover:text-action-blue transition-colors">
                                                <RefreshCw className="w-3 h-3" />
                                            </button>
                                            <button onClick={() => setIsManualAttendanceExpanded(!isManualAttendanceExpanded)} className="p-1 text-slate-blue hover:text-action-blue transition-colors">
                                                {isManualAttendanceExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    {isManualAttendanceExpanded && (
                                        <div className="divide-y divide-platinum-tint max-h-44 overflow-y-auto">
                                            {(meetingState.participants || []).length === 0 ? (
                                                <p className="text-[11px] text-slate-blue italic text-center py-3">Không có người tham gia.</p>
                                            ) : (
                                                (meetingState.participants || []).map(p => {
                                                    const checked = isCheckedIn(p);
                                                    return (
                                                        <div key={p.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-cloud-mist transition-colors">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className="relative shrink-0">
                                                                    <UserAvatar user={p} className="w-6 h-6 rounded-full text-[9px] font-bold" />
                                                                    {checked && (
                                                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                                                                            <Check className="w-1.5 h-1.5 text-white" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs font-semibold text-midnight-indigo truncate">{p.fullName}</span>
                                                            </div>
                                                            {checked ? (
                                                                <span
                                                                    className="ml-2 shrink-0 w-5 h-5 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center"
                                                                    title="Đã điểm danh"
                                                                >
                                                                    <Check className="w-3 h-3 text-emerald-600" />
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleManualCheckIn(p)}
                                                                    disabled={manualCheckInLoading === p.id}
                                                                    className="ml-2 shrink-0 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[9px] font-extrabold flex items-center gap-1 transition-all"
                                                                >
                                                                    {manualCheckInLoading === p.id ? (
                                                                        <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                                    ) : (
                                                                        <><UserCheck className="w-3 h-3" /> Điểm danh</>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Gia hạn cuộc họp */}
                                <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                    <div className="px-3 py-2.5 border-b border-platinum-tint bg-cloud-mist">
                                        <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                                            <Timer className="w-3.5 h-3.5 text-action-blue" /> Gia hạn cuộc họp
                                        </h4>
                                    </div>
                                    <div className="p-3">
                                        <button
                                            onClick={() => setExtensionModal({ isOpen: true, minutes: 15, reason: '' })}
                                            className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-action-blue border border-blue-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Gửi yêu cầu gia hạn
                                        </button>
                                    </div>
                                </div>

                                {/* Ghi âm */}
                                {meetingState.status === 'in_progress' && (
                                    <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                        <div className="px-3 py-2.5 border-b border-platinum-tint bg-cloud-mist">
                                            <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider">Ghi âm phiên họp</h4>
                                        </div>
                                        <div className="p-3">
                                            <StationRecorder
                                                meetingId={id}
                                                meetingTitle={meetingState.title}
                                                participants={meetingState.participants || []}
                                                onUploadSuccess={(sessionId) => {
                                                    showToast('Đã tải lên tệp ghi âm thành công', 'success');
                                                    setRecordingSessionId(sessionId);
                                                    fetchMediaFiles();
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Ghi hình */}
                                <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                    <div className="px-3 py-2.5 border-b border-platinum-tint bg-cloud-mist">
                                        <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                                            <VideoIcon className="w-3.5 h-3.5" /> Ghi hình camera phòng họp
                                        </h4>
                                    </div>
                                    <div className="p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col gap-0.5">
                                                <span className={`text-xs font-semibold ${recordingStatus === 'failed' ? 'text-red-600' : 'text-midnight-indigo'}`}>
                                                    {recordingStatus === 'inactive' ? 'Chưa ghi hình' :
                                                        recordingStatus === 'recording' ? 'Đang ghi hình' :
                                                            recordingStatus === 'paused' ? 'Đã tạm dừng' :
                                                                recordingStatus === 'failed' ? 'Đã dừng do lỗi' :
                                                                    'Đang xử lý...'}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={actionLoading || recordingStatus === 'starting' || recordingStatus === 'stopping'}
                                                onClick={() => {
                                                    if (recordingStatus === 'inactive') handleStartRecording();
                                                    else if (['recording', 'paused'].includes(recordingStatus)) handleStopRecording();
                                                }}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${recordingStatus === 'failed' ? 'bg-red-400' : recordingStatus !== 'inactive' ? 'bg-action-blue' : 'bg-pale-gray'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${recordingStatus !== 'inactive' ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                        <RecordingTimer
                                            meetingId={id}
                                            sessionId={recordingSessionId}
                                            initialStatus={recordingStatus}
                                            onStatusChange={setRecordingStatus}
                                        />
                                        {['recording', 'paused'].includes(recordingStatus) && (
                                            <div className="flex gap-2">
                                                {recordingStatus === 'recording' && (
                                                    <button onClick={handlePauseRecording} className="flex-1 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold">Tạm dừng</button>
                                                )}
                                                {recordingStatus === 'paused' && (
                                                    <button onClick={handleResumeRecording} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold">Tiếp tục</button>
                                                )}
                                            </div>
                                        )}

                                        {/* GA-32: Live Speaker Tag — TẮT theo LIVE_SPEAKER_TAGGING_ENABLED
                                            (xem src/config/featureFlags.js). Handler + API service giữ nguyên,
                                            chỉ không render. Gán người nói SAU cuộc họp không bị ảnh hưởng. */}
                                        {LIVE_SPEAKER_TAGGING_ENABLED && isHost && ['recording', 'paused'].includes(recordingStatus) && (
                                            <div className="flex flex-col gap-2 border-t border-platinum-tint/60 pt-3 mt-1">
                                                <div className="text-[10px] font-bold text-slate-blue uppercase tracking-wider flex items-center gap-1">
                                                    <Mic className="w-3 h-3 text-action-blue" />
                                                    Người đang nói
                                                </div>
                                                <select
                                                    value={liveTagSelected}
                                                    onChange={(e) => setLiveTagSelected(e.target.value)}
                                                    className="w-full text-xs font-semibold border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue rounded-lg py-1.5 pl-2 pr-6 bg-white text-midnight-indigo"
                                                >
                                                    <option value="">-- Chọn người đang nói --</option>
                                                    {(meetingState.participants || []).filter(p => !p.isBot).map(p => (
                                                        <option key={p.id} value={p.id}>{p.fullName}{p.isExternal ? ' (Khách)' : ''}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={handleLiveSpeakerTag}
                                                    disabled={!liveTagSelected || liveTagSubmitting}
                                                    className="w-full py-1.5 bg-action-blue text-white rounded-lg text-[10px] font-extrabold hover:bg-glacier-blue disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    {liveTagSubmitting ? (
                                                        <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Đang gắn...</>
                                                    ) : (
                                                        <><UserCheck className="w-3 h-3" /> Gắn thẻ người nói</>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Thiết bị phòng */}
                                {roomDevices.length > 0 && (
                                    <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => setIsRoomDevicesExpanded(!isRoomDevicesExpanded)}
                                            className="w-full px-3 py-2.5 bg-cloud-mist hover:bg-slate-50 flex items-center justify-between transition-colors border-b border-platinum-tint"
                                        >
                                            <h4 className="text-[10px] font-extrabold text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                                                <Cpu className="w-3.5 h-3.5 text-action-blue" /> Thiết bị phòng ({roomDevices.length})
                                            </h4>
                                            {isRoomDevicesExpanded ? <ChevronUp className="w-4 h-4 text-slate-blue" /> : <ChevronDown className="w-4 h-4 text-slate-blue" />}
                                        </button>
                                        {isRoomDevicesExpanded && (
                                            <div className="divide-y divide-platinum-tint max-h-[200px] overflow-y-auto">
                                                {roomDevices.map((device, idx) => (
                                                    <div key={device.id || idx} className="flex items-center justify-between px-3 py-2 hover:bg-cloud-mist/30 transition-colors">
                                                        <span className="text-xs text-midnight-indigo font-semibold truncate pr-2">
                                                            {device.device_name || device.name || device.deviceName || `Thiết bị ${idx + 1}`}
                                                            {isRecordingCamera(device) && <span className="ml-1 text-[9px] text-action-blue">(camera)</span>}
                                                        </span>
                                                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold border shrink-0 ${device.status === 'online' || device.isOnline
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : 'bg-red-50 text-red-600 border-red-200'
                                                            }`}>
                                                            {device.status === 'online' || device.isOnline ? 'Online' : 'Offline'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Chuyển chương trình tiếp theo */}
                                {meetingState.agenda?.length > 0 && (
                                    <div className="bg-action-blue rounded-xl p-4 text-white">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">Đang thảo luận</span>
                                        <h4 className="text-sm font-extrabold mt-0.5 leading-snug">
                                            {meetingState.agenda[meetingState.currentAgendaIndex]?.title}
                                        </h4>
                                        <div className="flex items-center gap-1.5 mt-1 text-[11px] opacity-80">
                                            <Clock className="w-3 h-3" />
                                            Còn lại: {Math.floor(meetingState.agendaTimeLeft / 60)}:{(meetingState.agendaTimeLeft % 60).toString().padStart(2, '0')}
                                        </div>
                                        {meetingState.currentAgendaIndex + 1 < meetingState.agenda.length && (
                                            <button
                                                onClick={handleNextAgenda}
                                                className="w-full mt-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
                                            >
                                                Chuyển mục tiếp theo <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── TAB: Chương trình ── */}
                            {activeChatTab === 'agenda' && (
                                <div className="p-4 space-y-3">
                                    {meetingState.agenda?.length > 0 ? (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-xs font-extrabold text-midnight-indigo uppercase tracking-wider">Chương trình họp</h3>
                                                <span className="text-[10px] text-slate-blue font-medium">
                                                    {meetingState.currentAgendaIndex + 1}/{meetingState.agenda.length} mục
                                                </span>
                                            </div>

                                            {meetingState.agenda.map((item, idx) => {
                                                const isCurrent = idx === meetingState.currentAgendaIndex;
                                                const isPast = idx < meetingState.currentAgendaIndex;
                                                const isExpanded = expandedAgendaIdx === idx;

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`rounded-xl border overflow-hidden transition-all ${isCurrent ? 'border-action-blue shadow-md shadow-action-blue/10' :
                                                            isPast ? 'border-platinum-tint opacity-60' :
                                                                'border-platinum-tint'
                                                            }`}
                                                    >
                                                        {/* Header */}
                                                        <button
                                                            className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${isCurrent ? 'bg-blue-50' : 'bg-white hover:bg-cloud-mist'
                                                                }`}
                                                            onClick={() => setExpandedAgendaIdx(isExpanded ? null : idx)}
                                                        >
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 mt-0.5 ${isCurrent ? 'bg-action-blue text-white' :
                                                                isPast ? 'bg-emerald-100 text-emerald-700' :
                                                                    'bg-cloud-mist text-slate-blue border border-platinum-tint'
                                                                }`}>
                                                                {isPast ? <Check className="w-3 h-3" /> : idx + 1}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <p className={`text-xs font-bold leading-snug ${isCurrent ? 'text-action-blue' : 'text-midnight-indigo'}`}>
                                                                        {item.title}
                                                                    </p>
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${isCurrent ? 'bg-action-blue/10 text-action-blue' : 'bg-cloud-mist text-slate-blue'}`}>
                                                                        {item.durationMin || item.plannedDurationMinutes}ph
                                                                    </span>
                                                                </div>
                                                                {isCurrent && (
                                                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-action-blue font-semibold">
                                                                        <Clock className="w-3 h-3" />
                                                                        Còn {Math.floor(meetingState.agendaTimeLeft / 60)}:{(meetingState.agendaTimeLeft % 60).toString().padStart(2, '0')}
                                                                    </div>
                                                                )}
                                                                {(item.description || item.attachments?.length > 0) && (
                                                                    <div className={`flex items-center gap-1 mt-0.5 text-[9px] ${isCurrent ? 'text-action-blue/70' : 'text-slate-blue'}`}>
                                                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                        {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </button>

                                                        {/* Expanded Detail */}
                                                        {isExpanded && (
                                                            <div className="px-3 pb-3 pt-0 bg-white border-t border-platinum-tint space-y-2">
                                                                {item.description && (
                                                                    <p className="text-[11px] text-slate-blue leading-relaxed pt-2">{item.description}</p>
                                                                )}
                                                                {item.attachments?.length > 0 && (
                                                                    <div className="space-y-1.5 mt-2">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Tài liệu đính kèm</span>
                                                                        </div>
                                                                        {item.attachments.map((att, attIdx) => (
                                                                            <div key={att.id} className="flex items-center justify-between bg-cloud-mist p-2 rounded-lg border border-platinum-tint gap-2">
                                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                                    <FileText className="w-4 h-4 text-slate-blue shrink-0" />
                                                                                    <span className="text-[11px] font-medium text-midnight-indigo truncate">{att.fileName}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    <button
                                                                                        title="Xem trong phòng họp"
                                                                                        onClick={() => setAgendaDocView({ agendaItem: item, selectedAttachmentIdx: attIdx })}
                                                                                        className="p-1 rounded hover:bg-action-blue/10 text-action-blue transition-colors"
                                                                                    >
                                                                                        <Eye className="w-4 h-4" />
                                                                                    </button>
                                                                                    <button
                                                                                        title="Tải xuống"
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                const res = await callWithFallback(getEmployeeMediaFile, getManagerMediaFile, att.id);
                                                                                                const url = res?.data?.downloadUrl;
                                                                                                if (url) {
                                                                                                    const a = document.createElement('a');
                                                                                                    a.href = url;
                                                                                                    a.download = att.fileName || '';
                                                                                                    a.style.display = 'none';
                                                                                                    document.body.appendChild(a);
                                                                                                    a.click();
                                                                                                    document.body.removeChild(a);
                                                                                                } else showToast('Không có link tải', 'error');
                                                                                            } catch { showToast('Lỗi tải tài liệu', 'error'); }
                                                                                        }}
                                                                                        className="p-1 rounded hover:bg-slate-blue/10 text-slate-blue transition-colors"
                                                                                    >
                                                                                        <Download className="w-4 h-4" />
                                                                                    </button>
                                                                                    {isHost && isCurrent && (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                if (presentedFile?.fileId === att.id) {
                                                                                                    getSocket().emit('agenda:present_stop', { meetingId: id });
                                                                                                } else {
                                                                                                    getSocket().emit('agenda:present', {
                                                                                                        meetingId: id,
                                                                                                        agendaId: item.id,
                                                                                                        fileId: att.id,
                                                                                                        fileName: att.fileName,
                                                                                                        presentedBy: myParticipantId,
                                                                                                    });
                                                                                                }
                                                                                            }}
                                                                                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-sm ${presentedFile?.fileId === att.id
                                                                                                ? 'bg-red-50 text-red-600 border border-red-200'
                                                                                                : 'bg-white text-action-blue border border-action-blue hover:bg-blue-50'
                                                                                                }`}
                                                                                        >
                                                                                            {presentedFile?.fileId === att.id ? 'Dừng chiếu' : 'Chiếu'}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {isHost && isCurrent && meetingState.currentAgendaIndex + 1 < meetingState.agenda.length && (
                                                                    <button
                                                                        onClick={handleNextAgenda}
                                                                        className="w-full py-2 mt-1 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                                                                    >
                                                                        Chuyển mục tiếp theo <ChevronRight className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Media files */}
                                            {/* Media files — chỉ hiển sau khi cuộc họ p kết thúc */}
                                            {mediaFiles.length > 0 && meetingState?.status === 'completed' && (
                                                <div className="space-y-1.5">
                                                    <h4 className="text-[10px] font-bold text-slate-blue uppercase tracking-wider flex items-center gap-1.5">
                                                        <FileText className="w-3 h-3" /> Bản ghi cuộc họp ({mediaFiles.length})
                                                    </h4>
                                                    {mediaFiles.map((file, idx) => (
                                                        <div key={file.id || idx} className="p-2.5 bg-cloud-mist border border-platinum-tint rounded-xl flex items-center justify-between group">
                                                            <div className="flex-1 min-w-0 pr-2">
                                                                {editingMediaId === file.id ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <input
                                                                            type="text"
                                                                            value={editingMediaTitle}
                                                                            onChange={(e) => setEditingMediaTitle(e.target.value)}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameMedia(file.id); }}
                                                                            className="flex-1 text-xs font-semibold text-midnight-indigo bg-white border border-action-blue focus:outline-none rounded px-1.5 py-0.5 min-w-0"
                                                                            autoFocus
                                                                        />
                                                                        <button onClick={() => handleRenameMedia(file.id)} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 p-1 rounded">
                                                                            <Check className="w-3 h-3" />
                                                                        </button>
                                                                        <button onClick={() => setEditingMediaId(null)} className="text-slate-500 hover:text-slate-700 bg-slate-100 p-1 rounded">
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-xs font-semibold text-midnight-indigo truncate" title={file.title || `Bản_ghi_${idx + 1}`}>
                                                                            {file.title || `Bản_ghi_${idx + 1}`}
                                                                        </p>
                                                                        {isHost && (
                                                                            <button
                                                                                onClick={() => { setEditingMediaId(file.id); setEditingMediaTitle(file.title || `Bản_ghi_${idx + 1}`); }}
                                                                                className="p-1 text-slate-400 hover:text-action-blue transition-colors bg-white rounded shadow-sm border border-platinum-tint/50"
                                                                                title="Đổi tên"
                                                                            >
                                                                                <Edit2 className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <p className="text-[9px] text-slate-blue mt-0.5">{file.duration ? formatDuration(file.duration) : 'Đã lưu'}</p>
                                                            </div>
                                                            <a href={file.downloadUrl || '#'} target="_blank" rel="noreferrer" className="p-1.5 bg-white border border-platinum-tint rounded-lg text-action-blue hover:text-glacier-blue transition-colors shrink-0">
                                                                <Play className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center py-10">
                                            <Calendar className="w-8 h-8 text-pale-gray mx-auto mb-2" />
                                            <p className="text-xs text-slate-blue italic">Chưa có chương trình cuộc họp.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── TAB: Ghi chú ── */}
                            {activeChatTab === 'notes' && (
                                <div className="flex flex-col h-full">
                                    {/* Note input */}
                                    <form onSubmit={handleAddNote} className="p-3 border-b border-platinum-tint bg-cloud-mist shrink-0">
                                        <textarea
                                            value={noteInput}
                                            onChange={e => setNoteInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(e); } }}
                                            placeholder="Nhập ghi chú cuộc họp... (Enter để gửi, Shift+Enter xuống dòng)"
                                            rows={2}
                                            className="w-full px-3 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:outline-none focus:border-action-blue resize-none"
                                        />
                                        {isHost && (
                                            <label className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-slate-blue cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={shareNoteWithGuest}
                                                    onChange={e => setShareNoteWithGuest(e.target.checked)}
                                                    className="w-3.5 h-3.5 accent-action-blue"
                                                />
                                                Chia sẻ ghi chú này với khách ngoài công ty
                                            </label>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={!noteInput.trim()}
                                            className="mt-2 w-full py-2 bg-action-blue hover:bg-glacier-blue disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Thêm ghi chú
                                        </button>
                                    </form>

                                    {/* Notes list */}
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                        {notes.length === 0 ? (
                                            <div className="text-center py-10">
                                                <StickyNote className="w-8 h-8 text-pale-gray mx-auto mb-2" />
                                                <p className="text-xs text-slate-blue italic">Chưa có ghi chú nào.</p>
                                            </div>
                                        ) : (
                                            notes.map((note, idx) => {
                                                const authorName = note.author?.fullName || note.authorName || 'Người dùng';
                                                const createdAt = note.createdAt || note.created_at;
                                                const timeStr = createdAt ? new Date(createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                                                return (
                                                    <div key={note.id || idx} className="bg-white border border-platinum-tint rounded-xl p-3 space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-extrabold text-action-blue">{authorName}</span>
                                                            {timeStr && <span className="text-[9px] text-slate-blue">{timeStr}</span>}
                                                        </div>
                                                        <p className="text-xs text-midnight-indigo leading-relaxed">{note.content}</p>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── TAB: Biên bản (MKM-MANUAL-01 / MKM-LIVE-01) ── */}
                            {activeChatTab === 'minutes' && (
                                <div className="p-3 h-full overflow-y-auto">
                                    <MinutesTabContent
                                        meetingId={id}
                                        isHost={isHost}
                                        transcriptStatus="empty"
                                        allowAiCreate={false}
                                    />
                                </div>
                            )}

                            {/* ── TAB: Người tham gia ── */}
                            {activeChatTab === 'attendance' && (
                                <div className="p-3 space-y-3">
                                    {/* Summary */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-cloud-mist border border-platinum-tint rounded-xl p-2.5 text-center">
                                            <div className="text-lg font-extrabold text-midnight-indigo">{meetingState.participants?.length || 0}</div>
                                            <div className="text-[9px] text-slate-blue font-medium uppercase tracking-wide mt-0.5">Tổng</div>
                                        </div>
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                                            <div className="text-lg font-extrabold text-emerald-700">{checkedInCount}</div>
                                            <div className="text-[9px] text-emerald-700 font-medium uppercase tracking-wide mt-0.5">Có mặt</div>
                                        </div>
                                        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center">
                                            <div className="text-lg font-extrabold text-red-600">{(meetingState.participants?.length || 0) - checkedInCount}</div>
                                            <div className="text-[9px] text-red-600 font-medium uppercase tracking-wide mt-0.5">Chưa điểm</div>
                                        </div>
                                    </div>

                                    {/* Participant list */}
                                    <div className="space-y-1.5">
                                        {meetingState.participants?.map(p => {
                                            const status = getPresenceStatus(p.id);
                                            const presenceInfo = PRESENCE_MAP[status] || PRESENCE_MAP['unknown'];
                                            const record = getAttendanceRecord(p.id);
                                            const checkedInTime = record?.checkInTime || record?.check_in_time || record?.createdAt;
                                            const timeStr = checkedInTime ? new Date(checkedInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

                                            return (
                                                <div key={p.id} className={`bg-white border rounded-xl p-3 flex items-center gap-3 ${isCheckedIn(p) ? 'border-emerald-100' : 'border-platinum-tint'}`}>
                                                    <div className="relative shrink-0">
                                                        <UserAvatar user={p} className="w-8 h-8 rounded-full text-xs font-bold" />
                                                        {isCheckedIn(p) && (
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                                                                <Check className="w-2 h-2 text-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-bold text-midnight-indigo truncate">{p.fullName}</span>
                                                            {p.role === 'Chủ tọa' && (
                                                                <span className="text-[8px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-extrabold shrink-0">CT</span>
                                                            )}
                                                            {p.isExternal && (
                                                                <span className="text-[8px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-extrabold shrink-0">KHÁCH</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${presenceInfo.color}`}>
                                                                {presenceInfo.label}
                                                            </span>
                                                            {timeStr && <span className="text-[9px] text-slate-blue">{timeStr}</span>}
                                                        </div>
                                                    </div>

                                                    {isHost && !p.isExternal && (
                                                        <div className="shrink-0">
                                                            {isCheckedIn(p) ? (
                                                                <button
                                                                    onClick={() => handleInvalidateAttendance(p)}
                                                                    disabled={manualCheckInLoading === p.id}
                                                                    className="p-1.5 text-slate-blue hover:text-red-600 transition-colors disabled:opacity-50"
                                                                    title="Hủy điểm danh"
                                                                >
                                                                    {manualCheckInLoading === p.id
                                                                        ? <span className="w-3.5 h-3.5 border-2 border-slate-blue/30 border-t-slate-blue rounded-full animate-spin block" />
                                                                        : <UserX className="w-3.5 h-3.5" />
                                                                    }
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleManualCheckIn(p)}
                                                                    disabled={manualCheckInLoading === p.id}
                                                                    className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[9px] font-bold flex items-center gap-1 transition-all"
                                                                >
                                                                    {manualCheckInLoading === p.id
                                                                        ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                        : <><UserCheck className="w-3 h-3" /> Điểm</>
                                                                    }
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <button
                                        onClick={loadAttendance}
                                        className="w-full py-2 bg-cloud-mist hover:bg-pale-gray text-slate-blue border border-platinum-tint rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Làm mới
                                    </button>
                                </div>
                            )}

                            {/* ── TAB: Khách ngoài công ty (host only) ── */}
                            {activeChatTab === 'guests' && isHost && (
                                <GuestPanel
                                    meetingId={id}
                                    onGuestsUpdate={setAdmittedGuests}
                                />
                            )}

                            {/* ── TAB: Ghi âm (chỉ Host) ── */}
                            {activeChatTab === 'recordings' && isHost && (
                                <RecordingsTab
                                    meetingId={id}
                                    mediaFiles={mediaFiles}
                                    recordingSessions={recordingSessions}
                                    setRecordingSessions={setRecordingSessions}
                                    recordingsLoading={recordingsLoading}
                                    setRecordingsLoading={setRecordingsLoading}
                                    playbackUrls={playbackUrls}
                                    setPlaybackUrls={setPlaybackUrls}
                                    formatDuration={formatDuration}
                                    meetingStatus={meetingState?.status}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* RENAME MODAL */}
            {renameModal.isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/40 backdrop-blur-sm">
                    <div className="bg-white border border-platinum-tint rounded-2xl p-6 w-full max-w-sm shadow-sm-3">
                        <h3 className="text-base font-bold text-midnight-indigo mb-3">
                            {renameModal.isSelf ? 'Đổi tên hiển thị của bạn' : `Đổi tên cho "${renameModal.currentName}"`}
                        </h3>
                        <input
                            type="text"
                            autoFocus
                            id="renameInput"
                            defaultValue={renameModal.currentName}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(e.target.value); }}
                            className="w-full px-4 py-3 bg-cloud-mist border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo font-semibold mb-5"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setRenameModal({ isOpen: false, targetId: null, currentName: '', isSelf: true })} className="px-4 py-2 bg-cloud-mist hover:bg-pale-gray text-midnight-indigo rounded-xl text-xs font-bold">Hủy</button>
                            <button onClick={() => submitRename(document.getElementById('renameInput').value)} className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shadow-lg shadow-action-blue/20">Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM LEAVE MODAL */}
            {confirmLeaveModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/40 backdrop-blur-sm">
                    <div className="bg-white border border-platinum-tint rounded-2xl p-6 w-full max-w-sm shadow-sm-3 space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-midnight-indigo">Rời phòng họp?</h3>
                            <p className="text-sm text-slate-blue mt-1">Bạn có chắc muốn rời khỏi phòng họp?</p>
                        </div>
                        {isHost && (
                            <button
                                onClick={handleEndMeeting}
                                disabled={actionLoading}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold"
                            >
                                {actionLoading ? 'Đang kết thúc...' : 'Kết thúc cuộc họp cho tất cả'}
                            </button>
                        )}
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmLeaveModal(false)} className="flex-1 py-2.5 bg-cloud-mist hover:bg-pale-gray text-midnight-indigo border border-platinum-tint rounded-xl text-sm font-bold">Hủy</button>
                            <button
                                onClick={confirmLeave}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${isHost ? 'bg-cloud-mist hover:bg-pale-gray text-midnight-indigo border border-platinum-tint' : 'bg-red-600 hover:bg-red-500 text-white'
                                    }`}
                            >
                                Rời đi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EXTENSION MODAL */}
            {extensionModal.isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/40 backdrop-blur-sm">
                    <div className="bg-white border border-platinum-tint rounded-2xl p-6 w-full max-w-sm shadow-sm-3 space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                <Timer className="w-5 h-5 text-action-blue" /> Yêu cầu gia hạn cuộc họp
                            </h3>
                            <p className="text-xs text-slate-blue mt-1">Hệ thống tự động chấp nhận nếu không ảnh hưởng cuộc họp kế tiếp.</p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider mb-1.5">Gia hạn thêm (phút)</label>
                                <div className="flex gap-2 mb-2">
                                    {[15, 40, 60].map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setExtensionModal(prev => ({ ...prev, minutes: m }))}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${extensionModal.minutes === m
                                                ? 'bg-action-blue text-white border-action-blue'
                                                : 'bg-cloud-mist text-midnight-indigo border-platinum-tint hover:border-action-blue'
                                                }`}
                                        >
                                            {m}ph
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    max={240}
                                    value={extensionModal.minutes}
                                    onChange={e => setExtensionModal(prev => ({ ...prev, minutes: e.target.value ? Number(e.target.value) : '' }))}
                                    placeholder="Hoặc nhập số phút tùy ý..."
                                    className="w-full px-3 py-2 bg-cloud-mist border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider mb-1.5">Lý do</label>
                                <textarea
                                    value={extensionModal.reason}
                                    onChange={e => setExtensionModal(prev => ({ ...prev, reason: e.target.value }))}
                                    placeholder="Lý do cần gia hạn (không bắt buộc)..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-cloud-mist border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:outline-none focus:border-action-blue resize-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setExtensionModal({ isOpen: false, minutes: 15, reason: '' })} className="flex-1 py-2.5 bg-cloud-mist hover:bg-pale-gray text-midnight-indigo border border-platinum-tint rounded-xl text-sm font-bold">Hủy</button>
                            <button
                                onClick={handleRequestExtension}
                                disabled={actionLoading}
                                className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue disabled:opacity-60 text-white rounded-xl text-sm font-bold"
                            >
                                {actionLoading ? 'Đang gửi...' : `Gửi yêu cầu +${extensionModal.minutes}ph`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EXTENSION REJECTED MODAL — vi phạm buffer trước cuộc họp kế tiếp */}
            {extensionRejectedInfo && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/40 backdrop-blur-sm">
                    <div className="bg-white border border-platinum-tint rounded-2xl p-6 w-full max-w-sm shadow-sm-3 space-y-4">
                        <div className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="w-5 h-5" />
                            <h3 className="text-base font-bold">Không thể gia hạn</h3>
                        </div>
                        <p className="text-sm text-midnight-indigo">
                            Thời gian bạn xin thêm trùng vào khoảng đệm trước cuộc họp kế tiếp trong phòng này. Vui lòng liên hệ trực tiếp Host cuộc họp sau để thống nhất.
                        </p>
                        {extensionRejectedInfo.nextMeeting && (
                            <div className="bg-cloud-mist border border-platinum-tint rounded-xl p-3 space-y-1">
                                <p className="text-xs font-bold text-slate-blue uppercase tracking-wider">Cuộc họp kế tiếp</p>
                                <p className="text-sm font-semibold text-midnight-indigo">{extensionRejectedInfo.nextMeeting.title}</p>
                                <p className="text-xs text-slate-blue">
                                    Bắt đầu lúc {new Date(extensionRejectedInfo.nextMeeting.startTime).toLocaleString('vi-VN')}
                                    {extensionRejectedInfo.nextMeeting.roomName ? ` • ${extensionRejectedInfo.nextMeeting.roomName}` : ''}
                                </p>
                            </div>
                        )}
                        {extensionRejectedInfo.nextMeetingHost && (
                            <div className="border border-platinum-tint rounded-xl p-3 space-y-2">
                                <p className="text-xs font-bold text-slate-blue uppercase tracking-wider">Liên hệ Host cuộc họp sau</p>
                                <p className="text-sm font-semibold text-midnight-indigo">{extensionRejectedInfo.nextMeetingHost.fullName}</p>
                                <div className="flex flex-col gap-1.5">
                                    {extensionRejectedInfo.nextMeetingHost.email && (
                                        <a href={`mailto:${extensionRejectedInfo.nextMeetingHost.email}`} className="flex items-center gap-2 text-xs text-action-blue hover:underline">
                                            <Mail className="w-3.5 h-3.5" /> {extensionRejectedInfo.nextMeetingHost.email}
                                        </a>
                                    )}
                                    {extensionRejectedInfo.nextMeetingHost.phoneNumber && (
                                        <a href={`tel:${extensionRejectedInfo.nextMeetingHost.phoneNumber}`} className="flex items-center gap-2 text-xs text-action-blue hover:underline">
                                            <IoCall className="w-3.5 h-3.5" /> {extensionRejectedInfo.nextMeetingHost.phoneNumber}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setExtensionRejectedInfo(null)}
                            className="w-full py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-bold"
                        >
                            Đã hiểu
                        </button>
                    </div>
                </div>
            )}

            {/* NO-SHOW ALERT BANNER */}
            <AnimatePresence>
                {noShowWarning && (
                    <motion.div
                        key={noShowWarning.kind}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-semibold max-w-[480px] w-[90vw] pointer-events-auto ${noShowWarning.kind === 'warning'
                                ? 'bg-amber-500 border-amber-400 text-white'
                                : noShowWarning.kind === 'snoozed'
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'bg-midnight-indigo border-indigo-700 text-white'
                            }`}
                    >
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="flex-1 leading-snug">
                            {noShowWarning.kind === 'warning'
                                ? 'Hệ thống phát hiện bạn không có mặt. Xác nhận để giữ phòng.'
                                : noShowWarning.kind === 'snoozed'
                                    ? `Đã xác nhận — đang chờ tới ${noShowWarning.snoozeUntil ? new Date(noShowWarning.snoozeUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'hết hạn gia hạn'}.`
                                    : 'Phòng họp đã được giải phóng do không có người tham dự.'}
                        </span>
                        {noShowWarning.kind === 'warning' ? (
                            <button
                                onClick={handleDismissNoShow}
                                className="shrink-0 bg-white text-amber-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                            >
                                Tôi vẫn đến
                            </button>
                        ) : (
                            <button
                                onClick={() => setNoShowWarning(null)}
                                className="p-1.5 hover:bg-white/20 rounded-md transition-colors shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TOAST OVERLAY */}
            <div className="fixed bottom-24 right-5 z-[9998] flex flex-col gap-2 pointer-events-auto">
                <AnimatePresence>
                    {toasts.map(t => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 30 }}
                            className={`px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center justify-between gap-3 text-white max-w-[320px] ${t.type === 'error' ? 'bg-red-600 border-red-500' :
                                t.type === 'warning' ? 'bg-amber-500 border-amber-400' :
                                    t.type === 'success' ? 'bg-emerald-600 border-emerald-500' :
                                        'bg-midnight-indigo border-indigo-800'
                                }`}
                        >
                            <div className="flex items-center gap-2.5 flex-1 pr-2">
                                {t.type === 'error' && <VolumeX className="w-3.5 h-3.5 shrink-0" />}
                                {t.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                {t.type === 'success' && <Check className="w-3.5 h-3.5 shrink-0" />}
                                <span className="leading-snug">{t.message}</span>
                            </div>
                            <button onClick={() => removeToast(t.id)} className="p-1.5 hover:bg-white/25 rounded-md transition-colors shrink-0 opacity-80 hover:opacity-100">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default InMeetingRoom;
