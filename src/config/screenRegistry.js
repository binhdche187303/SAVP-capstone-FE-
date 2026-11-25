// =====================================================================================
// BẢN ĐỒ MÀN HÌNH ↔ QUYỀN — nguồn DUY NHẤT để trả lời "quyền này dùng ở màn nào" và
// "màn này cần quyền gì".
//
// Dùng ở 3 nơi:
//   1. Menu (utils/buildDynamicNavigation.filterStaticNavigation): mục menu nào trỏ tới
//      `paths[area]` sẽ tự ẩn khi user thiếu `permission`.
//   2. Route (routers/ProtectedRoute): vào thẳng URL của màn mà thiếu `permission` → /403.
//   3. Vai trò & Phân quyền của SysAdmin (pages/systemAdmin/RolePermissionManagement.jsx) và
//      config/permissionModuleStatus.js: quyền không nằm trong `permission`/`covers` của màn nào
//      và không có trong API_ONLY_PERMISSIONS sẽ bị gắn cờ "chưa có màn hình".
//
// Quy ước:
//   - `permission`: quyền tối thiểu để MỞ màn (API tải dữ liệu chính). Mảng = ANY-of.
//     null = màn tự phục vụ / phạm vi do BE kiểm theo role-owner, không chặn ở FE.
//   - `covers`: các quyền THAO TÁC có UI nằm trong màn này (nút tạo, sửa, xoá...).
//   - Thêm màn hình mới ⇒ thêm 1 entry ở đây. Thêm quyền mới ở BE ⇒ hoặc gắn vào `covers`
//     của màn có nút tương ứng, hoặc khai báo lý do trong API_ONLY_PERMISSIONS.
//     Test config/screenRegistry.test.js sẽ fail nếu có quyền "mồ côi".
// =====================================================================================

export const AREA_ROLE = {
    'system-admin': 'SYSTEM_ADMIN',
    'business-admin': 'BUSINESS_ADMIN',
    manager: 'MANAGER',
    employee: 'EMPLOYEE',
    teacher: 'TEACHER',
    student: 'STUDENT',
    guard: 'GUARD',
};

const all = (suffix) => Object.fromEntries(Object.keys(AREA_ROLE).map(a => [a, `/${a}${suffix}`]));

