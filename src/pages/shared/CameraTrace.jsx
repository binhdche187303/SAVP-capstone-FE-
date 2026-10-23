import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Camera, ChevronLeft, ChevronRight, DoorOpen, Layers, MapPin, RefreshCw, Route, Search, UserRound, Video } from 'lucide-react';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import ExportMenu from '../../components/report/ExportMenu';
import { getCameraTrace } from '../../service/campusService';
import { getCameraGroups } from '../../service/cameraGroupServices';
import { getDevices } from '../../service/sysAdminServices';
import { getZones } from '../../service/zoneServices';
import { CAMERA_TYPES } from '../../mocks/cameraMock';
import { downloadReport, currentUserName, fmtVN, toDate } from '../../utils/exportExcel';
import toast from '../../utils/toast';

// Họp 20/10: truy vết (mất đồ…) theo nhóm camera / từng camera / khu vực, lọc theo giờ.
// Dữ liệu = cùng 3 nguồn với "Lịch sử di chuyển theo người" (cổng, họp qua khuôn mặt, khu vực) nhưng tra theo THIẾT BỊ.
// Lọc loại sự kiện / tìm tên và sắp xếp theo cột đều chạy phía máy chủ → đúng trên TOÀN BỘ kết quả, không chỉ trang đang xem.

const MODES = [
    { key: 'groupId', label: 'Nhóm camera', icon: Layers, hint: 'Ví dụ: Tòa A (4 camera), Cổng 1 (4 camera), Nhà xe' },
    { key: 'deviceId', label: 'Từng camera', icon: Video, hint: 'Chọn một camera cụ thể' },
    { key: 'zoneId', label: 'Khu vực', icon: MapPin, hint: 'Mọi camera đặt trong khu vực' },
];

const KIND_LABEL = { gate: 'Cổng (xe)', meeting: 'Phòng họp', zone: 'Khu vực' };
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 6;

// Cột của bảng kết quả. `sortKey` trùng whitelist `sortBy` của BE; cột Ảnh không sắp xếp.
const COLUMNS = [
    { key: 'time', label: 'Thời gian', sortKey: 'time', width: 'w-[150px]' },
    { key: 'person', label: 'Người / đối tượng', sortKey: 'person', width: 'w-[26%]' },
    { key: 'event', label: 'Sự kiện', sortKey: 'event', width: 'w-[20%]' },
    { key: 'camera', label: 'Camera', sortKey: 'camera', width: 'w-[20%]' },
    { key: 'zone', label: 'Khu vực · Nhóm', sortKey: 'zone', width: 'w-[20%]' },
    { key: 'image', label: 'Ảnh', width: 'w-[72px]', center: true },
];

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDateTime = (iso) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
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

const personLabel = (e) => e.userName || (e.plateNumber ? `Xe ${e.plateNumber}` : 'Không nhận diện được');

const inputCls = 'px-[0.75rem] py-2 bg-slate-50 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo';
const labelCls = 'block text-[10px] font-bold text-slate-blue uppercase tracking-wide';

