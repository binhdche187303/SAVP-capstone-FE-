import { useState, useEffect, useCallback } from 'react';
import { Building2, ChevronDown, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { getCampusOverview, getPresenceByDepartment } from '../../service/campusService';

// Bảng "Hiện diện hiện tại" (2.12) — dùng chung cho dashboard System Admin & Business Admin.
// - Theo khu vực:  GET /campus-dashboard/overview (camera đếm đầu người, tòa nhà → tầng → khu).
// - Theo phòng ban: GET /campus-dashboard/presence-by-department (nhận diện tại cổng).
// Hai nguồn khác nhau nên tổng không khớp nhau — mỗi chế độ ghi rõ nguồn ở dòng phụ đề.

const C = {
    cardBg: '#ffffff',
    border: '#D4E0ED',
    borderSub: '#E7EDF6',
    rowAlt: '#F8F9FB',
    text: '#0B3558',
    muted: '#476788',
    muted2: '#A6BBD1',
    accent: '#8247f5',
    shadow: 'rgba(71,103,136,0.04) 0px 4px 5px 0px, rgba(71,103,136,0.03) 0px 8px 15px 0px, rgba(71,103,136,0.08) 0px 30px 50px 0px',
};

const ZONE_TYPE_LABELS = {
    gate: 'Cổng ra vào',
    corridor: 'Hành lang',
    lobby: 'Sảnh lễ tân',
    parking: 'Bãi đỗ xe',
    room: 'Phòng họp',
};

// Màu tự tính từ số lượng: BE trả overall='online' khi CHỈ CẦN 1 camera online,
// nên không phân biệt được "tất cả online" với "một phần lỗi".
const cameraState = (cs) => {
    const online = cs?.online ?? 0;
    const total = online + (cs?.offline ?? 0) + (cs?.disabled ?? 0) + (cs?.maintenance ?? 0);
    if (total === 0) return { total, dot: '#A6BBD1', label: 'Chưa có camera' };
    if (online === total) return { total, dot: '#10b981', label: 'Tất cả hoạt động' };
    if (online > 0) return { total, dot: '#ffa600', label: 'Một phần mất kết nối' };
    if ((cs?.offline ?? 0) > 0) return { total, dot: '#ef4444', label: 'Mất kết nối' };
    return { total, dot: '#ffa600', label: 'Bảo trì / tắt' };
};

const sumBuilding = (b) =>
    b.floors.reduce((s, f) => s + f.zones.reduce((zs, z) => zs + (z.occupancy?.status === 'ok' ? z.occupancy.count ?? 0 : 0), 0), 0);

const formatTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

const MODES = [
    { key: 'zone', label: 'Theo khu vực' },
    { key: 'dept', label: 'Theo phòng ban' },
];

const SUBTITLES = {
    zone: 'Số người mới nhất mỗi khu có camera đếm (gồm cả khách) · nhóm theo tòa nhà → tầng',
    dept: 'Nhân sự đã quét mặt vào cổng hôm nay và chưa quét ra · không gồm khách',
};

const DepartmentTable = ({ departments }) => (
    <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th className="text-left font-semibold py-2 px-3">Phòng ban</th>
                    <th className="text-right font-semibold py-2 px-3">Đang có mặt</th>
                    <th className="text-right font-semibold py-2 px-3">Tổng nhân sự</th>
                    <th className="text-left font-semibold py-2 px-3" style={{ width: '32%' }}>Tỷ lệ</th>
                </tr>
            </thead>
            <tbody>
                {departments.map((d) => {
                    const pct = d.totalStaff > 0 ? Math.round((d.presentCount / d.totalStaff) * 100) : 0;
                    return (
                        <tr key={d.departmentId ?? '__none__'} style={{ borderTop: `1px solid ${C.borderSub}` }}>
                            <td className="py-2 px-3" style={{ color: C.text }}>
                                <div style={{ fontWeight: 600 }}>{d.departmentName || 'Chưa gán phòng ban'}</div>
                                {d.departmentCode && <div style={{ fontSize: 11, color: C.muted2 }}>{d.departmentCode}</div>}
                            </td>
                            <td className="py-2 px-3 text-right" style={{ fontWeight: 800, color: C.text }}>{d.presentCount} người</td>
                            <td className="py-2 px-3 text-right" style={{ color: C.muted }}>{d.totalStaff}</td>
                            <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: C.borderSub }}>
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.accent }} />
                                    </div>
                                    <span style={{ fontSize: 12, color: C.muted, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const OccupancyCell =({ occupancy }) => {
    if (occupancy?.status === 'ok') {
        return <span style={{ fontWeight: 800, color: C.text }}>{occupancy.count ?? 0} người</span>;
    }
    return <span style={{ color: C.muted2, fontStyle: 'italic' }}>Không có dữ liệu</span>;
};

const CameraCell = ({ cameraStatus }) => {
    const st = cameraState(cameraStatus);
    return (
        <span className="inline-flex items-center gap-1.5" title={st.label} style={{ color: C.muted }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
            {st.total > 0 ? `${cameraStatus.online}/${st.total}` : '—'}
        </span>
    );
};

const ZonePresenceTable = () => {
    const [mode, setMode] = useState('zone');
    const [data, setData] = useState(null);
    const [deptData, setDeptData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [collapsed, setCollapsed] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'dept') {
                const res = await getPresenceByDepartment({ skipToast: true });
                setDeptData(res?.data ?? null);
            } else {
                const res = await getCampusOverview({}, { skipToast: true });
                setData(res?.data ?? null);
            }
        } catch (err) {
            setError(err?.error?.message || 'Không tải được dữ liệu hiện diện.');
        } finally {
            setLoading(false);
        }
    }, [mode]);

    useEffect(() => { load(); }, [load]);

    const buildings = data?.buildings ?? [];
    const campusTotal = buildings.reduce((s, b) => s + sumBuilding(b), 0);
    const departments = deptData?.departments ?? [];
    const current = mode === 'dept' ? deptData : data;
    const toggle = (key) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

    return (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 20px 16px', boxShadow: C.shadow, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.accent} 0%, ${C.accent}44 50%, transparent 100%)` }} />

            <div className="flex items-start justify-between gap-3" style={{ marginBottom: 14 }}>
                <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Hiện diện hiện tại</h3>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{SUBTITLES[mode]}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <div className="inline-flex rounded-lg p-0.5" style={{ background: C.borderSub }}>
                        {MODES.map((m) => (
                            <button key={m.key} type="button" onClick={() => setMode(m.key)}
                                className="px-2.5 py-1 rounded-md transition-colors"
                                style={{
                                    fontSize: 12, fontWeight: 600,
                                    background: mode === m.key ? C.cardBg : 'transparent',
                                    color: mode === m.key ? C.accent : C.muted,
                                    boxShadow: mode === m.key ? '0 1px 2px rgba(11,53,88,0.12)' : 'none',
                                }}>
                                {m.label}
                            </button>
                        ))}
                    </div>
                    {current && (
                        <span className="inline-flex items-center gap-1.5"
                            title={mode === 'dept' ? 'Tổng nhân sự đang có mặt theo log cổng' : 'Tổng số người các khu có dữ liệu mới'}
                            style={{ fontSize: 13, fontWeight: 700, color: C.accent, background: `${C.accent}12`, borderRadius: 999, padding: '4px 10px' }}>
                            <Users style={{ width: 14, height: 14 }} />
                            {mode === 'dept'
                                ? `Nhân sự có mặt: ${deptData.totalPresent ?? 0} người`
                                : `Toàn khuôn viên: ${campusTotal} người`}
                        </span>
                    )}
                    {current?.generatedAt && (
                        <span style={{ fontSize: 11, color: C.muted }}>Cập nhật {formatTime(current.generatedAt)}</span>
                    )}
                    <button type="button" onClick={load} disabled={loading} title="Làm mới"
                        className="p-1.5 rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-50">
                        <RefreshCw style={{ width: 15, height: 15, color: C.muted }} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {loading && !current ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: C.borderSub }} />)}
                </div>
            ) : error ? (
                <p style={{ fontSize: 13, color: '#DC2626', padding: '12px 0' }}>{error}</p>
            ) : mode === 'dept' ? (
                departments.length === 0
                    ? <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Chưa có phòng ban nào.</p>
                    : <DepartmentTable departments={departments} />
            ) : buildings.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Chưa có khu vực nào được cấu hình.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <th className="text-left font-semibold py-2 px-3">Khu vực</th>
                                <th className="text-left font-semibold py-2 px-3">Loại</th>
                                <th className="text-right font-semibold py-2 px-3">Đang có mặt</th>
                                <th className="text-right font-semibold py-2 px-3">Vào / Ra hôm nay</th>
                                <th className="text-right font-semibold py-2 px-3">Camera</th>
                            </tr>
                        </thead>
                        <tbody>
                            {buildings.map((b) => {
                                const bKey = b.building ?? '__none__';
                                const isCollapsed = !!collapsed[bKey];
                                return [
                                    <tr key={`b-${bKey}`} onClick={() => toggle(bKey)} className="cursor-pointer"
                                        style={{ background: C.rowAlt, borderTop: `1px solid ${C.borderSub}` }}>
                                        <td colSpan={2} className="py-2 px-3" style={{ fontWeight: 700, color: C.text }}>
                                            <span className="inline-flex items-center gap-1.5">
                                                {isCollapsed ? <ChevronRight style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                                                <Building2 style={{ width: 14, height: 14, color: C.accent }} />
                                                {b.building || 'Chưa gán tòa nhà'}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-right" style={{ fontWeight: 700, color: C.text }}>
                                            <span className="inline-flex items-center gap-1">
                                                <Users style={{ width: 13, height: 13, color: C.muted }} /> Tổng {sumBuilding(b)}
                                            </span>
                                        </td>
                                        <td colSpan={2} />
                                    </tr>,
                                    ...(isCollapsed ? [] : b.floors.flatMap((f) => [
                                        <tr key={`f-${bKey}-${f.floor ?? '__none__'}`}>
                                            <td colSpan={5} className="pt-2 pb-1 px-3" style={{ paddingLeft: 32, fontSize: 11, fontWeight: 700, color: C.muted }}>
                                                {f.floor ? `Tầng ${f.floor}` : 'Chưa gán tầng'}
                                            </td>
                                        </tr>,
                                        ...f.zones.map((z) => (
                                            <tr key={z.zoneId} style={{ borderTop: `1px solid ${C.borderSub}` }}>
                                                <td className="py-2 px-3" style={{ paddingLeft: 44, color: C.text }}>
                                                    <div style={{ fontWeight: 600 }}>{z.zoneName}</div>
                                                    <div style={{ fontSize: 11, color: C.muted2 }}>{z.zoneCode}</div>
                                                </td>
                                                <td className="py-2 px-3" style={{ color: C.muted }}>{ZONE_TYPE_LABELS[z.zoneType] || z.zoneType || '—'}</td>
                                                <td className="py-2 px-3 text-right"><OccupancyCell occupancy={z.occupancy} /></td>
                                                <td className="py-2 px-3 text-right" style={{ color: C.muted }}>
                                                    {z.gateTraffic?.entriesToday ?? 0} / {z.gateTraffic?.exitsToday ?? 0}
                                                </td>
                                                <td className="py-2 px-3 text-right"><CameraCell cameraStatus={z.cameraStatus} /></td>
                                            </tr>
                                        )),
                                    ])),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ZonePresenceTable;
