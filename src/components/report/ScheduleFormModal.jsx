import { useEffect, useState } from 'react';
import { Mail, Paperclip, X } from 'lucide-react';
import SimpleModal from '../common/SimpleModal';
import { inputCls, labelCls, btnPrimary, btnGhost } from '../common/uiClasses';
import { REPORT_TYPES, getReportDefinition } from '../../config/reportDefinitions';
import { createSchedule, updateSchedule } from '../../service/reportCenterService';
import { WEEKDAYS, PERIOD_LABELS, FREQUENCY_LABELS, FORMAT_LABELS, FORMAT_EXTENSIONS, samplePeriod } from './scheduleLabels';

const MAX_RECIPIENTS = 20;
const DEFAULT_MESSAGE = 'Kính gửi anh/chị, hệ thống gửi báo cáo định kỳ theo lịch đã thiết lập. Chi tiết xem file đính kèm.';

const blank = (initial) => ({
    name: '',
    reportType: initial?.reportType || REPORT_TYPES[0],
    filters: { ...(initial?.filters || {}) },
    period: 'last_week',
    frequency: 'weekly',
    time: '08:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    formats: ['pdf'],
    recipients: [],
    subject: '',
    message: DEFAULT_MESSAGE,
    enabled: true,
});

const fromSchedule = (s) => ({
    name: s.name,
    reportType: s.reportType,
    filters: { ...s.filters },
    period: s.period,
    frequency: s.frequency,
    time: s.time,
    dayOfWeek: s.dayOfWeek ?? 1,
    dayOfMonth: s.dayOfMonth ?? 1,
    formats: [...s.formats],
    recipients: s.recipients.map((r) => ({ ...r })),
    subject: s.subject,
    message: s.message,
    enabled: s.enabled,
});

const Section = ({ title, children }) => (
    <fieldset className="space-y-3">
        <legend className="text-xs font-bold text-midnight-indigo">{title}</legend>
        {children}
    </fieldset>
);

