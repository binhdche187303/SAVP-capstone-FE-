import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Layers, Loader2, Pencil, Search, Shield, Users } from 'lucide-react';
import { getRolePermissions } from '../../service/permissionServices';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import KpiTiles from '../../components/report/KpiTiles';

// Chế độ "Ma trận tổng quan" của trang Vai trò & Phân quyền — CHỈ ĐỂ XEM: mỗi vai trò đang có
// những quyền nào. Sửa quyền ở chế độ "Theo vai trò" (bấm tên vai trò trên đầu cột để chuyển sang).
// Danh sách vai trò/quyền do trang cha tải và truyền vào; ở đây chỉ tải quyền của từng vai trò.

const HIDDEN_ROLES_KEY = 'permissionMatrix.hiddenRoles';
const HIDDEN_MODULES_KEY = 'permissionMatrix.hiddenModules';

const loadHidden = (key) => {
    try {
        const v = JSON.parse(localStorage.getItem(key));
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};

// Dropdown chọn nhiều. `hidden` = các giá trị BỊ BỎ chọn (rỗng = chọn tất cả).
const MultiSelect = ({ label, icon, options, hidden, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const shown = options.filter((o) => !hidden.includes(o.value)).length;
    const toggle = (v) => onChange(hidden.includes(v) ? hidden.filter((x) => x !== v) : [...hidden, v]);
    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-platinum-tint bg-white text-sm font-semibold text-midnight-indigo hover:bg-cloud-mist">
                {icon} {label} ({shown}/{options.length})
                <ChevronDown className="w-4 h-4 text-slate-blue" />
            </button>
            {open && (
                <div className="absolute left-0 z-30 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl border border-platinum-tint bg-white shadow-lg p-2">
                    <div className="flex justify-between px-2 pb-2 text-xs">
                        <button type="button" className="font-semibold text-action-blue" onClick={() => onChange([])}>Chọn tất cả</button>
                        <button type="button" className="font-semibold text-slate-blue" onClick={() => onChange(options.map((o) => o.value))}>Bỏ chọn tất cả</button>
                    </div>
                    {options.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cloud-mist cursor-pointer text-sm text-midnight-indigo">
                            <input type="checkbox" className="w-4 h-4" checked={!hidden.includes(o.value)} onChange={() => toggle(o.value)} />
                            <span className="truncate">{o.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * props:
 *  - roles, permissions: danh mục đã tải ở trang cha (roles đã theo thứ tự kéo thả).
 *  - searchTerm: từ khoá dùng chung với chế độ "Theo vai trò".
 *  - reloadKey: đổi giá trị ⇒ tải lại quyền của các vai trò (sau khi lưu / tạo / xoá vai trò).
 *  - onEditRole(role): chuyển sang chế độ sửa vai trò đó.
 *  - roleLabel, permissionLabel, moduleLabel: hàm hiển thị tên tiếng Việt.
 */
const PermissionMatrix = ({ roles, permissions, searchTerm = '', reloadKey = 0, onEditRole, roleLabel, permissionLabel, moduleLabel, onSearchTermChange }) => {
    const [grants, setGrants] = useState({}); // roleId -> Set(permissionId)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hidden, setHiddenState] = useState(() => loadHidden(HIDDEN_ROLES_KEY));
    const [hiddenModules, setHiddenModulesState] = useState(() => loadHidden(HIDDEN_MODULES_KEY));
    const [collapsed, setCollapsed] = useState({});
    const persist = (key, setter) => (v) => {
        setter(v);
        try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
    };
    const setHidden = persist(HIDDEN_ROLES_KEY, setHiddenState);
    const setHiddenModules = persist(HIDDEN_MODULES_KEY, setHiddenModulesState);

    const roleIds = roles.map((r) => r.id).join(',');
    useEffect(() => {
        let alive = true;
        if (roles.length === 0) { setGrants({}); setLoading(false); return undefined; }
        setLoading(true);
        setError(null);
        Promise.all(roles.map(async (role) => {
            const res = await getRolePermissions(role.id);
            if (!res?.success || !Array.isArray(res.data)) throw res;
            return [role.id, new Set(res.data.map((x) => x.permissionId || x.id))];
        }))
            .then((entries) => alive && setGrants(Object.fromEntries(entries)))
            .catch((err) => alive && setError(err?.error?.message || err?.message || 'Không tải được quyền của các vai trò. Vui lòng thử lại.'))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
        // roleIds thay cho roles: kéo thả đổi thứ tự không cần tải lại.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roleIds, reloadKey]);

    const visibleRoles = useMemo(() => roles.filter((r) => !hidden.includes(r.id)), [roles, hidden]);
    const held = (roleId, permId) => grants[roleId]?.has(permId) ?? false;

    const modules = useMemo(
        () => [...new Set(permissions.map((p) => p.moduleCode || 'other'))].sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'vi')),
        [permissions, moduleLabel],
    );

    const groups = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const rows = permissions
            .filter((p) => !hiddenModules.includes(p.moduleCode || 'other'))
            .filter((p) => !q || permissionLabel(p).toLowerCase().includes(q) || (p.permissionCode || '').toLowerCase().includes(q));
        const byModule = {};
        rows.forEach((p) => { (byModule[p.moduleCode || 'other'] ||= []).push(p); });
        return Object.keys(byModule)
            .sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'vi'))
            .map((m) => ({ module: m, perms: byModule[m].sort((a, b) => permissionLabel(a).localeCompare(permissionLabel(b), 'vi')) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissions, searchTerm, hiddenModules, permissionLabel, moduleLabel]);

    const summary = useMemo(() => roles.map((role) => ({ role, count: grants[role.id]?.size ?? 0 })), [roles, grants]);
    const summaryItems = summary
        .filter(({ role }) => !hidden.includes(role.id))
        .map(({ role, count }, index) => ({
            key: role.id,
            label: roleLabel(role),
            value: count,
            hint: 'quyền',
            icon: Shield,
            tone: ['blue', 'green', 'violet', 'amber', 'slate'][index % 5],
        }));
    const colCount = visibleRoles.length + 1;

    return (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
            {error && (
                <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <KpiTiles items={summaryItems} maxVisible={4} ariaLabel="Thống kê quyền theo vai trò" />
            )}

            <FilterBar variant="card" className="permission-matrix-filters flex items-end">
                <FilterField label="Tìm kiếm" className="permission-matrix-search">
                    <div className="relative min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue" />
                        <input type="text" placeholder="Tìm theo tên hoặc mã quyền..." value={searchTerm}
                            onChange={(event) => onSearchTermChange?.(event.target.value)}
                            className="w-full pl-9 pr-3" />
                    </div>
                </FilterField>
                <div className="permission-matrix-filter-actions">
                    <MultiSelect label="Vai trò" icon={<Users className="w-4 h-4" />}
                        options={roles.map((r) => ({ value: r.id, label: roleLabel(r) }))}
                        hidden={hidden} onChange={setHidden} />
                    <MultiSelect label="Nhóm quyền" icon={<Layers className="w-4 h-4" />}
                        options={modules.map((m) => ({ value: m, label: moduleLabel(m) }))}
                        hidden={hiddenModules} onChange={setHiddenModules} />
                </div>
            </FilterBar>

            <div className="rounded-2xl border border-platinum-tint bg-white overflow-auto flex-1 min-h-[300px] max-h-[70vh]">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-slate-blue"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải ma trận phân quyền…</div>
                ) : visibleRoles.length === 0 ? (
                    <p className="py-16 text-center text-sm text-slate-blue">Chưa chọn vai trò nào để hiển thị.</p>
                ) : (
                    <table className="text-sm border-separate border-spacing-0 min-w-full">
                        <thead>
                            <tr>
                                <th className="sticky top-0 left-0 z-20 bg-cloud-mist text-left font-semibold text-midnight-indigo px-3 py-2 min-w-[280px] border-b border-r border-platinum-tint">Quyền</th>
                                {visibleRoles.map((r) => (
                                    <th key={r.id} className="sticky top-0 z-10 bg-cloud-mist px-2 py-2 border-b border-platinum-tint min-w-[96px]">
                                        <button type="button" onClick={() => onEditRole?.(r)} title={`Sửa quyền của ${roleLabel(r)}`}
                                            className="group inline-flex items-center gap-1 text-xs font-semibold text-slate-blue hover:text-action-blue whitespace-nowrap">
                                            {roleLabel(r)}
                                            <Pencil className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                                        </button>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {groups.length === 0 && (
                                <tr><td colSpan={colCount} className="px-3 py-10 text-center text-slate-blue">Không có quyền nào khớp bộ lọc.</td></tr>
                            )}
                            {groups.flatMap(({ module, perms }) => {
                                const isCollapsed = !!collapsed[module];
                                return [
                                    <tr key={`m-${module}`} className="cursor-pointer" onClick={() => setCollapsed((c) => ({ ...c, [module]: !c[module] }))}>
                                        <td className="sticky left-0 z-[5] bg-slate-50 px-3 py-1.5 border-b border-r border-platinum-tint text-xs font-bold uppercase tracking-wide text-slate-blue">
                                            <span className="inline-flex items-center gap-1">
                                                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                {moduleLabel(module)} <span className="font-normal normal-case">· {perms.length} quyền</span>
                                            </span>
                                        </td>
                                        {visibleRoles.map((r) => {
                                            const n = perms.filter((p) => held(r.id, p.id)).length;
                                            return (
                                                <td key={r.id} className="bg-slate-50 px-2 py-1.5 border-b border-platinum-tint text-center text-xs tabular-nums font-semibold"
                                                    style={{ color: n === 0 ? '#A6BBD1' : n === perms.length ? '#059669' : '#476788' }}>
                                                    {n}/{perms.length}
                                                </td>
                                            );
                                        })}
                                    </tr>,
                                    ...(isCollapsed ? [] : perms.map((p) => (
                                        <tr key={p.id} className="hover:bg-cloud-mist/40">
                                            <td className="sticky left-0 z-[5] bg-white px-3 py-2 border-b border-r border-platinum-tint/60 text-midnight-indigo">
                                                <div>{permissionLabel(p)}</div>
                                            </td>
                                            {visibleRoles.map((r) => (
                                                <td key={r.id} className="px-2 py-2 border-b border-platinum-tint/60 text-center">
                                                    {held(r.id, p.id)
                                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" aria-label="Có quyền" />
                                                        : <span className="text-slate-300" aria-label="Không có">·</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))),
                                ];
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default PermissionMatrix;
