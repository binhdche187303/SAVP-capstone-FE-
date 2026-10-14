import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Car, Clock, LogIn, LogOut, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { getSecurityAlerts } from '../../service/securityAlertService';
import { getAdminGateAccessLogs } from '../../service/sysAdminServices';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';

// Bảng điều khiển trực cổng — dữ liệu thật: cảnh báo an ninh chờ xử lý + log ra vào cổng hôm nay.
const REFRESH_MS = 15000;
const SEVERITY_CLS = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

const formatTime = (value) => (value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--');

const StatCard = ({ icon: Icon, label, value, tone, to }) => {
    const body = (
        <div className={`rounded-2xl border p-5 bg-white shadow-sm-2 flex items-center gap-4 ${to ? 'hover:border-action-blue transition-colors' : ''}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tone}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-xs font-semibold text-slate-blue">{label}</p>
                <p className="text-2xl font-bold text-midnight-indigo">{value ?? '--'}</p>
            </div>
        </div>
    );
    return to ? <Link to={to} className="no-underline">{body}</Link> : body;
};

const GuardDashboard = () => {
    const [alerts, setAlerts] = useState([]);
    const [counts, setCounts] = useState({ new: null, acknowledged: null });
    const [logs, setLogs] = useState([]);
    const [traffic, setTraffic] = useState({ in: null, out: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const from = startOfToday();
        try {
            const [newRes, ackRes, logRes, inRes, outRes] = await Promise.all([
                getSecurityAlerts({ status: 'new', page: 1, limit: 8 }),
                getSecurityAlerts({ status: 'acknowledged', page: 1, limit: 8 }),
                getAdminGateAccessLogs({ from, page: 1, limit: 15 }),
                getAdminGateAccessLogs({ from, direction: 'enter', page: 1, limit: 1 }),
                getAdminGateAccessLogs({ from, direction: 'leave', page: 1, limit: 1 }),
            ]);
            setAlerts([...(newRes?.data || []), ...(ackRes?.data || [])].slice(0, 8));
            setCounts({ new: newRes?.meta?.total ?? 0, acknowledged: ackRes?.meta?.total ?? 0 });
            setLogs(logRes?.data || []);
            setTraffic({ in: inRes?.meta?.total ?? 0, out: outRes?.meta?.total ?? 0 });
        } catch (err) {
            setError(err?.message || 'Không tải được dữ liệu trực cổng.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        return () => {
            clearInterval(timer);
            unsubscribe();
        };
    }, [load]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Trực cổng</h1>
                    <p className="text-slate-blue text-sm mt-1">Cảnh báo cần xử lý và lượt ra vào cổng hôm nay · tự cập nhật mỗi 15 giây</p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </button>
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={AlertTriangle} label="Cảnh báo mới" value={counts.new} tone="bg-red-50 text-red-600" to="/guard/security-alerts?status=new" />
                <StatCard icon={Clock} label="Đang xử lý" value={counts.acknowledged} tone="bg-yellow-50 text-yellow-700" to="/guard/security-alerts?status=acknowledged" />
                <StatCard icon={LogIn} label="Lượt vào hôm nay" value={traffic.in} tone="bg-emerald-50 text-emerald-700" />
                <StatCard icon={LogOut} label="Lượt ra hôm nay" value={traffic.out} tone="bg-blue-50 text-action-blue" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <section className="xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" /> Cảnh báo cần xử lý
                        </h2>
                        <Link to="/guard/security-alerts" className="text-xs font-bold text-action-blue no-underline">Xem tất cả →</Link>
                    </div>
                    {alerts.length === 0 ? (
                        <p className="text-sm text-slate-blue py-8 text-center">Không có cảnh báo đang chờ.</p>
                    ) : (
                        <ul className="space-y-2">
                            {alerts.map(alert => (
                                <li key={alert.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-platinum-tint">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-midnight-indigo truncate">
                                            {getAlertTypeLabel(alert.alert_type)}
                                            {alert.payload_json?.plateNumber && <span className="ml-2 font-mono text-xs px-1.5 py-0.5 bg-slate-900 text-white rounded">{alert.payload_json.plateNumber}</span>}
                                        </p>
                                        <p className="text-xs text-slate-blue">
                                            {formatTime(alert.triggered_at || alert.created_at)} · {alert.status === 'new' ? 'Mới' : 'Đã tiếp nhận'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${SEVERITY_CLS[alert.severity] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                            {alert.severity || 'low'}
                                        </span>
                                        <Link to="/guard/security-alerts" className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-bold no-underline">Xử lý</Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="xl:col-span-3 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-action-blue" /> Ra vào cổng gần nhất
                        </h2>
                        <Link to="/guard/anpr" className="text-xs font-bold text-action-blue no-underline flex items-center gap-1">
                            <Car className="w-3.5 h-3.5" /> Xe vào ra →
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-blue border-b border-platinum-tint">
                                    <th className="py-2 pr-3">Giờ</th>
                                    <th className="py-2 pr-3">Hướng</th>
                                    <th className="py-2 pr-3">Người</th>
                                    <th className="py-2 pr-3">Biển số</th>
                                    <th className="py-2">Cổng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan={5} className="py-8 text-center text-slate-blue">Chưa có lượt ra vào hôm nay.</td></tr>
                                ) : logs.map(log => (
                                    <tr key={log.id} className="border-b border-platinum-tint/60 last:border-0">
                                        <td className="py-2 pr-3 font-mono text-xs">{formatTime(log.access_time)}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${log.direction === 'enter' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-action-blue'}`}>
                                                {log.direction === 'enter' ? 'Vào' : 'Ra'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-midnight-indigo font-semibold">{log.user?.full_name || <span className="text-slate-blue font-normal">Không xác định</span>}</td>
                                        <td className="py-2 pr-3 font-mono text-xs">{log.plate_number || '--'}</td>
                                        <td className="py-2 text-slate-blue">{log.zone_name || '--'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default GuardDashboard;
