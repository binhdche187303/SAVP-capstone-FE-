// Cảnh báo cho UI cấp quyền (RolePermissionManagement.jsx) khi gán một quyền không có màn hình
// tương ứng — để admin biết trước khi gán, thay vì gán xong không thấy gì xảy ra.
//
// [2026-11-20] Không còn khai tay theo module (bản cũ lỗi thời: ghi ivss.access_log.read "chưa có
// API" trong khi đã có). Trạng thái giờ tính theo TỪNG quyền và TỪNG vai trò từ
// config/screenRegistry.js — thêm màn hình ở registry là cảnh báo tự cập nhật.

import { API_ONLY_PERMISSIONS, AREA_ROLE, buildPermissionUsage } from './screenRegistry';

const USAGE = buildPermissionUsage();

const AREA_NAME = {
    'system-admin': 'Quản trị hệ thống',
    'business-admin': 'Quản trị nghiệp vụ',
    manager: 'Trưởng đơn vị',
    employee: 'Cán bộ',
    teacher: 'Giảng viên',
    student: 'Sinh viên',
    guard: 'Bảo vệ',
};

/**
 * @returns {null | { status: 'missing' | 'partial', note: string }}
 *   missing: không màn hình nào dùng quyền này.
 *   partial: có màn hình, nhưng không nằm trong menu của vai trò đang chọn.
 */
export const getPermissionScreenStatus = (permissionCode, roleCode) => {
    if (API_ONLY_PERMISSIONS[permissionCode]) return null;
    const usage = USAGE[permissionCode] || [];
    if (usage.length === 0) {
        return { status: 'missing', note: 'Chưa có màn hình nào dùng quyền này. Khai báo trong src/config/screenRegistry.js trước khi gán.' };
    }
    if (!roleCode) return null;
    const areas = new Set(usage.flatMap(u => Object.keys(u.screen.paths)));
    if ([...areas].some(a => AREA_ROLE[a] === roleCode)) return null;
    const where = [...areas].map(a => AREA_NAME[a]).filter(Boolean).join(', ');
    const screens = [...new Set(usage.map(u => u.screen.label))].join(', ');
    return {
        status: 'partial',
        note: `Menu của vai trò này không có màn hình dùng quyền. Quyền đang dùng ở: ${screens} (${where}).`,
    };
};

/** @deprecated Giữ cho code cũ — dùng getPermissionScreenStatus. */
export const PERMISSION_MODULE_STATUS = {};