const SortHeader = ({ column, sort, onSort }) => {
    const active = sort.by === column.sortKey;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={`px-[1rem] py-[0.75rem] ${column.width} ${column.center ? 'text-center' : 'text-left'}`}>
            {column.sortKey ? (
                <button type="button" onClick={() => onSort(column.sortKey)}
                    className={`inline-flex items-center gap-1.5 uppercase tracking-wider font-extrabold hover:text-action-blue ${active ? 'text-action-blue' : ''}`}>
                    {column.label}
                    <Icon className={`w-3 h-3 ${active ? '' : 'opacity-40'}`} />
                </button>
            ) : column.label}
        </th>
    );
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
    const [debouncedName, setDebouncedName] = useState('');
    const [sort, setSort] = useState({ by: 'time', dir: 'desc' });
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [busyFormat, setBusyFormat] = useState(null);

    // Tiền tố đường dẫn hiện tại (system-admin / business-admin) để link sang trang theo người.
    const base = `/${window.location.pathname.split('/')[1]}`;
    const canOpenJourney = base === '/system-admin';

    useEffect(() => {
        getCameraGroups({}).then((r) => setGroups(list(r))).catch(() => {});
        getDevices({ limit: 100 }).then((r) => setDevices(list(r).filter((d) => CAMERA_TYPES.includes(d.device_type)))).catch(() => {});
        getZones({ limit: 100 }).then((r) => setZones(list(r))).catch(() => {});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedName(nameFilter.trim()), 400);
        return () => clearTimeout(t);
    }, [nameFilter]);

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
        const toDateV = quick === 'custom' ? new Date(to) : new Date();
        return {
            [mode]: targetId,
            from: fromDate.toISOString(),
            to: toDateV.toISOString(),
            page: p,
            limit,
            sortBy: sort.by,
            sortDir: sort.dir,
            ...(kindFilter ? { kind: kindFilter } : {}),
            ...(debouncedName ? { q: debouncedName } : {}),
        };
    }, [mode, targetId, quick, from, to, sort, kindFilter, debouncedName]);

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

    // Đổi sắp xếp / bộ lọc → truy vấn lại từ trang 1 (bỏ qua lần đầu và khi chưa có kết quả).
    const runRef = useRef(run);
    runRef.current = run;
    const hasResult = useRef(false);
    hasResult.current = Boolean(result);
    const firstFilterRun = useRef(true);
    useEffect(() => {
        if (firstFilterRun.current) { firstFilterRun.current = false; return; }
        if (hasResult.current) runRef.current(1);
    }, [sort, kindFilter, debouncedName]);

    const toggleSort = (key) => setSort((cur) => (cur.by === key
        ? { by: key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { by: key, dir: key === 'time' ? 'desc' : 'asc' }));

    const events = result?.events || [];
    const total = result?.total ?? events.length;
    const rangeStart = events.length ? (page - 1) * PAGE_SIZE + 1 : 0;
    const rangeEnd = (page - 1) * PAGE_SIZE + events.length;
    const filtered = Boolean(kindFilter || debouncedName);

    const handleExport = async (format) => {
        if (!targetId) return;
        setBusyFormat(format);
        try {
            toast.info('Đang chuẩn bị báo cáo...');
            // Xuất đúng những gì đang lọc (loại sự kiện / từ khóa) nhưng luôn theo thứ tự thời gian tăng dần.
            const params = { ...buildParams(1, EXPORT_PAGE_SIZE), sortBy: 'time', sortDir: 'asc' };
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

            const modeLabel = MODES.find((m) => m.key === mode).label;
            const targetLabel = options.find((o) => o.id === targetId)?.label || targetId;
            const exportedAt = new Date();

            const detail = all.map((e, i) => ({
                stt: i + 1,
                time: toDate(e.time),
                kind: KIND_LABEL[e.kind] || e.kind,
                action: describe(e),
                person: personLabel(e),
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
                const cur = byPerson.get(key) || { person: personLabel(e), code: e.employeeCode || '', count: 0, first: e.time, last: e.time, cams: new Set(), zones: new Set() };
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
            const redUnknown = (row, key) => (key === 'person' && row.person === 'Không nhận diện được' ? { fill: 'FEE2E2', color: 'B91C1C', bold: true } : undefined);
            await downloadReport({
                format,
                fileName: `Truy-vet-camera_${String(targetLabel).replace(/\s+/g, '-').slice(0, 40)}_${exportedAt.toISOString().slice(0, 10)}`,
                title: 'BÁO CÁO TRUY VẾT THEO CAMERA / KHU VỰC',
                subtitle: 'Các lượt camera ghi nhận người / xe trong phạm vi và khung giờ được chọn',
                info: [
                    { section: 'Phạm vi truy vết' },
                    ['Tra theo', modeLabel],
                    ['Đối tượng tra', targetLabel],
                    ['Khoảng thời gian', `${fmtVN(fromDate)}  →  ${fmtVN(toDateV)}`],
                    ['Số camera được tra', devs.length],
                    ['Bộ lọc loại sự kiện', kindFilter ? KIND_LABEL[kindFilter] : 'Tất cả'],
                    ['Bộ lọc từ khóa', debouncedName || 'Không'],
                    { section: 'Kết quả tổng hợp' },
                    ['Tổng số lượt ghi nhận', all.length],
                    ['Số người / đối tượng khác nhau', people.length],
                    ['Lượt không nhận diện được', all.filter((e) => !e.userId && !e.plateNumber).length],
                    ['Lưu ý dữ liệu', truncated ? `Chỉ xuất ${all.length} lượt đầu do quá nhiều dữ liệu — hãy thu hẹp khoảng thời gian.` : 'Đầy đủ trong phạm vi đã chọn', truncated ? { fill: 'FEF3C7', color: 'B45309' } : undefined],
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
                        cellStyle: redUnknown,
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
                        cellStyle: redUnknown,
                    },
                ],
            });
            toast.success(format === 'pdf' ? 'Đã mở bản in — chọn “Lưu thành PDF”.' : `Đã xuất ${detail.length} lượt (${{ xlsx: 'Excel', docx: 'Word' }[format]}).`);
        } catch (err) {
            toast.error(err?.error?.message || err?.message || 'Không xuất được báo cáo.');
        } finally {
            setBusyFormat(null);
        }
    };

    const currentMode = MODES.find((m) => m.key === mode);

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            <div className="border-b border-platinum-tint pb-[1.25rem]">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <Route className="w-6 h-6 text-action-blue" />
                    Truy vết theo camera / khu vực
                </h2>
                <p className="text-xs text-slate-blue mt-1 max-w-3xl">
                    Xem camera nào đã ghi nhận ai, lúc nào, ở đâu — dùng để truy vết mất đồ ở một tòa nhà, cổng hoặc nhà xe.
                    {canOpenJourney && <> Muốn tra theo một người, dùng <Link to={`${base}/user-journey`} className="text-action-blue font-semibold">Lịch sử di chuyển theo người</Link>.</>}
                </p>
            </div>

            <div className="bg-white p-[1.25rem] rounded-2xl border border-platinum-tint shadow-sm space-y-4">
                <div className="inline-flex flex-wrap p-1 rounded-xl bg-cloud-mist/70 border border-platinum-tint gap-1" role="tablist" aria-label="Tra theo">
                    {MODES.map((m) => (
                        <button key={m.key} type="button" role="tab" aria-selected={mode === m.key}
                            onClick={() => { setMode(m.key); setTargetId(''); setResult(null); setError(''); }}
                            className={`inline-flex items-center gap-2 px-[1rem] py-2 rounded-lg text-sm font-semibold transition ${mode === m.key ? 'bg-action-blue text-white shadow-sm' : 'text-slate-blue hover:text-midnight-indigo hover:bg-white'}`}>
                            <m.icon className="w-4 h-4" />{m.label}
                        </button>
                    ))}
                </div>

                <div className="grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-[1rem] items-start">
                    <div className="space-y-1.5">
                        <label htmlFor="trace-target" className={labelCls}>{currentMode.label} *</label>
                        <select id="trace-target" value={targetId} onChange={(e) => setTargetId(e.target.value)} className={`${inputCls} w-full`}>
                            <option value="">— Chọn —</option>
                            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400">{currentMode.hint}</p>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="trace-range" className={labelCls}>Khoảng thời gian</label>
                        <select id="trace-range" value={quick} onChange={(e) => applyQuick(e.target.value)} className={`${inputCls} w-full`}>
                            {QUICK_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                            <option value="custom">Tùy chọn giờ cụ thể</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <span className={`${labelCls} invisible`} aria-hidden="true">Thao tác</span>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => run(1)} disabled={loading}
                                className="inline-flex items-center justify-center gap-2 h-[38px] px-[1.25rem] rounded-xl bg-action-blue text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                                <Search className="w-4 h-4" />{loading ? 'Đang truy vết...' : 'Truy vết'}
                            </button>
                            {result && (
                                <button type="button" onClick={() => run(page)} disabled={loading} aria-label="Làm mới" title="Làm mới"
                                    className="inline-flex items-center justify-center h-[38px] w-[38px] rounded-xl border border-platinum-tint text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50">
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {quick === 'custom' && (
                    <div className="grid sm:grid-cols-2 gap-[1rem] md:max-w-2xl">
                        <div className="space-y-1.5">
                            <label htmlFor="trace-from" className={labelCls}>Từ</label>
                            <input id="trace-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-full`} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="trace-to" className={labelCls}>Đến</label>
                            <input id="trace-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-full`} />
                        </div>
                    </div>
                )}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>

            {result && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                    <div className="px-[1.25rem] py-[1rem] border-b border-platinum-tint bg-cloud-mist/30 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-[0.75rem]">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-midnight-indigo text-sm">
                                    Kết quả truy vết
                                    <span className="ml-2 text-xs font-semibold text-slate-blue">{total} lượt{filtered ? ' (đã lọc)' : ''}</span>
                                </h3>
                                <p className="text-[11px] text-slate-blue mt-0.5 truncate" title={result.devices.map((d) => d.deviceName).join(', ')}>
                                    {result.devices.length} camera được tra
                                    {result.devices.length > 0 && <>: {result.devices.slice(0, 6).map((d) => d.deviceName).join(', ')}{result.devices.length > 6 ? '…' : ''}</>}
                                </p>
                            </div>
                            <ExportMenu compact onExport={handleExport} busyFormat={busyFormat} disabled={loading || total === 0} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Loại sự kiện" className={`${inputCls} !py-1.5 text-xs`}>
                                <option value="">Mọi loại sự kiện</option>
                                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Lọc theo tên / mã / biển số"
                                    aria-label="Lọc theo tên, mã hoặc biển số" className={`${inputCls} !py-1.5 !pl-8 text-xs w-60`} />
                            </div>
                            {filtered && (
                                <button type="button" onClick={() => { setKindFilter(''); setNameFilter(''); }} className="text-xs font-semibold text-action-blue hover:underline">Bỏ lọc</button>
                            )}
                        </div>
                    </div>

                    {result.devices.length === 0 ? (
                        <p className="py-14 text-center text-sm text-slate-400">Lựa chọn này chưa có camera nào (nhóm trống hoặc khu vực chưa gắn camera).</p>
                    ) : events.length === 0 ? (
                        <p className="py-14 text-center text-sm text-slate-400">{filtered ? 'Không có sự kiện nào khớp bộ lọc.' : 'Không có sự kiện nào trong khoảng thời gian này.'}</p>
                    ) : (
                        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                            <table className="w-full min-w-[860px] table-fixed text-left">
                                <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                                    <tr className="text-[11px] text-slate-blue">
                                        {COLUMNS.map((c) => <SortHeader key={c.key} column={c} sort={sort} onSort={toggleSort} />)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint">
                                    {events.map((e) => (
                                        <tr key={`${e.kind}-${e.id}`} className="hover:bg-cloud-mist/30 align-middle">
                                            <td className="px-[1rem] py-[0.75rem] text-xs font-mono tabular-nums text-slate-blue">{fmtDateTime(e.time)}</td>
                                            <td className="px-[1rem] py-[0.75rem] text-sm min-w-0">
                                                {e.userName ? (
                                                    <>
                                                        <span className="flex items-center gap-1.5 font-semibold text-midnight-indigo min-w-0">
                                                            <UserRound className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="truncate" title={e.userName}>{e.userName}</span>
                                                        </span>
                                                        {e.employeeCode && <span className="block text-[10px] text-slate-400 pl-[1.25rem]">{e.employeeCode}</span>}
                                                        {canOpenJourney && e.userId && (
                                                            <Link to={`${base}/user-journey?userId=${e.userId}`} className="block pl-[1.25rem] text-[10px] text-action-blue font-semibold">Xem hành trình người này →</Link>
                                                        )}
                                                    </>
                                                ) : e.plateNumber ? (
                                                    <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-900 text-white rounded">{e.plateNumber}</span>
                                                ) : (
                                                    <span className="text-xs font-semibold text-red-600">Không nhận diện được</span>
                                                )}
                                            </td>
                                            <td className="px-[1rem] py-[0.75rem] text-xs min-w-0">
                                                <span className="flex items-center gap-1.5 font-semibold text-midnight-indigo min-w-0">
                                                    {e.kind === 'meeting' ? <DoorOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                                    <span className="truncate" title={describe(e)}>{describe(e)}</span>
                                                </span>
                                                <span className="block text-[10px] text-slate-400 pl-[1.25rem]">{KIND_LABEL[e.kind]}</span>
                                            </td>
                                            <td className="px-[1rem] py-[0.75rem] text-xs min-w-0">
                                                <span className="flex items-center gap-1.5 font-semibold text-midnight-indigo min-w-0">
                                                    <Camera className="w-3 h-3 text-slate-400 shrink-0" /><span className="line-clamp-2 break-words" title={e.deviceName || ''}>{e.deviceName || '—'}</span>
                                                </span>
                                                {e.deviceCode && <span className="block text-[10px] text-slate-400 pl-[18px] truncate">{e.deviceCode}</span>}
                                            </td>
                                            <td className="px-[1rem] py-[0.75rem] text-xs text-slate-blue min-w-0">
                                                <span className="block line-clamp-2 break-words" title={e.zoneName || ''}>{e.zoneName || '—'}</span>
                                                {e.groupNames?.length > 0 && <span className="block text-[10px] text-slate-400 line-clamp-2 break-words" title={e.groupNames.join(', ')}>{e.groupNames.join(', ')}</span>}
                                            </td>
                                            <td className="px-[1rem] py-[0.75rem] text-center">
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

                    <div className="px-[1.25rem] py-[0.75rem] border-t border-platinum-tint flex flex-wrap items-center justify-between gap-2 text-xs text-slate-blue">
                        <span>
                            {total > 0 ? `Hiển thị ${rangeStart}–${rangeEnd} / ${total} lượt` : '0 lượt'} · camera bắn liên tục được gộp 1 dòng/phút
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="tabular-nums">Trang {page}{total > 0 ? ` / ${Math.max(1, Math.ceil(total / PAGE_SIZE))}` : ''}</span>
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
