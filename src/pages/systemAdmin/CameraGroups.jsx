import { Camera, Plus, RefreshCw, Search, Trash2, X, Edit2, AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from '../../utils/toast';
import { getDevices } from '../../service/sysAdminServices';
import {
    addCameraGroupDevices, createCameraGroup, deleteCameraGroup, getCameraGroupById,
    getCameraGroups, removeCameraGroupDevice, updateCameraGroup,
} from '../../service/cameraGroupServices';
import { CAMERA_TYPES } from '../../mocks/cameraMock';

const STATUS = {
    online: ['Online', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
    offline: ['Offline', 'text-red-700 bg-red-50 border-red-200'],
    maintenance: ['Bảo trì', 'text-amber-700 bg-amber-50 border-amber-200'],
    disabled: ['Vô hiệu', 'text-slate-600 bg-slate-50 border-slate-200'],
};
const StatusBadge = ({ status }) => {
    const [label, cls] = STATUS[status] || [status, STATUS.disabled[1]];
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{label}</span>;
};

const list = (res) => (Array.isArray(res?.data) ? res.data : res?.data?.items || []);

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-midnight-indigo">{title}</h3>
                <button aria-label="Đóng" onClick={onClose}><X className="w-5 h-5" /></button>
            </div>
            {children}
        </div>
    </div>
);

const GroupForm = ({ initial, onSubmit, onCancel, busy }) => {
    const [code, setCode] = useState(initial?.group_code || '');
    const [name, setName] = useState(initial?.group_name || '');
    const [desc, setDesc] = useState(initial?.description || '');
    const valid = (initial || /^[A-Za-z0-9_-]{2,50}$/.test(code)) && name.trim();
    return (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ code, name: name.trim(), desc }); }} className="space-y-3">
            <label className="block text-xs font-bold text-slate-blue uppercase">Mã nhóm
                <input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!initial} placeholder="VD: TOA-A"
                    className="mt-1 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-normal disabled:bg-slate-50" />
                {!initial && <span className="text-[11px] normal-case font-normal text-slate-500">Chữ, số, "_" hoặc "-" (2–50 ký tự), không đổi được sau khi tạo.</span>}
            </label>
            <label className="block text-xs font-bold text-slate-blue uppercase">Tên nhóm
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="VD: Camera tòa A"
                    className="mt-1 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-blue uppercase">Mô tả
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={1000}
                    className="mt-1 w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm font-normal" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-platinum-tint">Hủy</button>
                <button type="submit" disabled={!valid || busy} className="px-4 py-2 text-sm rounded-xl bg-action-blue text-white font-semibold disabled:opacity-50">
                    {initial ? 'Lưu' : 'Tạo nhóm'}
                </button>
            </div>
        </form>
    );
};

