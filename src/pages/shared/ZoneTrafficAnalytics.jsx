import { Activity, Flame, Info, MapPin, Users } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { getZoneTraffic } from '../../service/campusService';

// UC-120 (2.6): lưu lượng người + heatmap khu vực công cộng.
// Heatmap dạng ma trận khu × giờ trong ngày; vị trí GPS của khu vực xem ở trang Bản đồ khuôn viên.

const LINE_COLORS = ['#1e90ff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MAX_RANGE_DAYS = 31;

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

    const handlePreset = (value) => {
        setPreset(value);
        if (value !== 'custom') {
            const r = presetRange(value);
            setFrom(r.from);
            setTo(r.to);
        }
    };

    const fetchData = useCallback(async () => {
        if (!from || !to) return;
        const fromDate = new Date(`${from}T00:00:00`);
        const toDate = new Date(`${to}T23:59:59`);
        if (toDate < fromDate) {
            setError('Ngày kết thúc phải sau ngày bắt đầu.');
            return;
        }
        if ((toDate - fromDate) / 86400000 > MAX_RANGE_DAYS) {
            setError(`Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày.`);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await getZoneTraffic({
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                building: building.trim(),
                floor: floor.trim(),
            });
            if (res?.success) {
                setData({ series: res.data?.series || [], heatmap: res.data?.heatmap || [] });
            }
        } catch (err) {
            setError(err.message || 'Lỗi hệ thống khi tải dữ liệu lưu lượng.');
        } finally {
            setLoading(false);
        }
    }, [from, to, building, floor]);

    useEffect(() => {
        const t = setTimeout(fetchData, 400); // debounce ô nhập toà nhà/tầng
        return () => clearTimeout(t);
    }, [fetchData]);

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

    // Heatmap: trung bình số người theo khu × giờ trong ngày (giờ địa phương)
    const matrix = useMemo(() => {
        const acc = {};
        data.series.forEach((p) => {
            const h = new Date(p.hourBucket).getHours();
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
    }, [data.series]);

    const activeHours = useMemo(() => {
        const set = new Set();
        Object.values(matrix.values).forEach((hours) => Object.keys(hours).forEach((h) => set.add(Number(h))));
        if (set.size === 0) return HOURS;
        const min = Math.min(...set);
        const max = Math.max(...set);
        return HOURS.filter((h) => h >= min && h <= max);
    }, [matrix]);

    const busiest = zones[0];
    const totalAvg = zones.length ? round1(zones.reduce((s, z) => s + (Number(z.avgOccupancy) || 0), 0)) : null;
    const peakHour = useMemo(() => {
        const sums = {};
        Object.values(matrix.values).forEach((hours) =>
            Object.entries(hours).forEach(([h, v]) => { sums[h] = (sums[h] || 0) + v; })
        );
        const best = Object.entries(sums).sort((a, b) => b[1] - a[1])[0];
        return best ? `${String(best[0]).padStart(2, '0')}:00` : null;
    }, [matrix]);

    const inputCls = 'px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo';

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="border-b border-platinum-tint pb-5">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <Activity className="w-6 h-6 text-action-blue" />
                    Lưu lượng & Bản đồ nhiệt khu vực công cộng
                </h2>
                <p className="text-xs text-slate-blue mt-1">
                    Theo dõi số người tại hành lang, sảnh và khu học tập theo giờ; phát hiện khu vực và khung giờ đông nhất.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Bộ lọc nhanh</label>
                    <select value={preset} onChange={(e) => handlePreset(e.target.value)} className={`${inputCls} font-semibold`}>
                        <option value="day">Hôm nay</option>
                        <option value="week">7 ngày gần nhất</option>
                        <option value="month">30 ngày gần nhất</option>
                        <option value="custom">Tùy chọn khoảng</option>
                    </select>
                </div>
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
                    <input type="text" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="VD: Alpha" className={inputCls} />
                </div>
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Tầng</label>
                    <input type="text" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="VD: 1" className={`${inputCls} w-20`} />
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start text-sm">
                    <Info className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="Khu vực có dữ liệu" value={zones.length} icon={MapPin} loading={loading} />
                <SummaryCard label="Tổng số người TB" value={totalAvg ?? '—'} sub="Cộng TB các khu" icon={Users} loading={loading} />
                <SummaryCard label="Khu đông nhất" value={busiest?.zoneName || '—'} sub={busiest ? `Đỉnh ${busiest.peakOccupancy} người` : null} icon={Flame} loading={loading} small />
                <SummaryCard label="Giờ cao điểm" value={peakHour || '—'} sub="Toàn khuôn viên" icon={Activity} loading={loading} />
            </div>

            {/* Heatmap matrix */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-bold text-midnight-indigo text-sm">Bản đồ nhiệt theo khu vực × giờ trong ngày</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-blue font-semibold">
                        Thưa
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((r) => (
                            <span key={r} className="w-5 h-3 rounded" style={{ backgroundColor: densityColor(r) }} />
                        ))}
                        Đông
                    </div>
                </div>
                <div className="overflow-x-auto p-4">
                    {loading ? (
                        <div className="h-40 bg-slate-50 animate-pulse rounded-xl" />
                    ) : zones.length ? (
                        <table className="border-separate" style={{ borderSpacing: 3 }}>
                            <thead>
                                <tr>
                                    <th className="text-left text-[10px] font-bold text-slate-blue uppercase pr-3 min-w-[160px]">Khu vực</th>
                                    {activeHours.map((h) => (
                                        <th key={h} className="text-[10px] font-semibold text-slate-blue w-9 text-center">{String(h).padStart(2, '0')}h</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {zones.map((z) => (
                                    <tr key={z.zoneId}>
                                        <td className="text-xs font-bold text-midnight-indigo pr-3 whitespace-nowrap">
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
                                                    title={v == null ? 'Không có dữ liệu' : `${z.zoneName} — ${String(h).padStart(2, '0')}:00: TB ${round1(v)} người`}
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
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-4 lg:col-span-2">
                    <h3 className="font-bold text-midnight-indigo text-sm">Lưu lượng người theo thời gian (TB mỗi giờ)</h3>
                    <div className="h-72">
                        {loading ? (
                            <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                        ) : lineData.length ? (
                            <ResponsiveContainer width="100%" height={288}>
                                <LineChart data={lineData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="hourBucket"
                                        tickFormatter={(v) => new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit' })}
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
                    <div className="px-5 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                        <h3 className="font-bold text-midnight-indigo text-sm">Mật độ theo khu vực</h3>
                    </div>
                    <div className="divide-y divide-platinum-tint">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-50/40 animate-pulse" />)
                        ) : zones.length ? (
                            zones.map((z) => {
                                const lbl = densityLabel(z.relativeDensity || 0);
                                return (
                                    <div key={z.zoneId} className="px-5 py-3 space-y-1.5">
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
    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-2">
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
