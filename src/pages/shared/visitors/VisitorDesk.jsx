import { useCallback, useEffect, useState } from 'react';
import { ConciergeBell, ExternalLink, ListChecks, MonitorSmartphone, ShieldAlert, UserPlus } from 'lucide-react';
import { getDeskToday, getVisitorLookups, createVisit } from '../../../service/visitorService';
import toast from '../../../utils/toast';
import DemoDataBanner from '../../../components/common/DemoDataBanner';
import SimpleModal from '../../../components/common/SimpleModal';
import VisitForm from '../../../components/visitor/VisitForm';
import VisitDetailDrawer from '../../../components/visitor/VisitDetailDrawer';
import VisitorAvatar from '../../../components/visitor/VisitorAvatar';
import VisitStatusBadge from '../../../components/visitor/VisitStatusBadge';
import RegistrationQrCard from '../../../components/visitor/RegistrationQrCard';
import { VISIT_EVENT_LABELS, fmtDateTime, fmtTimeRange, fmtLastSeen } from '../../../components/visitor/visitLabels';
import { pageCls, cardCls, btnPrimary, btnGhost, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';

// S4 (2.10, spec §12.2): màn xử lý ngoại lệ của lễ tân/bảo vệ. Khách đã đăng ký, đã duyệt và có ảnh
// được camera tại cổng tự cho vào; màn này chỉ gom những trường hợp cần người xử lý.
const REFRESH_MS = 30000;
const MINUTE = 60 * 1000;

const KPIS = [
    ['expected', 'Dự kiến hôm nay'],
    ['arrived', 'Đã đến'],
    ['onSite', 'Đang trong khuôn viên'],
    ['overstay', 'Quá giờ'],
];

const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / MINUTE));

// Mô tả và mức ưu tiên hiển thị của từng loại việc cần xử lý.
const ATTENTION_VIEW = {
    must_leave: { tone: 'red', text: () => 'Đã thu hồi quyền, chưa rời khuôn viên' },
    overstay: {
        tone: 'red',
        text: (item) => `Quá giờ ${minutesSince(item.since)} phút · ${item.visit.overstayLevel === 2 ? 'đã báo bảo vệ' : 'đã nhắc người được gặp'}`,
    },
    exit_unrecorded: { tone: 'amber', text: (item) => `Chưa ghi nhận giờ ra${item.visit.notFound ? ' · không tìm thấy khách' : ''}` },
    manual_review: { tone: 'amber', text: () => 'Cần xác minh thủ công tại cổng' },
    no_photo: { tone: 'blue', text: () => 'Chưa có ảnh khuôn mặt, cần chụp khi khách đến' },
};
const TONE = {
    red: 'border-l-red-500 bg-red-50/40',
    amber: 'border-l-amber-500 bg-amber-50/40',
    blue: 'border-l-action-blue bg-blue-50/30',
};

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
            setError(res?.message || 'Không tải được dữ liệu quầy lễ tân');
        }
    }, []);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
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
                        Quầy lễ tân
                    </h2>
                    <p className="text-xs text-slate-blue mt-1 max-w-2xl">
                        Khách đã đăng ký, đã duyệt và có ảnh sẽ được camera tại cổng tự cho vào, không cần người trực.
                        Màn này chỉ gom các trường hợp cần lễ tân hoặc bảo vệ xử lý.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
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

                    <div className={`${cardCls} overflow-hidden`} data-testid="desk-attention">
                        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                            <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2">
                                <ListChecks className="w-4 h-4 text-action-blue" /> Cần xử lý ({desk.attention.length})
                            </h3>
                        </div>
                        {desk.attention.length === 0 ? (
                            <p className="px-6 py-8 text-center text-xs text-slate-blue">Không có trường hợp nào cần xử lý. Camera tại cổng đang tự xác thực khách.</p>
                        ) : (
                            <ul className="divide-y divide-pale-gray">
                                {desk.attention.map((item) => {
                                    const view = ATTENTION_VIEW[item.kind];
                                    return (
                                        <li key={`${item.kind}-${item.visit.id}`} className={`px-6 py-3 flex flex-wrap items-center gap-3 border-l-4 ${TONE[view.tone]}`}>
                                            <VisitorAvatar visitor={item.visit.visitor} size={40} />
                                            <div className="flex-1 min-w-[220px]">
                                                <p className="text-sm font-semibold text-midnight-indigo">{item.visit.visitor.fullName} <span className="font-normal text-slate-blue">· {item.visit.code}</span></p>
                                                <p className="text-xs font-semibold text-midnight-indigo">{view.text(item)}</p>
                                                <p className="text-[11px] text-slate-blue">
                                                    Gặp {item.visit.hostName} · {item.visit.departmentName}
                                                    {item.visit.lastSeen ? ` · Camera thấy lần cuối: ${fmtLastSeen(item.visit.lastSeen)}` : ''}
                                                </p>
                                            </div>
                                            <button type="button" aria-label="Xử lý" className={`${smallBtn} bg-action-blue text-white hover:bg-glacier-blue`} onClick={() => setDetailId(item.visit.id)}>
                                                Xử lý
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
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
                <VisitDetailDrawer visitId={detailId} zones={lookups.zones} onClose={() => setDetailId(null)} onChanged={load} />
            )}
        </div>
    );
};

export default VisitorDesk;
