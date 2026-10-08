import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, SearchX } from 'lucide-react';
import { getPublicRegistration } from '../../service/visitorService';
import PublicShell from '../../components/visitor/PublicShell';
import VisitQr from '../../components/visitor/VisitQr';
import VisitStatusBadge from '../../components/visitor/VisitStatusBadge';
import { VISIT_STATUS_META, fmtDateTime, fmtTimeRange } from '../../components/visitor/visitLabels';
import { cardCls, inputCls, labelCls, btnPrimary, spinnerCls } from '../../components/common/uiClasses';

// S2 (2.10): khách tra cứu trạng thái đăng ký bằng mã lượt. Không cần đăng nhập,
// không hiển thị số giấy tờ, điện thoại, email.
const STEPS = ['Đã gửi', 'Đã duyệt', 'Đã vào', 'Đã rời'];
const REACHED = { pending_approval: 0, approved: 1, checked_in: 2, checked_out: 3 };
const CLOSED_NOTE = {
    rejected: 'Đăng ký không được chấp thuận.',
    cancelled: 'Lượt đăng ký đã bị hủy.',
    revoked: 'Quyền ra vào đã bị thu hồi.',
    expired: 'Lượt đăng ký đã hết hiệu lực vì khách không đến trong khung giờ được cấp.',
    must_leave: 'Quyền ra vào đã bị thu hồi. Vui lòng rời khuôn viên qua cổng gần nhất; cổng vẫn mở cho bạn ra.',
    exit_unrecorded: 'Hệ thống chưa ghi nhận giờ ra của bạn. Nếu bạn đã rời khuôn viên thì không cần làm gì thêm.',
};

const Row = ({ label, children }) => (
    <div className="flex justify-between gap-4 py-2 border-b border-pale-gray last:border-0 text-xs">
        <span className="text-slate-blue">{label}</span>
        <span className="font-semibold text-midnight-indigo text-right">{children}</span>
    </div>
);

const VisitorStatus = () => {
    const { code } = useParams();
    const navigate = useNavigate();
    const [input, setInput] = useState(code || '');
    const [visit, setVisit] = useState(null);
    const [notFound, setNotFound] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setInput(code || '');
        setVisit(null);
        setNotFound(null);
        if (!code) return undefined;
        let cancelled = false;
        setLoading(true);
        getPublicRegistration(code).then((res) => {
            if (cancelled) return;
            if (res?.success) setVisit(res.data);
            else setNotFound(res?.message || 'Không tìm thấy lượt đăng ký với mã này');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [code]);

    const lookup = (e) => {
        e.preventDefault();
        const wanted = input.trim().toUpperCase();
        if (wanted) navigate(`/visitor/status/${encodeURIComponent(wanted)}`);
    };

    const reached = visit ? REACHED[visit.status] : undefined;
    const closed = visit && reached === undefined;
    const granted = visit && ['approved', 'checked_in', 'checked_out'].includes(visit.status);

    return (
        <PublicShell title="Tra cứu đăng ký khách" subtitle="Nhập mã lượt khách bạn nhận được sau khi đăng ký.">
            <form onSubmit={lookup} className={`${cardCls} p-5 flex flex-wrap items-end gap-3`}>
                <div className="flex-1 min-w-[200px] space-y-1">
                    <label className={labelCls} htmlFor="vs-code">Mã lượt khách</label>
                    <input id="vs-code" className={`${inputCls} w-full uppercase`} placeholder="VS-261007-0001" value={input} onChange={(e) => setInput(e.target.value)} />
                </div>
                <button type="submit" className={btnPrimary}>Tra cứu</button>
            </form>

            {loading && <div className="flex justify-center py-10"><div className={spinnerCls} /></div>}

            {notFound && (
                <div className={`${cardCls} p-8 text-center space-y-3`}>
                    <SearchX className="w-10 h-10 text-steel-gray mx-auto" />
                    <p className="text-sm font-bold text-midnight-indigo">{notFound}</p>
                    <p className="text-xs text-slate-blue">Kiểm tra lại mã trong email xác nhận, hoặc đăng ký lượt mới.</p>
                    <Link to="/visitor/register" className={btnPrimary}>Đăng ký mới</Link>
                </div>
            )}

            {visit && (
                <div className={`${cardCls} p-6 space-y-6`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-lg font-bold text-midnight-indigo">{visit.visitor.fullName}</p>
                            <p className="text-xs text-slate-blue">{visit.visitor.organization || 'Khách cá nhân'}</p>
                        </div>
                        <VisitStatusBadge status={visit.status} overstay={visit.overstay} />
                    </div>

                    {closed ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 space-y-1">
                            <p className="font-bold">{VISIT_STATUS_META[visit.status]?.label}</p>
                            <p>{CLOSED_NOTE[visit.status]}</p>
                            {visit.rejectReason && <p>Lý do: {visit.rejectReason}</p>}
                        </div>
                    ) : (
                        <ol className="flex items-start justify-between gap-2">
                            {STEPS.map((label, i) => (
                                <li key={label} className="flex-1 flex flex-col items-center gap-1.5">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i <= reached ? 'bg-green-500 text-white' : 'bg-pale-gray text-slate-blue'}`}>
                                        {i <= reached ? <Check className="w-4 h-4" /> : i + 1}
                                    </span>
                                    <span className={`text-[11px] ${i <= reached ? 'font-bold text-midnight-indigo' : 'text-slate-blue'}`}>{label}</span>
                                </li>
                            ))}
                        </ol>
                    )}

                    <div>
                        <Row label="Người được gặp">{visit.hostName}</Row>
                        <Row label="Đơn vị tiếp">{visit.departmentName}</Row>
                        <Row label="Mục đích">{visit.purpose}</Row>
                        <Row label="Giờ hẹn">{fmtTimeRange(visit.scheduledFrom, visit.scheduledTo)}</Row>
                    </div>

                    {granted && (
                        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-2">
                            <p className="text-[10px] font-bold text-slate-blue uppercase">Quyền ra vào được cấp</p>
                            <p className="text-xs text-midnight-indigo">
                                Hiệu lực từ <strong>{fmtDateTime(visit.access.validFrom)}</strong> đến <strong>{fmtDateTime(visit.access.validTo)}</strong>
                            </p>
                            <ul className="flex flex-wrap gap-2">
                                {visit.zoneNames.map((name) => <li key={name} className="px-2 py-1 rounded-md bg-white border border-platinum-tint text-[11px] font-semibold text-midnight-indigo">{name}</li>)}
                            </ul>
                        </div>
                    )}

                    {!closed && (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <VisitQr code={visit.code} size={120} />
                            <p className="text-xs text-slate-blue">
                                Khi đến cổng, nhìn vào camera để xác thực khuôn mặt. Nếu không qua được, liên hệ quầy lễ tân và đọc mã lượt.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <p className="text-center text-xs text-slate-blue">
                Chưa đăng ký? <Link to="/visitor/register" className="font-semibold text-action-blue hover:underline">Đăng ký khách đến làm việc</Link>
            </p>
        </PublicShell>
    );
};

export default VisitorStatus;
