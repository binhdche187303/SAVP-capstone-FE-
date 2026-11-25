import PageHeading from '../../../components/common/PageHeading';
import TimeRangeButtons from '../../../components/common/TimeRangeButtons';
import './VisitorDesk.css';
import PaginatedCollection from '../../../components/common/PaginatedCollection';
import StatisticGrid from '../../../components/common/StatisticGrid';
import StatisticCard from '../../../components/common/StatisticCard';
import FilterBar, { FilterField } from '../../../components/common/FilterBar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConciergeBell, ExternalLink, MonitorSmartphone, ShieldAlert, UserPlus, Loader2 } from 'lucide-react';
import { getDesk, getVisitorLookups, createVisit } from '../../../service/visitorService';
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
import { hasPermission } from '../../../utils/permissionUtils';

// S4 (2.10, spec §12.2): màn xử lý ngoại lệ của bảo vệ/bảo vệ. Khách đã đăng ký, đã duyệt và có ảnh
// được camera tại cổng tự cho vào; màn này chỉ gom những trường hợp cần người xử lý.
const KPIS = [
    ['expected', 'Dự kiến hôm nay'],
    ['arrived', 'Đã đến'],
    ['onSite', 'Đang trong khuôn viên'],
    ['overstay', 'Quá giờ'],
];

const smallBtn = 'px-3 py-1.5 rounded-lg text-[11px] font-semibold';
const localDateKey = (date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const visitDateKey = value => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10) : '';
const displayDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '';