// Form tạo/sửa lịch gửi báo cáo tự động (S10).
// initial: ScheduleView (sửa) | { reportType, filters } (tạo mới điền sẵn) | null.
const ScheduleFormModal = ({ isOpen, initial, lookups = {}, onClose, onSaved }) => {
    const editing = Boolean(initial?.id);
    const [form, setForm] = useState(() => blank(initial));
    const [staffId, setStaffId] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setForm(initial?.id ? fromSchedule(initial) : blank(initial));
        setStaffId('');
        setEmail('');
        setError(null);
    }, [isOpen, initial]);

    const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));
    const definition = getReportDefinition(form.reportType);
    const full = `${inputCls} w-full`;

    const addRecipient = (recipient) => {
        if (form.recipients.length >= MAX_RECIPIENTS) { setError('Tối đa 20 người nhận'); return; }
        if (form.recipients.some((r) => r.value === recipient.value)) return;
        patch({ recipients: [...form.recipients, recipient] });
        setError(null);
    };
    const addStaff = (id) => {
        const person = (lookups.staff || []).find((s) => s.id === id);
        if (person) addRecipient({ type: 'user', value: person.id, label: person.name });
        setStaffId('');
    };
    const addEmail = () => {
        const value = email.trim();
        if (!value) return;
        addRecipient({ type: 'email', value, label: value });
        setEmail('');
    };
    const toggleFormat = (format) => patch({
        formats: form.formats.includes(format) ? form.formats.filter((f) => f !== format) : [...form.formats, format],
    });

    const save = async () => {
        setSaving(true);
        setError(null);
        const payload = {
            ...form,
            dayOfMonth: form.dayOfMonth === 'last' ? 'last' : Number(form.dayOfMonth),
            dayOfWeek: Number(form.dayOfWeek),
            subject: form.subject.trim() || `[SAVP] ${form.name.trim()}`,
        };
        const res = editing ? await updateSchedule(initial.id, payload) : await createSchedule(payload);
        setSaving(false);
        if (res?.success) onSaved(res.data);
        else setError(res?.message || 'Không lưu được lịch gửi');
    };

    const sample = samplePeriod(form.period);
    const title = editing ? 'Sửa lịch gửi báo cáo' : 'Tạo lịch gửi báo cáo';

    return (
        <SimpleModal
            isOpen={isOpen}
            title={title}
            onClose={onClose}
            size="lg"
            footer={(
                <>
                    <button type="button" className={btnGhost} onClick={onClose} disabled={saving}>Hủy</button>
                    <button type="button" className={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu lịch gửi'}</button>
                </>
            )}
        >
            <div className="space-y-6">
                <Section title="1. Báo cáo">
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1 sm:col-span-2">
                            <label className={labelCls} htmlFor="sf-name">Tên lịch gửi</label>
                            <input id="sf-name" className={full} value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="VD: Báo cáo khách hằng tuần cho Ban giám hiệu" />
                        </div>
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-type">Báo cáo</label>
                            <select id="sf-type" className={full} value={form.reportType} onChange={(e) => patch({ reportType: e.target.value, filters: {} })}>
                                {REPORT_TYPES.map((type) => <option key={type} value={type}>{getReportDefinition(type).title}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-period">Kỳ dữ liệu</label>
                            <select id="sf-period" className={full} value={form.period} onChange={(e) => patch({ period: e.target.value })}>
                                {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </div>
                        {definition.filters.map((filter) => {
                            const choices = filter.options
                                ? filter.options.map((o) => ({ value: o.value, label: o.label }))
                                : (lookups[filter.lookup] || []).map((o) => ({ value: o.id, label: o.name }));
                            return (
                                <div className="space-y-1" key={filter.key}>
                                    <label className={labelCls} htmlFor={`sf-filter-${filter.key}`}>{filter.label}</label>
                                    <select id={`sf-filter-${filter.key}`} className={full} value={form.filters[filter.key] || ''} onChange={(e) => patch({ filters: { ...form.filters, [filter.key]: e.target.value } })}>
                                        <option value="">Tất cả</option>
                                        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                <Section title="2. Tần suất">
                    <div className="grid sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-frequency">Tần suất</label>
                            <select id="sf-frequency" className={full} value={form.frequency} onChange={(e) => patch({ frequency: e.target.value })}>
                                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </div>
                        {form.frequency === 'weekly' && (
                            <div className="space-y-1">
                                <label className={labelCls} htmlFor="sf-weekday">Thứ</label>
                                <select id="sf-weekday" className={full} value={form.dayOfWeek} onChange={(e) => patch({ dayOfWeek: Number(e.target.value) })}>
                                    {WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>)}
                                </select>
                            </div>
                        )}
                        {form.frequency === 'monthly' && (
                            <div className="space-y-1">
                                <label className={labelCls} htmlFor="sf-monthday">Ngày trong tháng</label>
                                <select id="sf-monthday" className={full} value={form.dayOfMonth} onChange={(e) => patch({ dayOfMonth: e.target.value === 'last' ? 'last' : Number(e.target.value) })}>
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Ngày {d}</option>)}
                                    <option value="last">Ngày cuối tháng</option>
                                </select>
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-time">Giờ gửi</label>
                            <input id="sf-time" type="time" className={full} value={form.time} onChange={(e) => patch({ time: e.target.value })} />
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-blue">Giờ Việt Nam (UTC+7).</p>
                </Section>

                <Section title="3. Định dạng và người nhận">
                    <div className="flex flex-wrap gap-4">
                        {Object.entries(FORMAT_LABELS).map(([format, label]) => (
                            <label key={format} className="flex items-center gap-2 text-xs text-midnight-indigo">
                                <input type="checkbox" checked={form.formats.includes(format)} onChange={() => toggleFormat(format)} />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-staff">Thêm cán bộ</label>
                            <select id="sf-staff" className={full} value={staffId} onChange={(e) => addStaff(e.target.value)}>
                                <option value="">Chọn cán bộ nhận báo cáo</option>
                                {(lookups.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="sf-email">Thêm email</label>
                            <div className="flex gap-2">
                                <input
                                    id="sf-email"
                                    type="email"
                                    className={full}
                                    value={email}
                                    placeholder="ten@donvi.edu.vn"
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                                />
                                <button type="button" className={btnGhost} onClick={addEmail}>Thêm</button>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {form.recipients.map((r) => (
                            <span key={r.value} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pale-gray text-[11px] font-semibold text-midnight-indigo">
                                {r.label}
                                <button type="button" aria-label={`Bỏ ${r.label}`} onClick={() => patch({ recipients: form.recipients.filter((x) => x.value !== r.value) })}>
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                        <span className="text-[11px] text-slate-blue">{form.recipients.length}/{MAX_RECIPIENTS}</span>
                    </div>
                </Section>

                <Section title="4. Email">
                    <div className="space-y-1">
                        <label className={labelCls} htmlFor="sf-subject">Tiêu đề email</label>
                        <input id="sf-subject" className={full} value={form.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder={`[SAVP] ${form.name || 'Tên lịch gửi'}`} />
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls} htmlFor="sf-message">Lời nhắn</label>
                        <textarea id="sf-message" rows={2} className={full} value={form.message} onChange={(e) => patch({ message: e.target.value })} />
                    </div>
                    <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-2">
                        <p className="text-[10px] font-bold text-slate-blue uppercase flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Xem trước email</p>
                        <p className="text-xs font-semibold text-midnight-indigo">{form.subject.trim() || `[SAVP] ${form.name || 'Tên lịch gửi'}`}</p>
                        <p className="text-xs text-slate-blue whitespace-pre-line">{form.message}</p>
                        <ul className="space-y-1">
                            {form.formats.map((format) => (
                                <li key={format} className="flex items-center gap-1.5 text-[11px] text-midnight-indigo">
                                    <Paperclip className="w-3 h-3 text-slate-blue" />
                                    {`${form.reportType}_${sample.from}_${sample.to}.${FORMAT_EXTENSIONS[format]}`}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>

                {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
            </div>
        </SimpleModal>
    );
};

export default ScheduleFormModal;
