import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarCog, Save, Trash2, Plus, CheckCircle, AlertCircle, Info, Building2, Crown, FileSignature, Pencil, X } from 'lucide-react';
import { getCalendarRoles, updateCalendarRoles } from '../../service/businessAdminServices';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const LEADERSHIP_TITLES = [
    { value: 'HIEU_TRUONG', label: 'Hiệu trưởng' },
    { value: 'PHO_HIEU_TRUONG', label: 'Phó Hiệu trưởng' },
    { value: 'BI_THU', label: 'Bí thư Đảng ủy' },
    { value: 'PHO_BI_THU', label: 'Phó Bí thư Đảng ủy' },
];
const titleLabel = (v) => LEADERSHIP_TITLES.find((t) => t.value === v)?.label || v;

const selectCls = 'w-full px-3 py-2 border border-platinum-tint rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-action-blue/30 focus:border-action-blue disabled:bg-cloud-mist disabled:text-slate-500';

// Lịch tuần UEL — gán vai trò lịch trên tài khoản (không tạo role mới):
// đơn vị duyệt lịch cấp trường, Ban Giám hiệu (chủ trì lịch lãnh đạo trường), văn thư từng đơn vị.
// Màn hình chỉ hiển thị; thêm/sửa qua modal, lưu ngay khi bấm Lưu trong modal.
const CalendarRolesConfig = () => {
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [approverDept, setApproverDept] = useState('');
    const [leaders, setLeaders] = useState([]); // [{ userId, leadershipTitle }]
    const [clerkIds, setClerkIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);
    // modal: null | { kind: 'dept' | 'leader' | 'clerk', isNew, form }
    const [modal, setModal] = useState(null);
    const [modalError, setModalError] = useState('');
    // removing: null | { kind: 'leader' | 'clerk', user }
    const [removing, setRemoving] = useState(null);

    const applyData = (data) => {
        const list = data?.users || [];
        setDepartments(data?.departments || []);
        setUsers(list);
        setApproverDept(data?.schoolApproverDepartmentId || '');
        setLeaders(list.filter((u) => u.leadershipTitle).map((u) => ({ userId: u.id, leadershipTitle: u.leadershipTitle })));
        setClerkIds(list.filter((u) => u.isUnitClerk).map((u) => u.id));
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getCalendarRoles();
            if (res?.success) applyData(res.data);
            else setNotice({ type: 'error', text: res?.message || 'Không tải được cấu hình' });
        } catch (e) {
            setNotice({ type: 'error', text: e?.message || 'Không tải được cấu hình' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
    const deptName = departments.find((d) => d.id === approverDept)?.departmentName;

    // Văn thư nhóm theo đơn vị của tài khoản
    const clerksByDept = useMemo(() => {
        const groups = new Map();
        clerkIds.forEach((id) => {
            const u = userById.get(id);
            if (!u) return;
            const key = u.departmentName || 'Chưa có đơn vị';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(u);
        });
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
    }, [clerkIds, userById]);

    // Gửi toàn bộ cấu hình lên BE (API cập nhật theo lô).
    const persist = async ({ dept = approverDept, nextLeaders = leaders, nextClerks = clerkIds, successText }) => {
        setSaving(true);
        setNotice(null);
        try {
            const res = await updateCalendarRoles({
                schoolApproverDepartmentId: dept,
                leaders: nextLeaders,
                clerkUserIds: nextClerks,
            });
            if (res?.success) {
                applyData(res.data);
                setNotice({ type: 'success', text: successText || res.message || 'Đã lưu cấu hình' });
                return true;
            }
            setNotice({ type: 'error', text: res?.message || 'Lưu cấu hình thất bại' });
            return false;
        } catch (e) {
            setNotice({ type: 'error', text: e?.message || 'Lưu cấu hình thất bại' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const openModal = (kind, isNew, form) => {
        setModalError('');
        setModal({ kind, isNew, form });
    };
    const setForm = (patch) => { setModalError(''); setModal((m) => ({ ...m, form: { ...m.form, ...patch } })); };

    const submitModal = async () => {
        const { kind, isNew, form } = modal;
        let ok = false;
        if (kind === 'dept') {
            if (!form.departmentId) return setModalError('Vui lòng chọn đơn vị');
            ok = await persist({ dept: form.departmentId, successText: 'Đã đổi đơn vị duyệt lịch cấp trường' });
        } else if (kind === 'leader') {
            if (!form.userId) return setModalError('Vui lòng chọn tài khoản');
            const nextLeaders = isNew
                ? [...leaders, { userId: form.userId, leadershipTitle: form.leadershipTitle }]
                : leaders.map((l) => (l.userId === form.userId ? { ...l, leadershipTitle: form.leadershipTitle } : l));
            ok = await persist({ nextLeaders, successText: isNew ? 'Đã thêm thành viên Ban Giám hiệu' : 'Đã cập nhật chức danh' });
        } else {
            if (!form.userId) return setModalError('Vui lòng chọn tài khoản');
            ok = await persist({ nextClerks: [...clerkIds, form.userId], successText: 'Đã gán văn thư đơn vị' });
        }
        if (ok) setModal(null);
    };

    const confirmRemove = async () => {
        const { kind, user } = removing;
        const ok = kind === 'leader'
            ? await persist({ nextLeaders: leaders.filter((l) => l.userId !== user.id), successText: `Đã gỡ ${user.fullName} khỏi Ban Giám hiệu` })
            : await persist({ nextClerks: clerkIds.filter((id) => id !== user.id), successText: `Đã gỡ vai trò văn thư của ${user.fullName}` });
        if (ok) setRemoving(null);
    };

    const userLabel = (u) => `${u.fullName}${u.departmentName ? ` — ${u.departmentName}` : ''}`;
    const leaderCandidates = users.filter((u) => !leaders.some((l) => l.userId === u.id));
    const clerkCandidates = users.filter((u) => u.departmentId && !clerkIds.includes(u.id));

    const iconBtn = 'p-1.5 rounded-lg text-slate-400 hover:bg-cloud-mist';

    if (loading) {
        return <div className="p-6 text-sm text-slate-blue">Đang tải cấu hình...</div>;
    }

    const renderModal = () => {
        if (!modal) return null;
        const { kind, isNew, form } = modal;
        const meta = {
            dept: { icon: Building2, title: 'Đổi đơn vị duyệt lịch cấp trường', sub: 'Trưởng đơn vị và văn thư của đơn vị này duyệt Lịch lãnh đạo trường, Lịch hoạt động khác' },
            leader: { icon: Crown, title: isNew ? 'Thêm thành viên Ban Giám hiệu' : 'Sửa chức danh lãnh đạo', sub: 'Thành viên BGH được chọn làm chủ trì Lịch lãnh đạo trường' },
            clerk: { icon: FileSignature, title: 'Gán văn thư đơn vị', sub: 'Văn thư thuộc đơn vị ghi trên hồ sơ tài khoản' },
        }[kind];
        const Icon = meta.icon;
        const picked = form.userId ? userById.get(form.userId) : null;

        return createPortal(
            <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
                onClick={() => !saving && setModal(null)}
            >
                <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start gap-3 px-6 py-5 border-b border-platinum-tint">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-black text-midnight-indigo">{meta.title}</h3>
                            <p className="text-xs text-slate-blue mt-0.5">{meta.sub}</p>
                        </div>
                        <button onClick={() => setModal(null)} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-cloud-mist">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        {kind === 'dept' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Đơn vị <span className="text-red-500">*</span></label>
                                <select value={form.departmentId} onChange={(e) => setForm({ departmentId: e.target.value })} className={`${selectCls} ${modalError ? '!border-red-400' : ''}`}>
                                    <option value="">-- Chọn đơn vị --</option>
                                    {departments.map((d) => <option key={d.id} value={d.id}>{d.departmentCode} — {d.departmentName}</option>)}
                                </select>
                            </div>
                        )}

                        {kind !== 'dept' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tài khoản <span className="text-red-500">*</span></label>
                                {isNew ? (
                                    <select value={form.userId} onChange={(e) => setForm({ userId: e.target.value })} className={`${selectCls} ${modalError ? '!border-red-400' : ''}`}>
                                        <option value="">-- Chọn tài khoản --</option>
                                        {(kind === 'leader' ? leaderCandidates : clerkCandidates).map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                                    </select>
                                ) : (
                                    <div className="px-3 py-2 rounded-lg bg-cloud-mist/60 border border-platinum-tint">
                                        <p className="text-sm font-bold text-midnight-indigo">{picked?.fullName}</p>
                                        <p className="text-xs text-slate-400">{picked?.email}</p>
                                    </div>
                                )}
                                {picked && isNew && (
                                    <p className="mt-1.5 text-xs text-slate-blue">
                                        Chức vụ hồ sơ: {picked.positionTitle || '—'}
                                        {kind === 'clerk' && <> · Là văn thư của: <b>{picked.departmentName}</b></>}
                                    </p>
                                )}
                            </div>
                        )}

                        {kind === 'leader' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Chức danh lãnh đạo</label>
                                <select value={form.leadershipTitle} onChange={(e) => setForm({ leadershipTitle: e.target.value })} className={selectCls}>
                                    {LEADERSHIP_TITLES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        )}

                        {modalError && <p className="text-xs font-medium text-red-600">{modalError}</p>}
                    </div>

                    <div className="flex justify-end gap-2 px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30">
                        <button onClick={() => setModal(null)} disabled={saving} className="px-4 py-2 rounded-lg border border-platinum-tint bg-white text-sm font-semibold text-slate-600 hover:bg-cloud-mist">
                            Huỷ
                        </button>
                        <button onClick={submitModal} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-action-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                            <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    const addBtn = (onClick, text) => (
        <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> {text}
        </button>
    );

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center">
                    <CalendarCog className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-midnight-indigo">Vai trò lịch họp</h1>
                    <p className="text-xs text-slate-blue">Đơn vị duyệt lịch cấp trường, Ban Giám hiệu và văn thư các đơn vị</p>
                </div>
            </div>

            {notice && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                    notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                    {notice.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {notice.text}
                </div>
            )}

            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                    Lịch đơn vị: văn thư hoặc trưởng đơn vị đăng ký được duyệt ngay; chuyên viên đăng ký chờ văn thư/trưởng đơn vị duyệt.
                    Lịch lãnh đạo trường và Lịch hoạt động khác: chỉ văn thư đăng ký, do trưởng đơn vị hoặc văn thư của đơn vị duyệt lịch cấp trường duyệt.
                </span>
            </div>

            {/* Đơn vị duyệt lịch cấp trường */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-action-blue" />
                            <h3 className="text-sm font-bold text-midnight-indigo">Đơn vị duyệt lịch cấp trường</h3>
                        </div>
                        <p className="text-xs text-slate-blue">Duyệt Lịch lãnh đạo trường và Lịch hoạt động khác</p>
                        <p className="mt-2 text-base font-bold text-midnight-indigo">{deptName || <span className="text-sm font-normal italic text-slate-400">Chưa chọn</span>}</p>
                    </div>
                    <button onClick={() => openModal('dept', false, { departmentId: approverDept })} className={`${iconBtn} hover:text-action-blue`} title="Đổi đơn vị">
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Ban Giám hiệu */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Crown className="w-4 h-4 text-amber-500" />
                            <h3 className="text-sm font-bold text-midnight-indigo">Ban Giám hiệu</h3>
                            <span className="text-xs text-slate-400">({leaders.length})</span>
                        </div>
                        <p className="text-xs text-slate-blue">Chỉ những người này được chọn làm chủ trì Lịch lãnh đạo trường. Bấm vào dòng để sửa.</p>
                    </div>
                    {addBtn(() => openModal('leader', true, { userId: '', leadershipTitle: 'PHO_HIEU_TRUONG' }), 'Thêm thành viên')}
                </div>

                {leaders.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Chưa có thành viên Ban Giám hiệu</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-platinum-tint">
                                <th className="py-2 font-semibold">Họ tên</th>
                                <th className="py-2 font-semibold">Chức vụ hồ sơ</th>
                                <th className="py-2 font-semibold">Chức danh lãnh đạo</th>
                                <th className="py-2 w-20" />
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.map((l) => {
                                const u = userById.get(l.userId);
                                return (
                                    <tr
                                        key={l.userId}
                                        onClick={() => openModal('leader', false, { ...l })}
                                        className="border-b border-platinum-tint/60 last:border-0 cursor-pointer hover:bg-cloud-mist/50"
                                    >
                                        <td className="py-2.5">
                                            <p className="font-bold text-midnight-indigo">{u?.fullName || '—'}</p>
                                            <p className="text-xs text-slate-400">{u?.email}</p>
                                        </td>
                                        <td className="py-2.5 text-slate-600">{u?.positionTitle || '—'}</td>
                                        <td className="py-2.5">
                                            <span className="inline-flex px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">{titleLabel(l.leadershipTitle)}</span>
                                        </td>
                                        <td className="py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => openModal('leader', false, { ...l })} className={`${iconBtn} hover:text-action-blue`} title="Sửa">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setRemoving({ kind: 'leader', user: u })} className={`${iconBtn} hover:text-red-600 hover:bg-red-50`} title="Gỡ khỏi Ban Giám hiệu">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Văn thư đơn vị */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <FileSignature className="w-4 h-4 text-emerald-600" />
                            <h3 className="text-sm font-bold text-midnight-indigo">Văn thư đơn vị</h3>
                            <span className="text-xs text-slate-400">({clerkIds.length})</span>
                        </div>
                        <p className="text-xs text-slate-blue">Văn thư thuộc đơn vị ghi trên hồ sơ tài khoản; một đơn vị có thể có nhiều văn thư</p>
                    </div>
                    {addBtn(() => openModal('clerk', true, { userId: '' }), 'Gán văn thư')}
                </div>

                {clerksByDept.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Chưa gán văn thư cho đơn vị nào</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {clerksByDept.map(([name, list]) => (
                            <div key={name} className="rounded-xl border border-platinum-tint p-3">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{name}</p>
                                {list.map((u) => (
                                    <div key={u.id} className="flex items-center justify-between py-1.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-midnight-indigo truncate">{u.fullName}</p>
                                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                                        </div>
                                        <button onClick={() => setRemoving({ kind: 'clerk', user: u })} className={`${iconBtn} hover:text-red-600 hover:bg-red-50`} title="Gỡ vai trò văn thư">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {renderModal()}

            <ConfirmDialog
                isOpen={!!removing}
                message={removing ? (removing.kind === 'leader'
                    ? `Gỡ ${removing.user?.fullName} khỏi Ban Giám hiệu?`
                    : `Gỡ vai trò văn thư của ${removing.user?.fullName}?`) : ''}
                confirmLabel="Gỡ"
                onConfirm={confirmRemove}
                onCancel={() => setRemoving(null)}
            />
        </div>
    );
};

export default CalendarRolesConfig;
