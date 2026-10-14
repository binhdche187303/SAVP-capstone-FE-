import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2 } from 'lucide-react';
import { getPublicPurposes, getPublicHost, createPublicRegistration } from '../../service/visitorService';
import PublicShell from '../../components/visitor/PublicShell';
import FaceCapture from '../../components/visitor/FaceCapture';
import HostPicker from '../../components/visitor/HostPicker';
import VisitQr from '../../components/visitor/VisitQr';
import VisitStatusBadge from '../../components/visitor/VisitStatusBadge';
import { Field, defaultSchedule, emptyVisitor, CONSENT_TEXT } from '../../components/visitor/formKit';
import { fmtTimeRange, fromLocalInput } from '../../components/visitor/visitLabels';
import { cardCls, inputCls, btnPrimary, btnGhost } from '../../components/common/uiClasses';

// S1 (2.10): khách tự đăng ký trực tuyến, 4 bước. Không cần đăng nhập.
const STEPS = ['Thông tin khách', 'Chuyến thăm', 'Ảnh khuôn mặt', 'Xác nhận'];
const DAY_MS = 24 * 60 * 60 * 1000;

// Cùng thông điệp với kiểm tra phía máy chủ (BR-V1, BR-V2) để báo lỗi ngay tại bước đang nhập.
const validateStep = (step, form) => {
    const { visitor, host, purpose, schedule, consent } = form;
    if (step === 0) {
        if (!visitor.fullName.trim()) return 'Vui lòng nhập họ tên khách';
        if (!/^0\d{9}$/.test(visitor.phone.trim())) return 'Số điện thoại không hợp lệ';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitor.email.trim())) return 'Vui lòng nhập email hợp lệ để nhận kết quả';
    }
    if (step === 1) {
        if (!host) return 'Vui lòng chọn người cần gặp';
        if (!purpose) return 'Vui lòng chọn mục đích';
        const from = new Date(schedule.scheduledFrom).getTime();
        const to = new Date(schedule.scheduledTo).getTime();
        if (Number.isNaN(from) || from < Date.now() - 5 * 60 * 1000) return 'Thời gian bắt đầu không được ở quá khứ';
        if (Number.isNaN(to) || to <= from) return 'Thời gian kết thúc phải sau thời gian bắt đầu';
        if (to - from > 7 * DAY_MS) return 'Khung giờ hẹn tối đa 7 ngày';
    }
    if (step === 2) {
        if (!visitor.photo) return 'Vui lòng chụp hoặc tải ảnh khuôn mặt';
        if (!consent) return 'Cần đồng ý xử lý dữ liệu sinh trắc để tiếp tục';
    }
    return null;
};

const initialForm = () => ({ visitor: emptyVisitor(), host: null, purpose: '', companions: 0, schedule: defaultSchedule(), consent: false });

const SummaryRow = ({ label, children }) => (
    <div className="flex justify-between gap-4 py-2 border-b border-pale-gray last:border-0 text-xs">
        <span className="text-slate-blue">{label}</span>
        <span className="font-semibold text-midnight-indigo text-right">{children}</span>
    </div>
);

