import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConciergeBell, ExternalLink, MonitorSmartphone, ShieldAlert, UserPlus } from 'lucide-react';
import { getDeskToday, getVisitorLookups, createVisit } from '../../../service/visitorService';
import toast from '../../../utils/toast';
import DemoDataBanner from '../../../components/common/DemoDataBanner';
import SimpleModal from '../../../components/common/SimpleModal';
import VisitForm from '../../../components/visitor/VisitForm';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import RegistrationQrCard from '../../../components/visitor/RegistrationQrCard';
import { VISIT_EVENT_LABELS, fmtDateTime, fmtTimeRange } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, btnPrimary, btnGhost, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';
import { subscribeToSecurityAlerts, subscribeToVisitorVisitChanges } from '../../../utils/socket';
import { subscribeToVisitorAlertChanges } from '../../../utils/visitorRealtime';

// S4 (2.10, spec §12.2): màn xử lý ngoại lệ của bảo vệ/bảo vệ. Khách đã đăng ký, đã duyệt và có ảnh
// được camera tại cổng tự cho vào; màn này chỉ gom những trường hợp cần người xử lý.
const KPIS = [
    ['expected', 'Dự kiến hôm nay'],
    ['arrived', 'Đã đến'],
    ['onSite', 'Đang trong khuôn viên'],
    ['overstay', 'Quá giờ'],
];

const smallBtn = 'px-3 py-1.5 rounded-lg text-[11px] font-semibold';

