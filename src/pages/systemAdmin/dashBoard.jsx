import {
    Activity, AlertTriangle, Car, CheckCircle, LogIn,
    MapPin, RefreshCw, ShieldAlert, Wifi, WifiOff
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
    Sector, Legend
} from 'recharts';
import { Chart } from 'react-google-charts';

import {
    getRoomAnalytics, getAttendanceAnalytics,
    getDevices, getAdminVehicleTrafficStats,
    getSecurityAlertsDailyTrend, getAuditActivityHourly,
} from '../../service/sysAdminServices';
import { getSecurityAlerts } from '../../service/securityAlertService';
import { getBusinessAdminSummary } from '../../service/campusService';
import { getAlertTypeLabel } from '../../constants/alertType';

// ─── Design tokens (DESIGN.md — Sky Blueprint / Light Theme) ─────────────────

const D = {
    pageBg:   '#F8F9FB',                // Cloud Mist
    cardBg:   '#ffffff',                // Snow White
    cardBg2:  '#F8F9FB',                // Cloud Mist
    border:   '#D4E0ED',                // Platinum Tint
    borderSub:'#E7EDF6',                // Pale Gray
    text:     '#0B3558',                // Midnight Indigo
    muted:    '#476788',                // Slate Blue
    muted2:   '#A6BBD1',                // Steel Gray
    cyan:     '#0099ff',                // Skybound Blue
    blue:     '#006BFF',                // Action Blue
    purple:   '#8247f5',                // Royal Amethyst
    green:    '#10b981',
    amber:    '#ffa600',                // Sunset Gold
    red:      '#ef4444',
    grid:     '#E7EDF6',                // Pale Gray
    axisText: '#476788',                // Slate Blue
    shadow:   'rgba(71,103,136,0.04) 0px 4px 5px 0px, rgba(71,103,136,0.03) 0px 8px 15px 0px, rgba(71,103,136,0.08) 0px 30px 50px 0px',
    shadowSm: 'rgba(71,103,136,0.04) 0px 4px 5px 0px, rgba(71,103,136,0.03) 0px 4px 10px 0px, rgba(71,103,136,0.05) 0px 10px 20px 0px',
};

// ─── Google Charts light theme base options ───────────────────────────────────

const GC_BASE = {
    backgroundColor: 'transparent',
    fontName: 'inherit',
    chartArea: { backgroundColor: 'transparent', width: '88%', height: '72%' },
    hAxis: {
        textStyle: { color: D.axisText, fontSize: 10 },
        gridlines: { color: D.grid },
        baselineColor: D.grid,
    },
    vAxis: {
        textStyle: { color: D.axisText, fontSize: 10 },
        gridlines: { color: D.grid },
        baselineColor: D.grid,
        minValue: 0,
    },
    tooltip: {
        textStyle: { color: D.text, fontSize: 12 },
        showColorCode: true,
    },
    legend: {
        textStyle: { color: D.muted, fontSize: 11 },
    },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
    critical: '#ef4444',
    high:     '#f97316',
    medium:   '#ffa600',
    low:      '#006BFF',
};

const formatTrafficBucket = (bucket) => {
    if (!bucket) return '—';
    const text = String(bucket);
    const hourMatch = text.match(/(\d{2}):00$/);
    if (hourMatch) return `${hourMatch[1]}:00`;
    return text.length >= 10 ? text.slice(5).replace('-', '/') : text;
};

const mapVehicleTrafficSeries = (payload) => {
    const data = payload?.data?.data || payload?.data || {};
    const rows = data.series || data.buckets || [];
    return rows
        .map((b) => ({
            hour: formatTrafficBucket(b.bucket || b.period),
            'Vào': b.enter ?? b.total_enter ?? 0,
            'Ra': b.leave ?? b.total_leave ?? 0,
        }))
        .filter((b) => b['Vào'] > 0 || b['Ra'] > 0);
};

const SEVERITY_LABEL = {
    critical: 'Nguy cấp',
    high:     'Cao',
    medium:   'Trung bình',
    low:      'Thấp',
};

const ALERT_TYPE_KEYS   = ['intrusion', 'stranger', 'crowd', 'vehicle_control_match'];
const ALERT_TYPE_LABELS = ['Xâm nhập', 'Khuôn mặt lạ', 'Tụ tập', 'Xe kiểm soát'];
const ALERT_TYPE_COLORS = ['#ef4444', '#f97316', '#ffa600', '#006BFF'];

const DEVICE_TYPE_LABEL = {
    ip_camera:        'Camera AI',
    door_camera:      'Camera kiểm soát vào/ra',
    room_camera:      'Camera phòng họp',
    face_server:      'Máy chủ Face Server',
    face_terminal:    'Face Terminal',
    microphone:       'Micro ghi âm',
    capture_agent:    'Capture Agent',
    occupancy_sensor: 'Cảm biến đếm người',
    display:          'Màn hình hiển thị',
};

