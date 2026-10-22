import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, Download, DoorOpen, Layers, MapPin, RefreshCw, Route, Search, UserRound, Video } from 'lucide-react';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import { getCameraTrace } from '../../service/campusService';
import { getCameraGroups } from '../../service/cameraGroupServices';
import { getDevices } from '../../service/sysAdminServices';
import { getZones } from '../../service/zoneServices';
import { CAMERA_TYPES } from '../../mocks/cameraMock';
import { downloadReport, currentUserName, fmtVN, toDate } from '../../utils/exportExcel';
import toast from '../../utils/toast';

// Họp 20/10: truy vết (mất đồ…) theo nhóm camera / từng camera / khu vực, lọc theo giờ.
// Dữ liệu = cùng 3 nguồn với "Lịch sử di chuyển theo người" (cổng, họp qua khuôn mặt, khu vực) nhưng tra theo THIẾT BỊ.

const MODES = [
    { key: 'groupId', label: 'Nhóm camera', icon: Layers, hint: 'Ví dụ: Tòa A (4 camera), Cổng 1 (4 camera), Nhà xe' },
    { key: 'deviceId', label: 'Từng camera', icon: Video, hint: 'Chọn một camera cụ thể' },
    { key: 'zoneId', label: 'Khu vực', icon: MapPin, hint: 'Mọi camera đặt trong khu vực' },
];

const KIND_LABEL = { gate: 'Cổng (xe)', meeting: 'Phòng họp', zone: 'Khu vực' };
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 6;

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDateTime = (iso) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const list = (res) => (Array.isArray(res?.data) ? res.data : res?.data?.items || []);
const zoneLabel = (z) => z.zone_name ?? z.zoneName ?? z.name ?? z.id;

const QUICK_RANGES = [
    { key: '1h', label: '1 giờ qua', ms: 3600000 },
    { key: '3h', label: '3 giờ qua', ms: 3 * 3600000 },
    { key: '8h', label: '8 giờ qua', ms: 8 * 3600000 },
    { key: '24h', label: '24 giờ qua', ms: 24 * 3600000 },
    { key: '7d', label: '7 ngày qua', ms: 7 * 24 * 3600000 },
];

const directionText = (e) => {
    const d = (e.direction || '').toLowerCase();
    if (d === 'enter' || d === 'in') return 'Vào';
    if (d === 'leave' || d === 'exit' || d === 'out') return 'Ra';
    if (d === 'appear') return 'Xuất hiện';
    if (d === 'disappear') return 'Rời đi';
    if (d === 'seen') return 'Quan sát thấy';
    return d || '—';
};

const describe = (e) => {
    if (e.kind === 'gate') return `${directionText(e)} cổng${e.plateNumber ? ` · xe ${e.plateNumber}` : ''}`;
    if (e.kind === 'meeting') return `${directionText(e)}${e.roomName ? ` · ${e.roomName}` : ''}`;
    return directionText(e);
};

