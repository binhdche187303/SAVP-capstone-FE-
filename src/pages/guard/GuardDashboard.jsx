import PaginationFooter from '../../components/common/PaginationFooter';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import RefreshButton from '../../components/common/RefreshButton';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Car, Clock, LogIn, LogOut, ShieldAlert, UserCheck } from 'lucide-react';
import { acknowledgeSecurityAlert, getSecurityAlerts, resolveSecurityAlert } from '../../service/securityAlertService';
import { getAdminGateAccessLogs } from '../../service/sysAdminServices';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';
import DashboardBanner from '../../components/common/DashboardBanner';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';

const REFRESH_MS = 15000;
const SEVERITY_CLS = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};
const SEVERITY_LABEL = {
    critical: 'Nghiêm trọng',
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thấp',
};

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

const formatTime = (value) => (value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--');

const alertPayload = (alert) => alert?.payload_json || {};
const getAlertLocation = (alert) => {
    const payload = alertPayload(alert);
    return payload.zoneName || payload.zone_name || alert?.zone?.zone_name || alert?.zone_name || 'Chưa xác định';
};
const getAlertCamera = (alert) => {
    const payload = alertPayload(alert);
    return payload.cameraName || payload.camera_name || payload.cameraId || payload.camera_id || 'Chưa xác định';
};
const getAlertCameraGroup = (alert) => {
    const payload = alertPayload(alert);
    return payload.cameraGroupName || payload.camera_group_name || payload.cameraGroupId || payload.camera_group_id || 'Chưa xác định';
};
const getAlertSubject = (alert) => {
    const payload = alertPayload(alert);
    return payload.visitorName || payload.fullName || payload.visitor_name || payload.code || payload.plateNumber || null;
};

const getErrorMessage = (error) => error?.error?.message
    || error?.message
    || 'Không kết nối được backend hoặc backend từ chối thao tác.';

const StatCard = ({ icon, label, value, tone, to }) => (
    <StatisticCard icon={icon} label={label} value={value ?? '--'} tone={statisticTone(tone)} to={to} />
);

const GuardDashboard = () => {
    const [alerts, setAlerts] = useState([]);
    const [counts, setCounts] = useState({ new: null, acknowledged: null });
    const [logs, setLogs] = useState([]);
    const [traffic, setTraffic] = useState({ in: null, out: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [alertActionId, setAlertActionId] = useState(null);
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [alertPage, setAlertPage] = useState(1);
    const [alertPageSize, setAlertPageSize] = useState(10);
    const [alertTotal, setAlertTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);
    const [logPageSize, setLogPageSize] = useState(10);
    const [logTotal, setLogTotal] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const from = startOfToday();
        try {
            const [newRes, ackRes, openRes, logRes, inRes, outRes] = await Promise.all([
                getSecurityAlerts({ status: 'new', page: 1, limit: 1 }),
                getSecurityAlerts({ status: 'acknowledged', page: 1, limit: 1 }),
                getSecurityAlerts({ status: 'open', page: alertPage, limit: alertPageSize }),
                getAdminGateAccessLogs({ from, page: logPage, limit: logPageSize }),
                getAdminGateAccessLogs({ from, direction: 'enter', page: 1, limit: 1 }),
                getAdminGateAccessLogs({ from, direction: 'leave', page: 1, limit: 1 }),
            ]);
            setAlerts(openRes?.data || []);
            setAlertTotal(openRes?.meta?.total ?? 0);
            setCounts({ new: newRes?.meta?.total ?? 0, acknowledged: ackRes?.meta?.total ?? 0 });
            setLogs(logRes?.data || []);
            setLogTotal(logRes?.meta?.total ?? 0);
            setTraffic({ in: inRes?.meta?.total ?? 0, out: outRes?.meta?.total ?? 0 });
        } catch (err) {
            setError(err?.message || 'Không tải được dữ liệu trực cổng.');
        } finally {
            setLoading(false);
        }
    }, [alertPage, alertPageSize, logPage, logPageSize]);

    useEffect(() => {
        if (loading) return;
        const lastAlertPage = Math.max(1, Math.ceil(alertTotal / alertPageSize));
        const lastLogPage = Math.max(1, Math.ceil(logTotal / logPageSize));
        if (alertPage > lastAlertPage) setAlertPage(lastAlertPage);
        if (logPage > lastLogPage) setLogPage(lastLogPage);
    }, [loading, alertTotal, alertPageSize, alertPage, logTotal, logPageSize, logPage]);

    const handleAcknowledge = async (alertId) => {
        setAlertActionId(alertId);
        try {
            await acknowledgeSecurityAlert(alertId);
            await load();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setAlertActionId(null);
        }
    };

    const handleResolve = async (alert) => {
        const note = window.prompt('Nhập ghi chú xử lý cảnh báo:', 'Đã kiểm tra và xử lý tại hiện trường');
        if (note === null) return;
        if (!note.trim()) {
            setError('Vui lòng nhập ghi chú trước khi đóng cảnh báo.');
            return;
        }
        setAlertActionId(alert.id);
        try {
            await resolveSecurityAlert(alert.id, { resolution_note: note.trim() });
            await load();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setAlertActionId(null);
        }
    };

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
            <DashboardBanner roleName="Bảo vệ" />
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Trực cổng</h1>
                    <p className="text-slate-blue text-sm mt-1">Theo dõi lượt ra vào cổng hôm nay và các cảnh báo cần xử lý.</p>
                </div>
                <RefreshButton
                    type="button"
                    onClick={load}
                    disabled={loading}
                    busy={loading}
                />
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={AlertTriangle} label="Cảnh báo mới" value={counts.new} tone="bg-red-50 text-red-600" to="/guard/security-alerts?status=new" />
                <StatCard icon={Clock} label="Đang xử lý" value={counts.acknowledged} tone="bg-yellow-50 text-yellow-700" to="/guard/security-alerts?status=acknowledged" />
                <StatCard icon={LogIn} label="Lượt vào hôm nay" value={traffic.in} tone="bg-emerald-50 text-emerald-700" />
                <StatCard icon={LogOut} label="Lượt ra hôm nay" value={traffic.out} tone="bg-blue-50 text-action-blue" />
            </StatisticGrid>

            <div className="grid grid-cols-1 xl:grid-cols-5 items-start gap-6">
                <section aria-label="Ra vào cổng gần nhất" className="min-w-0 xl:col-span-3 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-action-blue" /> Ra vào cổng gần nhất
                        </h2>
                        <Link to="/guard/anpr" className="text-xs font-bold text-action-blue no-underline flex items-center gap-1">
                            <Car className="w-3.5 h-3.5" /> Xe vào ra →
                        </Link>
                    </div>
                    <div className="min-w-0">
                        <ResponsiveTable className="w-full text-sm">
<colgroup>
<col style={{ width: '14%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '34%' }} />
<col style={{ width: '21%' }} />
<col style={{ width: '21%' }} />
</colgroup>
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
                                        <td data-ui-text="primary" className="py-2 pr-3 font-mono text-xs">{formatTime(log.access_time)}</td>
                                        <td className="py-2 pr-3">
                                            <span data-ui-text="badge" className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${log.direction === 'enter' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-action-blue'}`}>
                                                {log.direction === 'enter' ? 'Vào' : 'Ra'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-midnight-indigo font-semibold">{log.user?.full_name || <span className="text-slate-blue font-normal">Không xác định</span>}</td>
                                        <td className="py-2 pr-3 font-mono text-xs">{log.plate_number || '--'}</td>
                                        <td className="py-2 text-slate-blue">{log.zone_name || '--'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </ResponsiveTable>
                    </div>
                    <PaginationFooter currentPage={logPage} totalPages={Math.max(1, Math.ceil(logTotal / logPageSize))}
                        totalItems={logTotal} pageSize={logPageSize} visibleCount={logs.length} itemLabel="lượt ra/vào"
                        onPageChange={setLogPage} onPageSizeChange={size => { setLogPageSize(size); setLogPage(1); }}
                        loading={loading} compact={false} />
                </section>

                <section aria-label="Cảnh báo cần xử lý" className="min-w-0 xl:col-span-2 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" /> Cảnh báo cần xử lý
                        </h2>
                        <Link to="/guard/visitor-alerts" className="text-xs font-bold text-action-blue no-underline">Cảnh báo khách →</Link>
                    </div>
                    {alerts.length === 0 ? (
                        <p className="text-sm text-slate-blue py-8 text-center">Không có cảnh báo đang chờ.</p>
                    ) : (
                        <ul className="space-y-2">
                            {alerts.map(alert => {
                                const payload = alertPayload(alert);
                                const subject = getAlertSubject(alert);
                                const evidenceId = alert.source_event_id || payload.sourceEventId || payload.source_event_id;
                                const busy = alertActionId === alert.id;
                                return (
                                    <li key={alert.id} className="p-3 rounded-xl border border-platinum-tint space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-midnight-indigo">
                                                    {getAlertTypeLabel(alert.alert_type)}
                                                    {subject && <span className="ml-2 font-semibold text-slate-blue">· {subject}</span>}
                                                </p>
                                                <p className="text-xs text-slate-blue mt-1">{formatTime(alert.triggered_at || alert.created_at)} · {alert.status === 'new' ? 'Mới' : 'Đã tiếp nhận'}</p>
                                            </div>
                                            <span data-ui-text="badge" className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${SEVERITY_CLS[alert.severity] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{SEVERITY_LABEL[alert.severity] || 'Thấp'}</span>
                                        </div>
                                        <div data-ui-text="secondary" className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-slate-blue">
                                            <span><b className="text-midnight-indigo">Zone/cổng:</b> {getAlertLocation(alert)}</span>
                                            <span><b className="text-midnight-indigo">Nhóm camera:</b> {getAlertCameraGroup(alert)}</span>
                                            <span><b className="text-midnight-indigo">Camera:</b> {getAlertCamera(alert)}</span>
                                        </div>
                                        {(payload.detail || payload.reason || payload.message) && <p data-ui-text="secondary" className="text-[11px] text-slate-blue">{payload.detail || payload.reason || payload.message}</p>}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {evidenceId && <button data-ui-text="action" type="button" onClick={() => setSnapshotEventId(evidenceId)} className="px-2.5 py-1.5 rounded-lg border border-platinum-tint text-[11px] font-bold text-slate-blue hover:text-action-blue">Xem ảnh bằng chứng</button>}
                                            {alert.status === 'new' && <button data-ui-text="action" type="button" disabled={busy} onClick={() => handleAcknowledge(alert.id)} className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold disabled:opacity-60">{busy ? 'Đang xử lý...' : 'Tiếp nhận'}</button>}
                                            {alert.status === 'acknowledged' && <button data-ui-text="action" type="button" disabled={busy} onClick={() => handleResolve(alert)} className="px-2.5 py-1.5 rounded-lg bg-action-blue text-white text-[11px] font-bold disabled:opacity-60">{busy ? 'Đang xử lý...' : 'Đóng cảnh báo'}</button>}
                                            <Link to="/guard/security-alerts" className="px-2.5 py-1.5 rounded-lg border border-action-blue/30 text-action-blue text-[11px] font-bold no-underline">Mở trung tâm</Link>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <PaginationFooter currentPage={alertPage} totalPages={Math.max(1, Math.ceil(alertTotal / alertPageSize))}
                        totalItems={alertTotal} pageSize={alertPageSize} visibleCount={alerts.length} itemLabel="cảnh báo"
                        onPageChange={setAlertPage} onPageSizeChange={size => { setAlertPageSize(size); setAlertPage(1); }}
                        loading={loading} compact={false} />
                </section>

            </div>
            <EventSnapshotModal
                isOpen={Boolean(snapshotEventId)}
                eventId={snapshotEventId}
                onClose={() => setSnapshotEventId(null)}
            />
        </div>
    );
};

export default GuardDashboard;
