import {
    Activity, AlertTriangle, ArrowRight, BarChart3, Building2, Calendar,
    Car, CheckCircle, ChevronRight, Clock, Download, LogIn, MapPin,
    PieChart as PieIcon, Plus, RefreshCw, ShieldAlert, Sliders,
    TrendingUp, Users, Wifi, WifiOff,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Legend, PieChart, Pie, Cell, Sector,
} from 'recharts';
import { Chart } from 'react-google-charts';

import {
    getDashboardOverview, getRoomAnalytics, getAttendanceAnalytics,
    getMeetingsCountByPeriod, getMeetingStatusBreakdown, getAverageMeetingDuration,
    getMeetingCancelRate, getNoShowStats, exportMeetingActivity, getDepartments,
} from '../../service/businessAdminServices';
import {
    getDevices, getAdminVehicleTrafficStats, getAdminGateAccessHistory,
    getSecurityAlertsDailyTrend, getAuditActivityHourly,
} from '../../service/sysAdminServices';
import { getZones } from '../../service/zoneServices';
import { getSecurityAlerts } from '../../service/securityAlertService';
import { getVehicleControlList } from '../../service/anprService';
import { getBusinessAdminSummary } from '../../service/campusService';
import { get } from '../../utils/request';
import DashboardBanner from '../../components/common/DashboardBanner';
import { getAlertTypeLabel } from '../../constants/alertType';

// ─── Design tokens (Sky Blueprint — mirrored from sysadmin) ──────────────────

const D = {
    pageBg:   '#F8F9FB',
    cardBg:   '#ffffff',
    cardBg2:  '#F8F9FB',
    border:   '#D4E0ED',
    borderSub:'#E7EDF6',
    text:     '#0B3558',
    muted:    '#476788',
    muted2:   '#A6BBD1',
    cyan:     '#0099ff',
    blue:     '#006BFF',
    purple:   '#8247f5',
    green:    '#10b981',
    amber:    '#ffa600',
    red:      '#ef4444',
    grid:     '#E7EDF6',
    axisText: '#476788',
    shadow:   'rgba(71,103,136,0.04) 0px 4px 5px 0px, rgba(71,103,136,0.03) 0px 8px 15px 0px, rgba(71,103,136,0.08) 0px 30px 50px 0px',
    shadowSm: 'rgba(71,103,136,0.04) 0px 4px 5px 0px, rgba(71,103,136,0.03) 0px 4px 10px 0px, rgba(71,103,136,0.05) 0px 10px 20px 0px',
};

const GC_BASE = {
    backgroundColor: 'transparent',
    fontName: 'inherit',
    chartArea: { backgroundColor: 'transparent', width: '88%', height: '68%' },
    hAxis: { textStyle: { color: D.axisText, fontSize: 10 }, gridlines: { color: D.grid }, baselineColor: D.grid },
    vAxis: { textStyle: { color: D.axisText, fontSize: 10 }, gridlines: { color: D.grid }, baselineColor: D.grid, minValue: 0 },
    tooltip: { textStyle: { color: D.text, fontSize: 12 }, showColorCode: true },
    legend: { textStyle: { color: D.muted, fontSize: 11 } },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#ffa600', low: '#006BFF' };
const SEVERITY_LABEL  = { critical: 'Nguy cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const ALERT_TYPE_KEYS   = ['intrusion', 'stranger', 'crowd', 'vehicle_control_match'];
const ALERT_TYPE_LABELS = ['Xâm nhập', 'Khuôn mặt lạ', 'Tụ tập', 'Xe kiểm soát'];
const ALERT_TYPE_COLORS = ['#ef4444', '#f97316', '#ffa600', '#006BFF'];

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
const STATUS_COLORS = ['#006BFF', '#7F3DFF', '#FFAE00', '#FF3B30'];

// BE tra ve status dang enum tieng Anh -> hien thi nhan tieng Viet cho nguoi dung.
const MEETING_STATUS_LABEL = {
    scheduled: 'Đã lên lịch',
    completed: 'Đã diễn ra',
    cancelled: 'Đã huỷ',
    no_show:   'Vắng mặt',
    draft:     'Nháp',
    in_progress: 'Đang diễn ra',
    pending_approval: 'Chờ duyệt',
};
const meetingStatusLabel = (s) => MEETING_STATUS_LABEL[s] || s;

// Mac dinh bo loc = thang hien tai theo gio may nguoi dung (khong hard-code thang co dinh).
const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthRange = () => {
    const now = new Date();
    return {
        from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
        to:   toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useInView = (threshold = 0.12) => {
    const ref = useRef(null);
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

// ─── Primitive components ─────────────────────────────────────────────────────

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

const PulseSkeleton = ({ height = 220 }) => (
    <div className="animate-pulse rounded-xl" style={{ background: D.borderSub, minHeight: height }} />
);

const EmptyState = ({ message = 'Không có dữ liệu' }) => (
    <div className="h-full flex flex-col items-center justify-center gap-2 py-6" style={{ color: D.muted2 }}>
        <ShieldAlert className="w-8 h-8 opacity-30" />
        <p className="text-xs">{message}</p>
    </div>
);

const DonutLegend = ({ data }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px', paddingTop: 8 }}>
        {data.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: D.text }}>
                    {d.name}&nbsp;<span style={{ fontWeight: 400, color: D.muted }}>({d.value})</span>
                </span>
            </div>
        ))}
    </div>
);

const BarTooltip = ({ active, payload, label, unit = '' }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 130, pointerEvents: 'none', boxShadow: D.shadowSm }}>
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
        <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 14px', pointerEvents: 'none', boxShadow: D.shadowSm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.payload?.color || d.fill, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>{d.name}</span>
            </div>
            <p style={{ fontSize: 11, color: D.muted, paddingLeft: 18 }}>{d.value} · {((d.percent || 0) * 100).toFixed(1)}%</p>
        </div>
    );
};

