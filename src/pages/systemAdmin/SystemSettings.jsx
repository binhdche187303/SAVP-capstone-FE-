import { Settings, Camera, GraduationCap, Plus, Trash2, Pencil, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Pagination from '../../components/common/Pagination';
import ConfirmDialog from '../../components/common/ConfirmDialog';

import { getSystemConfigs, updateSystemConfig, getChannelMaps, updateChannelMap, getRooms, getZones, getNoShowConfig, updateNoShowConfig, getSecurityAlertsConfig, updateSecurityAlertsConfig } from '../../service/sysAdminServices';
import { DEFAULT_CLASS_ATTENDANCE_SETTINGS, getClassAttendanceSettings, mockClassrooms, saveClassAttendanceSettings } from '../../service/classAttendanceService';

/**
 * SystemSettings Component
 * UC-RUM-14: Cập nhật cấu hình ngưỡng thời gian chờ no-show
 * BR-NS-03: Cấu hình ngưỡng no-show và tự động giải phóng phòng
 * BR-PRIV-04: Cấu hình thời gian lưu trữ media (retention) — tab hiện đang ẩn, xem PLAN FE 2026-08-06
 * BR-MTG-OVERRUN-01: Cấu hình thời gian ân hạn kết thúc muộn — tab hiện đang ẩn, xem PLAN FE 2026-08-06
 *
 * Pipeline No-show (theo PLAN FE gửi Nam 2026-08-06): Phát hiện vắng mặt (thresholdMinutes)
 * → Cảnh báo (luôn tự động, không tắt được) → đợi (autoReleaseGraceMinutes) →
 * [nếu autoReleaseEnabled] đổi trạng thái phòng. Tab "Ghi hình & Riêng tư" và "Tham số hệ thống"
 * đang ẩn khỏi thanh chuyển tab theo yêu cầu, code giữ nguyên để dùng lại sau.
 *
 * Ánh xạ Kênh Camera (theo PLAN FE "Thiết kế lại Ánh xạ Kênh Camera" 2026-08-06, QĐ-2
 * "camera một-vai-một-channel"): chọn Vai trò trước, form đổi theo vai trò, lưu ngay lập tức
 * (GET 4 map mới nhất → xóa channelId khỏi cả 4 → ghi vào đúng map theo vai trò → PATCH map đổi)
 * — không còn gộp chung với nút "Lưu cấu hình" toàn trang.
 */
const SystemSettings = () => {
    // Tab State
    const [activeTab, setActiveTab] = useState('workspace'); // workspace | camera (recording/system tạm ẩn)

    // API & UI States
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null); // Lỗi tải dữ liệu ban đầu — chặn form, có nút Thử lại
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [confirm, setConfirm] = useState(null);

    // Cấu hình No-show (nguồn riêng: GET/PUT /no-show-config — KHÔNG dùng chung
    // với /system-configurations, đúng theo PLAN FE gửi Nam 2026-08-06)
    const [noShowConfig, setNoShowConfig] = useState({
        thresholdMinutes: 15,
        warningGraceMinutes: 2,
        autoReleaseGraceMinutes: 5,
        autoReleaseEnabled: true,
        presenceConfirmSeconds: 30,
        presenceNoiseToleranceSeconds: 5,
        confirmExtensionMinutes: 10
    });
    const [dbNoShowConfig, setDbNoShowConfig] = useState({
        thresholdMinutes: 15,
        warningGraceMinutes: 2,
        autoReleaseGraceMinutes: 5,
        autoReleaseEnabled: true,
        presenceConfirmSeconds: 30,
        presenceNoiseToleranceSeconds: 5,
        confirmExtensionMinutes: 10
    });

    // Cấu hình Security Alerts (nguồn riêng: GET/PUT /security-alerts-config)
    const [securityAlertsConfig, setSecurityAlertsConfig] = useState({ autoResolveTimeoutMinutes: 15 });
    const [dbSecurityAlertsConfig, setDbSecurityAlertsConfig] = useState({ autoResolveTimeoutMinutes: 15 });
    const [selectedClassAttendanceClassId, setSelectedClassAttendanceClassId] = useState(mockClassrooms[0]?.id || '');
    const [classAttendanceConfig, setClassAttendanceConfig] = useState(DEFAULT_CLASS_ATTENDANCE_SETTINGS);

    // Config Values State — chỉ còn phục vụ 2 tab đang ẩn (Ghi hình & Riêng tư / Tham số hệ thống)
    const [configs, setConfigs] = useState({
        recording_retention_days: 90,
        is_recording_consent_required: true,
        overrun_grace_minutes: 10
    });

    // Channel Maps State (4 map ánh xạ kênh + 3 ngưỡng camera/attendance)
    const [channelMaps, setChannelMaps] = useState({
        'ivss.channel_room_map': {},
        'ivss.channel_direction_map': {},
        'ivss.channel_presence_zone_map': {},
        'ivss.channel_zone_map': {},
        'ivss.presence.gap_threshold_seconds': 30,
        'campus.journey.gap_threshold_seconds': 60,
        'attendance.late_grace_minutes': 15
    });
    const [dbChannelMaps, setDbChannelMaps] = useState({});
    const [rooms, setRooms] = useState([]);
    const [zones, setZones] = useState([]);
    const [channelPage, setChannelPage] = useState(1); // phân trang danh sách ánh xạ kênh camera (client-side)

    // Form "Thêm/Sửa kênh" theo Vai trò — lưu ngay lập tức, không gộp vào nút Lưu cấu hình toàn trang
    const emptyChannelEditor = { open: false, mode: 'add', channelId: '', role: 'checkin_out', roomId: '', direction: 'enter', zoneId: '' };
    const [channelEditor, setChannelEditor] = useState(emptyChannelEditor);
    const [channelActionSaving, setChannelActionSaving] = useState(false);

    // Tracking which keys were modified compared to database
    const [dbConfigs, setDbConfigs] = useState({});

    const CHANNEL_MAP_KEYS = [
        'ivss.channel_room_map',
        'ivss.channel_direction_map',
        'ivss.channel_presence_zone_map',
        'ivss.channel_zone_map'
    ];

    const ROLE_LABELS = {
        checkin_out: 'Điểm danh ra/vào phòng',
        zone: 'Hiện diện khu vực',
        headcount: 'Đếm người',
        gate: 'Camera cổng ra vào',
        conflict: 'Xung đột cấu hình'
    };

    const DIRECTION_LABELS = { enter: 'Vào', leave: 'Ra', seen: 'Hiện diện' };

    // Chuẩn hóa response GET channel-maps thành object 7 key — dùng chung cho fetchConfigs
    // và cho thao tác Lưu/Xóa từng dòng (luôn GET mới nhất trước khi PATCH, an toàn vì
    // BE ghi đè toàn bộ object theo key, không tự merge theo channelId).
    const parseChannelMapsData = (rawArray) => {
        const mappedChannels = {};
        (rawArray || []).forEach(item => {
            let parsedValue = item.value;
            try {
                if (typeof parsedValue === 'string' && parsedValue.trim().startsWith('{')) {
                    parsedValue = JSON.parse(parsedValue);
                }
            } catch (e) {}
            if (['ivss.presence.gap_threshold_seconds', 'campus.journey.gap_threshold_seconds', 'attendance.late_grace_minutes'].includes(item.key)) {
                parsedValue = Number(parsedValue) || 0;
            }
            mappedChannels[item.key] = parsedValue;
        });

        return {
            'ivss.channel_room_map': {},
            'ivss.channel_direction_map': {},
            'ivss.channel_presence_zone_map': {},
            'ivss.channel_zone_map': {},
            'ivss.presence.gap_threshold_seconds': 30,
            'campus.journey.gap_threshold_seconds': 60,
            'attendance.late_grace_minutes': 15,
            ...mappedChannels
        };
    };

    // Fetch Configurations from API
    const fetchConfigs = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            // No-show config là nguồn dữ liệu bắt buộc cho tab duy nhất đang hiển thị —
            // nếu lỗi thì chặn form + hiện nút Thử lại, không dùng dữ liệu giả (AGENTS.md API RULES).
            const noShowRes = await getNoShowConfig();
            if (!noShowRes?.success || !noShowRes.data) {
                throw new Error(noShowRes?.error?.message || 'Không thể tải cấu hình chính sách No-show.');
            }
            const nsData = noShowRes.data;
            const mergedNoShow = {
                thresholdMinutes: nsData.thresholdMinutes?.value ?? noShowConfig.thresholdMinutes,
                warningGraceMinutes: nsData.warningGraceMinutes?.value ?? noShowConfig.warningGraceMinutes,
                autoReleaseGraceMinutes: nsData.autoReleaseGraceMinutes?.value ?? noShowConfig.autoReleaseGraceMinutes,
                autoReleaseEnabled: nsData.autoReleaseEnabled?.value ?? noShowConfig.autoReleaseEnabled,
                presenceConfirmSeconds: nsData.presenceConfirmSeconds?.value ?? noShowConfig.presenceConfirmSeconds,
                presenceNoiseToleranceSeconds: nsData.presenceNoiseToleranceSeconds?.value ?? noShowConfig.presenceNoiseToleranceSeconds,
                confirmExtensionMinutes: nsData.confirmExtensionMinutes?.value ?? noShowConfig.confirmExtensionMinutes
            };
            setNoShowConfig(mergedNoShow);
            setDbNoShowConfig(mergedNoShow);

            // Security alerts config — lỗi không chặn phần còn lại
            try {
                const saRes = await getSecurityAlertsConfig();
                if (saRes?.success && saRes.data) {
                    const saData = { autoResolveTimeoutMinutes: saRes.data.autoResolveTimeoutMinutes ?? 15 };
                    setSecurityAlertsConfig(saData);
                    setDbSecurityAlertsConfig(saData);
                }
            } catch (saErr) {
                console.error('Không thể tải cấu hình Security Alerts:', saErr);
            }

            // Cấu hình chung — chỉ phục vụ 2 tab đang ẩn, lỗi ở đây không chặn tab No-show/Camera
            try {
                const res = await getSystemConfigs();
                if (res?.success && Array.isArray(res.data)) {
                    const mappedConfigs = {};
                    res.data.forEach(item => {
                        let parsedValue = item.value;
                        if (parsedValue === 'true') parsedValue = true;
                        else if (parsedValue === 'false') parsedValue = false;
                        else if (!isNaN(parsedValue) && parsedValue !== '') parsedValue = Number(parsedValue);
                        mappedConfigs[item.key] = parsedValue;
                    });
                    const merged = { ...configs, ...mappedConfigs };
                    setConfigs(merged);
                    setDbConfigs(merged);
                }
            } catch (genErr) {
                console.error('Không thể tải cấu hình hệ thống chung (tab đang ẩn):', genErr);
            }

            // Channel maps là nguồn dữ liệu bắt buộc cho tab Camera & Cảm biến
            const channelRes = await getChannelMaps();
            if (!channelRes?.success || !Array.isArray(channelRes.data)) {
                throw new Error(channelRes?.error?.message || 'Không thể tải cấu hình ánh xạ kênh camera.');
            }
            const mergedChannels = parseChannelMapsData(channelRes.data);
            setChannelMaps(mergedChannels);
            setDbChannelMaps(mergedChannels);

            // Rooms + Zones — nguồn cho dropdown của form Thêm/Sửa kênh, lỗi ở đây không chặn tab
            const [roomRes, zoneRes] = await Promise.all([
                getRooms({ page: 1, limit: 100 }).catch(() => ({ success: true, data: [] })),
                getZones({ page: 1, limit: 100 }).catch(() => ({ success: true, data: [] }))
            ]);

            if (roomRes?.success) {
                let roomData = [];
                if (Array.isArray(roomRes.data?.items)) roomData = roomRes.data.items;
                else if (Array.isArray(roomRes.data?.rooms)) roomData = roomRes.data.rooms;
                else if (Array.isArray(roomRes.data?.data)) roomData = roomRes.data.data;
                else if (Array.isArray(roomRes.data)) roomData = roomRes.data;
                setRooms(roomData);
            }

            if (zoneRes?.success) {
                let zoneData = [];
                if (Array.isArray(zoneRes.data)) zoneData = zoneRes.data;
                else if (Array.isArray(zoneRes.data?.items)) zoneData = zoneRes.data.items;
                setZones(zoneData);
            }
        } catch (err) {
            setLoadError(err?.message || err?.error?.message || 'Không thể tải cấu hình hệ thống. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    useEffect(() => {
        setClassAttendanceConfig(getClassAttendanceSettings(selectedClassAttendanceClassId));
    }, [selectedClassAttendanceClassId]);

    // Auto-hide alert messages
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Handle single input changes (tab đang ẩn — Ghi hình & Riêng tư / Tham số hệ thống)
    const handleChange = (key, value) => {
        setConfigs(prev => ({
            ...prev,
            [key]: value
        }));
    };

    // Handle thay đổi cấu hình No-show
    const handleNoShowChange = (key, value) => {
        setNoShowConfig(prev => ({
            ...prev,
            [key]: value
        }));
    };

    // Form validation check
    const handleSecurityAlertsChange = (value) => {
        setSecurityAlertsConfig({ autoResolveTimeoutMinutes: value });
    };

    const handleClassAttendanceChange = (key, value) => {
        setClassAttendanceConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveClassAttendanceConfig = () => {
        if (Number(classAttendanceConfig.lateThresholdMinutes) < 0) {
            setError('Ngưỡng đi muộn không được âm.');
            return;
        }
        if (Number(classAttendanceConfig.autoScanIntervalSeconds) < 2) {
            setError('Chu kỳ quét tự động tối thiểu là 2 giây.');
            return;
        }
        saveClassAttendanceSettings({
            ...classAttendanceConfig,
            lateThresholdMinutes: Number(classAttendanceConfig.lateThresholdMinutes),
            autoScanIntervalSeconds: Number(classAttendanceConfig.autoScanIntervalSeconds)
        }, selectedClassAttendanceClassId);
        const selectedClass = mockClassrooms.find(item => item.id === selectedClassAttendanceClassId);
        setSuccessMessage(`Đã lưu cấu hình điểm danh cho ${selectedClass?.subject || 'lớp học'}.`);
    };

    const validateConfigs = (noShow, data) => {
        if (Number(noShow.thresholdMinutes) <= 0) {
            setError('Ngưỡng phát hiện vắng mặt phải là số nguyên dương.');
            return false;
        }
        if (Number(noShow.warningGraceMinutes) < 0) {
            setError('Thời gian cảnh báo không được âm.');
            return false;
        }
        if (Number(noShow.autoReleaseGraceMinutes) <= 0) {
            setError('Thời gian chờ phản hồi phải là số nguyên dương.');
            return false;
        }
        if (Number(noShow.presenceConfirmSeconds) <= 0) {
            setError('Thời gian có mặt tối thiểu phải là số nguyên dương.');
            return false;
        }
        if (Number(noShow.presenceNoiseToleranceSeconds) < 0) {
            setError('Độ trễ chấp nhận nhiễu cảm biến không được âm.');
            return false;
        }
        if (Number(noShow.confirmExtensionMinutes) <= 0) {
            setError('Thời gian gia hạn khi bấm "Tôi vẫn đến" phải là số nguyên dương.');
            return false;
        }
        if (Number(data.recording_retention_days) <= 0) {
            setError('Thời gian lưu trữ ghi hình phải là số nguyên dương.');
            return false;
        }
        if (Number(data.overrun_grace_minutes) <= 0) {
            setError('Thời gian ân hạn quá hạn họp phải là số nguyên dương.');
            return false;
        }

        return true;
    };

    // Save changes submit handler — chỉ còn xử lý No-show + cấu hình chung (tab ẩn) + 3 ngưỡng
    // camera/attendance. 4 map ánh xạ kênh camera đã tách riêng, lưu ngay khi Thêm/Sửa/Xóa 1 dòng.
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!validateConfigs(noShowConfig, configs)) return;

        setSaving(true);

        // Cấu hình chung (tab đang ẩn) — key nào đổi so với DB
        const changedKeys = Object.keys(configs).filter(key => configs[key] !== dbConfigs[key]);

        // 3 ngưỡng camera/attendance — key nào đổi so với DB (không đụng 4 map ánh xạ kênh)
        const changedThresholdKeys = ['ivss.presence.gap_threshold_seconds', 'campus.journey.gap_threshold_seconds', 'attendance.late_grace_minutes']
            .filter(key => channelMaps[key] !== dbChannelMaps[key]);

        // No-show config — đổi field nào so với DB (toggle hoặc 2 ô số)
        const noShowChanged = Object.keys(noShowConfig).some(key => noShowConfig[key] !== dbNoShowConfig[key]);

        // Security alerts config
        const securityAlertsChanged = securityAlertsConfig.autoResolveTimeoutMinutes !== dbSecurityAlertsConfig.autoResolveTimeoutMinutes;

        if (changedKeys.length === 0 && changedThresholdKeys.length === 0 && !noShowChanged && !securityAlertsChanged) {
            setSuccessMessage('Không có thay đổi nào cần lưu.');
            setSaving(false);
            return;
        }

        try {
            const updatePromises = changedKeys.map(key => {
                const valueString = String(configs[key]);
                return updateSystemConfig({ key, value: valueString });
            });

            if (noShowChanged) {
                updatePromises.push(updateNoShowConfig({
                    thresholdMinutes: Number(noShowConfig.thresholdMinutes),
                    warningGraceMinutes: Number(noShowConfig.warningGraceMinutes),
                    autoReleaseGraceMinutes: Number(noShowConfig.autoReleaseGraceMinutes),
                    autoReleaseEnabled: Boolean(noShowConfig.autoReleaseEnabled),
                    presenceConfirmSeconds: Number(noShowConfig.presenceConfirmSeconds),
                    presenceNoiseToleranceSeconds: Number(noShowConfig.presenceNoiseToleranceSeconds),
                    confirmExtensionMinutes: Number(noShowConfig.confirmExtensionMinutes)
                }));
            }

            // PUT /security-alerts-config
            if (securityAlertsChanged) {
                updatePromises.push(updateSecurityAlertsConfig({
                    autoResolveTimeoutMinutes: Number(securityAlertsConfig.autoResolveTimeoutMinutes)
                }));
            }

            const updateThresholdPromises = changedThresholdKeys.map(key => {
                return updateChannelMap({ key, value: channelMaps[key] });
            });

            await Promise.all([...updatePromises, ...updateThresholdPromises]);

            // Re-fetch or sync state to ensure we have the absolute latest from DB
            await fetchConfigs();
            setSuccessMessage('Cập nhật chính sách và tham số cấu hình hệ thống thành công.');

        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể cập nhật cấu hình hệ thống. Vui lòng thử lại.');
        } finally {
            setSaving(false);
        }
    };

    // Reset current tab inputs to DB state
    const handleReset = () => {
        setError(null);
        setNoShowConfig({ ...dbNoShowConfig });
        setSecurityAlertsConfig({ ...dbSecurityAlertsConfig });
        setConfigs({ ...dbConfigs });
        setChannelMaps({ ...dbChannelMaps });
        setClassAttendanceConfig(getClassAttendanceSettings(selectedClassAttendanceClassId));
        setChannelEditor(emptyChannelEditor);
    };

    // ============================================================
    // Ánh xạ Kênh Camera — chọn Vai trò trước, form đổi theo vai trò (QĐ-2)
    // ============================================================

    const getRoomName = (roomId) => {
        const room = rooms.find(r => (r.id || r.roomId) === roomId);
        return room ? (room.roomName || room.room_name || roomId) : roomId;
    };

    const getZoneName = (zoneId) => {
        const zone = zones.find(z => z.id === zoneId);
        return zone ? (zone.zoneName || zone.zone_name || zoneId) : zoneId;
    };

    // Suy ra vai trò hiện tại của 1 channelId từ 4 map — dùng để hiển thị danh sách và mở form Sửa.
    const inferChannelRole = (channelId, maps) => {
        const roomMap = maps['ivss.channel_room_map'] || {};
        const dirMap = maps['ivss.channel_direction_map'] || {};
        const pZoneMap = maps['ivss.channel_presence_zone_map'] || {};
        const zMap = maps['ivss.channel_zone_map'] || {};

        if (pZoneMap[channelId] !== undefined && roomMap[channelId] === undefined) {
            return { role: 'zone', roomId: '', direction: '', zoneId: pZoneMap[channelId] };
        }
        // FE-AP: xung đột — channel xuất hiện đồng thời trong presence_zone_map và room_map
        if (pZoneMap[channelId] !== undefined && roomMap[channelId] !== undefined) {
            return { role: 'conflict', roomId: roomMap[channelId], direction: dirMap[channelId] || '', zoneId: pZoneMap[channelId] };
        }
        if (zMap[channelId] !== undefined) {
            return { role: 'gate', roomId: '', direction: dirMap[channelId] || 'enter', zoneId: zMap[channelId] };
        }
        if (roomMap[channelId] !== undefined && dirMap[channelId] !== undefined) {
            return { role: 'checkin_out', roomId: roomMap[channelId], direction: dirMap[channelId], zoneId: '' };
        }
        if (roomMap[channelId] !== undefined) {
            return { role: 'headcount', roomId: roomMap[channelId], direction: '', zoneId: '' };
        }
        return { role: 'checkin_out', roomId: '', direction: 'enter', zoneId: '' };
    };

    const describeChannelDetail = (channelId, maps) => {
        const inferred = inferChannelRole(channelId, maps);
        switch (inferred.role) {
            case 'checkin_out':
                return `${getRoomName(inferred.roomId)} · ${DIRECTION_LABELS[inferred.direction] || inferred.direction}`;
            case 'zone':
                return getZoneName(inferred.zoneId);
            case 'headcount':
                return getRoomName(inferred.roomId);
            case 'gate':
                return `${getZoneName(inferred.zoneId)} · ${DIRECTION_LABELS[inferred.direction] || inferred.direction}`;
            case 'conflict':
                return `${getRoomName(inferred.roomId)} ↔ ${getZoneName(inferred.zoneId)}`;
            default:
                return '—';
        }
    };

    // Danh sách hiển thị — tính lại từ channelMaps mỗi lần render (dữ liệu nhỏ, không cần memo hoá)
    const channelRows = (() => {
        const roomMap = channelMaps['ivss.channel_room_map'] || {};
        const dirMap = channelMaps['ivss.channel_direction_map'] || {};
        const pZoneMap = channelMaps['ivss.channel_presence_zone_map'] || {};
        const zMap = channelMaps['ivss.channel_zone_map'] || {};
        const allKeys = new Set([...Object.keys(roomMap), ...Object.keys(dirMap), ...Object.keys(pZoneMap), ...Object.keys(zMap)]);
        return Array.from(allKeys)
            .sort((a, b) => Number(a) - Number(b))
            .map(id => ({
                id,
                role: inferChannelRole(id, channelMaps).role,
                detail: describeChannelDetail(id, channelMaps)
            }));
    })();

    const CHANNELS_PER_PAGE = 8;
    const totalChannelPages = Math.max(1, Math.ceil(channelRows.length / CHANNELS_PER_PAGE));
    const safeChannelPage = Math.min(channelPage, totalChannelPages);
    const paginatedChannelRows = channelRows.slice(
        (safeChannelPage - 1) * CHANNELS_PER_PAGE,
        safeChannelPage * CHANNELS_PER_PAGE
    );

    // Zone có thể vừa được tạo ở màn ZoneManagement — refetch mỗi lần mở modal
    // để dropdown zone luôn khớp DB, không cần F5 cả trang
    const refetchZones = () => {
        getZones({ page: 1, limit: 100 })
            .then(zoneRes => {
                if (!zoneRes?.success) return;
                let zoneData = [];
                if (Array.isArray(zoneRes.data)) zoneData = zoneRes.data;
                else if (Array.isArray(zoneRes.data?.items)) zoneData = zoneRes.data.items;
                setZones(zoneData);
            })
            .catch(() => {});
    };

    const openAddChannelEditor = () => {
        setError(null);
        refetchZones();
        setChannelEditor({ open: true, mode: 'add', channelId: '', role: 'checkin_out', roomId: '', direction: 'enter', zoneId: '' });
    };

    const openEditChannelEditor = (channelId) => {
        setError(null);
        refetchZones();
        const inferred = inferChannelRole(channelId, channelMaps);
        setChannelEditor({
            open: true,
            mode: 'edit',
            channelId,
            role: inferred.role,
            roomId: inferred.roomId,
            direction: inferred.direction || 'enter',
            zoneId: inferred.zoneId
        });
    };

    const closeChannelEditor = () => setChannelEditor(emptyChannelEditor);

    // Đổi Vai trò → xóa field không thuộc vai mới, tránh gửi lẫn dữ liệu của vai trước
    const handleChannelRoleChange = (role) => {
        setChannelEditor(prev => ({
            ...prev,
            role,
            roomId: (role === 'checkin_out' || role === 'headcount') ? prev.roomId : '',
            direction: (role === 'checkin_out' || role === 'gate') ? (prev.direction || 'enter') : '',
            zoneId: (role === 'zone' || role === 'gate') ? prev.zoneId : ''
        }));
    };

    const handleChannelEditorFieldChange = (field, value) => {
        setChannelEditor(prev => ({ ...prev, [field]: value }));
    };

    // Xóa channelId khỏi bản sao của cả 4 map — dùng chung cho Lưu và Xóa, đảm bảo 1 channel
    // không bao giờ dính 2 vai trò cùng lúc (QĐ-2: camera một-vai-một-channel).
    const cloneChannelMapsWithoutId = (freshMaps, channelId) => {
        const cloned = {};
        CHANNEL_MAP_KEYS.forEach(key => {
            cloned[key] = { ...(freshMaps[key] || {}) };
            delete cloned[key][channelId];
        });
        return cloned;
    };

    // So map mới với map vừa GET được, chỉ PATCH key nào thực sự đổi (BE ghi đè toàn bộ object
    // theo key nên phải luôn GET-đầy-đủ trước — xem PLAN FE "Thiết kế lại Ánh xạ Kênh Camera").
    //
    // 2 giai đoạn TUẦN TỰ (fix race condition — trước đây Promise.all bắn tất cả PATCH song
    // song: khi đổi vai trò 1 channel, PATCH "thêm vào vai mới" có thể chạy assertNoRoleConflict
    // ở BE TRƯỚC KHI PATCH "xóa khỏi vai cũ" kịp commit, khiến BE thấy channel "còn" ở vai cũ,
    // từ chối PATCH thêm — trong khi PATCH xóa vẫn thành công song song → channel mất cả 2 vai).
    // Giai đoạn 1: PATCH mọi key chỉ XÓA channelId (không thêm/đổi id nào) — await xong hẳn.
    // Giai đoạn 2: PATCH mọi key có THÊM/đổi id — chỉ chạy sau khi Giai đoạn 1 đã commit.
    // Tổng quát theo diff nội dung từng key (không hardcode tên key room_map/presence_zone_map),
    // nên vẫn đúng nếu sau này BE khai thêm cặp conflictsWithKey khác.
    const patchChangedChannelMaps = async (freshMaps, newMaps) => {
        const changedKeys = CHANNEL_MAP_KEYS.filter(key =>
            JSON.stringify(newMaps[key]) !== JSON.stringify(freshMaps[key] || {})
        );

        const removalKeys = [];
        const additionKeys = [];
        changedKeys.forEach(key => {
            const freshVal = freshMaps[key] || {};
            const newVal = newMaps[key] || {};
            const addsOrChangesId = Object.keys(newVal).some(id => freshVal[id] !== newVal[id]);
            (addsOrChangesId ? additionKeys : removalKeys).push(key);
        });

        await Promise.all(removalKeys.map(key => updateChannelMap({ key, value: newMaps[key] })));
        await Promise.all(additionKeys.map(key => updateChannelMap({ key, value: newMaps[key] })));
    };

    const saveChannelRow = async () => {
        const channelId = String(channelEditor.channelId).trim();
        if (!channelId || !/^\d+$/.test(channelId)) {
            setError('ID Kênh phải là số nguyên (VD: 1, 2, 3...).');
            return;
        }
        if (channelEditor.mode === 'add' && channelRows.some(r => r.id === channelId)) {
            setError(`ID Kênh ${channelId} đã tồn tại.`);
            return;
        }
        if ((channelEditor.role === 'checkin_out' || channelEditor.role === 'headcount') && !channelEditor.roomId) {
            setError('Vui lòng chọn Phòng.');
            return;
        }
        if ((channelEditor.role === 'checkin_out' || channelEditor.role === 'gate') && !channelEditor.direction) {
            setError('Vui lòng chọn Hướng.');
            return;
        }
        if ((channelEditor.role === 'zone' || channelEditor.role === 'gate') && !channelEditor.zoneId) {
            setError('Vui lòng chọn Khu vực.');
            return;
        }

        setError(null);
        setChannelActionSaving(true);
        try {
            const freshRes = await getChannelMaps();
            if (!freshRes?.success || !Array.isArray(freshRes.data)) {
                throw new Error(freshRes?.error?.message || 'Không thể tải lại cấu hình ánh xạ kênh.');
            }
            const freshMaps = parseChannelMapsData(freshRes.data);
            const newMaps = cloneChannelMapsWithoutId(freshMaps, channelId);

            if (channelEditor.role === 'checkin_out') {
                newMaps['ivss.channel_room_map'][channelId] = channelEditor.roomId;
                newMaps['ivss.channel_direction_map'][channelId] = channelEditor.direction;
            } else if (channelEditor.role === 'headcount') {
                newMaps['ivss.channel_room_map'][channelId] = channelEditor.roomId;
            } else if (channelEditor.role === 'zone') {
                newMaps['ivss.channel_presence_zone_map'][channelId] = channelEditor.zoneId;
            } else if (channelEditor.role === 'gate') {
                newMaps['ivss.channel_zone_map'][channelId] = channelEditor.zoneId;
                newMaps['ivss.channel_direction_map'][channelId] = channelEditor.direction;
            }

            await patchChangedChannelMaps(freshMaps, newMaps);
            await fetchConfigs();
            closeChannelEditor();
            setSuccessMessage(channelEditor.mode === 'add' ? 'Đã thêm ánh xạ kênh camera.' : 'Đã cập nhật ánh xạ kênh camera.');
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể lưu ánh xạ kênh camera. Vui lòng thử lại.');
        } finally {
            setChannelActionSaving(false);
        }
    };

    const deleteChannelRow = (channelId) => {
        setConfirm({
            message: `Bạn có chắc chắn muốn xóa ánh xạ kênh ${channelId}? Thao tác áp dụng ngay lập tức.`,
            onConfirm: async () => {
        setError(null);
        setChannelActionSaving(true);
        try {
            const freshRes = await getChannelMaps();
            if (!freshRes?.success || !Array.isArray(freshRes.data)) {
                throw new Error(freshRes?.error?.message || 'Không thể tải lại cấu hình ánh xạ kênh.');
            }
            const freshMaps = parseChannelMapsData(freshRes.data);
            const newMaps = cloneChannelMapsWithoutId(freshMaps, channelId);

            await patchChangedChannelMaps(freshMaps, newMaps);
            await fetchConfigs();

            const newTotalPages = Math.max(1, Math.ceil((channelRows.length - 1) / CHANNELS_PER_PAGE));
            if (safeChannelPage > newTotalPages) setChannelPage(newTotalPages);
            setSuccessMessage('Đã xóa ánh xạ kênh camera.');
        } catch (err) {
            setError(err?.message || err?.error?.message || 'Không thể xóa ánh xạ kênh camera. Vui lòng thử lại.');
        } finally {
            setChannelActionSaving(false);
        }
            },
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-action-blue border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-blue text-sm font-medium">Đang tải cấu hình hệ thống...</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
                <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                    <p className="font-bold text-midnight-indigo">Không thể tải cấu hình hệ thống</p>
                    <p className="text-sm text-slate-blue mt-1 max-w-md">{loadError}</p>
                </div>
                <button
                    type="button"
                    onClick={fetchConfigs}
                    className="px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                >
                    Thử lại
                </button>
            </div>
        );
    }

    return (
        <>
        <ConfirmDialog
            isOpen={!!confirm}
            message={confirm?.message}
            onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
            onCancel={() => setConfirm(null)}
        />
        <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Settings className="w-3.5 h-3.5" />
                        Hệ thống
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Cài đặt hệ thống</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Cấu hình chính sách No-show, tự động giải phóng phòng và ánh xạ camera.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={saving}
                        className="px-4 py-2 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                    >
                        Khôi phục
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={saving}
                        className="px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 flex items-center justify-center min-w-[120px]"
                    >
                        {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                    </button>
                </div>
            </div>

            {/* Notification Alerts */}
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

            {/* Navigation Tabs — "Ghi hình & Riêng tư" và "Tham số hệ thống" tạm ẩn theo PLAN FE
                gửi Nam 2026-08-06 (không xóa code, chỉ bỏ nút chuyển tab). */}
            <div className="border-b border-platinum-tint flex gap-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('workspace')}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                        activeTab === 'workspace'
                            ? 'border-action-blue text-action-blue'
                            : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                    }`}
                >
                    Quy tắc không gian
                </button>
                <button
                    onClick={() => setActiveTab('camera')}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                        activeTab === 'camera'
                            ? 'border-action-blue text-action-blue'
                            : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                    }`}
                >
                    Cấu hình Camera & Cảm biến
                </button>
                <button
                    onClick={() => setActiveTab('classroom')}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                        activeTab === 'classroom'
                            ? 'border-action-blue text-action-blue'
                            : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                    }`}
                >
                    Cấu hình lớp học
                </button>
            </div>

            {/* Tab Contents */}
            <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <form onSubmit={handleSubmit} className="space-y-8">

                    {/* TAB 1: WORKSPACE RULES */}
                    {activeTab === 'workspace' && (
                        <div className="space-y-8">

                            {/* SECTION A: No-Show Policy */}
                            <div className="space-y-4">
                                <div className="border-b border-platinum-tint/60 pb-3">
                                    <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                        <svg className="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Chính sách No-show (Vắng mặt)
                                    </h2>
                                    <p className="text-xs text-slate-blue mt-1">Phát hiện vắng mặt → gửi cảnh báo (luôn tự động) → chờ phản hồi → nếu bật, tự động đổi trạng thái phòng.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Enable toggle */}
                                    <div className="p-4 bg-cloud-mist/50 border border-platinum-tint/70 rounded-xl flex flex-col justify-between h-full">
                                        <div>
                                            <span className="block text-xs font-bold text-slate-blue uppercase">Xử lý No-show tự động</span>
                                            <span className="text-xs text-steel-gray mt-1 block">Tự động thu hồi phòng nếu bỏ trống phòng khi đến giờ họp.</span>
                                        </div>
                                        <div className="flex items-center mt-3">
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={noShowConfig.autoReleaseEnabled}
                                                    onChange={(e) => handleNoShowChange('autoReleaseEnabled', e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-platinum-tint peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-action-blue"></div>
                                                <span className="ml-3 text-sm font-semibold text-midnight-indigo">
                                                    {noShowConfig.autoReleaseEnabled ? 'Bật' : 'Tắt'}
                                                </span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Detection threshold minutes */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Ngưỡng phát hiện vắng mặt</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Thời gian không check-in kể từ giờ họp trước khi bị đánh dấu no-show (phút).</span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                value={noShowConfig.thresholdMinutes}
                                                onChange={(e) => handleNoShowChange('thresholdMinutes', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                        </div>
                                    </div>

                                    {/* Warning grace minutes */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Trễ gửi cảnh báo</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Sau khi đã tính No-Show, trễ thêm bấy nhiêu phút thì gửi cảnh báo (0 = gửi ngay khi đạt ngưỡng).</span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="60"
                                                value={noShowConfig.warningGraceMinutes}
                                                onChange={(e) => handleNoShowChange('warningGraceMinutes', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                        </div>
                                    </div>

                                    {/* Auto-release grace minutes */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Thời gian chờ phản hồi</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Thời gian cho phép Host xác nhận trước khi nhả phòng (phút). <span className="italic">Cần đủ dài để người tổ chức có cơ hội thực sự phản hồi cảnh báo trước khi phòng bị thu hồi.</span></span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                value={noShowConfig.autoReleaseGraceMinutes}
                                                onChange={(e) => handleNoShowChange('autoReleaseGraceMinutes', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                        </div>
                                    </div>

                                    {/* Presence confirm seconds */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Thời gian có mặt tối thiểu để xác nhận tham dự</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Số giây cảm biến phát hiện có mặt liên tục trước khi hệ thống xác nhận check-in.</span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="300"
                                                value={noShowConfig.presenceConfirmSeconds}
                                                onChange={(e) => handleNoShowChange('presenceConfirmSeconds', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">giây</span>
                                        </div>
                                    </div>

                                    {/* Presence noise tolerance seconds */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Độ trễ chấp nhận nhiễu cảm biến</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Khoảng thời gian cảm biến mất tín hiệu ngắn được coi là nhiễu và không làm gián đoạn xác nhận có mặt (giây).</span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="60"
                                                value={noShowConfig.presenceNoiseToleranceSeconds}
                                                onChange={(e) => handleNoShowChange('presenceNoiseToleranceSeconds', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">giây</span>
                                        </div>
                                    </div>

                                    {/* [Fix 2026-08-21, Bug 3] Confirm extension minutes — thiếu sót thuần FE,
                                        BE (GET /no-show-config) đã trả field này từ trước, chỉ chưa có input. */}
                                    <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">Thời gian gia hạn khi bấm "Tôi vẫn đến"</label>
                                        <span className="text-xs text-steel-gray mt-1 block flex-1">Khi host/organizer xác nhận "Tôi vẫn đến" (trong app hoặc qua link email), phòng được giữ thêm bấy nhiêu phút trước khi hệ thống xét lại.</span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                value={noShowConfig.confirmExtensionMinutes}
                                                onChange={(e) => handleNoShowChange('confirmExtensionMinutes', Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION B: Security Alerts Auto-resolve */}
                            <div className="space-y-4">
                                <div className="border-b border-platinum-tint/60 pb-3">
                                    <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                        <svg className="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                        Cảnh báo bảo mật
                                    </h2>
                                    <p className="text-xs text-slate-blue mt-1">Kiểm soát thời gian hệ thống tự động đóng cảnh báo không tái phát.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                                    <div className="md:col-span-1 p-4 bg-white border border-platinum-tint rounded-xl space-y-2">
                                        <label className="block text-xs font-bold text-slate-blue uppercase">
                                            Thời gian tự động đóng cảnh báo không tái phát
                                        </label>
                                        <span className="text-xs text-steel-gray mt-0.5 block">
                                            Nếu một cảnh báo không xảy ra lại trong khoảng thời gian này, hệ thống coi là đã kết thúc và tự động đóng — lần vi phạm tiếp theo sẽ tạo cảnh báo mới thay vì gộp vào cảnh báo cũ.
                                        </span>
                                        <div className="mt-3 relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                value={securityAlertsConfig.autoResolveTimeoutMinutes}
                                                onChange={(e) => handleSecurityAlertsChange(Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                            />
                                            <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* TAB: CLASSROOM ATTENDANCE */}
                    {activeTab === 'classroom' && (
                        <div className="space-y-8">
                            <div className="border-b border-platinum-tint/60 pb-3">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                    <GraduationCap className="w-5 h-5 text-action-blue" />
                                    Cấu hình điểm danh lớp học
                                </h2>
                                <p className="text-xs text-slate-blue mt-1">
                                    Thiết lập giờ bắt đầu vào học, ngưỡng đi muộn và chu kỳ quét FaceID tự động theo từng lớp, từng môn học.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-3 p-4 bg-cloud-mist/50 border border-platinum-tint/70 rounded-xl flex flex-col h-full">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Lớp / môn học áp dụng</label>
                                    <span className="text-xs text-steel-gray mt-1 block">
                                        Chọn lớp và môn học cần cấu hình giờ vào học, ngưỡng đi muộn và chu kỳ quét FaceID tự động.
                                    </span>
                                    <select
                                        value={selectedClassAttendanceClassId}
                                        onChange={(e) => setSelectedClassAttendanceClassId(e.target.value)}
                                        className="mt-3 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue bg-white"
                                    >
                                        {mockClassrooms.map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.code} - {item.subject} ({item.room})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Giờ bắt đầu vào học</label>
                                    <span className="text-xs text-steel-gray mt-1 block flex-1">
                                        Thời điểm chuẩn để hệ thống bắt đầu xét sinh viên đúng giờ hoặc đi muộn.
                                    </span>
                                    <input
                                        type="time"
                                        value={classAttendanceConfig.classStartTime}
                                        onChange={(e) => handleClassAttendanceChange('classStartTime', e.target.value)}
                                        className="mt-3 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                                <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Ngưỡng đi muộn</label>
                                    <span className="text-xs text-steel-gray mt-1 block flex-1">
                                        Số phút cho phép sau giờ bắt đầu trước khi đánh dấu sinh viên đi muộn.
                                    </span>
                                    <div className="mt-3 relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max="120"
                                            value={classAttendanceConfig.lateThresholdMinutes}
                                            onChange={(e) => handleClassAttendanceChange('lateThresholdMinutes', Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white border border-platinum-tint rounded-xl flex flex-col h-full">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Chu kỳ quét tự động</label>
                                    <span className="text-xs text-steel-gray mt-1 block flex-1">
                                        Khoảng cách giữa mỗi lần camera FaceID tự kiểm tra sinh viên trong lớp.
                                    </span>
                                    <div className="mt-3 relative">
                                        <input
                                            type="number"
                                            min="2"
                                            max="60"
                                            value={classAttendanceConfig.autoScanIntervalSeconds}
                                            onChange={(e) => handleClassAttendanceChange('autoScanIntervalSeconds', Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">giây</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSaveClassAttendanceConfig}
                                    className="px-4 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
                                >
                                    Lưu cấu hình lớp học
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: RECORDING & PRIVACY — tạm ẩn khỏi thanh chuyển tab (PLAN FE gửi Nam
                        2026-08-06), giữ nguyên code để dùng lại sau. */}
                    {activeTab === 'recording' && (
                        <div className="space-y-6">
                            <div className="border-b border-platinum-tint/60 pb-3">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                    <svg className="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Cấu hình Ghi hình & Quyền riêng tư
                                </h2>
                                <p className="text-xs text-slate-blue mt-1">Cấu hình bảo vệ dữ liệu sinh trắc học và quản lý thời hạn lưu trữ các file đa phương tiện cuộc họp.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Recording Retention Days */}
                                <div className="p-5 bg-white border border-platinum-tint rounded-2xl space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center font-bold text-sm">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-midnight-indigo">Thời hạn lưu trữ Video cuộc họp</label>
                                            <span className="text-xs text-slate-blue">Hệ thống sẽ tự động dọn dẹp các tệp media cũ vượt quá ngưỡng.</span>
                                        </div>
                                    </div>
                                    <div className="relative mt-2 max-w-[200px]">
                                        <input
                                            type="number"
                                            min="1"
                                            max="365"
                                            value={configs.recording_retention_days}
                                            onChange={(e) => handleChange('recording_retention_days', Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">ngày</span>
                                    </div>
                                </div>

                                {/* Recording Consent Option */}
                                <div className="p-5 bg-white border border-platinum-tint rounded-2xl space-y-3 flex flex-col justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center font-bold text-sm">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-midnight-indigo">Quyền đồng ý của người tham gia (Consent required)</label>
                                            <span className="text-xs text-slate-blue">Yêu cầu tất cả nhân sự bắt buộc phải nhấn đồng ý qua email trước khi ghi hình.</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center mt-4">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={configs.is_recording_consent_required}
                                                onChange={(e) => handleChange('is_recording_consent_required', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-platinum-tint peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-action-blue"></div>
                                            <span className="ml-3 text-sm font-semibold text-midnight-indigo">
                                                {configs.is_recording_consent_required ? 'Bắt buộc' : 'Không bắt buộc'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: SYSTEM PARAMETERS — tạm ẩn khỏi thanh chuyển tab (PLAN FE gửi Nam
                        2026-08-06), giữ nguyên code để dùng lại sau. */}
                    {activeTab === 'system' && (
                        <div className="space-y-6">
                            <div className="border-b border-platinum-tint/60 pb-3">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                    <svg className="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Tham số vận hành hệ thống
                                </h2>
                                <p className="text-xs text-slate-blue mt-1">Thiết lập các giới hạn vận hành chung cho phòng họp và dịch vụ.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Meeting Overrun Policy */}
                                <div className="p-5 bg-white border border-platinum-tint rounded-2xl space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center font-bold text-sm">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-midnight-indigo">Thời gian ân hạn kết thúc muộn (Overrun limit)</label>
                                            <span className="text-xs text-slate-blue">Thời gian tối đa cuộc họp có thể tiếp tục sau khi hết giờ dự kiến trước khi tự động đóng lại.</span>
                                        </div>
                                    </div>
                                    <div className="relative mt-2 max-w-[200px]">
                                        <input
                                            type="number"
                                            min="1"
                                            max="60"
                                            value={configs.overrun_grace_minutes}
                                            onChange={(e) => handleChange('overrun_grace_minutes', Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium text-midnight-indigo focus:outline-none focus:border-action-blue"
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-blue font-semibold">phút</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: CAMERA & SENSORS */}
                    {activeTab === 'camera' && (
                        <div className="space-y-8">
                            <div className="border-b border-platinum-tint/60 pb-3">
                                <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-action-blue" />
                                    Cấu hình Camera & Cảm biến (IVSS)
                                </h2>
                                <p className="text-xs text-slate-blue mt-1">Ánh xạ kênh camera vào phòng họp/khu vực theo vai trò và thiết lập ngưỡng thời gian vắng mặt.</p>
                            </div>

                            {/* Thresholds */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-4 bg-white border border-platinum-tint rounded-xl space-y-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Ngưỡng Hiện Diện (s)</label>
                                    <span className="text-xs text-steel-gray mt-0.5 block">Thời gian tối đa ngắt quãng để vẫn tính là đang hiện diện (giây).</span>
                                    <input
                                        type="number" min="0"
                                        value={channelMaps['ivss.presence.gap_threshold_seconds']}
                                        onChange={(e) => setChannelMaps({...channelMaps, 'ivss.presence.gap_threshold_seconds': Number(e.target.value)})}
                                        className="mt-3 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:border-action-blue"
                                    />
                                </div>
                                <div className="p-4 bg-white border border-platinum-tint rounded-xl space-y-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Ngưỡng Hành Trình (s)</label>
                                    <span className="text-xs text-steel-gray mt-0.5 block">Thời gian tối đa giữa các lần xuất hiện để nối hành trình (giây).</span>
                                    <input
                                        type="number" min="0"
                                        value={channelMaps['campus.journey.gap_threshold_seconds']}
                                        onChange={(e) => setChannelMaps({...channelMaps, 'campus.journey.gap_threshold_seconds': Number(e.target.value)})}
                                        className="mt-3 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:border-action-blue"
                                    />
                                </div>
                                <div className="p-4 bg-white border border-platinum-tint rounded-xl space-y-2">
                                    <label className="block text-xs font-bold text-slate-blue uppercase">Ân hạn Đi Muộn (phút)</label>
                                    <span className="text-xs text-steel-gray mt-0.5 block">Thời gian cho phép đi muộn không bị đánh dấu vi phạm (phút).</span>
                                    <input
                                        type="number" min="0"
                                        value={channelMaps['attendance.late_grace_minutes']}
                                        onChange={(e) => setChannelMaps({...channelMaps, 'attendance.late_grace_minutes': Number(e.target.value)})}
                                        className="mt-3 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            {/* Ánh xạ Kênh Camera — danh sách gọn + form Thêm/Sửa theo Vai trò, lưu ngay lập tức */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-midnight-indigo">Ánh xạ Kênh Camera</h3>
                                    <button
                                        type="button"
                                        onClick={openAddChannelEditor}
                                        className="px-3 py-1.5 bg-action-blue text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-glacier-blue transition-colors"
                                    >
                                        <Plus className="w-4 h-4" /> Thêm kênh
                                    </button>
                                </div>

                                {channelRows.length === 0 ? (
                                    <div className="p-8 text-center border border-platinum-tint border-dashed rounded-xl text-slate-blue text-sm">
                                        Chưa có cấu hình ánh xạ kênh nào. Bấm "Thêm kênh" để bắt đầu.
                                    </div>
                                ) : (
                                    <div className="bg-white border border-platinum-tint rounded-xl overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-cloud-mist/50 border-b border-platinum-tint">
                                                    <tr>
                                                        <th className="px-3 py-2.5 font-bold text-[11px] text-slate-blue uppercase tracking-wider w-24 text-center">ID Kênh</th>
                                                        <th className="px-3 py-2.5 font-bold text-[11px] text-slate-blue uppercase tracking-wider w-52 text-center">Vai trò</th>
                                                        <th className="px-3 py-2.5 font-bold text-[11px] text-slate-blue uppercase tracking-wider text-left">Chi tiết</th>
                                                        <th className="px-3 py-2.5 w-20 text-right"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-platinum-tint">
                                                    {paginatedChannelRows.map((row) => (
                                                        <tr key={row.id} className="hover:bg-cloud-mist/30 transition-colors">
                                                            <td className="px-3 py-2.5 font-mono text-xs font-semibold text-midnight-indigo text-center">{row.id}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${row.role === 'conflict' ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-action-blue'}`}>
                                                                    {ROLE_LABELS[row.role] || row.role}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-slate-blue text-left">{row.detail}</td>
                                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditChannelEditor(row.id)}
                                                                    className="p-1.5 text-slate-blue hover:bg-cloud-mist rounded-lg transition-colors"
                                                                    title="Sửa"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteChannelRow(row.id)}
                                                                    disabled={channelActionSaving}
                                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                                    title="Xóa"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {totalChannelPages > 1 && (
                                            <div className="px-4 py-3 bg-cloud-mist/30 border-t border-platinum-tint flex items-center justify-between">
                                                <span className="text-xs font-medium text-slate-blue">
                                                    Trang {safeChannelPage} / {totalChannelPages} (Tổng {channelRows.length} kênh)
                                                </span>
                                                <Pagination 
                                                    currentPage={safeChannelPage} 
                                                    totalPages={totalChannelPages} 
                                                    onPageChange={setChannelPage} 
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>

        {/* CHANNEL EDITOR MODAL */}
        {channelEditor.open && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-platinum-tint flex flex-col">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between shrink-0">
                        <h3 className="font-bold text-midnight-indigo text-base flex items-center gap-2">
                            <Camera className="w-4 h-4 text-action-blue" />
                            {channelEditor.mode === 'add' ? 'Thêm kênh camera' : 'Chỉnh sửa kênh camera'}
                        </h3>
                        <button
                            type="button"
                            onClick={closeChannelEditor}
                            disabled={channelActionSaving}
                            className="p-1.5 text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-lg transition-colors disabled:opacity-50"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 space-y-4 overflow-y-auto">
                        {/* Lỗi inline trong modal */}
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">ID Kênh</label>
                                <input
                                    type="text"
                                    value={channelEditor.channelId}
                                    onChange={(e) => handleChannelEditorFieldChange('channelId', e.target.value)}
                                    disabled={channelEditor.mode === 'edit'}
                                    placeholder="VD: 1"
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:outline-none focus:border-action-blue disabled:bg-cloud-mist disabled:text-slate-blue"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-blue uppercase">Vai trò</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { v: 'checkin_out', label: ROLE_LABELS.checkin_out },
                                    { v: 'zone',        label: ROLE_LABELS.zone },
                                    { v: 'headcount',   label: ROLE_LABELS.headcount },
                                    { v: 'gate',        label: ROLE_LABELS.gate }
                                ].map(({ v, label }) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => handleChannelRoleChange(v)}
                                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 text-left transition-all ${
                                            channelEditor.role === v
                                                ? 'border-action-blue bg-blue-50 text-action-blue'
                                                : 'border-platinum-tint bg-white text-slate-blue hover:border-action-blue/40 hover:bg-cloud-mist/40'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Fields theo vai trò */}
                        {(channelEditor.role === 'checkin_out' || channelEditor.role === 'headcount') && (
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">Phòng họp</label>
                                <select
                                    value={channelEditor.roomId}
                                    onChange={(e) => handleChannelEditorFieldChange('roomId', e.target.value)}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:outline-none focus:border-action-blue"
                                >
                                    <option value="">-- Chọn phòng --</option>
                                    {rooms.map((room, idx) => (
                                        <option key={room.id || room.roomId || idx} value={room.id || room.roomId}>
                                            {room.roomName || room.room_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {(channelEditor.role === 'checkin_out' || channelEditor.role === 'gate') && (
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">Hướng di chuyển</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[{ v: 'enter', label: 'Vào' }, { v: 'leave', label: 'Ra' }].map(({ v, label }) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => handleChannelEditorFieldChange('direction', v)}
                                            className={`py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                                                channelEditor.direction === v
                                                    ? 'border-action-blue bg-blue-50 text-action-blue'
                                                    : 'border-platinum-tint bg-white text-slate-blue hover:border-action-blue/40'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(channelEditor.role === 'zone' || channelEditor.role === 'gate') && (
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-blue uppercase">
                                    {channelEditor.role === 'zone' ? 'Khu vực hiện diện' : 'Khu vực cổng'}
                                </label>
                                <select
                                    value={channelEditor.zoneId}
                                    onChange={(e) => handleChannelEditorFieldChange('zoneId', e.target.value)}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-medium focus:outline-none focus:border-action-blue"
                                >
                                    <option value="">-- Chọn khu vực --</option>
                                    {zones.map((zone, idx) => (
                                        <option key={zone.id || idx} value={zone.id}>
                                            {zone.zoneName || zone.zone_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-platinum-tint bg-slate-50 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={closeChannelEditor}
                            disabled={channelActionSaving}
                            className="px-5 py-2 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            onClick={saveChannelRow}
                            disabled={channelActionSaving}
                            className="px-5 py-2 bg-action-blue text-white hover:bg-glacier-blue rounded-xl text-sm font-semibold shadow-sm transition-all min-w-[100px] flex items-center justify-center gap-2"
                        >
                            {channelActionSaving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                            {channelActionSaving ? 'Đang lưu...' : (channelEditor.mode === 'add' ? 'Thêm kênh' : 'Lưu thay đổi')}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

export default SystemSettings;
