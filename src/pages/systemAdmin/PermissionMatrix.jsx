import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Table2 } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import { getRoles, getPermissions, getRolePermissions } from '../../service/permissionServices';
import { MODULE_TRANSLATIONS, PERMISSION_NAME_TRANSLATIONS } from './RolePermissionManagement';

// Bảng phân quyền chỉ để theo dõi: mỗi vai trò đang có những quyền nào (đọc trực tiếp từ máy chủ).
// Sửa quyền ở màn "Vai trò & Phân quyền".

const ROLE_ORDER = ['SYSTEM_ADMIN', 'BUSINESS_ADMIN', 'MANAGER', 'EMPLOYEE', 'TEACHER', 'GUARD', 'STUDENT'];

const loadAll = async (fetchPage) => {
    const items = [];
    let page = 1;
    let totalPages = 1;
    do {
        const res = await fetchPage({ page, limit: 100 });
        if (!res?.success || !Array.isArray(res.data)) throw res || new Error('Máy chủ trả dữ liệu không hợp lệ.');
        items.push(...res.data);
        totalPages = Number(res.meta?.totalPages) || 1;
        page += 1;
    } while (page <= totalPages);
    return items;
};

const permissionLabel = (p) => PERMISSION_NAME_TRANSLATIONS[p.permissionCode] || p.permissionName || p.permissionCode;
const moduleLabel = (code) => MODULE_TRANSLATIONS[code] || code;

const PermissionMatrix = () => {
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [grants, setGrants] = useState({}); // roleId -> Set(permissionId)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [moduleFilter, setModuleFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [r, p] = await Promise.all([loadAll(getRoles), loadAll(getPermissions)]);
            const sortedRoles = [...r].sort((a, b) => {
                const ia = ROLE_ORDER.indexOf(a.roleCode); const ib = ROLE_ORDER.indexOf(b.roleCode);
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            const entries = await Promise.all(sortedRoles.map(async role => {
                const res = await getRolePermissions(role.id);
                if (!res?.success || !Array.isArray(res.data)) throw res;
                return [role.id, new Set(res.data.map(x => x.permissionId || x.id))];
            }));
            setRoles(sortedRoles);
            setPermissions(p);
            setGrants(Object.fromEntries(entries));
        } catch (err) {
            setError(err?.message || 'Không tải được dữ liệu phân quyền. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => permissions.map(p => ({
        p,
        label: permissionLabel(p),
        module: moduleLabel(p.moduleCode),
        cells: roles.map(role => ({ role, held: grants[role.id]?.has(p.id) ?? false })),
    })), [permissions, roles, grants]);

    const modules = useMemo(
        () => [...new Set(permissions.map(p => p.moduleCode))].sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'vi')),
        [permissions],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows
            .filter(r => !moduleFilter || r.p.moduleCode === moduleFilter)
            .filter(r => !roleFilter || r.cells.some(c => c.role.id === roleFilter && c.held))
            .filter(r => !q || r.label.toLowerCase().includes(q))
            .sort((a, b) => a.module.localeCompare(b.module, 'vi') || a.label.localeCompare(b.label, 'vi'));
    }, [rows, search, moduleFilter, roleFilter]);

    const summary = useMemo(() => roles.map(role => ({
        role,
        count: rows.filter(r => r.cells.find(c => c.role.id === role.id)?.held).length,
    })), [roles, rows]);

    let lastModule = null;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeading icon={<Table2 className="w-5 h-5" />}>Bảng phân quyền</PageHeading>
                <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-outline-gray bg-white text-sm font-semibold text-midnight-indigo hover:bg-cloud-mist disabled:opacity-60">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {!loading && !error && (
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                    {summary.map(({ role, count }) => (
                        <button key={role.id} type="button" onClick={() => setRoleFilter(role.id === roleFilter ? '' : role.id)}
                            className={`text-left rounded-xl border bg-white px-3 py-2.5 transition-colors ${roleFilter === role.id ? 'border-action-blue ring-1 ring-action-blue' : 'border-outline-gray hover:border-action-blue'}`}>
                            <p className="text-xs text-slate-blue truncate" title={role.roleName}>{role.roleName}</p>
                            <p className="text-xl font-bold text-midnight-indigo tabular-nums">{count} <span className="text-xs font-normal text-slate-blue">quyền</span></p>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-1 min-w-[220px]">
                    <span className="sr-only">Tìm quyền</span>
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input id="pm-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm quyền…"
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-outline-gray bg-white text-sm" />
                </label>
                <select id="pm-module" aria-label="Lọc nhóm quyền" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-outline-gray bg-white text-sm">
                    <option value="">Tất cả nhóm quyền</option>
                    {modules.map(m => <option key={m} value={m}>{moduleLabel(m)}</option>)}
                </select>
                <select id="pm-role" aria-label="Lọc vai trò" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-outline-gray bg-white text-sm">
                    <option value="">Mọi vai trò</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.roleName}</option>)}
                </select>
            </div>

            <div className="rounded-xl border border-outline-gray bg-white overflow-auto max-h-[70vh]">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-slate-blue"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải bảng phân quyền…</div>
                ) : (
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-cloud-mist">
                            <tr>
                                <th className="text-left font-semibold text-midnight-indigo px-3 py-2 min-w-[260px]">Quyền</th>
                                {roles.map(r => <th key={r.id} className="px-2 py-2 text-xs font-semibold text-slate-blue whitespace-nowrap">{r.roleName}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={roles.length + 1} className="px-3 py-10 text-center text-slate-blue">Không có quyền nào khớp bộ lọc.</td></tr>
                            )}
                            {filtered.map(r => {
                                const header = r.module !== lastModule;
                                lastModule = r.module;
                                return [
                                    header && (
                                        <tr key={`m-${r.p.moduleCode}`} className="bg-slate-50">
                                            <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-blue">{r.module}</td>
                                        </tr>
                                    ),
                                    <tr key={r.p.id} className="border-t border-outline-gray/60">
                                        <td className="px-3 py-2 text-midnight-indigo">{r.label}</td>
                                        {r.cells.map(c => (
                                            <td key={c.role.id} className="px-2 py-2 text-center">
                                                {c.held
                                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" aria-label="Có quyền" />
                                                    : <span className="text-slate-300" aria-label="Không có">·</span>}
                                            </td>
                                        ))}
                                    </tr>,
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
