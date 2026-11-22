import fs from 'fs';
import path from 'path';
import { SCREENS, API_ONLY_PERMISSIONS, AREA_ROLE, findScreenByPath, getScreenPermission } from './screenRegistry';
import { getPermissionScreenStatus } from './permissionModuleStatus';
import { filterStaticNavigation } from '../utils/buildDynamicNavigation';

const routerSource = fs.readFileSync(path.join(__dirname, '..', 'routers', 'index.js'), 'utf8');

// Lấy tập đường dẫn route con theo từng khu vực từ routers/index.js (đủ cho cấu trúc 2 tầng hiện tại).
const routesByArea = () => {
    const out = {};
    const areaRe = /path:\s*'\/(system-admin|business-admin|manager|employee|teacher|student|guard)'/g;
    const marks = [...routerSource.matchAll(areaRe)].map(m => ({ area: m[1], at: m.index }));
    marks.forEach((m, i) => {
        const chunk = routerSource.slice(m.at, marks[i + 1]?.at ?? routerSource.length);
        out[m.area] = new Set(['', ...[...chunk.matchAll(/path:\s*'([^'/][^']*)'/g)].map(x => x[1])]);
    });
    return out;
};

describe('screenRegistry', () => {
    it('has unique screen keys', () => {
        const keys = SCREENS.map(s => s.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('only uses known areas and maps each URL to at most one screen', () => {
        const seen = new Map();
        for (const s of SCREENS) {
            for (const [area, p] of Object.entries(s.paths)) {
                expect(AREA_ROLE[area]).toBeDefined();
                expect(p.startsWith(`/${area}`)).toBe(true);
                expect(seen.has(p) ? `${p} khai ở cả ${seen.get(p)} và ${s.key}` : null).toBeNull();
                seen.set(p, s.key);
            }
        }
    });

    it('every registry path has a real route (no menu → 404)', () => {
        const routes = routesByArea();
        const missing = [];
        for (const s of SCREENS) {
            for (const [area, p] of Object.entries(s.paths)) {
                const sub = p.slice(`/${area}`.length).replace(/^\//, '');
                const ok = routes[area]?.has(sub) || [...(routes[area] || [])].some(r => r.startsWith(sub + '/'));
                if (!ok) missing.push(`${s.key}: ${p}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('resolves sub-pages to the longest matching screen but never to an area home', () => {
        expect(findScreenByPath('/system-admin/visitors/history')?.key).toBe('visitors.history');
        expect(findScreenByPath('/system-admin/reports/meeting-activity')?.key).toBe('reports');
        expect(findScreenByPath('/employee/meeting/abc')?.key).toBe('meeting-detail');
        expect(findScreenByPath('/system-admin/unknown-page')).toBeNull();
        expect(getScreenPermission('/system-admin/audit-logs')).toBe('audit.system.read');
    });

});

describe('permission screen status', () => {
    it('flags a permission the selected role has no screen for', () => {
        expect(getPermissionScreenStatus('alert_rules.read', 'BUSINESS_ADMIN')?.status).toBe('partial');
        expect(getPermissionScreenStatus('alert_rules.read', 'SYSTEM_ADMIN')).toBeNull();
        expect(getPermissionScreenStatus('not.a.real.permission')?.status).toBe('missing');
        expect(getPermissionScreenStatus('accounts.user.list', 'STUDENT')).toBeNull();
    });
});

describe('filterStaticNavigation with registry', () => {
    const setPermissions = (permissions) => localStorage.setItem('user', JSON.stringify({ roles: ['SYSTEM_ADMIN'], permissions }));

    it('hides items whose screen permission the user lacks and drops empty groups', () => {
        setPermissions(['audit.system.read']);
        const items = filterStaticNavigation([
            { label: 'Home', to: '/system-admin' },
            { label: 'Hệ thống', isDropdown: true, children: [
                { label: 'Nhật ký', to: '/system-admin/audit-logs' },
                { label: 'Cấu hình', to: '/system-admin/settings' },
            ] },
            { label: 'An ninh', isDropdown: true, children: [{ label: 'Quy tắc', to: '/system-admin/alert-rules' }] },
        ]);
        expect(items.map(i => i.label)).toEqual(['Home', 'Hệ thống']);
        expect(items[1].children.map(c => c.label)).toEqual(['Nhật ký']);
    });
});