const CameraTrace = () => {
    const [searchParams] = useSearchParams();
    const initialMode = MODES.find((m) => searchParams.get(m.key))?.key || 'groupId';

    const [mode, setMode] = useState(initialMode);
    const [targetId, setTargetId] = useState(searchParams.get(initialMode) || '');
    const [groups, setGroups] = useState([]);
    const [devices, setDevices] = useState([]);
    const [zones, setZones] = useState([]);

    const [quick, setQuick] = useState('3h');
    const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() - 3 * 3600000)));
    const [to, setTo] = useState(() => toLocalInput(new Date()));

    const [kindFilter, setKindFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [snapshotEventId, setSnapshotEventId] = useState(null);

    // Tiền tố đường dẫn hiện tại (system-admin / business-admin) để link sang trang theo người.
    const base = `/${window.location.pathname.split('/')[1]}`;
    const canOpenJourney = base === '/system-admin';

    useEffect(() => {
        getCameraGroups({}).then((r) => setGroups(list(r))).catch(() => {});
        getDevices({ limit: 100 }).then((r) => setDevices(list(r).filter((d) => CAMERA_TYPES.includes(d.device_type)))).catch(() => {});
        getZones({ limit: 100 }).then((r) => setZones(list(r))).catch(() => {});
    }, []);

    const options = useMemo(() => {
        if (mode === 'groupId') return groups.map((g) => ({ id: g.id, label: `${g.group_name} (${g.device_count} camera)` }));
        if (mode === 'deviceId') return devices.map((d) => ({ id: d.id, label: `${d.device_name} · ${d.device_code}` }));
        return zones.map((z) => ({ id: z.id, label: zoneLabel(z) }));
    }, [mode, groups, devices, zones]);

    const applyQuick = (key) => {
        setQuick(key);
        if (key === 'custom') return;
        const r = QUICK_RANGES.find((x) => x.key === key);
        setFrom(toLocalInput(new Date(Date.now() - r.ms)));
        setTo(toLocalInput(new Date()));
    };

    const buildParams = useCallback((p, limit) => {
        const fromDate = quick === 'custom' ? new Date(from) : new Date(Date.now() - (QUICK_RANGES.find((x) => x.key === quick)?.ms ?? 3 * 3600000));
        const toDate = quick === 'custom' ? new Date(to) : new Date();
        return { [mode]: targetId, from: fromDate.toISOString(), to: toDate.toISOString(), page: p, limit };
    }, [mode, targetId, quick, from, to]);

    const run = useCallback(async (p = 1) => {
        if (!targetId) {
            setError('Hãy chọn nhóm camera, camera hoặc khu vực cần truy vết.');
            return;
        }
        if (quick === 'custom' && !(new Date(to) > new Date(from))) {
            setError('Mốc kết thúc phải sau mốc bắt đầu.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await getCameraTrace(buildParams(p, PAGE_SIZE));
            if (res?.success) {
                setResult(res.data);
                setPage(p);
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Không truy vết được.');
        } finally {
            setLoading(false);
        }
    }, [targetId, quick, from, to, buildParams]);

    // Vào từ link có sẵn mục tiêu (vd. nút "Truy vết" ở trang Nhóm camera) thì chạy luôn.
    useEffect(() => {
        if (searchParams.get(initialMode)) run(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const events = useMemo(() => {
        const q = nameFilter.trim().toLowerCase();
        return (result?.events || []).filter((e) =>
            (!kindFilter || e.kind === kindFilter)
            && (!q || (e.userName || '').toLowerCase().includes(q) || (e.employeeCode || '').toLowerCase().includes(q) || (e.plateNumber || '').toLowerCase().includes(q)));
    }, [result, kindFilter, nameFilter]);

    const handleExport = async () => {
        if (!targetId) return;
        try {
            toast.info('Đang chuẩn bị file...');
            const params = buildParams(1, EXPORT_PAGE_SIZE);
            let all = [];
            let devs = result?.devices || [];
            let truncated = false;
            for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
                // eslint-disable-next-line no-await-in-loop
                const res = await getCameraTrace({ ...params, page: p });
                all = all.concat(res?.data?.events || []);
                if (res?.data?.devices) devs = res.data.devices;
                if (!res?.data?.hasMore) break;
                if (p === EXPORT_MAX_PAGES) truncated = true;
            }
            if (!all.length) {
                toast.error('Không có dữ liệu để xuất.');
                return;
            }
            all.sort((x, y) => x.time.localeCompare(y.time));

            const modeLabel = MODES.find((m) => m.key === mode).label;
            const targetLabel = options.find((o) => o.id === targetId)?.label || targetId;
            const exportedAt = new Date();

            const detail = all.map((e, i) => ({
                stt: i + 1,
                time: toDate(e.time),
                kind: KIND_LABEL[e.kind] || e.kind,
                action: describe(e),
                person: e.userName || (e.plateNumber ? `Xe ${e.plateNumber}` : 'Không nhận diện được'),
                code: e.employeeCode || '',
                plate: e.plateNumber || '',
                room: e.roomName || '',
                camera: e.deviceName || '',
                camCode: e.deviceCode || '',
                zone: e.zoneName || '',
                group: (e.groupNames || []).join(', '),
                evidence: e.snapshotEventId || '',
            }));

            const perCamera = devs.map((d) => {
                const evs = all.filter((e) => e.deviceId === d.id);
                const people = new Set(evs.map((e) => e.userId).filter(Boolean));
                return {
                    camera: d.deviceName,
                    code: d.deviceCode,
                    zone: evs.find((e) => e.zoneName)?.zoneName || '',
                    group: (evs.find((e) => e.groupNames?.length)?.groupNames || []).join(', '),
                    count: evs.length,
                    people: people.size,
                    first: toDate(evs[0]?.time),
                    last: toDate(evs[evs.length - 1]?.time),
                };
            }).sort((x, y) => y.count - x.count);

            const byPerson = new Map();
            all.forEach((e) => {
                const key = e.userId || (e.plateNumber ? `plate:${e.plateNumber}` : 'unknown');
                const cur = byPerson.get(key) || { person: e.userName || (e.plateNumber ? `Xe ${e.plateNumber}` : 'Không nhận diện được'), code: e.employeeCode || '', count: 0, first: e.time, last: e.time, cams: new Set(), zones: new Set() };
                cur.count += 1;
                cur.last = e.time;
                if (e.deviceName) cur.cams.add(e.deviceName);
                if (e.zoneName) cur.zones.add(e.zoneName);
                byPerson.set(key, cur);
            });
            const people = [...byPerson.values()].sort((x, y) => y.count - x.count).map((p, i) => ({
                stt: i + 1, person: p.person, code: p.code, count: p.count, first: toDate(p.first), last: toDate(p.last),
                cams: [...p.cams].join(', '), zones: [...p.zones].join(', '),
            }));

            const fromDate = new Date(params.from);
            const toDateV = new Date(params.to);
            await downloadReport({
                fileName: `Truy-vet-camera_${String(targetLabel).replace(/\s+/g, '-').slice(0, 40)}_${exportedAt.toISOString().slice(0, 10)}`,
                title: 'BÁO CÁO TRUY VẾT THEO CAMERA / KHU VỰC',
                subtitle: 'Các lượt camera ghi nhận người / xe trong phạm vi và khung giờ được chọn',
                info: [
                    { section: 'Phạm vi truy vết' },
                    ['Tra theo', modeLabel],
                    ['Đối tượng tra', targetLabel],
                    ['Khoảng thời gian', `${fmtVN(fromDate)}  →  ${fmtVN(toDateV)}`],
                    ['Số camera được tra', devs.length],
                    { section: 'Kết quả tổng hợp' },
                    ['Tổng số lượt ghi nhận', all.length],
                    ['Số người / đối tượng khác nhau', people.length],
                    ['Lượt không nhận diện được', all.filter((e) => !e.userId && !e.plateNumber).length],
                    ['Lưu ý dữ liệu', truncated ? `Chỉ xuất ${all.length} lượt gần nhất do quá nhiều dữ liệu — hãy thu hẹp khoảng thời gian.` : 'Đầy đủ trong phạm vi đã chọn', truncated ? { fill: 'FEF3C7', color: 'B45309' } : undefined],
                    { section: 'Thông tin xuất' },
                    ['Người xuất', currentUserName()],
                    ['Thời điểm xuất', fmtVN(exportedAt)],
                    { section: 'Ghi chú' },
                    ['Gộp sự kiện', 'Camera bắn liên tục nên cùng người, cùng camera, cùng hướng trong 1 phút chỉ tính 1 lượt'],
                    ['Mã ảnh bằng chứng', 'Dùng để mở ảnh gốc của sự kiện trên hệ thống'],
                    ['Phân quyền', 'Trưởng đơn vị chỉ thấy các lượt của nhân sự thuộc phòng ban mình'],
                ],
                sheets: [
                    {
                        name: 'Theo camera',
                        freezeCols: 1,
                        columns: [
                            { header: 'Camera', key: 'camera', width: 34 },
                            { header: 'Mã camera', key: 'code', width: 20 },
                            { header: 'Khu vực', key: 'zone', width: 22 },
                            { header: 'Nhóm camera', key: 'group', width: 28 },
                            { header: 'Số lượt ghi nhận', key: 'count', width: 16 },
                            { header: 'Số người khác nhau', key: 'people', width: 18 },
                            { header: 'Lần đầu', key: 'first', width: 20 },
                            { header: 'Lần cuối', key: 'last', width: 20 },
                        ],
                        rows: perCamera,
                    },
                    {
                        name: 'Theo người',
                        freezeCols: 2,
                        columns: [
                            { header: 'STT', key: 'stt', width: 6, align: 'center' },
                            { header: 'Người / đối tượng', key: 'person', width: 28 },
                            { header: 'Mã nhân sự', key: 'code', width: 14 },
                            { header: 'Số lượt', key: 'count', width: 10 },
                            { header: 'Lần đầu', key: 'first', width: 20 },
                            { header: 'Lần cuối', key: 'last', width: 20 },
                            { header: 'Camera đã thấy', key: 'cams', width: 46, wrap: true },
                            { header: 'Khu vực đã qua', key: 'zones', width: 30, wrap: true },
                        ],
                        rows: people,
                        cellStyle: (row, key) => (key === 'person' && row.person === 'Không nhận diện được' ? { fill: 'FEE2E2', color: 'B91C1C', bold: true } : undefined),
                    },
                    {
                        name: 'Chi tiết theo thời gian',
                        freezeCols: 3,
                        columns: [
                            { header: 'STT', key: 'stt', width: 6, align: 'center' },
                            { header: 'Thời gian', key: 'time', width: 20 },
                            { header: 'Loại', key: 'kind', width: 13 },
                            { header: 'Sự kiện', key: 'action', width: 28 },
                            { header: 'Người / đối tượng', key: 'person', width: 26 },
                            { header: 'Mã nhân sự', key: 'code', width: 13 },
                            { header: 'Biển số', key: 'plate', width: 12 },
                            { header: 'Phòng', key: 'room', width: 18 },
                            { header: 'Camera', key: 'camera', width: 30 },
                            { header: 'Mã camera', key: 'camCode', width: 18 },
                            { header: 'Khu vực', key: 'zone', width: 20 },
                            { header: 'Nhóm camera', key: 'group', width: 26 },
                            { header: 'Mã ảnh bằng chứng', key: 'evidence', width: 38 },
                        ],
                        rows: detail,
                        cellStyle: (row, key) => (key === 'person' && row.person === 'Không nhận diện được' ? { fill: 'FEE2E2', color: 'B91C1C', bold: true } : undefined),
                    },
                ],
            });
            toast.success(`Đã xuất ${detail.length} lượt.`);
        } catch (err) {
            toast.error(err?.error?.message || err?.message || 'Không xuất được file.');
        }
    };

    const inputCls = 'px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo';

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            <div className="border-b border-platinum-tint pb-5">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <Route className="w-6 h-6 text-action-blue" />
                    Truy vết theo camera / khu vực
                </h2>
                <p className="text-xs text-slate-blue mt-1">
                    Xem camera nào đã ghi nhận ai, lúc nào, ở đâu — dùng để truy vết mất đồ ở một tòa nhà, cổng hoặc nhà xe.
                    {canOpenJourney && <> Muốn tra theo một người, dùng <Link to={`${base}/user-journey`} className="text-action-blue font-semibold">Lịch sử di chuyển theo người</Link>.</>}
                </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                <div className="flex flex-wrap gap-2">
                    {MODES.map((m) => (
                        <button key={m.key} type="button"
                            onClick={() => { setMode(m.key); setTargetId(''); setResult(null); setError(''); }}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${mode === m.key ? 'bg-action-blue text-white border-action-blue' : 'bg-white text-slate-blue border-platinum-tint hover:border-action-blue'}`}>
                            <m.icon className="w-4 h-4" />{m.label}
                        </button>
                    ))}
                </div>

                <div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-end">
                    <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-blue uppercase">{MODES.find((m) => m.key === mode).label} *</label>
                        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={`${inputCls} w-full`}>
                            <option value="">— Chọn —</option>
                            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400">{MODES.find((m) => m.key === mode).hint}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-blue uppercase">Khoảng thời gian</label>
                        <select value={quick} onChange={(e) => applyQuick(e.target.value)} className={`${inputCls} w-full`}>
                            {QUICK_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                            <option value="custom">Tùy chọn giờ cụ thể</option>
                        </select>
                    </div>
                </div>

                {quick === 'custom' && (
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Từ</label>
                            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-full`} />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Đến</label>
                            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-full`} />
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => run(1)} disabled={loading}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-action-blue text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                        <Search className="w-4 h-4" />{loading ? 'Đang truy vết...' : 'Truy vết'}
                    </button>
                    {result && (
                        <>
                            <button type="button" onClick={() => run(page)} disabled={loading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo hover:bg-cloud-mist">
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Làm mới
                            </button>
                            <button type="button" onClick={handleExport}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo hover:bg-cloud-mist">
                                <Download className="w-4 h-4" />Xuất Excel
                            </button>
                        </>
                    )}
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>

            {result && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-bold text-midnight-indigo text-sm">Kết quả truy vết</h3>
                            <p className="text-[11px] text-slate-blue mt-0.5">
                                {result.devices.length} camera được tra:{' '}
                                {result.devices.slice(0, 6).map((d) => d.deviceName).join(', ')}{result.devices.length > 6 ? '…' : ''}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={`${inputCls} !py-1.5 text-xs`}>
                                <option value="">Mọi loại sự kiện</option>
                                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Lọc theo tên / mã / biển số"
                                className={`${inputCls} !py-1.5 text-xs w-52`} />
                        </div>
                    </div>

                    {result.devices.length === 0 ? (
                        <p className="py-14 text-center text-sm text-slate-400">Lựa chọn này chưa có camera nào (nhóm trống hoặc khu vực chưa gắn camera).</p>
                    ) : events.length === 0 ? (
                        <p className="py-14 text-center text-sm text-slate-400">Không có sự kiện nào trong khoảng thời gian này.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                                    <tr className="text-[11px] font-extrabold text-slate-blue uppercase tracking-wider">
                                        <th className="px-5 py-3">Thời gian</th>
                                        <th className="px-5 py-3">Người / đối tượng</th>
                                        <th className="px-5 py-3">Sự kiện</th>
                                        <th className="px-5 py-3">Camera</th>
                                        <th className="px-5 py-3">Khu vực · Nhóm</th>
                                        <th className="px-5 py-3 text-center">Ảnh</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint">
                                    {events.map((e) => (
                                        <tr key={`${e.kind}-${e.id}`} className="hover:bg-cloud-mist/30">
                                            <td className="px-5 py-3 text-xs font-mono text-slate-blue whitespace-nowrap">{fmtDateTime(e.time)}</td>
                                            <td className="px-5 py-3 text-sm">
                                                {e.userName ? (
                                                    <>
                                                        <span className="inline-flex items-center gap-1.5 font-semibold text-midnight-indigo">
                                                            <UserRound className="w-3.5 h-3.5 text-slate-400" />{e.userName}
                                                        </span>
                                                        {e.employeeCode && <span className="block text-[10px] text-slate-400">{e.employeeCode}</span>}
                                                        {canOpenJourney && e.userId && (
                                                            <Link to={`${base}/user-journey?userId=${e.userId}`} className="text-[10px] text-action-blue font-semibold">Xem hành trình người này →</Link>
                                                        )}
                                                    </>
                                                ) : e.plateNumber ? (
                                                    <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-900 text-white rounded">{e.plateNumber}</span>
                                                ) : (
                                                    <span className="text-xs font-semibold text-red-600">Không nhận diện được</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-xs">
                                                <span className="inline-flex items-center gap-1 font-semibold text-midnight-indigo">
                                                    {e.kind === 'meeting' ? <DoorOpen className="w-3.5 h-3.5 text-slate-400" /> : <MapPin className="w-3.5 h-3.5 text-slate-400" />}
                                                    {describe(e)}
                                                </span>
                                                <span className="block text-[10px] text-slate-400">{KIND_LABEL[e.kind]}</span>
                                            </td>
                                            <td className="px-5 py-3 text-xs">
                                                <span className="inline-flex items-center gap-1 font-semibold text-midnight-indigo"><Camera className="w-3 h-3 text-slate-400" />{e.deviceName || '—'}</span>
                                                {e.deviceCode && <span className="block text-[10px] text-slate-400">{e.deviceCode}</span>}
                                            </td>
                                            <td className="px-5 py-3 text-xs text-slate-blue">
                                                {e.zoneName || '—'}
                                                {e.groupNames?.length > 0 && <span className="block text-[10px] text-slate-400">{e.groupNames.join(', ')}</span>}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                {e.snapshotEventId ? (
                                                    <ThumbnailImage eventId={e.snapshotEventId} className="w-10 h-10 mx-auto" alt="Ảnh bằng chứng"
                                                        onClick={() => setSnapshotEventId(e.snapshotEventId)} />
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="px-6 py-3 border-t border-platinum-tint flex items-center justify-between text-xs text-slate-blue">
                        <span>Trang {page} · {events.length} dòng{(kindFilter || nameFilter) ? ' (đã lọc)' : ''} · camera bắn liên tục được gộp 1 dòng/phút</span>
                        <div className="flex gap-2">
                            <button type="button" disabled={page <= 1 || loading} onClick={() => run(page - 1)}
                                className="p-2 rounded-lg border border-platinum-tint disabled:opacity-40" aria-label="Trang trước"><ChevronLeft className="w-4 h-4" /></button>
                            <button type="button" disabled={!result.hasMore || loading} onClick={() => run(page + 1)}
                                className="p-2 rounded-lg border border-platinum-tint disabled:opacity-40" aria-label="Trang sau"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            )}

            <EventSnapshotModal isOpen={!!snapshotEventId} onClose={() => setSnapshotEventId(null)} eventId={snapshotEventId} />
        </div>
    );
};

export default CameraTrace;
