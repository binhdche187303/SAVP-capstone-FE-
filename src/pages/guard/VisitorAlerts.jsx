import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, UserRound } from 'lucide-react';
import { acknowledgeSecurityAlert, getSecurityAlerts, resolveSecurityAlert } from '../../service/securityAlertService';
import { getDeskToday, getVisitorLookups } from '../../service/visitorService';
import { VISITOR_MOCK_ENABLED } from '../../config/featureFlags';
import { getAlertTypeLabel } from '../../constants/alertType';
import { subscribeToSecurityAlerts } from '../../utils/socket';
import { subscribeToVisitorAlertChanges } from '../../utils/visitorRealtime';
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
        setLoading(true);
        setError('');
        try {
            if (VISITOR_MOCK_ENABLED) {
                const desk = await getDeskToday();
                setAlerts(buildDemoAlerts(desk));
                return;
            }
            const responses = await Promise.all(VISITOR_ALERT_TYPES.map((alertType) => getSecurityAlerts({ alert_type: alertType, ...(status !== 'all' ? { status } : {}), page: 1, limit: 50 })));
            const merged = responses.flatMap((response) => response?.data || []);
            merged.sort((a, b) => new Date(b.last_seen_at || b.triggered_at || b.created_at) - new Date(a.last_seen_at || a.triggered_at || a.created_at));
            setAlerts(merged);
        } catch (err) {
            setError(err?.message || 'Không tải được cảnh báo khách.');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        getVisitorLookups().then((response) => {
            if (response?.success) setZones(response.data?.zones || []);
        }).catch(() => {});
        load();
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        const unsubscribeMock = subscribeToVisitorAlertChanges(load);
        return () => { unsubscribe(); unsubscribeMock(); };
    }, [load]);

    const counts = useMemo(() => ({
        total: alerts.length,
        new: alerts.filter((item) => item.status === 'new').length,
        acknowledged: alerts.filter((item) => item.status === 'acknowledged').length,
    }), [alerts]);

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
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-action-blue">Bảng xử lý riêng</p>
                    <h1 className="text-2xl font-bold text-midnight-indigo mt-1">Cảnh báo khách</h1>
                    <p className="text-sm text-slate-blue mt-1">Theo dõi và xử lý riêng các trường hợp khách cần kiểm tra tại cổng hoặc trong khuôn viên.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={status} onChange={(event) => setStatus(event.target.value)} className="px-3 py-2 rounded-xl border border-platinum-tint bg-white text-sm font-semibold text-midnight-indigo">
                        <option value="all">Tất cả</option>
                        <option value="open">Đang mở</option>
                        <option value="new">Chưa tiếp nhận</option>
                        <option value="acknowledged">Đang xử lý</option>
                    </select>
                    <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-platinum-tint bg-white text-sm font-semibold text-slate-blue disabled:opacity-60">
                        <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Làm mới
                    </button>
                </div>
            </div>

            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            <DemoDataBanner onReset={load} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button type="button" onClick={() => setStatus('all')} className={`p-5 rounded-2xl border text-left transition-colors ${status === 'all' ? 'border-action-blue ring-2 ring-action-blue/15' : 'border-platinum-tint'} bg-white`}><p className="text-xs font-semibold text-slate-blue">Tổng cảnh báo khách</p><p className="text-2xl font-bold text-midnight-indigo mt-1">{counts.total}</p></button>
                <button type="button" onClick={() => setStatus('new')} className={`p-5 rounded-2xl border text-left transition-colors ${status === 'new' ? 'border-red-400 ring-2 ring-red-200' : 'border-red-200'} bg-red-50`}><p className="text-xs font-semibold text-red-700">Chưa tiếp nhận</p><p className="text-2xl font-bold text-red-800 mt-1">{counts.new}</p></button>
                <button type="button" onClick={() => setStatus('acknowledged')} className={`p-5 rounded-2xl border text-left transition-colors ${status === 'acknowledged' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'} bg-amber-50`}><p className="text-xs font-semibold text-amber-700">Đang xử lý</p><p className="text-2xl font-bold text-amber-800 mt-1">{counts.acknowledged}</p></button>
                <button type="button" onClick={() => setStatus('resolved')} className={`p-5 rounded-2xl border text-left transition-colors ${status === 'resolved' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-emerald-200'} bg-emerald-50`}><p className="text-xs font-semibold text-emerald-700">Đã xử lý</p><p className="text-2xl font-bold text-emerald-800 mt-1">{alerts.filter((item) => item.status === 'resolved').length}</p></button>
            </div>

            <section className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="p-5 border-b border-platinum-tint flex items-center justify-between">
                    <div><h2 className="text-base font-bold text-midnight-indigo flex items-center gap-2"><UserRound className="w-5 h-5 text-action-blue" /> {status === 'all' ? 'Danh sách cảnh báo' : 'Cần xử lý'} ({alerts.length})</h2><p className="text-xs text-slate-blue mt-1">Tự cập nhật khi có sự kiện mới qua kết nối real-time.</p></div>
                    <span className="text-xs font-semibold text-slate-blue">{alerts.length} cảnh báo</span>
                </div>
                <div className="overflow-x-auto">
                    {loading && <p className="py-10 text-center text-sm text-slate-blue">Đang tải cảnh báo khách...</p>}
                    {!loading && alerts.length === 0 && <p className="py-10 text-center text-sm text-slate-blue">Hiện không có cảnh báo khách cần xử lý.</p>}
                    {!loading && alerts.length > 0 && <table className="w-full min-w-[1120px] text-left">
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
                            {alerts.map((alert) => {
                                const payload = getPayload(alert);
                                const evidenceId = getEvidenceId(alert);
                                const visitorPhoto = payload.visitorPhoto || payload.visitor_photo || null;
                                const busy = actionId === alert.id;
                                const severity = severityMeta[alert.severity] || severityMeta.medium;
                                return <tr key={alert.id} onClick={() => payload.visitId && setDetailId(payload.visitId)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && payload.visitId) { event.preventDefault(); setDetailId(payload.visitId); } }} tabIndex={payload.visitId ? 0 : undefined} className={`align-top hover:bg-cloud-mist/20 ${payload.visitId ? 'cursor-pointer focus:outline-none focus:bg-blue-50/40' : ''}`}>
                                    <td className="px-5 py-4"><p className="font-bold text-sm text-midnight-indigo">{getAlertTypeLabel(alert.alert_type)}</p><p className="text-xs text-slate-blue mt-1">{payload.detail || payload.reason || payload.message || 'Cần kiểm tra tại cổng'}</p></td>
                                    <td className="px-4 py-4"><span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold border whitespace-nowrap ${severity.className}`}>{severity.label}</span></td>
                                    <td className="px-4 py-4 text-sm text-midnight-indigo"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-lg overflow-hidden border border-platinum-tint bg-cloud-mist/50 flex items-center justify-center shrink-0">{visitorPhoto ? <img src={visitorPhoto} alt={`Ảnh ${payload.visitorName || 'khách'}`} className="w-full h-full object-cover" /> : <UserRound className="w-5 h-5 text-slate-blue/50" />}</div><div><p className={`font-semibold ${payload.visitId ? 'hover:text-action-blue' : ''}`}>{payload.visitorName || payload.fullName || 'Chưa xác định'}</p><p className="text-xs text-slate-blue mt-1">{payload.code || '—'}</p></div></div></td>
                                    <td className="px-4 py-4 text-xs text-slate-blue">{payload.zoneName || payload.zone_name || alert.zone_name || alert.zone_id || 'Chưa xác định'}</td>
                                    <td className="px-4 py-4 text-xs text-slate-blue"><p>{payload.cameraGroupName || payload.camera_group_name || 'Chưa xác định'}</p><p className="mt-1">{payload.cameraName || payload.camera_name || payload.cameraId || 'Chưa xác định'}</p></td>
                                    <td className="px-4 py-4 text-xs text-slate-blue whitespace-nowrap">{formatTime(alert.last_seen_at || alert.triggered_at || alert.created_at)}<p className="mt-1">{alert.occurrence_count || 1} lượt</p></td>
                                    <td className="px-4 py-4"><span className="inline-flex px-2 py-1 rounded-md text-[11px] font-bold border bg-blue-50 text-action-blue border-blue-200 whitespace-nowrap">{statusLabel[alert.status] || alert.status}</span>{alert.acknowledged_at && <p className="text-[10px] text-slate-blue mt-2">Tiếp nhận: {formatTime(alert.acknowledged_at)}</p>}{(alert.acknowledged_by_name || alert.acknowledged_by) && <p className="text-[10px] text-slate-blue">Bởi: {alert.acknowledged_by_name || alert.acknowledged_by}</p>}</td>
                                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><div className="flex flex-col items-end gap-2">{alert.status !== 'resolved' && <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); alert.status === 'new' ? openAcknowledgeModal(alert) : openResolveModal(alert); }} className="px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-bold disabled:opacity-60 whitespace-nowrap">{busy ? 'Đang xử lý...' : alert.status === 'new' ? 'Tiếp nhận' : 'Xử lý ngay'}</button>}{evidenceId && <button type="button" onClick={(event) => { event.stopPropagation(); setSnapshotEventId(evidenceId); }} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-xs font-bold text-slate-blue hover:text-action-blue whitespace-nowrap">Xem bằng chứng</button>}</div></div></td>
                                </tr>;
                            })}
                        </tbody>
                    </table>}
                </div>
            </section>
            <EventSnapshotModal isOpen={Boolean(snapshotEventId)} eventId={snapshotEventId} onClose={() => setSnapshotEventId(null)} />
            {detailId && <VisitDetailDrawer deskMode visitId={detailId} zones={zones} onClose={() => setDetailId(null)} onChanged={load} />}
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
                        <p className="text-[11px] font-bold uppercase text-slate-blue">Loại cảnh báo</p>
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
                    <p className="text-[11px] text-slate-blue">Phương án và ghi chú sẽ được lưu vào lịch sử xử lý cảnh báo.</p>
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
