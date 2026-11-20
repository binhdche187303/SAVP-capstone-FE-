import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Stamp } from 'lucide-react';
import SimpleModal from '../common/SimpleModal';
import FilterBar, { FilterField } from '../common/FilterBar';
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

const ExportModeDialog = ({ isOpen, format, formats, reportType, onClose, onConfirm, title, filterSummary = [], initialRange, editableRange = false, allowStandard = true, pdfPrint = false }) => {
    const base = useAreaBase();
    const [mode, setMode] = useState('normal');
    const availableFormats = formats || [format || 'xlsx'];
    const formatKey = availableFormats.join(',');
    const [selectedFormat, setSelectedFormat] = useState(format || availableFormats[0]);
    const [range, setRange] = useState(initialRange || {});
    const [pending, setPending] = useState(false);
    const [downloadInfo, setDownloadInfo] = useState(null);
    const standardSupported = allowStandard && selectedFormat !== 'csv';

    useEffect(() => {
        if (!isOpen) return;
        const choices = formatKey.split(',');
        setSelectedFormat(choices.includes(format) ? format : choices[0]);
        setRange({ from: initialRange?.from || '', to: initialRange?.to || '' });
        setPending(false);
        setDownloadInfo(null);
    }, [isOpen, format, formatKey, initialRange?.from, initialRange?.to]);
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
        if (!isOpen || !allowStandard) return undefined;
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
                const list = reportType ? res.data : res.data.filter((t) => !t.reportTypes?.length);
                setTemplates(list);
                // BE xếp sẵn: mẫu riêng của loại trước, rồi mẫu "Tất cả báo cáo" → mẫu đầu là mẫu dùng.
                pickTemplate(list[0] || null);
            } else {
                setTemplates([]);
                setLoadError(res?.message || 'Không tải được danh sách mẫu');
            }
        });
        return () => { stale = true; };
    }, [isOpen, reportType, allowStandard]);

    const hasTemplates = Boolean(templates?.length);
    // Có mẫu riêng của loại thì chỉ dùng mẫu riêng; không thì mẫu "Tất cả báo cáo".
    const specific = (templates || []).filter((t) => t.reportTypes?.length);
    const choices = specific.length ? specific : templates || [];
    const slots = template ? template.layout.signatures.filter((s) => s.mode !== 'hidden') : [];
    const setSigner = (slotId, patch) => setSigners((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...patch } }));

    const performExport = async extra => {
        setPending(true);
        setError(null);
        try {
            const result = await (formats ? onConfirm(extra, { format: selectedFormat, range }) : onConfirm(extra));
            if (result?.success === false) throw new Error(result.message || 'Không xuất được báo cáo');
            if (result?.data?.downloadUrl) setDownloadInfo(result.data);
        } catch (failure) {
            setError(failure?.message || 'Không xuất được báo cáo. Vui lòng thử lại.');
        } finally { setPending(false); }
    };

    const confirm = () => {
        if (pending) return;
        if (initialRange && (!range.from || !range.to || range.from > range.to)) {
            setError('Vui lòng chọn đủ Từ ngày / Đến ngày và bảo đảm ngày bắt đầu không sau ngày kết thúc.');
            return;
        }
        if (mode === 'normal' || !standardSupported) { performExport({}); return; }
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
        performExport(extra);
    };

    return (
        <SimpleModal
            isOpen={isOpen}
            title={title || (formats ? 'Xuất báo cáo' : `Xuất ${FORMAT_LABELS[format] || ''} — chọn kiểu bản xuất`)}
            onClose={pending ? undefined : onClose}
            footer={(
                <>
                    <button type="button" className={btnGhost} onClick={onClose} disabled={pending}>{downloadInfo ? 'Đóng' : 'Hủy'}</button>
                    {downloadInfo ? <a className={btnPrimary} href={downloadInfo.downloadUrl} target="_blank" rel="noreferrer">Tải file</a> : <button type="button" className={btnPrimary} onClick={confirm} disabled={pending || (standardSupported && mode === 'standard' && !template)}>{pending ? 'Đang xuất...' : 'Xuất file'}</button>}
                </>
            )}
        >
            {downloadInfo ? <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Báo cáo đã sẵn sàng. Bấm “Tải file” để lưu về máy.
                {downloadInfo.fileName && <p className="mt-2 break-words font-semibold">{downloadInfo.fileName}</p>}
            </div> : <div className="space-y-4">
                {formats && (
                    <fieldset disabled={pending} className="space-y-2">
                        <legend className={labelCls}>Định dạng file</legend>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Định dạng file">
                            {availableFormats.map(value => (
                                <button key={value} type="button" role="radio" aria-checked={selectedFormat === value}
                                    onClick={() => { setSelectedFormat(value); setError(null); if (value === 'csv') setMode('normal'); }}
                                    className={`min-h-[38px] px-4 py-2 rounded-xl border text-sm font-semibold ${selectedFormat === value ? 'border-action-blue bg-blue-50 text-action-blue' : 'border-platinum-tint text-slate-blue bg-white'}`}>
                                    {FORMAT_LABELS[value] || value.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                )}
                {filterSummary.length > 0 && (
                    <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-3 space-y-1">
                        <p className={labelCls}>Phạm vi dữ liệu xuất</p>
                        {filterSummary.filter(Boolean).map((line, index) => <p key={index} className="text-xs text-slate-blue break-words">{line}</p>)}
                    </div>
                )}
                {initialRange && (editableRange ? (
                    <FilterBar variant="inline" data-filter-grid className="grid gap-4">
                        <FilterField label="Từ ngày"><input type="date" value={range.from || ''} max={range.to || undefined} disabled={pending} onChange={e => setRange(previous => ({ ...previous, from: e.target.value }))} /></FilterField>
                        <FilterField label="Đến ngày"><input type="date" value={range.to || ''} min={range.from || undefined} disabled={pending} onChange={e => setRange(previous => ({ ...previous, to: e.target.value }))} /></FilterField>
                    </FilterBar>
                ) : (
                    <p className="text-sm text-slate-blue">Khoảng ngày đang áp dụng: <strong>{(range.from || '').split('-').reverse().join('/')} — {(range.to || '').split('-').reverse().join('/')}</strong></p>
                ))}
                {pdfPrint && selectedFormat === 'pdf' && mode === 'normal' && <p className="text-xs text-slate-blue">Bản thường PDF mở cửa sổ in để lưu thành PDF; bản quy chuẩn tải file PDF.</p>}
                {pending && <p role="status" className="text-sm text-action-blue">Đang tạo và chuẩn bị tải file báo cáo...</p>}
                {!standardSupported && <p className="text-xs text-slate-blue">{selectedFormat === 'csv' ? 'CSV chỉ hỗ trợ bản thường.' : 'Loại dữ liệu này chưa hỗ trợ bản quy chuẩn.'}</p>}
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Kiểu bản xuất">
                    <label className={optionCls(mode === 'normal', pending)}>
                        <input type="radio" name="export-mode" className="mt-1 accent-[#006BFF]" checked={mode === 'normal'} disabled={pending} onChange={() => { setMode('normal'); setError(null); }} />
                        <span>
                            <span className="flex items-center gap-1.5 text-sm font-bold text-midnight-indigo"><FileText className="w-4 h-4 text-action-blue" /> Bản thường</span>
                            <span data-ui-text="secondary" className="block text-[11px] text-slate-blue mt-1">Số liệu và bảng như đang xem trên màn hình. Dùng để tra cứu, đối chiếu nhanh.</span>
                        </span>
                    </label>
                    <label className={optionCls(mode === 'standard', !hasTemplates || !standardSupported || pending)}>
                        <input type="radio" name="export-mode" className="mt-1 accent-[#006BFF]" checked={mode === 'standard'} disabled={!hasTemplates || !standardSupported || pending} onChange={() => setMode('standard')} />
                        <span>
                            <span className="flex items-center gap-1.5 text-sm font-bold text-midnight-indigo"><Stamp className="w-4 h-4 text-action-blue" /> Bản quy chuẩn</span>
                            <span data-ui-text="secondary" className="block text-[11px] text-slate-blue mt-1">Theo thể thức Nghị định 30/2020: quốc hiệu, số ký hiệu, kính gửi, khối ký, nơi nhận, phụ lục.</span>
                        </span>
                    </label>
                </div>

                {standardSupported && templates === null && <p className="text-xs text-slate-blue">Đang tải danh sách mẫu...</p>}
                {standardSupported && templates !== null && !hasTemplates && (
                    <p data-ui-text="badge" className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        {loadError || 'Chưa có mẫu quy chuẩn cho báo cáo này.'}{' '}
                        {!loadError && ['/system-admin', '/business-admin'].includes(base) && (
                            <Link to={`${base}/report-templates`} className="font-semibold underline">Tạo mẫu tại mục Mẫu báo cáo</Link>
                        )}
                    </p>
                )}

                {standardSupported && mode === 'standard' && template && (
                    <div className="space-y-4 border-t border-platinum-tint pt-4">
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="export-template">Mẫu báo cáo</label>
                            {/* Mỗi loại một mẫu → chỉ hiện tên; vẫn cho chọn nếu còn mẫu trùng từ trước khi có luật. */}
                            {choices.length > 1 ? (
                                <select id="export-template" className={`${inputCls} w-full`} value={templateId} onChange={(e) => pickTemplate(choices.find((t) => t.id === e.target.value))}>
                                    {choices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            ) : (
                                <p id="export-template" className="text-xs font-semibold text-midnight-indigo">{template.name}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <p data-ui-text="label" className={labelCls}>Người ký</p>
                            {slots.length === 0 && <p className="text-xs text-slate-blue">Mẫu này không in khối ký.</p>}
                            {slots.map((slot) => {
                                const pick = signers[slot.id] || { included: true, userId: null, fullName: '' };
                                const required = slot.mode === 'required';
                                return (
                                    <div key={slot.id} className="rounded-xl border border-platinum-tint p-3 space-y-2" data-testid={`signer-${slot.id}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p data-ui-text="primary" className="text-xs font-bold text-midnight-indigo">{[slot.authority, slot.title].filter(Boolean).join(' — ')}</p>
                                                <p data-ui-text="primary" className={`text-[10px] font-semibold ${required ? 'text-red-600' : 'text-slate-blue'}`}>{SIGNATURE_MODE_LABELS[slot.mode]}</p>
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
            </div>}
        </SimpleModal>
    );
};

export default ExportModeDialog;