export const SCREENS = [
    // ---------- Trang chủ (không chặn: luôn phải vào được trang chủ) ----------
    { key: 'home.system-admin', label: 'Bảng điều khiển hệ thống', paths: { 'system-admin': '/system-admin' }, permission: null, covers: ['campus_dashboard.overview.read', 'analytics.audit_activity.read', 'analytics.security_alerts.read', 'ivss.health.read', 'hgvision.system.read',
        'campus_dashboard.business_admin_summary.read', 'analytics.attendance.read', 'analytics.room.read'] },
    { key: 'home.business-admin', label: 'Tổng quan nghiệp vụ', paths: { 'business-admin': '/business-admin' }, permission: null, covers: ['campus_dashboard.business_admin_summary.read', 'analytics.overview.read', 'analytics.meeting.read',
        'analytics.security_alerts.read', 'gate_access.history.read_all', 'gate_access.stats.read', 'zones.zone.read',
        'security_alert.read', 'vehicle_control.read'] },
    { key: 'home.manager', label: 'Trang chủ trưởng đơn vị', paths: { manager: '/manager' }, permission: null, covers: ['campus_dashboard.manager_summary.read', 'analytics.overview.read', 'analytics.meeting.read', 'analytics.room.read', 'security_alert.read'] },
    { key: 'home.employee', label: 'Trang chủ cán bộ', paths: { employee: '/employee' }, permission: null, covers: ['campus_dashboard.employee_summary.read'] },
    { key: 'home.teacher', label: 'Trang chủ giảng viên', paths: { teacher: '/teacher' }, permission: null },
    { key: 'home.student', label: 'Trang chủ sinh viên', paths: { student: '/student' }, permission: null },
    { key: 'home.guard', label: 'Trực cổng', paths: { guard: '/guard' }, permission: null, covers: ['gate.access.monitor', 'zones.zone.read'] },

    // ---------- Tài khoản & phân quyền ----------
    { key: 'users', label: 'Quản lý người dùng', paths: { 'system-admin': '/system-admin/users', 'business-admin': '/business-admin/users' }, permission: 'accounts.user.manage',
        covers: ['accounts.user.create', 'accounts.user.update', 'accounts.user.delete', 'accounts.user.lock', 'accounts.user.unlock', 'accounts.user.update_status', 'accounts.user.update_roles', 'accounts.user.import', 'accounts.user.export', 'account.user.read.detail', 'account.partner.manage', 'account.partner.import', 'account.face.register', 'account.biometric.delete', 'ivss.portrait.manage', 'audit.users.read',
        'anpr.vehicle.admin_register', 'account.role.read'] },
    { key: 'roles', label: 'Vai trò & Phân quyền', paths: { 'system-admin': '/system-admin/roles-permissions' }, permission: 'account.role.read',
        covers: ['account.role.create', 'account.role.update', 'account.role.delete', 'admin.manage_permissions', 'permission.read'] },
    { key: 'departments', label: 'Phòng ban', paths: { 'business-admin': '/business-admin/departments' }, permission: 'department.read',
        covers: ['department.create', 'department.update', 'department.deactivate'] },
    { key: 'biometric-review', label: 'Danh sách định danh', paths: { 'business-admin': '/business-admin/biometric-submissions' }, permission: 'account.biometric.review', covers: ['account.biometric.download'] },
    { key: 'calendar-roles', label: 'Vai trò lịch họp', paths: { 'business-admin': '/business-admin/calendar-roles' }, permission: 'meeting.calendar_role.manage' },

    // ---------- Hệ thống ----------
    { key: 'settings', label: 'Cấu hình hệ thống', paths: { 'system-admin': '/system-admin/settings' }, permission: 'admin.manage_config',
        covers: ['room.noshow.configure', 'room.noshow.read', 'room.early_vacancy.configure', 'security_alerts.configure', 'class.attendance.read.all'] },
    { key: 'uel-sync', label: 'Đồng bộ dữ liệu UEL', paths: { 'system-admin': '/system-admin/uel-sync' }, permission: 'admin.manage_config' },
    { key: 'audit-logs', label: 'Nhật ký hệ thống', paths: { 'system-admin': '/system-admin/audit-logs' }, permission: 'audit.system.read' },

    // ---------- Hạ tầng ----------
    { key: 'devices', label: 'Thiết bị IoT', paths: { 'system-admin': '/system-admin/devices' }, permission: 'iot.device.read',
        covers: ['iot_devices:create', 'iot.device.update', 'iot.device.enable', 'iot.device.disable', 'iot.device.probe', 'iot.device.check_availability', 'iot.device.configure_ai', 'iot_devices:assign_room', 'iot_devices:configure_rtsp', 'iot_devices:configure_face_server'] },
    { key: 'camera-layout', label: 'Sơ đồ lắp đặt camera', paths: { 'system-admin': '/system-admin/camera-layout' }, permission: 'iot.device.read' },
    { key: 'camera-map-3d', label: 'Sơ đồ camera 3D', paths: { 'system-admin': '/system-admin/camera-map-3d', 'business-admin': '/business-admin/camera-map-3d' }, permission: 'campus_dashboard.overview.read', covers: ['campus_dashboard.timeline.read'] },
    { key: 'camera-groups', label: 'Nhóm camera', paths: { 'system-admin': '/system-admin/camera-groups' }, permission: 'iot.camera_group.read', covers: ['iot.camera_group.manage'] },
    { key: 'camera-recording', label: 'Ghi hình & lưu trữ', paths: { 'system-admin': '/system-admin/camera-recording' }, permission: 'iot.device.read' },
    { key: 'zones', label: 'Khu vực giám sát', paths: { 'system-admin': '/system-admin/zones' }, permission: 'zones.zone.read',
        covers: ['zones.zone.create', 'zones.zone.update', 'zones.zone.delete', 'zones.zone.assign_device'] },
    { key: 'guard-live', label: 'Camera trực tiếp', paths: { guard: '/guard/live' }, permission: 'hgvision.camera.read' },
    { key: 'guard-playback', label: 'Xem lại camera', paths: { guard: '/guard/playback' }, permission: 'hgvision.camera.read' },

    // ---------- Ra vào ----------
    { key: 'anpr', label: 'Kiểm soát ra vào cổng', paths: { 'system-admin': '/system-admin/anpr-management', guard: '/guard/anpr' }, permission: ['anpr.vehicle.history_view', 'gate.access.read'],
        covers: ['anpr.vehicle.unknown_view', 'vehicle_alert.read', 'gate.access.read'] },
    { key: 'room-access-logs', label: 'Nhật ký ra/vào phòng', paths: { 'system-admin': '/system-admin/room-access-logs' }, permission: 'ivss.access_log.read', covers: ['room.booking.read'] },
    { key: 'vehicle-registrations', label: 'Đăng ký phương tiện', paths: { 'system-admin': '/system-admin/vehicle-registrations' }, permission: 'anpr.vehicle.admin_read',
        covers: ['anpr.vehicle.admin_register', 'anpr.vehicle.admin_delete'] },
    { key: 'vehicle-control-list', label: 'Danh sách biển số giám sát', paths: { 'system-admin': '/system-admin/vehicle-control-list' }, permission: 'vehicle_control.read',
        covers: ['vehicle_control.create', 'vehicle_control.update', 'vehicle_control.delete'] },
    { key: 'gate-presence', label: 'Hiện diện khuôn viên', paths: { 'system-admin': '/system-admin/gate-presence' }, permission: ['zones.gate_log.read', 'gate.access.read'], covers: ['gate_access.history.read_all', 'gate_access.stats.read'] },
    { key: 'my-vehicles', label: 'Phương tiện của tôi', paths: { manager: '/manager/my-vehicles', employee: '/employee/my-vehicles', teacher: '/teacher/my-vehicles', student: '/student/my-vehicles', guard: '/guard/my-vehicles' }, permission: null },

    // ---------- An ninh ----------
    { key: 'security-alerts', label: 'Cảnh báo an ninh', paths: { 'system-admin': '/system-admin/security-alerts', guard: '/guard/security-alerts' }, permission: ['security_alert.read', 'gate.access.alert.handle'],
        covers: ['security_alert.acknowledge', 'security_alert.resolve', 'gate.access.alert.handle'] },
    { key: 'visitor-alerts', label: 'Cảnh báo khách', paths: { guard: '/guard/visitor-alerts' }, permission: ['security_alert.read', 'gate.access.alert.handle'] },
    { key: 'alert-rules', label: 'Quy tắc cảnh báo', paths: { 'system-admin': '/system-admin/alert-rules' }, permission: 'alert_rules.read',
        covers: ['alert_rules.create', 'alert_rules.update', 'alert_rules.delete'] },
    { key: 'strangers', label: 'Người lạ', paths: { 'system-admin': '/system-admin/strangers' }, permission: 'face.stranger.read',
        covers: ['face.stranger.review', 'face.unmapped.read', 'face.unmapped.map', 'attendance.manual.create', 'attendance.read'] },
    { key: 'person-control-list', label: 'Danh sách người giám sát', paths: { 'system-admin': '/system-admin/person-control-list' }, permission: 'person_control_list.read',
        covers: ['person_control_list.create', 'person_control_list.update', 'person_control_list.delete'] },

    // ---------- Giám sát khuôn viên ----------
    { key: 'user-journey.all', label: 'Lịch sử di chuyển', paths: { 'system-admin': '/system-admin/user-journey', manager: '/manager/user-journey' }, permission: 'zones.gate_log.read' },
    { key: 'user-journey.me', label: 'Lịch sử di chuyển của tôi', paths: { employee: '/employee/user-journey', teacher: '/teacher/user-journey' }, permission: null },
    { key: 'camera-trace', label: 'Truy vết theo camera / khu vực', paths: { 'system-admin': '/system-admin/camera-trace', 'business-admin': '/business-admin/camera-trace' }, permission: 'zones.gate_log.read' },
    { key: 'zone-traffic', label: 'Lưu lượng & Heatmap', paths: { 'system-admin': '/system-admin/zone-traffic', 'business-admin': '/business-admin/zone-traffic', manager: '/manager/zone-traffic' }, permission: 'campus_dashboard.traffic.read', covers: ['zones.zone.read', 'iot.camera_group.read'] },

    // ---------- Khách ----------
    { key: 'visitors', label: 'Quản lý khách', paths: { 'system-admin': '/system-admin/visitors', 'business-admin': '/business-admin/visitors' }, permission: 'visitor.visit.read', covers: ['visitor.visit.manage', 'visitor.host.self'] },
    { key: 'visitors.history', label: 'Lịch sử khách', paths: { 'system-admin': '/system-admin/visitors/history', 'business-admin': '/business-admin/visitors/history' }, permission: 'visitor.visit.read' },
    { key: 'visitors.stats', label: 'Thống kê khách', paths: { 'system-admin': '/system-admin/visitors/stats', 'business-admin': '/business-admin/visitors/stats' }, permission: 'visitor.stats.read' },
    { key: 'visitors.desk', label: 'Khách tại cổng', paths: { guard: '/guard/visitors/desk' }, permission: 'visitor.desk.use', covers: ['visitor.visit.extend', 'visitor.visit.revoke', 'visitor.visit.read'] },
    { key: 'my-visitors', label: 'Khách của tôi', paths: { manager: '/manager/my-visitors', employee: '/employee/my-visitors', teacher: '/teacher/my-visitors' }, permission: 'visitor.host.self' },

    // ---------- Cơ sở vật chất ----------
    { key: 'rooms', label: 'Phòng họp', paths: { 'business-admin': '/business-admin/rooms' }, permission: ['room.create', 'room.update', 'room.detail.read'],
        covers: ['room.create', 'room.update', 'room.delete', 'room.detail.read'] },
    { key: 'equipment.manage', label: 'Trang thiết bị', paths: { 'business-admin': '/business-admin/equipments' }, permission: 'equipment.read',
        covers: ['equipment.create', 'equipment.delete', 'equipment.assign', 'equipment.confirm_fault', 'equipment.resolve_fault', 'equipment.report_fault'] },
    { key: 'equipment.report', label: 'Báo hỏng thiết bị', paths: { manager: '/manager/equipments', employee: '/employee/equipments', teacher: '/teacher/equipments' }, permission: 'equipment.report_fault', covers: ['equipment.read'] },
    { key: 'room-analytics', label: 'Hiệu suất phòng họp', paths: { 'business-admin': '/business-admin/room-analytics' }, permission: 'analytics.room.read',
        covers: ['room.utilization.read', 'room.noshow.read', 'room.noshow.release', 'room.noshow.update', 'room.booking.read'] },

    // ---------- Cuộc họp ----------
    { key: 'schedule', label: 'Lịch cá nhân', paths: { manager: '/manager/schedule', employee: '/employee/schedule', teacher: '/teacher/my-schedule' }, permission: 'schedule.read.self' },
    { key: 'book', label: 'Đăng ký họp', paths: { manager: '/manager/book', employee: '/employee/book', teacher: '/teacher/book' }, permission: 'meeting.create',
        covers: ['scheduling.suggest.rooms', 'scheduling.suggest.times', 'scheduling.conflict.participant.check', 'recording.config.create', 'notification.invite.send'] },
    { key: 'meeting-approvals', label: 'Duyệt lịch họp', paths: { manager: '/manager/meeting-approvals', employee: '/employee/meeting-approvals', teacher: '/teacher/meeting-approvals' }, permission: 'meeting_request.approve',
        covers: ['meeting_request.read', 'meeting_request.reject'] },
    { key: 'minutes', label: 'Kho biên bản', paths: { manager: '/manager/minutes', employee: '/employee/minutes', teacher: '/teacher/minutes' }, permission: 'meeting.minutes.read',
        covers: ['meeting.minutes.search_by_person', 'meeting.minutes.share.read', 'meeting.minutes.export'] },
    { key: 'recordings', label: 'Tài liệu họp', paths: { manager: '/manager/recordings', employee: '/employee/recordings', teacher: '/teacher/meeting-documents' }, permission: 'recording.files.read', covers: ['recording.files.play'] },
    { key: 'meeting-detail', label: 'Chi tiết & phòng họp trực tuyến', paths: { 'business-admin': '/business-admin/meeting', manager: '/manager/meeting', employee: '/employee/meeting', teacher: '/teacher/meeting' }, permission: null,
        covers: ['meeting.update.own', 'meeting.time.update', 'meeting.time.update.any', 'meeting.room.update', 'meeting.cancel.own', 'meeting.cancel.any', 'meeting.read.all',
            'meeting.participant.add.internal', 'meeting.participant.add.external', 'meeting.participant.import', 'meeting.participant.remove', 'meeting.participant.remove.external', 'meeting.participant.override_capacity',
            'meeting.session.start', 'meeting.session.end', 'meeting.session.end.any', 'meeting.extension.request.own', 'meeting.session.extension.decide', 'meeting.session.extension.override',
            'meeting.note.create', 'meeting.note.read', 'meeting.timeline.read', 'meeting.presence.read', 'ivss.presence.read',
            'attendance.read', 'attendance.manual.create', 'attendance.manual.update', 'attendance.invalidate',
            'meeting.guest.admit', 'meeting.guest.invite.manage', 'meeting.guest.session.read',
            'recording.config.read', 'recording.config.update', 'recording.files.manage', 'recording.video.start', 'recording.video.stop', 'recording.video.status', 'recording.upload_track',
            'transcript.create', 'transcript.read', 'transcript.update', 'transcript.speaker_tag',
            'meeting.minutes.create', 'meeting.minutes.update', 'meeting.minutes.delete', 'meeting.minutes.issue', 'meeting.minutes.ai_draft.create', 'meeting.minutes.link_resources',
            'meeting.minutes.attachment.create', 'meeting.minutes.attachment.read', 'meeting.minutes.attachment.delete', 'meeting.minutes.share.create', 'meeting.minutes.share.delete', 'minutes.distribute',
            'notification.reminder.send', 'notification.cancellation.send',
            // Tab biên bản / tài liệu và cấu hình ghi hình trong trang chi tiết.
            'meeting.minutes.read', 'meeting.minutes.export', 'meeting.minutes.share.read', 'recording.config.create', 'recording.files.read', 'schedule.read.self'] },

    // ---------- Chuyên cần ----------
    { key: 'attendance-analytics', label: 'Tỷ lệ đúng giờ', paths: { 'business-admin': '/business-admin/attendance-analytics', manager: '/manager/attendance-analytics' }, permission: 'analytics.attendance.read' },
    { key: 'meeting-attendance', label: 'Chuyên cần phòng ban', paths: { 'business-admin': '/business-admin/meeting-attendance', manager: '/manager/meeting-attendance' }, permission: null },
    { key: 'attendance-points', label: 'Điểm chuyên cần cuộc họp', paths: { 'business-admin': '/business-admin/attendance-points', manager: '/manager/attendance-points', employee: '/employee/attendance-points', teacher: '/teacher/attendance-points' }, permission: null },
    { key: 'personal-statistics', label: 'Thống kê cá nhân', paths: { employee: '/employee/personal-statistics', teacher: '/teacher/personal-statistics' }, permission: null },
    { key: 'attendance-config', label: 'Cấu hình điểm danh', paths: { 'business-admin': '/business-admin/attendance-config' }, permission: 'attendance.violation_rule.manage' },
    { key: 'class-attendance.admin', label: 'Chuyên cần lớp học', paths: { 'business-admin': '/business-admin/class-attendance' }, permission: 'class.attendance.stats.read',
        covers: ['class.attendance.export', 'class.attendance.read.all'] },
    { key: 'class-attendance.teacher', label: 'Điểm danh lớp', paths: { teacher: '/teacher/attendance' }, permission: 'class.attendance.manage' },
    { key: 'class-attendance.report', label: 'Bảng chuyên cần', paths: { teacher: '/teacher/attendance-report' }, permission: 'class.attendance.export' },
    { key: 'class-attendance.student', label: 'Chuyên cần của tôi', paths: { student: '/student/attendance' }, permission: 'class.attendance.read.self' },
    { key: 'teaching-schedule', label: 'Lịch dạy / lịch học', paths: { teacher: '/teacher/schedule', student: '/student/schedule' }, permission: null },
    { key: 'teacher-recordings', label: 'Ghi hình lớp học', paths: { teacher: '/teacher/recordings' }, permission: 'recording.files.read' },

    // ---------- Báo cáo ----------
    { key: 'reports', label: 'Trung tâm báo cáo', paths: { 'system-admin': '/system-admin/reports', 'business-admin': '/business-admin/reports', manager: '/manager/reports' }, permission: 'report.center.read',
        covers: ['report.center.export', 'report.gate_access.export', 'report.vehicle.export', 'report.security_alert.export', 'report.meeting_activity.export', 'report.room_utilization.export'] },
    { key: 'report-schedules', label: 'Lịch gửi báo cáo', paths: { 'system-admin': '/system-admin/report-schedules', 'business-admin': '/business-admin/report-schedules' }, permission: 'report.schedule.manage' },
    { key: 'report-runs', label: 'Lịch sử gửi', paths: { 'system-admin': '/system-admin/report-schedules/runs', 'business-admin': '/business-admin/report-schedules/runs' }, permission: 'report.schedule.manage' },
    { key: 'report-templates', label: 'Mẫu báo cáo', paths: { 'system-admin': '/system-admin/report-templates', 'business-admin': '/business-admin/report-templates' }, permission: 'report.template.manage' },

    // ---------- Cá nhân ----------
    { key: 'notifications', label: 'Thông báo', paths: all('/notifications'), permission: null, covers: ['notification.read.self', 'notification.update.self'] },
    { key: 'profile', label: 'Hồ sơ & sinh trắc học', paths: all('/profile'), permission: null, covers: ['profile.avatar.update', 'profile.biometric.read_status', 'profile.biometric.submit', 'account.user.read.detail'] },
];

