import PageHeading from '../../components/common/PageHeading';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import './RoomUsageAnalytics.css';
import TimeRangeButtons from '../../components/common/TimeRangeButtons';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import ReportExportButton from '../../components/common/ReportExportButton';
import StatisticCard from '../../components/common/StatisticCard';
import FilterBar from '../../components/common/FilterBar';
import { AlertTriangle, BarChart3, Building2, ChevronRight, FileText, Info, TrendingUp, X, CheckCircle2 } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
    PieChart, Pie, Legend, LabelList
} from 'recharts';
import { getRoomAnalytics, getNoShowStats, getRoomUtilizationRate, getRooms } from '../../service/businessAdminServices';
import { get } from '../../utils/request';
import ExportReportModal, { reportPresetRange } from '../../components/common/ExportReportModal';

const PIE_COLORS = { normal: '#22c55e', noshow: '#ef4444' };
const BAR_COLORS = ['#1e90ff', '#38bdf8', '#7dd3fc', '#93c5fd', '#bfdbfe'];

const HEATMAP_COLOR = (minutes) => {
    if (minutes > 400) return '#ef4444';
    if (minutes > 200) return '#f59e0b';
    return '#3b82f6';
};

const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

const NoShowPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-platinum-tint rounded-xl shadow-lg px-3 py-2 text-xs">
            <p className="font-bold text-midnight-indigo">{payload[0].name}</p>
            <p className="text-slate-blue">{payload[0].value} lượt</p>
        </div>
    );
};

