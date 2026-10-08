import { AlertTriangle, Calendar, Check, Clock, Download, Edit3, FileText, GripVertical, List, Loader2, MapPin, Pause, Play, Search, Sparkles, Trash2, Upload, Users, UserPlus, Video, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { vi } from 'date-fns/locale/vi';
import TimePicker from '../../components/common/TimePicker';

import { getMeetingById, updateMeeting, updateMeetingTime, updateMeetingRoom, updateMeetingRecordingConfig, addRecordingConfig, replaceAgendas, cancelMeeting, getAvailableRoomsForMeeting, getUsers, getMeetingMediaFiles, getMediaFile, uploadAgendaAttachment, deleteAgendaAttachment, updateMediaVisibility } from '../../service/managerServices';
import UserAvatar from '../../components/common/UserAvatar';
import MeetingAttendanceBoard from '../../components/meeting/MeetingAttendanceBoard';
import MeetingPresenceIVSS from '../../components/meeting/MeetingPresenceIVSS';
import NotificationActionsPanel from '../../components/common/NotificationActionsPanel';
import AddParticipantsModal from '../../components/meeting/AddParticipantsModal';
import MinutesTabContent from '../../components/minutes/MinutesTabContent';
import { removeInternalParticipant, removeExternalParticipant } from '../../service/businessAdminServices';
import ParticipantDetailModal from '../../components/meeting/ParticipantDetailModal';
import TranscriptViewer from '../../components/transcription/TranscriptViewer';
import AudioUploader from '../../components/transcription/AudioUploader';
import { createTranscriptionJob } from '../../service/transcriptionServices';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from '../../utils/toast';
import { hasPermission } from '../../utils/permissionUtils';

// BE MeetingStatus enum (meeting.entity.ts) có đủ 6 giá trị — trước đây thiếu draft/pending_approval
// khiến 2 trạng thái này rơi vào nhánh else và bị hiển thị nhầm thành "Đã hủy".
const STATUS_BADGE = {
    draft: { label: 'Bản nháp', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
    pending_approval: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    scheduled: { label: 'Đã xếp lịch', className: 'bg-blue-50 text-action-blue border border-blue-200' },
    in_progress: { label: 'Đang họp', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    completed: { label: 'Đã kết thúc', className: 'bg-purple-50 text-purple-700 border border-purple-200' },
    cancelled: { label: 'Đã hủy', className: 'bg-red-50 text-red-700 border border-red-200' },
};

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

const handleDateKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) return;
    const allowedKeys = [
        'Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'Home', 'End',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        '/', '-', ' '
    ];
    if (allowedKeys.includes(e.key)) return;
    if (/^[0-9]$/.test(e.key)) return;
    e.preventDefault();
};

const handleDateChangeRaw = (e) => {
    if (!e || !e.target) return;
    const rawVal = e.target.value;
    if (typeof rawVal === 'string' && /[a-zA-ZÀ-ỹ]/.test(rawVal)) {
        e.target.value = rawVal.replace(/[a-zA-ZÀ-ỹ]/g, '');
    }
};

const ManagerMeetingDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    // State
    const [loading, setLoading] = useState(true);
    const [nowTs, setNowTs] = useState(Date.now());
    const [timeValidationModal, setTimeValidationModal] = useState({ isOpen: false, message: '' });
    const [meeting, setMeeting] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [mediaFiles, setMediaFiles] = useState([]);

    useEffect(() => {
        if (error) {
            toast.error(error);
            setError(null);
        }
    }, [error]);

    useEffect(() => {
        if (successMsg) {
            toast.success(successMsg);
            setSuccessMsg(null);
        }
    }, [successMsg]);

    useEffect(() => {
        const timer = setInterval(() => setNowTs(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);
    const [activeParticipantTab, setActiveParticipantTab] = useState('internal');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [showAddGuestModal, setShowAddGuestModal] = useState(false);
    const [detailModalState, setDetailModalState] = useState({ isOpen: false, participant: null, isExternal: false });

    // Editing modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);

    // Edit fields
    const [editTitle, setEditTitle] = useState('');
    const [editDateRange, setEditDateRange] = useState([null, null]);
    const [editStartDate, editEndDate] = editDateRange;

    const formatDateToLocal = (dateObj) => {
        if (!dateObj || !isValidDate(dateObj)) return '';
        const d = new Date(dateObj);
        const m = d.getMonth() + 1;
        const day = d.getDate();
        return `${d.getFullYear()}-${m < 10 ? '0'+m : m}-${day < 10 ? '0'+day : day}`;
    };
    const editStartStr = formatDateToLocal(editStartDate);
    const editEndStr = formatDateToLocal(editEndDate || editStartDate);

    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');
    const [editRoomId, setEditRoomId] = useState('');
    const [editParticipants, setEditParticipants] = useState([]);
    const [editRecordingEnabled, setEditRecordingEnabled] = useState(false);
    const [isFetchingRooms, setIsFetchingRooms] = useState(false);
    const [checkStatus, setCheckStatus] = useState('idle'); // 'idle' | 'ok' | 'conflict'
    const [selectedRoomInfo, setSelectedRoomInfo] = useState(null);
    const [cancelReason, setCancelReason] = useState('');

    // Conflict confirmation modals (409 PARTICIPANT_TIME_CONFLICT_WARNING / ROOM_TIME_CONFLICT / 422 ROOM_CAPACITY_WARNING)
    const [participantConflictModal, setParticipantConflictModal] = useState({
        isOpen: false,
        conflicts: [],
        pendingPayload: null, // { startISO, endISO }
    });
    const [roomCapacityModal, setRoomCapacityModal] = useState({
        isOpen: false,
        message: '',
        pendingPayload: null, // { startISO, endISO }
    });

    // Agenda edit state
    const [agendaList, setAgendaList] = useState([]);
    const [newAgendaTitle, setNewAgendaTitle] = useState('');
    const [newAgendaDuration, setNewAgendaDuration] = useState('15');
    const [newAgendaFile, setNewAgendaFile] = useState(null);
    const [agendaEditIndex, setAgendaEditIndex] = useState(null);
    const [draggedAgendaIndex, setDraggedAgendaIndex] = useState(null);

    // Data lists for editing
    const [rooms, setRooms] = useState([]);
    const [users, setUsers] = useState([]);

    // Recording & Transcript player states
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'transcript';
    const [activeRightTab, setActiveRightTab] = useState(initialTab);
    const [activeAttendanceTab, setActiveAttendanceTab] = useState('attendance'); // 'attendance' or 'ivss'
    const [refreshTranscriptKey, setRefreshTranscriptKey] = useState(0);
    const [runningSttSessionIds, setRunningSttSessionIds] = useState(() => new Set());
    const [audioPage, setAudioPage] = useState(1);
    const audioItemsPerPage = 5;

    // Pagination for long lists
    const [agendaPage, setAgendaPage] = useState(1);
    const [participantsPage, setParticipantsPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    /**
     * Chuẩn hoá DTO lồng nhau từ API GET /meetings/:id
     * Map { meeting, host, organizer, room, participants, agendas, recordingConfig }
     * sang shape phẳng mà UI dùng, giữ cả camelCase và snake_case để tương thích.
     */
    const normalizeMeetingDetail = (dto) => {
        const meetingObj = dto.meeting || dto;
        const hostName = dto.host?.fullName || dto.organizer?.fullName || dto.hostName || dto.host_name || 'Chưa rõ';
        const hostId = dto.host?.id || dto.hostId || dto.host_id || dto.organizer?.id;
        const room = dto.room || {};
        const participants = (dto.participants || []).map(p => ({
            id: p.userId || p.user_id || p.user?.id || p.id,
            fullName: p.fullName || p.full_name || p.user?.fullName || '',
            email: p.email || p.user?.email || '',
            avatarUrl: p.avatarUrl || p.avatar_url || p.user?.avatarUrl || p.user?.avatar_url || '',
            participantRole: p.participantRole || p.participant_role || 'participant',
        }));
        const agenda = (dto.agendas || dto.agenda || []).map((a, idx) => ({
            ...a,
            durationMin: a.durationMinutes ?? a.durationMin ?? a.plannedDurationMinutes ?? 15,
            orderIndex: a.sortOrder ?? a.orderIndex ?? idx,
        }));
        return {
            id: meetingObj.id || meetingObj.meetingId || dto.id || dto.meetingId,
            meetingId: meetingObj.id || meetingObj.meetingId || dto.id || dto.meetingId,
            meeting_code: meetingObj.meetingCode || meetingObj.meeting_code || dto.meetingCode || dto.meeting_code,
            title: meetingObj.title || dto.title,
            description: meetingObj.description || dto.description,
            status: meetingObj.status || dto.status,
            host: hostName,
            hostId,
            host_id: hostId,
            room: {
                id: room.id,
                roomName: room.roomName || room.room_name,
                room_name: room.roomName || room.room_name,
                location: room.location,
                siteName: room.siteName || room.site_name,
                site_name: room.siteName || room.site_name,
                capacity: room.capacity,
            },
            startTime: meetingObj.startTime || meetingObj.start_time || dto.startTime || dto.start_time,
            start_time: meetingObj.startTime || meetingObj.start_time || dto.startTime || dto.start_time,
            endTime: meetingObj.endTime || meetingObj.end_time || dto.endTime || dto.end_time,
            end_time: meetingObj.endTime || meetingObj.end_time || dto.endTime || dto.end_time,
            // recordingEnabled cần set cả 2 casing (giống employee) — trước đây chỉ set recording_enabled
            // khiến so sánh meeting.recordingEnabled trong handleSaveEdit luôn undefined, làm PATCH
            // recording-config bắn thừa trên mọi lần lưu, và badge "Tự động ghi hình" không bao giờ hiện.
            recordingEnabled: dto.recordingConfig?.allowRecording || dto.recordingEnabled || dto.recording_enabled || false,
            recording_enabled: dto.recordingConfig?.allowRecording || dto.recordingEnabled || dto.recording_enabled || false,
            // Participants & Agenda
            participants,
            externalParticipants: dto.externalParticipants || dto.external_participants || [],
            external_participants: dto.externalParticipants || dto.external_participants || [],
            agenda,
        };
    };

    const fetchMeeting = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Load user context
            const localUserStr = localStorage.getItem('user');
            if (localUserStr) {
                setCurrentUser(JSON.parse(localUserStr));
            }

            const res = await getMeetingById(id);
            if (res?.success && res.data) {
                const normalized = normalizeMeetingDetail(res.data);
                setMeeting(normalized);
                initEditStates(normalized);
                if (normalized.status === 'completed') {
                    try {
                        const mediaRes = await getMeetingMediaFiles(normalized.id);
                        if (mediaRes?.success) {
                            const rawFiles = mediaRes.data || [];
                            const processed = await Promise.all(rawFiles.map(async f => {
                                if ((f.fileType || f.type || f.file_type || '').toLowerCase() === 'audio') {
                                    try {
                                        const res = await getMediaFile(f.id);
                                        if (res?.success && res.data?.downloadUrl) {
                                            return { ...f, downloadUrl: res.data.downloadUrl };
                                        }
                                    } catch(e) {}
                                }
                                return f;
                            }));
                            setMediaFiles(processed);
                        }
                    } catch (e) {
                        // ignore error for media
                    }
                }
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể tải chi tiết cuộc họp.');
            }
        } catch (err) {
            const msg = err?.error?.message || err?.message || 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [id]);


    const handleJoinMeeting = () => {
        const startVal = meeting.start_time || meeting.startTime;
        const endVal = meeting.end_time || meeting.endTime;
        if (!startVal || !endVal) {
            navigate(`/manager/in-meeting/${meeting.id}`);
            return;
        }

        const startDate = new Date(startVal);
        const endDate = new Date(endVal);
        const now = new Date();

        const diffMs = startDate.getTime() - now.getTime();
        if (diffMs > 15 * 60 * 1000) {
            const timeStr = startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const dateStr = startDate.toLocaleDateString('vi-VN');
            setTimeValidationModal({
                isOpen: true,
                message: `Cuộc họp chưa đến giờ diễn ra. Vui lòng quay lại vào lúc ${timeStr} ngày ${dateStr}.`
            });
            return;
        }

        if (now > endDate) {
            setTimeValidationModal({
                isOpen: true,
                message: "Cuộc họp đã kết thúc khung giờ ban đầu."
            });
            return;
        }

        navigate(`/manager/in-meeting/${meeting.id}`);
    };

    const initEditStates = (data) => {
        setEditTitle(data.title || '');
        const startVal = data.start_time || data.startTime;
        const endVal = data.end_time || data.endTime;
        const startDate = new Date(startVal);
        const endDate = new Date(endVal);
        setEditDateRange([startDate, endDate]);
        setEditStart(startDate.toTimeString().substring(0, 5));
        setEditEnd(endDate.toTimeString().substring(0, 5));
        setEditRoomId(data.room?.id || '');
        setSelectedRoomInfo(data.room ? {
            roomId: data.room.id,
            roomName: data.room.room_name || data.room.roomName,
            siteName: data.room.site_name || data.room.siteName,
            capacity: data.room.capacity,
        } : null);
        setCheckStatus('idle');
        setEditParticipants(data.participants?.map(p => p.id) || []);
        setEditRecordingEnabled(data.recording_enabled || data.recordingEnabled || false);
        setAgendaList(data.agenda || []);
    };

    useEffect(() => {
        fetchMeeting();
    }, [fetchMeeting]);

    // Load helper data for edit forms (users) — chạy lại khi mở modal Sửa cuộc họp
    // HOẶC modal Thêm người tham dự nội bộ (trước đây chỉ gắn với isEditModalOpen nên
    // nếu user bấm "Nội bộ" mà chưa từng mở modal Sửa, danh sách sẽ rỗng/không được lọc
    // role mới nhất — BA/SA vẫn có thể lọt qua tìm kiếm thủ công trong modal).
    useEffect(() => {
        if (isEditModalOpen || isImportModalOpen) {
            const loadUsers = async () => {
                try {
                    const usersRes = await getUsers({ meetingEligibleOnly: true });
                    if (usersRes?.success) setUsers(usersRes.data || []);
                } catch (e) { }
            };
            loadUsers();
        }
    }, [isEditModalOpen, isImportModalOpen]);

    // Nạp danh sách phòng còn trống 1 LẦN khi mở modal (dùng giờ gốc của cuộc họp) — KHÔNG tự
    // động chạy lại khi user đổi giờ nữa. Việc kiểm tra lại theo giờ mới do người dùng chủ động
    // bấm nút "Kiểm tra trùng lịch & phòng" (xem handleCheckAvailability bên dưới).
    useEffect(() => {
        if (isEditModalOpen && editStartStr && editEndStr && editStart && editEnd) {
            const fetchInitialRooms = async () => {
                setIsFetchingRooms(true);
                try {
                    const startISO = new Date(`${editStartStr}T${editStart}:00`).toISOString();
                    const endISO = new Date(`${editEndStr}T${editEnd}:00`).toISOString();
                    const res = await getAvailableRoomsForMeeting(meeting.id, { startTime: startISO, endTime: endISO, includeCurrentRoom: true });
                    if (res?.success) {
                        setRooms(res.data || []);
                    }
                } catch (e) {
                    console.error("Failed to fetch available rooms", e);
                } finally {
                    setIsFetchingRooms(false);
                }
            };
            fetchInitialRooms();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditModalOpen, meeting?.id]);

    // Đổi giờ → chỉ reset trạng thái check về 'idle' (nhắc nhở mềm), KHÔNG tự gọi API.
    useEffect(() => {
        setCheckStatus('idle');
    }, [editStart, editEnd, editStartStr, editEndStr]);

    const handleCheckAvailability = async () => {
        if (!editStartDate || !isValidDate(editStartDate)) {
            setError('Khung ngày họp bắt đầu không hợp lệ.');
            return;
        }
        if (!editEndDate || !isValidDate(editEndDate)) {
            setError('Khung ngày họp kết thúc không hợp lệ.');
            return;
        }
        if (!editStart || !/^\d{2}:\d{2}$/.test(editStart)) {
            setError('Giờ bắt đầu cuộc họp không hợp lệ.');
            return;
        }
        if (!editEnd || !/^\d{2}:\d{2}$/.test(editEnd)) {
            setError('Giờ kết thúc cuộc họp không hợp lệ.');
            return;
        }

        setIsFetchingRooms(true);
        try {
            const startISO = new Date(`${editStartStr}T${editStart}:00`).toISOString();
            const endISO = new Date(`${editEndStr}T${editEnd}:00`).toISOString();
            const res = await getAvailableRoomsForMeeting(meeting.id, { startTime: startISO, endTime: endISO, includeCurrentRoom: true });
            if (res?.success) {
                const fetchedRooms = res.data || [];
                setRooms(fetchedRooms);
                const isAvailable = fetchedRooms.some(r => String(r.roomId) === String(editRoomId));
                setCheckStatus(isAvailable ? 'ok' : 'conflict');
            }
        } catch (e) {
            console.error("Failed to check room availability", e);
        } finally {
            setIsFetchingRooms(false);
        }
    };

    // Auto-hide success/error alerts
    useEffect(() => {
        if (successMsg) {
            const timer = setTimeout(() => setSuccessMsg(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMsg]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!editStartDate || !isValidDate(editStartDate)) {
            setError('Khung ngày họp bắt đầu không hợp lệ.');
            return;
        }
        if (!editEndDate || !isValidDate(editEndDate)) {
            setError('Khung ngày họp kết thúc không hợp lệ.');
            return;
        }
        if (!editStart || !/^\d{2}:\d{2}$/.test(editStart)) {
            setError('Giờ bắt đầu cuộc họp không hợp lệ.');
            return;
        }
        if (!editEnd || !/^\d{2}:\d{2}$/.test(editEnd)) {
            setError('Giờ kết thúc cuộc họp không hợp lệ.');
            return;
        }

        const startISO = new Date(`${editStartStr}T${editStart}:00`).toISOString();
        const endISO = new Date(`${editEndStr}T${editEnd}:00`).toISOString();
        await doSaveEdit(startISO, endISO);
    };

    // Hàm thực thi lưu — có thể gọi lại với overrideParticipantConflict/confirmCapacityOverride=true
    // sau khi user xác nhận ở modal cảnh báo xung đột.
    const doSaveEdit = async (startISO, endISO, options = {}) => {
        const { overrideParticipantConflict = false, confirmCapacityOverride = false } = options;
        setError(null);
        try {
            let successCount = 0;
            // 1. Update Time if changed
            if (new Date(startISO).getTime() !== new Date(meeting.startTime).getTime() || new Date(endISO).getTime() !== new Date(meeting.endTime).getTime()) {
                const timePayload = { startTime: startISO, endTime: endISO };
                if (overrideParticipantConflict) timePayload.overrideParticipantConflict = true;
                const timeRes = await updateMeetingTime(meeting.id, timePayload);
                if (timeRes?.success) successCount++;
            }
            // 2. Update Room if changed
            if (editRoomId !== meeting.room?.id) {
                const roomPayload = { newRoomId: editRoomId };
                if (confirmCapacityOverride) roomPayload.confirmCapacityOverride = true;
                const roomRes = await updateMeetingRoom(meeting.id, roomPayload);
                if (roomRes?.success) successCount++;
            }
            // 3. Update Recording config if changed
            // BE UpdateRecordingConfigDto chỉ nhận enableVideo/enableAudio (không phải autoRecord/allowRecording —
            // đó là field của read-shape trong GET /meetings/:id, không phải write-shape của PATCH này).
            if (editRecordingEnabled !== meeting.recordingEnabled) {
                try {
                    const recRes = await updateMeetingRecordingConfig(meeting.id, { enableVideo: editRecordingEnabled, enableAudio: editRecordingEnabled });
                    if (recRes?.success) successCount++;
                } catch (recErr) {
                    if (recErr?.error?.code === 'RECORDING_CONFIG_NOT_FOUND') {
                        const addRes = await addRecordingConfig(meeting.id, { enableVideo: editRecordingEnabled, enableAudio: editRecordingEnabled });
                        if (addRes?.success) successCount++;
                    } else {
                        throw recErr;
                    }
                }
            }

            // 4. Update other info (Title) - Chờ BE-03
            if (editTitle !== meeting.title) {
                await updateMeeting(meeting.id, { title: editTitle }); // Tạm gọi hàm cũ
                successCount++;
            }

            if (successCount > 0 || (new Date(startISO).getTime() === new Date(meeting.startTime).getTime() && new Date(endISO).getTime() === new Date(meeting.endTime).getTime() && editRoomId === meeting.room?.id && editRecordingEnabled === meeting.recordingEnabled && editTitle === meeting.title)) {
                setSuccessMsg('Đã cập nhật thông tin cuộc họp thành công.');
                setIsEditModalOpen(false);
                fetchMeeting();
            } else {
                setError('Không thể cập nhật cuộc họp. Vui lòng thử lại.');
            }
        } catch (err) {
            const errorCode = err?.error?.code || '';
            const details = err?.error?.details || {};

            if (errorCode === 'PARTICIPANT_TIME_CONFLICT_WARNING') {
                // 409 non-blocking: khung giờ mới trùng lịch của người tham gia khác — cho phép xác nhận vẫn đổi
                setParticipantConflictModal({
                    isOpen: true,
                    conflicts: details.conflicts || [],
                    pendingPayload: { startISO, endISO },
                });
                return;
            }

            if (errorCode === 'ROOM_TIME_CONFLICT') {
                const suggested = details.suggestedRooms || [];
                let msg = err?.error?.message || 'Phòng họp không khả dụng trong khung giờ mới.';
                if (suggested.length > 0) {
                    msg += ` Phòng gợi ý: ${suggested.map(r => r.roomName).join(', ')}.`;
                }
                setError(msg);
                return;
            }

            if (errorCode === 'ROOM_CONFLICT') {
                // Đổi phòng (không đổi giờ) nhưng phòng mới đã có người đặt trùng khung giờ hiện tại.
                setError(err?.error?.message || 'Phòng họp đã chọn không còn trống trong khung giờ này. Vui lòng chọn phòng khác.');
                return;
            }

            if (errorCode === 'ROOM_CAPACITY_WARNING') {
                // 422 non-blocking: phòng mới có sức chứa nhỏ hơn số người tham dự — cho phép xác nhận vẫn đổi
                setRoomCapacityModal({
                    isOpen: true,
                    message: err?.error?.message || 'Phòng mới có sức chứa nhỏ hơn số người tham dự hiện tại.',
                    pendingPayload: { startISO, endISO },
                });
                return;
            }

            setError(err?.error?.message || err?.message || 'Lỗi cập nhật cuộc họp. Vui lòng thử lại.');
        }
    };

    const handleCancelMeeting = async () => {
        setError(null);
        try {
            const res = await cancelMeeting(meeting.id, cancelReason);
            if (res?.success) {
                setSuccessMsg('Đã hủy cuộc họp thành công.');
                setIsCancelConfirmOpen(false);
                fetchMeeting();
            } else {
                setError(res?.message || 'Không thể hủy cuộc họp.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Lỗi hủy cuộc họp. Vui lòng thử lại.');
        }
    };

    const handleAddAgendaItem = () => {
        if (!newAgendaTitle.trim()) return;
        const dur = Number(newAgendaDuration);
        if (isNaN(dur) || dur <= 0) return;

        if (agendaEditIndex !== null) {
            setAgendaList(prev => {
                const newList = [...prev];
                newList[agendaEditIndex] = {
                    ...newList[agendaEditIndex],
                    title: newAgendaTitle,
                    durationMin: dur,
                    file: newAgendaFile ? newAgendaFile : newList[agendaEditIndex].file
                };
                return newList;
            });
            setAgendaEditIndex(null);
        } else {
            setAgendaList(prev => [
                ...prev,
                {
                    title: newAgendaTitle,
                    durationMin: dur,
                    orderIndex: prev.length,
                    file: newAgendaFile ? newAgendaFile : null,
                    attachments: []
                }
            ]);
        }
        setNewAgendaTitle('');
        setNewAgendaFile(null);
    };

    const handleRemoveAgendaItem = (idx) => {
        setAgendaList(prev => prev.filter((_, i) => i !== idx).map((item, idy) => ({ ...item, orderIndex: idy })));
    };

    const handleEditAgendaItem = (idx) => {
        const item = agendaList[idx];
        setNewAgendaTitle(item.title);
        setNewAgendaDuration(item.durationMin.toString());
        setNewAgendaFile(item.file);
        setAgendaEditIndex(idx);
    };

    const handleDeleteAttachment = (agendaId, fileId) => {
        setConfirm({
            message: 'Bạn có chắc chắn muốn xóa file đính kèm này?',
            onConfirm: async () => {
                try {
                    const res = await deleteAgendaAttachment(meeting.id, agendaId, fileId);
                    if (res?.success) {
                        setAgendaList(prev => prev.map(a => {
                            if (a.id === agendaId && a.attachments) {
                                return { ...a, attachments: a.attachments.filter(att => att.id !== fileId) };
                            }
                            return a;
                        }));
                        fetchMeeting();
                    } else {
                        toast.error('Không thể xóa file.');
                    }
                } catch (e) {
                    toast.error('Lỗi khi xóa file.');
                }
            },
        });
    };

    const handleDownloadFile = async (fileId) => {
        try {
            const res = await getMediaFile(fileId);
            if (res?.success && res.data?.downloadUrl) {
                const a = document.createElement('a');
                a.href = res.data.downloadUrl;
                a.download = res.data.fileName || '';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                toast.error('Không thể lấy link tải file.');
            }
        } catch (e) {
            toast.error('Lỗi khi lấy link tải file.');
        }
    };

    const handleRunSttForSession = async (recordingSessionId) => {
        setRunningSttSessionIds(prev => new Set(prev).add(recordingSessionId));
        try {
            const res = await createTranscriptionJob(meeting.id, {
                recordingSessionId,
                language: 'vi-VN',
                speakerMappingMode: 'diarization_only'
            });
            if (res?.success) {
                toast.success('Đã bắt đầu chạy Speech to Text cho bản ghi này.');
                setRefreshTranscriptKey(prev => prev + 1);
            } else {
                toast.error(res?.error?.message || res?.message || 'Không thể khởi tạo Speech to Text.');
            }
        } catch (err) {
            toast.error(err?.error?.message || err?.message || 'Có lỗi xảy ra khi khởi tạo Speech to Text.');
        } finally {
            setRunningSttSessionIds(prev => {
                const next = new Set(prev);
                next.delete(recordingSessionId);
                return next;
            });
        }
    };

    const handleDeleteAudio = (fileId) => {
        setConfirm({
            message: 'Bạn có chắc chắn muốn xóa bản ghi âm này? Thao tác này không thể hoàn tác trên giao diện.',
            onConfirm: async () => {
                try {
                    const res = await updateMediaVisibility(fileId, { action: 'soft_delete', reason: 'Host/Manager tự xóa audio thừa' });
                    if (res?.success) {
                        toast.success('Đã xóa bản ghi âm thành công.');
                        setMediaFiles(prev => prev.filter(m => m.id !== fileId));
                    } else {
                        toast.error(res?.message || 'Không thể xóa bản ghi âm.');
                    }
                } catch (err) {
                    toast.error(err?.message || 'Có lỗi xảy ra khi xóa bản ghi âm.');
                }
            }
        });
    };

    const handleRemoveInternalParticipant = (p) => {
        setConfirm({
            message: `Bạn có chắc chắn muốn xóa ${p.fullName || p.full_name} khỏi cuộc họp?`,
            onConfirm: async () => {
                try {
                    const res = await removeInternalParticipant(meeting.id, p.id);
                    if (res?.success) {
                        setMeeting({ ...meeting, participants: meeting.participants.filter(pt => pt.id !== p.id) });
                        setSuccessMsg('Đã xóa người tham dự.');
                    } else {
                        toast.error(res?.message || 'Xóa thất bại.');
                    }
                } catch (err) {
                    toast.error('Lỗi hệ thống khi xóa.');
                }
            },
        });
    };

    const handleRemoveExternalParticipant = (p) => {
        setConfirm({
            message: `Bạn có chắc chắn muốn xóa khách ${p.name || p.fullName || p.full_name} khỏi cuộc họp?`,
            onConfirm: async () => {
                try {
                    const res = await removeExternalParticipant(meeting.id, p.id);
                    if (res?.success) {
                        const currentExternal = meeting.externalParticipants || meeting.external_participants || [];
                        setMeeting({ ...meeting, externalParticipants: currentExternal.filter(pt => pt.id !== p.id), external_participants: currentExternal.filter(pt => pt.id !== p.id) });
                        setSuccessMsg('Đã xóa khách ngoài.');
                    } else {
                        toast.error(res?.message || 'Xóa thất bại.');
                    }
                } catch (err) {
                    toast.error('Lỗi hệ thống khi xóa khách.');
                }
            },
        });
    };

    const handleSaveAgenda = async () => {
        try {
            // BE thay agenda qua PUT /meetings/:id/agendas (ReplaceAgendaDto: { items }),
            // KHÔNG qua PATCH /meetings/:id — field "agenda" không tồn tại trong UpdateMeetingDto
            // nên trước đây bị ValidationPipe loại bỏ, lưu không có tác dụng.
            const items = agendaList.map(item => ({
                ...(item.id ? { id: item.id } : {}),
                title: item.title,
                plannedDurationMinutes: item.durationMin ?? item.plannedDurationMinutes ?? item.durationMinutes ?? 15,
                ...(item.description ? { description: item.description } : {}),
                ...(item.ownerId ? { ownerId: item.ownerId } : {}),
            }));
            const res = await replaceAgendas(meeting.id, items);
            if (res?.success) {
                if (res.data?.items) {
                    const savedItems = res.data.items;
                    const uploadErrors = [];
                    for (let i = 0; i < agendaList.length; i++) {
                        const localItem = agendaList[i];
                        const savedItem = savedItems.find(s => localItem.id ? s.id === localItem.id : s.title === localItem.title) || savedItems[i];
                        if (localItem.file && localItem.file instanceof File && savedItem) {
                            const formData = new FormData();
                            formData.append('file', localItem.file);
                            try {
                                await uploadAgendaAttachment(meeting.id, savedItem.id, formData);
                            } catch (e) {
                                uploadErrors.push(`- "${localItem.title}": ${e?.error?.message || e?.message || 'Lỗi không xác định'}`);
                            }
                        }
                    }
                    if (uploadErrors.length > 0) {
                        setError(`Đã lưu chương trình nhưng có lỗi khi tải lên tài liệu đính kèm:\n${uploadErrors.join('\n')}`);
                        return; // Không đóng modal để user xem lỗi
                    }
                }
                setSuccessMsg('Cập nhật chương trình Agenda thành công.');
                setIsAgendaModalOpen(false);
                fetchMeeting();
            } else {
                setError(res?.message || 'Không thể lưu Agenda.');
            }
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể lưu Agenda. Vui lòng thử lại.');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[450px]">
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-slate-blue text-sm font-semibold">Đang tải chi tiết cuộc họp...</p>
            </div>
        );
    }

    if (!meeting) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[450px]">
                <p className="text-red-500 font-semibold">Không tìm thấy thông tin cuộc họp hoặc có lỗi xảy ra.</p>
            </div>
        );
    }

    const isHost = currentUser?.id === (meeting.host_id || meeting.hostId);
    // Transcript/duyệt biên bản: BE cho phép Host HOẶC Admin (BUSINESS_ADMIN/SYSTEM_ADMIN) — xem GET /auth/me
    // trả data.roles là mảng { roleCode }, không phải field `role` dạng string.
    const isAdmin = currentUser?.roles?.some(r => ['BUSINESS_ADMIN', 'SYSTEM_ADMIN'].includes(r.roleCode || r.role_code));
    const canManage = isHost || isAdmin;
    // [2026-08-23] Khớp đúng luật của BE: isOwner (host/organizer) HOẶC có permission.
    const isOrganizer = currentUser?.id === (meeting.organizer_id || meeting.organizerId);
    const hostParticipant = meeting.participants?.find((participant) =>
        participant.id === (meeting.host_id || meeting.hostId)
        || participant.userId === (meeting.host_id || meeting.hostId)
        || participant.participantRole === 'host'
        || participant.participant_role === 'host'
    );
    const hostUser = hostParticipant
        || (typeof meeting.host === 'object' ? meeting.host : {
            fullName: meeting.host,
            avatarUrl: meeting.hostAvatarUrl || meeting.host_avatar_url,
        });
    const hostName = hostUser?.fullName || hostUser?.full_name || meeting.hostName || meeting.host_name || 'Host';
    const rawStatus = meeting.status;

    let isBefore15Min = false;
    let isEnded = false;
    if (meeting?.start_time || meeting?.startTime) {
        const startVal = meeting.start_time || meeting.startTime;
        const startDate = new Date(startVal);
        const diffMs = startDate.getTime() - nowTs;
        if (diffMs > 15 * 60 * 1000) {
            isBefore15Min = true;
        }
    }
    if (meeting?.end_time || meeting?.endTime) {
        const endVal = meeting.end_time || meeting.endTime;
        const endDate = new Date(endVal);
        if (endDate.getTime() < nowTs) {
            isEnded = true;
        }
    }
    const effectiveStatus = rawStatus === 'in_progress' && isEnded ? 'completed' : rawStatus;
    const canJoin = (effectiveStatus === 'scheduled' || effectiveStatus === 'in_progress') && !isEnded;
    const isCompleted = effectiveStatus === 'completed';
    // BE chỉ cho thêm người tham dự khi status là 'scheduled' hoặc 'in_progress'.
    // Nếu giờ kết thúc đã qua nhưng DB chưa kịp cron update, FE vẫn khóa thao tác theo effectiveStatus.
    const canAddParticipants = canManage && (effectiveStatus === 'scheduled' || effectiveStatus === 'in_progress');
    const canAddExternalParticipant = canAddParticipants
        && (isHost || isOrganizer || hasPermission('meeting.participant.add.external'));

    const videoMedia = mediaFiles.find(m => m.type === 'VIDEO');
    const transcriptMedia = mediaFiles.find(m => m.type === 'TRANSCRIPT');

    const isFormChanged = () => {
        if (!meeting) return false;
        const startISO = editStartStr && editStart ? new Date(`${editStartStr}T${editStart}:00`).toISOString() : '';
        const endISO = editEndStr && editEnd ? new Date(`${editEndStr}T${editEnd}:00`).toISOString() : '';
        const origStart = meeting.startTime || meeting.start_time;
        const origEnd = meeting.endTime || meeting.end_time;
        const origRecording = meeting.recording_enabled || meeting.recordingEnabled || false;
        
        return (
            new Date(startISO).getTime() !== new Date(origStart).getTime() ||
            new Date(endISO).getTime() !== new Date(origEnd).getTime() ||
            editRoomId !== meeting.room?.id ||
            editRecordingEnabled !== origRecording ||
            editTitle !== meeting.title
        );
    };
    
    // checkStatus giờ chỉ dùng để hiển thị banner/border, KHÔNG chặn Lưu nữa — lưới an toàn
    // cuối là recheck ở BE lúc updateMeetingTime / Manager duyệt lại.
    const isSubmitDisabled = !isFormChanged();

    const hasUncheckedTimeEdit = () => {
        if (checkStatus !== 'idle' || !meeting) return false;
        const startISO = editStartStr && editStart ? new Date(`${editStartStr}T${editStart}:00`).toISOString() : '';
        const endISO = editEndStr && editEnd ? new Date(`${editEndStr}T${editEnd}:00`).toISOString() : '';
        const origStart = meeting.startTime || meeting.start_time;
        const origEnd = meeting.endTime || meeting.end_time;
        return (
            new Date(startISO).getTime() !== new Date(origStart).getTime() ||
            new Date(endISO).getTime() !== new Date(origEnd).getTime()
        );
    };

    // Đảm bảo phòng đang chọn luôn có mặt trong option list, kể cả khi bị loại khỏi `rooms`
    // sau lần kiểm tra gần nhất (không tự động khoá/xoá lựa chọn của người dùng).
    const roomOptionsToRender = rooms.some(r => String(r.roomId) === String(editRoomId))
        ? rooms
        : (selectedRoomInfo ? [...rooms, selectedRoomInfo] : rooms);
    const suggestedAlternativeRooms = rooms.filter(r => String(r.roomId) !== String(editRoomId)).slice(0, 5);
    // Nhóm D — cảnh báo mềm: request pending khác đang xin cùng phòng/giờ với
    // phòng đang chọn (chỉ hiện sau khi đã bấm Kiểm tra ít nhất 1 lần, không
    // chặn gì cả).
    const selectedRoomPendingConflicts = checkStatus !== 'idle'
        ? (rooms.find(r => String(r.roomId) === String(editRoomId))?.pendingConflicts || [])
        : [];


    return (
        <>
            <ConfirmDialog
                isOpen={!!confirm}
                message={confirm?.message}
                onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
                onCancel={() => setConfirm(null)}
            />
            <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
                {/* Header / Actions */}
                <div className="flex justify-end gap-2 w-full">
                    {isHost && effectiveStatus !== 'cancelled' && effectiveStatus !== 'completed' && !isEnded && (
                        <>
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-platinum-tint bg-white text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-bold transition-all"
                            >
                                <Edit3 className="w-4 h-4" /> Chỉnh sửa cuộc họp
                            </button>
                            {/* BE (meetings.service.ts) chỉ cho hủy meeting đang ở status 'scheduled' —
                                pending_approval/draft/in_progress sẽ luôn bị BE từ chối 409, nên ẩn nút. */}
                            {effectiveStatus === 'scheduled' && (
                                <button
                                    onClick={() => setIsCancelConfirmOpen(true)}
                                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all"
                                >
                                    <Trash2 className="w-4 h-4" /> Hủy họp
                                </button>
                            )}
                        </>
                    )}
                    {effectiveStatus === 'completed' || isEnded ? (
                        <button
                            disabled
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300"
                        >
                            Cuộc họp đã kết thúc
                        </button>
                    ) : effectiveStatus === 'cancelled' ? (
                        <button
                            disabled
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all bg-red-50 text-red-400 cursor-not-allowed border border-red-200"
                        >
                            Cuộc họp đã bị hủy
                        </button>
                    ) : canJoin && (
                        <button
                            onClick={isBefore15Min ? null : handleJoinMeeting}
                            disabled={isBefore15Min}
                            title={isBefore15Min ? "Nút tham gia sẽ mở trước giờ họp 15 phút" : ""}
                            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all ${isBefore15Min
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse-soft'
                                }`}
                        >
                            <Video className="w-4 h-4" /> Tham gia phòng họp
                        </button>
                    )}
                </div>

                {successMsg && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-3 animate-pulse-soft">
                        <Check className="w-5 h-5 flex-shrink-0" />
                        <span>{successMsg}</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3 animate-pulse-soft">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Title & Banner Info */}
                <div className="bg-white p-6 md:p-8 rounded-2xl border border-platinum-tint shadow-sm-2 relative overflow-hidden space-y-6">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                        <Users className="w-48 h-48 text-midnight-indigo" />
                    </div>
                    
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 pb-6 border-b border-platinum-tint/60 relative z-10">
                        <div className="space-y-4 w-full">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1.5 ${
                                    (STATUS_BADGE[effectiveStatus] || STATUS_BADGE.cancelled).className
                                }`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${effectiveStatus === 'in_progress' ? 'bg-emerald-500 animate-pulse' : 'bg-current'}`} />
                                    {(STATUS_BADGE[effectiveStatus] || { label: effectiveStatus }).label}
                                </span>
                                {meeting.recordingEnabled && (
                                    <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-100 flex items-center gap-1.5 shadow-sm">
                                        <Video className="w-3.5 h-3.5" /> Tự động ghi hình
                                    </span>
                                )}
                                {meeting.meeting_code && (
                                    <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm font-mono flex items-center gap-1.5">
                                        Mã cuộc họp: <span className="text-midnight-indigo">{meeting.meeting_code}</span>
                                    </span>
                                )}
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl md:text-3xl font-extrabold text-midnight-indigo leading-tight tracking-tight">
                                    {meeting.title}
                                </h1>
                                <p className="text-sm text-slate-blue/80 max-w-3xl leading-relaxed">
                                    {meeting.description || 'Không có mô tả cuộc họp'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                        <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                            <Calendar className="w-5 h-5 text-action-blue shrink-0" />
                            <div>
                                <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Ngày họp</span>
                                <span className="text-xs font-semibold text-midnight-indigo">
                                    {new Date(meeting.start_time || meeting.startTime).toLocaleDateString('vi-VN')}
                                    {new Date(meeting.start_time || meeting.startTime).toLocaleDateString('vi-VN') !== new Date(meeting.end_time || meeting.endTime).toLocaleDateString('vi-VN') 
                                        ? ` - ${new Date(meeting.end_time || meeting.endTime).toLocaleDateString('vi-VN')}` 
                                        : ''}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                            <Clock className="w-5 h-5 text-action-blue shrink-0" />
                            <div>
                                <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Thời gian</span>
                                <span className="text-xs font-semibold text-midnight-indigo">
                                    {new Date(meeting.start_time || meeting.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(meeting.end_time || meeting.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                            <MapPin className="w-5 h-5 text-action-blue shrink-0" />
                            <div className="truncate">
                                <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Phòng họp / Cơ sở</span>
                                <span className="text-xs font-semibold text-midnight-indigo block truncate">
                                    {meeting.room?.room_name || meeting.room?.roomName || 'N/A'} {meeting.room?.site_name || meeting.room?.siteName ? `(${meeting.room?.site_name || meeting.room?.siteName})` : ''}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                            <Users className="w-5 h-5 text-action-blue shrink-0" />
                            <div className="truncate">
                                <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Người chủ trì</span>
                                <span className="text-xs font-semibold text-midnight-indigo block truncate">{hostName}</span>
                            </div>
                        </div>

                        {meeting.room?.location && (
                            <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                                <MapPin className="w-5 h-5 text-purple-600 shrink-0" />
                                <div className="truncate">
                                    <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Vị trí cụ thể</span>
                                    <span className="text-xs font-semibold text-midnight-indigo block truncate">{meeting.room.location}</span>
                                </div>
                            </div>
                        )}

                        {meeting.room?.capacity && (
                            <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-outline-gray/40">
                                <Users className="w-5 h-5 text-emerald-600 shrink-0" />
                                <div>
                                    <span className="block text-[10px] uppercase font-bold text-slate-blue tracking-wider">Sức chứa</span>
                                    <span className="text-xs font-semibold text-midnight-indigo">{meeting.room.capacity} người</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Split Content: Details & Agenda vs Recording Player */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Details & Agenda Panel */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Agenda */}
                        <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                            <div className="flex flex-wrap justify-between items-center gap-3 border-b border-platinum-tint pb-3 mb-4">
                                <h3 className="text-sm font-bold text-slate-blue uppercase tracking-wider flex items-center gap-2 shrink-0">
                                    <List className="w-4.5 h-4.5 text-action-blue" />
                                    Chương trình làm việc ({meeting.agenda?.length || 0})
                                </h3>
                                {canManage && effectiveStatus !== 'cancelled' && effectiveStatus !== 'completed' && (
                                    <button
                                        onClick={() => setIsAgendaModalOpen(true)}
                                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-action-blue/20 bg-blue-50 text-action-blue hover:bg-blue-100 rounded-md text-[11px] font-bold transition-all shadow-sm shrink-0"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" /> Quản lý
                                    </button>
                                )}
                            </div>
                            {meeting.agenda && meeting.agenda.length > 0 ? (
                                <div className="flex flex-col h-full">
                                    <div className="space-y-4 flex-1">
                                        {meeting.agenda.slice((agendaPage - 1) * ITEMS_PER_PAGE, agendaPage * ITEMS_PER_PAGE).map((item, idx) => {
                                            const actualIdx = (agendaPage - 1) * ITEMS_PER_PAGE + idx;
                                            return (
                                            <div key={actualIdx} className="flex gap-4 items-start relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-platinum-tint last:before:hidden">
                                                <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-action-blue/10 border border-action-blue flex items-center justify-center text-[9px] font-bold text-action-blue">
                                                    {actualIdx + 1}
                                                </div>
                                                <div className="flex-1 bg-cloud-mist/55 p-3 rounded-xl border border-outline-gray/60">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="font-semibold text-midnight-indigo text-xs sm:text-sm flex items-center gap-2">
                                                            {item.title}
                                                        </h4>
                                                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-action-blue rounded font-bold">{item.durationMin} phút</span>
                                                    </div>
                                                    {item.attachments && item.attachments.length > 0 && (
                                                        <div className="mt-2 flex flex-col gap-1.5">
                                                            {item.attachments.map((file, fIdx) => (
                                                                <button
                                                                    key={fIdx}
                                                                    onClick={() => handleDownloadFile(file.id)}
                                                                    className="flex items-center gap-1.5 text-[11px] text-action-blue hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg w-max transition-colors text-left"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate max-w-[200px]">{file.fileName}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                    {meeting.agenda.length > ITEMS_PER_PAGE && (
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-platinum-tint">
                                            <button 
                                                disabled={agendaPage === 1} 
                                                onClick={() => setAgendaPage(p => p - 1)} 
                                                className="px-3 py-1 text-xs font-bold text-slate-blue bg-cloud-mist hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-all"
                                            >
                                                Trước
                                            </button>
                                            <span className="text-[10px] font-bold text-slate-blue">
                                                Trang {agendaPage} / {Math.ceil(meeting.agenda.length / ITEMS_PER_PAGE)}
                                            </span>
                                            <button 
                                                disabled={agendaPage === Math.ceil(meeting.agenda.length / ITEMS_PER_PAGE)} 
                                                onClick={() => setAgendaPage(p => p + 1)} 
                                                className="px-3 py-1 text-xs font-bold text-slate-blue bg-cloud-mist hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-all"
                                            >
                                                Sau
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-blue italic text-center py-4">Chưa có Agenda nào được cấu hình cho cuộc họp này.</p>
                            )}
                        </div>
                    </div>

                    {/* Right: Participants & Host */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                            <div className="flex flex-wrap justify-between items-center gap-3 border-b border-platinum-tint pb-3 mb-4">
                                <h3 className="text-sm font-bold text-slate-blue uppercase tracking-wider flex items-center gap-2 shrink-0">
                                    <Users className="w-4.5 h-4.5 text-action-blue" />
                                    Người tham dự
                                </h3>
                                {(canAddParticipants || canAddExternalParticipant) && (
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {canAddParticipants && (
                                            <button
                                                onClick={() => setIsImportModalOpen(true)}
                                                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md text-[11px] font-bold transition-all shadow-sm"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" /> Nội bộ
                                            </button>
                                        )}
                                        {canAddExternalParticipant && (
                                            <button
                                                onClick={() => setShowAddGuestModal(true)}
                                                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-md text-[11px] font-bold transition-all shadow-sm"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" /> Khách
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex bg-cloud-mist/50 p-1 rounded-xl mb-4">
                                <button
                                    onClick={() => setActiveParticipantTab('internal')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeParticipantTab === 'internal' ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                                >
                                    Nội bộ ({meeting.participants?.length || 0})
                                </button>
                                <button
                                    onClick={() => setActiveParticipantTab('external')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeParticipantTab === 'external' ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                                >
                                    Khách ngoài ({meeting.externalParticipants?.length || meeting.external_participants?.length || 0})
                                </button>
                            </div>
                            
                            <div className="flex flex-col h-full">
                                {activeParticipantTab === 'internal' && (
                                    <div className="grid grid-cols-1 gap-4 flex-1">
                                        {participantsPage === 1 && (
                                            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-3">
                                                <UserAvatar
                                                    user={hostUser}
                                                    name={hostName}
                                                    className="w-10 h-10 rounded-full shrink-0 font-bold text-sm ring-2 ring-white"
                                                />
                                                <div className="truncate">
                                                    <span className="block text-xs font-bold text-action-blue uppercase tracking-wider text-[9px]">Người chủ trì</span>
                                                    <span className="text-xs font-bold text-midnight-indigo block truncate">{hostName}</span>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {(() => {
                                            const filtered = meeting.participants?.filter(p => p !== hostParticipant && (p.fullName || p.full_name) !== hostName) || [];
                                            const paginated = filtered.slice((participantsPage - 1) * ITEMS_PER_PAGE, participantsPage * ITEMS_PER_PAGE);
                                            
                                            return (
                                                <>
                                                    {paginated.map(p => (
                                                        <div key={p.id} onClick={() => setDetailModalState({ isOpen: true, participant: p, isExternal: false })} className="p-3 bg-cloud-mist rounded-xl border border-outline-gray flex items-center justify-between gap-3 group hover:bg-white transition-colors cursor-pointer">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <UserAvatar
                                                                    user={p}
                                                                    className="w-10 h-10 rounded-full shrink-0 font-bold text-sm"
                                                                />
                                                                <div className="truncate">
                                                                    <span className="block text-xs font-bold text-slate-blue uppercase tracking-wider text-[9px]">Người tham dự</span>
                                                                    <span className="text-xs font-bold text-midnight-indigo block truncate">{p.fullName || p.full_name}</span>
                                                                </div>
                                                            </div>
                                                            {canManage && effectiveStatus !== 'cancelled' && effectiveStatus !== 'completed' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleRemoveInternalParticipant(p); }}
                                                                    className="p-1.5 text-slate-blue hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                                                    title="Xóa người tham dự"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {filtered.length > ITEMS_PER_PAGE && (
                                                        <div className="flex justify-between items-center mt-2 pt-3 border-t border-platinum-tint">
                                                            <button 
                                                                disabled={participantsPage === 1} 
                                                                onClick={() => setParticipantsPage(p => p - 1)} 
                                                                className="px-3 py-1 text-xs font-bold text-slate-blue bg-cloud-mist hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-all"
                                                            >
                                                                Trước
                                                            </button>
                                                            <span className="text-[10px] font-bold text-slate-blue">
                                                                Trang {participantsPage} / {Math.ceil(filtered.length / ITEMS_PER_PAGE)}
                                                            </span>
                                                            <button 
                                                                disabled={participantsPage === Math.ceil(filtered.length / ITEMS_PER_PAGE)} 
                                                                onClick={() => setParticipantsPage(p => p + 1)} 
                                                                className="px-3 py-1 text-xs font-bold text-slate-blue bg-cloud-mist hover:bg-slate-200 rounded-lg disabled:opacity-50 transition-all"
                                                            >
                                                                Sau
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}

                                {activeParticipantTab === 'external' && (
                                    <div className="grid grid-cols-1 gap-4 flex-1">
                                        {(meeting.externalParticipants || meeting.external_participants || []).map(p => (
                                            <div key={p.id} onClick={() => setDetailModalState({ isOpen: true, participant: p, isExternal: true })} className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 flex items-center justify-between gap-3 group hover:bg-white transition-colors cursor-pointer">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="w-10 h-10 rounded-full shrink-0 font-bold text-sm bg-amber-100 text-amber-700 flex items-center justify-center">
                                                        {(p.name || p.fullName || p.full_name || p.email || 'G').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="truncate">
                                                        <span className="block text-xs font-bold text-amber-600 uppercase tracking-wider text-[9px]">Khách ngoài</span>
                                                        <span className="text-xs font-bold text-midnight-indigo block truncate">{p.name || p.fullName || p.full_name}</span>
                                                        <span className="text-[10px] text-slate-blue block truncate">{p.email}</span>
                                                    </div>
                                                </div>
                                                {canManage && effectiveStatus !== 'cancelled' && effectiveStatus !== 'completed' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveExternalParticipant(p); }}
                                                        className="p-1.5 text-slate-blue hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                                        title="Xóa khách"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {(meeting.externalParticipants?.length === 0 && meeting.external_participants?.length === 0) && (
                                            <p className="text-xs text-slate-blue italic text-center py-4">Chưa có khách ngoài nào.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom: Media & Recording & Transcript */}
                <div className="w-full space-y-4 mt-6">
                    {/* Tabs cho Right Panel */}
                    <div className="flex border-b border-platinum-tint bg-white rounded-t-2xl px-2 pt-2">
                        <button
                            onClick={() => setActiveRightTab('transcript')}
                            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${activeRightTab === 'transcript' ? 'border-action-blue text-action-blue' : 'border-transparent text-slate-blue hover:text-midnight-indigo'}`}
                        >
                            Bản ghi (STT)
                        </button>
                        <button
                            onClick={() => setActiveRightTab('minutes')}
                            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${activeRightTab === 'minutes' ? 'border-action-blue text-action-blue' : 'border-transparent text-slate-blue hover:text-midnight-indigo'}`}
                        >
                            Biên bản (AI)
                        </button>
                    </div>

                    {activeRightTab === 'transcript' ? (
                        isCompleted ? (
                            <div className="space-y-6">
                                {/* Audio Uploader */}
                                {canManage && (
                                    <AudioUploader
                                        meetingId={meeting.id}
                                        onUploadSuccess={() => setRefreshTranscriptKey(prev => prev + 1)}
                                    />
                                )}

                                {/* Bản ghi âm */}
                                {(() => {
                                    const audioFiles = mediaFiles.filter(m => (m.fileType || m.type || m.file_type || '').toLowerCase() === 'audio');
                                    if (audioFiles.length === 0) return null;
                                    
                                    const totalAudioPages = Math.ceil(audioFiles.length / audioItemsPerPage);
                                    const currentAudioFiles = audioFiles.slice((audioPage - 1) * audioItemsPerPage, audioPage * audioItemsPerPage);

                                    return (
                                        <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2 mb-6">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-sm font-bold text-slate-blue flex items-center gap-2">
                                                    <Play className="w-4 h-4 text-action-blue" />
                                                    Bản ghi âm cuộc họp
                                                </h3>
                                                {totalAudioPages > 1 && (
                                                    <div className="flex items-center gap-1.5 bg-cloud-mist rounded-lg p-1 border border-platinum-tint">
                                                        <button 
                                                            onClick={() => setAudioPage(p => Math.max(1, p - 1))}
                                                            disabled={audioPage === 1}
                                                            className="p-1 text-slate-blue hover:text-action-blue disabled:opacity-30 disabled:hover:text-slate-blue rounded transition-colors"
                                                        >
                                                            <ChevronLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                        <span className="text-[10px] font-bold text-midnight-indigo px-1">
                                                            {audioPage} / {totalAudioPages}
                                                        </span>
                                                        <button 
                                                            onClick={() => setAudioPage(p => Math.min(totalAudioPages, p + 1))}
                                                            disabled={audioPage === totalAudioPages}
                                                            className="p-1 text-slate-blue hover:text-action-blue disabled:opacity-30 disabled:hover:text-slate-blue rounded transition-colors"
                                                        >
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-4">
                                                {currentAudioFiles.map((audioFile, idx) => (
                                                    <div key={audioFile.id || idx} className="flex flex-col gap-2 p-3 bg-cloud-mist rounded-xl border border-outline-gray">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-bold text-midnight-indigo truncate pr-4 flex flex-col">
                                                                <span>{audioFile.fileName || audioFile.file_name || `Bản ghi âm ${(audioPage - 1) * audioItemsPerPage + idx + 1}`}</span>
                                                                {audioFile.channelUserId && (
                                                                    <span className="text-[10px] font-normal text-slate-400 mt-0.5">
                                                                        Audio track cá nhân
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                {audioFile.downloadUrl && (
                                                                    <a href={audioFile.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-platinum-tint text-slate-blue hover:text-action-blue hover:border-action-blue rounded-lg text-xs font-bold transition-colors">
                                                                        <Download className="w-3.5 h-3.5" />
                                                                        Tải xuống
                                                                    </a>
                                                                )}
                                                                {canManage && !audioFile.channelUserId && (audioFile.recordingSessionId || audioFile.recording_session_id) && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={runningSttSessionIds.has(audioFile.recordingSessionId || audioFile.recording_session_id)}
                                                                        onClick={() => handleRunSttForSession(audioFile.recordingSessionId || audioFile.recording_session_id)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                                                    >
                                                                        {runningSttSessionIds.has(audioFile.recordingSessionId || audioFile.recording_session_id)
                                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                            : <Sparkles className="w-3.5 h-3.5" />}
                                                                        Chạy Speech to Text
                                                                    </button>
                                                                )}
                                                                {canManage && !audioFile.channelUserId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteAudio(audioFile.id)}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 rounded-lg text-xs font-bold transition-colors"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                        Xóa
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {audioFile.downloadUrl && (
                                                            <audio controls src={audioFile.downloadUrl} className="w-full h-10 mt-1" />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Transcript Viewer */}
                                <TranscriptViewer
                                    key={refreshTranscriptKey}
                                    meetingId={meeting.id}
                                    isHost={canManage}
                                    mediaFiles={mediaFiles}
                                />
                            </div>
                        ) : (
                            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2 text-center py-8 text-slate-blue">
                                <Video className="w-8 h-8 mx-auto text-platinum-tint mb-2.5" />
                                <h4 className="text-xs font-bold text-midnight-indigo uppercase">Chưa khả dụng</h4>
                                <p className="text-[11px] mt-1 leading-relaxed text-slate-blue/80">
                                    Bản ghi âm và bản ghi chữ cuộc họp sẽ khả dụng sau khi cuộc họp kết thúc.
                                </p>
                            </div>
                        )
                    ) : (
                        <MinutesTabContent 
                            meetingId={meeting.id} 
                            isHost={canManage} 
                            transcriptStatus={isCompleted ? 'ready' : 'empty'} 
                        />
                    )}
                </div>

                {/* Attendance Board Section */}
                {meeting && (effectiveStatus !== 'cancelled') && (
                    <div className="pt-6 border-t border-platinum-tint space-y-4">
                        {/* Tab Switcher */}
                        <div className="flex border-b border-platinum-tint bg-white rounded-t-2xl px-2 pt-2">
                            <button
                                onClick={() => setActiveAttendanceTab('attendance')}
                                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                                    activeAttendanceTab === 'attendance' 
                                        ? 'border-action-blue text-action-blue font-extrabold' 
                                        : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                }`}
                            >
                                Điểm danh thủ công
                            </button>
                            <button
                                onClick={() => setActiveAttendanceTab('ivss')}
                                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                                    activeAttendanceTab === 'ivss' 
                                        ? 'border-action-blue text-action-blue font-extrabold' 
                                        : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                }`}
                            >
                                Hiện diện thực tế (Camera AI - IVSS)
                            </button>
                        </div>

                        {activeAttendanceTab === 'attendance' ? (
                            <MeetingAttendanceBoard meetingId={meeting.id} />
                        ) : (
                            <MeetingPresenceIVSS 
                                meetingId={meeting.id} 
                                meetingStartTime={meeting.startTime} 
                                meetingEndTime={meeting.endTime} 
                            />
                        )}
                    </div>
                )}

                {/* M7 — Gửi Thông báo (tất cả trạng thái) */}
                {meeting && (
                    <NotificationActionsPanel
                        meetingId={meeting.id}
                        meetingStatus={effectiveStatus}
                        minutesList={[]}
                        onSuccess={(msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3500); }}
                        onError={(msg) => { setError(msg); setTimeout(() => setError(null), 3500); }}
                    />
                )}

                {/* M8 — Import Người tham dự */}
                {meeting && isHost && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                        <div className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-midnight-indigo text-sm">Quản lý Người tham dự</h3>
                                    <p className="text-[11px] text-slate-blue mt-0.5">Thêm nhiều người cùng lúc bằng file Excel</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsImportModalOpen(true)}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
                            >
                                <UserPlus className="w-3.5 h-3.5" />
                                Thêm nội bộ
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: Time Validation Warning */}
            <AnimatePresence>
                {timeValidationModal.isOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-md w-full p-6 space-y-4"
                        >
                            <div className="flex items-center gap-3 text-amber-500 border-b border-platinum-tint pb-3">
                                <AlertTriangle className="w-6 h-6" />
                                <h2 className="text-lg font-bold text-midnight-indigo">Thông báo thời gian</h2>
                            </div>
                            <div className="space-y-2 text-left">
                                <p className="text-sm text-slate-blue leading-relaxed">
                                    {timeValidationModal.message}
                                </p>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setTimeValidationModal({ isOpen: false, message: '' })}
                                    className="px-5 py-2 bg-midnight-indigo hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                                >
                                    Đồng ý
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* MODAL 1: Edit Meeting */}
            <AnimatePresence>
                {isEditModalOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                        >
                            <h2 className="text-lg font-bold text-midnight-indigo border-b border-platinum-tint pb-3">Chỉnh sửa thông tin cuộc họp</h2>
                            <form onSubmit={handleSaveEdit} className="space-y-4 text-left">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tiêu đề cuộc họp</label>
                                    <input
                                        type="text"
                                        required
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Khung ngày họp</label>
                                        <div className="relative w-full z-50">
                                            <DatePicker 
                                                selectsRange={true}
                                                startDate={editStartDate}
                                                endDate={editEndDate}
                                                onChange={(update) => setEditDateRange(update)}
                                                locale={vi}
                                                dateFormat="dd/MM/yyyy"
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                                wrapperClassName="w-full"
                                                placeholderText="DD/MM/YYYY - DD/MM/YYYY"
                                                onKeyDown={handleDateKeyDown}
                                                onChangeRaw={handleDateChangeRaw}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Bắt đầu</label>
                                        <TimePicker
                                            value={editStart}
                                            onChange={(newTime) => setEditStart(newTime)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Kết thúc</label>
                                        <TimePicker
                                            value={editEnd}
                                            onChange={(newTime) => setEditEnd(newTime)}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 -mt-2">
                                    {hasUncheckedTimeEdit() ? (
                                        <p className="text-[11px] text-slate-blue flex items-center gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                            Bạn đã đổi giờ họp — nên kiểm tra lại trước khi lưu.
                                        </p>
                                    ) : <span />}
                                    <button
                                        type="button"
                                        onClick={handleCheckAvailability}
                                        disabled={isFetchingRooms || !editStart || !editEnd}
                                        className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-action-blue text-action-blue hover:bg-action-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-action-blue"
                                    >
                                        {isFetchingRooms ? 'Đang kiểm tra...' : 'Kiểm tra trùng lịch & phòng'}
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                                        Chọn phòng họp {isFetchingRooms && <span className="text-[10px] text-action-blue normal-case italic font-normal ml-2">(Đang tải danh sách phòng...)</span>}
                                    </label>
                                    <select
                                        value={editRoomId}
                                        onChange={(e) => {
                                            setEditRoomId(e.target.value);
                                            const picked = rooms.find(r => String(r.roomId) === String(e.target.value));
                                            if (picked) setSelectedRoomInfo(picked);
                                            setCheckStatus('idle');
                                        }}
                                        className={`w-full px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:border-action-blue ${checkStatus === 'conflict' ? 'border-red-400' : 'border-platinum-tint'}`}
                                    >
                                        {roomOptionsToRender.map((r, idx) => (
                                            <option key={r.roomId || idx} value={r.roomId}>
                                                {r.roomName} {r.siteName ? `(${r.siteName})` : ''}{r.capacity ? ` - Sức chứa: ${r.capacity}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {checkStatus === 'ok' && (
                                        <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1 font-medium">
                                            <Check className="w-3.5 h-3.5" />
                                            Phòng đang chọn còn trống ở khung giờ này.
                                        </p>
                                    )}
                                    {checkStatus === 'conflict' && (
                                        <div className="mt-1.5">
                                            <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Phòng đang chọn không còn trống ở khung giờ này. Bạn vẫn có thể giữ nguyên lựa chọn này (yêu cầu sẽ được gửi lại để duyệt) hoặc chọn phòng khác:
                                            </p>
                                            {suggestedAlternativeRooms.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {suggestedAlternativeRooms.map((r, idx) => (
                                                        <button
                                                            key={r.roomId || idx}
                                                            type="button"
                                                            onClick={() => {
                                                                setEditRoomId(r.roomId);
                                                                setSelectedRoomInfo(r);
                                                                setCheckStatus('ok');
                                                            }}
                                                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cloud-mist border border-outline-gray text-slate-blue hover:bg-action-blue hover:text-white hover:border-action-blue transition-colors"
                                                        >
                                                            {r.roomName}{r.siteName ? ` (${r.siteName})` : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {selectedRoomPendingConflicts.length > 0 && (
                                        <p className="text-[11px] text-amber-600 mt-1.5 flex items-start gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            Đã có {selectedRoomPendingConflicts.length} yêu cầu khác đang chờ duyệt cho phòng/khung giờ này (chưa được duyệt nên chưa chắc chắn giữ được phòng — Manager sẽ quyết định khi có nhiều yêu cầu trùng nhau).
                                        </p>
                                    )}
                                </div>

                                <label className="flex items-center gap-2.5 p-3 bg-cloud-mist rounded-xl border border-outline-gray cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editRecordingEnabled}
                                        onChange={(e) => setEditRecordingEnabled(e.target.checked)}
                                        className="w-4 h-4 rounded text-action-blue border-platinum-tint focus:ring-action-blue"
                                    />
                                    <span className="text-xs text-midnight-indigo font-semibold">Tự động ghi âm/ghi hình cuộc họp (Yêu cầu đồng ý PDPA)</span>
                                </label>

                                <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitDisabled}
                                        className={`px-5 py-2 rounded-xl text-xs font-bold transition-colors ${isSubmitDisabled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-action-blue hover:bg-glacier-blue text-white'}`}
                                    >
                                        Lưu thay đổi
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* MODAL 2: Manage Agenda */}
            <AnimatePresence>
                {isAgendaModalOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-xl w-full p-6 space-y-4"
                        >
                            <h2 className="text-lg font-bold text-midnight-indigo border-b border-platinum-tint pb-3">Quản lý chương trình Agenda</h2>
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Tên mục nghị sự mới..."
                                            value={newAgendaTitle}
                                            onChange={(e) => setNewAgendaTitle(e.target.value)}
                                            className="flex-1 px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                        />
                                        <select
                                            value={newAgendaDuration}
                                            onChange={(e) => setNewAgendaDuration(e.target.value)}
                                            className="w-24 px-2.5 py-2 border border-platinum-tint rounded-xl text-xs bg-white focus:outline-none"
                                        >
                                            <option value="5">5 phút</option>
                                            <option value="10">10 phút</option>
                                            <option value="15">15 phút</option>
                                            <option value="30">30 phút</option>
                                            <option value="45">45 phút</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={handleAddAgendaItem}
                                            className="px-3.5 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold shrink-0"
                                        >
                                            {agendaEditIndex !== null ? 'Lưu' : 'Thêm'}
                                        </button>
                                        {agendaEditIndex !== null && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAgendaEditIndex(null);
                                                    setNewAgendaTitle('');
                                                    setNewAgendaFile(null);
                                                }}
                                                className="px-3.5 py-2 bg-cloud-mist hover:bg-platinum-tint text-slate-blue rounded-xl text-xs font-bold shrink-0"
                                            >
                                                Hủy
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 w-full">
                                        <label className="flex items-center gap-2 px-4 py-2 border border-dashed border-platinum-tint hover:border-action-blue bg-cloud-mist/20 hover:bg-blue-50/20 text-slate-blue hover:text-action-blue rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 justify-center select-none">
                                            <Upload className="w-4 h-4 text-action-blue" />
                                            <span>{newAgendaFile ? `Đã đính kèm: ${newAgendaFile.name}` : 'Đính kèm tài liệu thảo luận (PDF, Word, Excel, PowerPoint...)'}</span>
                                            <input type="file" onChange={(e) => { if (e.target.files && e.target.files[0]) setNewAgendaFile(e.target.files[0]); }} className="hidden" />
                                        </label>
                                        {newAgendaFile && (
                                            <button type="button" onClick={() => setNewAgendaFile(null)} className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl transition-all" title="Hủy chọn file">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {agendaList.map((item, idx) => (
                                        <div 
                                            key={idx} 
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.effectAllowed = 'move';
                                                setDraggedAgendaIndex(idx);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                if (draggedAgendaIndex === null || draggedAgendaIndex === idx) return;
                                                const newList = [...agendaList];
                                                const draggedItem = newList.splice(draggedAgendaIndex, 1)[0];
                                                newList.splice(idx, 0, draggedItem);
                                                // Cập nhật lại orderIndex cho chuẩn
                                                const reordered = newList.map((a, index) => ({ ...a, orderIndex: index }));
                                                setAgendaList(reordered);
                                                setDraggedAgendaIndex(null);
                                            }}
                                            onDragEnd={() => setDraggedAgendaIndex(null)}
                                            className={`flex justify-between items-center p-3 rounded-xl border transition-all cursor-move ${
                                                draggedAgendaIndex === idx ? 'opacity-50 border-action-blue bg-blue-50' : 'bg-cloud-mist border-outline-gray hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-start gap-2 overflow-hidden flex-1">
                                                <GripVertical className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 cursor-grab" />
                                                <div className="text-left overflow-hidden flex-1">
                                                    <span className="text-xs font-bold text-midnight-indigo flex items-center gap-2 mb-1 truncate">
                                                        {item.title}
                                                    </span>
                                                    <span className="text-[10px] text-slate-blue font-medium block">{item.durationMin} phút</span>
                                                    {item.attachments && item.attachments.length > 0 && (
                                                        <div className="mt-1 flex flex-col gap-1">
                                                            {item.attachments.map(att => (
                                                                <div key={att.id} className="flex items-center justify-between text-[10px] text-action-blue bg-blue-50 px-2 py-0.5 rounded w-full max-w-xs">
                                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                                        <FileText className="w-3 h-3 shrink-0" />
                                                                        <span className="truncate max-w-[180px]">{att.fileName}</span>
                                                                    </div>
                                                                    <button onClick={() => handleDeleteAttachment(item.id, att.id)} className="text-red-500 hover:text-red-700 ml-2"><X className="w-3 h-3" /></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {item.file && item.file instanceof File && (
                                                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-max">
                                                            <FileText className="w-3 h-3 shrink-0" />
                                                            <span className="truncate max-w-[200px]">Mới: {item.file.name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                                <button
                                                    onClick={() => handleEditAgendaItem(idx)}
                                                    className="text-blue-500 hover:text-blue-700 p-1.5"
                                                    title="Sửa"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveAgendaItem(idx)}
                                                    className="text-red-500 hover:text-red-700 p-1.5"
                                                    title="Xóa"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button
                                    type="button"
                                    onClick={() => setIsAgendaModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={handleSaveAgenda}
                                    className="px-5 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold"
                                >
                                    Lưu chương trình
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* MODAL 3: Cancel Confirm */}
            <AnimatePresence>
                {isCancelConfirmOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl border border-platinum-tint shadow-sm-3 max-w-md w-full p-6 space-y-4"
                        >
                            <div className="flex items-center gap-3 text-red-600 border-b border-platinum-tint pb-3">
                                <AlertTriangle className="w-6 h-6" />
                                <h2 className="text-lg font-bold text-midnight-indigo">Xác nhận hủy cuộc họp</h2>
                            </div>
                            <div className="space-y-3 text-left">
                                <p className="text-xs text-slate-blue leading-relaxed">
                                    Hành động này sẽ gửi email thông báo hủy phòng họp tới toàn bộ người tham gia. Bạn không thể hoàn tác hành động này.
                                </p>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Lý do hủy họp (Không bắt buộc)</label>
                                    <textarea
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        placeholder="Nhập lý do hủy..."
                                        rows="3"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button
                                    type="button"
                                    onClick={() => setIsCancelConfirmOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    onClick={handleCancelMeeting}
                                    className="px-5 py-2 bg-red-600 hover:bg-red-750 text-white rounded-xl text-xs font-bold"
                                >
                                    Hủy cuộc họp
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* M8 — Thêm người tham dự: 1 modal, 3 tab (Nội bộ / Import Excel / Khách ngoài) */}
            {meeting && (
                <AddParticipantsModal
                    meetingId={meeting.id}
                    open={isImportModalOpen || showAddGuestModal}
                    initialTab={showAddGuestModal ? 'external' : 'manual'}
                    canAddExternal={canAddExternalParticipant}
                    onClose={() => { setIsImportModalOpen(false); setShowAddGuestModal(false); }}
                    users={users}
                    onSuccess={(msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4000); fetchMeeting(); }}
                />
            )}
            {/* MODAL: Participant Detail */}
            <ParticipantDetailModal
                isOpen={detailModalState.isOpen}
                onClose={() => setDetailModalState({ isOpen: false, participant: null, isExternal: false })}
                participant={detailModalState.participant}
                isExternal={detailModalState.isExternal}
            />

            {/* Participant Conflict Confirmation Modal (409 PARTICIPANT_TIME_CONFLICT_WARNING) */}
            {participantConflictModal.isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-xl border border-amber-200 max-w-md w-full overflow-hidden"
                    >
                        <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                            <div>
                                <h3 className="font-bold text-amber-900 text-sm">Cảnh báo trùng lịch người tham gia</h3>
                                <p className="text-xs text-amber-700 mt-0.5">Khung giờ mới trùng với lịch họp của một số người tham gia.</p>
                            </div>
                        </div>

                        <div className="p-6 space-y-3 max-h-60 overflow-y-auto">
                            {participantConflictModal.conflicts.map((c, idx) => (
                                <div key={idx} className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-sm">
                                    <span className="font-semibold text-midnight-indigo">{c.fullName}</span>
                                    {c.overlappingMeetings?.map((m, i) => (
                                        <p key={i} className="text-xs text-slate-blue mt-1">
                                            Trùng với: <span className="font-medium">"{m.title}"</span>
                                            {' '}({new Date(m.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} – {new Date(m.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                                        </p>
                                    ))}
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t border-platinum-tint flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setParticipantConflictModal({ isOpen: false, conflicts: [], pendingPayload: null })}
                                className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const { startISO, endISO } = participantConflictModal.pendingPayload;
                                    setParticipantConflictModal({ isOpen: false, conflicts: [], pendingPayload: null });
                                    await doSaveEdit(startISO, endISO, { overrideParticipantConflict: true });
                                }}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                            >
                                Vẫn đổi lịch
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Room Capacity Warning Modal (422 ROOM_CAPACITY_WARNING) */}
            {roomCapacityModal.isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-xl border border-amber-200 max-w-md w-full overflow-hidden"
                    >
                        <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                            <div>
                                <h3 className="font-bold text-amber-900 text-sm">Cảnh báo sức chứa phòng</h3>
                                <p className="text-xs text-amber-700 mt-0.5">{roomCapacityModal.message}</p>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-platinum-tint flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRoomCapacityModal({ isOpen: false, message: '', pendingPayload: null })}
                                className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const { startISO, endISO } = roomCapacityModal.pendingPayload;
                                    setRoomCapacityModal({ isOpen: false, message: '', pendingPayload: null });
                                    await doSaveEdit(startISO, endISO, { confirmCapacityOverride: true });
                                }}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                            >
                                Vẫn đổi phòng
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    );
};

export default ManagerMeetingDetail;
