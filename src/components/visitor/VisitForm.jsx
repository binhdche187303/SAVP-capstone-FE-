import { useState } from 'react';
import { inputCls, btnPrimary } from '../common/uiClasses';
import { fromLocalInput } from './visitLabels';
import { Field, defaultSchedule, emptyVisitor, CONSENT_TEXT } from './formKit';
import FaceCapture from './FaceCapture';
import HostPicker from './HostPicker';

const ME_HOST_ID = 'host-me';

// Form một trang cho lễ tân (walk_in) và người được gặp (host_invite).
// onSubmit(payload) nhận đúng dạng payload tạo lượt của visitorService.createVisit.
const VisitForm = ({ mode, lookups = {}, onSubmit, submitting, error }) => {
    const isWalkIn = mode === 'walk_in';
    const [visitor, setVisitor] = useState(emptyVisitor);
    const [host, setHost] = useState(null);
    const [purpose, setPurpose] = useState('');
    const [companions, setCompanions] = useState(0);
    const [schedule, setSchedule] = useState(() => defaultSchedule(isWalkIn));
    const [consent, setConsent] = useState(false);

    const setV = (patch) => setVisitor((prev) => ({ ...prev, ...patch }));
    const full = `${inputCls} w-full`;

    const submit = (e) => {
        e.preventDefault();
        onSubmit({
            channel: mode,
            visitor,
            hostId: isWalkIn ? host?.id : ME_HOST_ID,
            purpose,
            companions,
            scheduledFrom: fromLocalInput(schedule.scheduledFrom),
            scheduledTo: fromLocalInput(schedule.scheduledTo),
            consent,
        });
    };

    return (
        <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Họ tên khách" htmlFor="vf-name" required>
                    <input id="vf-name" className={full} value={visitor.fullName} onChange={(e) => setV({ fullName: e.target.value })} />
                </Field>
                <Field label="Số điện thoại" htmlFor="vf-phone" required>
                    <input id="vf-phone" className={full} value={visitor.phone} onChange={(e) => setV({ phone: e.target.value })} placeholder="09xxxxxxxx" />
                </Field>
                <Field label="Số CCCD / hộ chiếu" htmlFor="vf-id">
                    <input id="vf-id" className={full} value={visitor.idNumber} onChange={(e) => setV({ idNumber: e.target.value })} />
                </Field>
                <Field label="Email" htmlFor="vf-email">
                    <input id="vf-email" type="email" className={full} value={visitor.email} onChange={(e) => setV({ email: e.target.value })} />
                </Field>
                <Field label="Đơn vị công tác" htmlFor="vf-org">
                    <input id="vf-org" className={full} value={visitor.organization} onChange={(e) => setV({ organization: e.target.value })} />
                </Field>
                <Field label="Biển số xe" htmlFor="vf-plate">
                    <input id="vf-plate" className={full} value={visitor.plateNumber} onChange={(e) => setV({ plateNumber: e.target.value })} placeholder="30A-123.45" />
                </Field>
                {isWalkIn && (
                    <Field label="Người cần gặp" htmlFor="vf-host" required className="sm:col-span-2">
                        <HostPicker value={host} onChange={setHost} inputId="vf-host" />
                    </Field>
                )}
                <Field label="Mục đích" htmlFor="vf-purpose" required>
                    <select id="vf-purpose" className={full} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                        <option value="">Chọn mục đích</option>
                        {(lookups.purposes || []).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </Field>
                <Field label="Số người đi cùng" htmlFor="vf-companions">
                    <input id="vf-companions" type="number" min="0" max="20" className={full} value={companions} onChange={(e) => setCompanions(e.target.value)} />
                </Field>
                <Field label="Bắt đầu" htmlFor="vf-from" required>
                    <input id="vf-from" type="datetime-local" className={full} value={schedule.scheduledFrom} onChange={(e) => setSchedule((s) => ({ ...s, scheduledFrom: e.target.value }))} />
                </Field>
                <Field label="Kết thúc" htmlFor="vf-to" required>
                    <input id="vf-to" type="datetime-local" className={full} value={schedule.scheduledTo} onChange={(e) => setSchedule((s) => ({ ...s, scheduledTo: e.target.value }))} />
                </Field>
            </div>

            {isWalkIn ? (
                <>
                    <FaceCapture value={visitor.photo} onChange={(photo) => setV({ photo })} />
                    <label className="flex items-start gap-2 text-xs text-midnight-indigo">
                        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        {CONSENT_TEXT}
                    </label>
                </>
            ) : (
                <p className="text-[11px] text-slate-blue">Khách được mời chưa có ảnh khuôn mặt; lễ tân sẽ chụp bổ sung khi khách đến.</p>
            )}

            {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
            <div className="flex justify-end">
                <button type="submit" className={btnPrimary} disabled={submitting}>
                    {submitting ? 'Đang lưu…' : isWalkIn ? 'Đăng ký và cấp quyền' : 'Gửi lời mời'}
                </button>
            </div>
        </form>
    );
};

export default VisitForm;