const AddDevicesModal = ({ group, onClose, onDone }) => {
    const [devices, setDevices] = useState([]);
    const [picked, setPicked] = useState([]);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const have = useMemo(() => new Set(group.devices.map((d) => d.id)), [group]);

    useEffect(() => {
        getDevices({ limit: 100 }).then((r) => setDevices(list(r).filter((d) => CAMERA_TYPES.includes(d.device_type) && !have.has(d.id))))
            .catch((e) => void e);
    }, [have]);

    const shown = devices.filter((d) => `${d.device_name} ${d.device_code}`.toLowerCase().includes(q.toLowerCase()));
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const submit = async () => {
        setBusy(true);
        try { await addCameraGroupDevices(group.id, picked); toast.success(`Đã thêm ${picked.length} camera`); onDone(); }
        catch (e) { void e; }
        finally { setBusy(false); }
    };
    return (
        <Modal title={`Thêm camera vào "${group.group_name}"`} onClose={onClose}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm camera..." className="w-full mb-3 px-3 py-2 border border-platinum-tint rounded-xl text-sm" />
            <div className="max-h-72 overflow-auto border border-platinum-tint rounded-xl divide-y">
                {shown.length === 0 && <p className="p-4 text-sm text-slate-500">Không còn camera nào để thêm.</p>}
                {shown.map((d) => (
                    <label key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />
                        <span className="flex-1">{d.device_name} <span className="text-slate-400">({d.device_code})</span></span>
                        <StatusBadge status={d.status} />
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-platinum-tint">Hủy</button>
                <button onClick={submit} disabled={picked.length === 0 || picked.length > 50 || busy}
                    className="px-4 py-2 text-sm rounded-xl bg-action-blue text-white font-semibold disabled:opacity-50">Thêm {picked.length || ''} camera</button>
            </div>
        </Modal>
    );
};

const CameraGroups = () => {
    const [groups, setGroups] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [modal, setModal] = useState(null); // 'create' | 'edit' | 'add' | 'delete'
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setGroups(list(await getCameraGroups({ search }))); }
        catch (e) { void e; /* request.js đã toast lỗi */ }
        finally { setLoading(false); }
    }, [search]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const open = async (id) => {
        try { setDetail((await getCameraGroupById(id)).data); }
        catch (e) { void e; }
    };
    const refreshAll = async () => { await load(); if (detail) await open(detail.id); };

    const run = async (fn, okMsg, failMsg) => {
        setBusy(true);
        try { await fn(); toast.success(okMsg); setModal(null); return true; }
        catch (e) { void failMsg; return false; }
        finally { setBusy(false); }
    };

    const create = ({ code, name, desc }) => run(async () => {
        const res = await createCameraGroup({ group_code: code, group_name: name, ...(desc ? { description: desc } : {}) });
        await load(); setDetail(res.data);
    }, 'Đã tạo nhóm camera', 'Không tạo được nhóm');
    const edit = ({ name, desc }) => run(async () => {
        const res = await updateCameraGroup(detail.id, { group_name: name, description: desc });
        setDetail(res.data); await load();
    }, 'Đã cập nhật nhóm', 'Không cập nhật được nhóm');
    const remove = () => run(async () => { await deleteCameraGroup(detail.id); setDetail(null); await load(); }, 'Đã xóa nhóm', 'Không xóa được nhóm');
    const removeDevice = (d) => run(async () => { await removeCameraGroupDevice(detail.id, d.id); await refreshAll(); }, `Đã gỡ ${d.device_name} khỏi nhóm`, 'Không gỡ được camera');

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-midnight-indigo">Nhóm camera</h1>
                    <p className="text-sm text-slate-blue">Gom camera theo tòa nhà / mục đích để quản lý. Camera offline quá ngưỡng giờ sẽ phát cảnh báo cần bảo trì.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={load} aria-label="Làm mới" className="p-2.5 border border-platinum-tint rounded-xl"><RefreshCw className="w-4 h-4" /></button>
                    <button onClick={() => setModal('create')} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-action-blue text-white rounded-xl text-sm font-semibold">
                        <Plus className="w-4 h-4" />Tạo nhóm
                    </button>
                </div>
            </div>

            <div className="relative max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã nhóm"
                    className="w-full pl-9 pr-3 py-2 border border-platinum-tint rounded-xl text-sm" />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5">
                <div className="space-y-2">
                    {loading && <p className="text-sm text-slate-500">Đang tải...</p>}
                    {!loading && groups.length === 0 && (
                        <div className="p-8 text-center border border-dashed border-platinum-tint rounded-2xl text-sm text-slate-500">
                            {search ? 'Không có nhóm khớp từ khóa.' : 'Chưa có nhóm camera nào. Bấm "Tạo nhóm" để bắt đầu.'}
                        </div>
                    )}
                    {groups.map((g) => (
                        <button key={g.id} onClick={() => open(g.id)}
                            className={`w-full text-left p-4 rounded-2xl border transition ${detail?.id === g.id ? 'border-action-blue bg-blue-50/40' : 'border-platinum-tint bg-white hover:border-action-blue'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-midnight-indigo">{g.group_name}</span>
                                <span className="text-[11px] text-slate-400">{g.group_code}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-blue">
                                <span className="inline-flex items-center gap-1"><Camera className="w-3.5 h-3.5" />{g.device_count} camera</span>
                                {g.offline_count > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-3.5 h-3.5" />{g.offline_count} offline</span>}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="bg-white border border-platinum-tint rounded-2xl p-5 min-h-[200px]">
                    {!detail ? (
                        <p className="text-sm text-slate-500">Chọn một nhóm để xem và quản lý camera.</p>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold text-midnight-indigo">{detail.group_name}</h2>
                                    <p className="text-xs text-slate-400">{detail.group_code}</p>
                                    {detail.description && <p className="mt-2 text-sm text-slate-blue">{detail.description}</p>}
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => setModal('edit')} aria-label="Sửa nhóm" className="p-2 border border-platinum-tint rounded-lg"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => setModal('delete')} aria-label="Xóa nhóm" className="p-2 border border-red-200 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="mt-5 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-blue uppercase">Camera trong nhóm ({detail.devices.length})</h3>
                                <button onClick={() => setModal('add')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-action-blue text-white"><Plus className="w-3.5 h-3.5" />Thêm camera</button>
                            </div>
                            {detail.devices.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">Nhóm chưa có camera.</p>
                            ) : (
                                <ul className="mt-3 divide-y border border-platinum-tint rounded-xl">
                                    {detail.devices.map((d) => (
                                        <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                            <span className="flex-1">{d.device_name} <span className="text-slate-400">({d.device_code})</span></span>
                                            <StatusBadge status={d.status} />
                                            <button onClick={() => removeDevice(d)} disabled={busy} aria-label={`Gỡ ${d.device_name}`} className="text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </div>

            {modal === 'create' && <Modal title="Tạo nhóm camera" onClose={() => setModal(null)}><GroupForm onSubmit={create} onCancel={() => setModal(null)} busy={busy} /></Modal>}
            {modal === 'edit' && detail && <Modal title="Sửa nhóm camera" onClose={() => setModal(null)}><GroupForm initial={detail} onSubmit={edit} onCancel={() => setModal(null)} busy={busy} /></Modal>}
            {modal === 'add' && detail && <AddDevicesModal group={detail} onClose={() => setModal(null)} onDone={async () => { setModal(null); await refreshAll(); }} />}
            {modal === 'delete' && detail && (
                <Modal title="Xóa nhóm camera?" onClose={() => setModal(null)}>
                    <p className="text-sm text-slate-blue">Nhóm <b>{detail.group_name}</b> sẽ bị xóa. Các camera trong nhóm vẫn được giữ nguyên.</p>
                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded-xl border border-platinum-tint">Hủy</button>
                        <button onClick={remove} disabled={busy} className="px-4 py-2 text-sm rounded-xl bg-red-600 text-white font-semibold disabled:opacity-50">Xóa nhóm</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default CameraGroups;
