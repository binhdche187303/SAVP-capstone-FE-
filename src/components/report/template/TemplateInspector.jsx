import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, MousePointerClick, Plus, Trash2 } from 'lucide-react';
import SignerPicker from '../SignerPicker';
import { uploadTemplateAsset } from '../../../service/reportTemplateService';
import { toPngFile } from './imageAsset';
import { BLOCK_LABELS, LIMITS, newSignatureSlot, SIGNATURE_MODE_LABELS, VARIABLE_HINT } from './layoutModel';
import { btnGhost, inputCls, labelCls } from '../../common/uiClasses';

// Bảng thuộc tính của phần đang chọn trên canvas. Mọi thay đổi đi qua `onChange(path, value)`.
const SECTION_TITLES = {
    header: 'Đầu văn bản',
    logo: 'Logo',
    watermark: 'Logo nền (chìm)',
    title: 'Tên loại và trích yếu',
    addressee: 'Kính gửi',
    closing: 'Câu kết',
    signatures: 'Khối ký',
    recipients: 'Nơi nhận',
    appendix: 'Phụ lục',
    footer: 'Dòng nguồn dữ liệu',
};

const Field = ({ label, hint, children }) => (
    <label className="block space-y-1">
        <span className={labelCls}>{label}</span>
        {children}
        {hint && <span className="block text-[10px] text-slate-blue">{hint}</span>}
    </label>
);

const Text = ({ value, onChange, max = LIMITS.shortText, ...rest }) => (
    <input type="text" className={`${inputCls} w-full`} value={value ?? ''} maxLength={max} onChange={(e) => onChange(e.target.value)} {...rest} />
);

const Area = ({ value, onChange, rows = 4, max = LIMITS.longText, ...rest }) => (
    <textarea className={`${inputCls} w-full leading-relaxed`} rows={rows} value={value ?? ''} maxLength={max} onChange={(e) => onChange(e.target.value)} {...rest} />
);

const Toggle = ({ checked, onChange, label }) => (
    <label className="flex items-center gap-2 text-xs text-midnight-indigo cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-[#006BFF]" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
        {label}
    </label>
);

const iconBtn = 'p-1 rounded-lg text-slate-blue hover:bg-cloud-mist hover:text-action-blue disabled:opacity-30 disabled:hover:bg-transparent';

const AssetUpload = ({ mediaFileId, onUploaded, label }) => {
    const input = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const pick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const png = await toPngFile(file, `${label.toLowerCase().replace(/\s+/g, '-')}.png`);
            const res = await uploadTemplateAsset(png);
            if (!res?.success) throw new Error(res?.message || 'Không tải được ảnh lên');
            onUploaded(res.data.mediaFileId, URL.createObjectURL(png));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-1">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={pick} data-testid="asset-input" />
            <button type="button" className={`${btnGhost} w-full !text-xs`} disabled={busy} onClick={() => input.current?.click()}>
                <ImagePlus className="w-4 h-4" /> {busy ? 'Đang tải ảnh…' : mediaFileId ? `Đổi ảnh ${label.toLowerCase()}` : `Chọn ảnh ${label.toLowerCase()}`}
            </button>
            <p className="text-[10px] text-slate-blue">PNG nền trong suốt cho đẹp nhất. Ảnh được đổi sang PNG trước khi tải lên (tối đa 2 MB).</p>
            {error && <p className="text-[11px] text-red-600" role="alert">{error}</p>}
        </div>
    );
};

