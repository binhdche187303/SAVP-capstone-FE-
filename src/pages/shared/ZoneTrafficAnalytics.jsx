import { Activity, Flame, Info, MapPin, RefreshCw, Users } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { getZoneTraffic } from '../../service/campusService';
import { getZones } from '../../service/zoneServices';
import { getCameraGroups } from '../../service/cameraGroupServices';
import { downloadReport, currentUserName, fmtVN, toDate } from '../../utils/exportExcel';
import ExportMenu from '../../components/report/ExportMenu';
import toast from '../../utils/toast';

// UC-120 (2.6): lưu lượng người + heatmap khu vực công cộng.
// Heatmap dạng ma trận khu × giờ trong ngày; vị trí GPS của khu vực xem ở trang Bản đồ khuôn viên.

const LINE_COLORS = ['#1e90ff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MAX_RANGE_DAYS = 31;

// Bộ lọc thời gian ngắn (họp 20/10): xem diễn biến màu theo phút, tự làm mới.
const SHORT_PRESETS = { '5m': 5, '10m': 10, '30m': 30, '1h': 60 };
const AUTO_REFRESH_MS = 15000;
const isShortPreset = (p) => p in SHORT_PRESETS;
// Cột heatmap ở chế độ ngắn: 5–10 phút → từng phút; 30 phút–1 giờ → gộp mỗi 5 phút cho dễ đọc.
const columnStepMs = (p) => (SHORT_PRESETS[p] <= 10 ? 60000 : 300000);
const fmtHM = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const toDateInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const presetRange = (preset) => {
    const end = new Date();
    const start = new Date();
    if (preset === 'week') start.setDate(start.getDate() - 6);
    if (preset === 'month') start.setDate(start.getDate() - 29);
    return { from: toDateInput(start), to: toDateInput(end) };
};

// 0 → xanh nhạt, 1 → đỏ
const densityColor = (ratio) => {
    if (ratio == null) return '#f8fafc';
    if (ratio >= 0.8) return '#ef4444';
    if (ratio >= 0.6) return '#f97316';
    if (ratio >= 0.4) return '#f59e0b';
    if (ratio >= 0.2) return '#93c5fd';
    return '#dbeafe';
};

const densityLabel = (ratio) => {
    if (ratio >= 0.8) return { text: 'Rất đông', cls: 'text-red-600 bg-red-50' };
    if (ratio >= 0.5) return { text: 'Đông', cls: 'text-amber-600 bg-amber-50' };
    return { text: 'Bình thường', cls: 'text-green-600 bg-green-50' };
};

const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const ZoneTrafficAnalytics = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState({ series: [], heatmap: [] });

    const [preset, setPreset] = useState('week');
    const [from, setFrom] = useState(presetRange('week').from);
    const [to, setTo] = useState(presetRange('week').to);
    const [building, setBuilding] = useState('');
    const [floor, setFloor] = useState('');
    const [zoneCatalog, setZoneCatalog] = useState([]);
    const [groupId, setGroupId] = useState('');
    const [groups, setGroups] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [busyFormat, setBusyFormat] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const short = isShortPreset(preset);

    // Tòa nhà/Tầng chọn từ danh mục khu vực — BE lọc khớp chính xác nên không cho gõ tự do.
    useEffect(() => {
        getZones({ limit: 100 })
            .then((res) => { if (res?.success) setZoneCatalog(res.data || []); })
            .catch(() => {});
        getCameraGroups({})
            .then((res) => setGroups(Array.isArray(res?.data) ? res.data : res?.data?.items || []))
            .catch(() => {});
    }, []);

    const buildingOptions = useMemo(
        () => [...new Set(zoneCatalog.map((z) => z.building).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
        [zoneCatalog]
    );
    const floorOptions = useMemo(
        () => [...new Set(
            zoneCatalog.filter((z) => !building || z.building === building).map((z) => z.floor).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
        [zoneCatalog, building]
    );

    const handleBuildingChange = (value) => {
        setBuilding(value);
        const floorsOfBuilding = zoneCatalog.filter((z) => !value || z.building === value).map((z) => z.floor);
        if (floor && !floorsOfBuilding.includes(floor)) setFloor('');
    };

    const handlePreset = (value) => {
        setPreset(value);
        if (value !== 'custom' && !isShortPreset(value)) {
            const r = presetRange(value);
            setFrom(r.from);
            setTo(r.to);
        }
    };

    // `silent`: lần làm mới tự động không nháy skeleton, giữ dữ liệu cũ đến khi có dữ liệu mới.
    const fetchData = useCallback(async (silent = false) => {
        let fromDate;
        let toDate;
        if (isShortPreset(preset)) {
            toDate = new Date();
            fromDate = new Date(toDate.getTime() - SHORT_PRESETS[preset] * 60000);
        } else {
            if (!from || !to) return;
            fromDate = new Date(`${from}T00:00:00`);
            toDate = new Date(`${to}T23:59:59`);
            if (toDate < fromDate) {
                setError('Ngày kết thúc phải sau ngày bắt đầu.');
                return;
            }
            if ((toDate - fromDate) / 86400000 > MAX_RANGE_DAYS) {
                setError(`Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày.`);
                return;
            }
        }
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await getZoneTraffic({
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                building: building.trim(),
                floor: floor.trim(),
                groupId,
                bucket: isShortPreset(preset) ? 'minute' : '',
            });
            if (res?.success) {
                setData({ series: res.data?.series || [], heatmap: res.data?.heatmap || [] });
                setLastUpdated(new Date());
            }
        } catch (err) {
            setError(err.message || 'Lỗi hệ thống khi tải dữ liệu lưu lượng.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [preset, from, to, building, floor, groupId]);

    useEffect(() => {
        const t = setTimeout(() => fetchData(false), 400); // debounce khi đổi bộ lọc liên tiếp
        return () => clearTimeout(t);
    }, [fetchData]);

    // Chế độ ngắn: tự làm mới để thấy màu đổi theo thời gian thực.
    useEffect(() => {
        if (!short || !autoRefresh) return undefined;
        const id = setInterval(() => fetchData(true), AUTO_REFRESH_MS);
        return () => clearInterval(id);
    }, [short, autoRefresh, fetchData]);

    const zones = useMemo(
        () => data.heatmap.slice().sort((a, b) => (b.peakOccupancy || 0) - (a.peakOccupancy || 0)),
        [data.heatmap]
    );
    const zoneName = useMemo(
        () => Object.fromEntries(data.heatmap.map((z) => [z.zoneId, z.zoneName])),
        [data.heatmap]
    );

    // Biểu đồ đường: mỗi khu 1 đường, trục X = giờ (bucket theo giờ)
    const lineData = useMemo(() => {
        const byBucket = new Map();
        data.series.forEach((p) => {
            const row = byBucket.get(p.hourBucket) || { hourBucket: p.hourBucket };
            row[p.zoneId] = round1(p.avgOccupancy);
            byBucket.set(p.hourBucket, row);
        });
        return Array.from(byBucket.values()).sort((a, b) => a.hourBucket.localeCompare(b.hourBucket));
    }, [data.series]);

    // Heatmap: trung bình số người theo khu × giờ trong ngày (giờ địa phương).
    // Chế độ ngắn: cột là các mốc phút (key = epoch ms đã làm tròn theo bước cột).
    const matrix = useMemo(() => {
        const acc = {};
        const step = short ? columnStepMs(preset) : 0;
        data.series.forEach((p) => {
            const t = new Date(p.hourBucket).getTime();
            const h = short ? Math.floor(t / step) * step : new Date(p.hourBucket).getHours();
            acc[p.zoneId] = acc[p.zoneId] || {};
            const cell = acc[p.zoneId][h] || { sum: 0, n: 0 };
            cell.sum += Number(p.avgOccupancy) || 0;
            cell.n += 1;
            acc[p.zoneId][h] = cell;
        });
        let max = 0;
        const result = {};
        Object.entries(acc).forEach(([zoneId, hours]) => {
            result[zoneId] = {};
            Object.entries(hours).forEach(([h, c]) => {
                const v = c.sum / c.n;
                result[zoneId][h] = v;
                if (v > max) max = v;
            });
        });
        return { values: result, max };
    }, [data.series, short, preset]);

    // Cột hiển thị: giờ trong ngày (chế độ thường) hoặc các mốc phút liên tục (chế độ ngắn).
    const activeHours = useMemo(() => {
        const set = new Set();
        Object.values(matrix.values).forEach((hours) => Object.keys(hours).forEach((h) => set.add(Number(h))));
        if (short) {
            const step = columnStepMs(preset);
            const end = Math.floor(Date.now() / step) * step;
            const cols = [];
            for (let t = end - Math.ceil(SHORT_PRESETS[preset] * 60000 / step) * step + step; t <= end; t += step) cols.push(t);
            return cols;
        }
        if (set.size === 0) return HOURS;
        const min = Math.min(...set);
        const max = Math.max(...set);
        return HOURS.filter((h) => h >= min && h <= max);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matrix, short, preset, lastUpdated]);

    const columnLabel = (h) => (short ? fmtHM(h) : `${String(h).padStart(2, '0')}h`);

    const busiest = zones[0];
    const totalAvg = zones.length ? round1(zones.reduce((s, z) => s + (Number(z.avgOccupancy) || 0), 0)) : null;
    const peakHour = useMemo(() => {
        const sums = {};
        Object.values(matrix.values).forEach((hours) =>
            Object.entries(hours).forEach(([h, v]) => { sums[h] = (sums[h] || 0) + v; })
        );
        const best = Object.entries(sums).sort((a, b) => b[1] - a[1])[0];
        if (!best) return null;
        // Chế độ ngắn: khóa cột là mốc thời gian (ms) → hiển thị giờ:phút thay vì ép thành 'giờ' (ra số dài vô nghĩa).
        return short ? fmtHM(Number(best[0])) : `${String(best[0]).padStart(2, '0')}:00`;
    }, [matrix, short]);

    const handleExport = async (format) => {
        if (!zones.length) {
            toast.error('Chưa có dữ liệu để xuất.');
            return;
        }
        setBusyFormat(format);
        try {
            const groupName = groups.find((g) => g.id === groupId)?.group_name || '';
            const end = short ? new Date() : new Date(`${to}T23:59:59`);
            const begin = short ? new Date(end.getTime() - SHORT_PRESETS[preset] * 60000) : new Date(`${from}T00:00:00`);
            const exportedAt = new Date();
            const zoneMeta = Object.fromEntries(zones.map((z) => [z.zoneId, z]));
            const labelOf = (r) => densityLabel(r || 0).text;
            const fillOf = (r) => (r >= 0.8 ? 'FEE2E2' : r >= 0.5 ? 'FEF3C7' : 'DCFCE7');

            const overview = zones.map((z, i) => ({
                rank: i + 1,
                zone: z.zoneName,
                building: z.building || '',
                floor: z.floor || '',
                avg: round1(z.avgOccupancy),
                peak: z.peakOccupancy,
                peakAt: toDate(z.peakAt),
                density: Math.round((z.relativeDensity || 0) * 100) / 100,
                level: labelOf(z.relativeDensity),
                _ratio: z.relativeDensity || 0,
            }));

            const matrixCols = [
                { header: 'Khu vực', key: 'zone', width: 28 },
                { header: 'Tòa nhà', key: 'building', width: 14 },
                { header: 'Tầng', key: 'floor', width: 8, align: 'center' },
                ...activeHours.map((h) => ({ header: columnLabel(h), key: `c${h}`, width: short ? 9 : 7, align: 'center', numFmt: '0.0' })),
            ];
            const matrixRows = zones.map((z) => {
                const row = { zone: z.zoneName, building: z.building || '', floor: z.floor || '' };
                activeHours.forEach((h) => {
                    const v = matrix.values[z.zoneId]?.[h];
                    row[`c${h}`] = v == null ? '' : round1(v);
                });
                return row;
            });

            const detail = data.series
                .slice()
                .sort((a, b) => a.hourBucket.localeCompare(b.hourBucket) || (zoneName[a.zoneId] || '').localeCompare(zoneName[b.zoneId] || '', 'vi'))
                .map((p, i) => {
                    const z = zoneMeta[p.zoneId] || {};
                    return {
                        stt: i + 1,
                        time: toDate(p.hourBucket),
                        zone: zoneName[p.zoneId] || p.zoneId,
                        building: z.building || '',
                        floor: z.floor || '',
                        group: groupName || 'Tất cả camera',
                        avg: round1(p.avgOccupancy),
                        peak: p.peakOccupancy,
                    };
                });

            await downloadReport({
                format,
                fileName: `Heatmap-luu-luong_${exportedAt.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`,
                title: 'BÁO CÁO LƯU LƯỢNG & BẢN ĐỒ NHIỆT KHU VỰC',
                subtitle: 'Số người ghi nhận bởi camera đếm người tại các khu vực công cộng',
                info: [
                    { section: 'Phạm vi báo cáo' },
                    ['Khoảng thời gian', `${fmtVN(begin)}  →  ${fmtVN(end)}`],
                    ['Độ chi tiết dữ liệu', short ? 'Theo phút (xem diễn biến ngắn hạn)' : 'Theo giờ'],
                    ['Tòa nhà', building || 'Tất cả tòa nhà'],
                    ['Tầng', floor ? `Tầng ${floor}` : 'Tất cả tầng'],
                    ['Nhóm camera', groupName || 'Tất cả camera'],
                    { section: 'Kết quả tổng hợp' },
                    ['Số khu vực có dữ liệu', zones.length],
                    ['Khu đông nhất', busiest ? `${busiest.zoneName} (đỉnh ${busiest.peakOccupancy} người lúc ${fmtVN(busiest.peakAt)})` : ''],
                    ['Giờ cao điểm toàn khuôn viên', peakHour],
                    ['Tổng số người trung bình (cộng TB các khu)', totalAvg],
                    { section: 'Thông tin xuất' },
                    ['Người xuất', currentUserName()],
                    ['Thời điểm xuất', fmtVN(exportedAt)],
                    { section: 'Chú giải' },
                    ['Số người TB', 'Trung bình số người camera đếm được trong mỗi mốc thời gian'],
                    ['Đỉnh', 'Số người lớn nhất ghi nhận được'],
                    ['Mật độ tương đối', 'Đỉnh của khu so với khu đông nhất (1.00 = đông nhất). ≥ 0.8: Rất đông · 0.5–0.8: Đông · < 0.5: Bình thường'],
                    ['Rất đông', '≥ 0.8', { fill: 'FEE2E2', color: 'B91C1C' }],
                    ['Đông', '0.5 – 0.8', { fill: 'FEF3C7', color: 'B45309' }],
                    ['Bình thường', '< 0.5', { fill: 'DCFCE7', color: '15803D' }],
                ],
                sheets: [
                    {
                        name: 'Tổng quan khu vực',
                        freezeCols: 2,
                        columns: [
                            { header: 'Hạng', key: 'rank', width: 7, align: 'center' },
                            { header: 'Khu vực', key: 'zone', width: 30 },
                            { header: 'Tòa nhà', key: 'building', width: 14 },
                            { header: 'Tầng', key: 'floor', width: 8, align: 'center' },
                            { header: 'Số người TB', key: 'avg', width: 13, numFmt: '0.0' },
                            { header: 'Đỉnh (người)', key: 'peak', width: 13 },
                            { header: 'Thời điểm đỉnh', key: 'peakAt', width: 20 },
                            { header: 'Mật độ tương đối', key: 'density', width: 16, numFmt: '0.00' },
                            { header: 'Mức độ', key: 'level', width: 14, align: 'center' },
                        ],
                        rows: overview,
                        cellStyle: (row, key) => (key === 'level' || key === 'density' ? { fill: fillOf(row._ratio), bold: key === 'level' } : undefined),
                    },
                    {
                        name: short ? 'Ma trận khu vực × phút' : 'Ma trận khu vực × giờ',
                        note: `Số người trung bình theo từng ${short ? 'mốc phút' : 'giờ trong ngày'}; màu đậm = đông hơn (so với ô đông nhất = ${round1(matrix.max)} người).`,
                        freezeCols: 3,
                        columns: matrixCols,
                        rows: matrixRows,
                        cellStyle: (row, key, v) => {
                            if (!key.startsWith('c')) return undefined;
                            const ratio = v === '' || matrix.max === 0 ? null : v / matrix.max;
                            return { fill: densityColor(ratio), color: ratio >= 0.6 ? 'FFFFFF' : '334155' };
                        },
                    },
                    {
                        name: short ? 'Chi tiết theo phút' : 'Chi tiết theo giờ',
                        freezeCols: 3,
                        columns: [
                            { header: 'STT', key: 'stt', width: 7, align: 'center' },
                            { header: 'Thời gian', key: 'time', width: 20 },
                            { header: 'Khu vực', key: 'zone', width: 30 },
                            { header: 'Tòa nhà', key: 'building', width: 14 },
                            { header: 'Tầng', key: 'floor', width: 8, align: 'center' },
                            { header: 'Nhóm camera lọc', key: 'group', width: 22 },
                            { header: 'Số người TB', key: 'avg', width: 13, numFmt: '0.0' },
                            { header: 'Đỉnh (người)', key: 'peak', width: 13 },
                        ],
                        rows: detail,
                    },
                ],
            });
            toast.success(format === 'pdf' ? 'Đã mở bản in — chọn “Lưu thành PDF”.' : `Đã xuất báo cáo ${({ xlsx: 'Excel', pdf: 'PDF', docx: 'Word' })[format]}.`);
        } catch (err) {
            toast.error(err?.message || 'Không xuất được báo cáo.');
        } finally {
            setBusyFormat(null);
        }
    };

    const inputCls = 'px-[0.75rem] py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo';

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="border-b border-platinum-tint pb-[1.25rem]">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <Activity className="w-6 h-6 text-action-blue" />
                    Lưu lượng & Bản đồ nhiệt khu vực công cộng
                </h2>
                <p className="text-xs text-slate-blue mt-1">
                    Theo dõi số người tại hành lang, sảnh và khu học tập theo giờ; phát hiện khu vực và khung giờ đông nhất.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-[1rem] rounded-2xl border border-platinum-tint shadow-sm flex flex-wrap gap-[1rem] items-end">
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Bộ lọc nhanh</label>
                    <select value={preset} onChange={(e) => handlePreset(e.target.value)} className={`${inputCls} font-semibold`}>
                        <optgroup label="Vừa qua (tự làm mới)">
                            <option value="5m">5 phút gần nhất</option>
                            <option value="10m">10 phút gần nhất</option>
                            <option value="30m">30 phút gần nhất</option>
                            <option value="1h">1 giờ gần nhất</option>
                        </optgroup>
                        <option value="day">Hôm nay</option>
                        <option value="week">7 ngày gần nhất</option>
                        <option value="month">30 ngày gần nhất</option>
                        <option value="custom">Tùy chọn khoảng</option>
                    </select>
                </div>
                {short && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-midnight-indigo pb-2">
                        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                        Tự làm mới {AUTO_REFRESH_MS / 1000}s
                        {lastUpdated && <span className="font-normal text-slate-400">· cập nhật {lastUpdated.toLocaleTimeString('vi-VN')}</span>}
                    </label>
                )}
                {preset === 'custom' && (
                    <>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Từ ngày</label>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-blue uppercase">Đến ngày</label>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
                        </div>
                    </>
                )}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Tòa nhà</label>
                    <select value={building} onChange={(e) => handleBuildingChange(e.target.value)} className={inputCls}>
                        <option value="">Tất cả tòa nhà</option>
                        {buildingOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Tầng</label>
                    <select value={floor} onChange={(e) => setFloor(e.target.value)} className={inputCls}>
                        <option value="">Tất cả tầng</option>
                        {floorOptions.map((f) => <option key={f} value={f}>Tầng {f}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Nhóm camera</label>
                    <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
                        <option value="">Tất cả camera</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                    </select>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => fetchData(false)} className="inline-flex items-center gap-1.5 px-[0.75rem] py-2 rounded-xl border border-platinum-tint text-xs font-semibold text-midnight-indigo hover:bg-cloud-mist">
                        <RefreshCw className="w-3.5 h-3.5" />Làm mới
                    </button>
                    <ExportMenu compact onExport={handleExport} busyFormat={busyFormat} disabled={loading || !zones.length} />
                </div>
            </div>

            {error && (
                <div className="p-[1rem] bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start text-sm">
                    <Info className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1rem]">
                <SummaryCard label="Khu vực có dữ liệu" value={zones.length} icon={MapPin} loading={loading} />
                <SummaryCard label="Tổng số người TB" value={totalAvg ?? '—'} sub="Cộng TB các khu" icon={Users} loading={loading} />
                <SummaryCard label="Khu đông nhất" value={busiest?.zoneName || '—'} sub={busiest ? `Đỉnh ${busiest.peakOccupancy} người` : null} icon={Flame} loading={loading} small />
                <SummaryCard label="Giờ cao điểm" value={peakHour || '—'} sub="Toàn khuôn viên" icon={Activity} loading={loading} />
            </div>

            {/* Heatmap matrix */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className="px-6 py-[1rem] border-b border-platinum-tint bg-cloud-mist/30 flex flex-wrap items-center justify-between gap-[0.75rem]">
                    <h3 className="font-bold text-midnight-indigo text-sm">
                        {short ? `Bản đồ nhiệt theo khu vực × phút (${SHORT_PRESETS[preset]} phút gần nhất)` : 'Bản đồ nhiệt theo khu vực × giờ trong ngày'}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-blue font-semibold">
                        Thưa
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((r) => (
                            <span key={r} className="w-5 h-3 rounded" style={{ backgroundColor: densityColor(r) }} />
                        ))}
                        Đông
                    </div>
                </div>
                <div className="overflow-x-auto p-[1rem]">
                    {loading ? (
                        <div className="h-40 bg-slate-50 animate-pulse rounded-xl" />
                    ) : zones.length ? (
                        <table className="border-separate" style={{ borderSpacing: 3 }}>
                            <thead>
                                <tr>
                                    <th className="text-left text-[10px] font-bold text-slate-blue uppercase pr-[0.75rem] min-w-[160px]">Khu vực</th>
                                    {activeHours.map((h) => (
                                        <th key={h} className={`text-[10px] font-semibold text-slate-blue text-center ${short ? 'w-12' : 'w-9'}`}>{columnLabel(h)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {zones.map((z) => (
                                    <tr key={z.zoneId}>
                                        <td className="text-xs font-bold text-midnight-indigo pr-[0.75rem] whitespace-nowrap">
                                            {z.zoneName}
                                            {(z.building || z.floor) && (
                                                <span className="block text-[10px] font-medium text-slate-400">
                                                    {[z.building, z.floor && `Tầng ${z.floor}`].filter(Boolean).join(' · ')}
                                                </span>
                                            )}
                                        </td>
                                        {activeHours.map((h) => {
                                            const v = matrix.values[z.zoneId]?.[h];
                                            const ratio = v == null || matrix.max === 0 ? null : v / matrix.max;
                                            return (
                                                <td
                                                    key={h}
                                                    title={v == null ? 'Không có dữ liệu' : `${z.zoneName} — ${short ? fmtHM(h) : `${String(h).padStart(2, '0')}:00`}: TB ${round1(v)} người`}
                                                    className="h-8 rounded-md text-[9px] font-bold text-center"
                                                    style={{ backgroundColor: densityColor(ratio), color: ratio >= 0.6 ? '#fff' : '#334155' }}
                                                >
                                                    {v == null ? '' : Math.round(v)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="py-10 text-center text-xs text-slate-400">Không có dữ liệu đếm người trong khoảng thời gian này</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Line chart */}
                <div className="bg-white p-[1.25rem] rounded-2xl border border-platinum-tint shadow-sm space-y-4 lg:col-span-2">
                    <h3 className="font-bold text-midnight-indigo text-sm">Lưu lượng người theo thời gian (TB mỗi {short ? 'phút' : 'giờ'})</h3>
                    <div className="h-72">
                        {loading ? (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                        ) : lineData.length ? (
                            <ResponsiveContainer width="100%" height={288}>
                                <LineChart data={lineData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="hourBucket"
                                        tickFormatter={(v) => (short ? fmtHM(new Date(v).getTime()) : new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit' }))}
                                        tickLine={false} axisLine={false} minTickGap={40}
                                        style={{ fontSize: 9, fill: '#64748b' }}
                                    />
                                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 9, fill: '#64748b' }} />
                                    <Tooltip labelFormatter={(v) => fmtDateTime(v)} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    {zones.map((z, i) => (
                                        <Line
                                            key={z.zoneId}
                                            type="monotone"
                                            dataKey={z.zoneId}
                                            name={zoneName[z.zoneId]}
                                            stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                            strokeWidth={2}
                                            dot={false}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">Không có dữ liệu</div>
                        )}
                    </div>
                </div>

                {/* Zone ranking */}
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                    <div className="px-[1.25rem] py-[1rem] border-b border-platinum-tint bg-cloud-mist/30">
                        <h3 className="font-bold text-midnight-indigo text-sm">Mật độ theo khu vực</h3>
                    </div>
                    <div className="divide-y divide-platinum-tint">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-50/40 animate-pulse" />)
                        ) : zones.length ? (
                            zones.map((z) => {
                                const lbl = densityLabel(z.relativeDensity || 0);
                                return (
                                    <div key={z.zoneId} className="px-[1.25rem] py-[0.75rem] space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-midnight-indigo truncate">{z.zoneName}</span>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${lbl.cls}`}>{lbl.text}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${Math.round((z.relativeDensity || 0) * 100)}%`, backgroundColor: densityColor(z.relativeDensity) }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-blue">
                                            TB {round1(z.avgOccupancy)} · Đỉnh {z.peakOccupancy} người lúc {fmtDateTime(z.peakAt)}
                                        </p>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="py-10 text-center text-xs text-slate-400">Không có dữ liệu</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SummaryCard = ({ label, value, sub, icon: Icon, loading, small }) => (
    <div className="bg-white p-[1.25rem] rounded-2xl border border-platinum-tint shadow-sm space-y-2">
        <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wider flex items-center gap-1.5">
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </span>
        {loading ? (
            <div className="h-7 bg-slate-100 animate-pulse rounded-lg" />
        ) : (
            <div>
                <span className={`${small ? 'text-base' : 'text-2xl'} font-black text-midnight-indigo block truncate`}>{value}</span>
                {sub && <span className="text-xs text-slate-blue font-medium">{sub}</span>}
            </div>
        )}
    </div>
);

export default ZoneTrafficAnalytics;