/**
 * Quyền KHÔNG cần màn hình riêng, kèm lý do. Mọi quyền trong DB phải hoặc nằm trong SCREENS,
 * hoặc nằm ở đây — nếu không, bảng phân quyền sẽ gắn cờ "Chưa có màn hình".
 */
export const API_ONLY_PERMISSIONS = {
    'accounts.user.list': 'Autocomplete chọn người (mời họp, chọn trưởng đơn vị...), không phải màn riêng.',
    'department.read': 'Danh sách phòng ban cho bộ lọc / dropdown ở nhiều màn.',
    'zones.gate_log.read': 'Dữ liệu nền cho Lịch sử di chuyển, Truy vết, Hiện diện khuôn viên.',
    'ivss.access_log.read': 'Dùng trong Nhật ký ra/vào phòng và widget trang chủ.',
    'iot.device.read': 'Dữ liệu nền cho các màn hạ tầng và trạng thái camera trong phòng họp.',
    'admin.manage_config': 'Cấu hình hệ thống và đồng bộ UEL.',
    'room.detail.read': 'Chi tiết phòng khi đặt lịch / xem sơ đồ.',
    'gate.access.read': 'Đọc lịch sử ra vào trong màn trực cổng.',
};

// --------------------------------------------------------------------------------------

const normalize = (p) => (p || '').split('?')[0].replace(/\/+$/, '') || '/';

