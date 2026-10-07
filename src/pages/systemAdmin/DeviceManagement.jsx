import { Activity, Cpu, Film } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';

import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../../utils/request';
import {
    getDevices,
    getDeviceStatusSummary,
    getAnprStats,
    registerDevice,
    updateDevice,
    getRooms,
    enableDevice,
    disableDevice,
    assignDeviceRoom,
    configDeviceRtsp,
    rotateFaceServerToken,
    revokeFaceServerToken,
    checkDeviceAvailability,
    configureFaceTerminal,
} from '../../service/sysAdminServices';
import { subscribeToNotificationUpdates, subscribeToSecurityAlerts } from '../../utils/socket';
import DeviceConnectionHistoryPanel from '../../components/devices/DeviceConnectionHistoryPanel';
import CameraAiConfigModal from '../../components/devices/CameraAiConfigModal';
import { CAMERA_TYPES, LANE_LABEL, getAnprInfo } from '../../mocks/cameraMock';

// Realtime trạng thái: tải lại im lặng mỗi 30s + ngay khi có cảnh báo/thông báo mới qua
// WebSocket (BE gửi khi camera đổi online↔offline). So trạng thái cũ/mới để báo thay đổi.
const LIVE_POLL_MS = 30000;
const WS_REFRESH_DELAY_MS = 1500;
const FLASH_MS = 2500;
const TOAST_MS = 6000;

const HEALTH_CONFIG = {
    healthy: { label: 'Khoẻ', cls: 'text-green-600 bg-green-50' },
    warning: { label: 'Cảnh báo', cls: 'text-amber-700 bg-amber-50' },
    faulty:  { label: 'Lỗi', cls: 'text-red-600 bg-red-50' },
    unknown: { label: 'Chưa rõ', cls: 'text-steel-gray bg-slate-50' },
};

const timeAgo = (iso, now) => {
    if (!iso) return 'chưa ghi nhận';
    const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    if (sec < 60) return `${sec} giây trước`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} phút trước`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.round(h / 24)} ngày trước`;
};

/**
 * DeviceManagement Component
 * UC-IOT-01 ~ UC-IOT-06: IoT Device Management for SystemAdmin
 * Includes:
 * 1. List View with full filters & actions (Edit, Unregister)
 * 2. Visual Map View detailing rooms and their active device health status
 * 3. Validation for IP address inputs
 */
