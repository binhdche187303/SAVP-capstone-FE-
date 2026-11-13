import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, BarChart3, Car, CheckCircle, Clock, Download, FileText, Lock, LogIn, LogOut, MapPin, Radio, Repeat,
    ShieldAlert, UserCheck, Users, Video,
} from 'lucide-react';

import StatCard from '../../components/common/StatCard';
import { ATTENDANCE_RULES, ATTENDANCE_STATUS, CALENDAR_TYPES, getMockMeetingDetail } from '../../mocks/meetingCalendarMock';

// MOCK-BE: Chi tiết cuộc họp lấy từ VPĐT (chưa có API) — thông tin, điểm danh, log ra vào camera, báo cáo.
// Điểm danh tay / lý do chỉ lưu trong state của trang ("Demo – chưa lưu BE").
// Route dùng chung `/:role/meeting/:id` — MeetingDetailRoute chọn trang này khi id là `mock-…`.

const TAB_KEYS = ['info', 'attendance', 'access', 'report'];
// GV dùng /teacher/my-schedule, các vai trò khác dùng /:role/schedule.
const scheduleHome = (pathname) => {
    const base = pathname.split('/')[1];
    return base === 'teacher' ? '/teacher/my-schedule' : `/${base}/schedule`;
};

const ROLE_LABEL = { host: 'Chủ trì', secretary: 'Thư ký', attendee: 'Thành viên' };
const MANUAL_OPTIONS = [
    ['present', 'Có mặt'], ['late', 'Đi trễ'], ['early_leave', 'Về sớm'], ['absent', 'Vắng mặt'], ['excused', 'Vắng có lý do'],
];
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--');
const fmtTimeSec = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--');
const fmtDate = (v) => new Date(v).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const toHHMM = (iso) => (iso ? fmtTime(iso) : '');

const Section = ({ title, icon: Icon, extra, children }) => (
    <section className="border border-platinum-tint rounded-xl overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-2.5 bg-cloud-mist/50 border-b border-platinum-tint">
            {Icon && <Icon className="w-4 h-4 text-action-blue" />}
            <h3 className="text-xs font-bold uppercase tracking-wide text-midnight-indigo">{title}</h3>
            {extra && <span className="ml-auto text-xs text-slate-blue">{extra}</span>}
        </header>
        {children}
    </section>
);