const ActiveSlice = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 8}
            startAngle={startAngle} endAngle={endAngle} fill={fill}
            style={{ filter: `drop-shadow(0 0 8px ${fill}80)` }} />
    );
};

// ─── Chart Card wrappers ──────────────────────────────────────────────────────

const ChartCard = ({ title, sub, delay = 0, renderChart, accent = D.cyan }) => {
    const [ref, inView] = useInView(0.1);
    return (
        <div ref={ref}
            style={{ background: D.cardBg, border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', boxShadow: D.shadow, position: 'relative', overflow: 'hidden', transitionDelay: inView ? `${delay}ms` : '0ms' }}
            className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${accent}44 50%, transparent 100%)` }} />
            <div style={{ position: 'absolute', top: -60, left: -30, width: 160, height: 160, borderRadius: '50%', opacity: 0.04, background: accent, filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ marginBottom: 14, flexShrink: 0, position: 'relative' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.1px' }}>{title}</h3>
                {sub && <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>{sub}</p>}
            </div>
            <div style={{ flex: 1 }}>{renderChart(inView)}</div>
        </div>
    );
};

const GChartCard = ({ title, sub, delay = 0, accent = D.cyan, loading, empty, emptyMsg, children }) => {
    const [ref, inView] = useInView(0.1);
    return (
        <div ref={ref}
            style={{ background: D.cardBg, border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', boxShadow: D.shadow, position: 'relative', overflow: 'hidden', transitionDelay: inView ? `${delay}ms` : '0ms' }}
            className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${accent}44 50%, transparent 100%)` }} />
            <div style={{ position: 'absolute', top: -60, left: -30, width: 160, height: 160, borderRadius: '50%', opacity: 0.04, background: accent, filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ marginBottom: 14, flexShrink: 0, position: 'relative' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{title}</h3>
                {sub && <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>{sub}</p>}
            </div>
            <div style={{ flex: 1, minHeight: 220 }}>
                {!inView || loading ? <PulseSkeleton /> : empty ? <EmptyState message={emptyMsg} /> : children}
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
        <div ref={ref}
            style={{ background: D.cardBg, border: `1px solid ${D.border}`, borderRadius: 16, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden', boxShadow: D.shadowSm, transitionDelay: inView ? `${delay}ms` : '0ms' }}
            className={`transition-all duration-600 ease-out cursor-default hover:scale-[1.025] ${inView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`}
        >
            <div style={{ position: 'absolute', top: -24, right: -24, width: 90, height: 90, borderRadius: '50%', opacity: 0.07, background: iconColor, filter: 'blur(24px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, lineHeight: 1.45, paddingRight: 8 }}>{label}</p>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${iconColor}15`, border: `1px solid ${iconColor}35` }}>
                    <Icon style={{ width: 17, height: 17, color: iconColor }} />
                </div>
            </div>
            <p style={{ fontSize: 27, fontWeight: 800, color: D.text, letterSpacing: '-0.8px', lineHeight: 1 }} className="tabular-nums">
                {displayValue}
            </p>
            {progress !== undefined && (
                <div style={{ marginTop: 10, height: 3, borderRadius: 99, background: D.borderSub }}>
                    <div style={{ height: 3, borderRadius: 99, width: inView ? `${Math.min(progress, 100)}%` : '0%', background: `linear-gradient(90deg, ${iconColor}, ${iconColor}70)`, transition: 'width 1.1s cubic-bezier(.22,1,.36,1)' }} />
                </div>
            )}
            {sub && <p style={{ fontSize: 11, marginTop: 8, fontWeight: 500, color: subColor || D.muted }}>{sub}</p>}
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const DashBoard = () => {
    const userStr = localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const [activeTab, setActiveTab] = useState('overview');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [formError, setFormError] = useState(null);

    // ── Campus / Security data ────────────────────────────────────────────────
    const [campusLoading, setCampusLoading] = useState(true);
    const [kpi, setKpi] = useState({
        gateEventsToday: 0, alertsNew: 0, zonesActive: 0, zonesTotal: 0,
        devicesOnline: 0, devicesTotal: 0, devicesOffline: 0, vehicleHitsToday: 0,
    });
    const [severityData,    setSeverityData]    = useState([]);
    const [trafficData,     setTrafficData]     = useState([]);
    const [recentAlerts,    setRecentAlerts]    = useState([]);
    const [vehicleWatchlist, setVehicleWatchlist] = useState([]);
    const [recentGateAccess, setRecentGateAccess] = useState([]);
    const [alertTrendGCData, setAlertTrendGCData] = useState(null);
    const [alertTrendTotal,  setAlertTrendTotal]  = useState(0);
    const [auditHourlyData,  setAuditHourlyData]  = useState([]);
    const [auditTotal,       setAuditTotal]       = useState(0);
    const [activeSeverityIdx, setActiveSeverityIdx] = useState(null);

    // ── Meeting / Room data ───────────────────────────────────────────────────
    const [meetLoading, setMeetLoading] = useState(true);
    const [fromDate, setFromDate] = useState(() => monthRange().from);
    const [toDate,   setToDate]   = useState(() => monthRange().to);
    const [selectedDept,     setSelectedDept]     = useState('');
    const [departmentsList,  setDepartmentsList]  = useState([]);
    const [stats,            setStats]            = useState({ meetingCount: 0, activeRooms: 0, utilizationRate: 0, noShowRate: 0, onTimeRate: 0 });
    const [roomStats,        setRoomStats]        = useState([]);
    const [attendanceData,   setAttendanceData]   = useState([]);
    const [activeAttIdx,     setActiveAttIdx]     = useState(null);
    const [meetingsTrend,    setMeetingsTrend]    = useState([]);
    const [statusBreakdown,  setStatusBreakdown]  = useState([]);
    const [avgDuration,      setAvgDuration]      = useState({});
    const [cancelRateStats,  setCancelRateStats]  = useState({ cancelRate: 0 });
    const [noShowTrend,      setNoShowTrend]      = useState([]);
    const [isExporting,      setIsExporting]      = useState(false);
    const [exportForm,       setExportForm]       = useState({
        format: 'xlsx', sections: ['overview', 'rooms', 'attendance', 'no_show'], delivery: 'download',
    });

    // ── Load departments ──────────────────────────────────────────────────────
    useEffect(() => {
        getDepartments({ limit: 100 })
            .then(r => { if (r?.success) setDepartmentsList(r.data || []); })
            .catch(() => setDepartmentsList([]));
    }, []);

    // ── Fetch campus / security data ──────────────────────────────────────────
    const fetchCampusData = useCallback(async () => {
        setCampusLoading(true);
        const now        = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

        const [
            summaryRes, devicesRes, alertsRes, trafficRes,
            blocklistRes, gateHistoryRes, trendRes, auditRes,
        ] = await Promise.allSettled([
            getBusinessAdminSummary(),
            getDevices({ limit: 100 }),
            getSecurityAlerts({ status: 'new', limit: 5 }),
            getAdminVehicleTrafficStats({ from: todayStart.toISOString(), to: todayEnd.toISOString(), group_by: 'hour' }),
            getVehicleControlList({ list_type: 'blocklist', active: true, limit: 100 }),
            getAdminGateAccessHistory({ from: todayStart.toISOString(), to: todayEnd.toISOString(), limit: 5 }),
            getSecurityAlertsDailyTrend({ days: 7 }),
            getAuditActivityHourly({}, { skipToast: true }),
        ]);

        // Devices
        let devList = [];
        if (devicesRes.status === 'fulfilled' && devicesRes.value?.success) devList = devicesRes.value.data || [];
        const online  = devList.filter(d => d.status === 'online').length;
        const offline = devList.filter(d => ['offline', 'disabled', 'maintenance'].includes(d.status)).length;

        // Summary
        let gateToday = 0, zonesActive = 0, zonesTotal = 0, vehicleHits = 0;
        if (summaryRes.status === 'fulfilled' && summaryRes.value?.success) {
            const s = summaryRes.value.data;
            gateToday   = s.gateTrafficToday?.entriesToday || 0;
            zonesActive = s.zoneOccupancy?.zonesWithDataCount || 0;
            zonesTotal  = s.zoneOccupancy?.totalZoneCount    || 0;
            vehicleHits = s.vehicleControlHitsToday || 0;
            const sev   = s.securityAlertsBySeverity;
            if (sev) {
                setSeverityData(Object.entries(sev).filter(([, v]) => v > 0).map(([key, value]) => ({
                    name: SEVERITY_LABEL[key] || key, value, color: SEVERITY_COLORS[key] || '#94A3B8',
                })));
            }
        }

        // Alerts
        let alertsNew = 0;
        if (alertsRes.status === 'fulfilled' && alertsRes.value?.success) {
            alertsNew = alertsRes.value.meta?.total || (alertsRes.value.data || []).length;
            setRecentAlerts((alertsRes.value.data || []).slice(0, 5));
        } else {
            setRecentAlerts([]);
        }

        setKpi({ gateEventsToday: gateToday, alertsNew, zonesActive, zonesTotal, devicesOnline: online, devicesTotal: devList.length, devicesOffline: offline, vehicleHitsToday: vehicleHits });

        // Traffic
        if (trafficRes.status === 'fulfilled' && trafficRes.value?.success) {
            setTrafficData(mapVehicleTrafficSeries(trafficRes.value));
        } else {
            setTrafficData([]);
        }

        // Blocklist
        if (blocklistRes.status === 'fulfilled' && blocklistRes.value?.success) {
            setVehicleWatchlist((blocklistRes.value.data || []).slice(0, 5));
        }

        // Gate history
        if (gateHistoryRes.status === 'fulfilled' && gateHistoryRes.value?.success) {
            setRecentGateAccess((gateHistoryRes.value.data || []).slice(0, 5));
        }

        // Alert trend 7d — tận dụng từ sysadmin API (graceful nếu 403)
        if (trendRes.status === 'fulfilled' && trendRes.value?.success) {
            const series = trendRes.value.data?.series || [];
            if (series.length > 0) {
                const header = ['Ngày', ...ALERT_TYPE_LABELS];
                const rows = series.map(s => [
                    s.date ? s.date.slice(5).replace('-', '/') : '',
                    ...ALERT_TYPE_KEYS.map(k => s.byType?.[k] || 0),
                ]);
                setAlertTrendGCData([header, ...rows]);
                setAlertTrendTotal(trendRes.value.data?.totalInPeriod || 0);
            }
        }

        // Audit hourly — tận dụng từ sysadmin API (graceful nếu 403)
        if (auditRes.status === 'fulfilled' && auditRes.value?.success) {
            const buckets = auditRes.value.data?.buckets || [];
            setAuditTotal(auditRes.value.data?.totalToday || 0);
            if (buckets.length > 0) {
                setAuditHourlyData(buckets.map(b => ({
                    hour: typeof b.hour === 'number' ? String(b.hour).padStart(2, '0') + 'h' : String(b.hour ?? '').slice(0, 2) + 'h',
                    count: b.count ?? 0,
                })));
            }
        }

        setLastUpdated(new Date());
        setCampusLoading(false);
    }, []);

    // ── Fetch meeting / room data ─────────────────────────────────────────────
    const fetchMeetingData = useCallback(async () => {
        setMeetLoading(true);
        const params = { from: fromDate, to: toDate, departmentId: selectedDept || undefined };
        // Thong ke diem danh luon theo thang hien tai (doc lap voi bo loc from/to o tren).
        const attParams  = monthRange();

        const [overviewRes, roomRes, attendanceRes, trendRes, breakdownRes, durationRes, cancelRes, noShowRes] =
            await Promise.allSettled([
                getDashboardOverview(params),
                getRoomAnalytics(params),
                getAttendanceAnalytics(attParams),
                getMeetingsCountByPeriod({ ...params, granularity: 'week' }),
                getMeetingStatusBreakdown(params),
                getAverageMeetingDuration(params),
                getMeetingCancelRate(params),
                getNoShowStats({ ...params, rankBy: 'room' }),
            ]);

        if (overviewRes.status === 'fulfilled' && overviewRes.value?.success) {
            setStats(overviewRes.value.data);
        } else {
            setStats({ meetingCount: 0, activeRooms: 0, utilizationRate: 0, noShowRate: 0, onTimeRate: 0 });
        }

        if (roomRes.status === 'fulfilled' && roomRes.value?.success) {
            const rooms = roomRes.value.data?.rooms || [];
            setRoomStats(rooms.slice(0, 8).map(r => ({
                name: (r.roomName || r.room_name || '').replace(/^Phòng\s+/i, '') || '—',
                rate: +(parseFloat(r.reservationUtilizationRate || 0).toFixed(1)),
                bookedHours: r.bookedHours || 0,
                actualHours: r.actualHours || 0,
            })));
        } else {
            setRoomStats([]);
        }

        if (attendanceRes.status === 'fulfilled' && attendanceRes.value?.success) {
            const att = attendanceRes.value.data;
            const onTime = att.onTimeCount || 0;
            const late   = att.lateCount   || 0;
            const absent = Math.max(0, (att.totalRequiredParticipants || 0) - onTime - late);
            setAttendanceData([
                { name: 'Đúng giờ', value: onTime, color: D.green },
                { name: 'Đến muộn', value: late,   color: D.amber },
                { name: 'Vắng mặt', value: absent, color: D.red },
            ].filter(d => d.value > 0));
        } else {
            setAttendanceData([]);
        }

        if (trendRes.status === 'fulfilled' && trendRes.value?.success) {
            setMeetingsTrend(trendRes.value.data?.series || []);
        } else {
            setMeetingsTrend([]);
        }

        if (breakdownRes.status === 'fulfilled' && breakdownRes.value?.success) {
            setStatusBreakdown(breakdownRes.value.data?.items || []);
        } else {
            setStatusBreakdown([]);
        }

        if (durationRes.status === 'fulfilled' && durationRes.value?.success) {
            setAvgDuration(durationRes.value.data?.summary ?? {});
        } else {
            setAvgDuration({});
        }

        if (cancelRes.status === 'fulfilled' && cancelRes.value?.success) {
            setCancelRateStats(cancelRes.value.data);
        } else {
            setCancelRateStats({ cancelRate: 0 });
        }

        if (noShowRes.status === 'fulfilled' && noShowRes.value?.success) {
            setNoShowTrend(noShowRes.value.data?.ranking?.items || []);
        } else {
            setNoShowTrend([]);
        }

        setMeetLoading(false);
    }, [fromDate, toDate, selectedDept]);

    useEffect(() => { fetchCampusData(); }, [fetchCampusData]);
    useEffect(() => { fetchMeetingData(); }, [fetchMeetingData]);

    // Export handler — 3 bước: submit job → poll đến completed → download file
    const handleExport = async (e) => {
        e.preventDefault();
        setIsExporting(true); setFormError(null); setSuccessMsg(null);
        try {
            // Bước 1: Submit job (BE trả 202 + jobId)
            const res = await exportMeetingActivity({
                from: fromDate, to: toDate, format: exportForm.format,
                scope: { departmentId: selectedDept || null, roomId: null, organizerId: null },
                sections: exportForm.sections, delivery: 'download',
            });
            if (!res?.success) {
                setFormError(res?.message || 'Không thể tạo yêu cầu xuất báo cáo.');
                return;
            }
            const jobId = res.data?.jobId;
            if (!jobId) { setFormError('Không nhận được mã tiến trình từ server.'); return; }

            setSuccessMsg('Đang tạo báo cáo, vui lòng chờ...');

            // Bước 2: Poll /background-jobs/:jobId mỗi 2 giây, tối đa 60 giây
            let fileId = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const job = await get(`/background-jobs/${jobId}`);
                const status = job?.data?.status;
                if (status === 'completed') { fileId = job.data.outputFileId; break; }
                if (status === 'failed') throw new Error(job.data?.errorMessage || 'Tạo báo cáo thất bại.');
            }
            if (!fileId) { setFormError('Hết thời gian chờ (60 giây). Vui lòng thử lại.'); return; }

            // Bước 3: Lấy downloadUrl và mở file
            setSuccessMsg('Đang chuẩn bị tải file...');
            const media = await get(`/media-files/${fileId}`);
            const url = media?.data?.downloadUrl;
            if (url) {
                window.open(url, '_blank');
                setSuccessMsg('Báo cáo đã được tải xuống thành công!');
            } else {
                setFormError('Không lấy được đường dẫn tải file. Vui lòng thử lại.');
            }
        } catch (err) {
            setFormError(err?.message || 'Lỗi khi tạo báo cáo. Vui lòng thử lại.');
        } finally {
            setIsExporting(false);
        }
    };
    const toggleSection = (key) => {
        setExportForm(prev => ({
            ...prev,
            sections: prev.sections.includes(key) ? prev.sections.filter(s => s !== key) : [...prev.sections, key],
        }));
    };

    // Nhan xet ty le dung gio phai bam theo so lieu that, khong hard-code "dat chi tieu".
    const onTimeAssessment = (() => {
        const r = stats.onTimeRate;
        if (meetLoading || r == null) return { text: 'Đang tính…', color: D.muted };
        if (r >= 80) return { text: '↑ Đạt chỉ tiêu tốt', color: '#059669' };
        if (r >= 50) return { text: '→ Cần cải thiện', color: D.amber };
        return { text: '↓ Dưới mức mong đợi', color: D.red };
    })();

    const onlinePct = kpi.devicesTotal > 0 ? (kpi.devicesOnline / kpi.devicesTotal) * 100 : 0;
    const zonePct   = kpi.zonesTotal   > 0 ? (kpi.zonesActive   / kpi.zonesTotal)   * 100 : 0;
    const monthLabel = `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const alertTrendOptions = {
        ...GC_BASE, isStacked: true, colors: ALERT_TYPE_COLORS, areaOpacity: 0.18,
        lineWidth: 2, pointSize: 5, pointShape: 'circle',
        legend: { position: 'bottom', textStyle: { color: D.muted, fontSize: 10 }, maxLines: 2 },
        chartArea: { ...GC_BASE.chartArea, height: '62%' },
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5" style={{ color: D.text }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <ScrollReveal delay={0} fromBelow={false}>
                <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'relative', overflow: 'hidden', boxShadow: D.shadow }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${D.blue} 0%, ${D.cyan}80 50%, transparent 100%)` }} />
                    <div style={{ position: 'absolute', top: -60, right: 80, width: 200, height: 200, borderRadius: '50%', opacity: 0.05, background: D.blue, filter: 'blur(50px)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: `${D.blue}12`, color: D.blue, border: `1px solid ${D.blue}30`, marginBottom: 8 }}>
                            <Activity style={{ width: 13, height: 13 }} /> Business Admin
                        </span>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: '-0.5px' }}>Xin chào, {currentUser?.fullName || 'Quản trị nghiệp vụ'} 👋</h1>
                        <p style={{ fontSize: 12, color: D.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {lastUpdated ? (
                                <>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: D.green, boxShadow: `0 0 5px ${D.green}`, display: 'inline-block', flexShrink: 0 }} />
                                    Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN')}
                                </>
                            ) : 'Đang tải dữ liệu...'}
                        </p>
                    </div>
                    <button onClick={() => { fetchCampusData(); fetchMeetingData(); }} disabled={campusLoading && meetLoading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: D.blue, color: '#fff', border: 'none', cursor: (campusLoading && meetLoading) ? 'not-allowed' : 'pointer', opacity: (campusLoading && meetLoading) ? 0.6 : 1, transition: 'all 0.2s', flexShrink: 0, boxShadow: `0 2px 8px ${D.blue}40` }}
                    >
                        <RefreshCw style={{ width: 15, height: 15 }} className={(campusLoading || meetLoading) ? 'animate-spin' : ''} />
                        Làm mới
                    </button>
                </div>
            </ScrollReveal>

            {/* ── Tab nav ─────────────────────────────────────────────────── */}
            <ScrollReveal delay={60} fromBelow={false}>
                <div className="flex bg-white p-1.5 rounded-xl border border-platinum-tint/80 shadow-sm w-fit gap-1">
                    {[
                        { key: 'overview',  label: 'Tổng quan' },
                        { key: 'meetings',  label: 'Cuộc họp & Phòng' },
                        { key: 'security',  label: 'An ninh & Khuôn viên' },
                    ].map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)}
                            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === t.key ? 'bg-action-blue text-white shadow-sm' : 'text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist/50'}`}
                        >{t.label}</button>
                    ))}
                </div>
            </ScrollReveal>

            {/* ════════════ OVERVIEW ════════════ */}
            {activeTab === 'overview' && (
                <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <KpiTile delay={0}   icon={LogIn}       label="Lượt ra/vào hôm nay"  value={campusLoading ? '—' : kpi.gateEventsToday}  sub="Qua tất cả cổng"  iconColor={D.cyan} />
                        <KpiTile delay={50}  icon={ShieldAlert} label="Cảnh báo chưa xử lý"   value={campusLoading ? '—' : kpi.alertsNew}         sub={kpi.alertsNew > 0 ? 'Cần xử lý ngay' : 'Ổn định'} iconColor={kpi.alertsNew > 0 ? D.red : D.green} subColor={kpi.alertsNew > 0 ? '#DC2626' : '#059669'} />
                        <KpiTile delay={100} icon={MapPin}      label="Khu vực giám sát"       value={campusLoading ? '—' : `${kpi.zonesActive}/${kpi.zonesTotal}`} sub="Zone có dữ liệu hôm nay" iconColor={D.purple} progress={campusLoading ? undefined : zonePct} />
                        <KpiTile delay={150} icon={Wifi}        label="Thiết bị Online"         value={campusLoading ? '—' : kpi.devicesOnline}    sub={campusLoading ? '' : `/ ${kpi.devicesTotal} thiết bị`} iconColor={D.green} progress={campusLoading ? undefined : onlinePct} />
                        <KpiTile delay={200} icon={Building2}   label="Phòng đang sử dụng"      value={meetLoading ? '—' : stats.activeRooms}      sub="Trên tổng số phòng" iconColor={D.blue} />
                        <KpiTile delay={250} icon={Car}         label="Xe khớp kiểm soát"       value={campusLoading ? '—' : kpi.vehicleHitsToday} sub={kpi.vehicleHitsToday > 0 ? 'Blocklist / Watchlist' : 'Không có khớp'} iconColor={kpi.vehicleHitsToday > 0 ? D.amber : D.muted2} subColor={kpi.vehicleHitsToday > 0 ? '#B45309' : D.muted} />
                    </div>

                    {/* Row: Severity donut + Traffic area */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <ChartCard accent={D.red} delay={0} title="Cảnh báo theo mức độ nghiêm trọng" sub="Phân bổ cảnh báo an ninh chưa xử lý"
                            renderChart={(visible) => {
                                if (!visible || campusLoading) return <PulseSkeleton />;
                                if (!severityData.length) return <EmptyState message="Không có cảnh báo nào" />;
                                const total = severityData.reduce((s, d) => s + d.value, 0);
                                return (
                                    <>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <PieChart>
                                                <Pie data={severityData} cx="50%" cy="50%" innerRadius={58} outerRadius={85} dataKey="value" paddingAngle={3}
                                                    animationBegin={100} animationDuration={900} animationEasing="ease-out"
                                                    activeIndex={activeSeverityIdx ?? undefined} activeShape={<ActiveSlice />}
                                                    onMouseEnter={(_, i) => setActiveSeverityIdx(i)} onMouseLeave={() => setActiveSeverityIdx(null)}
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
                        <ChartCard accent={D.cyan} delay={100} title="Lưu lượng phương tiện 24h" sub="Lượt vào/ra qua cổng trong ngày hôm nay"
                            renderChart={(visible) => {
                                if (!visible || campusLoading) return <PulseSkeleton />;
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
                                            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: D.axisText }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <Tooltip content={<BarTooltip />} />
                                            <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 11, fontWeight: 600, color: D.muted }}>{v}</span>} />
                                            <Area type="monotone" dataKey="Vào" stroke={D.cyan}   strokeWidth={2} fill="url(#gVao)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: D.cyan }}   animationDuration={1000} />
                                            <Area type="monotone" dataKey="Ra"  stroke={D.purple} strokeWidth={2} fill="url(#gRa)"  dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: D.purple }} animationDuration={1000} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                );
                            }}
                        />
                    </div>

                    {/* Recent alerts feed */}
                    <ScrollReveal delay={0}>
                        <div style={{ background: D.cardBg, border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px 20px 16px', boxShadow: D.shadow, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${D.red} 0%, ${D.red}44 50%, transparent 100%)` }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Cảnh báo an ninh gần đây</h3>
                                    <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>5 sự kiện chưa xử lý mới nhất</p>
                                </div>
                            </div>
                            {campusLoading ? (
                                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="animate-pulse h-14 rounded-xl" style={{ background: D.borderSub }} />)}</div>
                            ) : recentAlerts.length === 0 ? (
                                <div className="py-8 text-center">
                                    <CheckCircle style={{ width: 36, height: 36, color: D.green, margin: '0 auto 10px', opacity: 0.6 }} />
                                    <p style={{ fontSize: 13, color: D.muted, fontWeight: 500 }}>Không có cảnh báo mới — hệ thống đang ổn định.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {recentAlerts.map((alert, i) => {
                                        const sevColor = alert.severity === 'critical' ? D.red : alert.severity === 'high' ? '#f97316' : alert.severity === 'medium' ? D.amber : D.blue;
                                        return (
                                            <ScrollReveal key={alert.id} delay={i * 60} fromBelow={false}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: `1px solid ${D.border}`, borderRadius: 12, transition: 'border-color 0.2s, background 0.2s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${sevColor}40`; e.currentTarget.style.background = D.cardBg2; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = D.border; e.currentTarget.style.background = '#fff'; }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${sevColor}12`, border: `1px solid ${sevColor}30` }}>
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
                                                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: `${sevColor}12`, color: sevColor, border: `1px solid ${sevColor}30` }}>
                                                            {SEVERITY_LABEL[alert.severity] || alert.severity}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: D.muted2, whiteSpace: 'nowrap' }}>
                                                            {new Date(alert.created_at || alert.triggered_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
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
                </>
            )}

            {/* ════════════ MEETINGS & ROOMS ════════════ */}
            {activeTab === 'meetings' && (
                <>
                    {/* Filter bar */}
                    <ScrollReveal delay={0} fromBelow={false}>
                        <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px 24px', boxShadow: D.shadow, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                            {[
                                { label: 'Từ ngày', value: fromDate, set: setFromDate, type: 'date' },
                                { label: 'Đến ngày', value: toDate,  set: setToDate,   type: 'date' },
                            ].map(f => (
                                <div key={f.label} style={{ flex: 1, minWidth: 140 }}>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: D.muted, textTransform: 'uppercase', marginBottom: 6 }}>{f.label}</label>
                                    <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.text, background: '#fff', outline: 'none' }} />
                                </div>
                            ))}
                            <div style={{ flex: 1, minWidth: 160 }}>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: D.muted, textTransform: 'uppercase', marginBottom: 6 }}>Phòng ban</label>
                                <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.text, background: '#fff', outline: 'none' }}>
                                    <option value="">Tất cả phòng ban</option>
                                    {departmentsList.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                                </select>
                            </div>
                            <button onClick={fetchMeetingData} disabled={meetLoading}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: D.blue, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: `0 2px 8px ${D.blue}40`, flexShrink: 0 }}>
                                <RefreshCw style={{ width: 15, height: 15 }} className={meetLoading ? 'animate-spin' : ''} /> Lọc
                            </button>
                        </div>
                    </ScrollReveal>

                    {/* Meeting KPI tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiTile delay={0}   icon={Calendar}      label="Tổng cuộc họp"           value={meetLoading ? '—' : stats.meetingCount}    sub={`TB: ${avgDuration.actualAverageMinutes ?? avgDuration.plannedAverageMinutes ?? 0}m · Huỷ: ${cancelRateStats.cancelRate ?? 0}%`} iconColor={D.blue} />
                        <KpiTile delay={60}  icon={TrendingUp}    label="Hiệu suất phòng"           value={meetLoading ? '—' : `${stats.utilizationRate}%`} sub="Sử dụng trung bình" iconColor={D.purple} />
                        <KpiTile delay={120} icon={Clock}         label="Tham gia đúng giờ"         value={meetLoading ? '—' : `${stats.onTimeRate}%`}  sub={onTimeAssessment.text} iconColor={D.green} subColor={onTimeAssessment.color} />
                        <KpiTile delay={180} icon={AlertTriangle} label="Tỷ lệ đặt phòng vắng mặt" value={meetLoading ? '—' : `${stats.noShowRate}%`}   sub="Phòng tự giải phóng" iconColor={D.red} />
                    </div>

                    {/* Meeting trend + Status donut */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <ChartCard accent={D.blue} delay={0} title="Biến động cuộc họp theo tuần" sub="Số lượng cuộc họp và hiệu suất phòng"
                            renderChart={(visible) => {
                                if (!visible || meetLoading) return <PulseSkeleton height={260} />;
                                if (!meetingsTrend.length) return <EmptyState message="Không có dữ liệu xu hướng" />;
                                return (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <AreaChart data={meetingsTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="cMeet" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%"  stopColor={D.blue} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={D.blue} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.grid} />
                                            <XAxis dataKey="period" tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<BarTooltip />} />
                                            <Area type="monotone" dataKey="count" stroke={D.blue} strokeWidth={2} fillOpacity={1} fill="url(#cMeet)" name="Số cuộc họp" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: D.blue }} animationDuration={1000} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                );
                            }}
                        />
                        <ChartCard accent={D.purple} delay={100} title="Trạng thái cuộc họp" sub="Tỷ lệ phân phối theo trạng thái"
                            renderChart={(visible) => {
                                if (!visible || meetLoading) return <PulseSkeleton height={260} />;
                                if (!statusBreakdown.length) return <EmptyState message="Không có dữ liệu trạng thái" />;
                                return (
                                    <>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <PieChart>
                                                <Pie data={statusBreakdown.map(i => ({ ...i, label: meetingStatusLabel(i.status) }))} nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="count" animationBegin={100} animationDuration={900}>
                                                    {statusBreakdown.map((_, idx) => <Cell key={idx} fill={STATUS_COLORS[idx % STATUS_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                                            {statusBreakdown.map((item, idx) => (
                                                <div key={item.status} className="flex items-center gap-1.5">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[idx % STATUS_COLORS.length] }} />
                                                    <span style={{ color: D.muted, fontSize: 11 }} className="truncate">{meetingStatusLabel(item.status)}: {item.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            }}
                        />
                        <ChartCard accent={D.green} delay={200} title="Phân tích điểm danh" sub={monthLabel}
                            renderChart={(visible) => {
                                if (!visible || meetLoading) return <PulseSkeleton height={260} />;
                                if (!attendanceData.length) return <EmptyState message="Không có dữ liệu điểm danh" />;
                                const total = attendanceData.reduce((s, d) => s + d.value, 0);
                                return (
                                    <>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <PieChart>
                                                <Pie data={attendanceData} cx="50%" cy="50%" innerRadius={58} outerRadius={85} dataKey="value" paddingAngle={3} animationBegin={100} animationDuration={900}
                                                    activeIndex={activeAttIdx ?? undefined} activeShape={<ActiveSlice />}
                                                    onMouseEnter={(_, i) => setActiveAttIdx(i)} onMouseLeave={() => setActiveAttIdx(null)}
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

                    {/* Room bar + No-show */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <ChartCard accent={D.amber} delay={0} title="Tỷ lệ sử dụng phòng họp" sub={monthLabel}
                            renderChart={(visible) => {
                                if (!visible || meetLoading) return <PulseSkeleton height={260} />;
                                if (!roomStats.length) return <EmptyState message="Không có dữ liệu phòng họp" />;
                                return (
                                    <ResponsiveContainer width="100%" height={Math.max(200, roomStats.length * 36)}>
                                        <BarChart data={roomStats} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={D.grid} horizontal={false} />
                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: D.axisText }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<BarTooltip unit="%" />} />
                                            <Bar dataKey="rate" name="Sử dụng" radius={[0, 4, 4, 0]} animationDuration={900}>
                                                {roomStats.map((e, i) => <Cell key={i} fill={e.rate >= 80 ? D.green : e.rate >= 50 ? D.cyan : D.amber} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                );
                            }}
                        />

                        {/* No-show per room */}
                        <ChartCard accent={D.red} delay={100} title="Tỷ lệ đặt phòng vắng mặt" sub="Phòng tự giải phóng do không phát hiện người"
                            renderChart={(visible) => {
                                if (!visible || meetLoading) return <PulseSkeleton height={260} />;
                                if (!noShowTrend.length) return <EmptyState message="Không có dữ liệu vắng mặt" />;
                                return (
                                    <div className="space-y-4 pt-2">
                                        {noShowTrend.map(room => (
                                            <div key={room.id ?? room.name} className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-semibold">
                                                    <span style={{ color: D.text }}>{room.name}</span>
                                                    <span style={{ color: D.red }}>{room.noShowRate}%</span>
                                                </div>
                                                <div style={{ width: '100%', background: D.borderSub, height: 6, borderRadius: 99, overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(room.noShowRate, 100)}%`, height: '100%', background: D.red, borderRadius: 99, transition: 'width 1s cubic-bezier(.22,1,.36,1)' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }}
                        />

                        {/* Quick actions + Export */}
                        <ScrollReveal delay={200}>
                            <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px', boxShadow: D.shadow, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${D.blue} 0%, ${D.blue}44 50%, transparent 100%)` }} />
                                {/* Export form */}
                                <form onSubmit={handleExport} className="space-y-3">
                                    <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Sliders style={{ width: 15, height: 15, color: D.blue }} /> Xuất báo cáo
                                    </h3>
                                    {formError && <p style={{ fontSize: 12, color: D.red }}>{formError}</p>}
                                    {successMsg && <p style={{ fontSize: 12, color: D.green }}>{successMsg}</p>}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { key: 'format',   label: 'Định dạng', options: [{ v: 'xlsx', l: 'Excel (.xlsx)' }, { v: 'pdf', l: 'PDF (.pdf)' }] },
                                        ].map(f => (
                                            <div key={f.key}>
                                                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: D.muted, textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</label>
                                                <select value={exportForm[f.key]} onChange={e => setExportForm({ ...exportForm, [f.key]: e.target.value })}
                                                    style={{ width: '100%', padding: '6px 10px', border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12, color: D.text, background: '#fff', outline: 'none' }}>
                                                    {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[{ key: 'overview', l: 'Tổng quan' }, { key: 'rooms', l: 'Phòng họp' }, { key: 'attendance', l: 'Điểm danh' }, { key: 'no_show', l: 'Vắng mặt' }].map(s => (
                                            <label key={s.key} className="flex items-center gap-2 cursor-pointer text-xs font-semibold" style={{ color: D.text }}>
                                                <input type="checkbox" checked={exportForm.sections.includes(s.key)} onChange={() => toggleSection(s.key)}
                                                    className="rounded text-action-blue focus:ring-action-blue w-3.5 h-3.5" />
                                                {s.l}
                                            </label>
                                        ))}
                                    </div>
                                    <button type="submit" disabled={isExporting || exportForm.sections.length === 0}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: D.blue, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: `0 2px 6px ${D.blue}40`, opacity: (isExporting || exportForm.sections.length === 0) ? 0.5 : 1, transition: 'all 0.2s' }}>
                                        {isExporting ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Đang xuất...</> : <><Download style={{ width: 14, height: 14 }} /> Xuất báo cáo</>}
                                    </button>
                                </form>
                            </div>
                        </ScrollReveal>
                    </div>
                </>
            )}

            {/* ════════════ SECURITY & CAMPUS ════════════ */}
            {activeTab === 'security' && (
                <>
                    {/* Security KPI tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiTile delay={0}   icon={ShieldAlert} label="Cảnh báo mới"                   value={campusLoading ? '—' : kpi.alertsNew}         sub={kpi.alertsNew > 0 ? 'Chưa xử lý' : 'Ổn định'} iconColor={kpi.alertsNew > 0 ? D.red : D.green} subColor={kpi.alertsNew > 0 ? '#DC2626' : '#059669'} />
                        <KpiTile delay={60}  icon={Car}         label="Xe trong blocklist"               value={campusLoading ? '—' : kpi.vehicleHitsToday}  sub="Khớp hôm nay" iconColor={D.amber} />
                        <KpiTile delay={120} icon={LogIn}       label="Tổng lượt ra/vào hôm nay"         value={campusLoading ? '—' : kpi.gateEventsToday}   sub="Qua tất cả cổng" iconColor={D.cyan} />
                        <KpiTile delay={180} icon={Wifi}        label="Thiết bị Online"                  value={campusLoading ? '—' : kpi.devicesOnline}     sub={`Offline: ${kpi.devicesOffline}`} iconColor={D.green} progress={campusLoading ? undefined : onlinePct} />
                    </div>

                    {/* Alert trend 7d (sysadmin API) + Audit hourly (sysadmin API) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <GChartCard accent={D.red} delay={0} title="Xu hướng cảnh báo an ninh 7 ngày"
                            sub={alertTrendTotal > 0 ? `Tổng ${alertTrendTotal} sự kiện · phân loại theo loại` : 'Dữ liệu từ Security Alerts API'}
                            loading={campusLoading} empty={!alertTrendGCData || alertTrendGCData.length <= 1}
                            emptyMsg="Không có dữ liệu xu hướng cảnh báo (có thể cần quyền truy cập)"
                        >
                            <Chart chartType="AreaChart" width="100%" height="240px" data={alertTrendGCData}
                                options={{ ...GC_BASE, isStacked: true, colors: ALERT_TYPE_COLORS, areaOpacity: 0.18, lineWidth: 2, pointSize: 5, legend: { position: 'bottom', textStyle: { color: D.muted, fontSize: 10 }, maxLines: 2 }, chartArea: { ...GC_BASE.chartArea, height: '62%' } }}
                                loader={<PulseSkeleton />} />
                        </GChartCard>

                        <ChartCard accent={D.blue} delay={100} title="Hoạt động hệ thống theo giờ"
                            sub={auditTotal > 0 ? `Hôm nay · ${auditTotal} thao tác audit log` : 'Dữ liệu từ Audit Activity API'}
                            renderChart={(visible) => {
                                if (!visible || campusLoading) return <PulseSkeleton />;
                                if (!auditHourlyData.length) return <EmptyState message="Không có dữ liệu audit (có thể cần quyền truy cập)" />;
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

                    {/* Vehicle watchlist + Gate history */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <ScrollReveal delay={0}>
                            <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px', boxShadow: D.shadow, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${D.amber} 0%, ${D.amber}44 50%, transparent 100%)` }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <div>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Danh sách xe cần chú ý</h3>
                                        <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>Blocklist đang hiệu lực</p>
                                    </div>
                                </div>
                                {campusLoading ? (
                                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="animate-pulse h-12 rounded-xl" style={{ background: D.borderSub }} />)}</div>
                                ) : vehicleWatchlist.length === 0 ? (
                                    <div className="py-6 text-center"><p style={{ fontSize: 13, color: D.muted }}>Không có xe trong danh sách kiểm soát.</p></div>
                                ) : vehicleWatchlist.map(v => (
                                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 8, background: D.cardBg2, border: `1px solid ${D.border}`, borderRadius: 10 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.plate_raw}</p>
                                            <p style={{ fontSize: 11, color: D.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.reason}</p>
                                        </div>
                                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 700, background: v.list_type === 'blocklist' ? '#FEF2F2' : '#FFF7ED', color: v.list_type === 'blocklist' ? D.red : '#C2410C', flexShrink: 0, marginLeft: 10 }}>
                                            {v.list_type}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </ScrollReveal>

                        <ScrollReveal delay={100}>
                            <div style={{ background: '#fff', border: `1px solid ${D.border}`, borderRadius: 16, padding: '20px', boxShadow: D.shadow, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${D.cyan} 0%, ${D.cyan}44 50%, transparent 100%)` }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <div>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Lịch sử ra vào gần đây</h3>
                                        <p style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>Hôm nay · Tất cả cổng</p>
                                    </div>
                                </div>
                                {campusLoading ? (
                                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="animate-pulse h-12 rounded-xl" style={{ background: D.borderSub }} />)}</div>
                                ) : recentGateAccess.length === 0 ? (
                                    <div className="py-6 text-center"><p style={{ fontSize: 13, color: D.muted }}>Chưa có dữ liệu ra vào hôm nay.</p></div>
                                ) : recentGateAccess.map(log => (
                                    <div key={log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 8, background: D.cardBg2, border: `1px solid ${D.border}`, borderRadius: 10 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.plate_number || log.user_name || 'Không xác định'}</p>
                                            <p style={{ fontSize: 11, color: D.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.zone_name || ''}</p>
                                        </div>
                                        <span style={{ fontSize: 11, color: D.muted2, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 10 }}>
                                            {log.access_time ? new Date(log.access_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </ScrollReveal>
                    </div>
                </>
            )}
        </div>
    );
};

export default DashBoard;