const DeviceManagement = () => {
    // States
    const [devicesList, setDevicesList] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form / Alerts / Modal states
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // FE-5: Assign Room Modal
    const [isAssignRoomModalOpen, setIsAssignRoomModalOpen] = useState(false);
    const [assignRoomDeviceId, setAssignRoomDeviceId] = useState(null);
    const [assignRoomValue, setAssignRoomValue] = useState('');

    // FE-5: RTSP Config Modal
    const [isRtspModalOpen, setIsRtspModalOpen] = useState(false);
    const [rtspDeviceId, setRtspDeviceId] = useState(null);
    const [rtspConfig, setRtspConfig] = useState({
        rtsp_protocol: 'rtsp',
        rtsp_host: '',
        rtsp_port: '',
        rtsp_path: '/',
        rtsp_username: '',
        rtsp_password: ''
    });

    // FE-5: Token Display Modal (chỉ hiện 1 lần)
    // tokenModalData: { token, deviceName, deviceCode?, urls?: { verify, heartbeat, stranger } }
    const [tokenModalData, setTokenModalData] = useState(null);
    const [copiedField, setCopiedField] = useState(null); // 'token'|'verify'|'heartbeat'|'stranger'|null

    // FE-5: Confirmation Modal (replaces window.confirm)
    const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm, type }

    // UC-51: Device status summary
    const [statusSummary, setStatusSummary] = useState(null);

    // UC-96: AI Config Modal
    const [aiConfigDevice, setAiConfigDevice] = useState(null);

    // FE-AR: Face Terminal first-time configure modal
    const [isFaceConfigModalOpen, setIsFaceConfigModalOpen] = useState(false);
    const [faceConfigDevice, setFaceConfigDevice] = useState(null);
    const [faceConfigForm, setFaceConfigForm] = useState({
        callback_protocol: 'https',
        callback_base_url: '',
        allowed_source_ip: '',
        heartbeat_path: '/heartbeat',
        verify_path: '/verify',
        stranger_path: '/stranger',
        callback_enabled: true,
    });
    const [faceConfigSubmitting, setFaceConfigSubmitting] = useState(false);

    // Filters states
    const [search, setSearch] = useState('');
    const [selectedType, setSelectedType] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedHealth, setSelectedHealth] = useState('');
    const [historyDevice, setHistoryDevice] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [now, setNow] = useState(Date.now());
    // Lượt xe hôm nay theo camera biển số (GET /iot-devices/anpr-stats).
    const [anprToday, setAnprToday] = useState({});
    const [statusToasts, setStatusToasts] = useState([]);
    const [flashIds, setFlashIds] = useState([]);
    const prevStatusRef = useRef(null);
    const [selectedRoomId, setSelectedRoomId] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Form input states
    const [formData, setFormData] = useState({
        deviceCode: '',
        deviceName: '',
        deviceType: 'ip_camera',
        roomId: '',
        ipAddress: '',
        agentVersion: 'v1.0.0'
    });

    // Load rooms and devices
    // silent = cập nhật nền (poll/WebSocket): không hiện spinner, không xoá thông báo lỗi.
    const fetchData = useCallback(async (silent = false) => {
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            const [roomsRes, devicesRes, summaryRes, anprRes] = await Promise.all([
                getRooms({ limit: 100 }),
                getDevices({ limit: 100 }),
                getDeviceStatusSummary().catch(() => null),
                getAnprStats().catch(() => null),
            ]);
            if (anprRes?.success) {
                setAnprToday(Object.fromEntries((anprRes.data || []).map(r => [r.device_id, r.total])));
            }

            if (roomsRes?.success) setRooms(roomsRes.data || []);
            if (devicesRes?.success) {
                const list = devicesRes.data || [];
                const prev = prevStatusRef.current;
                if (prev) {
                    const changed = list.filter(d => prev.has(d.id) && prev.get(d.id) !== d.status);
                    if (changed.length > 0) {
                        const ids = changed.map(d => d.id);
                        setFlashIds(ids);
                        setTimeout(() => setFlashIds(cur => cur.filter(id => !ids.includes(id))), FLASH_MS);
                        const at = new Date();
                        const toasts = changed.map(d => ({ key: `${d.id}-${at.getTime()}`, device: d, at }));
                        setStatusToasts(cur => [...toasts, ...cur].slice(0, 4));
                        setTimeout(() => setStatusToasts(cur => cur.filter(t => !toasts.includes(t))), TOAST_MS);
                    }
                }
                prevStatusRef.current = new Map(list.map(d => [d.id, d.status]));
                setDevicesList(list);
            }
            if (summaryRes?.success) setStatusSummary(summaryRes.data);
            setLastUpdated(Date.now());
        } catch (err) {
            if (!silent) setError(err?.error?.message || err?.message || 'Không thể tải dữ liệu thiết bị và phòng họp.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const poll = setInterval(() => fetchData(true), LIVE_POLL_MS);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        let wsTimer = null;
        const onWs = () => {
            if (wsTimer) return;
            wsTimer = setTimeout(() => { wsTimer = null; fetchData(true); }, WS_REFRESH_DELAY_MS);
        };
        const offAlerts = subscribeToSecurityAlerts(onWs);
        const offNotifications = subscribeToNotificationUpdates(onWs);
        return () => {
            clearInterval(poll);
            clearInterval(tick);
            clearTimeout(wsTimer);
            offAlerts();
            offNotifications();
        };
    }, [fetchData]);

    // Auto-hide alert boxes
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const validateIP = (ip) => {
        const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipPattern.test(ip);
    };

    // Form handlers
    const openRegisterModal = () => {
        setFormData({
            deviceCode: '',
            deviceName: '',
            deviceType: 'ip_camera',
            roomId: '',
            ipAddress: '',
            agentVersion: 'v1.0.0'
        });
        setIsRegisterModalOpen(true);
    };

    const openEditModal = (device) => {
        setSelectedDevice(device);
        setFormData({
            deviceCode: device.device_code || '',
            deviceName: device.device_name || '',
            deviceType: device.device_type || 'ip_camera',
            roomId: device.room_id || '',
            ipAddress: device.ip_address || '',
            agentVersion: device.agent_version || 'v1.0.0'
        });
        setIsEditModalOpen(true);
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        // Validation checks — IP là optional ở BE (CreateIotDeviceDto: @IsOptional() @IsIP()),
        // đặc biệt face_server thường KHÔNG có IP (dùng base_url riêng, cấu hình sau qua modal
        // Face Server). Trước đây bắt buộc nhập IP hợp lệ cho MỌI loại thiết bị nên không thể
        // đăng ký face_server không IP — chỉ validate định dạng khi người dùng CÓ nhập.
        if (formData.ipAddress.trim() && !validateIP(formData.ipAddress.trim())) {
            setError('Địa chỉ IP không đúng định dạng. Ví dụ: 192.168.1.10');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                device_code: formData.deviceCode,
                device_name: formData.deviceName,
                device_type: formData.deviceType,
                ip_address: formData.ipAddress.trim() || undefined,
                metadata_json: {
                    agent_version: formData.agentVersion || 'v1.0.0',
                    ...(formData.deviceType === 'anpr_camera' && {
                        anpr: { lane_direction: formData.laneDirection || 'in', lane_no: 1 },
                    }),
                }
            };
            const res = await registerDevice(payload);
            if (res?.success) {
                setSuccessMessage('Đăng ký thiết bị IoT thành công.');
                setIsRegisterModalOpen(false);
                fetchData();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể đăng ký thiết bị.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể đăng ký thiết bị.');
        } finally {
            setSubmitting(false);
        }
    };

    // Edit IoT Device (UC-IOT-02)
    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (formData.ipAddress.trim() && !validateIP(formData.ipAddress.trim())) {
            setError('Địa chỉ IP không đúng định dạng. Ví dụ: 192.168.1.10');
            return;
        }
        setSubmitting(true);
        try {
            const updatePayload = {
                device_name: formData.deviceName,
                ip_address: formData.ipAddress.trim() || undefined,
            };
            const res = await updateDevice(selectedDevice.id, updatePayload);
            if (res?.success) {
                setSuccessMessage('Cập nhật thông tin cấu hình thành công.');
                setIsEditModalOpen(false);
                fetchData();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể cập nhật thiết bị.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể cập nhật thiết bị.');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleDeviceStatus = (device) => {
        const isOnline = device.status === 'online';
        setConfirmModal({
            title: isOnline ? 'Ngừng kích hoạt thiết bị' : 'Kích hoạt lại thiết bị',
            message: `Bạn có muốn ${isOnline ? 'ngừng kích hoạt (disable)' : 'kích hoạt lại (enable)'} thiết bị ${device.device_code}?`,
            type: isOnline ? 'warning' : 'info',
            onConfirm: async () => {
                setError(null);
                setSuccessMessage(null);
                try {
                    let res;
                    if (isOnline) {
                        res = await disableDevice(device.id);
                    } else {
                        res = await enableDevice(device.id);
                    }
                    if (res?.success) {
                        setSuccessMessage(`Đã ${isOnline ? 'ngừng kích hoạt' : 'kích hoạt lại'} thiết bị thành công.`);
                        fetchData();
                    } else {
                        throw new Error(res?.error?.message || res?.message || 'Không thể chuyển trạng thái thiết bị.');
                    }
                } catch (err) {
                    setError(err?.error?.message || err?.message || 'Không thể chuyển trạng thái thiết bị.');
                }
                setConfirmModal(null);
            }
        });
    };

    // BE trả { ...device, availability: { is_available, check_type, reason_code, message } }
    // — trước đây FE đọc `res.data.isReachable` (field không tồn tại) nên luôn hiện
    // "Không thể kết nối" bất kể kết quả thật, khiến nút Ping vô giá trị. Đọc đúng
    // field + dịch reason_code phổ biến sang tiếng Việt để người dùng biết vì sao lỗi.
    const AVAILABILITY_REASON_VI = {
        HEARTBEAT_NOT_SEEN: 'chưa từng nhận được heartbeat từ thiết bị',
        HEARTBEAT_STALE: 'heartbeat cuối đã quá cũ (>5 phút)',
        DEVICE_ROOM_ASSIGNMENT_REQUIRED: 'thiết bị chưa được gán phòng',
        RTSP_CONFIG_MISSING: 'chưa cấu hình RTSP',
        RTSP_DISABLED: 'RTSP đang bị tắt',
    };
    const handleCheckAvailability = async (device) => {
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await checkDeviceAvailability(device.id);
            if (res?.success && res.data) {
                const av = res.data.availability;
                const isAvailable = av?.is_available === true;
                // Gọi API thành công KHÔNG đồng nghĩa thiết bị kết nối được — trước đây mọi kết
                // quả (kể cả is_available=false) đều đẩy vào successMessage (banner xanh), khiến
                // dòng "Không thể kết nối" hiện màu xanh như tin tốt. Tách rõ: available → banner
                // xanh, không available → banner đỏ (setError) kèm lý do.
                if (isAvailable) {
                    setSuccessMessage(`Thiết bị ${device.device_name}: Có thể kết nối.`);
                } else {
                    const reason = av?.reason_code ? ` (${AVAILABILITY_REASON_VI[av.reason_code] || av.reason_code})` : '';
                    setError(`Thiết bị ${device.device_name}: Không thể kết nối${reason}.`);
                }
                fetchData(); // refresh status
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể kiểm tra kết nối thiết bị.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi kiểm tra kết nối thiết bị.');
        }
    };

    const handleRotateToken = (device) => {
        setConfirmModal({
            title: 'Rotate Token Face Server',
            message: `Bạn có chắc chắn muốn Rotate Token cho Face Server ${device.device_name}? Các thiết bị cũ sẽ mất kết nối nếu không cập nhật token mới.`,
            type: 'warning',
            onConfirm: async () => {
                setError(null);
                setSuccessMessage(null);
                try {
                    const res = await rotateFaceServerToken(device.id);
                    if (res?.success) {
                        // BE trả { device, one_time_callback_token } — trước đây FE đọc
                        // res.data?.token/accessToken (không tồn tại) nên luôn rơi vào chuỗi
                        // giả "Token đã được tạo", không hiện được token thật để cập nhật lại
                        // thiết bị vật lý → tính năng rotate coi như vô dụng dù API chạy đúng.
                        const token = res.data?.one_time_callback_token;
                        const code = device.device_code;
                        setTokenModalData({
                            token,
                            deviceName: device.device_name,
                            deviceCode: code,
                            action: 'rotate',
                            // Rotate sinh token MỚI → 3 URL cũ (nếu có) hết tác dụng ngay lập tức,
                            // nên dựng lại URL mới luôn, giống flow Configure lần đầu.
                            urls: token ? {
                                verify: `${API_BASE_URL}/vf/${code}/${token}`,
                                heartbeat: `${API_BASE_URL}/hb/${code}/${token}`,
                                stranger: `${API_BASE_URL}/sf/${code}/${token}`,
                            } : null,
                        });
                        setCopiedField(null);
                        fetchData();
                    } else {
                        throw new Error(res?.error?.message || res?.message || 'Không thể rotate token.');
                    }
                } catch (err) {
                    setError(err?.error?.message || err?.message || 'Không thể rotate token.');
                }
                setConfirmModal(null);
            }
        });
    };

    // FE-5: Revoke Token handler
    const handleRevokeToken = (device) => {
        setConfirmModal({
            title: 'Thu hồi Token Face Server',
            message: `Bạn có chắc chắn muốn thu hồi (revoke) token hiện tại của ${device.device_name}? Thiết bị sẽ mất kết nối ngay lập tức.`,
            type: 'danger',
            onConfirm: async () => {
                setError(null);
                setSuccessMessage(null);
                try {
                    const res = await revokeFaceServerToken(device.id);
                    if (res?.success) {
                        setSuccessMessage(`Đã thu hồi token của ${device.device_name} thành công.`);
                        fetchData();
                    } else {
                        throw new Error(res?.error?.message || res?.message || 'Không thể thu hồi token.');
                    }
                } catch (err) {
                    setError(err?.error?.message || err?.message || 'Không thể thu hồi token.');
                }
                setConfirmModal(null);
            }
        });
    };

    // FE-5: Assign Room handler
    const handleAssignRoom = async (e) => {
        e.preventDefault();
        if (!assignRoomDeviceId || !assignRoomValue) return;
        setSubmitting(true);
        try {
            const res = await assignDeviceRoom(assignRoomDeviceId, { room_id: assignRoomValue });
            if (res?.success) {
                setSuccessMessage('Đã gán phòng cho thiết bị thành công.');
                setIsAssignRoomModalOpen(false);
                fetchData();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể gán phòng cho thiết bị.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể gán phòng cho thiết bị.');
        } finally {
            setSubmitting(false);
        }
    };

    // FE-5: RTSP Config handler
    const handleRtspConfig = async (e) => {
        e.preventDefault();
        if (!rtspDeviceId || !rtspConfig.rtsp_host.trim() || !rtspConfig.rtsp_path.trim()) return;
        setSubmitting(true);
        try {
            const payload = {
                rtsp_protocol: rtspConfig.rtsp_protocol,
                rtsp_host: rtspConfig.rtsp_host.trim(),
                rtsp_path: rtspConfig.rtsp_path.trim()
            };
            if (rtspConfig.rtsp_port) payload.rtsp_port = parseInt(rtspConfig.rtsp_port, 10);
            if (rtspConfig.rtsp_username) payload.rtsp_username = rtspConfig.rtsp_username;
            if (rtspConfig.rtsp_password) payload.rtsp_password = rtspConfig.rtsp_password;

            const res = await configDeviceRtsp(rtspDeviceId, payload);
            if (res?.success) {
                setSuccessMessage('Đã cập nhật cấu hình RTSP thành công.');
                setIsRtspModalOpen(false);
                fetchData();
            } else {
                throw new Error(res?.error?.message || res?.message || 'Không thể cập nhật cấu hình RTSP.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể cập nhật cấu hình RTSP.');
        } finally {
            setSubmitting(false);
        }
    };

    // FE-5: Copy any text to clipboard by field name
    const handleCopyText = async (text, field) => {
        const doCopy = (t) => {
            try {
                navigator.clipboard.writeText(t);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = t;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
        };
        doCopy(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // FE-AR: Mở form cấu hình face_server — dùng chung cho lần đầu (chưa có config,
    // mọi field trống) VÀ sửa lại sau này (đã có config, prefill từ giá trị cũ; riêng
    // password không bao giờ lấy lại được (BE chỉ trả '***' đã mask) nên luôn để trống
    // — "để trống nếu không đổi" ở BE tự hiểu là giữ nguyên mật khẩu cũ).
    const handleOpenFaceConfig = (device) => {
        const existing = device.metadata_json?.face_server_config || null;
        setFaceConfigDevice(device);
        setFaceConfigForm({
            callback_protocol: existing?.callback_protocol || 'https',
            callback_base_url: existing?.callback_base_url || '',
            allowed_source_ip: existing?.allowed_source_ip || '',
            heartbeat_path: existing?.heartbeat_path || '/heartbeat',
            verify_path: existing?.verify_path || '/verify',
            stranger_path: existing?.stranger_path || '/stranger',
            callback_enabled: existing?.callback_enabled ?? true,
            base_url: existing?.base_url || '',
            username: existing?.username || '',
            password: '',
        });
        setIsFaceConfigModalOpen(true);
    };

    // FE-AR: Submit configure form
    const handleFaceConfigSubmit = async (e) => {
        e.preventDefault();
        setFaceConfigSubmitting(true);
        setError(null);
        try {
            const payload = {
                callback_protocol: faceConfigForm.callback_protocol,
                heartbeat_path: faceConfigForm.heartbeat_path.trim() || '/heartbeat',
                verify_path: faceConfigForm.verify_path.trim() || '/verify',
                stranger_path: faceConfigForm.stranger_path.trim() || '/stranger',
                callback_enabled: faceConfigForm.callback_enabled,
            };
            if (faceConfigForm.callback_base_url.trim()) payload.callback_base_url = faceConfigForm.callback_base_url.trim();
            if (faceConfigForm.allowed_source_ip.trim()) payload.allowed_source_ip = faceConfigForm.allowed_source_ip.trim();
            // Chiều BE→thiết bị (gọi /webs/login của chính camera để upload ảnh/thêm người) —
            // trước đây phải sửa tay DB, giờ gửi kèm ở đây. Bỏ trống → giữ nguyên giá trị cũ
            // (nếu có) hoặc BE tự fallback base_url sang http://ip_address.
            if (faceConfigForm.base_url.trim()) payload.base_url = faceConfigForm.base_url.trim();
            if (faceConfigForm.username.trim()) payload.username = faceConfigForm.username.trim();
            if (faceConfigForm.password.trim()) payload.password = faceConfigForm.password.trim();

            const res = await configureFaceTerminal(faceConfigDevice.id, payload);
            if (res?.success) {
                const token = res.data?.one_time_callback_token;
                const code = faceConfigDevice.device_code;
                setTokenModalData({
                    token,
                    deviceName: faceConfigDevice.device_name,
                    deviceCode: code,
                    action: 'configure',
                    urls: token ? {
                        verify: `${API_BASE_URL}/vf/${code}/${token}`,
                        heartbeat: `${API_BASE_URL}/hb/${code}/${token}`,
                        stranger: `${API_BASE_URL}/sf/${code}/${token}`,
                    } : null,
                });
                setCopiedField(null);
                setIsFaceConfigModalOpen(false);
                fetchData();
            } else {
                const errCode = res?.error?.code || '';
                if (errCode === 'DEVICE_ROOM_ASSIGNMENT_REQUIRED') throw new Error('Cần gán phòng cho thiết bị trước khi cấu hình.');
                else if (errCode === 'DEVICE_TYPE_NOT_FACE_SERVER') throw new Error('Thiết bị này không phải Face Server.');
                else throw new Error(res?.error?.message || res?.message || 'Không thể cấu hình thiết bị.');
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không thể cấu hình thiết bị.');
        } finally {
            setFaceConfigSubmitting(false);
        }
    };

    // Helper translation dicts
    const TYPE_MAP = {
        'ip_camera':       'Camera AI',
        'door_camera':     'Camera kiểm soát vào/ra',
        'room_camera':     'Camera phòng họp',
        'anpr_camera':     'Camera nhận diện biển số',
        'face_server':     'Máy chủ Face Server',
        'microphone':      'Micro ghi âm',
        'capture_agent':   'Capture Agent',
        'occupancy_sensor':'Cảm biến đếm người',
        'display':         'Màn hình hiển thị',
    };
    const DEVICE_CONFIG = {
        'ip_camera':        { label: 'Camera AI',     accentBar: 'bg-blue-400',    border: 'border-blue-100',    badgeBg: 'bg-blue-50',    badgeText: 'text-blue-700'    },
        'door_camera':      { label: 'Camera vào/ra', accentBar: 'bg-violet-400',  border: 'border-violet-100',  badgeBg: 'bg-violet-50',  badgeText: 'text-violet-700'  },
        'room_camera':      { label: 'Camera phòng',  accentBar: 'bg-indigo-400',  border: 'border-indigo-100',  badgeBg: 'bg-indigo-50',  badgeText: 'text-indigo-700'  },
        'anpr_camera':      { label: 'Camera biển số', accentBar: 'bg-orange-400', border: 'border-orange-100', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700' },
        'face_server':      { label: 'Face Server',   accentBar: 'bg-emerald-400', border: 'border-emerald-100', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700' },
        'microphone':       { label: 'Micro',         accentBar: 'bg-orange-400',  border: 'border-orange-100',  badgeBg: 'bg-orange-50',  badgeText: 'text-orange-700'  },
        'capture_agent':    { label: 'Capture Agent', accentBar: 'bg-sky-400',     border: 'border-sky-100',     badgeBg: 'bg-sky-50',     badgeText: 'text-sky-700'     },
        'occupancy_sensor': { label: 'Cảm biến',      accentBar: 'bg-rose-400',    border: 'border-rose-100',    badgeBg: 'bg-rose-50',    badgeText: 'text-rose-700'    },
        'display':          { label: 'Màn hình',      accentBar: 'bg-amber-400',   border: 'border-amber-100',   badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700'   },
    };
    const DEVICE_CFG_DEFAULT = { label: 'Thiết bị', accentBar: 'bg-slate-400', border: 'border-platinum-tint', badgeBg: 'bg-slate-50', badgeText: 'text-steel-gray' };

    // Filtered list
    const filteredDevices = devicesList.filter(device => {
        // face_server thường không có ip_address (chỉ dùng base_url) → null. Trước đây gọi
        // thẳng .includes() trên null làm crash trắng màn hình ngay khi gõ ô tìm kiếm nếu
        // danh sách có bất kỳ thiết bị nào chưa có IP.
        const matchSearch = search.trim() === '' ||
            (device.device_code || '').toLowerCase().includes(search.toLowerCase()) ||
            (device.device_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (device.ip_address || '').includes(search);
        const matchType = selectedType === '' || device.device_type === selectedType;
        const matchStatus = selectedStatus === '' || device.status === selectedStatus;
        const matchRoom = selectedRoomId === '' || device.room_id === selectedRoomId;
        const matchHealth = selectedHealth === '' || device.health_status === selectedHealth;
        return matchSearch && matchType && matchStatus && matchRoom && matchHealth;
    });

    const offlineDevices = devicesList.filter(d => d.status === 'offline');
    const totalPages = Math.ceil(filteredDevices.length / limit) || 1;
    const paginatedDevices = filteredDevices.slice((page - 1) * limit, page * limit);

    return (
        <div className="space-y-6 animate-fade-in-up">
            
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Cpu className="w-3.5 h-3.5" />
                        IoT
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Quản lý thiết bị IoT</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Khai báo, giám sát tình trạng sức khỏe kết nối và điều phối RTSP stream cho camera/face server.
                    </p>
                </div>
                <button
                    onClick={openRegisterModal}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Đăng ký thiết bị
                </button>
            </div>

            {/* Dải trạng thái live */}
            <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-platinum-tint px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-slate-blue">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="font-semibold text-midnight-indigo">Đang theo dõi trực tiếp</span>
                    <span>· cập nhật {lastUpdated ? timeAgo(lastUpdated, now) : '...'}</span>
                </div>
                <button
                    onClick={() => fetchData(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-action-blue hover:bg-blue-50 transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Làm mới
                </button>
            </div>

            {/* UC-51: Device status summary cards */}
            {statusSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-white rounded-xl border border-platinum-tint p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                            <Cpu className="w-4 h-4 text-action-blue" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-blue font-medium">Tổng thiết bị</p>
                            <p className="text-xl font-bold text-midnight-indigo leading-tight">{statusSummary.total ?? devicesList.length}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-platinum-tint p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-blue font-medium">Online</p>
                            <p className="text-xl font-bold text-green-600 leading-tight">{statusSummary.online ?? 0}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-platinum-tint p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-blue font-medium">Offline</p>
                            <p className="text-xl font-bold text-red-600 leading-tight">{statusSummary.offline ?? 0}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-platinum-tint p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-blue font-medium">Vô hiệu</p>
                            {/* BE trước đây không tách riêng disabled khỏi "unknown" nên field
                                này luôn undefined → hiện 0 dù có thiết bị bị vô hiệu thật. Đã
                                sửa BE trả đúng field `disabled`. */}
                            <p className="text-xl font-bold text-steel-gray leading-tight">{statusSummary.disabled ?? 0}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-platinum-tint p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-blue font-medium">Bảo trì</p>
                            <p className="text-xl font-bold text-amber-600 leading-tight">{statusSummary.maintenance ?? 0}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification messages */}
            {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-3 animate-pulse-soft">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}


            {/* Device cards / loading */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-platinum-tint shadow-sm-1">
                    <div className="w-10 h-10 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin"></div>
                    <p className="text-slate-blue text-sm mt-4">Đang tải dữ liệu thiết bị và phòng họp...</p>
                </div>
            ) : (
                <>
                    {/* Filter bar */}
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
                        <div className="relative flex-1 min-w-0">
                            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-steel-gray">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Tìm theo tên, mã thiết bị hoặc địa chỉ IP..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="pl-9 pr-4 py-2 w-full border border-platinum-tint rounded-xl text-sm text-midnight-indigo placeholder:text-steel-gray focus:outline-none focus:border-action-blue"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <select
                                value={selectedRoomId}
                                onChange={(e) => { setSelectedRoomId(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue bg-white"
                            >
                                <option value="">Tất cả phòng</option>
                                {rooms.map(room => (
                                    <option key={room.roomId} value={room.roomId}>{room.roomName}</option>
                                ))}
                            </select>
                            <select
                                value={selectedType}
                                onChange={(e) => { setSelectedType(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue bg-white"
                            >
                                <option value="">Tất cả loại</option>
                                <option value="ip_camera">Camera AI</option>
                                <option value="door_camera">Camera vào/ra</option>
                                <option value="room_camera">Camera phòng</option>
                                <option value="anpr_camera">Camera biển số</option>
                                <option value="face_server">Face Server</option>
                            </select>
                            <select
                                value={selectedStatus}
                                onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue bg-white"
                            >
                                <option value="">Tất cả trạng thái</option>
                                <option value="online">Online</option>
                                <option value="offline">Offline</option>
                                <option value="disabled">Vô hiệu</option>
                                <option value="maintenance">Bảo trì</option>
                            </select>
                            <select
                                value={selectedHealth}
                                onChange={(e) => { setSelectedHealth(e.target.value); setPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm text-slate-blue focus:outline-none focus:border-action-blue bg-white"
                            >
                                <option value="">Tất cả sức khoẻ</option>
                                {Object.entries(HEALTH_CONFIG).map(([value, h]) => (
                                    <option key={value} value={value}>{h.label}</option>
                                ))}
                            </select>
                        </div>
                        {filteredDevices.length > 0 && (
                            <span className="text-xs text-steel-gray shrink-0 font-semibold tabular-nums">
                                {filteredDevices.length} thiết bị
                            </span>
                        )}
                    </div>

                    {/* Sự cố đang mở: thiết bị đang mất kết nối */}
                    {offlineDevices.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm font-bold text-red-700">
                                    ⚠ {offlineDevices.length} thiết bị đang mất kết nối
                                </p>
                                <Link to="/system-admin/security-alerts" className="text-xs font-semibold text-red-700 hover:underline">
                                    Xem cảnh báo
                                </Link>
                            </div>
                            <ul className="divide-y divide-red-100">
                                {offlineDevices.slice(0, 5).map(d => (
                                    <li key={d.id} className="py-1.5 flex items-center justify-between gap-3">
                                        <span className="text-xs text-red-800 min-w-0 truncate">
                                            <span className="font-mono font-semibold">{d.device_code}</span> · {d.device_name}
                                            <span className="text-red-600"> · hoạt động lần cuối {timeAgo(d.last_seen_at, now)}</span>
                                        </span>
                                        <span className="flex items-center gap-1 shrink-0">
                                            {['ip_camera', 'face_server'].includes(d.device_type) && (
                                                <button onClick={() => handleCheckAvailability(d)} className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-700 hover:bg-red-100">
                                                    Ping lại
                                                </button>
                                            )}
                                            <button onClick={() => setHistoryDevice(d)} className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-700 hover:bg-red-100">
                                                Lịch sử
                                            </button>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {offlineDevices.length > 5 && (
                                <button onClick={() => { setSelectedStatus('offline'); setPage(1); }} className="mt-1 text-[11px] font-semibold text-red-700 hover:underline">
                                    và {offlineDevices.length - 5} thiết bị khác — lọc tất cả
                                </button>
                            )}
                        </div>
                    )}

                    {/* Empty state */}
                    {filteredDevices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-platinum-tint shadow-sm-1">
                            <div className="w-14 h-14 rounded-2xl bg-cloud-mist flex items-center justify-center mb-4">
                                <Cpu className="w-7 h-7 text-steel-gray" />
                            </div>
                            <p className="text-midnight-indigo font-semibold text-sm">Không tìm thấy thiết bị</p>
                            <p className="text-steel-gray text-xs mt-1">Thử thay đổi bộ lọc hoặc đăng ký thiết bị mới.</p>
                        </div>
                    ) : (
                        <>
                            {/* Card grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {paginatedDevices.map(device => {
                                    const cfg = DEVICE_CONFIG[device.device_type] || DEVICE_CFG_DEFAULT;
                                    const assignedRoom = rooms.find(r => r.roomId === device.room_id);
                                    return (
                                        <div key={device.id} className={`bg-white rounded-2xl border ${flashIds.includes(device.id) ? 'border-red-400 ring-2 ring-red-300' : cfg.border} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col`}>
                                            {/* Accent strip */}
                                            <div className={`${cfg.accentBar} h-[3px] shrink-0`} />

                                            <div className="p-5 flex flex-col gap-3.5 flex-1">
                                                {/* Row: type badge + status */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase ${cfg.badgeBg} ${cfg.badgeText}`}>
                                                        {cfg.label}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="relative flex h-2 w-2">
                                                            {device.status === 'online' && (
                                                                <>
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                                </>
                                                            )}
                                                            {device.status === 'offline' && (
                                                                <>
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                                </>
                                                            )}
                                                            {device.status === 'disabled' && (
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400"></span>
                                                            )}
                                                            {device.status === 'maintenance' && (
                                                                <>
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                                </>
                                                            )}
                                                        </span>
                                                        <span className={`text-[11px] font-bold ${
                                                            device.status === 'online' ? 'text-green-600' :
                                                            device.status === 'disabled' ? 'text-gray-400' :
                                                            device.status === 'maintenance' ? 'text-amber-600' :
                                                            'text-red-500'
                                                        }`}>
                                                            {device.status === 'online' ? 'ONLINE' :
                                                             device.status === 'disabled' ? 'VÔ HIỆU' :
                                                             device.status === 'maintenance' ? 'BẢO TRÌ' :
                                                             'OFFLINE'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Name + code */}
                                                <div>
                                                    <h3 className="text-[15px] font-bold text-midnight-indigo leading-snug line-clamp-1">{device.device_name}</h3>
                                                    <p className="mt-0.5 text-[10px] font-mono text-steel-gray tracking-wider">{device.device_code}</p>
                                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${(HEALTH_CONFIG[device.health_status] || HEALTH_CONFIG.unknown).cls}`}>
                                                            {(HEALTH_CONFIG[device.health_status] || HEALTH_CONFIG.unknown).label}
                                                        </span>
                                                        <span className="text-[11px] text-slate-blue">
                                                            Hoạt động lần cuối: <span className="font-semibold text-midnight-indigo">{timeAgo(device.last_seen_at, now)}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Room + Network */}
                                                {device.device_type === 'anpr_camera' && (() => {
                                                    const anpr = getAnprInfo(device);
                                                    return (
                                                        <div className="flex items-center justify-between gap-2 rounded-xl bg-orange-50 px-3 py-2 text-[11px]">
                                                            <span className="font-semibold text-orange-700">
                                                                {LANE_LABEL[anpr.laneDirection]} · Làn {anpr.laneNo}
                                                            </span>
                                                            <Link to="/system-admin/anpr-management" className="text-orange-700 hover:underline">
                                                                Hôm nay: <strong className="tabular-nums">{anprToday[device.id] ?? 0}</strong> lượt xe →
                                                            </Link>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="border-t border-platinum-tint pt-3 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <svg className="w-3.5 h-3.5 text-steel-gray shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                        </svg>
                                                        {assignedRoom ? (
                                                            <span className="text-xs font-semibold text-midnight-indigo truncate">{assignedRoom.roomName}</span>
                                                        ) : (
                                                            <span className="text-xs text-steel-gray italic">Chưa gán phòng</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-start gap-2">
                                                        <svg className="w-3.5 h-3.5 text-steel-gray shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                        </svg>
                                                        <div className="min-w-0">
                                                            {device.ip_address ? (
                                                                <p className="text-[11px] font-mono font-semibold text-midnight-indigo">{device.ip_address}</p>
                                                            ) : (
                                                                <p className="text-[11px] italic text-steel-gray">Chưa có IP</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="border-t border-platinum-tint pt-3 flex items-center justify-between gap-2 mt-auto">
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            onClick={() => { setAssignRoomDeviceId(device.id); setAssignRoomValue(device.room_id || ''); setIsAssignRoomModalOpen(true); }}
                                                            title="Gán phòng"
                                                            className="p-2 rounded-lg text-steel-gray hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                            </svg>
                                                        </button>
                                                        {/* BE checkAvailability() chỉ hỗ trợ ip_camera/face_server (409
                                                            DEVICE_TYPE_NOT_CAMERA cho loại khác) — trước đây nút hiện ở MỌI
                                                            loại thiết bị nên luôn báo lỗi vô nghĩa với microphone/sensor/... */}
                                                        {['ip_camera', 'face_server'].includes(device.device_type) && (
                                                            <button
                                                                onClick={() => handleCheckAvailability(device)}
                                                                title="Kiểm tra kết nối (Ping)"
                                                                className="p-2 rounded-lg text-steel-gray hover:text-green-600 hover:bg-green-50 transition-colors"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setHistoryDevice(device)}
                                                            title="Lịch sử kết nối"
                                                            className="p-2 rounded-lg text-steel-gray hover:text-sky-600 hover:bg-sky-50 transition-colors"
                                                        >
                                                            <Activity className="w-4 h-4" />
                                                        </button>
                                                        {device.device_type === 'face_server' && (
                                                            <>
                                                            {!device.metadata_json?.face_server_config ? (
                                                                <button
                                                                    onClick={() => handleOpenFaceConfig(device)}
                                                                    title="Cấu hình Face Server lần đầu"
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                                                                    </svg>
                                                                    Config
                                                                </button>
                                                            ) : (
                                                                <>
                                                                <button onClick={() => handleOpenFaceConfig(device)} title="Sửa cấu hình (base_url/username/password/callback)" className="p-2 rounded-lg text-steel-gray hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                </button>
                                                                <button onClick={() => handleRotateToken(device)} title="Tạo lại Token" className="p-2 rounded-lg text-steel-gray hover:text-amber-600 hover:bg-amber-50 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                </button>
                                                                <button onClick={() => handleRevokeToken(device)} title="Thu hồi Token" className="p-2 rounded-lg text-steel-gray hover:text-red-600 hover:bg-red-50 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                    </svg>
                                                                </button>
                                                                </>
                                                            )}
                                                            </>
                                                        )}
                                                        {CAMERA_TYPES.includes(device.device_type) && (
                                                            <>
                                                            <Link to={`/system-admin/camera-recording?camera=${device.id}`} title="Lịch ghi hình & lưu trữ" className="p-2 rounded-lg text-steel-gray hover:text-action-blue hover:bg-blue-50 transition-colors">
                                                                <Film className="w-4 h-4" />
                                                            </Link>
                                                            <button onClick={() => setAiConfigDevice(device)} title="Cấu hình AI Camera" className="p-2 rounded-lg text-steel-gray hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const saved = device.metadata_json?.rtsp_config || {};
                                                                    setRtspDeviceId(device.id);
                                                                    setRtspConfig({
                                                                        rtsp_protocol: saved.rtsp_protocol || 'rtsp',
                                                                        rtsp_host: saved.rtsp_host || '',
                                                                        rtsp_port: saved.rtsp_port ? String(saved.rtsp_port) : '',
                                                                        rtsp_path: saved.rtsp_path || '/',
                                                                        rtsp_username: saved.rtsp_username || '',
                                                                        rtsp_password: ''
                                                                    });
                                                                    setIsRtspModalOpen(true);
                                                                }}
                                                                title="Cấu hình RTSP"
                                                                className="p-2 rounded-lg text-steel-gray hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            onClick={() => toggleDeviceStatus(device)}
                                                            title={device.status === 'online' ? 'Ngừng kích hoạt' : 'Kích hoạt lại'}
                                                            className={`p-2 rounded-lg transition-colors ${device.status === 'online' ? 'text-steel-gray hover:text-orange-600 hover:bg-orange-50' : 'text-steel-gray hover:text-emerald-600 hover:bg-emerald-50'}`}
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(device)}
                                                            title="Chỉnh sửa thiết bị"
                                                            className="p-2 rounded-lg text-steel-gray hover:text-action-blue hover:bg-blue-50 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            {filteredDevices.length > limit && (
                                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-1 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-blue font-medium">Số thẻ:</span>
                                        <select
                                            value={limit}
                                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                                            className="px-2 py-1 border border-platinum-tint rounded-lg text-xs text-slate-blue focus:outline-none focus:border-action-blue bg-white font-semibold"
                                        >
                                            <option value={9}>9</option>
                                            <option value={12}>12</option>
                                            <option value={24}>24</option>
                                        </select>
                                        <span className="text-xs text-slate-blue tabular-nums">
                                            {(page - 1) * limit + 1}–{Math.min(page * limit, filteredDevices.length)} / {filteredDevices.length}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            disabled={page <= 1}
                                            onClick={() => setPage(page - 1)}
                                            className="px-3 py-1.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Trước
                                        </button>
                                        <span className="px-3 py-1.5 text-xs font-bold text-midnight-indigo tabular-nums">
                                            {page} / {totalPages}
                                        </span>
                                        <button
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(page + 1)}
                                            className="px-3 py-1.5 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Sau
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* REGISTER MODAL */}
            {isRegisterModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Đăng ký thiết bị mới</h3>
                            <button onClick={() => setIsRegisterModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã thiết bị</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.deviceCode}
                                    onChange={(e) => setFormData({...formData, deviceCode: e.target.value})}
                                    placeholder="Ví dụ: CAM-ROOM-101"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên thiết bị</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.deviceName}
                                    onChange={(e) => setFormData({...formData, deviceName: e.target.value})}
                                    placeholder="Ví dụ: Camera chính Phòng 101"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                />
                            </div>
                            <p className="text-[10px] text-slate-blue">Sau khi đăng ký, dùng nút bút chì tím để cấu hình RTSP cho camera.</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại thiết bị</label>
                                    <select
                                        value={formData.deviceType}
                                        onChange={(e) => setFormData({...formData, deviceType: e.target.value})}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                    >
                                        <option value="ip_camera">Camera AI</option>
                                        <option value="door_camera">Camera kiểm soát vào/ra</option>
                                        <option value="room_camera">Camera phòng</option>
                                        <option value="anpr_camera">Camera nhận diện biển số</option>
                                        <option value="face_server">Máy chủ Face Server</option>
                                    </select>
                                </div>
                                {formData.deviceType === 'anpr_camera' && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Hướng làn</label>
                                        <select
                                            value={formData.laneDirection || 'in'}
                                            onChange={(e) => setFormData({ ...formData, laneDirection: e.target.value })}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                        >
                                            {Object.entries(LANE_LABEL).map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                                Gán phòng cho thiết bị sau khi tạo — dùng nút <strong>Gán phòng</strong> (icon tòa nhà) trong danh sách.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                                        Địa chỉ IP {formData.deviceType !== 'face_server' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="text"
                                        required={formData.deviceType !== 'face_server'}
                                        value={formData.ipAddress}
                                        onChange={(e) => setFormData({...formData, ipAddress: e.target.value})}
                                        placeholder={formData.deviceType === 'face_server' ? '192.168.1.50 (tuỳ chọn — có thể để trống, cấu hình base_url riêng sau)' : '192.168.1.50'}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsRegisterModalOpen(false)}
                                    className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                                >
                                    {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* EDIT MODAL */}
            {isEditModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 max-w-md w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo">Cấu hình thông tin thiết bị</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mã thiết bị (Read-only)</label>
                                <input type="text" disabled value={formData.deviceCode} className="w-full px-3 py-2 border border-platinum-tint bg-cloud-mist rounded-xl text-sm text-steel-gray focus:outline-none cursor-not-allowed" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Tên thiết bị</label>
                                <input type="text" required value={formData.deviceName} onChange={(e) => setFormData({...formData, deviceName: e.target.value})} placeholder="Ví dụ: Camera chính Phòng 101" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Loại thiết bị</label>
                                <div className="px-3 py-2 border border-platinum-tint bg-cloud-mist rounded-xl text-sm text-steel-gray flex items-center justify-between">
                                    <span>{TYPE_MAP[formData.deviceType] || formData.deviceType}</span>
                                    <span className="text-[10px] text-slate-blue ml-2">(không thể đổi sau khi tạo)</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">
                                    Địa chỉ IP {formData.deviceType !== 'face_server' && <span className="text-red-500">*</span>}
                                </label>
                                <input type="text" required={formData.deviceType !== 'face_server'} value={formData.ipAddress} onChange={(e) => setFormData({...formData, ipAddress: e.target.value})} placeholder="192.168.1.50" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-platinum-tint mt-4">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-colors">Hủy</button>
                                <button type="submit" disabled={submitting} className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-colors">{submitting ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* FE-5: ASSIGN ROOM MODAL */}
            {isAssignRoomModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-sm">Gán phòng cho thiết bị</h3>
                            <button onClick={() => setIsAssignRoomModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleAssignRoom} className="p-6 space-y-4">
                            <div>
                                <label htmlFor="assign-room-select" className="block text-xs font-bold text-slate-blue uppercase mb-1">Chọn phòng họp</label>
                                <select id="assign-room-select" value={assignRoomValue} onChange={(e) => setAssignRoomValue(e.target.value)} required className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white">
                                    <option value="">-- Chọn phòng --</option>
                                    {rooms.map(room => (<option key={room.roomId} value={room.roomId}>{room.roomName}</option>))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsAssignRoomModalOpen(false)} className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold">Hủy</button>
                                <button type="submit" disabled={submitting || !assignRoomValue} className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold disabled:opacity-50">{submitting ? 'Đang gán...' : 'Gán phòng'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* FE-5: RTSP CONFIG MODAL */}
            {isRtspModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-md w-full overflow-hidden animate-fade-in-up">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo text-sm">Cấu hình RTSP Stream</h3>
                            <button onClick={() => setIsRtspModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleRtspConfig} className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Protocol</label>
                                    <select value={rtspConfig.rtsp_protocol} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_protocol: e.target.value})} className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white">
                                        <option value="rtsp">rtsp://</option>
                                        <option value="rtsps">rtsps://</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Host <span className="text-red-500">*</span></label>
                                    <input type="text" required value={rtspConfig.rtsp_host} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_host: e.target.value})} placeholder="192.168.1.50" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Port</label>
                                    <input type="number" min="1" max="65535" value={rtspConfig.rtsp_port} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_port: e.target.value})} placeholder="554" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Path <span className="text-red-500">*</span></label>
                                    <input type="text" required value={rtspConfig.rtsp_path} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_path: e.target.value})} placeholder="/live/main" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue" />
                                    <p className="text-[10px] text-slate-blue mt-1">Bắt đầu bằng /</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Username</label>
                                    <input type="text" value={rtspConfig.rtsp_username} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_username: e.target.value})} placeholder="admin" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Password</label>
                                    <input type="password" value={rtspConfig.rtsp_password} onChange={(e) => setRtspConfig({...rtspConfig, rtsp_password: e.target.value})} placeholder="••••••••" className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue" />
                                    <p className="text-[10px] text-slate-blue mt-1">Bỏ trống nếu không đổi mật khẩu.</p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsRtspModalOpen(false)} className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold">Hủy</button>
                                <button type="submit" disabled={submitting || !rtspConfig.rtsp_host.trim() || !rtspConfig.rtsp_path.trim()} className="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold disabled:opacity-50">{submitting ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* TOKEN DISPLAY MODAL — chỉ hiện 1 lần, hỗ trợ cả Rotate (token only) và Configure (token + 3 URLs) */}
            {tokenModalData && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-fade-in-up flex flex-col">
                        <div className="bg-amber-50 p-6 text-center border-b border-amber-100 shrink-0">
                            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                            </div>
                            <h2 className="text-lg font-bold text-amber-900">
                                {tokenModalData.action === 'rotate' ? 'Đã tạo Token mới — cập nhật lại thiết bị' : 'Cấu hình Face Server thành công'}
                            </h2>
                            <p className="text-xs text-amber-700 mt-1">Thiết bị: {tokenModalData.deviceName}</p>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                            {/* Cảnh báo one-time */}
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-semibold text-center">
                                ⚠ Lưu lại ngay — sẽ không hiển thị lại được. Nếu mất, phải cấu hình lại từ đầu (token cũ sẽ mất tác dụng).
                            </div>

                            {/* Token */}
                            {tokenModalData.token && (
                                <div>
                                    <p className="text-xs font-bold text-slate-blue uppercase mb-1">Callback Token</p>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-slate-900 rounded-xl px-4 py-3 font-mono text-sm text-green-400 break-all select-all">
                                            {tokenModalData.token}
                                        </div>
                                        <button
                                            onClick={() => handleCopyText(tokenModalData.token, 'token')}
                                            title="Sao chép token"
                                            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all ${copiedField === 'token' ? 'bg-green-600 text-white' : 'bg-action-blue hover:bg-glacier-blue text-white'}`}
                                        >
                                            {copiedField === 'token' ? '✓ Đã sao chép' : 'Sao chép'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 3 Callback URLs — chỉ hiện khi Configure (không phải Rotate) */}
                            {tokenModalData.urls && (
                                <div className="space-y-3">
                                    <p className="text-xs font-bold text-slate-blue uppercase">URL Callback (điền vào cấu hình thiết bị vật lý)</p>
                                    <p className="text-[10px] text-slate-blue bg-blue-50 rounded-lg p-2">
                                        Các URL này đã bao gồm device_code và token. Sao chép trực tiếp vào từng field tương ứng trên thiết bị.
                                    </p>

                                    {[
                                        { label: 'Verify URL', key: 'verify', url: tokenModalData.urls.verify },
                                        { label: 'Heartbeat URL', key: 'heartbeat', url: tokenModalData.urls.heartbeat },
                                        { label: 'Stranger URL', key: 'stranger', url: tokenModalData.urls.stranger },
                                    ].map(({ label, key, url }) => (
                                        <div key={key}>
                                            <p className="text-[10px] font-bold text-slate-blue mb-1">{label}</p>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-slate-100 rounded-lg px-3 py-2 font-mono text-[11px] text-midnight-indigo break-all select-all">
                                                    {url}
                                                </div>
                                                <button
                                                    onClick={() => handleCopyText(url, key)}
                                                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all ${copiedField === key ? 'bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}
                                                >
                                                    {copiedField === key ? '✓' : 'Copy'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-platinum-tint bg-cloud-mist/20 text-right shrink-0">
                            <button onClick={() => setTokenModalData(null)} className="px-4 py-2 text-xs font-bold text-slate-blue hover:text-midnight-indigo">Đã lưu, đóng lại</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* UC-96 + 2.2.6: AI CONFIG MODAL */}
            {aiConfigDevice && (
                <CameraAiConfigModal
                    device={aiConfigDevice}
                    onClose={() => setAiConfigDevice(null)}
                    onSaved={(msg) => {
                        setSuccessMessage(msg);
                        setAiConfigDevice(null);
                        fetchData();
                    }}
                />
            )}

            {/* FE-AR: FACE TERMINAL CONFIGURE MODAL */}
            {isFaceConfigModalOpen && faceConfigDevice && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    {/* max-h + flex-col: trước đây modal không giới hạn chiều cao, nội dung dài
                        (đã thêm section base_url/username/password) đẩy phần header (nút đóng X)
                        ra khỏi khung nhìn khi màn hình thấp — không cuộn được để thấy lại, kẹt
                        modal. Giờ header/footer cố định, chỉ phần giữa cuộn. */}
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden animate-fade-in-up flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50 shrink-0">
                            <div>
                                <h3 className="font-bold text-midnight-indigo text-sm">
                                    {faceConfigDevice.metadata_json?.face_server_config ? 'Sửa cấu hình Face Server' : 'Cấu hình Face Server lần đầu'}
                                </h3>
                                <p className="text-[10px] text-slate-blue mt-0.5">{faceConfigDevice.device_name} · {faceConfigDevice.device_code}</p>
                            </div>
                            <button onClick={() => setIsFaceConfigModalOpen(false)} className="text-slate-blue hover:text-midnight-indigo">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleFaceConfigSubmit} className="flex flex-col flex-1 min-h-0">
                        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                            {faceConfigDevice.metadata_json?.face_server_config && (
                                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    ⚠ Lưu lại sẽ tạo <strong>Token mới</strong> — token cũ và mọi URL đang dùng trên thiết bị vật lý sẽ mất tác dụng ngay, cần cập nhật lại thiết bị bằng token mới sau khi lưu.
                                </div>
                            )}
                            {/* callback_protocol */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Protocol <span className="text-red-500">*</span></label>
                                    <select
                                        value={faceConfigForm.callback_protocol}
                                        onChange={(e) => setFaceConfigForm(f => ({ ...f, callback_protocol: e.target.value }))}
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue bg-white"
                                    >
                                        <option value="https">https</option>
                                        <option value="http">http</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Callback Base URL</label>
                                    <input
                                        type="text"
                                        value={faceConfigForm.callback_base_url}
                                        onChange={(e) => setFaceConfigForm(f => ({ ...f, callback_base_url: e.target.value }))}
                                        placeholder="https://your-server.com"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            {/* allowed_source_ip */}
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Allowed Source IP</label>
                                <input
                                    type="text"
                                    value={faceConfigForm.allowed_source_ip}
                                    onChange={(e) => setFaceConfigForm(f => ({ ...f, allowed_source_ip: e.target.value }))}
                                    placeholder="10.0.5.20 (để trống nếu không chắc IP thiết bị)"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue"
                                />
                                <p className="text-[10px] text-amber-600 mt-1">⚠ Nếu điền sai IP, mọi callback từ thiết bị sẽ bị chặn 403. Để trống để bỏ qua kiểm tra.</p>
                            </div>

                            {/* paths */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-slate-blue uppercase">Callback Paths (chỉ để lưu tham chiếu)</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Verify Path', key: 'verify_path' },
                                        { label: 'Heartbeat Path', key: 'heartbeat_path' },
                                        { label: 'Stranger Path', key: 'stranger_path' },
                                    ].map(({ label, key }) => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">{label} <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                required
                                                value={faceConfigForm[key]}
                                                onChange={(e) => setFaceConfigForm(f => ({ ...f, [key]: e.target.value }))}
                                                placeholder="/path"
                                                className="w-full px-2 py-2 border border-platinum-tint rounded-xl text-xs font-mono focus:outline-none focus:border-action-blue"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-blue">URL thật server lắng nghe cố định: <span className="font-mono">/api/v1/vf/</span>, <span className="font-mono">/api/v1/hb/</span>, <span className="font-mono">/api/v1/sf/</span> — không phụ thuộc vào giá trị nhập ở đây.</p>
                            </div>

                            {/* base_url/username/password — chiều BE→thiết bị (gọi API camera để upload ảnh/thêm người) */}
                            <div className="space-y-3 pt-3 border-t border-platinum-tint">
                                <p className="text-xs font-bold text-slate-blue uppercase">Đăng nhập thiết bị (để hệ thống gọi ngược vào camera)</p>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Device Base URL</label>
                                    <input
                                        type="text"
                                        value={faceConfigForm.base_url}
                                        onChange={(e) => setFaceConfigForm(f => ({ ...f, base_url: e.target.value }))}
                                        placeholder="http://192.168.0.12:3000 (để trống dùng IP thiết bị, cổng 80)"
                                        className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={faceConfigForm.username}
                                            onChange={(e) => setFaceConfigForm(f => ({ ...f, username: e.target.value }))}
                                            placeholder="admin"
                                            autoComplete="off"
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={faceConfigForm.password}
                                            onChange={(e) => setFaceConfigForm(f => ({ ...f, password: e.target.value }))}
                                            placeholder="••••••"
                                            autoComplete="new-password"
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-mono focus:outline-none focus:border-action-blue"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-blue">Để trống nếu không đổi (giữ nguyên giá trị đã cấu hình trước đó). Mật khẩu được mã hoá trước khi lưu, không hiển thị lại sau khi lưu.</p>
                            </div>

                            {/* callback_enabled */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div
                                    onClick={() => setFaceConfigForm(f => ({ ...f, callback_enabled: !f.callback_enabled }))}
                                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${faceConfigForm.callback_enabled ? 'bg-action-blue' : 'bg-platinum-tint'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${faceConfigForm.callback_enabled ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-midnight-indigo">Bật callback ngay</p>
                                    <p className="text-[10px] text-slate-blue">callback_enabled — mặc định bật</p>
                                </div>
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 p-4 border-t border-platinum-tint bg-cloud-mist/20 shrink-0">
                            <button type="button" onClick={() => setIsFaceConfigModalOpen(false)} className="px-4 py-2 border border-platinum-tint text-slate-blue hover:bg-cloud-mist rounded-xl text-xs font-bold">Hủy</button>
                            <button
                                type="submit"
                                disabled={faceConfigSubmitting}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                            >
                                {faceConfigSubmitting ? 'Đang lưu...' : (faceConfigDevice.metadata_json?.face_server_config ? 'Lưu & Tạo Token mới' : 'Cấu hình & Lấy Token')}
                            </button>
                        </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* FE-5: CONFIRMATION MODAL (replaces window.confirm) */}
            {confirmModal && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/50 backdrop-blur-md p-4">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up p-6 text-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                            confirmModal.type === 'danger' ? 'bg-red-100 text-red-600' :
                            confirmModal.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                            'bg-blue-100 text-action-blue'
                        }`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="font-bold text-midnight-indigo text-base mb-2">{confirmModal.title}</h3>
                        <p className="text-xs text-slate-blue mb-6">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2 border border-platinum-tint rounded-xl text-xs font-bold text-slate-blue bg-white hover:bg-cloud-mist">Hủy</button>
                            <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-2 text-white rounded-xl text-xs font-bold ${
                                confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' :
                                confirmModal.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                                'bg-action-blue hover:bg-glacier-blue'
                            }`}>Xác nhận</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {historyDevice && (
                <DeviceConnectionHistoryPanel device={historyDevice} onClose={() => setHistoryDevice(null)} />
            )}

            {/* Thông báo thiết bị vừa đổi trạng thái (góc phải dưới) */}
            {statusToasts.length > 0 && createPortal(
                <div className="fixed bottom-4 right-4 z-50 space-y-2">
                    {statusToasts.map(t => (
                        <div key={t.key} className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold bg-white ${t.device.status === 'online' ? 'border-green-200 text-green-700' : 'border-red-200 text-red-700'}`}>
                            {t.device.status === 'online' ? '🟢' : '🔴'} {t.device.device_code} {t.device.status === 'online' ? 'đã kết nối lại' : t.device.status === 'offline' ? 'vừa mất kết nối' : `chuyển sang ${t.device.status}`}
                            <span className="text-steel-gray font-normal"> ({t.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export default DeviceManagement;