const DEVICE_STATUS_CONFIG = [
    { key: 'online',      label: 'Online',   color: '#10b981' },
    { key: 'offline',     label: 'Offline',  color: '#ef4444' },
    { key: 'disabled',    label: 'Vô hiệu',  color: '#A6BBD1' },
    { key: 'maintenance', label: 'Bảo trì',  color: '#ffa600' },
];

const CHART_COLORS = [
    '#0099ff', '#006BFF', '#8247f5', '#10b981', '#ffa600',
    '#ef4444', '#BB32D5', '#e55cff', '#EC4899', '#14b8a6',
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useInView = (threshold = 0.12) => {
    const ref    = useRef(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Khi tab đang ẩn, trình duyệt tạm dừng vòng render nên IntersectionObserver có thể
        // không bao giờ báo — khối nội dung sẽ kẹt ở opacity-0 và KPI kẹt ở 0. Bỏ qua hiệu
        // ứng trong trường hợp đó, ưu tiên hiển thị đúng dữ liệu hơn là animation.
        if (typeof document !== 'undefined' && document.hidden) { setInView(true); return; }
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
            { threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return [ref, inView];
};

const useCountUp = (target, active, duration = 750) => {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef(null);
    useEffect(() => {
        if (!active || typeof target !== 'number') return;

        // requestAnimationFrame bị trình duyệt tạm dừng khi tab đang ẩn. Nếu KPI được
        // tải trong lúc tab ở nền thì animation không bao giờ chạy và số liệu sẽ kẹt ở 0
        // — hiển thị sai hoàn toàn. Trường hợp đó gán thẳng giá trị thật, bỏ animation.
        if (typeof document !== 'undefined' && document.hidden) {
            setDisplay(target);
            return;
        }

        const startTime = performance.now();
        const tick = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(target * eased));
            if (progress < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        // Nếu người dùng chuyển tab giữa chừng, chốt luôn giá trị cuối để không đứng dở.
        const settle = () => { if (document.hidden) { cancelAnimationFrame(rafRef.current); setDisplay(target); } };
        document.addEventListener('visibilitychange', settle);

        return () => {
            cancelAnimationFrame(rafRef.current);
            document.removeEventListener('visibilitychange', settle);
        };
    }, [active, target, duration]);
    return display;
};

// ─── Scroll reveal ────────────────────────────────────────────────────────────

const ScrollReveal = ({ children, delay = 0, className = '', fromBelow = true }) => {
    const [ref, inView] = useInView();
    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${
                inView ? 'opacity-100 translate-y-0' : `opacity-0 ${fromBelow ? 'translate-y-8' : 'translate-y-2'}`
            } ${className}`}
            style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
        >
            {children}
        </div>
    );
};

// ─── Recharts helpers ─────────────────────────────────────────────────────────

const BarTooltip = ({ active, payload, label, unit = '' }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#ffffff',
            border: `1px solid ${D.border}`,
            borderRadius: 12, padding: '10px 14px', minWidth: 130, pointerEvents: 'none',
            boxShadow: D.shadowSm,
        }}>
            {label && <p style={{ fontSize: 11, fontWeight: 700, color: D.text, marginBottom: 6 }}>{label}</p>}
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: D.muted }}>{p.name}:</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>{p.value}{unit}</span>
                </div>
            ))}
        </div>
    );
};

const DonutTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <div style={{
            background: '#ffffff',
            border: `1px solid ${D.border}`,
            borderRadius: 12, padding: '10px 14px', pointerEvents: 'none',
            boxShadow: D.shadowSm,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.payload?.color || d.fill, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>{d.name}</span>
            </div>
            <p style={{ fontSize: 11, color: D.muted, paddingLeft: 18 }}>
                {d.value} · {((d.percent || 0) * 100).toFixed(1)}%
            </p>
        </div>
    );
};

const ActiveSlice = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <Sector
            cx={cx} cy={cy}
            innerRadius={innerRadius - 2}
            outerRadius={outerRadius + 8}
            startAngle={startAngle}
            endAngle={endAngle}
            fill={fill}
            style={{ filter: `drop-shadow(0 0 8px ${fill}80)` }}
        />
    );
};

const EmptyState = ({ message = 'Không có dữ liệu' }) => (
    <div className="h-full flex flex-col items-center justify-center gap-2 py-6"
         style={{ color: D.muted2 }}>
        <ShieldAlert className="w-8 h-8 opacity-30" />
        <p className="text-xs">{message}</p>
    </div>
);

const PulseSkeleton = ({ height = 220 }) => (
    <div className="animate-pulse rounded-xl" style={{ background: D.borderSub, minHeight: height }} />
);

const DonutLegend = ({ data }) => (
    <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px',
        paddingTop: 8,
    }}>
        {data.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: D.text }}>
                    {d.name}&nbsp;
                    <span style={{ fontWeight: 400, color: D.muted }}>({d.value})</span>
                </span>
            </div>
        ))}
    </div>
);

// ─── Chart card wrappers ──────────────────────────────────────────────────────

const ChartCard = ({ title, sub, delay = 0, renderChart, accent = D.cyan }) => {
    const [ref, inView] = useInView(0.1);
    return (
        <div
            ref={ref}
            style={{
                background: D.cardBg,
                border: `1px solid ${D.border}`,
                borderRadius: 16,
                padding: '20px 20px 16px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: D.shadow,
                position: 'relative',
                overflow: 'hidden',
                transitionDelay: inView ? `${delay}ms` : '0ms',
            }}
            className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
            {/* Top accent stripe */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent} 0%, ${accent}44 50%, transparent 100%)` }} />
            {/* Ambient glow */}
            <div style={{ position: 'absolute', top: -60, left: -30, width: 160, height: 160,
                borderRadius: '50%', opacity: 0.04, background: accent,
                filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ marginBottom: 14, flexShrink: 0, position: 'relative' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.1px' }}>{title}</h3>
                {sub && <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>{sub}</p>}
            </div>
            <div style={{ flex: 1 }}>
                {renderChart(inView)}
            </div>
        </div>
    );
};

const GChartCard = ({ title, sub, delay = 0, accent = D.cyan, loading, empty, emptyMsg, children }) => {
    const [ref, inView] = useInView(0.1);
    return (
        <div
            ref={ref}
            style={{
                background: D.cardBg,
                border: `1px solid ${D.border}`,
                borderRadius: 16,
                padding: '20px 20px 16px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: D.shadow,
                position: 'relative',
                overflow: 'hidden',
                transitionDelay: inView ? `${delay}ms` : '0ms',
            }}
            className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent} 0%, ${accent}44 50%, transparent 100%)` }} />
            <div style={{ position: 'absolute', top: -60, left: -30, width: 160, height: 160,
                borderRadius: '50%', opacity: 0.04, background: accent,
                filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ marginBottom: 14, flexShrink: 0, position: 'relative' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{title}</h3>
                {sub && <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>{sub}</p>}
            </div>
            <div style={{ flex: 1, minHeight: 220 }}>
                {!inView || loading ? (
                    <PulseSkeleton />
                ) : empty ? (
                    <EmptyState message={emptyMsg} />
                ) : children}
            </div>
        </div>
    );
};

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

const KpiTile = ({ icon: Icon, label, value, sub, subColor, iconColor = D.cyan, delay, progress }) => {
    const [ref, inView] = useInView(0.2);
    const numericTarget = typeof value === 'number' ? value : null;
    const counted       = useCountUp(numericTarget, inView);
    const displayValue  = numericTarget !== null ? counted : value;

    return (
        <div
            ref={ref}
            style={{
                background: D.cardBg,
                border: `1px solid ${D.border}`,
                borderRadius: 16,
                padding: '16px 16px 14px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: D.shadowSm,
                transitionDelay: inView ? `${delay}ms` : '0ms',
            }}
            className={`transition-all duration-600 ease-out cursor-default hover:scale-[1.025]
                ${inView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`}
        >
            <div style={{
                position: 'absolute', top: -24, right: -24, width: 90, height: 90,
                borderRadius: '50%', opacity: 0.07,
                background: iconColor, filter: 'blur(24px)', pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, lineHeight: 1.45, paddingRight: 8 }}>{label}</p>
                <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${iconColor}15`, border: `1px solid ${iconColor}35`,
                }}>
                    <Icon style={{ width: 17, height: 17, color: iconColor }} />
                </div>
            </div>

            <p style={{ fontSize: 27, fontWeight: 800, color: D.text, letterSpacing: '-0.8px', lineHeight: 1 }}
               className="tabular-nums">
                {displayValue}
            </p>

            {progress !== undefined && (
                <div style={{ marginTop: 10, height: 3, borderRadius: 99, background: D.borderSub }}>
                    <div style={{
                        height: 3, borderRadius: 99,
                        width: inView ? `${Math.min(progress, 100)}%` : '0%',
                        background: `linear-gradient(90deg, ${iconColor}, ${iconColor}70)`,
                        transition: 'width 1.1s cubic-bezier(.22,1,.36,1)',
                    }} />
                </div>
            )}

            {sub && (
                <p style={{ fontSize: 11, marginTop: 8, fontWeight: 500, color: subColor || D.muted }}>
                    {sub}
                </p>
            )}
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const DashBoard = () => {
    const userStr = localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const [kpi, setKpi] = useState({
        devicesOnline: 0, devicesTotal: 0, devicesOffline: 0,
        alertsNew: 0, gateTrafficToday: 0,
        zonesActive: 0, zonesTotal: 0, vehicleHitsToday: 0,
    });

    const [severityData,     setSeverityData]     = useState([]);
    const [trafficData,      setTrafficData]      = useState([]);
    const [roomData,         setRoomData]         = useState([]);
    const [attendanceData,   setAttendanceData]   = useState([]);
    const [deviceTypeData,   setDeviceTypeData]   = useState([]);
    const [deviceStatusData, setDeviceStatusData] = useState([]);
    const [recentAlerts,     setRecentAlerts]     = useState([]);

    const [alertTrendGCData, setAlertTrendGCData] = useState(null);
    const [auditHourlyData,  setAuditHourlyData]  = useState([]);
    const [alertTrendTotal,  setAlertTrendTotal]  = useState(0);
    const [auditTotal,       setAuditTotal]       = useState(0);

    const [activeSeverityIdx,     setActiveSeverityIdx]     = useState(null);
    const [activeAttendanceIdx,   setActiveAttendanceIdx]   = useState(null);
    const [activeDeviceStatusIdx, setActiveDeviceStatusIdx] = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);

        const now        = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        // Analytics API dùng chuỗi ngày YYYY-MM-DD theo giờ địa phương; toISOString() sẽ
        // đổi sang UTC và làm lệch ngày (VN = UTC+7).
        const pad2 = (n) => String(n).padStart(2, '0');
        const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const monthStartStr = toDateStr(monthStart);
        const todayStr = toDateStr(now);

        const [
            summaryRes, devicesRes, alertsRes, trafficRes,
            roomRes, attendanceRes, trendRes, auditRes,
        ] = await Promise.allSettled([
            getBusinessAdminSummary(),
            getDevices({ limit: 100 }),
            getSecurityAlerts({ status: 'new', limit: 5 }),
            getAdminVehicleTrafficStats({
                from: todayStart.toISOString(),
                to:   todayEnd.toISOString(),
                group_by: 'hour',
            }),
            getRoomAnalytics({ from: monthStartStr, to: todayStr }),
            getAttendanceAnalytics({ from: monthStartStr, to: todayStr }),
            getSecurityAlertsDailyTrend({ days: 7 }),
            getAuditActivityHourly(),
        ]);

        // ── Devices ───────────────────────────────────────────────────────────
        let devList = [];
        if (devicesRes.status === 'fulfilled' && devicesRes.value?.success) {
            devList = devicesRes.value.data || [];
        }
        const online       = devList.filter(d => d.status === 'online').length;
        const offlineCount = devList.filter(d => ['offline', 'disabled', 'maintenance'].includes(d.status)).length;

        if (devList.length > 0) {
            const typeMap = {};
            devList.forEach(d => {
                const t = d.device_type || 'unknown';
                typeMap[t] = (typeMap[t] || 0) + 1;
            });
            setDeviceTypeData(
                Object.entries(typeMap)
                    .map(([type, count], i) => ({
                        name: DEVICE_TYPE_LABEL[type] || type,
                        count,
                        color: CHART_COLORS[i % CHART_COLORS.length],
                    }))
                    .sort((a, b) => b.count - a.count)
            );
            const statusMap = {};
            devList.forEach(d => { statusMap[d.status || 'unknown'] = (statusMap[d.status || 'unknown'] || 0) + 1; });
            setDeviceStatusData(
                DEVICE_STATUS_CONFIG
                    .map(s => ({ name: s.label, value: statusMap[s.key] || 0, color: s.color }))
                    .filter(d => d.value > 0)
            );
        }

        // ── Business summary ──────────────────────────────────────────────────
        let gateToday = 0, zonesActive = 0, zonesTotal = 0, vehicleHits = 0;
        if (summaryRes.status === 'fulfilled' && summaryRes.value?.success) {
            const s = summaryRes.value.data;
            gateToday   = s.gateTrafficToday?.entriesToday || 0;
            zonesActive = s.zoneOccupancy?.zonesWithDataCount || 0;
            zonesTotal  = s.zoneOccupancy?.totalZoneCount || 0;
            vehicleHits = s.vehicleControlHitsToday || 0;
            const sev = s.securityAlertsBySeverity;
            if (sev) {
                setSeverityData(
                    Object.entries(sev)
                        .filter(([, v]) => v > 0)
                        .map(([key, value]) => ({
                            name:  SEVERITY_LABEL[key] || key,
                            value,
                            color: SEVERITY_COLORS[key] || '#94A3B8',
                        }))
                );
            }
        }

        // ── Security alerts ───────────────────────────────────────────────────
        let alertsNew = 0;
        if (alertsRes.status === 'fulfilled' && alertsRes.value?.success) {
            alertsNew = alertsRes.value.meta?.total || (alertsRes.value.data || []).length;
            setRecentAlerts((alertsRes.value.data || []).slice(0, 5));
        }

        setKpi({
            devicesOnline:    online,
            devicesTotal:     devList.length,
            devicesOffline:   offlineCount,
            alertsNew,
            gateTrafficToday: gateToday,
            zonesActive,
            zonesTotal,
            vehicleHitsToday: vehicleHits,
        });

        // ── Traffic ───────────────────────────────────────────────────────────
        if (trafficRes.status === 'fulfilled' && trafficRes.value?.success) {
            setTrafficData(mapVehicleTrafficSeries(trafficRes.value));
        } else {
            setTrafficData([]);
        }

        // ── Rooms ─────────────────────────────────────────────────────────────
        if (roomRes.status === 'fulfilled' && roomRes.value?.success) {
            const rooms = roomRes.value.data?.rooms || [];
            setRoomData(
                rooms.slice(0, 8)
                    .map(r => ({
                        name: (r.roomName || r.room_name || '').replace(/^Phòng\s+/i, '') || '—',
                        rate: +(parseFloat(r.reservationUtilizationRate ?? r.utilizationRate ?? 0).toFixed(1)),
                        bookedHours: r.bookedHours ?? 0,
                        actualHours: r.actualHours ?? 0,
                    }))
                    .filter(r => r.name !== '—')
            );
        }

        // ── Attendance ────────────────────────────────────────────────────────
        if (attendanceRes.status === 'fulfilled' && attendanceRes.value?.success) {
            const att    = attendanceRes.value.data;
            const total  = att.totalRequiredParticipants || 0;
            const onTime = att.onTimeCount || 0;
            const late   = att.lateCount || 0;
            const absent = Math.max(0, total - onTime - late);
            setAttendanceData(
                [
                    { name: 'Đúng giờ', value: onTime, color: '#10b981' },
                    { name: 'Đến muộn', value: late,   color: '#ffa600' },
                    { name: 'Vắng mặt', value: absent, color: '#ef4444' },
                ].filter(d => d.value > 0)
            );
        }

        // ── Security alert daily trend ────────────────────────────────────────
        if (trendRes.status === 'fulfilled' && trendRes.value?.success) {
            const series = trendRes.value.data?.series || [];
            if (series.length > 0) {
                const header = ['Ngày', ...ALERT_TYPE_LABELS];
                const rows = series.map(s => [
                    s.date ? s.date.slice(5).replace('-', '/') : '',
                    ...ALERT_TYPE_KEYS.map(k => (s.byType?.[k] || 0)),
                ]);
                setAlertTrendGCData([header, ...rows]);
                setAlertTrendTotal(trendRes.value.data?.totalInPeriod || 0);
            }
        }

        // ── Audit activity hourly ─────────────────────────────────────────────
        if (auditRes.status === 'fulfilled' && auditRes.value?.success) {
            const buckets = auditRes.value.data?.buckets || [];
            setAuditTotal(auditRes.value.data?.totalToday || 0);
            if (buckets.length > 0) {
                setAuditHourlyData(buckets.map(b => ({
                    hour: typeof b.hour === 'number'
                        ? String(b.hour).padStart(2, '0') + 'h'
                        : String(b.hour ?? '').slice(0, 2) + 'h',
                    count: b.count ?? 0,
                })));
            }
        }

        setLastUpdated(new Date());
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const monthLabel = `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const onlinePct  = kpi.devicesTotal > 0 ? (kpi.devicesOnline / kpi.devicesTotal) * 100 : 0;
    const zonePct    = kpi.zonesTotal   > 0 ? (kpi.zonesActive   / kpi.zonesTotal)   * 100 : 0;

    const alertTrendOptions = {
        ...GC_BASE,
        isStacked: true,
        colors: ALERT_TYPE_COLORS,
        areaOpacity: 0.18,
        lineWidth: 2,
        pointSize: 5,
        pointShape: 'circle',
        legend: {
            position: 'bottom',
            textStyle: { color: D.muted, fontSize: 10 },
            maxLines: 2,
        },
        chartArea: { ...GC_BASE.chartArea, height: '62%' },
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5" style={{ color: D.text }}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <ScrollReveal delay={0} fromBelow={false}>
                <div style={{
                    background: '#ffffff',
                    border: `1px solid ${D.border}`,
                    borderRadius: 16,
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: D.shadow,
                }}>
                    {/* Decorative accent top */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                        background: `linear-gradient(90deg, ${D.blue} 0%, ${D.cyan}80 50%, transparent 100%)` }} />
                    {/* Soft glow */}
                    <div style={{ position: 'absolute', top: -60, right: 80, width: 200, height: 200,
                        borderRadius: '50%', opacity: 0.05, background: D.blue,
                        filter: 'blur(50px)', pointerEvents: 'none' }} />

                    <div style={{ position: 'relative' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                            background: `${D.blue}12`, color: D.blue,
                            border: `1px solid ${D.blue}30`, marginBottom: 8,
                        }}>
                            <Activity style={{ width: 13, height: 13 }} />
                            Tổng quan hệ thống
                        </span>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: '-0.5px' }}>
                            Xin chào, {currentUser?.fullName || 'Quản trị hệ thống'} 👋
                        </h1>
                        <p style={{ fontSize: 12, color: D.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {lastUpdated ? (
                                <>
                                    <span style={{
                                        width: 7, height: 7, borderRadius: '50%',
                                        background: D.green, boxShadow: `0 0 5px ${D.green}`,
                                        display: 'inline-block', flexShrink: 0,
                                    }} />
                                    Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN')}
                                </>
                            ) : 'Đang tải dữ liệu...'}
                        </p>
                    </div>

                    <button
                        onClick={fetchAll}
                        disabled={loading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            background: D.blue, color: '#ffffff',
                            border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
                            transition: 'all 0.2s', flexShrink: 0,
                            boxShadow: `0 2px 8px ${D.blue}40`,
                        }}
                    >
                        <RefreshCw style={{ width: 15, height: 15 }}
                                   className={loading ? 'animate-spin' : ''} />
                        Làm mới
                    </button>
                </div>
            </ScrollReveal>

            {/* ── Error banner ─────────────────────────────────────────────── */}
            {error && (
                <ScrollReveal delay={0}>
                    <div style={{
                        padding: '14px 18px',
                        background: '#FFF5F5', border: `1px solid #FECACA`,
                        borderRadius: 12, color: '#DC2626', fontSize: 13,
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
                        <span>{error}</span>
                    </div>
                </ScrollReveal>
            )}

            {/* ── KPI Tiles ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KpiTile delay={0}   icon={Wifi}        label="Thiết bị Online"
                    value={loading ? '—' : kpi.devicesOnline}
                    sub={loading ? '' : `/ ${kpi.devicesTotal} thiết bị`}
                    iconColor={D.green} progress={loading ? undefined : onlinePct} />
                <KpiTile delay={60}  icon={WifiOff}     label="Offline / Lỗi"
                    value={loading ? '—' : kpi.devicesOffline}
                    sub={loading ? '' : kpi.devicesOffline > 0 ? 'Cần kiểm tra' : 'Ổn định'}
                    iconColor={kpi.devicesOffline > 0 ? D.red : D.green}
                    subColor={kpi.devicesOffline > 0 ? '#DC2626' : '#059669'} />
                <KpiTile delay={120} icon={ShieldAlert}  label="Cảnh báo chưa xử lý"
                    value={loading ? '—' : kpi.alertsNew}
                    sub={loading ? '' : kpi.alertsNew > 0 ? 'Cần xử lý ngay' : 'Không có mới'}
                    iconColor={kpi.alertsNew > 0 ? D.red : D.green}
                    subColor={kpi.alertsNew > 0 ? '#DC2626' : '#059669'} />
                <KpiTile delay={180} icon={LogIn}        label="Lượt ra/vào hôm nay"
                    value={loading ? '—' : kpi.gateTrafficToday}
                    sub="Qua tất cả cổng" iconColor={D.cyan} />
                <KpiTile delay={240} icon={MapPin}       label="Khu vực giám sát"
                    value={loading ? '—' : `${kpi.zonesActive}/${kpi.zonesTotal}`}
                    sub="Zone có dữ liệu hôm nay"
                    iconColor={D.purple} progress={loading ? undefined : zonePct} />
                <KpiTile delay={300} icon={Car}          label="Xe khớp kiểm soát"
                    value={loading ? '—' : kpi.vehicleHitsToday}
                    sub={kpi.vehicleHitsToday > 0 ? 'Blocklist / Watchlist' : 'Không có khớp'}
                    iconColor={kpi.vehicleHitsToday > 0 ? D.amber : D.muted2}
                    subColor={kpi.vehicleHitsToday > 0 ? '#B45309' : D.muted} />
            </div>

            {/* ── Row 1: Severity donut + Traffic area ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard accent={D.red} delay={0}
                    title="Cảnh báo theo mức độ nghiêm trọng"
                    sub="Phân bổ cảnh báo an ninh chưa xử lý"
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!severityData.length) return <EmptyState message="Không có dữ liệu cảnh báo" />;
                        const total = severityData.reduce((s, d) => s + d.value, 0);
                        return (
                            <>
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={severityData}
                                            cx="50%" cy="50%"
                                            innerRadius={58} outerRadius={85}
                                            dataKey="value" paddingAngle={3}
                                            animationBegin={100} animationDuration={900} animationEasing="ease-out"
                                            activeIndex={activeSeverityIdx ?? undefined}
                                            activeShape={<ActiveSlice />}
                                            onMouseEnter={(_, i) => setActiveSeverityIdx(i)}
                                            onMouseLeave={() => setActiveSeverityIdx(null)}
                                        >
                                            {severityData.map(e => <Cell key={e.name} fill={e.color} />)}
                                        </Pie>
                                        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 22, fontWeight: 800, fill: D.text }}>{total}</tspan>
                                        </text>
                                        <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 10, fill: D.muted }}>Tổng cảnh báo</tspan>
                                        </text>
                                        <Tooltip content={<DonutTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <DonutLegend data={severityData} />
                            </>
                        );
                    }}
                />

                <ChartCard accent={D.cyan} delay={100}
                    title="Lưu lượng phương tiện 24h"
                    sub="Lượt vào/ra qua cổng trong ngày hôm nay"
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!trafficData.length) return <EmptyState message="Không có dữ liệu lưu lượng hôm nay" />;
                        return (
                            <ResponsiveContainer width="100%" height={240}>
                                <AreaChart data={trafficData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gVao" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor={D.cyan}   stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={D.cyan}   stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gRa" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor={D.purple} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={D.purple} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={D.grid} vertical={false} />
                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: D.axisText }}
                                           tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 10, fill: D.axisText }}
                                           tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip content={<BarTooltip />} />
                                    <Legend iconType="circle" iconSize={8}
                                            formatter={v => <span style={{ fontSize: 11, fontWeight: 600, color: D.muted }}>{v}</span>} />
                                    <Area type="monotone" dataKey="Vào" stroke={D.cyan}   strokeWidth={2} fill="url(#gVao)" dot={false}
                                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: D.cyan }}
                                          animationDuration={1000} animationEasing="ease-out" />
                                    <Area type="monotone" dataKey="Ra"  stroke={D.purple} strokeWidth={2} fill="url(#gRa)"  dot={false}
                                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: D.purple }}
                                          animationDuration={1000} animationEasing="ease-out" />
                                </AreaChart>
                            </ResponsiveContainer>
                        );
                    }}
                />
            </div>

            {/* ── Row 2: Alert trend (7d) + Audit hourly ────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <GChartCard
                    accent={D.red} delay={0}
                    title="Xu hướng cảnh báo an ninh 7 ngày"
                    sub={`Tổng ${alertTrendTotal} sự kiện · phân loại theo loại cảnh báo`}
                    loading={loading}
                    empty={!alertTrendGCData || alertTrendGCData.length <= 1}
                    emptyMsg="Không có dữ liệu xu hướng cảnh báo"
                >
                    <Chart
                        chartType="AreaChart"
                        width="100%"
                        height="240px"
                        data={alertTrendGCData}
                        options={alertTrendOptions}
                        loader={<PulseSkeleton />}
                    />
                </GChartCard>

                <ChartCard
                    accent={D.blue} delay={100}
                    title="Hoạt động hệ thống theo giờ"
                    sub={`Hôm nay · ${auditTotal} thao tác audit log (24 khung giờ)`}
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!auditHourlyData.length) return <EmptyState message="Không có dữ liệu audit log hôm nay" />;
                        return (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={auditHourlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={D.grid} vertical={false} />
                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: D.axisText }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 9, fill: D.axisText }} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip content={<BarTooltip unit=" thao tác" />} />
                                    <Bar dataKey="count" name="Thao tác" fill={D.blue} radius={[3, 3, 0, 0]} animationDuration={800} />
                                </BarChart>
                            </ResponsiveContainer>
                        );
                    }}
                />
            </div>

            {/* ── Row 3: Room bar + Attendance donut ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard accent={D.blue} delay={0}
                    title="Tỷ lệ sử dụng phòng họp"
                    sub={monthLabel}
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!roomData.length) return <EmptyState message="Không có dữ liệu phòng họp" />;
                        return (
                            <ResponsiveContainer width="100%" height={Math.max(200, roomData.length * 34)}>
                                <BarChart data={roomData} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={D.grid} horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]}
                                           tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false}
                                           tickFormatter={v => `${v}%`} />
                                    <YAxis type="category" dataKey="name" width={88}
                                           tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<BarTooltip unit="%" />} />
                                    <Bar dataKey="rate" name="Sử dụng" radius={[0, 4, 4, 0]}
                                         animationDuration={900} animationEasing="ease-out">
                                        {roomData.map((e, i) => (
                                            <Cell key={i} fill={
                                                e.rate >= 80 ? D.green :
                                                e.rate >= 50 ? D.cyan  : D.amber
                                            } />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        );
                    }}
                />

                <ChartCard accent={D.green} delay={100}
                    title="Phân tích điểm danh"
                    sub={monthLabel}
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!attendanceData.length) return <EmptyState message="Không có dữ liệu điểm danh" />;
                        const total = attendanceData.reduce((s, d) => s + d.value, 0);
                        return (
                            <>
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={attendanceData}
                                            cx="50%" cy="50%"
                                            innerRadius={58} outerRadius={85}
                                            dataKey="value" paddingAngle={3}
                                            animationBegin={100} animationDuration={900} animationEasing="ease-out"
                                            activeIndex={activeAttendanceIdx ?? undefined}
                                            activeShape={<ActiveSlice />}
                                            onMouseEnter={(_, i) => setActiveAttendanceIdx(i)}
                                            onMouseLeave={() => setActiveAttendanceIdx(null)}
                                        >
                                            {attendanceData.map(e => <Cell key={e.name} fill={e.color} />)}
                                        </Pie>
                                        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 22, fontWeight: 800, fill: D.text }}>{total}</tspan>
                                        </text>
                                        <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 10, fill: D.muted }}>Người tham dự</tspan>
                                        </text>
                                        <Tooltip content={<DonutTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <DonutLegend data={attendanceData} />
                            </>
                        );
                    }}
                />
            </div>

            {/* ── Row 4: Device type bar + Device status donut ──────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard accent={D.cyan} delay={0}
                    title="Phân loại thiết bị IoT"
                    sub="Số lượng theo loại thiết bị đang đăng ký"
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!deviceTypeData.length) return <EmptyState message="Chưa có thiết bị nào được đăng ký" />;
                        return (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={deviceTypeData} margin={{ top: 8, right: 8, left: -26, bottom: 48 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={D.grid} vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: D.axisText }}
                                           tickLine={false} axisLine={false} angle={-32} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 10, fill: D.axisText }}
                                           tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip content={<BarTooltip />} />
                                    <Bar dataKey="count" name="Thiết bị" radius={[4, 4, 0, 0]}
                                         animationDuration={900} animationEasing="ease-out">
                                        {deviceTypeData.map(e => <Cell key={e.name} fill={e.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        );
                    }}
                />

                <ChartCard accent={D.purple} delay={100}
                    title="Trạng thái sức khỏe thiết bị IoT"
                    sub="Phân bổ trạng thái kết nối toàn bộ thiết bị"
                    renderChart={(visible) => {
                        if (!visible || loading) return <PulseSkeleton />;
                        if (!deviceStatusData.length) return <EmptyState message="Chưa có thiết bị nào được đăng ký" />;
                        const total = deviceStatusData.reduce((s, d) => s + d.value, 0);
                        return (
                            <>
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={deviceStatusData}
                                            cx="50%" cy="50%"
                                            innerRadius={58} outerRadius={85}
                                            dataKey="value" paddingAngle={3}
                                            animationBegin={100} animationDuration={900} animationEasing="ease-out"
                                            activeIndex={activeDeviceStatusIdx ?? undefined}
                                            activeShape={<ActiveSlice />}
                                            onMouseEnter={(_, i) => setActiveDeviceStatusIdx(i)}
                                            onMouseLeave={() => setActiveDeviceStatusIdx(null)}
                                        >
                                            {deviceStatusData.map(e => <Cell key={e.name} fill={e.color} />)}
                                        </Pie>
                                        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 22, fontWeight: 800, fill: D.text }}>{total}</tspan>
                                        </text>
                                        <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle">
                                            <tspan style={{ fontSize: 10, fill: D.muted }}>Tổng thiết bị</tspan>
                                        </text>
                                        <Tooltip content={<DonutTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <DonutLegend data={deviceStatusData} />
                            </>
                        );
                    }}
                />
            </div>

            {/* ── Recent Alerts Feed ────────────────────────────────────────── */}
            <ScrollReveal delay={0}>
                <div style={{
                    background: D.cardBg,
                    border: `1px solid ${D.border}`,
                    borderRadius: 16,
                    padding: '20px 20px 16px',
                    boxShadow: D.shadow,
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                        background: `linear-gradient(90deg, ${D.red} 0%, ${D.red}44 50%, transparent 100%)` }} />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Cảnh báo an ninh gần đây</h3>
                            <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>5 sự kiện chưa xử lý mới nhất</p>
                        </div>
                        <Link to="/system-admin/security-alerts" style={{
                            fontSize: 12, fontWeight: 600, color: D.blue, textDecoration: 'none',
                            padding: '6px 14px', background: `${D.blue}10`,
                            border: `1px solid ${D.blue}28`, borderRadius: 8,
                            transition: 'all 0.2s',
                        }}>
                            Xem tất cả →
                        </Link>
                    </div>

                    {loading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="animate-pulse h-14 rounded-xl" style={{ background: D.borderSub }} />
                            ))}
                        </div>
                    ) : recentAlerts.length === 0 ? (
                        <div className="py-8 text-center">
                            <CheckCircle style={{ width: 36, height: 36, color: D.green, margin: '0 auto 10px', opacity: 0.6 }} />
                            <p style={{ fontSize: 13, color: D.muted, fontWeight: 500 }}>
                                Không có cảnh báo mới — hệ thống đang ổn định.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentAlerts.map((alert, i) => {
                                const sevColor =
                                    alert.severity === 'critical' ? D.red     :
                                    alert.severity === 'high'     ? '#f97316' :
                                    alert.severity === 'medium'   ? D.amber   : D.blue;
                                return (
                                    <ScrollReveal key={alert.id} delay={i * 60} fromBelow={false}>
                                        <div
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 14px',
                                                background: '#ffffff',
                                                border: `1px solid ${D.border}`,
                                                borderRadius: 12, transition: 'border-color 0.2s, background 0.2s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = `${sevColor}40`; e.currentTarget.style.background = D.cardBg2; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = D.border; e.currentTarget.style.background = '#ffffff'; }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: `${sevColor}12`, border: `1px solid ${sevColor}30`,
                                                }}>
                                                    <ShieldAlert style={{ width: 16, height: 16, color: sevColor }} />
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontSize: 12, fontWeight: 700, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {getAlertTypeLabel(alert.alert_type)}
                                                    </p>
                                                    <p style={{ fontSize: 11, color: D.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {alert.zone_name || 'Không xác định khu vực'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 10 }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700,
                                                    background: `${sevColor}12`, color: sevColor, border: `1px solid ${sevColor}30`,
                                                }}>
                                                    {SEVERITY_LABEL[alert.severity] || alert.severity}
                                                </span>
                                                <span style={{ fontSize: 11, color: D.muted2, whiteSpace: 'nowrap' }}>
                                                    {new Date(alert.created_at || alert.triggered_at)
                                                        .toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </ScrollReveal>
                                );
                            })}
                        </div>
                    )}
                </div>
            </ScrollReveal>

        </div>
    );
};

export default DashBoard;