const presetDates = (mode, value = localDateKey()) => {
    const anchor = new Date(`${value}T12:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (mode === 'week') {
        start.setDate(anchor.getDate() - (anchor.getDay() + 6) % 7);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    } else if (mode === 'month') {
        start.setDate(1);
        end.setMonth(anchor.getMonth() + 1, 0);
    } else if (mode === 'year') {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
    }
    return { from: localDateKey(start), to: localDateKey(end) };
};

const VisitorDesk = () => {
    const [lookups, setLookups] = useState({ zones: [], purposes: [] });
    const [desk, setDesk] = useState(null);
    const [error, setError] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [walkInOpen, setWalkInOpen] = useState(false);
    const [walkInError, setWalkInError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [rangeMode, setRangeMode] = useState('day');
    const [dateRange, setDateRange] = useState(() => presetDates('day'));
    const { from, to } = dateRange;
    const validRange = !!from && !!to && from <= to;
    const periodLabel = from === to ? displayDate(from) : `${displayDate(from)} – ${displayDate(to)}`;
    const changeRangeMode = mode => {
        setRangeMode(mode);
        if (mode !== 'custom') setDateRange(presetDates(mode));
    };
    const changeDate = (key, value) => {
        setRangeMode('custom');
        setDateRange(previous => ({ ...previous, [key]: value }));
    };
    const inRange = value => {
        const date = visitDateKey(value);
        return !!date && date >= from && date <= to;
    };
    const [activeKpi, setActiveKpi] = useState(null);
    const requestId = useRef(0);
    const filteredVisits = (desk?.items || []).filter(visit => {
        switch (activeKpi) {
            case 'expected': return inRange(visit.scheduledFrom) && !['rejected', 'cancelled'].includes(visit.status);
            case 'arrived': return inRange(visit.checkInAt);
            case 'onSite': return ['checked_in', 'must_leave'].includes(visit.status);
            case 'overstay': return visit.status === 'checked_in' && visit.overstay;
            default: return true;
        }
    });

    const load = useCallback(async () => {
        const currentRequest = ++requestId.current;
        if (!validRange) {
            setDesk(null);
            setError('Vui lòng chọn đủ từ ngày, đến ngày; ngày bắt đầu không được sau ngày kết thúc.');
            return;
        }
        try {
            const res = await getDesk({ from, to });
            if (currentRequest !== requestId.current) return;
            if (res?.success) {
                setDesk(res.data);
                setError(null);
            } else {
                setDesk(null);
                setError(res?.message || 'Không tải được dữ liệu chốt bảo vệ');
            }
        } catch (error) {
            if (currentRequest !== requestId.current) return;
            setDesk(null);
            setError(error?.message || 'Không tải được dữ liệu chốt bảo vệ');
        }
    }, [from, to, validRange]);

    useEffect(() => {
        getVisitorLookups().then((res) => { if (res?.success) setLookups(res.data); });
        load();
        const unsubscribe = subscribeToSecurityAlerts(load, load);
        const unsubscribeVisits = subscribeToVisitorVisitChanges(load);
        const unsubscribeMock = subscribeToVisitorAlertChanges(load);
        const refreshTimer = window.setInterval(load, 5000);
        const refreshOnFocus = () => load();
        window.addEventListener('focus', refreshOnFocus);
        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener('focus', refreshOnFocus);
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
        <div data-page-surface="wide" className={pageCls}>
            <div className="visitor-desk-header border-b border-platinum-tint pb-5">
                <div>
                    <PageHeading badge="Khách" icon={<ConciergeBell className="w-6 h-6 text-action-blue" />} data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        Chốt bảo vệ
                    </PageHeading>
                    <p data-page-description className="text-xs text-slate-blue mt-1 max-w-2xl">
                        Khách đã đăng ký, đã duyệt và có ảnh sẽ được camera tại cổng tự cho vào, không cần người trực.
                        Màn hình tập hợp các trường hợp cần bảo vệ xử lý.
                    </p>
                </div>
                <div className="visitor-desk-actions">
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

            <FilterBar data-filter-grid variant="card" className="visitor-desk-filters grid gap-4">



                <div className="camai-filter-period-row">
                    <TimeRangeButtons label="Khoảng thời gian" value={rangeMode} onChange={changeRangeMode}
                    options={[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"], ["year", "Năm"], ["custom", "Tùy chọn"]]} />
                    <div className="camai-filter-period-dates">
                        <FilterField label="Từ ngày">
                            <input type="date" value={from} onChange={event => changeDate('from', event.target.value)} />
                        </FilterField>
                        <FilterField label="Đến ngày">
                            <input type="date" value={to} onChange={event => changeDate('to', event.target.value)} />
                        </FilterField>
                    </div>
                </div>
                <div className="visitor-desk-filter-note">
                    <button type="button" className={btnGhost} onClick={() => { setRangeMode('day'); setDateRange(presetDates('day')); }}>Hôm nay</button>
                    <p className="text-xs text-slate-blue">Đang xem {periodLabel}; khách còn trong khuôn viên vẫn được giữ lại để bảo vệ theo dõi.</p>
                </div>
            </FilterBar>

            <DemoDataBanner onReset={load} />

            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !desk && <div className="flex items-center justify-center h-64"><Loader2 className={spinnerCls} /></div>}

            {desk && (
                <>
                    <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {KPIS.map(([key, label]) => (
                            <StatisticCard key={key}
                                label={key === 'expected' || key === 'arrived' ? label.replace('hôm nay', periodLabel) : label}
                                value={desk.kpis[key]} valueProps={{ 'data-testid': `desk-kpi-${key}` }}
                                aria-label={key === 'expected' ? `Dự kiến ${periodLabel}` : label}
                                selected={activeKpi === key}
                                onClick={() => setActiveKpi(previous => previous === key ? null : key)}
                                tone={key === 'overstay' && desk.kpis.overstay > 0 ? 'danger' : 'default'}
                                legacy={(
                            <div className={`${cardCls} p-4 ${key === 'overstay' && desk.kpis.overstay > 0 ? 'border-red-300 bg-red-50/40' : ''}`}>
                                <p className="text-[10px] font-bold text-slate-blue uppercase">{key === 'expected' || key === 'arrived' ? label.replace('hôm nay', periodLabel) : label}</p>
                                <p data-testid={`desk-kpi-${key}`} className={`text-2xl font-bold mt-1 ${key === 'overstay' && desk.kpis.overstay > 0 ? 'text-red-600' : 'text-midnight-indigo'}`}>{desk.kpis[key]}</p>
                            </div>
                                )} />
                        ))}
                    </StatisticGrid>

                    <div className="grid lg:grid-cols-3 gap-6 items-start">
                        <div role="region" aria-label="Danh sách khách theo bộ lọc" className={`${cardCls} overflow-hidden lg:col-span-2`}>
                            <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                                <h3 className="font-bold text-midnight-indigo text-sm">Khách {from === to ? `ngày ${periodLabel}` : `từ ${displayDate(from)} đến ${displayDate(to)}`} ({filteredVisits.length})</h3>
                            </div>
                            {filteredVisits.length === 0 ? (
                                <p className="px-6 py-10 text-center text-xs text-slate-blue">{activeKpi ? 'Không có lượt khách phù hợp với bộ lọc.' : from === to ? 'Ngày này chưa có khách đăng ký' : 'Khoảng thời gian này chưa có khách đăng ký'}</p>
                            ) : (
                                <PaginatedCollection items={filteredVisits} resetKey={`${from}:${to}:${activeKpi || 'all'}`} itemLabel="lượt khách">
{(camaiPageItems, camaiStartIndex) => (
<ul aria-label="Danh sách khách" className="divide-y divide-pale-gray">
                                    {camaiPageItems.map((camaiRecord, camaiIndex) => ((visit) => (
                                        <li key={visit.id} className="visitor-desk-visit-row px-6 py-3">
                                            <VisitorAvatar visitor={visit.visitor} size={40} />
                                            <div className="visitor-desk-visit-summary">
                                                <p data-ui-text="primary" className="text-sm font-semibold text-midnight-indigo">{visit.visitor.fullName}</p>
                                                <p data-ui-text="secondary" className="text-[11px] text-slate-blue">
                                                    Gặp {visit.hostName} · {visit.departmentName} · {fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}
                                                    {visit.visitor.hasPhoto ? '' : ' · Chưa có ảnh'}
                                                </p>
                                            </div>
                                            <div className="visitor-desk-visit-status">
                                                <VisitStatusBadge status={visit.status} overstay={visit.overstay} visit={visit} />
                                            </div>
                                            <div className="visitor-desk-visit-actions">
                                                {visit.status === 'approved' && (
                                                    <a data-ui-text="action"
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
                                                <button data-ui-text="action" type="button" className={`${smallBtn} border border-platinum-tint text-midnight-indigo hover:bg-cloud-mist`} onClick={() => setDetailId(visit.id)}>
                                                    Chi tiết
                                                </button>
                                            </div>
                                        </li>
                                    ))(camaiRecord, camaiStartIndex + camaiIndex, (desk.items)))}
                                </ul>
)}
</PaginatedCollection>
                            )}
                        </div>

                        <div className={`${cardCls} overflow-hidden`} data-testid="desk-alerts">
                            <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                                <h3 className="font-bold text-midnight-indigo text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-500" /> Cảnh báo tại cổng {from === to ? `ngày ${periodLabel}` : `từ ${displayDate(from)} đến ${displayDate(to)}`} ({desk.alerts.length})</h3>
                            </div>
                            {desk.alerts.length === 0 ? (
                                <p className="px-6 py-6 text-center text-xs text-slate-blue">Chưa có cảnh báo nào</p>
                            ) : (
                                <PaginatedCollection items={desk?.alerts} itemLabel="cảnh báo">
{(camaiPageItems, camaiStartIndex) => (
<ul className="divide-y divide-pale-gray max-h-96 overflow-y-auto">
                                    {camaiPageItems.map((camaiRecord, camaiIndex) => ((alert, i) => (
                                        // Cảnh báo không có id; khóa ghép từ lượt, thời điểm và vị trí trong danh sách.
                                        <li key={`${alert.visitId}-${alert.at}-${i}`} className="px-6 py-3 text-xs">
                                            <button type="button" className="text-left" onClick={() => setDetailId(alert.visitId)}>
                                                <p className="font-semibold text-midnight-indigo">{alert.visitorName} · {VISIT_EVENT_LABELS[alert.type]}</p>
                                                <p className="text-slate-blue">{alert.note} · {alert.zoneName} · {fmtDateTime(alert.at)}</p>
                                            </button>
                                        </li>
                                    ))(camaiRecord, camaiStartIndex + camaiIndex, (desk.alerts)))}
                                </ul>
)}
</PaginatedCollection>
                            )}
                        </div>
                    </div>
                </>
            )}

            <SimpleModal isOpen={walkInOpen} title="Đăng ký khách vãng lai" onClose={() => setWalkInOpen(false)}>
                <VisitForm mode="walk_in" lookups={lookups} onSubmit={submitWalkIn} submitting={submitting} error={walkInError} />
            </SimpleModal>

            {detailId && (
                <VisitDetailDrawer
                    deskMode
                    visitId={detailId}
                    zones={lookups.zones}
                    canExtendPermission={hasPermission(['visitor.visit.extend', 'visitor.visit.manage'])}
                    canRevokePermission={hasPermission(['visitor.visit.revoke', 'visitor.visit.manage'])}
                    onClose={() => setDetailId(null)}
                    onChanged={load}
                />
            )}
        </div>
    );
};

export default VisitorDesk;