const VisitorDesk = () => {
    const [lookups, setLookups] = useState({ zones: [], purposes: [] });
    const [desk, setDesk] = useState(null);
    const [error, setError] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [walkInOpen, setWalkInOpen] = useState(false);
    const [walkInError, setWalkInError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        const res = await getDeskToday();
        if (res?.success) {
            setDesk(res.data);
            setError(null);
        } else {
            setError(res?.message || 'Không tải được dữ liệu chốt bảo vệ');
        }
    }, []);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
        load();
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        const unsubscribeVisits = subscribeToVisitorVisitChanges(load);
        const unsubscribeMock = subscribeToVisitorAlertChanges(load);
        return () => {
            unsubscribe();
            unsubscribeVisits();
            unsubscribeMock();
        };
    }, [load]);

    const submitWalkIn = async (payload) => {
        setSubmitting(true);
        setWalkInError(null);
        const res = await createVisit(payload);
        setSubmitting(false);
        if (!res?.success) {
            setWalkInError(res?.message || 'Không đăng ký được khách');
            return;
        }
        toast.success(`Đã đăng ký khách ${res.data.visitor.fullName} · ${res.data.code}`);
        setWalkInOpen(false);
        setDetailId(res.data.id);
        load();
    };

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <ConciergeBell className="w-6 h-6 text-action-blue" />
                        Chốt bảo vệ
                    </h2>
                    <p className="text-xs text-slate-blue mt-1 max-w-2xl">
                        Khách đã đăng ký, đã duyệt và có ảnh sẽ được camera tại cổng tự cho vào, không cần người trực.
                        Màn này chỉ gom các trường hợp cần bảo vệ hoặc bảo vệ xử lý.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/guard/visitor-alerts" className={btnGhost}>
                        <ShieldAlert className="w-4 h-4" /> Xem cảnh báo khách
                    </Link>
                    <a href="/visitor/gate" target="_blank" rel="noreferrer" className={btnGhost}>
                        <MonitorSmartphone className="w-4 h-4" /> Mở màn hình cổng
                    </a>
                    <RegistrationQrCard />
                    <button type="button" className={btnPrimary} onClick={() => { setWalkInError(null); setWalkInOpen(true); }}>
                        <UserPlus className="w-4 h-4" /> Đăng ký khách vãng lai
                    </button>
                </div>
            </div>

            <DemoDataBanner onReset={load} />

            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !desk && <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>}

            {desk && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {KPIS.map(([key, label]) => (
                            <div key={key} className={`${cardCls} p-4 ${key === 'overstay' && desk.kpis.overstay > 0 ? 'border-red-300 bg-red-50/40' : ''}`}>
                                <p className="text-[10px] font-bold text-slate-blue uppercase">{label}</p>
                                <p data-testid={`desk-kpi-${key}`} className={`text-2xl font-bold mt-1 ${key === 'overstay' && desk.kpis.overstay > 0 ? 'text-red-600' : 'text-midnight-indigo'}`}>{desk.kpis[key]}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid lg:grid-cols-3 gap-6 items-start">
                        <div className={`${cardCls} overflow-hidden lg:col-span-2`}>
                            <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                                <h3 className="font-bold text-midnight-indigo text-sm">Khách hôm nay ({desk.items.length})</h3>
                            </div>
                            {desk.items.length === 0 ? (
                                <p className="px-6 py-10 text-center text-xs text-slate-blue">Hôm nay chưa có khách đăng ký</p>
                            ) : (
                                <ul className="divide-y divide-pale-gray">
                                    {desk.items.map((visit) => (
                                        <li key={visit.id} className="px-6 py-3 flex flex-wrap items-center gap-3">
                                            <VisitorAvatar visitor={visit.visitor} size={40} />
                                            <div className="flex-1 min-w-[180px]">
                                                <p className="text-sm font-semibold text-midnight-indigo">{visit.visitor.fullName}</p>
                                                <p className="text-[11px] text-slate-blue">
                                                    Gặp {visit.hostName} · {visit.departmentName} · {fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}
                                                    {visit.visitor.hasPhoto ? '' : ' · Chưa có ảnh'}
                                                </p>
                                            </div>
                                            <VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} />
                                            <div className="flex gap-2">
                                                {visit.status === 'approved' && (
                                                    <a
                                                        href={`/visitor/gate?code=${visit.code}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        aria-label="Mô phỏng tại cổng"
                                                        title="Mở màn hình cổng với mã lượt này"
                                                        className={`${smallBtn} inline-flex items-center gap-1 border border-platinum-tint text-action-blue hover:bg-cloud-mist`}
                                                    >
                                                        <ExternalLink className="w-3 h-3" /> Cổng
                                                    </a>
                                                )}
                                                <button type="button" className={`${smallBtn} border border-platinum-tint text-midnight-indigo hover:bg-cloud-mist`} onClick={() => setDetailId(visit.id)}>
                                                    Chi tiết
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className={`${cardCls} overflow-hidden`} data-testid="desk-alerts">
                            <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                                <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-500" /> Cảnh báo tại cổng hôm nay ({desk.alerts.length})</h3>
                            </div>
                            {desk.alerts.length === 0 ? (
                                <p className="px-6 py-6 text-center text-xs text-slate-blue">Chưa có cảnh báo nào</p>
                            ) : (
                                <ul className="divide-y divide-pale-gray max-h-96 overflow-y-auto">
                                    {desk.alerts.map((alert, i) => (
                                        // Cảnh báo không có id; khóa ghép từ lượt, thời điểm và vị trí trong danh sách.
                                        <li key={`${alert.visitId}-${alert.at}-${i}`} className="px-6 py-3 text-xs">
                                            <button type="button" className="text-left" onClick={() => setDetailId(alert.visitId)}>
                                                <p className="font-semibold text-midnight-indigo">{alert.visitorName} · {VISIT_EVENT_LABELS[alert.type]}</p>
                                                <p className="text-slate-blue">{alert.note} · {alert.zoneName} · {fmtDateTime(alert.at)}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </>
            )}

            <SimpleModal isOpen={walkInOpen} title="Đăng ký khách vãng lai" onClose={() => setWalkInOpen(false)}>
                <VisitForm mode="walk_in" lookups={lookups} onSubmit={submitWalkIn} submitting={submitting} error={walkInError} />
            </SimpleModal>

            {detailId && (
                <VisitDetailDrawer deskMode visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />
            )}
        </div>
    );
};

export default VisitorDesk;