const RoomUsageAnalytics = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [noShowData, setNoShowData] = useState(null);
    const [utilizationData, setUtilizationData] = useState(null);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [roomDetail, setRoomDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    const [preset, setPreset] = useState('month');
    const [from, setFrom] = useState(() => reportPresetRange('month').from);
    const [to, setTo] = useState(() => reportPresetRange('month').to);
    const rangeError = preset === 'custom'
        ? (!from || !to ? 'Vui lòng chọn đủ từ ngày và đến ngày.'
            : from > to ? 'Từ ngày phải trước hoặc bằng đến ngày.' : '')
        : '';
    const changePreset = (nextPreset) => {
        if (nextPreset !== 'custom' || !from || !to || from > to) {
            const currentRange = reportPresetRange(nextPreset === 'custom' ? preset : nextPreset);
            setFrom(currentRange.from);
            setTo(currentRange.to);
        }
        setPreset(nextPreset);
    };

    const [siteName, setSiteName] = useState('');
    const [siteOptions, setSiteOptions] = useState([]);

    // Danh sach toa nha lay tu danh sach phong (BE chua co API rieng cho toa nha).
    useEffect(() => {
        getRooms({ limit: 100 })
            .then((res) => {
                if (!res?.success) return;
                const sites = [...new Set((res.data || []).map((r) => r.siteName).filter(Boolean))];
                setSiteOptions(sites.sort((a, b) => a.localeCompare(b, 'vi')));
            })
            .catch(() => {});
    }, []);

    const fetchAll = useCallback(async () => {
        if (rangeError) return;
        setLoading(true);
        setError(null);
        const params = {
            preset: preset === 'year' ? 'custom' : preset,
            ...(preset === 'year' ? reportPresetRange('year') : preset === 'custom' ? { from, to } : {}),
            ...(siteName && { siteName })
        };
        try {
            const [dashRes, noShowRes, utilRes] = await Promise.allSettled([
                getRoomAnalytics(params),
                getNoShowStats(params),
                getRoomUtilizationRate(params)
            ]);
            if (dashRes.status === 'fulfilled' && dashRes.value?.success) {
                setData(dashRes.value.data);
            } else if (dashRes.status === 'rejected') {
                throw dashRes.reason;
            }
            if (noShowRes.status === 'fulfilled' && noShowRes.value?.success) {
                setNoShowData(noShowRes.value.data);
            }
            if (utilRes.status === 'fulfilled' && utilRes.value?.success) {
                setUtilizationData(utilRes.value.data);
            }
        } catch (err) {
            setError(err.message || 'Lỗi hệ thống khi tải báo cáo.');
        } finally {
            setLoading(false);
        }
    }, [preset, from, to, siteName, rangeError]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleRoomClick = async (roomId) => {
        if (rangeError) return;
        setSelectedRoomId(roomId);
        setRoomDetail(null);
        setLoadingDetail(true);
        try {
            const exportRange = preset === 'year' ? reportPresetRange('year') : { from, to };
            const q = `?preset=${preset === 'year' ? 'custom' : preset}${['custom', 'year'].includes(preset) ? `&from=${exportRange.from}&to=${exportRange.to}` : ''}`;
            const res = await get(`/analytics/rooms/${roomId}/detail${q}`);
            if (res?.success) setRoomDetail(res.data);
        } catch {
            // detail load failure is non-blocking
        } finally {
            setLoadingDetail(false);
        }
    };

    const noShowPieData = noShowData
        ? [
            { name: 'Diễn ra bình thường', value: Math.max(0, (noShowData.totalBookings || 0) - (noShowData.noShowCount || 0)), color: PIE_COLORS.normal },
            { name: 'Vắng mặt (no-show)', value: noShowData.noShowCount || 0, color: PIE_COLORS.noshow }
        ]
        : [];

    const noShowRanking = (noShowData?.ranking?.items || [])
        .slice()
        .sort((a, b) => (b.noShowRate || 0) - (a.noShowRate || 0))
        .slice(0, 8);

    const summaryUtil = data?.summary;
    const utilizationRate = summaryUtil?.reservationUtilizationRate ?? summaryUtil?.utilizationRate ?? utilizationData?.utilizationRate;
    const occupancyRate = summaryUtil?.roomOccupancyRate ?? null;
    const hoursComparison = [
        { label: 'Giờ đặt', hours: summaryUtil?.totalBookedHours, color: '#0066ff' },
        { label: 'Giờ thực tế', hours: summaryUtil?.actualUsedHours, color: '#10b981' },
    ].filter(item => item.hours != null && Number.isFinite(Number(item.hours)))
        .map(item => ({ ...item, hours: Number(item.hours) }));

    return (
        <div data-page-surface="wide" className="space-y-6 p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-platinum-tint pb-5">
                <div>
                    <PageHeading badge="Phòng họp" icon={<BarChart3 className="w-6 h-6 text-action-blue" />} data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        Hiệu suất sử dụng phòng họp
                    </PageHeading>
                    <p data-page-description className="text-xs text-slate-blue mt-1">
                        Theo dõi tần suất đặt phòng, tỷ lệ lấp đầy thực tế, tỷ lệ vắng mặt và phân tích chi tiết hiệu năng phòng họp.
                    </p>
                </div>
                <ReportExportButton label="Xuất báo cáo"
                    onClick={() => setIsExportOpen(true)}
                    legacyClassName="px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm self-start md:self-auto"
                >
                    <FileText className="w-4 h-4" />
                    Xuất báo cáo
                </ReportExportButton>
            </div>

            {/* Filter Bar */}
            <FilterBar variant="card" className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm flex flex-wrap gap-4 items-end">

                <div className="camai-filter-field space-y-1">
                    <label className="block text-[10px] font-bold text-slate-blue uppercase">Tòa nhà</label>
                    <FilterMultiSelect
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo"
                    >
                        <option value="">Tất cả tòa nhà</option>
                        {siteOptions.map((site) => (
                            <option key={site} value={site}>{site}</option>
                        ))}
                    </FilterMultiSelect>
                </div>

                <div className="camai-filter-period-row">
                    <TimeRangeButtons label="Bộ lọc nhanh" value={preset} onChange={changePreset}
                    options={[["day", "Hôm nay"], ["week", "Tuần này"], ["month", "Tháng"], ["year", "Năm"], ["custom", "Tùy chọn khoảng"]]} />
                    <div className="camai-filter-period-dates">
                        <div className="camai-filter-field space-y-1">
                            <label htmlFor="room-usage-from" className="block text-[10px] font-bold text-slate-blue uppercase">Từ ngày</label>
                            <input id="room-usage-from" type="date" value={from} max={to || undefined}
                                onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }}
                                className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo" />
                        </div>
                        <div className="camai-filter-field space-y-1">
                            <label htmlFor="room-usage-to" className="block text-[10px] font-bold text-slate-blue uppercase">Đến ngày</label>
                            <input id="room-usage-to" type="date" value={to} min={from || undefined}
                                onChange={(e) => { setTo(e.target.value); setPreset('custom'); }}
                                className="px-3 py-2 bg-slate-50 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue text-midnight-indigo" />
                        </div>
                    </div>
                </div>
            </FilterBar>
            {rangeError && <p role="status" className="text-sm text-amber-700">{rangeError}</p>}

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start text-sm">
                    <Info className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            {/* Summary Cards */}
            <StatisticGrid columns={5} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <SummaryCard
                    label="Tỷ lệ đặt phòng"
                    value={utilizationRate != null ? `${utilizationRate}%` : '—'}
                    badge={<span data-ui-text="badge" className="text-xs font-semibold text-green-500 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> Hiệu suất</span>}
                    loading={loading}
                />
                <SummaryCard
                    label="Tỷ lệ lấp đầy thực tế"
                    value={occupancyRate != null ? `${occupancyRate}%` : '—'}
                    sub="Từ cảm biến phòng"
                    loading={loading}
                />
                <SummaryCard
                    label="Tổng giờ đặt trước"
                    value={summaryUtil?.totalBookedHours != null ? `${summaryUtil.totalBookedHours}h` : '—'}
                    loading={loading}
                />
                <SummaryCard
                    label="Giờ dùng thực tế"
                    value={summaryUtil?.actualUsedHours != null ? `${summaryUtil.actualUsedHours}h` : '—'}
                    loading={loading}
                />
                <SummaryCard
                    label="Tỷ lệ no-show"
                    value={noShowData?.noShowRate != null ? `${noShowData.noShowRate}%` : '—'}
                    badge={
                        noShowData?.noShowRate > 10
                            ? <span data-ui-text="badge" className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Cao</span>
                            : noShowData?.noShowRate != null
                                ? <span data-ui-text="badge" className="text-xs font-semibold text-green-500 bg-green-50 px-2 py-0.5 rounded-full">Bình thường</span>
                                : null
                    }
                    loading={loading}
                />
            </StatisticGrid>

            {/* Main grid: room table + trend chart */}
            <div className="room-usage-main-grid grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Rooms table */}
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden lg:col-span-2">
                    <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                        <h3 className="font-bold text-midnight-indigo text-sm">So sánh hiệu suất giữa các phòng</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <PaginatedCollection items={data?.rooms} itemLabel="phòng">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-left border-collapse">
<colgroup>
<col style={{ width: '40%' }} />
<col style={{ width: '17%' }} />
<col style={{ width: '17%' }} />
<col style={{ width: '18%' }} />
<col style={{ width: '8%' }} />
</colgroup>
                            <thead>
                                <tr className="border-b border-platinum-tint bg-slate-50/50">
                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-blue uppercase tracking-wider">Tên phòng</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-blue uppercase tracking-wider text-right">Giờ đặt</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-blue uppercase tracking-wider text-right">Giờ thực tế</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-slate-blue uppercase tracking-wider text-right">Tỷ lệ sử dụng</th>
                                    <th className="px-6 py-3 text-right" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-platinum-tint">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={5} className="px-6 py-4 h-12 bg-slate-50/20" />
                                        </tr>
                                    ))
                                ) : (data?.rooms?.length ? (
                                    camaiPageItems.map((camaiRecord, camaiIndex) => ((room) => {
                                        const rate = room.reservationUtilizationRate ?? room.utilizationRate;
                                        const occ = room.roomOccupancyRate ?? null;
                                        return (
                                            <tr
                                                key={room.roomId}
                                                onClick={() => handleRoomClick(room.roomId)}
                                                className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-slate-blue flex-shrink-0" />
                                                        <span data-ui-text="primary" className="font-bold text-midnight-indigo text-xs">{room.roomName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right text-xs font-semibold text-slate-blue">
                                                    {room.bookedHours != null ? `${room.bookedHours}h` : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right text-xs font-semibold text-slate-blue">
                                                    {room.actualHours != null ? `${room.actualHours}h` : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span data-ui-text="primary" className="text-xs font-bold text-midnight-indigo">
                                                            {rate != null ? `${rate}%` : '—'}
                                                        </span>
                                                        {occ != null && (
                                                            <span data-ui-text="badge" className="text-[10px] text-green-500 font-semibold bg-green-50 px-1.5 py-0.5 rounded-md">
                                                                Thực tế: {occ}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right text-slate-blue">
                                                    <ChevronRight className="w-4 h-4 ml-auto" />
                                                </td>
                                            </tr>
                                        );
                                    })(camaiRecord, camaiStartIndex + camaiIndex, (data.rooms)))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-xs text-slate-400">
                                            Không có dữ liệu phòng trong kỳ này
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </ResponsiveTable>
)}
</PaginatedCollection>
                    </div>
                </div>

                <div className="room-usage-chart-column">
                    <div className="room-usage-chart-card bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                        <h3 className="font-bold text-midnight-indigo text-sm">Xu hướng đặt phòng</h3>
                        <div className="room-usage-chart-body">
                            {loading ? (
                                <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                            ) : data?.trend?.length ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.trend}>
                                        <defs>
                                            <linearGradient id="colorMeetings" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#1e90ff" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#1e90ff" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tickFormatter={value => String(value).slice(5).split('-').reverse().join('/')} minTickGap={24} tickLine={false} axisLine={false} style={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis tickLine={false} axisLine={false} style={{ fontSize: 12, fill: '#64748b' }} />
                                        <Tooltip labelFormatter={value => String(value).split('-').reverse().join('/')} />
                                        <Area type="monotone" dataKey="meetingCount" stroke="#1e90ff" strokeWidth={2} fillOpacity={1} fill="url(#colorMeetings)" name="Số cuộc họp" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                                    <BarChart3 className="w-8 h-8 opacity-30" />
                                    <p className="text-xs text-center">Chưa có dữ liệu xu hướng trong khoảng đã chọn</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="room-usage-chart-card bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                        <h3 className="font-bold text-midnight-indigo text-sm">Giờ đặt và sử dụng thực tế</h3>
                        <p className="text-xs text-slate-blue">Tổng số giờ trong khoảng thời gian đang lọc</p>
                        <div className="room-usage-chart-body">
                            {loading ? <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
                                : hoursComparison.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={hoursComparison} margin={{ top: 28, right: 16, bottom: 8, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#476788' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#476788' }} unit="h" />
                                            <Tooltip formatter={value => [`${value} giờ`, 'Thời lượng']} />
                                            <Bar dataKey="hours" name="Số giờ" maxBarSize={72} radius={[6, 6, 0, 0]}>
                                                {hoursComparison.map(item => <Cell key={item.label} fill={item.color} />)}
                                                <LabelList dataKey="hours" position="top" fill="#0b3558" fontSize={13} formatter={value => `${value}h`} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <div className="h-full flex items-center justify-center text-sm text-slate-blue">Chưa có dữ liệu giờ sử dụng trong khoảng đã chọn</div>}
                        </div>
                        {!loading && summaryUtil?.actualUsedHours == null && <p className="text-xs text-slate-blue">Chưa có số liệu giờ sử dụng thực tế.</p>}
                    </div>
                </div>
            </div>

            {/* No-show Analysis section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie chart */}
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Phân bố tình trạng sử dụng phòng
                        </h3>
                        {noShowData && (
                            <span data-ui-text="badge" className="text-[10px] font-bold text-slate-blue bg-slate-100 px-2 py-0.5 rounded-full">
                                {noShowData.totalBookings || 0} lượt đặt
                            </span>
                        )}
                    </div>
                    {loading ? (
                        <div className="h-52 bg-slate-50 animate-pulse rounded-xl" />
                    ) : noShowPieData.some(d => d.value > 0) ? (
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height={208}>
                                <PieChart>
                                    <Pie
                                        data={noShowPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={80}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {noShowPieData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<NoShowPieTooltip />} />
                                    <Legend
                                        iconType="circle"
                                        iconSize={8}
                                        formatter={(value) => <span data-ui-text="primary" className="text-[10px] text-midnight-indigo font-semibold">{value}</span>}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                            Không có dữ liệu no-show trong kỳ này
                        </div>
                    )}
                    {noShowData && (
                        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-platinum-tint">
                            <div className="text-center">
                                <p className="text-lg font-black text-red-500">{noShowData.noShowCount || 0}</p>
                                <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Lượt vắng mặt</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-black text-midnight-indigo">{noShowData.noShowRate || 0}%</p>
                                <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Tỷ lệ no-show</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* No-show ranking by room */}
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                    <h3 className="font-bold text-midnight-indigo text-sm">Xếp hạng phòng theo tỷ lệ no-show</h3>
                    {loading ? (
                        <div className="h-52 bg-slate-50 animate-pulse rounded-xl" />
                    ) : noShowRanking.length ? (
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height={208}>
                                <BarChart data={noShowRanking} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" tickLine={false} axisLine={false} style={{ fontSize: 9, fill: '#64748b' }} unit="%" domain={[0, 'auto']} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        style={{ fontSize: 9, fill: '#64748b' }}
                                        width={80}
                                    />
                                    <Tooltip formatter={(v) => [`${v}%`, 'Tỷ lệ no-show']} />
                                    <Bar dataKey="noShowRate" radius={[0, 4, 4, 0]}>
                                        {noShowRanking.map((_, i) => (
                                            <Cell
                                                key={i}
                                                fill={noShowRanking[i].noShowRate > 15 ? '#ef4444' : noShowRanking[i].noShowRate > 8 ? '#f59e0b' : BAR_COLORS[i % BAR_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : noShowData?.totalBookings > 0 && noShowData.noShowCount === 0 ? (
                        <div className="h-52 flex flex-col items-center justify-center gap-3 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            <p className="text-sm font-semibold text-midnight-indigo">Không ghi nhận lượt vắng mặt</p>
                            <p className="text-xs text-slate-blue">
                                {noShowData.totalBookings.toLocaleString('vi-VN')} lượt đặt trong khoảng đã chọn · Tỷ lệ vắng mặt 0%
                            </p>
                        </div>
                    ) : (
                        <div className="h-52 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <BarChart3 className="w-8 h-8 opacity-30" />
                            <p className="text-xs">{noShowData?.totalBookings === 0 ? 'Chưa có lượt đặt phòng trong khoảng đã chọn' : 'Chưa có dữ liệu xếp hạng phù hợp với bộ lọc'}</p>
                        </div>
                    )}
                    {noShowRanking.length > 0 && (
                        <p data-ui-text="secondary" className="text-[10px] text-slate-400">
                            Màu đỏ: &gt;15% · Màu vàng: 8–15% · Màu xanh: &lt;8%
                        </p>
                    )}
                </div>
            </div>

            {/* Utilization comparison row */}
            {(utilizationData || data?.summary) && (
                <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                    <h3 className="font-bold text-midnight-indigo text-sm mb-4">Chỉ số sử dụng tổng hợp kỳ này</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <MetricBlock
                            label="Tỷ lệ sử dụng"
                            value={utilizationData?.summary?.reservationUtilizationRate?.current != null ? `${utilizationData.summary.reservationUtilizationRate.current}%` : (utilizationRate != null ? `${utilizationRate}%` : '—')}
                            sub="Đặt / giờ mở cửa"
                        />
                        <MetricBlock
                            label="Giờ đặt trước"
                            value={utilizationData?.summary?.bookedHours?.current != null ? `${utilizationData.summary.bookedHours.current}h` : (data?.summary?.totalBookedHours != null ? `${data.summary.totalBookedHours}h` : '—')}
                        />
                        <MetricBlock
                            label="Giờ dùng thực tế"
                            value={utilizationData?.summary?.actualHours?.current != null ? `${utilizationData.summary.actualHours.current}h` : (data?.summary?.actualUsedHours != null ? `${data.summary.actualUsedHours}h` : '—')}
                        />
                        <MetricBlock
                            label="Giờ mở cửa khả dụng"
                            value={utilizationData?.summary?.availableHours?.current != null ? `${utilizationData.summary.availableHours.current}h` : '—'}
                            sub={utilizationData?.summary?.availableHours?.current == null ? 'Chưa có dữ liệu' : undefined}
                            dimSub={utilizationData?.summary?.availableHours?.current == null}
                        />
                    </div>
                </div>
            )}

            {/* Room Detail Modal — rendered via portal so fixed covers full viewport regardless of ancestor transforms */}
            {selectedRoomId && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setSelectedRoomId(null); }}
                >
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-cloud-mist/50">
                            <h3 className="font-bold text-midnight-indigo flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-action-blue" />
                                Chi tiết phòng: {roomDetail?.room?.roomName || 'Đang tải...'}
                            </h3>
                            <button onClick={() => setSelectedRoomId(null)} className="text-slate-blue hover:text-midnight-indigo">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {loadingDetail ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-20 bg-slate-100 rounded-xl" />
                                    <div className="h-48 bg-slate-100 rounded-xl" />
                                    <div className="h-40 bg-slate-100 rounded-xl" />
                                </div>
                            ) : roomDetail ? (
                                <>
                                    {/* Room spec */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl">
                                        <div>
                                            <span data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Vị trí</span>
                                            <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo mt-0.5">{roomDetail.room?.areaName || 'Chưa cung cấp'}</p>
                                        </div>
                                        <div>
                                            <span data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Sức chứa</span>
                                            <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo mt-0.5">{roomDetail.room?.capacity != null ? `${roomDetail.room.capacity} người` : '—'}</p>
                                        </div>
                                        <div>
                                            <span data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Hiệu suất đặt</span>
                                            <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo mt-0.5">
                                                {roomDetail.reservationUtilizationRate != null ? `${roomDetail.reservationUtilizationRate}%` : '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <span data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase">Tỷ lệ lấp đầy</span>
                                            <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo mt-0.5">
                                                {roomDetail.roomOccupancyRate != null ? `${roomDetail.roomOccupancyRate}%` : 'N/A'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Heatmap */}
                                    {roomDetail.heatmap?.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold text-midnight-indigo uppercase">Mật độ sử dụng theo giờ trong ngày</h4>
                                            <div className="h-48">
                                                <ResponsiveContainer width="100%" height={200}>
                                                    <BarChart data={roomDetail.heatmap}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                        <XAxis dataKey="hourOfDay" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: '#64748b' }} unit=":00" />
                                                        <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: '#64748b' }} />
                                                        <Tooltip formatter={(v) => [`${v} phút`, 'Thời lượng']} />
                                                        <Bar dataKey="actualMinutes" radius={[4, 4, 0, 0]}>
                                                            {roomDetail.heatmap.map((entry, i) => (
                                                                <Cell key={i} fill={HEATMAP_COLOR(entry.actualMinutes)} />
                                                            ))}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <p data-ui-text="secondary" className="text-[10px] text-slate-400">Đỏ: &gt;400 phút · Vàng: 200–400 phút · Xanh: &lt;200 phút</p>
                                        </div>
                                    )}

                                    {/* Meetings table */}
                                    {roomDetail.meetings?.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold text-midnight-indigo uppercase">Lịch sử các cuộc họp</h4>
                                            <div className="border border-platinum-tint rounded-xl overflow-hidden">
                                                <PaginatedCollection items={roomDetail?.meetings} itemLabel="cuộc họp">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-left">
<colgroup>
<col style={{ width: '38%' }} />
<col style={{ width: '26%' }} />
<col style={{ width: '18%' }} />
<col style={{ width: '18%' }} />
</colgroup>
                                                    <thead>
                                                        <tr className="bg-slate-50 border-b border-platinum-tint text-[10px] font-bold text-slate-blue uppercase">
                                                            <th className="px-4 py-2">Tiêu đề</th>
                                                            <th className="px-4 py-2">Người tổ chức</th>
                                                            <th className="px-4 py-2">Giờ đặt</th>
                                                            <th className="px-4 py-2">Giờ thực tế</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-platinum-tint text-xs text-midnight-indigo">
                                                        {camaiPageItems.map((camaiRecord, camaiIndex) => ((m) => (
                                                            <tr key={m.meetingId}>
                                                                <td className="px-4 py-3 font-semibold">{m.title}</td>
                                                                <td className="px-4 py-3 text-slate-blue">{m.organizerName}</td>
                                                                <td className="px-4 py-3 text-slate-blue whitespace-nowrap">
                                                                    {fmtTime(m.reservedStartTime)} – {fmtTime(m.reservedEndTime)}
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    {m.actualStartTime ? (
                                                                        <span className="text-slate-blue">
                                                                            {fmtTime(m.actualStartTime)} – {m.actualEndTime ? fmtTime(m.actualEndTime) : 'Chưa kết thúc'}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded">Không diễn ra</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))(camaiRecord, camaiStartIndex + camaiIndex, (roomDetail.meetings)))}
                                                    </tbody>
                                                </ResponsiveTable>
)}
</PaginatedCollection>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="py-16 text-center text-xs text-slate-400">
                                    Không thể tải chi tiết phòng. Vui lòng thử lại.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            , document.body)}

            <ExportReportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} range={reportPresetRange(preset, from, to)} filters={{ building: siteName }} filterSummary={[siteName ? `Tòa nhà: ${siteName}` : 'Tất cả tòa nhà']} />
        </div>
    );
};

const LegacySummaryCard = ({ label, value, badge, sub, loading }) => (
    <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm space-y-2">
        <span className="text-[10px] font-bold text-slate-blue uppercase tracking-wider block">{label}</span>
        {loading ? (
            <div className="h-7 bg-slate-100 animate-pulse rounded-lg" />
        ) : (
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-2xl font-black text-midnight-indigo">{value}</span>
                {badge}
                {sub && !badge && <span className="text-xs text-slate-blue font-medium">{sub}</span>}
            </div>
        )}
    </div>
);

const SummaryCard = (props) => (
    <StatisticCard label={props.label} value={props.value} helper={props.sub} loading={props.loading}
        legacy={<LegacySummaryCard {...props} />}>
        {props.badge}
    </StatisticCard>
);

const MetricBlock = ({ label, value, sub, dimSub }) => (
    <div className="text-center py-3 px-2 bg-slate-50 rounded-xl">
        <p className="text-xl font-black text-midnight-indigo">{value}</p>
        <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue uppercase mt-0.5">{label}</p>
        {sub && <p data-ui-text="secondary" className={`text-[9px] mt-0.5 ${dimSub ? 'text-slate-300' : 'text-slate-400'}`}>{sub}</p>}
    </div>
);

export default RoomUsageAnalytics;
