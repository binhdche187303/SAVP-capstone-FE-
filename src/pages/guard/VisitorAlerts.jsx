import '../../components/security/AlertFilters.css';
import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import { buildSecurityAlertQuery } from '../../utils/securityAlertFilters';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard from '../../components/common/StatisticCard';
import FilterBar from '../../components/common/FilterBar';
import RefreshButton from '../../components/common/RefreshButton';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { UserRound, Filter } from 'lucide-react';
import { acknowledgeSecurityAlert, getSecurityAlerts, resolveSecurityAlert } from '../../service/securityAlertService';
import { getDeskToday, getVisitorLookups } from '../../service/visitorService';
import { VISITOR_MOCK_ENABLED } from '../../config/featureFlags';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';
import { subscribeToVisitorAlertChanges } from '../../utils/visitorRealtime';
import { hasPermission } from '../../utils/permissionUtils';
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import VisitDetailDrawer from '../../components/visitor/VisitDetailDrawer';
import DemoDataBanner from '../../components/common/DemoDataBanner';
import SimpleModal from '../../components/common/SimpleModal';

const VISITOR_ALERT_TYPES = ['visitor_overstay', 'visitor_must_leave', 'visitor_zone_violation'];

const formatTime = (value) => value
    ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' })
    : '—';

const currentActorName = () => {
    try {
        const user = JSON.parse(window.localStorage.getItem('user') || '{}');
        return user.fullName || user.full_name || user.name || user.email || 'Bảo vệ đang đăng nhập';
    } catch {
        return 'Bảo vệ đang đăng nhập';
    }
};

const getPayload = (alert) => alert?.payload_json || {};
const getEvidenceId = (alert) => alert?.source_event_id || getPayload(alert).sourceEventId || getPayload(alert).source_event_id;

const buildDemoAlerts = (desk) => {
    const attention = desk?.data?.attention || [];
    const deskItems = (desk?.data?.items || []).slice(0, 3).map((visit, index) => ({
            kind: index === 0 ? 'overstay' : index === 1 ? 'must_leave' : 'zone_violation',
            since: visit.lastSeen?.at || visit.scheduledFrom || new Date().toISOString(),
            note: index === 0 ? 'Khách đã vượt quá thời gian được phép.' : index === 1 ? 'Khách cần được kiểm tra trước khi rời trường.' : 'Phát hiện khách ở ngoài khu vực được phép.',
            visit,
        }));
    const fallbackItems = attention.length > 0 ? attention : deskItems.length > 0 ? deskItems : [{
            kind: 'zone_violation',
            since: new Date().toISOString(),
            note: 'Dữ liệu minh họa: cần kiểm tra khách tại cổng.',
            visit: {
                id: 'demo-visit-alert-001',
                code: 'VIS-DEMO-001',
                visitor: { fullName: 'Khách minh họa' },
                lastSeen: { zoneName: 'Cổng chính' },
            },
        }];

    return fallbackItems.map((item, index) => {
        const visit = item.visit || item;
        const visitor = visit.visitor || {};
        const lastSeen = visit.lastSeen || {};
        return {
            id: `demo-visitor-alert-${visit.id}-${index}`,
            alert_type: item.kind === 'overstay' ? 'visitor_overstay' : item.kind === 'must_leave' ? 'visitor_must_leave' : 'visitor_zone_violation',
            severity: item.kind === 'must_leave' ? 'high' : 'medium',
            status: 'new',
            triggered_at: item.since || new Date().toISOString(),
            occurrence_count: 1,
            payload_json: {
                visitId: visit.id,
                visitorName: visitor.fullName,
                code: visit.code,
                detail: item.note || lastSeen.zoneName || 'Cần kiểm tra tại cổng',
                zoneName: lastSeen.zoneName || visit.zoneNames?.[0],
            },
            isDemo: true,
        };
    });
};

const statusLabel = {
    new: 'Chưa tiếp nhận',
    acknowledged: 'Đang xử lý',
    resolved: 'Đã xử lý',
};

