import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, Plus, Trash2, Save, Lock, Info, CheckCircle, AlertCircle, X, Hand, Pencil } from 'lucide-react';
import { getViolationRules, updateViolationRules } from '../../service/businessAdminServices';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const EMPTY_FORM = { ruleName: '', penaltyPoints: -1, conditionText: '', isActive: true };

// Cấu hình vi phạm điểm danh cuộc họp (Lịch tuần UEL) — hình thức, điểm trừ, điều kiện, mốc phút.
// Bảng chỉ hiển thị; thêm/sửa qua modal, lưu ngay khi bấm Lưu trong modal.
const AttendanceViolationConfig = () => {
    const [rules, setRules] = useState([]);
    const [saved, setSaved] = useState({ late: 5, early: 15 });
    const [lateGrace, setLateGrace] = useState(5);
    const [earlyLeave, setEarlyLeave] = useState(15);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);
    // editing: null | { id?: string, isSystem: boolean, form }
    const [editing, setEditing] = useState(null);
    const [formError, setFormError] = useState('');
    const [deleting, setDeleting] = useState(null);

    const applyData = (data) => {
        setRules(data?.rules || []);
        const late = data?.lateGraceMinutes ?? 5;
        const early = data?.earlyLeaveThresholdMinutes ?? 15;
        setSaved({ late, early });
        setLateGrace(late);
        setEarlyLeave(early);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getViolationRules(true);
            if (res?.success) applyData(res.data);
            else setNotice({ type: 'error', text: res?.message || 'Không tải được cấu hình' });
        } catch (e) {
            setNotice({ type: 'error', text: e?.message || 'Không tải được cấu hình' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Gửi toàn bộ cấu hình lên BE (API cập nhật theo lô).
    const persist = async ({ list = rules, deleteIds = [], late = saved.late, early = saved.early, successText }) => {
        setSaving(true);
        setNotice(null);
        try {
            const res = await updateViolationRules({
                rules: list.map((r) => ({
                    ...(r.id ? { id: r.id } : {}),
                    ruleName: r.ruleName.trim(),
                    penaltyPoints: Number(r.penaltyPoints) || 0,
                    conditionText: r.conditionText || null,
                    isActive: !!r.isActive,
                })),
                deleteIds,
                lateGraceMinutes: Number(late) || 0,
                earlyLeaveThresholdMinutes: Number(early) || 0,
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

    const openAdd = () => {
        setFormError('');
        setEditing({ isSystem: false, form: { ...EMPTY_FORM } });
    };

    const openEdit = (r) => {
        setFormError('');
        setEditing({
            id: r.id,
            isSystem: r.isSystem,
            form: { ruleName: r.ruleName, penaltyPoints: r.penaltyPoints, conditionText: r.conditionText || '', isActive: r.isActive },
        });
    };

    const setForm = (patch) => setEditing((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));

    const submitForm = async () => {
        const { id, form } = editing;
        if (!form.ruleName.trim()) {
            setFormError('Vui lòng nhập tên hình thức vi phạm');
            return;
        }
        const list = id
            ? rules.map((r) => (r.id === id ? { ...r, ...form } : r))
            : [...rules, { ...form, isSystem: false }];
        const ok = await persist({ list, successText: id ? 'Đã cập nhật hình thức vi phạm' : 'Đã thêm hình thức vi phạm' });
        if (ok) setEditing(null);
        else setFormError('Không lưu được, vui lòng thử lại');
    };

    const confirmDelete = async () => {
        const target = deleting;
        setDeleting(null);
        await persist({
            list: rules.filter((r) => r.id !== target.id),
            deleteIds: [target.id],
            successText: `Đã xoá hình thức "${target.ruleName}"`,
        });
    };

    const thresholdsChanged = Number(lateGrace) !== saved.late || Number(earlyLeave) !== saved.early;

    const inputCls =
        'w-full px-3 py-2 border border-platinum-tint rounded-lg text-sm text-midnight-indigo focus:outline-none focus:border-action-blue disabled:bg-slate-50';

    const renderToggle = (on, onClick) => (
        <button type="button" onClick={onClick}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );

    const isEdit = !!editing?.id;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-midnight-indigo">Cấu hình điểm danh</h1>
                    <p className="text-xs text-slate-blue">Hình thức vi phạm, điểm trừ và mốc phút áp dụng toàn trường</p>
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
                    Điểm trừ được chốt tại thời điểm ghi nhận điểm danh. Thay đổi cấu hình chỉ áp dụng cho các lần điểm danh sau,
                    không làm thay đổi điểm của các cuộc họp đã ghi nhận.
                </span>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                <div className="flex items-center justify-between mb-4 min-h-[32px]">
                    <h3 className="text-sm font-bold text-midnight-indigo">Mốc thời gian ghi nhận tự động</h3>
                    {thresholdsChanged && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setLateGrace(saved.late); setEarlyLeave(saved.early); }}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-semibold text-slate-600 hover:bg-cloud-mist"
                            >
                                Huỷ
                            </button>
                            <button
                                onClick={() => persist({ late: lateGrace, early: earlyLeave, successText: 'Đã lưu mốc thời gian' })}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                                <Save className="w-3.5 h-3.5" /> Lưu mốc thời gian
                            </button>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Đi trễ: vào sau giờ bắt đầu quá (phút)</label>
                        <input type="number" min={0} max={120} value={lateGrace} disabled={loading}
                            onChange={(e) => setLateGrace(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Về sớm: ra trước giờ kết thúc quá (phút)</label>
                        <input type="number" min={0} max={240} value={earlyLeave} disabled={loading}
                            onChange={(e) => setEarlyLeave(e.target.value)} className={inputCls} />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-midnight-indigo">Hình thức vi phạm</h3>
                    <button onClick={openAdd} disabled={loading || saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-action-blue text-action-blue text-xs font-semibold hover:bg-blue-50 disabled:opacity-50">
                        <Plus className="w-4 h-4" /> Thêm hình thức
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] uppercase font-bold text-slate-blue border-b border-platinum-tint">
                                <th className="px-5 py-3 w-14">STT</th>
                                <th className="px-5 py-3 w-72">Hình thức vi phạm</th>
                                <th className="px-5 py-3 w-24 text-center">Điểm trừ</th>
                                <th className="px-5 py-3">Điều kiện ghi nhận</th>
                                <th className="px-5 py-3 w-32 text-center">Trạng thái</th>
                                <th className="px-5 py-3 w-24 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-blue">Đang tải...</td></tr>
                            ) : rules.map((r, idx) => (
                                <tr
                                    key={r.id}
                                    onClick={() => openEdit(r)}
                                    className="border-b border-platinum-tint/60 hover:bg-cloud-mist/40 cursor-pointer transition-colors"
                                >
                                    <td className="px-5 py-4 text-sm font-semibold text-slate-500">{idx + 1}</td>
                                    <td className="px-5 py-4">
                                        <p className="text-sm font-bold text-midnight-indigo">{r.ruleName}</p>
                                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                                            {r.isSystem
                                                ? <><Lock className="w-3 h-3" /> Hệ thống tự ghi nhận</>
                                                : <><Hand className="w-3 h-3" /> Thư ký/chủ trì ghi nhận thủ công</>}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`inline-block min-w-[40px] px-2 py-1 rounded-lg text-sm font-black ${
                                            r.penaltyPoints < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                                        }`}>
                                            {r.penaltyPoints > 0 ? `+${r.penaltyPoints}` : r.penaltyPoints}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-600 leading-relaxed">
                                        {r.conditionText || <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                            r.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {r.isActive ? 'Đang áp dụng' : 'Đã tắt'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                                                title="Sửa"
                                                className="p-2 rounded-lg text-action-blue hover:bg-blue-50"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            {!r.isSystem && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleting(r); }}
                                                    title="Xoá"
                                                    className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {editing && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
                    onClick={() => !saving && setEditing(null)}
                >
                    <div
                        className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start gap-3 px-6 py-5 border-b border-platinum-tint">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center shrink-0">
                                {isEdit ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-black text-midnight-indigo">
                                    {isEdit ? 'Sửa hình thức vi phạm' : 'Thêm hình thức vi phạm'}
                                </h3>
                                <p className="text-xs text-slate-blue mt-0.5">Áp dụng cho các cuộc họp có điểm danh trên toàn trường</p>
                            </div>
                            <button
                                onClick={() => setEditing(null)}
                                disabled={saving}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-cloud-mist"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                                    Tên hình thức vi phạm <span className="text-red-500">*</span>
                                </label>
                                <input
                                    autoFocus
                                    value={editing.form.ruleName}
                                    maxLength={150}
                                    placeholder="VD: Không mang tài liệu họp"
                                    onChange={(e) => { setForm({ ruleName: e.target.value }); setFormError(''); }}
                                    className={`${inputCls} ${formError ? '!border-red-400' : ''}`}
                                />
                                {formError && <p className="mt-1 text-xs font-medium text-red-600">{formError}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Điểm trừ</label>
                                    <input
                                        type="number"
                                        min={-100}
                                        max={100}
                                        value={editing.form.penaltyPoints}
                                        onChange={(e) => setForm({ penaltyPoints: e.target.value })}
                                        className={inputCls}
                                    />
                                    <p className="mt-1 text-[11px] text-slate-400">Số âm là điểm trừ, 0 là không trừ</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Trạng thái</label>
                                    <div className="flex items-center justify-between h-[38px] px-3 border border-platinum-tint rounded-lg">
                                        <span className={`text-sm font-semibold ${editing.form.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {editing.form.isActive ? 'Đang áp dụng' : 'Tạm tắt'}
                                        </span>
                                        {renderToggle(editing.form.isActive, () => setForm({ isActive: !editing.form.isActive }))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Điều kiện ghi nhận</label>
                                <textarea
                                    rows={3}
                                    value={editing.form.conditionText}
                                    maxLength={1000}
                                    placeholder="VD: Thư ký ghi nhận khi thành viên không mang tài liệu đã được gửi trước cuộc họp"
                                    onChange={(e) => setForm({ conditionText: e.target.value })}
                                    className={`${inputCls} resize-none`}
                                />
                            </div>

                            {editing.isSystem ? (
                                <div className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                                    <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-midnight-indigo">Cách ghi nhận: Hệ thống tự ghi nhận</p>
                                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                            Hình thức gốc của hệ thống, ghi nhận tự động theo dữ liệu camera và mốc phút.
                                            Có thể đổi tên, điểm trừ, điều kiện hoặc tắt, nhưng không xoá được.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-3 p-4 rounded-xl bg-blue-50/60 border border-blue-100">
                                    <Hand className="w-5 h-5 text-action-blue shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-midnight-indigo">Cách ghi nhận: Thư ký/chủ trì ghi nhận thủ công</p>
                                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                            Hệ thống chỉ tự ghi nhận Có mặt, Vắng mặt, Đi trễ, Về sớm theo mốc phút.
                                            Hình thức tự thêm do thư ký hoặc chủ trì chọn khi điểm danh.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30">
                            <button
                                onClick={() => setEditing(null)}
                                disabled={saving}
                                className="px-4 py-2 rounded-lg border border-platinum-tint bg-white text-sm font-semibold text-slate-600 hover:bg-cloud-mist"
                            >
                                Huỷ
                            </button>
                            <button
                                onClick={submitForm}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-action-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Lưu hình thức'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ConfirmDialog
                isOpen={!!deleting}
                message={deleting ? `Xoá hình thức "${deleting.ruleName}"? Điểm đã chốt ở các cuộc họp cũ không thay đổi.` : ''}
                confirmLabel="Xoá"
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default AttendanceViolationConfig;
