import { NAVIGATION_REGISTRY, GROUP_META } from '../config/navigationRegistry';
import { hasPermission } from './permissionUtils';
import { getScreenPermission } from '../config/screenRegistry';

// Builds the dynamic slice of a layout's navigationItems array from the permission
// registry, in the same shape the layouts already render (flat item, or
// { isDropdown: true, children: [] } group).
export const buildDynamicNavigation = (area) => {
    const visible = NAVIGATION_REGISTRY.filter(
        entry => entry.area === area && hasPermission(entry.permission)
    );

    const standalone = [];
    const groupOrder = [];
    const grouped = {};

    for (const entry of visible) {
        if (!entry.group) {
            standalone.push(entry);
            continue;
        }
        if (!grouped[entry.group]) {
            grouped[entry.group] = [];
            groupOrder.push(entry.group);
        }
        grouped[entry.group].push(entry);
    }

    const dropdowns = groupOrder.map(label => ({
        label,
        isDropdown: true,
        icon: GROUP_META[label]?.icon,
        children: grouped[label].map(({ label, to, icon, end }) => ({ label, to, icon, end })),
    }));

    return [
        ...standalone.map(({ label, to, icon, end }) => ({ label, to, icon, end })),
        ...dropdowns,
    ];
};

// Filters a layout's hardcoded STATIC_NAVIGATION_ITEMS by an optional `requiredPermission`
// field on a flat item or on entries inside a dropdown group's `children`. Items without
// `requiredPermission` are always kept (existing behavior unchanged — hasPermission(undefined)
// is true). A dropdown whose children are all filtered out is dropped so no empty group button
// remains in the navbar.
//
// [2026-11-20] Mục không khai `requiredPermission` sẽ lấy quyền từ config/screenRegistry.js theo
// đường dẫn `to` — nhờ vậy gỡ quyền ở màn Vai trò & Phân quyền thì menu ẩn theo, không còn cảnh
// "thấy menu nhưng bấm vào 403". Muốn bỏ qua registry cho một mục, đặt `requiredPermission: null`.
const itemPermission = (item) =>
    item.requiredPermission !== undefined ? item.requiredPermission : getScreenPermission(item.to);

export const filterStaticNavigation = (items) => {
    return items
        .map(item => {
            if (item.isDropdown) {
                const children = item.children.filter(child => hasPermission(itemPermission(child)));
                return children.length > 0 ? { ...item, children } : null;
            }
            return hasPermission(itemPermission(item)) ? item : null;
        })
        .filter(Boolean);
};
