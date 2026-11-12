import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Stamp } from 'lucide-react';
import SimpleModal from '../common/SimpleModal';
import SignerPicker from './SignerPicker';
import { listTemplates } from '../../service/reportTemplateService';
import useAreaBase from '../../hooks/useAreaBase';
import { FORMAT_LABELS } from './scheduleLabels';
import { buildSignerPayload, initialSignerState, linesOf, LIMITS, SIGNATURE_MODE_LABELS } from './template/layoutModel';
import { btnGhost, btnPrimary, errorBoxCls, inputCls, labelCls } from '../common/uiClasses';

// Hỏi "bản thường hay bản quy chuẩn" sau khi người dùng chọn định dạng xuất.
// Bản quy chuẩn: chọn mẫu, người ký điền sẵn theo mẫu — chỉ đổi khi cần; ô ký tùy chọn bỏ được.
const optionCls = (active, disabled) =>
    `flex items-start gap-3 p-4 rounded-2xl border text-left transition-colors ${
        active ? 'border-action-blue bg-blue-50/60' : 'border-platinum-tint bg-white hover:bg-cloud-mist'
    } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`;

const ExportModeDialog = ({ isOpen, format, reportType, onClose, onConfirm }) => {
    const base = useAreaBase();
    const [mode, setMode] = useState('normal');
    const [templates, setTemplates] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [templateId, setTemplateId] = useState('');
    const [signers, setSigners] = useState({});
    const [addressee, setAddressee] = useState('');
    const [recipients, setRecipients] = useState('');
    const [error, setError] = useState(null);

    const template = useMemo(() => templates?.find((t) => t.id === templateId) || null, [templates, templateId]);

    const pickTemplate = (next) => {
        setTemplateId(next?.id || '');
        setError(null);
        if (!next) return;
        setSigners(initialSignerState(next.layout));
        setAddressee(next.layout.addressee.enabled ? next.layout.addressee.text : '');
        setRecipients(next.layout.recipients.enabled ? next.layout.recipients.items.join('\n') : '');
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        let stale = false;
        setMode('normal');
        setTemplates(null);
        setLoadError(null);
        setError(null);
        setTemplateId('');
        listTemplates(reportType).then((res) => {
            if (stale) return;
            if (res?.success) {
                // Không có loại (trang ngoài Trung tâm báo cáo) → chỉ mẫu áp dụng cho "Tất cả báo cáo".
                const list = reportType ? res.data : res.data.filter((t) => t.reportType == null);
                setTemplates(list);
                // BE xếp sẵn: mẫu riêng của loại trước, mẫu mặc định trước.
                pickTemplate(list.find((t) => t.isDefault) || list[0] || null);
            } else {
                setTemplates([]);
                setLoadError(res?.message || 'Không tải được danh sách mẫu');
            }
        });
        return () => { stale = true; };
    }, [isOpen, reportType]);

    const hasTemplates = Boolean(templates?.length);
    const slots = template ? template.layout.signatures.filter((s) => s.mode !== 'hidden') : [];
    const setSigner = (slotId, patch) => setSigners((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...patch } }));

    const confirm = () => {
        if (mode === 'normal') { onConfirm({}); return; }
        if (!template) { setError('Vui lòng chọn mẫu báo cáo'); return; }
        const built = buildSignerPayload(template.layout, signers);
        if (built.error) { setError(built.error); return; }
        const lines = linesOf(recipients);
        if (lines.length > LIMITS.recipients || lines.some((l) => l.length > LIMITS.recipientLength)) {
            setError(`Nơi nhận tối đa ${LIMITS.recipients} dòng, mỗi dòng ${LIMITS.recipientLength} ký tự`);
            return;
        }
        const extra = { mode: 'standard', templateId: template.id, signers: built.signers };
        // Chỉ gửi "Kính gửi" / "Nơi nhận" khi người dùng đổi so với mẫu.
        const baseAddressee = template.layout.addressee.enabled ? template.layout.addressee.text : '';
        if (addressee.trim() !== baseAddressee) extra.addressee = addressee.trim();
        const baseRecipients = template.layout.recipients.enabled ? template.layout.recipients.items : [];
        if (lines.join('\n') !== baseRecipients.join('\n')) extra.recipients = lines;
        onConfirm(extra);
    };

    return (
        <SimpleModal
            isOpen={isOpen}
            title={`Xuất ${FORMAT_LABELS[format] || ''} — chọn kiểu bản xuất`}
            onClose={onClose}
            footer={(
                <>
                    <button type="button" className={btnGhost} onClick={onClose}>Hủy</button>
                    <button type="button" className={btnPrimary} onClick={confirm} disabled={mode === 'standard' && !template}>Xuất file</button>
                </>
            )}
        >
            <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Kiểu bản xuất">
                    <label className={optionCls(mode === 'normal', false)}>
                        <input type="radio" name="export-mode" className="mt-1 accent-[#006BFF]" checked={mode === 'normal'} onChange={() => { setMode('normal'); setError(null); }} />
                        <span>
                            <span className="flex items-center gap-1.5 text-sm font-bold text-midnight-indigo"><FileText className="w-4 h-4 text-action-blue" /> Bản thường</span>
                            <span className="block text-[11px] text-slate-blue mt-1">Số liệu và bảng như đang xem trên màn hình. Dùng để tra cứu, đối chiếu nhanh.</span>
                        </span>
                    </label>
                    <label className={optionCls(mode === 'standard', !hasTemplates)}>
                        <input type="radio" name="export-mode" className="mt-1 accent-[#006BFF]" checked={mode === 'standard'} disabled={!hasTemplates} onChange={() => setMode('standard')} />
                        <span>
                            <span className="flex items-center gap-1.5 text-sm font-bold text-midnight-indigo"><Stamp className="w-4 h-4 text-action-blue" /> Bản quy chuẩn</span>
                            <span className="block text-[11px] text-slate-blue mt-1">Theo thể thức Nghị định 30/2020: quốc hiệu, số ký hiệu, kính gửi, khối ký, nơi nhận, phụ lục.</span>
                        </span>
                    </label>
                </div>

                {templates === null && <p className="text-xs text-slate-blue">Đang tải danh sách mẫu…</p>}
                {templates !== null && !hasTemplates && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        {loadError || 'Chưa có mẫu quy chuẩn cho báo cáo này.'}{' '}
                        {!loadError && base !== '/manager' && (
                            <Link to={`${base}/report-templates`} className="font-semibold underline">Tạo mẫu tại mục Mẫu báo cáo</Link>
                        )}
                    </p>
                )}

                {mode === 'standard' && template && (
                    <div className="space-y-4 border-t border-platinum-tint pt-4">
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="export-template">Mẫu báo cáo</label>
                            <select id="export-template" className={`${inputCls} w-full`} value={templateId} onChange={(e) => pickTemplate(templates.find((t) => t.id === e.target.value))}>
                                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <p className={labelCls}>Người ký</p>
                            {slots.length === 0 && <p className="text-xs text-slate-blue">Mẫu này không in khối ký.</p>}
                            {slots.map((slot) => {
                                const pick = signers[slot.id] || { included: true, userId: null, fullName: '' };
                                const required = slot.mode === 'required';
                                return (
                                    <div key={slot.id} className="rounded-xl border border-platinum-tint p-3 space-y-2" data-testid={`signer-${slot.id}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold text-midnight-indigo">{[slot.authority, slot.title].filter(Boolean).join(' — ')}</p>
                                                <p className={`text-[10px] font-semibold ${required ? 'text-red-600' : 'text-slate-blue'}`}>{SIGNATURE_MODE_LABELS[slot.mode]}</p>
                                            </div>
                                            {!required && (
                                                <label className="inline-flex items-center gap-1.5 text-[11px] text-midnight-indigo cursor-pointer">
                                                    <input type="checkbox" className="accent-[#006BFF]" checked={pick.included} onChange={(e) => setSigner(slot.id, { included: e.target.checked })} />
                                                    In ô ký này
                                                </label>
                                            )}
                                        </div>
                                        {pick.included && (
                                            <SignerPicker
                                                ariaLabel={`Người ký ${slot.title}`}
                                                value={pick}
                                                onChange={(next) => { setSigner(slot.id, next); setError(null); }}
                                                placeholder={slot.useExporter ? 'Để trống = tự điền tên người bấm xuất' : slot.defaultSigner?.fullName ? `Để trống = ${slot.defaultSigner.fullName}` : 'Gõ tên để tìm hoặc nhập tay'}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <details className="rounded-xl border border-platinum-tint p-3">
                            <summary className="text-xs font-semibold text-midnight-indigo cursor-pointer">Kính gửi và nơi nhận (lấy theo mẫu, đổi cho riêng lần xuất này)</summary>
                            <div className="space-y-3 mt-3">
                                <div className="space-y-1">
                                    <label className={labelCls} htmlFor="export-addressee">Kính gửi</label>
                                    <input id="export-addressee" type="text" className={`${inputCls} w-full`} maxLength={LIMITS.shortText} value={addressee} onChange={(e) => setAddressee(e.target.value)} placeholder="Để trống = không in dòng Kính gửi" />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelCls} htmlFor="export-recipients">Nơi nhận (mỗi dòng một nơi)</label>
                                    <textarea id="export-recipients" rows={3} className={`${inputCls} w-full`} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Để trống = không in mục Nơi nhận" />
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {error && <div className={errorBoxCls} role="alert">{error}</div>}
            </div>
        </SimpleModal>
    );
};

export default ExportModeDialog;