const InfoTable = ({ rows }) => (
    <table className="w-full text-sm">
        <tbody className="divide-y divide-platinum-tint/70">
            {rows.filter(Boolean).map(([label, value]) => (
                <tr key={label}>
                    <th scope="row" className="w-40 align-top text-left px-4 py-3 bg-slate-50/70 border-r border-platinum-tint/70 text-xs font-semibold text-slate-blue">
                        {label}
                    </th>
                    <td className="px-4 py-3 align-top text-midnight-indigo">{value || <span className="text-slate-400">—</span>}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

const REPORT_FILTERS = {
    all: { label: 'Tất cả', test: () => true },
    arrived: { label: 'Đã đến', test: (r) => ['present', 'late', 'early_leave', 'late_early'].includes(r.status) },
    present: { label: 'Có mặt đúng giờ', test: (r) => r.status === 'present' },
    late: { label: 'Đi trễ', test: (r) => ['late', 'late_early'].includes(r.status) },
    early: { label: 'Về sớm', test: (r) => ['early_leave', 'late_early'].includes(r.status) },
    absent: { label: 'Vắng mặt', test: (r) => r.status === 'absent' || r.status === 'excused' },
    not_arrived: { label: 'Chưa đến', test: (r) => r.status === 'not_arrived' },
    excused: { label: 'Có lý do được duyệt', test: (r) => r.excused },
};
// Thứ tự "nặng → nhẹ" khi sắp theo tình trạng.
const STATUS_ORDER = ['absent', 'late_early', 'late', 'early_leave', 'not_arrived', 'excused', 'present', 'upcoming', 'not_required'];
const SORTERS = {
    name: (r) => r.name.split(' ').pop(),
    checkInAt: (r) => (r.checkInAt ? new Date(r.checkInAt).getTime() : null),
    checkOutAt: (r) => (r.checkOutAt ? new Date(r.checkOutAt).getTime() : null),
    status: (r) => STATUS_ORDER.indexOf(r.status),
    points: (r) => r.points ?? 0,
};

const SortTh = ({ label, k, sort, onSort, className = '' }) => (
    <th className={`px-3 py-2 ${className}`}>
        <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 font-bold hover:text-action-blue ${sort.key === k ? 'text-action-blue' : ''}`}>
            {label}
            <span className="text-[10px]">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
    </th>
);

const ROLE_BADGE = {
    host: 'bg-blue-50 text-action-blue border-blue-200',
    secretary: 'bg-violet-50 text-violet-700 border-violet-200',
    attendee: 'bg-slate-50 text-slate-600 border-slate-200',
};

const StatusPill = ({ row }) => {
    const st = row.status === 'excused'
        ? { label: 'Vắng có lý do', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        : ATTENDANCE_STATUS[row.status] || ATTENDANCE_STATUS.upcoming;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${st.cls}`}>
            {st.label}{row.excused && row.status !== 'excused' ? ' (có lý do)' : ''}
        </span>
    );
};

const exportCsv = (detail, rows) => {
    const head = ['Mã CB', 'Họ tên', 'Đơn vị', 'Vai trò', 'Giờ vào', 'Giờ ra', 'Tình trạng', 'Điểm trừ', 'Lý do', 'Nguồn'];
    const lines = rows.map((r) => [
        r.code, r.name, r.unit, ROLE_LABEL[r.role], toHHMM(r.checkInAt), toHHMM(r.checkOutAt),
        r.status === 'excused' ? 'Vắng có lý do' : ATTENDANCE_STATUS[r.status]?.label, r.points, r.reason || '',
        r.source === 'manual' ? 'Điểm danh tay' : 'Camera',
    ]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diem-danh-${detail.meetingId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
};

const MockMeetingDetailPage = () => {
    const { id: meetingId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'info';
    const setTab = (key) => setSearchParams(key === 'info' ? {} : { tab: key }, { replace: true, state: location.state });
    const goBack = () => navigate(location.state?.from || scheduleHome(location.pathname), { state: { date: location.state?.date } });
    const [nowTs, setNowTs] = useState(Date.now());
    const [overrides, setOverrides] = useState({}); // code → { status?, checkInAt?, note?, reasonApproved? }
    const [myReason, setMyReason] = useState('');
    const [reportFilter, setReportFilter] = useState('all');
    const [sort, setSort] = useState({ key: 'points', dir: 'asc' }); // mặc định: nặng nhất lên đầu

    useEffect(() => {
        setOverrides({});
        setMyReason('');
        setReportFilter('all');
    }, [meetingId]);

    const detail = useMemo(() => (meetingId ? getMockMeetingDetail(meetingId, nowTs) : null), [meetingId, nowTs]);
    const live = detail?.status === 'in_progress';

    // Cuộc họp đang diễn ra: làm mới 3 giây/lần như nhận log real-time từ camera.
    useEffect(() => {
        if (!meetingId) return undefined;
        const timer = setInterval(() => setNowTs(Date.now()), live ? 3000 : 30000);
        return () => clearInterval(timer);
    }, [meetingId, live]);

    const rows = useMemo(() => {
        if (!detail) return [];
        return detail.attendance.map((r) => {
            const o = overrides[r.code] || {};
            const merged = { ...r };
            if (r.isMe && myReason && !r.reason) {
                merged.reason = myReason;
                merged.reasonStatus = 'pending';
            }
            if (o.reasonApproved && merged.reason) {
                merged.reasonStatus = 'approved';
                if (merged.points < 0) { merged.excused = true; merged.points = 0; }
            }
            if (o.status) {
                merged.status = o.status;
                merged.source = 'manual';
                merged.excused = o.status === 'excused';
                merged.points = o.status === 'excused' ? 0 : ATTENDANCE_STATUS[o.status].points;
            }
            if (o.checkInAt !== undefined) merged.checkInAt = o.checkInAt;
            if (o.note !== undefined) merged.note = o.note;
            return merged;
        });
    }, [detail, overrides, myReason]);

    if (!detail) {
        return (
            <div className="max-w-xl mx-auto py-16 text-center space-y-4">
                <p className="text-sm text-slate-blue">Không tìm thấy cuộc họp này trong dữ liệu minh họa.</p>
                <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-action-blue text-white text-sm font-bold">
                    <ArrowLeft className="w-4 h-4" /> Quay lại lịch
                </button>
            </div>
        );
    }

    const type = CALENDAR_TYPES[detail.calendarType] || CALENDAR_TYPES.unit;
    const canManage = detail.myRole === 'host' || detail.myRole === 'secretary';
    const locked = detail.status === 'completed';
    const blocked = detail.status === 'pending_approval' || detail.status === 'cancelled';
    const started = ['in_progress', 'completed'].includes(detail.status);
    const me = rows.find((r) => r.isMe);

    const sum = {
        invited: rows.length,
        present: rows.filter((r) => r.status === 'present').length,
        late: rows.filter((r) => r.status === 'late' || r.status === 'late_early').length,
        early: rows.filter((r) => r.status === 'early_leave' || r.status === 'late_early').length,
        absent: rows.filter((r) => r.status === 'absent').length,
        excused: rows.filter((r) => r.excused).length,
        notArrived: rows.filter((r) => r.status === 'not_arrived').length,
        points: rows.reduce((s, r) => s + (r.points || 0), 0),
    };

    const count = (key) => rows.filter(REPORT_FILTERS[key].test).length;
    const toggleSort = (key) => setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    const reportRows = rows.filter(REPORT_FILTERS[reportFilter].test).sort((a, b) => {
        const va = SORTERS[sort.key](a);
        const vb = SORTERS[sort.key](b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1; // chưa có giờ luôn xuống cuối
        if (vb === null) return -1;
        const d = typeof va === 'string' ? va.localeCompare(vb, 'vi') : va - vb;
        return (sort.dir === 'asc' ? d : -d) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    });

    const setOverride = (code, patch) => setOverrides((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
    const setManualTime = (row, hhmm) => {
        if (!hhmm) return setOverride(row.code, { checkInAt: null });
        const [h, m] = hhmm.split(':').map(Number);
        const d = new Date(detail.startTime);
        d.setHours(h, m, 0, 0);
        return setOverride(row.code, { checkInAt: d.toISOString() });
    };

    const tabs = [
        ['info', 'Thông tin', FileText],
        ['attendance', 'Điểm danh', UserCheck],
        ['access', live ? 'Ra vào (trực tiếp)' : 'Ra vào', Radio],
        ['report', 'Báo cáo', BarChart3],
    ];

    return (
        <div className="space-y-5">
            <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-blue hover:text-action-blue">
                <ArrowLeft className="w-4 h-4" /> Quay lại lịch
            </button>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className={`h-1.5 ${type.dot}`} />
                <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${type.chip}`}>{type.label}</span>
                    {detail.status === 'in_progress' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border bg-purple-50 text-purple-700 border-purple-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Đang diễn ra
                        </span>
                    )}
                    {detail.status === 'pending_approval' && <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-amber-50 text-amber-700 border-amber-200">Chờ duyệt</span>}
                    {detail.status === 'cancelled' && <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-red-50 text-red-600 border-red-200">Đã hủy</span>}
                    {detail.status === 'completed' && <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">Đã kết thúc</span>}
                    {detail.status === 'scheduled' && <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-blue-50 text-action-blue border-blue-200">Đã lên lịch</span>}
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-slate-50 text-slate-600 border-slate-200">Vai trò của bạn: {ROLE_LABEL[detail.myRole]}</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Demo – chưa có API VPĐT</span>
                </div>
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-blue">Chi tiết cuộc họp (VPĐT)</p>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo leading-snug mt-1">{detail.title}</h1>
                    <p className="text-sm text-slate-blue mt-2 flex flex-wrap gap-x-5 gap-y-1">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDate(detail.startTime)} · {fmtTime(detail.startTime)} – {fmtTime(detail.endTime)}</span>
                        <span className="flex items-center gap-1">{detail.room?.online ? <Video className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}{detail.room?.name || detail.place}</span>
                    </p>
                </div>

                <div className="flex items-center bg-cloud-mist/40 p-1 rounded-xl border border-platinum-tint w-fit">
                    {tabs.map(([key, label, Icon]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === key ? 'bg-white text-action-blue shadow-sm' : 'text-slate-blue hover:text-midnight-indigo'}`}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm p-6 space-y-4">
                {tab === 'info' && (
                    <div className="space-y-5">
                        {detail.status === 'cancelled' && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">Lịch đã bị hủy: {detail.cancelReason}</div>
                        )}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                            <Section title="Thông tin chung" icon={FileText}>
                                <InfoTable rows={[
                                    ['Nội dung', detail.content],
                                    ['Thời gian', (
                                        <>
                                            <div className="font-semibold">{fmtTime(detail.startTime)} – {fmtTime(detail.endTime)}</div>
                                            <div className="text-xs text-slate-blue capitalize">{fmtDate(detail.startTime)}</div>
                                        </>
                                    )],
                                    ['Địa điểm', detail.room ? (
                                        <>
                                            <div className="font-semibold">{detail.room.name} <span className="font-normal text-xs text-slate-blue">· sức chứa {detail.room.capacity}</span></div>
                                            <div className="text-xs text-slate-blue">{detail.place}</div>
                                        </>
                                    ) : (
                                        <>{detail.place} <span className="text-xs text-slate-blue">(nhập tay – ngoài danh mục tài nguyên)</span></>
                                    )],
                                    detail.vehicle && ['Phương tiện', <span className="inline-flex items-center gap-1"><Car className="w-4 h-4" />{detail.vehicle}</span>],
                                    ['Chủ trì', detail.host && (
                                        <>
                                            <div className="font-semibold">{detail.host.name} <span className="font-normal text-xs text-slate-blue">({detail.host.code})</span></div>
                                            <div className="text-xs text-slate-blue">{detail.host.title}, {detail.host.unit}</div>
                                        </>
                                    )],
                                    ['Thư ký', detail.secretary && <span className="font-semibold">{detail.secretary.name} <span className="font-normal text-xs text-slate-blue">({detail.secretary.code})</span></span>],
                                    ['Tài liệu đính kèm', detail.attachments.length > 0 && (
                                        <div className="space-y-1">
                                            {detail.attachments.map((f) => (
                                                <div key={f.name} className="flex items-center gap-1.5 text-sm"><FileText className="w-4 h-4 text-action-blue shrink-0" />{f.name} <span className="text-xs text-slate-400">({f.size})</span></div>
                                            ))}
                                        </div>
                                    )],
                                ]} />
                            </Section>

                            <Section title="Phê duyệt & cài đặt" icon={CheckCircle}>
                                <InfoTable rows={[
                                    ['Loại lịch', <span className={`px-2 py-0.5 rounded text-xs font-bold border ${type.chip}`}>{type.label}</span>],
                                    ['Trạng thái duyệt', detail.approval === 'pending'
                                        ? <span className="font-semibold text-amber-700">Chờ duyệt – {type.approve}</span>
                                        : <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle className="w-4 h-4" />Đã duyệt bởi {detail.approvedBy}</span>],
                                    ['Người đăng ký', type.register],
                                    ['Người duyệt', type.approve],
                                    ['Điểm danh', detail.attendanceEnabled
                                        ? (detail.attendanceSource === 'camera'
                                            ? <span className="inline-flex items-center gap-1"><Video className="w-4 h-4 text-emerald-600" />Camera nhận diện khuôn mặt tại cửa phòng</span>
                                            : <span className="inline-flex items-center gap-1"><UserCheck className="w-4 h-4 text-amber-600" />Thư ký / chủ trì điểm danh tay (phòng không có camera)</span>)
                                        : <span className="text-slate-500">Không yêu cầu điểm danh</span>],
                                    ['Yêu cầu', (detail.requireReport || detail.requireConclusion || detail.restrictedView) ? (
                                        <div className="flex flex-wrap gap-1.5 text-xs">
                                            {detail.requireReport && <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-bold">Nộp báo cáo trước họp</span>}
                                            {detail.requireConclusion && <span className="px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700 font-bold">Trình ký kết luận sau họp</span>}
                                            {detail.restrictedView && <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 font-bold inline-flex items-center gap-1"><Lock className="w-3 h-3" />Chỉ thành viên xem chi tiết</span>}
                                        </div>
                                    ) : <span className="text-slate-500">Không</span>],
                                    ['Nhắc nhở', `Trước ${detail.reminderMinutes} phút (App, Web)`],
                                    ['Sự kiện lặp', detail.recurrence ? <span className="inline-flex items-center gap-1"><Repeat className="w-4 h-4" />{detail.recurrence}</span> : <span className="text-slate-500">Không lặp</span>],
                                ]} />
                            </Section>
                        </div>

                        <Section
                            title="Thành phần tham dự"
                            icon={Users}
                            extra={<>{detail.participantGroups} · <b className="text-midnight-indigo">{detail.attendance.length} người</b></>}
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/70 text-xs text-slate-blue">
                                        <tr className="text-left">
                                            <th className="px-4 py-2.5 w-12 text-center">STT</th>
                                            <th className="px-4 py-2.5">Họ tên</th>
                                            <th className="px-4 py-2.5">Mã CB</th>
                                            <th className="px-4 py-2.5">Chức danh</th>
                                            <th className="px-4 py-2.5">Đơn vị</th>
                                            <th className="px-4 py-2.5">Vai trò</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-platinum-tint/70">
                                        {[...detail.attendance]
                                            .sort((a, b) => ['host', 'secretary', 'attendee'].indexOf(a.role) - ['host', 'secretary', 'attendee'].indexOf(b.role))
                                            .map((a, i) => (
                                                <tr key={a.code} className={a.isMe ? 'bg-blue-50/50' : i % 2 ? 'bg-slate-50/30' : ''}>
                                                    <td className="px-4 py-2.5 text-center text-slate-blue">{i + 1}</td>
                                                    <td className="px-4 py-2.5 font-semibold text-midnight-indigo">
                                                        {a.name}
                                                        {a.isMe && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-action-blue text-white text-[10px] font-bold align-middle">Bạn</span>}
                                                    </td>
                                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-blue">{a.code}</td>
                                                    <td className="px-4 py-2.5 text-slate-blue">{a.title || '—'}</td>
                                                    <td className="px-4 py-2.5 text-slate-blue">{a.unit}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${ROLE_BADGE[a.role]}`}>{ROLE_LABEL[a.role]}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    </div>
                )}

                {tab !== 'info' && blocked && (
                    <p className="py-10 text-center text-sm text-slate-blue">
                        {detail.status === 'cancelled' ? 'Lịch đã hủy – không điểm danh.' : 'Lịch chưa được duyệt – chưa mở điểm danh.'}
                    </p>
                )}
                {tab !== 'info' && !blocked && !detail.attendanceEnabled && (
                    <p className="py-10 text-center text-sm text-slate-blue">Cuộc họp này được đăng ký <b>không cần điểm danh</b>.</p>
                )}

                {tab === 'attendance' && !blocked && detail.attendanceEnabled && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-blue">
                            <span className="font-semibold">Nguồn: {detail.attendanceSource === 'camera' ? 'Camera nhận diện khuôn mặt' : 'Điểm danh tay'}</span>
                            <span>· Trễ &gt; {ATTENDANCE_RULES.lateAfterMin}′ sau giờ bắt đầu · Về sớm &gt; {ATTENDANCE_RULES.earlyBeforeMin}′ trước giờ kết thúc</span>
                            {locked && <span className="ml-auto inline-flex items-center gap-1 font-bold text-slate-600"><Lock className="w-3.5 h-3.5" />Đã khóa sau khi cuộc họp kết thúc</span>}
                            {!locked && canManage && <span className="ml-auto font-bold text-action-blue">Bạn là {ROLE_LABEL[detail.myRole].toLowerCase()} – có thể điểm danh tay</span>}
                        </div>

                        {me && !canManage && (
                            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 text-xs space-y-2">
                                <div className="flex items-center gap-2"><span className="font-bold text-midnight-indigo">Điểm danh của bạn:</span><StatusPill row={me} /><span>Điểm: <b>{me.points}</b></span></div>
                                {me.reason ? (
                                    <p>Lý do: <i>{me.reason}</i> – {me.reasonStatus === 'approved' ? <b className="text-emerald-700">đã được duyệt</b> : <b className="text-amber-700">chờ chủ trì/thư ký duyệt</b>}</p>
                                ) : !locked ? (
                                    <form
                                        className="flex gap-2"
                                        onSubmit={(e) => { e.preventDefault(); const v = e.target.reason.value.trim(); if (v) setMyReason(v); }}
                                    >
                                        <input name="reason" placeholder="Ghi chú lý do vắng / đi trễ / về sớm…" className="flex-1 px-3 py-1.5 border border-platinum-tint rounded-lg bg-white" />
                                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-action-blue text-white font-bold">Gửi lý do</button>
                                    </form>
                                ) : <p className="text-slate-500 inline-flex items-center gap-1"><Lock className="w-3 h-3" />Đã khóa ghi lý do sau khi cuộc họp kết thúc.</p>}
                            </div>
                        )}

                        <div className="overflow-x-auto border border-platinum-tint rounded-xl">
                            <table className="w-full text-xs">
                                <thead className="bg-cloud-mist/40 text-slate-blue">
                                    <tr className="text-left">
                                        <th className="px-3 py-2">Thành viên</th>
                                        <th className="px-3 py-2">Giờ vào</th>
                                        <th className="px-3 py-2">Giờ ra</th>
                                        <th className="px-3 py-2">Tình trạng</th>
                                        <th className="px-3 py-2 text-right">Điểm</th>
                                        <th className="px-3 py-2">Ghi chú / lý do</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-platinum-tint/60">
                                    {rows.map((r) => {
                                        const editable = canManage && !locked && started;
                                        return (
                                            <tr key={r.code} className={r.isMe ? 'bg-blue-50/30' : ''}>
                                                <td className="px-3 py-2">
                                                    <div className="font-bold text-midnight-indigo">{r.name}{r.isMe && ' (bạn)'}</div>
                                                    <div className="text-[10px] text-slate-blue">{r.code} · {r.unit}{r.role !== 'attendee' ? ` · ${ROLE_LABEL[r.role]}` : ''}</div>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {editable ? (
                                                        <input type="time" value={toHHMM(r.checkInAt)} onChange={(e) => setManualTime(r, e.target.value)} className="px-1 py-0.5 border border-platinum-tint rounded" />
                                                    ) : fmtTime(r.checkInAt)}
                                                    {r.source === 'manual' && r.checkInAt && <div className="text-[10px] text-slate-400">nhập tay</div>}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">{fmtTime(r.checkOutAt)}{live && r.inside && <div className="text-[10px] text-emerald-600 font-bold">đang trong phòng</div>}</td>
                                                <td className="px-3 py-2">
                                                    {editable ? (
                                                        <select
                                                            value={overrides[r.code]?.status || ''}
                                                            onChange={(e) => setOverride(r.code, { status: e.target.value || undefined })}
                                                            className="px-1 py-0.5 border border-platinum-tint rounded bg-white"
                                                        >
                                                            <option value="">{r.source === 'camera' ? 'Theo camera' : 'Chưa chọn'}: {ATTENDANCE_STATUS[detail.attendance.find((a) => a.code === r.code).status]?.label}</option>
                                                            {MANUAL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                                        </select>
                                                    ) : <StatusPill row={r} />}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-bold ${r.points < 0 ? 'text-red-600' : 'text-midnight-indigo'}`}>{r.points}</td>
                                                <td className="px-3 py-2 min-w-[180px]">
                                                    {r.reason && (
                                                        <div className="text-[11px]">
                                                            <i>{r.reason}</i>{' '}
                                                            {r.reasonStatus === 'approved'
                                                                ? <span className="text-emerald-700 font-bold">· đã duyệt</span>
                                                                : editable
                                                                    ? <button type="button" onClick={() => setOverride(r.code, { reasonApproved: true })} className="text-action-blue font-bold underline">Duyệt lý do</button>
                                                                    : <span className="text-amber-700 font-bold">· chờ duyệt</span>}
                                                        </div>
                                                    )}
                                                    {editable ? (
                                                        <input
                                                            value={overrides[r.code]?.note || ''}
                                                            onChange={(e) => setOverride(r.code, { note: e.target.value })}
                                                            placeholder="Ghi chú của thư ký…"
                                                            className="mt-1 w-full px-2 py-0.5 border border-platinum-tint rounded"
                                                        />
                                                    ) : r.note && <div className="text-[11px] text-slate-blue">{r.note}</div>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {!started && <p className="text-xs text-slate-blue">Cuộc họp chưa diễn ra – điểm danh mở khi đến giờ họp. Bạn vẫn có thể gửi lý do vắng trước.</p>}
                        {canManage && !locked && started && <p className="text-[11px] text-amber-700">Thay đổi điểm danh tay chỉ lưu tạm trên trình duyệt (Demo – chưa lưu BE).</p>}
                    </div>
                )}

                {tab === 'access' && !blocked && detail.attendanceEnabled && (
                    detail.attendanceSource !== 'camera' ? (
                        <p className="py-10 text-center text-sm text-slate-blue">Phòng này không có camera – không có log ra vào, thư ký điểm danh tay.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <StatCard label="Đang trong phòng" value={live ? rows.filter((r) => r.inside).length : '--'} icon={Users} tone={live ? 'green' : 'neutral'} hint={live ? 'Cập nhật 3 giây/lần' : 'Chỉ khi đang họp'} />
                                <StatCard label="Lượt vào" value={detail.accessLog.filter((e) => e.direction === 'in').length} icon={LogIn} />
                                <StatCard label="Lượt ra" value={detail.accessLog.filter((e) => e.direction === 'out').length} icon={LogOut} />
                                <StatCard label="Chưa định danh" value={detail.accessLog.filter((e) => e.unknown).length} icon={ShieldAlert} tone={detail.accessLog.some((e) => e.unknown) ? 'red' : 'neutral'} />
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-blue">
                                <span>{detail.room.door} · camera nhận diện khuôn mặt</span>
                                {live && <span className="inline-flex items-center gap-1.5 font-bold text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />Trực tiếp · {fmtTimeSec(nowTs)}</span>}
                            </div>
                            {detail.accessLog.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-blue">{started ? 'Chưa có lượt ra vào nào.' : 'Cuộc họp chưa diễn ra.'}</p>
                            ) : (
                                <div className="border border-platinum-tint rounded-xl divide-y divide-platinum-tint/60 max-h-[600px] overflow-y-auto">
                                    {detail.accessLog.map((e) => {
                                        const fresh = nowTs - new Date(e.time).getTime() < 90000;
                                        return (
                                            <div key={`${e.time}-${e.code}-${e.direction}`} className={`px-3 py-2 flex items-center gap-3 text-xs ${fresh ? 'bg-emerald-50/60' : ''}`}>
                                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${e.unknown ? 'bg-red-50 text-red-600' : e.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                                                    {e.direction === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold text-midnight-indigo truncate">{e.name}{e.code && <span className="font-normal text-slate-blue"> · {e.code}</span>}</div>
                                                    <div className="text-[10px] text-slate-blue truncate">{e.unit} · {e.direction === 'in' ? 'Vào' : 'Ra'} · độ khớp {Math.round(e.confidence * 100)}%</div>
                                                </div>
                                                {fresh && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold">MỚI</span>}
                                                <span className="font-mono text-slate-blue">{fmtTimeSec(e.time)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )
                )}

                {tab === 'report' && !blocked && detail.attendanceEnabled && (
                    <div className="space-y-4">
                        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${live ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
                            {[
                                ['all', 'Được mời', Users, 'neutral', 'Bấm thẻ để lọc danh sách'],
                                ['arrived', 'Đã đến', UserCheck, 'green', started ? `${Math.round((count('arrived') / sum.invited) * 100)}% thành viên` : 'Chưa diễn ra'],
                                ['late', 'Đi trễ', Clock, 'amber', `Vào sau ${ATTENDANCE_RULES.lateAfterMin} phút`],
                                ['early', 'Về sớm', LogOut, 'amber', `Ra trước ${ATTENDANCE_RULES.earlyBeforeMin} phút`],
                                ['absent', 'Vắng mặt', ShieldAlert, 'red', `${sum.excused} trường hợp có lý do được duyệt`],
                                live && ['not_arrived', 'Chưa đến', Clock, 'slate', 'Đang trong giờ họp'],
                            ].filter(Boolean).map(([key, label, Icon, tone, hint]) => (
                                <StatCard
                                    key={key}
                                    label={label}
                                    value={key === 'all' || started ? count(key) : '--'}
                                    icon={Icon}
                                    tone={tone}
                                    hint={hint}
                                    active={reportFilter === key && key !== 'all'}
                                    onClick={() => setReportFilter(reportFilter === key ? 'all' : key)}
                                />
                            ))}
                        </div>
                        {started && (
                            <div>
                                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                                    {[['present', 'bg-emerald-500'], ['late', 'bg-amber-400'], ['early_only', 'bg-orange-400'], ['absent', 'bg-red-500'], ['not_arrived', 'bg-slate-300']].map(([k, c]) => {
                                        const n = k === 'early_only' ? rows.filter((r) => r.status === 'early_leave').length : count(k);
                                        return n > 0 && (
                                            <button
                                                key={k}
                                                type="button"
                                                title={REPORT_FILTERS[k === 'early_only' ? 'early' : k].label}
                                                onClick={() => setReportFilter(k === 'early_only' ? 'early' : k)}
                                                className={`${c} hover:opacity-80`}
                                                style={{ width: `${(n / sum.invited) * 100}%` }}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-slate-blue">
                                    {[['present', 'bg-emerald-500', 'Có mặt'], ['late', 'bg-amber-400', 'Đi trễ'], ['early', 'bg-orange-400', 'Về sớm'], ['absent', 'bg-red-500', 'Vắng'], live && ['not_arrived', 'bg-slate-300', 'Chưa đến']].filter(Boolean).map(([k, c, l]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => setReportFilter(reportFilter === k ? 'all' : k)}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full border transition-colors ${reportFilter === k ? 'border-action-blue bg-blue-50 text-action-blue font-bold' : 'border-transparent hover:border-platinum-tint'}`}
                                        >
                                            <i className={`inline-block w-2 h-2 rounded-full mr-1 ${c}`} />{l} {count(k)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border border-platinum-tint rounded-xl overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-cloud-mist/50 border-b border-platinum-tint">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-midnight-indigo">Danh sách thành viên</h3>
                                {reportFilter !== 'all' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-action-blue text-[11px] font-bold">
                                        Lọc: {REPORT_FILTERS[reportFilter].label}
                                        <button type="button" onClick={() => setReportFilter('all')} className="ml-0.5 hover:text-red-600" aria-label="Bỏ lọc">×</button>
                                    </span>
                                )}
                                <span className="ml-auto text-xs text-slate-blue"><b className="text-midnight-indigo">{reportRows.length}</b> / {rows.length} người · bấm tiêu đề cột để sắp xếp</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50/70 text-slate-blue text-left">
                                        <tr>
                                            <th className="px-3 py-2 w-10 text-center">#</th>
                                            <SortTh label="Họ tên" k="name" sort={sort} onSort={toggleSort} />
                                            <SortTh label="Giờ vào" k="checkInAt" sort={sort} onSort={toggleSort} />
                                            <SortTh label="Giờ ra" k="checkOutAt" sort={sort} onSort={toggleSort} />
                                            <SortTh label="Tình trạng" k="status" sort={sort} onSort={toggleSort} />
                                            <SortTh label="Điểm" k="points" sort={sort} onSort={toggleSort} className="text-right" />
                                            <th className="px-3 py-2">Lý do / ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-platinum-tint/60">
                                        {reportRows.length === 0 && (
                                            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-blue">Không có thành viên nào ở nhóm này.</td></tr>
                                        )}
                                        {reportRows.map((r, i) => (
                                            <tr key={r.code} className={r.isMe ? 'bg-blue-50/40' : ''}>
                                                <td className="px-3 py-2 text-center text-slate-blue">{i + 1}</td>
                                                <td className="px-3 py-2">
                                                    <div className="font-bold text-midnight-indigo">{r.name}{r.isMe && ' (bạn)'}</div>
                                                    <div className="text-[10px] text-slate-blue">{r.code} · {r.unit}{r.role !== 'attendee' ? ` · ${ROLE_LABEL[r.role]}` : ''}</div>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">{fmtTime(r.checkInAt)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{fmtTime(r.checkOutAt)}</td>
                                                <td className="px-3 py-2"><StatusPill row={r} /></td>
                                                <td className={`px-3 py-2 text-right font-bold ${r.points < 0 ? 'text-red-600' : 'text-midnight-indigo'}`}>{r.points}</td>
                                                <td className="px-3 py-2 text-slate-blue">
                                                    {r.reason ? <><i>{r.reason}</i> · {r.reasonStatus === 'approved' ? 'đã duyệt' : 'chờ duyệt'}</> : r.note || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl border border-platinum-tint bg-cloud-mist/20">
                            <div className="text-sm">Tổng điểm trừ cuộc họp: <b className={sum.points < 0 ? 'text-red-600' : ''}>{sum.points}</b>{live && <span className="text-xs text-slate-blue"> (tạm tính)</span>}</div>
                            <button type="button" onClick={() => exportCsv(detail, reportRows)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-action-blue text-white text-xs font-bold">
                                <Download className="w-3.5 h-3.5" /> {reportFilter === 'all' ? 'Xuất danh sách (CSV)' : `Xuất ${reportRows.length} người đang lọc (CSV)`}
                            </button>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-midnight-indigo mb-1">Cấu hình vi phạm áp dụng</p>
                            <table className="w-full text-xs border border-platinum-tint rounded-xl overflow-hidden">
                                <tbody className="divide-y divide-platinum-tint/60">
                                    <tr><td className="px-3 py-1.5">Có mặt</td><td className="px-3 py-1.5 font-bold">0</td><td className="px-3 py-1.5 text-slate-blue">Vào trước/sau giờ bắt đầu ≤ {ATTENDANCE_RULES.lateAfterMin} phút</td></tr>
                                    <tr><td className="px-3 py-1.5">Vắng mặt</td><td className="px-3 py-1.5 font-bold text-red-600">-2</td><td className="px-3 py-1.5 text-slate-blue">Không ghi nhận giờ và không lý do / lý do không được duyệt</td></tr>
                                    <tr><td className="px-3 py-1.5">Đi trễ</td><td className="px-3 py-1.5 font-bold text-red-600">-1</td><td className="px-3 py-1.5 text-slate-blue">Vào sau {ATTENDANCE_RULES.lateAfterMin} phút</td></tr>
                                    <tr><td className="px-3 py-1.5">Về sớm</td><td className="px-3 py-1.5 font-bold text-red-600">-1</td><td className="px-3 py-1.5 text-slate-blue">Ra trước giờ kết thúc {ATTENDANCE_RULES.earlyBeforeMin} phút (camera hoặc thư ký ghi nhận)</td></tr>
                                    <tr><td className="px-3 py-1.5">Có lý do được duyệt</td><td className="px-3 py-1.5 font-bold">0</td><td className="px-3 py-1.5 text-slate-blue">Chủ trì / thư ký duyệt lý do</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MockMeetingDetailPage;