const ENTRIES = SCREENS.flatMap(screen => Object.entries(screen.paths).map(([area, path]) => ({ screen, area, path: normalize(path) })));

/** Màn hình ứng với một URL (khớp đúng, hoặc tiền tố dài nhất cho trang con như meeting/:id). */
export const findScreenByPath = (pathname) => {
    const p = normalize(pathname);
    let best = null;
    for (const e of ENTRIES) {
        if (p === e.path || p.startsWith(e.path + '/')) {
            // Trang chủ khu vực chỉ khớp đúng đường dẫn, không làm tiền tố cho mọi trang con.
            if (p !== e.path && e.screen.key.startsWith('home.')) continue;
            if (!best || e.path.length > best.path.length) best = e;
        }
    }
    return best ? best.screen : null;
};

export const getScreenPermission = (pathname) => findScreenByPath(pathname)?.permission ?? null;

const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** permissionCode → [{ screen, kind: 'gate' | 'action' }] */
export const buildPermissionUsage = () => {
    const usage = {};
    for (const screen of SCREENS) {
        for (const code of asList(screen.permission)) (usage[code] ||= []).push({ screen, kind: 'gate' });
        for (const code of asList(screen.covers)) (usage[code] ||= []).push({ screen, kind: 'action' });
    }
    return usage;
};

/** Các khu vực (layout) mà role thấy được màn này nếu role có đủ quyền. */
export const screenAreasForRole = (screen, roleCode) =>
    Object.keys(screen.paths).filter(area => AREA_ROLE[area] === roleCode);
