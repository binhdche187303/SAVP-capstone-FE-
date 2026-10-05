import { AlertTriangle, ArrowLeft, Building, Calendar, CalendarPlus, Check, CheckCircle2, ChevronRight, ChevronDown, Clock, Download, FileSpreadsheet, HelpCircle, Info, Mic, Paperclip, Plus, Search, ShieldAlert, Trash2, Upload, Users, Video, X, Edit2, GripVertical, Wrench } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';

import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from '../../utils/toast';

import { getAvailableRooms, createMeeting, addRecordingConfig, replaceAgendas, uploadAgendaAttachment, getUsers, getUserById, getUserPublicProfile } from '../../service/employeeServices';
import { getDepartments, getDepartmentMembers } from '../../service/businessAdminServices';
import * as XLSX from 'xlsx';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { vi } from 'date-fns/locale/vi';
import TimePicker from '../../components/common/TimePicker';

const getInitialTimes = () => {
    const now = new Date();
    const startDate = new Date(now.getTime() + 5 * 60 * 1000);

    const sh = String(startDate.getHours()).padStart(2, '0');
    const sm = String(startDate.getMinutes()).padStart(2, '0');
    const start = `${sh}:${sm}`;

    // End time = start time + 1 giờ
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    let eh = String(endDate.getHours()).padStart(2, '0');
    let em = String(endDate.getMinutes()).padStart(2, '0');

    if (endDate.getDate() !== startDate.getDate()) {
        eh = '23';
        em = '59';
    }

    const end = `${eh}:${em}`;

    return { start, end };
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

const BookMeeting = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);

    // Step state
    const [currentStep, setCurrentStep] = useState(1);

    // Form states
    const initialTimes = getInitialTimes();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [meetingType, setMeetingType] = useState('normal');
    const [meetingMode, setMeetingMode] = useState('offline');
    const [hostId, setHostId] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [dateRange, setDateRange] = useState([new Date(), new Date()]);
    const [startDate, endDate] = dateRange;

    const formatDateToLocal = (dateObj) => {
        if (!dateObj || !isValidDate(dateObj)) return '';
        const d = new Date(dateObj);
        const m = d.getMonth() + 1;
        const day = d.getDate();
        return `${d.getFullYear()}-${m < 10 ? '0'+m : m}-${day < 10 ? '0'+day : day}`;
    };
    const startStr = formatDateToLocal(startDate);
    const endStr = formatDateToLocal(endDate || startDate);
    const [startTime, setStartTime] = useState(initialTimes.start);
    const [endTime, setEndTime] = useState(initialTimes.end);
    const [expectedAttendeeCount, setExpectedAttendeeCount] = useState('');
    const [capacityOverrideConfirmed, setCapacityOverrideConfirmed] = useState(false);
    const [recordingEnabled, setRecordingEnabled] = useState(false);
    const [audioRecordingEnabled, setAudioRecordingEnabled] = useState(false);
    const [pdpaConsent, setPdpaConsent] = useState(false);

    // Participants states (Internal and External)
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
    const [externalParticipants, setExternalParticipants] = useState([]);

    // Agenda states
    const [agendaList, setAgendaList] = useState([]);
    const [newAgendaTitle, setNewAgendaTitle] = useState('');
    const [newAgendaDuration, setNewAgendaDuration] = useState('15');
    const [newAgendaFile, setNewAgendaFile] = useState(null);
    const [agendaInputError, setAgendaInputError] = useState('');
    const [draggedAgendaIndex, setDraggedAgendaIndex] = useState(null);

    // Data lists
    const [departments, setDepartments] = useState([]);
    const [usersById, setUsersById] = useState({});
    const users = useMemo(() => Object.values(usersById), [usersById]);
    // BE không trả departmentId trên user list/search (UserListItemDto,
    // DepartmentMemberItemDto chỉ có id/fullName/email/employeeCode[...]).
    // Khi biết trước phòng ban của kết quả (nạp mặc định theo phòng ban của
    // currentUser, hoặc "Thêm cả phòng ban"), gắn tạm _departmentId để hiển thị
    // badge đúng; nguồn không rõ phòng ban (search tự do) thì để trống, không suy đoán.
    const mergeUsers = (list, departmentId) => {
        if (!Array.isArray(list) || list.length === 0) return;
        setUsersById(prev => {
            const next = { ...prev };
            list.forEach(u => {
                if (!u || !u.id) return;
                const existing = next[u.id];
                next[u.id] = {
                    ...existing,
                    ...u,
                    _departmentId: u.departmentId || u.department_id || u._departmentId || departmentId || existing?._departmentId || null,
                };
            });
            return next;
        });
    };
    const [loadingData, setLoadingData] = useState(true);

    // Search and availability states
    const [availableRooms, setAvailableRooms] = useState([]);
    const [searchingRooms, setSearchingRooms] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);

    // Feedback states
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [conflictInfo, setConflictInfo] = useState(null);
    const [faultyEquipmentWarning, setFaultyEquipmentWarning] = useState(null);
    const [alternativeRooms, setAlternativeRooms] = useState([]);

    useEffect(() => {
        if (errorMsg) {
            toast.error(errorMsg);
            setErrorMsg('');
        }
    }, [errorMsg]);

    useEffect(() => {
        if (successMessage) {
            toast.success(successMessage);
            setSuccessMessage('');
        }
    }, [successMessage]);

    // Participant search states (server-side, debounced)
    const [searchEmail, setSearchEmail] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [defaultSuggestions, setDefaultSuggestions] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const searchRequestRef = useRef(0);

    // Bulk add by department states
    const [addingDepartment, setAddingDepartment] = useState(false);

    // Import modal states
    const [showImportModal, setShowImportModal] = useState(false);
    const [importMethod, setImportMethod] = useState('manual'); // 'manual' or 'excel'
    const [manualEmails, setManualEmails] = useState('');
    const [manualType, setManualType] = useState('auto'); // 'auto', 'internal', 'external'
    const [importPreview, setImportPreview] = useState([]);
    const [importProcessing, setImportProcessing] = useState(false);

    // User detail modal states
    const [selectedDetailUserId, setSelectedDetailUserId] = useState(null);
    const [userDetail, setUserDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detailError, setDetailError] = useState(null);

    const handleOpenUserDetail = async (userId) => {
        setSelectedDetailUserId(userId);
        setUserDetail(null);
        setLoadingDetail(true);
        setDetailError(null);
        try {
            const res = await getUserPublicProfile(userId);
            if (res?.success && res.data) {
                setUserDetail(res.data);
            } else {
                setDetailError(res?.message || 'Không thể tải thông tin nhân viên.');
            }
        } catch (err) {
            console.error('Error fetching user details', err);
            setDetailError(err?.error?.message || 'Không thể kết nối đến máy chủ.');
        } finally {
            setLoadingDetail(false);
        }
    };

    // Lock body scroll when import modal is open
    useEffect(() => {
        if (showImportModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [showImportModal]);

    useEffect(() => {
        let parsedUser = null;
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                parsedUser = JSON.parse(userStr);
                setCurrentUser(parsedUser);
            }
        } catch (err) {
            console.error('Failed to load user info', err);
        }

        const fetchData = async () => {
            try {
                const deptsRes = await getDepartments().catch(err => {
                    console.error('Failed to load departments', err);
                    return { success: false };
                });

                if (deptsRes?.success) {
                    setDepartments(deptsRes.data || []);
                } else {
                    setDepartments([
                        { id: 'dept-1', department_code: 'IT', department_name: 'Phòng Công nghệ thông tin' },
                        { id: 'dept-2', department_code: 'HR', department_name: 'Phòng Nhân sự' },
                        { id: 'dept-3', department_code: 'SALES', department_name: 'Phòng Kinh doanh' },
                        { id: 'dept-4', department_code: 'RND', department_name: 'Phòng Nghiên cứu & Phát triển' }
                    ]);
                }

                // Gợi ý mặc định khi ô tìm kiếm còn trống: ưu tiên nạp cả phòng ban
                // của người đặt lịch (GET /departments/:id/members), fallback lấy
                // một batch nhỏ toàn công ty nếu user chưa thuộc phòng ban nào.
                // Không còn tải trước 1000 user như trước (tốn băng thông, không scale).
                const deptId = parsedUser?.departmentId || parsedUser?.department_id;
                let suggestions = [];
                let suggestionsDeptId = null;
                if (deptId) {
                    try {
                        const membersRes = await getDepartmentMembers(deptId);
                        if (membersRes?.success) {
                            suggestions = membersRes.data || [];
                            suggestionsDeptId = deptId;
                        }
                    } catch (err) {
                        console.error('Failed to load default department members', err);
                    }
                }
                if (suggestions.length === 0) {
                    try {
                        const usersRes = await getUsers({ limit: 30, meetingEligibleOnly: true });
                        if (usersRes?.success) suggestions = usersRes.data || [];
                        suggestionsDeptId = null;
                    } catch (err) {
                        console.error('Failed to load default users', err);
                    }
                }
                mergeUsers(suggestions, suggestionsDeptId);
                setDefaultSuggestions(suggestions);
                setSearchResults(suggestions);
            } catch (err) {
                console.error('Error fetching initial data', err);
                setErrorMsg('Không thể tải danh sách phòng ban hoặc nhân sự.');
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();
    }, []);

    // Tìm kiếm người tham dự phía server (debounce 300ms), có bảo vệ chống
    // race-condition khi gõ nhanh (chỉ áp dụng kết quả của request mới nhất).
    useEffect(() => {
        const query = searchEmail.trim();
        if (!query) {
            setSearchResults(defaultSuggestions);
            setSearchingUsers(false);
            return;
        }

        const requestId = ++searchRequestRef.current;
        setSearchingUsers(true);
        const timer = setTimeout(async () => {
            try {
                const res = await getUsers({ search: query, limit: 20, meetingEligibleOnly: true });
                if (requestId !== searchRequestRef.current) return; // Kết quả cũ, bỏ qua
                if (res?.success) {
                    const list = res.data || [];
                    mergeUsers(list);
                    setSearchResults(list);
                } else {
                    setSearchResults([]);
                }
            } catch (err) {
                if (requestId === searchRequestRef.current) {
                    console.error('Failed to search users', err);
                    setSearchResults([]);
                }
            } finally {
                if (requestId === searchRequestRef.current) setSearchingUsers(false);
            }
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchEmail, defaultSuggestions]);

    const selectedRoom = availableRooms.find(r => (r.id || r.roomId) === selectedRoomId);
    const roomHasCamera = !!(selectedRoom?.hasCamera || selectedRoom?.has_camera);
    const roomHasMic = !!(selectedRoom?.hasMicrophone || selectedRoom?.has_microphone);
    const roomAllowsRecording = roomHasCamera || roomHasMic;

    const getMeetingDurationMinutes = () => {
        if (!startStr || !endStr || !startTime || !endTime) return 0;
        const start = new Date(`${startStr}T${startTime}:00`).getTime();
        const end = new Date(`${endStr}T${endTime}:00`).getTime();
        return Math.max(0, Math.floor((end - start) / 60000));
    };

    const meetingDuration = getMeetingDurationMinutes();
    const agendaTotalDuration = agendaList.reduce((acc, curr) => acc + Number(curr.durationMin), 0);

    const actualAttendeeCount = selectedParticipantIds.length + externalParticipants.length + 1; // +1 cho host
    const capacityExceeded = !!selectedRoom && (
        (!!expectedAttendeeCount && Number(expectedAttendeeCount) > selectedRoom.capacity)
        || actualAttendeeCount > selectedRoom.capacity
    );

    const buildIsoRange = () => {
        return {
            isoStart: new Date(`${startStr || new Date().toLocaleDateString('en-CA')}T${startTime}:00`).toISOString(),
            isoEnd: new Date(`${endStr || startStr || new Date().toLocaleDateString('en-CA')}T${endTime}:00`).toISOString(),
        };
    };

    // Kiểm tra khung ngày/giờ hợp lệ (dùng chung cho: tìm phòng, chuyển sang bước
    // tùy chỉnh, và submit) — tránh việc mỗi nơi tự chép lại logic rồi lệch nhau,
    // vốn là nguyên nhân khiến người dùng sửa giờ về quá khứ sau khi đã suggest
    // phòng vẫn lọt qua được tới bước tùy chỉnh cuộc họp.
    const getTimeRangeError = () => {
        if (!startDate || !isValidDate(startDate)) {
            return 'Khung ngày họp bắt đầu không hợp lệ.';
        }
        if (!endDate || !isValidDate(endDate)) {
            return 'Khung ngày họp kết thúc không hợp lệ.';
        }
        if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
            return 'Giờ bắt đầu cuộc họp không hợp lệ.';
        }
        if (!endTime || !/^\d{2}:\d{2}$/.test(endTime)) {
            return 'Giờ kết thúc cuộc họp không hợp lệ.';
        }

        const now = new Date();
        const selectedStart = new Date(`${startStr}T${startTime}:00`);
        if (selectedStart < now) {
            return 'Thời gian bắt đầu không được trong quá khứ.';
        }

        const selectedEnd = new Date(`${endStr}T${endTime}:00`);
        if (selectedEnd <= selectedStart) {
            return 'Thời gian kết thúc phải sau thời gian bắt đầu.';
        }

        return null;
    };

    const handleSearchRooms = async () => {
        setSearchingRooms(true);
        setErrorMsg('');

        const timeError = getTimeRangeError();
        if (timeError) {
            setErrorMsg(timeError);
            setSearchingRooms(false);
            return;
        }

        try {
            const { isoStart, isoEnd } = buildIsoRange();
            const params = { startTime: isoStart, endTime: isoEnd };
            if (expectedAttendeeCount) params.minCapacity = expectedAttendeeCount;

            const res = await getAvailableRooms(params);
            if (res?.success) {
                setAvailableRooms(res.data || []);
            } else {
                setAvailableRooms([]);
                setErrorMsg(res?.message || 'Không thể tải danh sách phòng trống.');
            }
        } catch (err) {
            console.error('Error fetching available rooms', err);
            setAvailableRooms([]);
            setErrorMsg(err?.error?.message || 'Không thể tải danh sách phòng trống hiện tại.');
        } finally {
            setSearchPerformed(true);
            setSearchingRooms(false);
        }
    };

    // Người dùng sửa giờ/ngày/số người sau khi đã suggest phòng: kết quả suggest cũ
    // (availableRooms) không còn đáng tin (phòng có thể không còn trống, hoặc giờ mới
    // có thể không hợp lệ/đã ở quá khứ) — phải xoá luôn danh sách và bắt tìm lại,
    // không chỉ bỏ chọn phòng, để tránh việc chọn nhầm 1 thẻ phòng cũ rồi lọt qua bước 2.
    const invalidateRoomSuggestions = () => {
        setSelectedRoomId('');
        setAvailableRooms([]);
        setSearchPerformed(false);
    };

    const handleContinueToStep2 = () => {
        const timeError = getTimeRangeError();
        if (timeError) {
            invalidateRoomSuggestions();
            setErrorMsg(timeError);
            return;
        }
        if (!selectedRoomId) return;
        setCurrentStep(2);
    };

    const handleSelectRoom = (room) => {
        setSelectedRoomId(room.id || room.roomId);
        setCapacityOverrideConfirmed(false);
        setRecordingEnabled(false);
        setAudioRecordingEnabled(false);
        setPdpaConsent(false);
    };

    const handleAddAgenda = () => {
        if (!newAgendaTitle.trim()) {
            setAgendaInputError('Vui lòng nhập tên chương trình họp.');
            return;
        }
        const duration = Number(newAgendaDuration);
        if (isNaN(duration) || duration <= 0) {
            setAgendaInputError('Vui lòng nhập thời lượng chương trình hợp lệ (lớn hơn 0).');
            return;
        }

        if (agendaTotalDuration + duration > meetingDuration) {
            setAgendaInputError(`Tổng thời lượng chương trình họp (${agendaTotalDuration + duration} phút) vượt quá thời lượng cuộc họp (${meetingDuration} phút).`);
            return;
        }

        setAgendaInputError('');
        setErrorMsg('');
        setAgendaList(prev => [
            ...prev,
            {
                title: newAgendaTitle,
                durationMin: duration,
                file: newAgendaFile ? newAgendaFile : null
            }
        ]);
        setNewAgendaTitle('');
        setNewAgendaFile(null);
    };

    const handleRemoveAgenda = (index) => {
        setAgendaList(prev => prev.filter((_, i) => i !== index));
    };

    const handleEditAgenda = (index) => {
        const item = agendaList[index];
        setNewAgendaTitle(item.title);
        setNewAgendaDuration(item.durationMin.toString());
        setNewAgendaFile(item.file);
        handleRemoveAgenda(index);
    };

    const toggleParticipant = async (userId) => {
        const isAdding = !selectedParticipantIds.includes(userId);
        
        setSelectedParticipantIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );

        if (isAdding) {
            const user = usersById[userId];
            if (!user?._departmentId) {
                try {
                    const res = await getUserPublicProfile(userId);
                    if (res?.success && res.data) {
                        const detail = res.data;
                        const deptId = detail.departmentId || detail.department_id || detail.department?.id;
                        if (deptId) {
                            setUsersById(prev => {
                                if (!prev[userId]) return prev;
                                return {
                                    ...prev,
                                    [userId]: {
                                        ...prev[userId],
                                        _departmentId: deptId
                                    }
                                };
                            });
                        }
                    }
                } catch (err) {
                    console.error('Failed to load user department details', err);
                }
            }
        }
    };

    // BE (UserListItemDto/DepartmentMemberItemDto) không trả departmentId trên user
    // — chỉ suy ra được phòng ban khi user đến từ một nguồn đã biết phòng ban
    // (_departmentId gắn trong mergeUsers). DepartmentResponseDto dùng camelCase
    // departmentCode/departmentName (trước đây đọc nhầm department_code/department_name
    // nên badge luôn rỗng).
    const getUserDeptCode = (user) => {
        if (!user?._departmentId) return '';
        const dept = departments.find(d => d.id === user._departmentId);
        return dept ? (dept.departmentName || dept.departmentCode) : '';
    };

    // Gợi ý hiển thị trong dropdown tìm kiếm: kết hợp lọc client-side tức thì và kết quả API từ server
    const visibleSuggestions = useMemo(() => {
        const query = searchEmail.trim().toLowerCase();
        if (!query) {
            return defaultSuggestions.filter(u => u.id !== currentUser?.id);
        }

        // Lọc ngay lập tức trên danh sách cache nội bộ (client-side)
        const clientFiltered = users.filter(u => {
            if (u.id === currentUser?.id) return false;
            const fullName = (u.fullName || u.full_name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const code = (u.employeeCode || u.employee_code || '').toLowerCase();
            return fullName.includes(query) || email.includes(query) || code.includes(query);
        });

        // Gộp kết quả trả về từ API (searchResults)
        const apiResults = searchResults.filter(u => u.id !== currentUser?.id);

        // Hợp nhất hai danh sách và loại bỏ trùng lặp
        const mergedMap = {};
        clientFiltered.forEach(u => { mergedMap[u.id] = u; });
        apiResults.forEach(u => { mergedMap[u.id] = u; });

        return Object.values(mergedMap);
    }, [searchEmail, defaultSuggestions, searchResults, users, currentUser]);

    const visibleDepartments = useMemo(() => {
        if (!searchEmail.trim()) return [];
        const q = searchEmail.trim().toLowerCase();

        // Remove prefix "phòng" or "phong" to match the core department name
        const qWithoutPhong = q.replace(/^phòng\s+|^phong\s+/i, '').trim();

        // If user explicitly types just "phòng" or "phong", show all departments
        if (q === 'phòng' || q === 'phong') {
            return departments;
        }

        return departments.filter(d => {
            const name = (d.departmentName || d.department_name || '').toLowerCase();
            const code = (d.departmentCode || d.department_code || '').toLowerCase();
            return name.includes(q) || code.includes(q) || (qWithoutPhong && name.includes(qWithoutPhong));
        });
    }, [searchEmail, departments]);

    const handleAddDepartment = async (deptId) => {
        if (!deptId) return;
        setAddingDepartment(true);
        setErrorMsg('');
        try {
            const res = await getDepartmentMembers(deptId);
            if (res?.success) {
                const members = res.data || [];
                mergeUsers(members, deptId);

                const dept = departments.find(d => d.id === deptId);
                const deptName = dept?.departmentName || dept?.department_name || 'đã chọn';

                const newIds = [...selectedParticipantIds];
                let addedCount = 0;
                members.forEach(m => {
                    if (m.id !== currentUser?.id && !newIds.includes(m.id)) {
                        newIds.push(m.id);
                        addedCount++;
                    }
                });
                const skippedCount = members.length - addedCount;
                setSelectedParticipantIds(newIds);

                setSuccessMessage(
                    addedCount === 0
                        ? `Toàn bộ nhân viên phòng "${deptName}" đã có trong danh sách.`
                        : skippedCount > 0
                            ? `Đã thêm ${addedCount} nhân viên phòng "${deptName}" (bỏ qua ${skippedCount} người đã có trong danh sách).`
                            : `Đã thêm ${addedCount} nhân viên phòng "${deptName}".`
                );
                setTimeout(() => setSuccessMessage(''), 5000);
            } else {
                setErrorMsg(res?.message || 'Không thể tải danh sách nhân viên phòng ban.');
            }
        } catch (err) {
            console.error('Failed to load department members', err);
            setErrorMsg(err?.error?.message || 'Không thể tải danh sách nhân viên phòng ban.');
        } finally {
            setAddingDepartment(false);
        }
    };

    // --- Import guest actions ---
    // Bộ cột khớp CHÍNH XÁC template chuẩn của BE (IMPORT_PARTICIPANTS_COLUMNS trong
    // meetings/constants/import-participants.constants.ts) để người dùng chỉ cần học 1
    // định dạng file duy nhất: file tải ở đây upload thẳng vào modal "Thêm người tham dự"
    // của Meeting Detail được và ngược lại. Đổi cột ở đây thì PHẢI đổi cả bên BE.
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Tra cứu nhân viên nội bộ theo email/mã nhân viên: ưu tiên tìm trong dữ liệu
    // đã có sẵn (usersById), nếu chưa có thì gọi GET /users?search= (server search
    // theo tên/email) — không còn phụ thuộc vào việc tải sẵn toàn bộ danh sách nhân viên.
    //
    // Trả về { user, ineligible }:
    //   - user: nhân viên được phép mời họp (đã lọc meetingEligibleOnly).
    //   - ineligible: true khi email/mã KHỚP một tài khoản có thật nhưng là
    //     Business Admin / System Admin — BE chặn thẳng cả POST /meetings với
    //     PARTICIPANT_ROLE_NOT_ALLOWED, nên phải báo lỗi ngay ở bước preview thay vì
    //     để người dùng bấm "Đặt lịch" rồi hỏng cả form. Chỉ tra thêm lượt thứ 2 khi
    //     dòng đó thực sự mơ hồ (checkIneligible) để không tốn request cho khách ngoài.
    const resolveInternalUser = async (email, employeeCode, checkIneligible = false) => {
        const emailKey = (email || '').trim().toLowerCase();
        const codeKey = (employeeCode || '').trim();
        const matchIn = (list) => list.find(u =>
            (emailKey && (u.email || '').toLowerCase() === emailKey)
            || (codeKey && (u.employeeCode || u.employee_code) === codeKey)
        );

        const cached = matchIn(users);
        if (cached) return { user: cached, ineligible: false };

        const query = email || employeeCode;
        if (!query) return { user: null, ineligible: false };

        let found = null;
        try {
            const res = await getUsers({ search: query, limit: 5, meetingEligibleOnly: true });
            if (res?.success) {
                const list = res.data || [];
                mergeUsers(list);
                found = matchIn(list);
            }
        } catch (err) {
            console.error('Failed to resolve internal user', query, err);
        }
        if (found) return { user: found, ineligible: false };

        if (checkIneligible) {
            try {
                const res = await getUsers({ search: query, limit: 5 });
                if (res?.success && matchIn(res.data || [])) {
                    return { user: null, ineligible: true };
                }
            } catch (err) {
                console.error('Failed to check ineligible account', query, err);
            }
        }
        return { user: null, ineligible: false };
    };

    const downloadSampleExcel = () => {
        const data = [
            { 'Email': 'nhanvien@smrmpts.com', 'Mã nhân viên': '', 'Họ và tên': '', 'Tổ chức/Công ty': '', 'Số điện thoại': '' },
            { 'Email': '', 'Mã nhân viên': 'EMP0123', 'Họ và tên': '', 'Tổ chức/Công ty': '', 'Số điện thoại': '' },
            { 'Email': 'khach@doitac.com', 'Mã nhân viên': '', 'Họ và tên': 'Nguyễn Văn B', 'Tổ chức/Công ty': 'Công ty ABC', 'Số điện thoại': '0900000000' }
        ];
        const headers = ['Email', 'Mã nhân viên', 'Họ và tên', 'Tổ chức/Công ty', 'Số điện thoại'];
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });

        ws['!cols'] = [
            { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 16 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');

        const guideRows = [
            ['Cột', 'Mô tả'],
            ['Email', 'Nhân viên: định danh chính (ưu tiên). Khách ngoài: email liên hệ (bắt buộc)'],
            ['Mã nhân viên', 'Nhân viên: tùy chọn (dùng khi không có email)'],
            ['Họ và tên', 'Khách ngoài: bắt buộc'],
            ['Tổ chức/Công ty', 'Khách ngoài: tùy chọn'],
            ['Số điện thoại', 'Khách ngoài: tùy chọn'],
            ['Cách nhận diện', 'Hệ thống tự tra Email/Mã nhân viên: khớp một tài khoản trong hệ thống = nhân viên nội bộ; không khớp = khách ngoài (bắt buộc điền Họ và tên).'],
            ['Lưu ý', 'Chỉ tài khoản vai trò Nhân viên (Employee) hoặc Quản lý (Manager) mới được mời họp. Tài khoản Business Admin / System Admin sẽ bị từ chối.'],
        ];
        const guideWs = XLSX.utils.aoa_to_sheet(guideRows);
        guideWs['!cols'] = [{ wch: 20 }, { wch: 72 }];
        XLSX.utils.book_append_sheet(wb, guideWs, 'HuongDan');

        XLSX.writeFile(wb, 'SmarTracking_Template_Them_Danh_Sach.xlsx');
    };

    const handleExcelImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            const getCell = (row, key) => (key ? String(row[key] ?? '').trim() : '');

            const rawRows = rows
                .map((row, index) => {
                    const keys = Object.keys(row);
                    const findKey = (name) => keys.find(k => k.toLowerCase().trim() === name.toLowerCase());
                    return {
                        rowNumber: index + 2,
                        email: getCell(row, findKey('Email')),
                        employeeCode: getCell(row, findKey('Mã nhân viên')),
                        fullName: getCell(row, findKey('Họ và tên')),
                        organizationName: getCell(row, findKey('Tổ chức/Công ty')) || getCell(row, findKey('Phòng ban/Tổ chức')),
                        phoneNumber: getCell(row, findKey('Số điện thoại')),
                    };
                })
                .filter(r => r.email || r.employeeCode || r.fullName || r.organizationName || r.phoneNumber);

            if (rawRows.length === 0) {
                toast.error('Tệp không có dữ liệu hoặc sai cấu trúc cột. Vui lòng tải lại file mẫu.');
                return;
            }

            setImportProcessing(true);
            const parsed = await Promise.all(rawRows.map(async (r) => {
                let error = '';
                if (!r.email && !r.employeeCode) {
                    error = `Dòng ${r.rowNumber}: Cần có Email hoặc Mã nhân viên`;
                } else if (r.email && !EMAIL_REGEX.test(r.email)) {
                    error = `Dòng ${r.rowNumber}: Email "${r.email}" sai định dạng`;
                }

                let resolvedUserId = null;
                let type = 'external';

                if (!error) {
                    const { user: found, ineligible } = await resolveInternalUser(
                        r.email, r.employeeCode, !r.fullName,
                    );
                    if (found) {
                        resolvedUserId = found.id;
                        type = 'internal';
                    } else if (ineligible) {
                        error = `Dòng ${r.rowNumber}: Tài khoản quản trị (Business/System Admin) không được mời tham dự cuộc họp`;
                    } else if (!r.fullName) {
                        error = `Dòng ${r.rowNumber}: Khách ngoài hệ thống cần nhập Họ và tên`;
                    }
                }

                return { ...r, type, error, resolvedUserId };
            }));

            // Phát hiện trùng trong cùng file
            const seenInternal = new Set();
            const seenExternal = new Set();
            parsed.forEach(item => {
                if (item.error) return;
                if (item.type === 'internal' && item.resolvedUserId) {
                    if (seenInternal.has(item.resolvedUserId)) {
                        item.error = `Dòng ${item.rowNumber}: Trùng với một dòng khác trong file`;
                    } else {
                        seenInternal.add(item.resolvedUserId);
                    }
                } else if (item.type === 'external' && item.email) {
                    if (seenExternal.has(item.email)) {
                        item.error = `Dòng ${item.rowNumber}: Trùng email với một dòng khác trong file`;
                    } else {
                        seenExternal.add(item.email);
                    }
                }
            });

            setImportPreview(parsed);
        } catch (err) {
            console.error('Failed to parse excel file', err);
            toast.error('Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
        } finally {
            setImportProcessing(false);
        }
    };

    const handleManualImport = async () => {
        if (!manualEmails.trim()) return;
        const emailList = manualEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e !== '');

        setImportProcessing(true);
        try {
            const parsed = await Promise.all(emailList.map(async (email, index) => {
                const rowNumber = index + 1;
                let error = '';

                if (!email.includes('@')) {
                    error = `Dòng ${rowNumber}: Email "${email}" thiếu ký tự '@'`;
                } else if (!EMAIL_REGEX.test(email)) {
                    error = `Dòng ${rowNumber}: Email "${email}" sai định dạng`;
                }

                let type = 'auto';
                let resolvedUserId = null;

                if (!error) {
                    const { user: found, ineligible } = await resolveInternalUser(email, '', true);
                    if (found) {
                        resolvedUserId = found.id;
                        type = 'internal';
                    } else if (ineligible) {
                        error = `Dòng ${rowNumber}: Tài khoản quản trị (Business/System Admin) không được mời tham dự cuộc họp`;
                    } else {
                        type = 'external';
                    }
                }

                return { rowNumber, email, employeeCode: '', fullName: '', organizationName: '', phoneNumber: '', type, error, resolvedUserId };
            }));

            setImportPreview(parsed);
        } finally {
            setImportProcessing(false);
        }
    };

    const handleConfirmImport = () => {
        const hasErrors = importPreview.some(item => item.error !== '');
        if (hasErrors) {
            toast.warning('Vui lòng loại bỏ hoặc sửa các dòng bị lỗi trước khi xác nhận.');
            return;
        }

        let internalMatchedCount = 0;
        let externalAddedCount = 0;

        const newSelectedIds = [...selectedParticipantIds];
        const newExternal = [...externalParticipants];

        importPreview.forEach(item => {
            if (item.type === 'internal') {
                if (item.resolvedUserId) {
                    if (!newSelectedIds.includes(item.resolvedUserId)) {
                        newSelectedIds.push(item.resolvedUserId);
                    }
                    internalMatchedCount++;
                } else {
                    // This case should not happen because we already validated and set error if not found.
                    console.warn(`Internal row ${item.email || item.employeeCode} missing resolvedUserId.`);
                }
            } else {
                if (!newExternal.some(ex => ex.email.toLowerCase() === item.email.toLowerCase())) {
                    newExternal.push({
                        id: `ext-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        email: item.email,
                        fullName: item.fullName || item.email.split('@')[0],
                        ...(item.organizationName ? { organization: item.organizationName } : {}),
                        isExternal: true
                    });
                }
                externalAddedCount++;
            }
        });

        setSelectedParticipantIds(newSelectedIds);
        setExternalParticipants(newExternal);
        setShowImportModal(false);
        setImportPreview([]);
        setManualEmails("");

        setSuccessMessage(`Đã import thành công: chọn ${internalMatchedCount} nhân viên công ty và thêm ${externalAddedCount} khách ngoài.`);
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMessage('');
        setConflictInfo(null);
        setAlternativeRooms([]);

        const timeError = getTimeRangeError();
        if (timeError) {
            setErrorMsg(timeError);
            return;
        }

        if (!title.trim()) {
            setErrorMsg('Vui lòng nhập tiêu đề cuộc họp.');
            return;
        }
        if (!selectedRoomId) {
            setErrorMsg('Vui lòng chọn phòng họp.');
            return;
        }

        if (selectedParticipantIds.length === 0 && externalParticipants.length === 0) {
            setErrorMsg('Vui lòng thêm ít nhất 1 người tham gia vào cuộc họp.');
            return;
        }

        if (capacityExceeded && !capacityOverrideConfirmed) {
            const countLabel = expectedAttendeeCount && Number(expectedAttendeeCount) > actualAttendeeCount
                ? expectedAttendeeCount
                : actualAttendeeCount;
            setErrorMsg(`Số người dự kiến (${countLabel}) vượt quá sức chứa phòng "${selectedRoom?.roomName || selectedRoom?.room_name}" (${selectedRoom?.capacity} người). Vui lòng tick xác nhận vượt sức chứa hoặc chọn phòng khác.`);
            return;
        }

        // PDPA check
        if ((recordingEnabled || audioRecordingEnabled) && !pdpaConsent) {
            setErrorMsg('Bạn phải đồng ý với cam kết bảo vệ dữ liệu cá nhân (PDPA) khi bật tính năng ghi âm hoặc ghi hình.');
            return;
        }

        const { isoStart, isoEnd } = buildIsoRange();

        const payload = {
            title,
            startTime: isoStart,
            endTime: isoEnd,
            roomId: selectedRoomId,
            meetingType,
            meetingMode,
        };
        if (hostId) payload.hostId = hostId;
        if (description.trim()) payload.description = description.trim();
        if (expectedAttendeeCount) payload.expectedAttendeeCount = Number(expectedAttendeeCount);
        if (capacityExceeded && capacityOverrideConfirmed) payload.capacityOverrideConfirmed = true;
        if (selectedParticipantIds.length > 0) payload.participantUserIds = selectedParticipantIds;

        if (externalParticipants.length > 0) {
            payload.externalParticipants = externalParticipants.map(p => ({
                fullName: p.fullName || p.email.split('@')[0],
                email: p.email,
                ...(p.organization ? { organization: p.organization } : {})
            }));
        }

        setSubmitting(true);
        try {
            const res = await createMeeting(payload);
            if (!res?.success) {
                const failure = new Error(res?.message || 'Tạo cuộc họp thất bại.');
                failure.error = { message: res?.message || 'Tạo cuộc họp thất bại.' };
                throw failure;
            }

            const meetingId = res.data?.id;
            const subWarnings = [];

            if (meetingId && (recordingEnabled || audioRecordingEnabled)) {
                try {
                    await addRecordingConfig(meetingId, {
                        enableVideo: recordingEnabled,
                        enableAudio: audioRecordingEnabled,
                        consentRequired: pdpaConsent,
                    });
                } catch (subErr) {
                    console.error('Failed to save recording config', subErr);
                    subWarnings.push('cấu hình ghi âm/ghi hình');
                }
            }

            if (meetingId && agendaList.length > 0) {
                try {
                    const payloadAgendas = agendaList.map(item => ({
                        title: item.title,
                        plannedDurationMinutes: Number(item.durationMin)
                    }));
                    const agendaRes = await replaceAgendas(meetingId, payloadAgendas);

                    if (agendaRes?.success && agendaRes.data?.items) {
                        const savedItems = agendaRes.data.items;
                        for (let i = 0; i < agendaList.length; i++) {
                            if (agendaList[i].file && savedItems[i]) {
                                const formData = new FormData();
                                formData.append('file', agendaList[i].file);
                                try {
                                    await uploadAgendaAttachment(meetingId, savedItems[i].id, formData);
                                } catch (uploadErr) {
                                    console.error('Failed to upload attachment', uploadErr);
                                    subWarnings.push(`file đính kèm cho "${agendaList[i].title}"`);
                                }
                            }
                        }
                    }
                } catch (subErr) {
                    console.error('Failed to save agenda', subErr);
                    subWarnings.push('chương trình họp (agenda)');
                }
            }

            let msg = 'Đăng ký đặt phòng họp thành công! Yêu cầu của bạn đã được gửi tới Quản lý phê duyệt.';
            if (subWarnings.length > 0) {
                msg += ` (Lưu ý: lưu ${subWarnings.join(', ')} thất bại, vui lòng cập nhật lại ở trang chi tiết cuộc họp.)`;
            }

            let homePath = '/employee';
            if (currentUser?.roles) {
                const roles = currentUser.roles.map(r => (typeof r === 'string' ? r : r.roleCode || '').toUpperCase());
                if (roles.includes('SYSTEM_ADMIN') || roles.includes('ADMIN')) homePath = '/system-admin';
                else if (roles.includes('BUSINESS_ADMIN')) homePath = '/business-admin';
                else if (roles.includes('MANAGER')) homePath = '/manager';
            }

            // Clear form and reset
            setTitle('');
            setDescription('');
            setSelectedRoomId('');
            setExpectedAttendeeCount('');
            setCapacityOverrideConfirmed(false);
            setSelectedParticipantIds([]);
            setExternalParticipants([]);
            setSearchEmail('');
            setAgendaList([]);
            setRecordingEnabled(false);
            setAudioRecordingEnabled(false);
            setPdpaConsent(false);
            setCurrentStep(1);
            setSearchPerformed(false);
            setAvailableRooms([]);

            // Redirect to homepage with successMessage state
            navigate(homePath, { state: { successMessage: msg } });
        } catch (err) {
            console.error('Booking failed', err);
            if (err?.error?.code === 'ROOM_HAS_FAULTY_EQUIPMENT') {
                setFaultyEquipmentWarning({
                    faultyEquipments: err.error.details?.faultyEquipments || [],
                    payload: payload
                });
            } else {
                const message = err?.error?.message
                    || 'Rất tiếc, phòng họp này hoặc người tham dự đã bị trùng lịch trong khung giờ được chọn. Vui lòng chọn phòng khác hoặc điều chỉnh khung giờ.';
                setConflictInfo({ message });

                try {
                    const { isoStart, isoEnd } = buildIsoRange();
                    const params = { startTime: isoStart, endTime: isoEnd };
                    if (expectedAttendeeCount) params.minCapacity = expectedAttendeeCount;
                    const altRes = await getAvailableRooms(params);
                    const alts = (altRes?.data || []).filter(r => (r.id || r.roomId) !== selectedRoomId);
                    setAlternativeRooms(alts);
                } catch (altErr) {
                    console.error('Failed to fetch alternative rooms', altErr);
                    setAlternativeRooms([]);
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSelectAlternativeRoom = (roomId) => {
        setSelectedRoomId(roomId);
        setCapacityOverrideConfirmed(false);
        setConflictInfo(null);
        setAlternativeRooms([]);
    };

    const handleConfirmFaultyEquipmentBooking = async () => {
        if (!faultyEquipmentWarning) return;
        const retryPayload = {
            ...faultyEquipmentWarning.payload,
            equipmentWarningConfirmed: true
        };
        setFaultyEquipmentWarning(null);
        setSubmitting(true);
        try {
            const res = await createMeeting(retryPayload);
            if (!res?.success) {
                const failure = new Error(res?.message || 'Tạo cuộc họp thất bại.');
                failure.error = { message: res?.message || 'Tạo cuộc họp thất bại.' };
                throw failure;
            }

            const meetingId = res.data?.id;
            const subWarnings = [];

            if (meetingId && (recordingEnabled || audioRecordingEnabled)) {
                try {
                    await addRecordingConfig(meetingId, {
                        enableVideo: recordingEnabled,
                        enableAudio: audioRecordingEnabled,
                        consentRequired: pdpaConsent,
                    });
                } catch (subErr) {
                    console.error('Failed to save recording config', subErr);
                    subWarnings.push('cấu hình ghi âm/ghi hình');
                }
            }

            if (meetingId && agendaList.length > 0) {
                try {
                    const payloadAgendas = agendaList.map(item => ({
                        title: item.title,
                        plannedDurationMinutes: Number(item.durationMin)
                    }));
                    const agendaRes = await replaceAgendas(meetingId, payloadAgendas);

                    if (agendaRes?.success && agendaRes.data?.items) {
                        const savedItems = agendaRes.data.items;
                        for (let i = 0; i < agendaList.length; i++) {
                            if (agendaList[i].file && savedItems[i]) {
                                const formData = new FormData();
                                formData.append('file', agendaList[i].file);
                                try {
                                    await uploadAgendaAttachment(meetingId, savedItems[i].id, formData);
                                } catch (uploadErr) {
                                    console.error('Failed to upload attachment', uploadErr);
                                    subWarnings.push(`file đính kèm cho "${agendaList[i].title}"`);
                                }
                            }
                        }
                    }
                } catch (subErr) {
                    console.error('Failed to save agenda', subErr);
                    subWarnings.push('chương trình họp (agenda)');
                }
            }

            const isScheduled = res.data?.status === 'scheduled';
            let msg = isScheduled
                ? 'Đặt phòng họp thành công! Lịch họp đã được lên lịch.'
                : 'Đăng ký đặt phòng họp thành công! Yêu cầu của bạn đã được gửi tới Quản lý phê duyệt.';
            if (subWarnings.length > 0) {
                msg += ` (Lưu ý: lưu ${subWarnings.join(', ')} thất bại, vui lòng cập nhật lại ở trang chi tiết cuộc họp.)`;
            }

            let homePath = '/employee';
            if (currentUser?.roles) {
                const roles = currentUser.roles.map(r => (typeof r === 'string' ? r : r.roleCode || '').toUpperCase());
                if (roles.includes('SYSTEM_ADMIN') || roles.includes('ADMIN')) homePath = '/system-admin';
                else if (roles.includes('BUSINESS_ADMIN')) homePath = '/business-admin';
                else if (roles.includes('MANAGER')) homePath = '/manager';
            }

            // Clear form and reset
            setTitle('');
            setDescription('');
            setSelectedRoomId('');
            setExpectedAttendeeCount('');
            setCapacityOverrideConfirmed(false);
            setSelectedParticipantIds([]);
            setExternalParticipants([]);
            setSearchEmail('');
            setAgendaList([]);
            setRecordingEnabled(false);
            setAudioRecordingEnabled(false);
            setPdpaConsent(false);
            setCurrentStep(1);
            setSearchPerformed(false);
            setAvailableRooms([]);

            navigate(homePath, { state: { successMessage: msg } });
        } catch (err) {
            console.error('Booking failed on retry', err);
            const message = err?.error?.message || 'Tạo cuộc họp thất bại.';
            setConflictInfo({ message });
        } finally {
            setSubmitting(false);
        }
    };

    // BE auto-approve khi người đặt có quyền duyệt (resolveApproverIds fallback theo
    // permission `meeting_request.approve`). Login trả roles dạng string[] nên so
    // r.roleCode luôn false → luôn hiện "Cần Trưởng phòng duyệt" dù BE đã tự duyệt.
    const isManagerAutoApprove = currentUser?.permissions?.includes('meeting_request.approve') ?? false;

    if (loadingData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-blue">
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-semibold text-sm">Đang tải danh sách tài nguyên và thông tin cấu hình...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Đặt lịch
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-midnight-indigo">Đặt lịch & Đăng ký phòng họp</h1>
                <p className="text-xs text-slate-blue">Lên kế hoạch cuộc họp, thiết lập chương trình (agenda) và kiểm tra chính sách bảo mật</p>
            </div>

            {/* Visual Step Progress Indicator */}
            <div className="flex items-center justify-center gap-4 py-2 border-b border-platinum-tint/30 mb-2">
                <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep === 1
                        ? 'bg-action-blue text-white ring-4 ring-action-blue/15'
                        : 'bg-emerald-500 text-white'
                        }`}>
                        {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
                    </span>
                    <span className={`text-sm font-bold ${currentStep === 1 ? 'text-midnight-indigo' : 'text-slate-blue'}`}>
                        Chọn phòng & Thời gian
                    </span>
                </div>
                <div className="w-16 h-0.5 bg-platinum-tint rounded" />
                <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep === 2
                        ? 'bg-action-blue text-white ring-4 ring-action-blue/15'
                        : 'bg-cloud-mist border border-platinum-tint text-slate-blue'
                        }`}>
                        2
                    </span>
                    <span className={`text-sm font-bold ${currentStep === 2 ? 'text-midnight-indigo' : 'text-slate-blue'}`}>
                        Thông tin cuộc họp
                    </span>
                </div>
            </div>

            {/* Success and Error messages outside forms */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex gap-2"
                    >
                        <Check className="w-4 h-4 shrink-0 text-emerald-600 animate-bounce" />
                        <span className="font-semibold">{successMessage}</span>
                    </motion.div>
                )}
                {errorMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span className="font-semibold">{errorMsg}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Step-by-Step Forms */}
            <AnimatePresence mode="wait">
                {currentStep === 1 ? (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-6"
                    >
                        {/* Time Picker Card */}
                        <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                            <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-cloud-mist">
                                <Clock className="w-4 h-4 text-action-blue" /> Khung thời gian họp
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Khung ngày họp *</label>
                                    <div className="relative w-full z-20">
                                        <DatePicker 
                                            selectsRange={true}
                                            startDate={startDate}
                                            endDate={endDate}
                                            onChange={(update) => {
                                                setDateRange(update);
                                                invalidateRoomSuggestions();
                                            }}
                                            minDate={new Date()}
                                            locale={vi}
                                            dateFormat="dd/MM/yyyy"
                                            className="w-full px-4 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo bg-white"
                                            wrapperClassName="w-full"
                                            placeholderText="DD/MM/YYYY - DD/MM/YYYY"
                                            onKeyDown={handleDateKeyDown}
                                            onChangeRaw={handleDateChangeRaw}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Giờ bắt đầu *</label>
                                    <TimePicker
                                        value={startTime}
                                        onChange={(newTime) => {
                                            setStartTime(newTime);
                                            invalidateRoomSuggestions();
                                        }}
                                        placeholder="Giờ bắt đầu"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Giờ kết thúc *</label>
                                    <TimePicker
                                        value={endTime}
                                        onChange={(newTime) => {
                                            setEndTime(newTime);
                                            invalidateRoomSuggestions();
                                        }}
                                        placeholder="Giờ kết thúc"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Số người dự kiến</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={expectedAttendeeCount}
                                        onChange={(e) => {
                                            setExpectedAttendeeCount(e.target.value);
                                            invalidateRoomSuggestions();
                                        }}
                                        placeholder="Tuỳ chọn"
                                        className="w-full px-4 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={handleSearchRooms}
                                    disabled={searchingRooms}
                                    className="px-6 py-2.5 bg-action-blue hover:bg-action-blue/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                >
                                    {searchingRooms ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4" /> Tìm phòng họp
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Search Results */}
                        {searchPerformed && (
                            <div>
                                <h4 className="font-bold text-xs text-slate-blue uppercase mb-3 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Phòng họp trống ({availableRooms.length})
                                </h4>
                                {availableRooms.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {availableRooms.map(room => {
                                            const roomId = room.id || room.roomId;
                                            const isSelected = selectedRoomId === roomId;
                                            return (
                                                <div
                                                    key={roomId}
                                                    onClick={() => handleSelectRoom(room)}
                                                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between min-h-[9rem] ${isSelected
                                                        ? 'bg-blue-50/20 border-action-blue shadow-md ring-2 ring-action-blue/15'
                                                        : 'bg-white border-platinum-tint hover:border-action-blue/50 hover:bg-cloud-mist/50'
                                                        }`}
                                                >
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <h5 className="font-bold text-sm text-midnight-indigo">{room.roomName || room.room_name}</h5>
                                                            <span className="text-[11px] font-bold text-slate-blue bg-cloud-mist px-2 py-0.5 rounded">
                                                                Sức chứa: {room.capacity} người
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-blue mt-1 line-clamp-1">
                                                            {room.siteName || room.site_name} • {room.areaName || room.area_name || 'Khu vực chính'}
                                                        </p>
                                                        {/* Nhóm D — cảnh báo mềm, không loại phòng khỏi danh sách */}
                                                        {room.pendingConflicts?.length > 0 && (
                                                            <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1" title="Chưa được duyệt nên chưa chắc chắn giữ được phòng">
                                                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                                                {room.pendingConflicts.length} yêu cầu khác đang chờ duyệt cùng giờ
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Facilities Icons */}
                                                    <div className="flex items-center justify-between border-t border-platinum-tint/40 pt-2.5 mt-2">
                                                        <div className="flex items-center gap-2.5 text-slate-blue/70">
                                                            {(room.hasCamera || room.has_camera) && <Video className="w-3.5 h-3.5" title="Có Camera" />}
                                                            {(room.hasMicrophone || room.has_microphone) && <Mic className="w-3.5 h-3.5" title="Có Mic" />}
                                                            {(room.hasDisplay || room.has_display) && <Calendar className="w-3.5 h-3.5" title="Có Màn hình" />}
                                                        </div>
                                                        <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-action-blue' : 'text-slate-blue/60'}`}>
                                                            {isSelected ? 'Đã chọn' : 'Chọn phòng'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-blue italic pl-2 py-2">Không tìm thấy phòng họp trống trong khung giờ này. Vui lòng đổi giờ hoặc số người dự kiến.</p>
                                )}
                            </div>
                        )}

                        {/* Continue Button */}
                        <div className="flex justify-end pt-4 border-t border-platinum-tint/30">
                            <button
                                type="button"
                                disabled={!selectedRoomId}
                                onClick={handleContinueToStep2}
                                className="px-6 py-3 bg-action-blue hover:bg-action-blue/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-95"
                            >
                                Tiếp tục <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                    >
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Left Side: Inputs */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* Selected Room Summary Banner */}
                                <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/30 p-5 rounded-2xl border border-platinum-tint flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <span className="text-[10px] font-bold text-action-blue uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                                            Phòng họp đã chọn
                                        </span>
                                        <h3 className="font-bold text-lg text-midnight-indigo mt-2">
                                            {selectedRoom?.roomName || selectedRoom?.room_name}
                                        </h3>
                                        <p className="text-xs text-slate-blue mt-0.5">
                                            {selectedRoom?.siteName || selectedRoom?.site_name} • Sức chứa: {selectedRoom?.capacity} người
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-platinum-tint/80 shadow-sm shrink-0">
                                        <Calendar className="w-5 h-5 text-action-blue shrink-0" />
                                        <div>
                                            <p className="text-[10px] text-slate-blue font-bold uppercase">Khung giờ họp</p>
                                            <p className="text-sm font-bold text-midnight-indigo">
                                                {startTime} - {endTime}
                                            </p>
                                            <p className="text-[11px] text-slate-blue font-semibold">
                                                Ngày {startStr?.split('-').reverse().join('/')} {endStr && endStr !== startStr ? `- ${endStr.split('-').reverse().join('/')}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Capacity override warning */}
                                {capacityExceeded && (
                                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                                        <div className="flex gap-2 text-rose-700 text-xs">
                                            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
                                            <span className="font-semibold">
                                                Số người dự kiến ({expectedAttendeeCount && Number(expectedAttendeeCount) > actualAttendeeCount ? expectedAttendeeCount : actualAttendeeCount}) vượt sức chứa phòng "{selectedRoom?.roomName || selectedRoom?.room_name}" ({selectedRoom?.capacity} người).
                                            </span>
                                        </div>
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-rose-700 font-semibold">
                                            <input
                                                type="checkbox"
                                                checked={capacityOverrideConfirmed}
                                                onChange={(e) => setCapacityOverrideConfirmed(e.target.checked)}
                                                className="w-4 h-4 rounded text-rose-600 border-rose-300 focus:ring-rose-500"
                                            />
                                            Tôi xác nhận vượt sức chứa phòng và vẫn muốn tiếp tục đặt phòng này.
                                        </label>
                                    </div>
                                )}

                                {/* General Information */}
                                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                                    <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-cloud-mist">
                                        <Info className="w-4 h-4 text-action-blue" /> Chi tiết cuộc họp
                                    </h3>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Tiêu đề cuộc họp *</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="Nhập tiêu đề hoặc mục đích họp..."
                                            className="w-full px-4 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/15 text-midnight-indigo"
                                            required
                                        />
                                    </div>




                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">Mô tả (tuỳ chọn)</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Mục tiêu, nội dung chính của cuộc họp..."
                                            rows={3}
                                            maxLength={2000}
                                            className="w-full px-4 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/15 text-midnight-indigo resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Invite Participants */}
                                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                                    <div className="flex justify-between items-center pb-3 border-b border-cloud-mist">
                                        <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider flex items-center gap-2">
                                            <Users className="w-4 h-4 text-royal-amethyst" /> Mời khách tham gia
                                        </h3>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${(selectedParticipantIds.length + externalParticipants.length + 1) > (selectedRoom?.capacity || 0)
                                            ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse'
                                            : 'bg-cloud-mist text-slate-blue'
                                            }`}>
                                            Đã mời: {selectedParticipantIds.length + externalParticipants.length + 1} / {selectedRoom?.capacity || 0} người
                                        </span>
                                    </div>

                                    {(selectedParticipantIds.length + externalParticipants.length + 1) > (selectedRoom?.capacity || 0) && !capacityOverrideConfirmed && (
                                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex gap-2">
                                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 animate-bounce" />
                                            <span>
                                                Số người tham gia ({selectedParticipantIds.length + externalParticipants.length + 1} người bao gồm cả bạn) đã vượt quá sức chứa của phòng ({selectedRoom?.capacity} người). Vui lòng bỏ chọn bớt hoặc quay lại bước 1 chọn phòng rộng hơn hoặc tick xác nhận vượt sức chứa.
                                            </span>
                                        </div>
                                    )}

                                    {/* Search & Import Section */}
                                    <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                                        {/* Search Input - Left side */}
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue/60" />
                                            <input
                                                type="text"
                                                value={searchEmail}
                                                onChange={(e) => setSearchEmail(e.target.value)}
                                                onFocus={() => setSearchFocused(true)}
                                                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                                                placeholder="Tìm kiếm theo tên, email hoặc tên phòng ban..."
                                                className="w-full pl-9 pr-8 py-1.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo bg-white shadow-sm"
                                            />
                                            {searchEmail && (
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setSearchEmail('');
                                                    }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-blue/50 hover:text-slate-blue"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}

                                            {/* Floating Autocomplete Dropdown suggestions list */}
                                            {searchFocused && (
                                                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-platinum-tint rounded-xl shadow-lg max-h-72 overflow-y-auto divide-y divide-cloud-mist">
                                                    {searchingUsers ? (
                                                        <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-blue">
                                                            <div className="w-3.5 h-3.5 border-2 border-action-blue border-t-transparent rounded-full animate-spin" />
                                                            Đang tìm kiếm...
                                                        </div>
                                                    ) : (visibleSuggestions.length > 0 || visibleDepartments.length > 0) ? (
                                                        <>
                                                            {/* Departments */}
                                                            {visibleDepartments.map(dept => (
                                                                <div
                                                                    key={`dept-${dept.id}`}
                                                                    onMouseDown={() => {
                                                                        handleAddDepartment(dept.id);
                                                                        setSearchEmail('');
                                                                        setSearchFocused(false);
                                                                    }}
                                                                    className="p-3 hover:bg-royal-amethyst/5 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between text-midnight-indigo transition-colors gap-3 bg-slate-50 border-b border-platinum-tint/50"
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-9 h-9 rounded-lg bg-royal-amethyst/10 flex items-center justify-center shrink-0 border border-royal-amethyst/20">
                                                                            <Building className="w-4 h-4 text-royal-amethyst" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-royal-amethyst">
                                                                                Phòng: {dept.departmentName || dept.department_name}
                                                                            </p>
                                                                            <p className="text-[11px] font-medium text-slate-blue opacity-80 mt-0.5">Thêm toàn bộ nhân viên phòng này vào danh sách</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="px-3 py-2 rounded-lg bg-royal-amethyst hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors w-full sm:w-auto mt-2 sm:mt-0">
                                                                        <Users className="w-3.5 h-3.5" /> Thêm tất cả
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {/* Users */}
                                                            {visibleSuggestions.map(user => {
                                                                const deptCode = getUserDeptCode(user);
                                                                const isSelected = selectedParticipantIds.includes(user.id);
                                                                return (
                                                                    <div
                                                                        key={user.id}
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            toggleParticipant(user.id);
                                                                        }}
                                                                        className={`p-3 cursor-pointer flex items-center justify-between transition-colors gap-3 min-w-0 group ${isSelected
                                                                            ? 'bg-action-blue/[0.04] hover:bg-rose-50/50 border-l-2 border-action-blue'
                                                                            : 'hover:bg-action-blue/[0.03] border-l-2 border-transparent'
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            {/* Mini Avatar in dropdown */}
                                                                            <div className="w-9 h-9 rounded-full overflow-hidden border border-platinum-tint flex-shrink-0 bg-gradient-to-tr from-action-blue to-cyan-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                                                                {user.avatarUrl ? (
                                                                                    <img src={user.avatarUrl} alt={user.fullName || user.full_name} className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    (user.fullName || user.full_name || 'U').charAt(0).toUpperCase()
                                                                                )}
                                                                            </div>
                                                                            <div className="space-y-0.5 min-w-0 flex-1">
                                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-midnight-indigo' : 'text-midnight-indigo'}`} title={user.fullName || user.full_name}>
                                                                                        {user.fullName || user.full_name}
                                                                                    </p>
                                                                                    {deptCode && (
                                                                                        <span
                                                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 max-w-[85px] truncate ${isSelected ? 'bg-action-blue/20 text-action-blue' : 'bg-action-blue/10 text-action-blue'
                                                                                                }`}
                                                                                            title={deptCode}
                                                                                        >
                                                                                            {deptCode}
                                                                                        </span>
                                                                                    )}
                                                                                    {user.hasFaceProfile === false && (
                                                                                        <AlertTriangle
                                                                                            className="w-3.5 h-3.5 text-amber-500 shrink-0"
                                                                                            title="Chưa có ảnh khuôn mặt — sẽ không điểm danh được bằng Face Terminal"
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-xs text-slate-blue opacity-75 truncate" title={user.email}>{user.email}</p>
                                                                            </div>
                                                                        </div>
                                                                        {isSelected ? (
                                                                            <div className="w-5 h-5 rounded-full bg-action-blue text-white border border-action-blue flex items-center justify-center transition-all duration-200 shrink-0 group-hover:bg-rose-600 group-hover:border-rose-600 shadow-sm" title="Bỏ chọn">
                                                                                <Check className="w-3 h-3 block group-hover:hidden" />
                                                                                <X className="w-3 h-3 hidden group-hover:block" />
                                                                            </div>
                                                                        ) : (
                                                                            <Plus className="w-4 h-4 text-action-blue opacity-60 group-hover:opacity-100 shrink-0" title="Thêm vào danh sách" />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </>
                                                    ) : (
                                                        <div className="p-4 text-center text-xs text-slate-blue italic">
                                                            {searchEmail ? 'Không tìm thấy nhân viên hay phòng ban phù hợp.' : 'Nhập tên nhân viên hoặc phòng ban để tìm kiếm...'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions - Right side */}
                                        <button
                                            type="button"
                                            onClick={() => setShowImportModal(true)}
                                            className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shrink-0 shadow-sm"
                                        >
                                            <FileSpreadsheet className="w-3 h-3" />
                                            <span>Thêm danh sách</span>
                                        </button>
                                    </div>

                                    {/* Internal Selected Participants List (Card format with Checkmark) */}
                                    {selectedParticipantIds.length > 0 && (
                                        <div className="pt-4 border-t border-platinum-tint/50 space-y-3">
                                            <p className="text-xs font-bold text-midnight-indigo uppercase tracking-wider">
                                                Nhân viên trong hệ thống đã chọn ({selectedParticipantIds.length}):
                                            </p>
                                            <div className="max-h-60 overflow-y-auto pr-1 space-y-4">
                                                {(() => {
                                                    const selectedUsers = users.filter(u => selectedParticipantIds.includes(u.id));
                                                    const groupedUsers = {};
                                                    selectedUsers.forEach(user => {
                                                         const deptCode = getUserDeptCode(user) || 'Thành viên tự do';
                                                        if (!groupedUsers[deptCode]) groupedUsers[deptCode] = [];
                                                        groupedUsers[deptCode].push(user);
                                                    });
                                                    
                                                    return Object.entries(groupedUsers).map(([deptCode, deptUsers]) => (
                                                        <div key={deptCode} className="space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-px bg-platinum-tint/70 flex-1"></div>
                                                                <span className="text-[10px] font-bold text-slate-blue tracking-widest uppercase px-2 py-0.5 rounded bg-cloud-mist/50 border border-platinum-tint/50 shadow-sm">
                                                                    {deptCode} ({deptUsers.length})
                                                                </span>
                                                                <div className="h-px bg-platinum-tint/70 flex-1"></div>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                {deptUsers.map(user => {
                                                                    const userDeptCode = getUserDeptCode(user);
                                                                    return (
                                                                        <div
                                                                            key={user.id}
                                                                            onClick={() => toggleParticipant(user.id)}
                                                                            className="p-3 rounded-2xl border border-action-blue/20 bg-action-blue/[0.02] text-midnight-indigo shadow-sm flex items-center justify-between cursor-pointer select-none transition-all duration-200 hover:bg-rose-50/40 hover:border-rose-200 hover:shadow group gap-3 min-w-0"
                                                                            title="Nhấp để xóa người tham gia này"
                                                                        >
                                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                                {/* Avatar */}
                                                                                <div
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleOpenUserDetail(user.id);
                                                                                    }}
                                                                                    className="relative w-10 h-10 rounded-full overflow-hidden border border-action-blue/10 flex-shrink-0 bg-gradient-to-tr from-action-blue to-cyan-500 text-white flex items-center justify-center font-extrabold text-sm hover:scale-105 hover:shadow transition-all group/avatar cursor-pointer"
                                                                                    title="Xem thông tin chi tiết"
                                                                                >
                                                                                    {user.avatarUrl ? (
                                                                                        <img src={user.avatarUrl} alt={user.fullName || user.full_name} className="w-full h-full object-cover" />
                                                                                    ) : (
                                                                                        (user.fullName || user.full_name || 'U').charAt(0).toUpperCase()
                                                                                    )}
                                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-all duration-200">
                                                                                        <Info className="w-3.5 h-3.5 text-white" />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-0.5 min-w-0 flex-1">
                                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                                        <span
                                                                                            className="text-sm font-semibold text-midnight-indigo group-hover:text-rose-950 transition-colors truncate"
                                                                                            title={user.fullName || user.full_name}
                                                                                        >
                                                                                            {user.fullName || user.full_name}
                                                                                        </span>
                                                                                        {userDeptCode && (
                                                                                            <span
                                                                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-action-blue/10 text-action-blue group-hover:bg-rose-100 group-hover:text-rose-700 transition-colors shrink-0 max-w-[85px] truncate"
                                                                                                title={userDeptCode}
                                                                                            >
                                                                                                {userDeptCode}
                                                                                            </span>
                                                                                        )}
                                                                                        {user.hasFaceProfile === false && (
                                                                                            <AlertTriangle
                                                                                                className="w-3.5 h-3.5 text-amber-500 shrink-0"
                                                                                                title="Chưa có ảnh khuôn mặt — sẽ không điểm danh được bằng Face Terminal"
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                    <p
                                                                                        className="text-[11px] font-normal text-slate-blue/80 group-hover:text-rose-700/60 transition-colors truncate"
                                                                                        title={user.email}
                                                                                    >
                                                                                        {user.email}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="w-5 h-5 rounded-full bg-action-blue text-white border border-action-blue flex items-center justify-center transition-all duration-200 shrink-0 group-hover:bg-rose-600 group-hover:border-rose-600 shadow-sm">
                                                                                <Check className="w-3 h-3 block group-hover:hidden" />
                                                                                <X className="w-3 h-3 hidden group-hover:block" />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    {/* External Participants List */}
                                    {externalParticipants.length > 0 && (
                                        <div className="pt-2 border-t border-platinum-tint/50 space-y-2">
                                            <p className="text-xs font-semibold text-slate-blue">
                                                Khách mời ngoài hệ thống ({externalParticipants.length}):
                                            </p>
                                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                                                {externalParticipants.map((ext) => (
                                                    <div
                                                        key={ext.id}
                                                        className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border text-xs font-medium transition-colors max-w-full min-w-0 ${ext.isCompanyUnmatched
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            }`}
                                                    >
                                                        <span className="truncate max-w-[150px] sm:max-w-[200px]" title={ext.email}>
                                                            {ext.email}
                                                        </span>
                                                        <span className="text-[10px] px-1 py-0.2 bg-white/70 rounded-full font-bold shrink-0">
                                                            {ext.isCompanyUnmatched ? 'Chưa khớp NV' : 'Khách ngoài'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExternalParticipants(prev => prev.filter(p => p.id !== ext.id))}
                                                            className="p-0.5 rounded-full hover:bg-black/10 transition-colors shrink-0"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Agenda Builder */}
                                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                                    <div className="flex justify-between items-center pb-3 border-b border-cloud-mist">
                                        <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-emerald-600" /> Chương trình họp (Agenda)
                                        </h3>
                                        <span className="text-xs font-bold text-slate-blue bg-cloud-mist px-2.5 py-1 rounded-lg">
                                            Đã lên: {agendaTotalDuration} / {meetingDuration} phút
                                        </span>
                                    </div>

                                    {/* New Agenda Input */}
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={newAgendaTitle}
                                                    onChange={(e) => {
                                                        setNewAgendaTitle(e.target.value);
                                                        setAgendaInputError('');
                                                    }}
                                                    placeholder="Chủ đề / Nội dung thảo luận..."
                                                    className="w-full px-4 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                                />
                                            </div>
                                            <div className="w-full sm:w-32 flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={newAgendaDuration}
                                                    onChange={(e) => {
                                                        setNewAgendaDuration(e.target.value);
                                                        setAgendaInputError('');
                                                    }}
                                                    min="1"
                                                    placeholder="Phút"
                                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo text-center"
                                                />
                                                <span className="text-xs text-slate-blue">phút</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddAgenda}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                                            >
                                                <Plus className="w-4 h-4" /> Thêm
                                            </button>
                                        </div>

                                        {/* Agenda Item Document Upload */}
                                        <div className="flex items-center gap-3 w-full">
                                            <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-platinum-tint hover:border-action-blue bg-cloud-mist/20 hover:bg-blue-50/20 text-slate-blue hover:text-action-blue rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 justify-center select-none min-w-0">
                                                <Upload className="w-4 h-4 text-action-blue shrink-0" />
                                                <span className="truncate">{newAgendaFile ? `Đã đính kèm: ${newAgendaFile.name}` : 'Đính kèm tài liệu thảo luận (PDF, Word, Excel, PowerPoint...)'}</span>
                                                <input
                                                    type="file"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            setNewAgendaFile(e.target.files[0]);
                                                        }
                                                    }}
                                                    className="hidden"
                                                />
                                            </label>
                                            {newAgendaFile && (
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAgendaFile(null)}
                                                    className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl transition-all"
                                                    title="Hủy chọn file"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {agendaInputError && (
                                            <div className="flex items-center gap-1.5 mt-2 text-rose-500 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 animate-fade-in-up">
                                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                                <p className="text-xs font-medium">{agendaInputError}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Agenda List */}
                                    {agendaList.length > 0 ? (
                                        <div className="space-y-2 pt-2">
                                            {agendaList.map((item, index) => (
                                                <div 
                                                    key={index} 
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        setDraggedAgendaIndex(index);
                                                    }}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (draggedAgendaIndex === null || draggedAgendaIndex === index) return;
                                                        const newList = [...agendaList];
                                                        const draggedItem = newList.splice(draggedAgendaIndex, 1)[0];
                                                        newList.splice(index, 0, draggedItem);
                                                        setAgendaList(newList);
                                                        setDraggedAgendaIndex(null);
                                                    }}
                                                    onDragEnd={() => setDraggedAgendaIndex(null)}
                                                    className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all cursor-move ${
                                                        draggedAgendaIndex === index ? 'opacity-50 border-action-blue bg-blue-50' : 'bg-cloud-mist/30 border-platinum-tint/40 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                                        <GripVertical className="w-4 h-4 text-slate-400 shrink-0 cursor-grab" />
                                                        <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 font-bold text-xs flex items-center justify-center border border-emerald-100 shrink-0">
                                                            {index + 1}
                                                        </span>
                                                        <div className="space-y-1">
                                                            <div className="font-semibold text-midnight-indigo break-words break-all">{item.title}</div>
                                                            {item.file && (
                                                                <div className="flex items-center gap-1.5 text-[10px] text-action-blue font-semibold bg-action-blue/5 px-2 py-0.5 rounded-lg border border-action-blue/10 w-max select-none">
                                                                    <Paperclip className="w-3 h-3 text-action-blue" />
                                                                    <span className="max-w-[200px] truncate">{item.file.name}</span>
                                                                    <span className="text-[9px] opacity-60">({(item.file.size / 1024).toFixed(1)} KB)</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-medium text-slate-blue bg-cloud-mist px-2.5 py-0.5 rounded-full">{item.durationMin} phút</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditAgenda(index)}
                                                            className="p-1 text-slate-blue hover:text-action-blue rounded transition-colors"
                                                            title="Sửa chương trình"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveAgenda(index)}
                                                            className="p-1 text-slate-blue hover:text-red-600 rounded transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-blue text-center py-4 italic">Chưa thiết lập chương trình thảo luận chi tiết.</p>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Policies, Config, Submit */}
                            <div className="space-y-6">
                                {/* Approvals */}
                                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                                    <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider pb-3 border-b border-cloud-mist">
                                        Trạng thái & Phê duyệt
                                    </h3>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-blue">Người tổ chức:</span>
                                            <span className="font-bold text-midnight-indigo">{currentUser?.fullName || 'Nhân viên'}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-blue">Quy trình duyệt:</span>
                                            {isManagerAutoApprove ? (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">
                                                    Tự động phê duyệt
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-bold border border-amber-100">
                                                    Cần Trưởng phòng duyệt
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-slate-blue leading-relaxed pt-2 border-t border-cloud-mist/50">
                                            {isManagerAutoApprove
                                                ? 'Với vai trò Trưởng phòng, lịch họp này sẽ được chốt tức thời mà không cần qua bước phê duyệt trung gian.'
                                                : 'Yêu cầu của bạn sẽ được gửi tới hòm thư phê duyệt của Trưởng phòng. Phòng họp sẽ được tạm khóa giữ chỗ để tránh xung đột.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Security & Recording Config — chỉ hiển thị nếu phòng có thiết bị ghi âm/hình */}
                                {roomAllowsRecording && (
                                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                                    <h3 className="font-bold text-sm text-midnight-indigo uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-cloud-mist">
                                        <Video className="w-4 h-4 text-red-600" /> Cấu hình ghi âm & hình
                                    </h3>

                                    {/* Video Recording — chỉ khi phòng có camera */}
                                    {roomHasCamera && (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Video className="w-4 h-4 text-slate-blue" />
                                            <span className="text-sm font-semibold text-midnight-indigo">Ghi hình cuộc họp</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={recordingEnabled}
                                                onChange={(e) => {
                                                    setRecordingEnabled(e.target.checked);
                                                    if (!e.target.checked && !audioRecordingEnabled) setPdpaConsent(false);
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                        </label>
                                    </div>
                                    )}

                                    {/* Audio Recording — chỉ khi phòng có microphone */}
                                    {roomHasMic && (
                                    <div className={`flex items-center justify-between ${roomHasCamera ? 'pt-2 border-t border-platinum-tint/40' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <Mic className="w-4 h-4 text-slate-blue" />
                                            <span className="text-sm font-semibold text-midnight-indigo">Ghi âm cuộc họp</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={audioRecordingEnabled}
                                                onChange={(e) => {
                                                    setAudioRecordingEnabled(e.target.checked);
                                                    if (!e.target.checked && !recordingEnabled) setPdpaConsent(false);
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                        </label>
                                    </div>
                                    )}

                                    {/* PDPA Consent */}
                                    <AnimatePresence>
                                        {(recordingEnabled || audioRecordingEnabled) && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="space-y-3 overflow-hidden text-xs text-slate-blue"
                                            >
                                                <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 flex gap-2">
                                                    <ShieldAlert className="w-5 h-5 shrink-0 text-red-600" />
                                                    <p className="leading-relaxed font-semibold">
                                                        Theo Nghị định bảo vệ dữ liệu cá nhân (PDPA VN), bạn phải có sự đồng ý của tất cả thành viên bắt buộc tham dự trước khi thực hiện ghi âm/ghi hình cuộc họp.
                                                    </p>
                                                </div>

                                                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={pdpaConsent}
                                                        onChange={(e) => setPdpaConsent(e.target.checked)}
                                                        className="mt-1 w-4 h-4 rounded text-red-600 border-platinum-tint focus:ring-red-500"
                                                    />
                                                    <span className="leading-tight font-semibold text-slate-blue">
                                                        Tôi cam kết đã thông báo và có sự đồng ý của tất cả người tham gia.
                                                    </span>
                                                </label>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                )}

                                {/* Step 2 Actions */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentStep(1)}
                                            className="w-1/2 py-3 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                                        >
                                            <ArrowLeft className="w-4 h-4" /> Quay lại
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="w-1/2 py-3 bg-action-blue hover:bg-action-blue/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-95"
                                        >
                                            {submitting ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                'Xác nhận đặt'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Collision modal (keeps fallback alternative rooms logic) */}
            {conflictInfo && ReactDOM.createPortal(
            <AnimatePresence>
                {conflictInfo && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl border border-platinum-tint shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in-up"
                        >
                            {/* Header */}
                            <div className="flex items-center gap-3 p-5 bg-rose-50 border-b border-rose-100">
                                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
                                <div>
                                    <h3 className="font-bold text-base text-rose-800">Phòng họp không khả dụng (Trùng lịch)</h3>
                                    <p className="text-xs text-rose-700/80 mt-0.5">Phát hiện xung đột lịch đặt phòng họp</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setConflictInfo(null); setAlternativeRooms([]); }}
                                    className="ml-auto p-1.5 hover:bg-rose-100 rounded-lg text-rose-700 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 overflow-y-auto space-y-6">
                                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/70 text-xs text-amber-800 leading-relaxed">
                                    <p className="font-bold text-sm text-amber-900 mb-1">Thông báo chi tiết:</p>
                                    Trong lúc bạn đang điền thông tin chi tiết cuộc họp, đã có người khác thực hiện đặt phòng này trước hoặc khung giờ này đã bị trùng lịch. Vui lòng chọn một phòng họp thay thế khả dụng bên dưới hoặc nhấn hủy để điều chỉnh lại khung giờ.
                                </div>

                                <div className="space-y-3">
                                    <h4 className="font-extrabold text-xs text-midnight-indigo uppercase tracking-wider flex items-center gap-1.5">
                                        <Building className="w-4 h-4 text-action-blue" /> Đề xuất phòng họp thay thế trống cùng giờ:
                                    </h4>

                                    {alternativeRooms.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {alternativeRooms.map(room => {
                                                const roomId = room.id || room.roomId;
                                                return (
                                                    <div
                                                        key={roomId}
                                                        onClick={() => handleSelectAlternativeRoom(roomId)}
                                                        className="p-4 rounded-2xl border border-platinum-tint hover:border-action-blue hover:bg-blue-50/10 cursor-pointer transition-all flex flex-col justify-between hover:shadow-md min-h-[7rem] group"
                                                    >
                                                        <div>
                                                            <div className="flex justify-between items-start">
                                                                <h5 className="font-bold text-sm text-midnight-indigo group-hover:text-action-blue transition-colors">{room.roomName || room.room_name}</h5>
                                                                <span className="text-[10px] font-bold text-slate-blue bg-cloud-mist px-2 py-0.5 rounded-md">
                                                                    Sức chứa: {room.capacity} người
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-blue mt-1 line-clamp-1">
                                                                {room.siteName || room.site_name} • {room.areaName || room.area_name || 'Khu vực'}
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center justify-between border-t border-platinum-tint/40 pt-2.5 mt-3">
                                                            <div className="flex items-center gap-2 text-slate-blue/60">
                                                                {(room.hasCamera || room.has_camera) && <Video className="w-3.5 h-3.5" title="Có Camera" />}
                                                                {(room.hasMicrophone || room.has_microphone) && <Mic className="w-3.5 h-3.5" title="Có Mic" />}
                                                            </div>
                                                            <span className="text-[11px] font-bold text-action-blue group-hover:underline">
                                                                Đổi sang phòng này
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center bg-cloud-mist/10 rounded-2xl border border-platinum-tint border-dashed">
                                            <Building className="w-8 h-8 text-slate-blue/40 mx-auto mb-2" />
                                            <p className="text-xs text-slate-blue italic">Không tìm thấy phòng họp trống thay thế nào có sức chứa tương đương trong thời gian này.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-5 bg-cloud-mist/20 border-t border-platinum-tint/50 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setConflictInfo(null); setAlternativeRooms([]); }}
                                    className="px-5 py-2.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold transition-all"
                                >
                                    Đóng & Điều chỉnh giờ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
            )}

            {/* Import Participants Modal (combined feature with backdrop blur) */}
            {showImportModal && ReactDOM.createPortal(
                <AnimatePresence>
                    {showImportModal && (
                        <div className="fixed inset-0 w-full h-full z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-2xl border border-platinum-tint shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
                            >
                                {/* Modal Header */}
                                <div className="flex items-center justify-between p-5 border-b border-cloud-mist bg-cloud-mist/20">
                                    <div className="flex items-center gap-2">
                                        <FileSpreadsheet className="w-5 h-5 text-action-blue" />
                                        <h3 className="font-bold text-base text-midnight-indigo"> Thêm danh sách</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowImportModal(false);
                                            setImportPreview([]);
                                            setManualEmails('');
                                        }}
                                        className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue hover:text-midnight-indigo transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Modal Body */}
                                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                                    {/* Tab selection */}
                                    <div className="flex border-b border-platinum-tint">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImportMethod('manual');
                                                setImportPreview([]);
                                            }}
                                            className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${importMethod === 'manual'
                                                ? 'border-action-blue text-action-blue'
                                                : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                                }`}
                                        >
                                            Nhập thủ công
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImportMethod('excel');
                                                setImportPreview([]);
                                            }}
                                            className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${importMethod === 'excel'
                                                ? 'border-action-blue text-action-blue'
                                                : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                                                }`}
                                        >
                                            Nhập từ file Excel
                                        </button>
                                    </div>

                                    {importMethod === 'manual' ? (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1.5">
                                                    Nhập danh sách Email *
                                                </label>
                                                <textarea
                                                    value={manualEmails}
                                                    onChange={(e) => setManualEmails(e.target.value)}
                                                    rows="4"
                                                    placeholder="Ví dụ: email1@company.com, email2@gmail.com, email3@company.com&#10;(Hỗ trợ ngăn cách bằng dấu phẩy, chấm phẩy hoặc xuống dòng)"
                                                    className="w-full px-4 py-2.5 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                                />
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4 hidden">
                                                {/* Hidden since system automatically checks now */}
                                            </div>

                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={handleManualImport}
                                                    disabled={!manualEmails.trim() || importProcessing}
                                                    className="px-4 py-2 bg-action-blue hover:bg-action-blue/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                                                >
                                                    {importProcessing && (
                                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    )}
                                                    Xem trước danh sách
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Download template banner */}
                                            <div className="flex justify-between items-center bg-blue-50/40 border border-blue-100 p-3.5 rounded-xl">
                                                <div className="space-y-0.5">
                                                    <h4 className="text-xs font-bold text-midnight-indigo flex items-center gap-1.5">
                                                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Tải file Excel mẫu:
                                                    </h4>
                                                    <p className="text-[10.5px] text-slate-blue">Sử dụng file mẫu có cấu trúc định dạng chuẩn phục vụ import khách mời.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={downloadSampleExcel}
                                                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                                                >
                                                    <Download className="w-3.5 h-3.5" /> Tải file mẫu
                                                </button>
                                            </div>

                                            <div className="p-5 border-2 border-dashed border-platinum-tint hover:border-action-blue/50 rounded-2xl flex flex-col items-center justify-center bg-cloud-mist/10 relative transition-all group">
                                                <input
                                                    type="file"
                                                    accept=".xlsx, .xls"
                                                    onChange={handleExcelImport}
                                                    disabled={importProcessing}
                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                                                />
                                                {importProcessing ? (
                                                    <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin mb-2" />
                                                ) : (
                                                    <Upload className="w-8 h-8 text-slate-blue/60 group-hover:text-action-blue transition-colors mb-2" />
                                                )}
                                                <p className="text-xs font-bold text-midnight-indigo">
                                                    {importProcessing ? 'Đang đối chiếu dữ liệu với hệ thống...' : 'Click để chọn hoặc kéo thả file Excel vào đây'}
                                                </p>
                                                <p className="text-[10px] text-slate-blue mt-1">Hỗ trợ file định dạng .xlsx, .xls</p>
                                            </div>

                                            <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-1.5">
                                                <h4 className="text-xs font-bold text-midnight-indigo flex items-center gap-1.5">
                                                    <Info className="w-3.5 h-3.5 text-action-blue" /> Hướng dẫn định dạng cột Excel:
                                                </h4>
                                                <p className="text-[11px] text-slate-blue leading-relaxed">
                                                    File dùng đúng bộ cột như trong file mẫu (hệ thống tự nhận diện nhân viên nội bộ/khách ngoài):
                                                </p>
                                                <ul className="list-disc pl-4 text-[11px] text-slate-blue space-y-0.5">
                                                    <li>Cột <strong>Email</strong>: định danh chính cho nhân viên nội bộ (ưu tiên); bắt buộc với khách ngoài.</li>
                                                    <li>Cột <strong>Mã nhân viên</strong>: dùng thay Email khi tra cứu nhân viên nội bộ.</li>
                                                    <li>Cột <strong>Họ và tên</strong>: bắt buộc với khách ngoài (không tìm thấy trong hệ thống).</li>
                                                    <li>Cột <strong>Tổ chức/Công ty</strong>: tùy chọn, dùng cho khách ngoài.</li>
                                                    <li className="text-[10px] italic text-slate-blue/70">Cột Số điện thoại chỉ để tham khảo, chưa được lưu ở bước tạo cuộc họp.</li>
                                                </ul>

                                                {/* Mini preview table */}
                                                <div className="mt-2 border border-blue-100 rounded-lg overflow-hidden overflow-x-auto">
                                                    <table className="w-full text-[10.5px] text-left">
                                                        <thead>
                                                            <tr className="bg-blue-50/60 text-slate-blue font-bold">
                                                                <th className="py-1.5 px-2">Email</th>
                                                                <th className="py-1.5 px-2">Mã nhân viên</th>
                                                                <th className="py-1.5 px-2">Họ và tên</th>
                                                                <th className="py-1.5 px-2">Tổ chức/Công ty</th>
                                                                <th className="py-1.5 px-2">Số điện thoại</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="text-slate-blue/80">
                                                            <tr className="border-t border-blue-50">
                                                                <td className="py-1 px-2">nhanvien@smrmpts.com</td>
                                                                <td className="py-1 px-2">—</td>
                                                                <td className="py-1 px-2">—</td>
                                                                <td className="py-1 px-2">—</td>
                                                                <td className="py-1 px-2">—</td>
                                                            </tr>
                                                            <tr className="border-t border-blue-50">
                                                                <td className="py-1 px-2">khach@doitac.com</td>
                                                                <td className="py-1 px-2">—</td>
                                                                <td className="py-1 px-2">Nguyễn Văn B</td>
                                                                <td className="py-1 px-2">Công ty ABC</td>
                                                                <td className="py-1 px-2">0900000000</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Preview Section */}
                                    {importPreview.length > 0 && (
                                        <div className="space-y-2 border-t border-platinum-tint/50 pt-4">
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-xs font-bold text-midnight-indigo">
                                                    Xem trước dữ liệu import ({importPreview.length} dòng):
                                                </h4>
                                                {importPreview.some(p => p.error) && (
                                                    <span className="text-[10px] bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-lg font-bold animate-pulse">
                                                        Phát hiện dòng dữ liệu bị lỗi! Vui lòng kiểm tra lại.
                                                    </span>
                                                )}
                                            </div>
                                            <div className="border border-platinum-tint rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-cloud-mist/50 border-b border-platinum-tint font-bold text-slate-blue">
                                                            <th className="p-3">Định danh</th>
                                                            <th className="p-3 text-center">Loại</th>
                                                            <th className="p-3 text-right">Trạng thái đối khớp / Lỗi</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {importPreview.map((item, idx) => {
                                                            const isInternal = item.type === 'internal';
                                                            const resolvedUser = isInternal && item.resolvedUserId
                                                                ? usersById[item.resolvedUserId]
                                                                : null;
                                                            const identifier = item.email || item.employeeCode || item.fullName || '(Để trống)';

                                                            let matchStatus = 'Khách ngoài công ty';
                                                            let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';

                                                            if (isInternal) {
                                                                if (resolvedUser) {
                                                                    matchStatus = `Nhân viên: ${resolvedUser.fullName || resolvedUser.full_name}`;
                                                                    badgeClass = 'bg-blue-50 text-blue-700 border-blue-100';
                                                                } else {
                                                                    matchStatus = 'Không tìm thấy nhân viên';
                                                                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
                                                                }
                                                            }

                                                            if (item.error) {
                                                                matchStatus = 'Lỗi';
                                                                badgeClass = 'bg-red-50 text-red-700 border-red-100';
                                                            }

                                                            return (
                                                                <tr key={idx} className={`border-b border-platinum-tint/50 hover:bg-cloud-mist/20 transition-colors ${item.error ? 'bg-rose-50/20' : ''}`}>
                                                                    <td className="p-3 font-medium text-midnight-indigo">
                                                                        <span className={item.error ? 'text-rose-600 font-semibold' : ''}>{identifier}</span>
                                                                        {item.error && (
                                                                            <span className="block text-[10px] text-rose-500 font-bold mt-0.5">{item.error}</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-3 text-center">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isInternal ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                            {isInternal ? 'Nội bộ' : 'Ngoài'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-right">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeClass}`}>
                                                                            {matchStatus}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-5 border-t border-cloud-mist bg-cloud-mist/10 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowImportModal(false);
                                            setImportPreview([]);
                                            setManualEmails('');
                                        }}
                                        className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold transition-all"
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmImport}
                                        disabled={importPreview.length === 0 || importProcessing || importPreview.some(p => p.error !== '')}
                                        className="px-4 py-2 bg-action-blue hover:bg-action-blue/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                    >
                                        Xác nhận thêm ({importPreview.length})
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
                , document.body)}

                        {faultyEquipmentWarning && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl border border-platinum-tint max-w-md w-full overflow-hidden flex flex-col animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-amber-50">
                            <div className="flex items-center gap-2 text-amber-600">
                                <AlertTriangle className="w-5 h-5 animate-pulse" />
                                <h3 className="font-extrabold text-midnight-indigo text-base">Cảnh báo thiết bị phòng họp</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFaultyEquipmentWarning(null)}
                                className="text-slate-blue hover:text-midnight-indigo font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-blue leading-relaxed">
                                Phòng họp bạn chọn hiện đang có một số thiết bị gặp sự cố hoặc ngoại tuyến. Bạn có chắc chắn vẫn muốn tiếp tục đặt phòng này không?
                            </p>

                            <div className="bg-cloud-mist/40 rounded-xl border border-platinum-tint p-4 space-y-3 max-h-48 overflow-y-auto">
                                <span className="text-xs font-bold text-slate-blue uppercase block mb-1">
                                    Danh sách thiết bị sự cố:
                                </span>
                                {faultyEquipmentWarning.faultyEquipments.map((eq) => (
                                    <div key={eq.id} className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-lg border border-platinum-tint shadow-sm">
                                        <div className="w-6 h-6 rounded-md bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                                            <Wrench className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-midnight-indigo">{eq.equipmentName}</p>
                                            <p className="text-[11px] text-slate-blue mt-0.5">
                                                Loại: <span className="font-semibold">{eq.equipmentType}</span> • Trạng thái: <span className="text-red-500 font-semibold">{eq.healthStatus === 'faulty' ? 'Lỗi' : 'Ngoại tuyến'}</span>
                                            </p>
                                            {eq.lastIssueNote && (
                                                <p className="text-[11px] text-slate-blue mt-0.5 italic bg-cloud-mist/50 p-1 rounded border border-platinum-tint/30">
                                                    Chi tiết: "{eq.lastIssueNote}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/35 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setFaultyEquipmentWarning(null)}
                                className="px-4 py-2 rounded-xl border border-platinum-tint text-xs font-bold text-slate-blue hover:bg-cloud-mist transition-colors"
                            >
                                Hủy đặt phòng
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmFaultyEquipmentBooking}
                                className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-action-blue hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                Vẫn tiếp tục đặt
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

{selectedDetailUserId && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-xl w-full max-h-[90vh] overflow-y-auto animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 sticky top-0 z-10">
                            <h3 className="font-bold text-midnight-indigo">Chi tiết thông tin nhân viên</h3>
                            <button
                                onClick={() => {
                                    setSelectedDetailUserId(null);
                                    setUserDetail(null);
                                }}
                                className="text-slate-blue hover:text-midnight-indigo"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {detailError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">{detailError}</div>
                            )}

                            {loadingDetail ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-8 h-8 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                                    <p className="mt-4 text-xs text-slate-blue font-medium">Đang tải thông tin chi tiết...</p>
                                </div>
                            ) : userDetail ? (
                                <>
                                    {/* Top header summary */}
                                    <div className="flex items-center gap-4 bg-cloud-mist/55 p-4 rounded-xl border border-platinum-tint/50">
                                        <div className="w-16 h-16 rounded-full overflow-hidden border border-platinum-tint bg-gradient-to-tr from-action-blue to-glacier-blue text-white flex items-center justify-center font-extrabold text-xl shadow-sm shrink-0">
                                            {userDetail.avatarUrl ? (
                                                <img src={userDetail.avatarUrl} alt={userDetail.fullName} className="w-full h-full object-cover" />
                                            ) : (
                                                (userDetail.fullName || userDetail.full_name || 'U').charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-midnight-indigo leading-tight">{userDetail.fullName || "Chưa thiết lập"}</h4>
                                            <p className="text-sm text-slate-blue mt-0.5">{userDetail.email || "Chưa thiết lập"}</p>
                                        </div>
                                    </div>

                                    {/* Info Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                        <div className="bg-cloud-mist/20 p-3 rounded-xl border border-platinum-tint/30">
                                            <span className="text-xs text-slate-blue block mb-0.5">Mã nhân viên</span>
                                            <span className="font-semibold text-midnight-indigo">{userDetail.employeeCode || "Chưa thiết lập"}</span>
                                        </div>
                                        <div className="bg-cloud-mist/20 p-3 rounded-xl border border-platinum-tint/30">
                                            <span className="text-xs text-slate-blue block mb-0.5">Phòng ban</span>
                                            <span className="font-semibold text-midnight-indigo">
                                                {userDetail.department?.departmentName || "Chưa gán phòng ban"}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-xs text-slate-blue italic py-6">Không tìm thấy thông tin nhân viên này.</div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end sticky bottom-0 z-10">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedDetailUserId(null);
                                    setUserDetail(null);
                                }}
                                className="px-4 py-2 bg-slate-blue/10 hover:bg-slate-blue/20 text-midnight-indigo rounded-xl text-xs font-bold transition-all"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default BookMeeting;