const VisitorRegister = () => {
    const [purposes, setPurposes] = useState([]);
    const [step, setStep] = useState(0);
    const [form, setForm] = useState(initialForm);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [created, setCreated] = useState(null);
    const [searchParams] = useSearchParams();
    const invitedHostId = searchParams.get('host');

    useEffect(() => {
        getPublicPurposes().then((res) => { if (res?.success) setPurposes(res.data.purposes); });
    }, []);

    // Link mời của người được gặp: chọn sẵn người cần gặp, khách vẫn đổi được.
    useEffect(() => {
        if (!invitedHostId) return;
        getPublicHost(invitedHostId).then((res) => {
            if (res?.success) setForm((prev) => (prev.host ? prev : { ...prev, host: res.data }));
        });
    }, [invitedHostId]);

    const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));
    const setV = (changes) => setForm((prev) => ({ ...prev, visitor: { ...prev.visitor, ...changes } }));
    const full = `${inputCls} w-full`;

    const goNext = () => {
        const message = validateStep(step, form);
        setError(message);
        if (!message) setStep((s) => s + 1);
    };
    const goBack = () => { setError(null); setStep((s) => s - 1); };

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        const res = await createPublicRegistration({
            visitor: form.visitor,
            hostId: form.host.id,
            purpose: form.purpose,
            companions: form.companions,
            scheduledFrom: fromLocalInput(form.schedule.scheduledFrom),
            scheduledTo: fromLocalInput(form.schedule.scheduledTo),
            consent: form.consent,
        });
        if (res?.success) setCreated(res.data);
        else setError(res?.message || 'Không gửi được đăng ký');
        setSubmitting(false);
    };

    const restart = () => { setCreated(null); setForm(initialForm()); setStep(0); setError(null); };

    if (created) {
        return (
            <PublicShell title="Đã nhận đăng ký" subtitle="Vui lòng lưu lại mã lượt để tra cứu và xuất trình khi cần.">
                <div className={`${cardCls} p-8 text-center space-y-4`}>
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                    <VisitQr code={created.code} />
                    <div><VisitStatusBadge status={created.status} /></div>
                    <p className="text-xs text-slate-blue">
                        Người được gặp sẽ xem và duyệt đăng ký. Kết quả sẽ được gửi tới <strong>{created.visitor.email}</strong>.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        <Link to={`/visitor/status/${created.code}`} className={btnPrimary}>Tra cứu trạng thái</Link>
                        <button type="button" className={btnGhost} onClick={restart}>Đăng ký lượt khác</button>
                    </div>
                </div>
            </PublicShell>
        );
    }

    return (
        <PublicShell title="Đăng ký khách đến làm việc" subtitle="Đăng ký trước để được cấp quyền ra vào và xác thực nhanh bằng khuôn mặt tại cổng.">
            <ol className="flex items-center justify-between gap-2">
                {STEPS.map((label, i) => (
                    <li key={label} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-action-blue text-white' : 'bg-pale-gray text-slate-blue'}`}>
                            {i < step ? <Check className="w-4 h-4" /> : i + 1}
                        </span>
                        <span className={`text-[11px] text-center ${i === step ? 'font-bold text-midnight-indigo' : 'text-slate-blue'}`}>{label}</span>
                    </li>
                ))}
            </ol>

            <div className={`${cardCls} p-6 space-y-5`}>
                {step === 0 && (
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Họ tên" htmlFor="vr-name" required>
                            <input id="vr-name" className={full} value={form.visitor.fullName} onChange={(e) => setV({ fullName: e.target.value })} />
                        </Field>
                        <Field label="Số điện thoại" htmlFor="vr-phone" required>
                            <input id="vr-phone" className={full} value={form.visitor.phone} onChange={(e) => setV({ phone: e.target.value })} placeholder="09xxxxxxxx" />
                        </Field>
                        <Field label="Email" htmlFor="vr-email" required>
                            <input id="vr-email" type="email" className={full} value={form.visitor.email} onChange={(e) => setV({ email: e.target.value })} placeholder="Nhận kết quả duyệt qua email" />
                        </Field>
                        <Field label="Số CCCD / hộ chiếu" htmlFor="vr-id">
                            <input id="vr-id" className={full} value={form.visitor.idNumber} onChange={(e) => setV({ idNumber: e.target.value })} />
                        </Field>
                        <Field label="Đơn vị công tác" htmlFor="vr-org" className="sm:col-span-2">
                            <input id="vr-org" className={full} value={form.visitor.organization} onChange={(e) => setV({ organization: e.target.value })} />
                        </Field>
                    </div>
                )}

                {step === 1 && (
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Người cần gặp" htmlFor="vr-host" required className="sm:col-span-2">
                            <HostPicker value={form.host} onChange={(host) => patch({ host })} inputId="vr-host" />
                        </Field>
                        <Field label="Mục đích" htmlFor="vr-purpose" required>
                            <select id="vr-purpose" className={full} value={form.purpose} onChange={(e) => patch({ purpose: e.target.value })}>
                                <option value="">Chọn mục đích</option>
                                {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </Field>
                        <Field label="Số người đi cùng" htmlFor="vr-companions">
                            <input id="vr-companions" type="number" min="0" max="20" className={full} value={form.companions} onChange={(e) => patch({ companions: e.target.value })} />
                        </Field>
                        <Field label="Bắt đầu" htmlFor="vr-from" required>
                            <input id="vr-from" type="datetime-local" className={full} value={form.schedule.scheduledFrom} onChange={(e) => patch({ schedule: { ...form.schedule, scheduledFrom: e.target.value } })} />
                        </Field>
                        <Field label="Kết thúc" htmlFor="vr-to" required>
                            <input id="vr-to" type="datetime-local" className={full} value={form.schedule.scheduledTo} onChange={(e) => patch({ schedule: { ...form.schedule, scheduledTo: e.target.value } })} />
                        </Field>
                        <Field label="Biển số xe (nếu có)" htmlFor="vr-plate" className="sm:col-span-2">
                            <input id="vr-plate" className={full} value={form.visitor.plateNumber} onChange={(e) => setV({ plateNumber: e.target.value })} placeholder="30A-123.45" />
                        </Field>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <FaceCapture value={form.visitor.photo} onChange={(photo) => setV({ photo })} />
                        <label className="flex items-start gap-2 text-xs text-midnight-indigo">
                            <input type="checkbox" className="mt-0.5" checked={form.consent} onChange={(e) => patch({ consent: e.target.checked })} />
                            {CONSENT_TEXT}
                        </label>
                    </div>
                )}

                {step === 3 && (
                    <div className="flex flex-col sm:flex-row gap-5">
                        <img src={form.visitor.photo} alt="Ảnh khuôn mặt đã chụp" className="w-28 h-28 rounded-2xl object-cover border border-platinum-tint mx-auto sm:mx-0" />
                        <div className="flex-1">
                            <SummaryRow label="Khách">{form.visitor.fullName}</SummaryRow>
                            <SummaryRow label="Liên hệ">{form.visitor.phone} · {form.visitor.email}</SummaryRow>
                            <SummaryRow label="Đơn vị công tác">{form.visitor.organization || '—'}</SummaryRow>
                            <SummaryRow label="Người cần gặp">{form.host?.fullName} — {form.host?.departmentName}</SummaryRow>
                            <SummaryRow label="Mục đích">{form.purpose}</SummaryRow>
                            <SummaryRow label="Thời gian">{fmtTimeRange(fromLocalInput(form.schedule.scheduledFrom), fromLocalInput(form.schedule.scheduledTo))}</SummaryRow>
                            <SummaryRow label="Đi cùng">{Number(form.companions) || 0} người</SummaryRow>
                        </div>
                    </div>
                )}

                {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

                <div className="flex justify-between pt-2">
                    <button type="button" className={btnGhost} onClick={goBack} disabled={step === 0 || submitting}>Quay lại</button>
                    {step < STEPS.length - 1
                        ? <button type="button" className={btnPrimary} onClick={goNext}>Tiếp tục</button>
                        : <button type="button" className={btnPrimary} onClick={submit} disabled={submitting}>{submitting ? 'Đang gửi…' : 'Gửi đăng ký'}</button>}
                </div>
            </div>

            <p className="text-center text-xs text-slate-blue">
                Đã đăng ký? <Link to="/visitor/status" className="font-semibold text-action-blue hover:underline">Tra cứu trạng thái</Link>
            </p>
        </PublicShell>
    );
};

export default VisitorRegister;