const SignaturesEditor = ({ signatures, onChange }) => {
    const set = (index, patch) => onChange(signatures.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    const move = (index, delta) => {
        const next = [...signatures];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        onChange(next);
    };
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-slate-blue">
                Ô <b>bắt buộc</b> luôn in và phải có người ký; ô <b>tùy chọn</b> người xuất bỏ được (VD: bản lưu không cần Hiệu trưởng ký).
                Người ký mặc định được điền sẵn lúc xuất, đổi được cho từng lần.
            </p>
            {signatures.map((slot, index) => (
                <div key={slot.id} className="rounded-xl border border-platinum-tint p-3 space-y-2.5 bg-white">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-midnight-indigo">Ô ký {index + 1}{signatures.length > 1 ? (index === 0 ? ' (bên trái)' : index === signatures.length - 1 ? ' (bên phải)' : ' (giữa)') : ''}</span>
                        <span className="inline-flex">
                            <button type="button" className={iconBtn} aria-label="Đưa ô ký sang trái" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button type="button" className={iconBtn} aria-label="Đưa ô ký sang phải" disabled={index === signatures.length - 1} onClick={() => move(index, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button type="button" className={`${iconBtn} hover:!text-red-600`} aria-label="Xóa ô ký" disabled={signatures.length <= 1} onClick={() => onChange(signatures.filter((_, i) => i !== index))}><Trash2 className="w-3.5 h-3.5" /></button>
                        </span>
                    </div>
                    <Field label="Quyền hạn ký" hint="VD: TL. HIỆU TRƯỞNG, KT. HIỆU TRƯỞNG. Để trống nếu ký trực tiếp.">
                        <Text value={slot.authority} onChange={(v) => set(index, { authority: v })} max={80} />
                    </Field>
                    <Field label="Chức vụ người ký">
                        <Text value={slot.title} onChange={(v) => set(index, { title: v })} max={120} />
                    </Field>
                    <Field label="Kiểu ô ký">
                        <select className={`${inputCls} w-full`} value={slot.mode} onChange={(e) => set(index, { mode: e.target.value })}>
                            {Object.entries(SIGNATURE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </Field>
                    <Toggle
                        checked={slot.useExporter}
                        onChange={(v) => set(index, v ? { useExporter: true, defaultSigner: null } : { useExporter: false })}
                        label="Tự điền tên người bấm xuất (người lập biểu)"
                    />
                    {!slot.useExporter && (
                        <Field label={`Người ký mặc định${slot.mode === 'required' ? ' *' : ''}`}>
                            <SignerPicker
                                ariaLabel={`Người ký mặc định ô ${index + 1}`}
                                value={slot.defaultSigner || { userId: null, fullName: '' }}
                                onChange={(next) => set(index, { defaultSigner: next.fullName.trim() ? next : null })}
                            />
                        </Field>
                    )}
                </div>
            ))}
            {signatures.length < LIMITS.signatures && (
                <button type="button" className={`${btnGhost} w-full !text-xs`} onClick={() => onChange([...signatures, newSignatureSlot(signatures)])}>
                    <Plus className="w-4 h-4" /> Thêm ô ký (tối đa {LIMITS.signatures})
                </button>
            )}
        </div>
    );
};

const TemplateInspector = ({ layout, selected, onChange, onAsset }) => {
    if (!selected) {
        return (
            <div className="text-center text-xs text-slate-blue py-10 space-y-2">
                <MousePointerClick className="w-8 h-8 mx-auto text-steel-gray" />
                <p>Bấm vào một phần trên trang mẫu hoặc trong danh sách bên trái để chỉnh.</p>
                <p className="text-[11px]">Kéo các mục của thân báo cáo để đổi thứ tự. Các phần còn lại cố định theo Nghị định 30/2020.</p>
            </div>
        );
    }

    const L = layout;
    let title = SECTION_TITLES[selected];
    let body = null;

    if (selected.startsWith('block:')) {
        const index = L.body.findIndex((b) => `block:${b.id}` === selected);
        const block = L.body[index];
        if (!block) return null;
        const at = (key) => ['body', index, key];
        title = BLOCK_LABELS[block.kind];
        body = (
            <>
                <Toggle checked={block.enabled} onChange={(v) => onChange(at('enabled'), v)} label="In mục này" />
                {block.kind !== 'opening' && (
                    <Field label="Tiêu đề mục" hint="Số La Mã (I, II, III…) tự đánh theo thứ tự.">
                        <Text value={block.title} onChange={(v) => onChange(at('title'), v)} max={150} />
                    </Field>
                )}
                {['opening', 'assessment', 'text'].includes(block.kind) && (
                    <Field label={block.kind === 'assessment' ? 'Dòng gợi ý (in nghiêng, trước các dòng chấm để điền tay)' : 'Nội dung'} hint={VARIABLE_HINT}>
                        <Area value={block.text} onChange={(v) => onChange(at('text'), v)} rows={block.kind === 'text' ? 8 : 5} />
                    </Field>
                )}
                {block.kind === 'scope' && <p className="text-[11px] text-slate-blue">Bốn dòng kỳ báo cáo, phạm vi, nguồn dữ liệu, thời điểm trích xuất do hệ thống tự điền lúc xuất.</p>}
                {block.kind === 'summary' && <p className="text-[11px] text-slate-blue">Bảng STT / Chỉ tiêu / Đơn vị tính / Kết quả lấy từ các chỉ số của báo cáo đang xuất.</p>}
            </>
        );
    } else if (selected === 'header') {
        const h = L.header;
        const at = (key) => ['header', key];
        body = (
            <>
                <Field label="Cơ quan chủ quản"><Text value={h.parentAgency} onChange={(v) => onChange(at('parentAgency'), v)} /></Field>
                <Field label="Tên cơ quan ban hành *"><Text value={h.agency} onChange={(v) => onChange(at('agency'), v)} /></Field>
                <Field label="Phần gạch chân" hint="Phải là một đoạn nằm trong tên cơ quan."><Text value={h.agencyUnderline} onChange={(v) => onChange(at('agencyUnderline'), v)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Viết tắt cơ quan"><Text value={h.agencyShort} onChange={(v) => onChange(at('agencyShort'), v)} max={20} /></Field>
                    <Field label="Mã đơn vị soạn"><Text value={h.unitCode} onChange={(v) => onChange(at('unitCode'), v)} max={20} /></Field>
                </div>
                <p className="text-[10px] text-slate-blue -mt-1">Số ký hiệu in: Số: …/BC-{h.agencyShort || '…'}{h.unitCode ? `-${h.unitCode}` : ''} (văn thư ghi số khi đăng ký).</p>
                <Field label="Tên đơn vị lập báo cáo" hint="Dùng cho biến {unit} trong các đoạn văn."><Text value={h.unitName} onChange={(v) => onChange(at('unitName'), v)} /></Field>
                <Field label="Địa danh *"><Text value={h.place} onChange={(v) => onChange(at('place'), v)} max={80} /></Field>
                <p className="text-[11px] text-slate-blue">Quốc hiệu, tiêu ngữ cố định theo thể thức.</p>
            </>
        );
    } else if (selected === 'logo') {
        body = (
            <>
                <Toggle checked={L.logo.enabled} onChange={(v) => onChange(['logo', 'enabled'], v)} label="In logo" />
                <AssetUpload label="Logo" mediaFileId={L.logo.mediaFileId} onUploaded={(id, url) => { onAsset(id, url); onChange(['logo'], { ...L.logo, enabled: true, mediaFileId: id }); }} />
                <Field label="Vị trí">
                    <select className={`${inputCls} w-full`} value={L.logo.position} onChange={(e) => onChange(['logo', 'position'], e.target.value)}>
                        <option value="margin">Ở lề trái, cạnh tên cơ quan</option>
                        <option value="above">Phía trên tên cơ quan</option>
                    </select>
                </Field>
                <Field label={`Chiều rộng: ${L.logo.widthMm} mm`} hint={L.logo.position === 'margin' ? 'Đặt ở lề trái thì tối đa 24 mm để không lấn vào nội dung.' : undefined}>
                    <input type="range" className="w-full accent-[#006BFF]" min={LIMITS.logoMm[0]} max={LIMITS.logoMm[1]} value={L.logo.widthMm} onChange={(e) => onChange(['logo', 'widthMm'], Number(e.target.value))} />
                </Field>
            </>
        );
    } else if (selected === 'watermark') {
        body = (
            <>
                <Toggle checked={L.watermark.enabled} onChange={(v) => onChange(['watermark', 'enabled'], v)} label="In logo nền mờ giữa trang" />
                <AssetUpload label="Logo nền" mediaFileId={L.watermark.mediaFileId} onUploaded={(id, url) => { onAsset(id, url); onChange(['watermark'], { ...L.watermark, enabled: true, mediaFileId: id }); }} />
                <Field label={`Độ đậm: ${Math.round(L.watermark.opacity * 100)}%`}>
                    <input type="range" className="w-full accent-[#006BFF]" min={LIMITS.watermarkOpacity[0] * 100} max={LIMITS.watermarkOpacity[1] * 100} value={Math.round(L.watermark.opacity * 100)} onChange={(e) => onChange(['watermark', 'opacity'], Number(e.target.value) / 100)} />
                </Field>
                <Field label={`Kích thước: ${L.watermark.widthPct}% bề rộng trang`}>
                    <input type="range" className="w-full accent-[#006BFF]" min={LIMITS.watermarkWidthPct[0]} max={LIMITS.watermarkWidthPct[1]} value={L.watermark.widthPct} onChange={(e) => onChange(['watermark', 'widthPct'], Number(e.target.value))} />
                </Field>
                <p className="text-[11px] text-slate-blue">Văn bản trình ký nên để độ đậm thấp (5–10%) để không lấn chữ.</p>
            </>
        );
    } else if (selected === 'title') {
        body = (
            <>
                <p className="text-[11px] text-slate-blue">Dòng "BÁO CÁO" và kỳ báo cáo cố định.</p>
                <Field label="Trích yếu" hint="Để trống = tên của báo cáo đang xuất (VD: Báo cáo chuyên cần cán bộ).">
                    <Text value={L.title.subject} onChange={(v) => onChange(['title', 'subject'], v)} />
                </Field>
            </>
        );
    } else if (selected === 'addressee') {
        body = (
            <>
                <Toggle checked={L.addressee.enabled} onChange={(v) => onChange(['addressee', 'enabled'], v)} label='In dòng "Kính gửi"' />
                <Field label="Kính gửi" hint="Người xuất đổi được cho từng lần xuất."><Text value={L.addressee.text} onChange={(v) => onChange(['addressee', 'text'], v)} /></Field>
            </>
        );
    } else if (selected === 'closing') {
        body = (
            <>
                <Toggle checked={L.closing.enabled} onChange={(v) => onChange(['closing', 'enabled'], v)} label="In câu kết" />
                <Field label="Câu kết" hint={`${VARIABLE_HINT} Kết thúc bằng "./." theo thể thức.`}><Area value={L.closing.text} onChange={(v) => onChange(['closing', 'text'], v)} rows={4} /></Field>
            </>
        );
    } else if (selected === 'signatures') {
        body = <SignaturesEditor signatures={L.signatures} onChange={(next) => onChange(['signatures'], next)} />;
    } else if (selected === 'recipients') {
        body = (
            <>
                <Toggle checked={L.recipients.enabled} onChange={(v) => onChange(['recipients', 'enabled'], v)} label='In mục "Nơi nhận"' />
                <Field label={`Nơi nhận — mỗi dòng một nơi (tối đa ${LIMITS.recipients})`} hint='Dòng cuối thường là "Lưu: VT, <đơn vị soạn>."'>
                    <Area value={L.recipients.items.join('\n')} onChange={(v) => onChange(['recipients', 'items'], v.split('\n'))} rows={5} max={LIMITS.recipients * (LIMITS.recipientLength + 1)} />
                </Field>
            </>
        );
    } else if (selected === 'appendix') {
        body = (
            <>
                <Toggle checked={L.appendix.enabled} onChange={(v) => onChange(['appendix', 'enabled'], v)} label="Kèm phụ lục chi tiết dữ liệu" />
                <p className="text-[11px] text-slate-blue">Phụ lục in trên trang ngang, đủ các cột của báo cáo. Tắt nếu chỉ cần bảng tổng hợp.</p>
            </>
        );
    } else if (selected === 'footer') {
        body = (
            <>
                <Toggle checked={L.footer.provenance} onChange={(v) => onChange(['footer', 'provenance'], v)} label="In dòng nguồn dữ liệu cuối trang" />
                <p className="text-[11px] text-slate-blue">Ghi thời điểm và tài khoản trích xuất, giúp đối chiếu khi lưu trữ.</p>
            </>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-midnight-indigo">{title}</h3>
            {body}
        </div>
    );
};

export default TemplateInspector;