const severityMeta = {
    critical: { label: 'Nghiêm trọng', className: 'bg-red-100 text-red-800 border-red-300' },
    urgent: { label: 'Khẩn cấp', className: 'bg-red-50 text-red-700 border-red-200' },
    high: { label: 'Cao', className: 'bg-orange-100 text-orange-800 border-orange-300' },
    medium: { label: 'Trung bình', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    low: { label: 'Thấp', className: 'bg-blue-50 text-blue-700 border-blue-200' },
};

const resolutionOptions = {
    visitor_must_leave: [
        'Đã liên hệ và hướng dẫn khách rời khuôn viên',
        'Đã bàn giao cho bảo vệ tại cổng',
        'Khách đã rời khuôn viên',
    ],
    visitor_overstay: [
        'Đã liên hệ người tiếp đón để xác minh',
        'Đã xác nhận và ghi nhận khách rời khuôn viên',
        'Đã gia hạn thời gian cho khách',
    ],
    visitor_zone_violation: [
        'Đã đưa khách về đúng khu vực được phép',
        'Đã xác minh lại quyền truy cập của khách',
        'Đã từ chối cho khách tiếp tục vào khu vực',
    ],
};

const VisitorAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [status, setStatus] = useState('all');
    const [criteria, setCriteria] = useState({ alert_type: '', severity: '', zone_id: '', from: '', to: '' });
    const loadSequence = useRef(0);
    const changeCriterion = (key, value) => setCriteria(previous => ({ ...previous, [key]: value }));
    const clearFilters = () => { setStatus('all'); setCriteria({ alert_type: '', severity: '', zone_id: '', from: '', to: '' }); };

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionId, setActionId] = useState(null);
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [zones, setZones] = useState([]);
    const [resolveModal, setResolveModal] = useState({ open: false, alert: null });
    const [resolutionNote, setResolutionNote] = useState('');
    const [acknowledgeModal, setAcknowledgeModal] = useState({ open: false, alert: null });
    const [resolutionReason, setResolutionReason] = useState('');

    const load = useCallback(async () => {
        const sequence = ++loadSequence.current;
        setLoading(true);
        setError('');
        try {
            if (VISITOR_MOCK_ENABLED) {
                const desk = await getDeskToday();
                if (sequence === loadSequence.current) setAlerts(buildDemoAlerts(desk));
                return;
            }
            const collections = await Promise.all((criteria.alert_type ? [criteria.alert_type] : VISITOR_ALERT_TYPES).map(async alertType => {
                const records = [];
                for (let page = 1; page <= 200; page += 1) {
                    const response = await getSecurityAlerts(buildSecurityAlertQuery({ ...criteria, alert_type: alertType, page, limit: 50 }));
                    if (response?.success === false) throw new Error(response.message || 'Không tải được cảnh báo khách.');
                    const items = Array.isArray(response?.data) ? response.data : response?.data?.items || [];
                    records.push(...items);
                    const pages = response?.meta?.totalPages ?? response?.data?.meta?.totalPages;
                    if ((Number.isFinite(pages) && page >= pages) || items.length < 50) return records;
                }
                throw new Error('Danh sách cảnh báo quá lớn. Vui lòng thu hẹp khoảng thời gian hoặc các tiêu chí lọc.');
            }));
            const merged = collections.flat();
            merged.sort((a, b) => new Date(b.last_seen_at || b.triggered_at || b.created_at) - new Date(a.last_seen_at || a.triggered_at || a.created_at));
            if (sequence === loadSequence.current) setAlerts(merged);
        } catch (err) {
            if (sequence === loadSequence.current) setError(err?.message || 'Không tải được cảnh báo khách.');
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }, [criteria]);

    useEffect(() => {
        getVisitorLookups().then((response) => {
            if (response?.success) setZones(response.data?.zones || []);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        load();
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        const unsubscribeMock = subscribeToVisitorAlertChanges(load);
        return () => { loadSequence.current += 1; unsubscribe(); unsubscribeMock(); };
    }, [load]);

    // Production data is filtered by the API; apply the same criteria to demo data as well.
    const scopedAlerts = useMemo(() => alerts.filter(alert => {
        if (!VISITOR_MOCK_ENABLED) return true;
        const payload = getPayload(alert);
        const time = new Date(alert.triggered_at || alert.created_at).getTime();
        const query = buildSecurityAlertQuery(criteria);
        const zone = zones.find(item => item.id === criteria.zone_id);
        return (!criteria.alert_type || alert.alert_type === criteria.alert_type)
            && (!criteria.severity || alert.severity === criteria.severity)
            && (!criteria.zone_id || alert.zone_id === criteria.zone_id || payload.zoneName === (zone?.name || zone?.zoneName || zone?.zone_name))
            && (!query.from || time >= new Date(query.from).getTime())
            && (!query.to || time <= new Date(query.to).getTime());
    }), [alerts, criteria, zones]);
    const filteredAlerts = useMemo(() => scopedAlerts.filter(alert => status === 'all'
        || (status === 'open' ? alert.status !== 'resolved' : alert.status === status)), [scopedAlerts, status]);
    const counts = useMemo(() => ({
        total: scopedAlerts.length,
        new: scopedAlerts.filter(item => item.status === 'new').length,
        acknowledged: scopedAlerts.filter(item => item.status === 'acknowledged').length,
        resolved: scopedAlerts.filter(item => item.status === 'resolved').length,
    }), [scopedAlerts]);

    const acknowledgeDemo = (id) => {
        setAlerts((current) => current.map((item) => item.id === id ? {
            ...item,
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            acknowledged_by_name: currentActorName(),
        } : item));
    };

    const openAcknowledgeModal = (alert) => {
        setAcknowledgeModal({ open: true, alert });
        setError('');
    };

    const confirmAcknowledge = async () => {
        const alert = acknowledgeModal.alert;
        if (!alert) return;
        setActionId(alert.id);
        try {
            if (alert.isDemo) acknowledgeDemo(alert.id);
            else await acknowledgeSecurityAlert(alert.id);
            setAcknowledgeModal({ open: false, alert: null });
            if (!alert.isDemo) await load();
        } catch (err) {
            setError(err?.message || 'Không thể tiếp nhận cảnh báo.');
        } finally {
            setActionId(null);
        }
    };

    const openResolveModal = (alert) => {
        setResolveModal({ open: true, alert });
        setResolutionNote('');
        setResolutionReason('');
        setError('');
    };

    const submitResolve = async (event) => {
        event.preventDefault();
        const alert = resolveModal.alert;
        const note = resolutionNote.trim();
        if (!alert || !resolutionReason) {
            setError('Vui lòng chọn phương án xử lý cảnh báo.');
            return;
        }
        const resolution = note ? `${resolutionReason}. ${note}` : resolutionReason;
        if (alert.isDemo) {
            setAlerts((current) => current.map((item) => item.id === alert.id ? {
                ...item,
                status: 'resolved',
                resolution_note: resolution,
                resolved_at: new Date().toISOString(),
                resolved_by_name: currentActorName(),
            } : item));
            setResolveModal({ open: false, alert: null });
            setStatus('all');
            return;
        }
        setActionId(alert.id);
        try {
            await resolveSecurityAlert(alert.id, { resolution_note: resolution });
            setResolveModal({ open: false, alert: null });
            setStatus('all');
            await load();
        } catch (err) {
            setError(err?.message || 'Không thể đóng cảnh báo.');
        } finally {
            setActionId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-action-blue">Bảng xử lý riêng</p>
                    <h1 className="text-2xl font-bold text-midnight-indigo mt-1">Cảnh báo khách</h1>
                    <p className="text-sm text-slate-blue mt-1">Theo dõi và xử lý riêng các trường hợp khách cần kiểm tra tại cổng hoặc trong khuôn viên.</p>
                </div>
                <RefreshButton type="button" onClick={load} disabled={loading} busy={loading} />
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            <DemoDataBanner onReset={load} />

            <StatisticGrid columns={4} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatisticCard loading={loading} label="Tổng cảnh báo khách" value={counts.total} selected={status === 'all'} onClick={() => setStatus('all')} />
                <StatisticCard loading={loading} label="Chưa tiếp nhận" value={counts.new} tone="danger" selected={status === 'new'} onClick={() => setStatus('new')} />
                <StatisticCard loading={loading} label="Đang xử lý" value={counts.acknowledged} tone="warning" selected={status === 'acknowledged'} onClick={() => setStatus('acknowledged')} />
                <StatisticCard loading={loading} label="Đã xử lý" value={counts.resolved} tone="success" selected={status === 'resolved'} onClick={() => setStatus('resolved')} />
            </StatisticGrid>

            <FilterBar data-filter-grid variant="card" className="security-alert-filters grid gap-4">
                <div className="camai-filter-field">
                    <label htmlFor="visitor-alert-status">Trạng thái</label>
                    <select id="visitor-alert-status" value={status} onChange={event => setStatus(event.target.value)}>
                        <option value="all">Tất cả trạng thái</option><option value="open">Đang mở</option>
                        <option value="new">Chưa tiếp nhận</option><option value="acknowledged">Đang xử lý</option><option value="resolved">Đã xử lý</option>
                    </select>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="visitor-alert-type">Loại cảnh báo</label>
                    <select id="visitor-alert-type" value={criteria.alert_type} onChange={event => changeCriterion('alert_type', event.target.value)}>
                        <option value="">Tất cả loại cảnh báo</option>
                        {VISITOR_ALERT_TYPES.map(type => <option key={type} value={type}>{getAlertTypeLabel(type)}</option>)}
                    </select>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="visitor-alert-severity">Mức độ</label>
                    <select id="visitor-alert-severity" value={criteria.severity} onChange={event => changeCriterion('severity', event.target.value)}>
                        <option value="">Tất cả mức độ</option>
                        {Object.entries(severityMeta).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                    </select>
                </div>
                <div className="camai-filter-field">
                    <label htmlFor="visitor-alert-zone">Vị trí</label>
                    <select id="visitor-alert-zone" value={criteria.zone_id} onChange={event => changeCriterion('zone_id', event.target.value)}>
                        <option value="">Toàn hệ thống</option>
                        {zones.map(zone => <option key={zone.id} value={zone.id}>{[zone.name || zone.zoneName || zone.zone_name, zone.building, zone.floor ? (/^(tầng|tang)/i.test(String(zone.floor)) ? zone.floor : `Tầng ${zone.floor}`) : ''].filter(Boolean).join(' · ')}</option>)}
                    </select>
                </div>
                <div className="security-alert-time-filters">
                    <CalendarRangePresets from={criteria.from} to={criteria.to} onChange={range => setCriteria(previous => ({ ...previous, ...range }))} />
                    <div className="security-alert-date-pair">
                        <div className="camai-filter-field"><label htmlFor="visitor-alert-from">Từ ngày</label><input id="visitor-alert-from" type="date" value={criteria.from} max={criteria.to || undefined} onChange={event => changeCriterion('from', event.target.value)} /></div>
                        <div className="camai-filter-field"><label htmlFor="visitor-alert-to">Đến ngày</label><input id="visitor-alert-to" type="date" value={criteria.to} min={criteria.from || undefined} onChange={event => changeCriterion('to', event.target.value)} /></div>
                    </div>
                    <div className="security-alert-reset"><button type="button" data-filter-action onClick={clearFilters} className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"><Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc</button></div>
                </div>
            </FilterBar>

            <section className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="overflow-x-auto">
                    <PaginatedCollection items={filteredAlerts} itemLabel="cảnh báo" loading={loading} resetKey={JSON.stringify({ status, ...criteria })}>
{(camaiPageItems, camaiStartIndex) => (<>
                    {loading && <p className="py-10 text-center text-sm text-slate-blue">Đang tải cảnh báo khách...</p>}
                    {!loading && filteredAlerts.length === 0 && <p className="py-10 text-center text-sm text-slate-blue">Không có cảnh báo khách phù hợp với bộ lọc.</p>}
                    {!loading && filteredAlerts.length > 0 && <ResponsiveTable className="w-full min-w-[1120px] text-left">
<colgroup>
<col style={{ width: '20%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '20%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '13%' }} />
<col style={{ width: '10%' }} />
<col style={{ width: '9%' }} />
</colgroup>
                        <thead className="bg-cloud-mist/50 border-b border-platinum-tint">
                            <tr className="text-[11px] uppercase tracking-wide text-slate-blue">
                                <th className="px-5 py-3 font-bold">Cảnh báo</th>
                                <th className="px-4 py-3 font-bold">Mức độ</th>
                                <th className="px-4 py-3 font-bold">Khách</th>
                                <th className="px-4 py-3 font-bold">Zone / cổng</th>
                                <th className="px-4 py-3 font-bold">Camera</th>
                                <th className="px-4 py-3 font-bold">Thời gian</th>
                                <th className="px-4 py-3 font-bold">Trạng thái</th>
                                <th className="px-5 py-3 font-bold text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-pale-gray">
                            {camaiPageItems.map((camaiRecord, camaiIndex) => ((alert) => {
                                const payload = getPayload(alert);
                                const evidenceId = getEvidenceId(alert);
                                const visitorPhoto = payload.visitorPhoto || payload.visitor_photo || null;
                                const busy = actionId === alert.id;
                                const severity = severityMeta[alert.severity] || severityMeta.medium;
                                return <tr key={alert.id} onClick={() => payload.visitId && setDetailId(payload.visitId)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && payload.visitId) { event.preventDefault(); setDetailId(payload.visitId); } }} tabIndex={payload.visitId ? 0 : undefined} className={`align-top hover:bg-cloud-mist/20 ${payload.visitId ? 'cursor-pointer focus:outline-none focus:bg-blue-50/40' : ''}`}>
                                    <td className="px-5 py-4"><p className="font-bold text-sm text-midnight-indigo">{getAlertTypeLabel(alert.alert_type)}</p><p className="text-xs text-slate-blue mt-1">{payload.detail || payload.reason || payload.message || 'Cần kiểm tra tại cổng'}</p></td>
                                    <td className="px-4 py-4"><span data-ui-text="badge" className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold border whitespace-nowrap ${severity.className}`}>{severity.label}</span></td>
                                    <td className="px-4 py-4 text-sm text-midnight-indigo"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-lg overflow-hidden border border-platinum-tint bg-cloud-mist/50 flex items-center justify-center shrink-0">{visitorPhoto ? <img src={visitorPhoto} alt={`Ảnh ${payload.visitorName || 'khách'}`} className="w-full h-full object-cover" /> : <UserRound className="w-5 h-5 text-slate-blue/50" />}</div><div><p className={`font-semibold ${payload.visitId ? 'hover:text-action-blue' : ''}`}>{payload.visitorName || payload.fullName || 'Chưa xác định'}</p><p className="text-xs text-slate-blue mt-1">{payload.code || '—'}</p></div></div></td>
                                    <td className="px-4 py-4 text-xs text-slate-blue">{payload.zoneName || payload.zone_name || alert.zone_name || alert.zone_id || 'Chưa xác định'}</td>
                                    <td className="px-4 py-4 text-xs text-slate-blue"><p>{payload.cameraGroupName || payload.camera_group_name || 'Chưa xác định'}</p><p className="mt-1">{payload.cameraName || payload.camera_name || payload.cameraId || 'Chưa xác định'}</p></td>
                                    <td className="px-4 py-4 text-xs text-slate-blue whitespace-nowrap">{formatTime(alert.last_seen_at || alert.triggered_at || alert.created_at)}<p className="mt-1">{alert.occurrence_count || 1} lượt</p></td>
                                    <td className="px-4 py-4"><span data-ui-text="badge" className="inline-flex px-2 py-1 rounded-md text-[11px] font-bold border bg-blue-50 text-action-blue border-blue-200 whitespace-nowrap">{statusLabel[alert.status] || alert.status}</span>{alert.acknowledged_at && <p data-ui-text="primary" className="text-[10px] text-slate-blue mt-2">Tiếp nhận: {formatTime(alert.acknowledged_at)}</p>}{(alert.acknowledged_by_name || alert.acknowledged_by) && <p data-ui-text="secondary" className="text-[10px] text-slate-blue">Bởi: {alert.acknowledged_by_name || alert.acknowledged_by}</p>}</td>
                                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><div className="flex flex-col items-end gap-2">{alert.status !== 'resolved' && <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); alert.status === 'new' ? openAcknowledgeModal(alert) : openResolveModal(alert); }} className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-bold disabled:opacity-60 whitespace-nowrap">{busy ? 'Đang xử lý...' : alert.status === 'new' ? 'Tiếp nhận' : 'Xử lý ngay'}</button>}{evidenceId && <button type="button" onClick={(event) => { event.stopPropagation(); setSnapshotEventId(evidenceId); }} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-bold text-slate-blue hover:text-action-blue whitespace-nowrap">Xem bằng chứng</button>}</div></div></td>
                                </tr>;
                            })(camaiRecord, camaiStartIndex + camaiIndex, (alerts)))}
                        </tbody>
                    </ResponsiveTable>}
</>)}
</PaginatedCollection>
                </div>
            </section>
            <EventSnapshotModal isOpen={Boolean(snapshotEventId)} eventId={snapshotEventId} onClose={() => setSnapshotEventId(null)} />
            {detailId && (
                <VisitDetailDrawer
                    deskMode
                    visitId={detailId}
                    zones={zones}
                    canExtendPermission={hasPermission(['visitor.visit.extend', 'visitor.visit.manage'])}
                    canRevokePermission={hasPermission(['visitor.visit.revoke', 'visitor.visit.manage'])}
                    onClose={() => setDetailId(null)}
                    onChanged={load}
                />
            )}
            <SimpleModal
                isOpen={resolveModal.open}
                title="Xử lý cảnh báo khách"
                onClose={() => setResolveModal({ open: false, alert: null })}
                size="md"
                footer={(
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setResolveModal({ open: false, alert: null })} className="px-4 py-2 rounded-lg border border-platinum-tint text-sm font-semibold text-slate-blue">Hủy</button>
                        <button type="submit" form="visitor-alert-resolve-form" disabled={Boolean(actionId)} className="px-4 py-2 rounded-lg bg-action-blue text-white text-sm font-bold disabled:opacity-60">{actionId ? 'Đang lưu...' : 'Xác nhận xử lý'}</button>
                    </div>
                )}
            >
                <form id="visitor-alert-resolve-form" onSubmit={submitResolve} className="space-y-4">
                    <div className="p-3 rounded-xl border border-platinum-tint bg-white">
                        <p data-ui-text="label" className="text-[11px] font-bold uppercase text-slate-blue">Loại cảnh báo</p>
                        <p className="text-sm font-bold text-midnight-indigo mt-1">{resolveModal.alert ? getAlertTypeLabel(resolveModal.alert.alert_type) : '—'}</p>
                    </div>
                    <label className="block">
                        <span className="block text-xs font-bold text-midnight-indigo mb-1">Phương án xử lý <span className="text-red-600">*</span></span>
                        <select value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} className="w-full rounded-lg border border-platinum-tint bg-white px-3 py-2.5 text-sm text-midnight-indigo outline-none focus:border-action-blue">
                            <option value="">Chọn phương án xử lý</option>
                            {(resolutionOptions[resolveModal.alert?.alert_type] || ['Đã kiểm tra và xử lý tại cổng']).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="block text-xs font-bold text-midnight-indigo mb-1">Ghi chú bổ sung <span className="font-normal text-slate-blue">(không bắt buộc)</span></span>
                        <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={3} placeholder="Nhập thêm thông tin nếu cần..." className="w-full rounded-lg border border-platinum-tint px-3 py-2 text-sm text-midnight-indigo outline-none focus:border-action-blue" />
                    </label>
                    <p data-ui-text="secondary" className="text-[11px] text-slate-blue">Phương án và ghi chú sẽ được lưu vào lịch sử xử lý cảnh báo.</p>
                </form>
            </SimpleModal>
            <SimpleModal
                isOpen={acknowledgeModal.open}
                title="Tiếp nhận cảnh báo khách"
                onClose={() => setAcknowledgeModal({ open: false, alert: null })}
                footer={(
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAcknowledgeModal({ open: false, alert: null })} className="px-4 py-2 rounded-lg border border-platinum-tint text-sm font-semibold text-slate-blue">Hủy</button>
                        <button type="button" onClick={confirmAcknowledge} disabled={Boolean(actionId)} className="px-4 py-2 rounded-lg bg-action-blue text-white text-sm font-bold disabled:opacity-60">{actionId ? 'Đang xác nhận...' : 'Xác nhận tiếp nhận'}</button>
                    </div>
                )}
            >
                <p className="text-sm text-slate-blue">Bạn xác nhận đã tiếp nhận cảnh báo này để bắt đầu kiểm tra và xử lý tại cổng?</p>
            </SimpleModal>
        </div>
    );
};

export default VisitorAlerts;
