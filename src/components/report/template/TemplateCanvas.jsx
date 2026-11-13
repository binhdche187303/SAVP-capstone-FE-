import { useEffect, useRef, useState } from 'react';
import { GripVertical, ImageOff } from 'lucide-react';
import { fillText, sectionNumbers } from './layoutModel';

// Trang A4 minh họa của mẫu báo cáo: vẽ đúng thứ tự và vị trí các phần như file thật
// (lề 20/20/30/15 mm, Times New Roman). Bấm vào một phần để chỉnh ở bảng bên phải;
// các khối thân văn bản kéo thả được. Kết quả chính xác xem bằng "Xem thử PDF".
const PAGE_PX = 720;
const MM = PAGE_PX / 210;
const px = (mm) => Math.round(mm * MM);
const MARGIN = { top: px(20), right: px(15), bottom: px(20), left: px(30) };

// Ngày giờ trên trang minh họa lấy theo giờ Việt Nam (UTC+7), giống renderer BE, không theo múi giờ máy.
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const pad2 = (n) => String(n).padStart(2, '0');
const vnNow = () => new Date(Date.now() + VN_OFFSET_MS); // đọc bằng getUTC*
const dmyVn = (d) => `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
// Giống bản xem thử của BE: kỳ mẫu = 7 ngày gần nhất, kết thúc hôm nay.
const samplePeriod = (now) => ({ from: dmyVn(new Date(now.getTime() - 6 * DAY_MS)), to: dmyVn(now) });
// NĐ30: ngày dưới 10 và tháng 1, 2 thêm số 0 phía trước.
const dateWordsVn = (d) => {
    const month = d.getUTCMonth() + 1;
    return `ngày ${pad2(d.getUTCDate())} tháng ${month < 3 ? pad2(month) : month} năm ${d.getUTCFullYear()}`;
};
const dateTimeVn = (d) => `${dmyVn(d)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const AssetImage = ({ url, alt, style, className }) => {
    const [broken, setBroken] = useState(false);
    if (!url || broken) {
        return (
            <span style={style} className={`flex flex-col items-center justify-center gap-1 border border-dashed border-steel-gray/60 bg-pale-gray/60 text-steel-gray font-sans text-[9px] ${className || ''}`}>
                <ImageOff className="w-4 h-4" /> {alt}
            </span>
        );
    }
    return <img src={url} alt={alt} style={style} className={className} onError={() => setBroken(true)} draggable={false} />;
};

const Region = ({ id, label, selected, onSelect, className = '', style, children, extra = {} }) => (
    <div
        data-region={id}
        title={label}
        style={style}
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        className={`relative cursor-pointer rounded-sm transition-[outline-color] ${selected ? 'outline outline-2 outline-action-blue outline-offset-4' : 'outline-1 outline-dashed outline-offset-4 outline-transparent hover:outline-action-blue/50'} ${className}`}
        {...extra}
    >
        {selected && <span className="absolute -top-[22px] left-0 px-1.5 rounded bg-action-blue text-white text-[10px] font-sans font-semibold leading-4 whitespace-nowrap z-20">{label}</span>}
        {children}
    </div>
);

const DropLine = () => <div className="h-0.5 -my-px bg-action-blue rounded-full" aria-hidden="true" />;

const Agency = ({ agency, underline }) => {
    const at = underline ? agency.indexOf(underline) : -1;
    if (at < 0) return <>{agency}</>;
    return <>{agency.slice(0, at)}<span className="underline underline-offset-2">{underline}</span>{agency.slice(at + underline.length)}</>;
};

const SignatureSlot = ({ slot }) => {
    const name = slot.defaultSigner?.fullName || (slot.useExporter ? '(Tên người bấm xuất)' : '');
    return (
        <div className="text-center px-2 min-w-0">
            {slot.authority && <p className="font-bold">{slot.authority}</p>}
            <p className="font-bold">{slot.title}</p>
            <p className="italic text-[13px]">(Ký, ghi rõ họ tên)</p>
            <div className="h-16" />
            <p className={`font-bold ${slot.useExporter && !slot.defaultSigner ? 'text-slate-blue font-normal italic text-[13px]' : ''}`}>{name || '……………………………'}</p>
            {slot.mode === 'optional' && <p className="font-sans text-[9px] text-slate-blue mt-1">Ô ký tùy chọn — bỏ được lúc xuất</p>}
        </div>
    );
};

// Thu nhỏ cả trang (giữ tỉ lệ A4) khi cột giữa hẹp hơn khổ giấy, thay vì cắt mất lề phải.
const useFitScale = () => {
    const outer = useRef(null);
    const inner = useRef(null);
    const [fit, setFit] = useState({ scale: 1, height: null });
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return undefined;
        const measure = () => {
            const scale = Math.min(1, (outer.current?.clientWidth || PAGE_PX) / PAGE_PX);
            setFit({ scale, height: (inner.current?.offsetHeight || 0) * scale });
        };
        const ro = new ResizeObserver(measure);
        ro.observe(outer.current);
        ro.observe(inner.current);
        return () => ro.disconnect();
    }, []);
    return { outer, inner, ...fit };
};

const TemplateCanvas = ({ layout, definition, assetUrls, selected, onSelect, drag }) => {
    const L = layout;
    const h = L.header;
    const now = vnNow();
    const period = samplePeriod(now);
    // Giống BE: trích yếu mặc định = tên loại báo cáo (không kèm chữ "Báo cáo" vì câu mẫu đã có).
    const subject = L.title.subject || (definition ? definition.title : '(Tên báo cáo theo loại được xuất)');
    const vars = { title: L.title.subject || definition ? lowerFirst(subject) : '(tên báo cáo theo loại được xuất)', period: `từ ngày ${period.from} đến ngày ${period.to}`, unit: h.unitName || h.agency };
    const numbers = sectionNumbers(L.body);
    const slots = L.signatures.filter((s) => s.mode !== 'hidden');
    const kpis = definition?.kpis || [];
    const contentWidth = PAGE_PX - MARGIN.left - MARGIN.right;
    const logoWidth = px(L.logo.position === 'margin' ? Math.min(L.logo.widthMm, 24) : L.logo.widthMm);
    const sel = (id) => ({ id, selected: selected === id, onSelect });
    const fit = useFitScale();

    const logo = L.logo.enabled && (
        <AssetImage url={assetUrls[L.logo.mediaFileId]} alt="Logo" style={{ width: logoWidth, minHeight: L.logo.mediaFileId && assetUrls[L.logo.mediaFileId] ? undefined : logoWidth }} className="object-contain" />
    );

    const recipients = L.recipients.enabled && (
        <Region {...sel('recipients')} label="Nơi nhận" className="text-[12px] leading-snug">
            <p className="font-bold italic">Nơi nhận:</p>
            {(L.recipients.items.filter((x) => x.trim()).length ? L.recipients.items.filter((x) => x.trim()) : ['(chưa có nơi nhận)']).map((item, i) => (
                <p key={i} className="text-[11px]">- {item}</p>
            ))}
        </Region>
    );

    const blockContent = (block) => {
        const heading = block.kind !== 'opening' && <p className="font-bold">{numbers[block.id]}. {block.title || '(chưa có tiêu đề)'}</p>;
        switch (block.kind) {
            case 'opening':
                return <p className="indent-8 text-justify">{fillText(block.text, vars) || <span className="text-steel-gray italic">(đoạn mở đầu trống)</span>}</p>;
            case 'scope':
                return (
                    <>
                        {heading}
                        <p className="indent-8"><b>1. Kỳ báo cáo:</b> từ 00 giờ 00 ngày {period.from} đến 23 giờ 59 ngày {period.to}.</p>
                        <p className="indent-8"><b>2. Phạm vi dữ liệu:</b> theo bộ lọc lúc xuất.</p>
                        <p className="indent-8"><b>3. Nguồn dữ liệu:</b> Hệ thống VISMA.</p>
                        <p className="indent-8"><b>4. Thời điểm trích xuất:</b> lúc bấm xuất, người trích xuất: tài khoản đang đăng nhập.</p>
                    </>
                );
            case 'summary':
                return (
                    <>
                        {heading}
                        <table className="w-full border-collapse text-[13px] my-1">
                            <thead>
                                <tr className="font-bold text-center">
                                    <td className="border border-black px-1 w-10">STT</td>
                                    <td className="border border-black px-1">Chỉ tiêu</td>
                                    <td className="border border-black px-1 w-24">Đơn vị tính</td>
                                    <td className="border border-black px-1 w-24">Kết quả</td>
                                </tr>
                            </thead>
                            <tbody>
                                {(kpis.length ? kpis : [{ key: 'x', label: '(Chỉ tiêu theo từng loại báo cáo)' }]).map((k, i) => (
                                    <tr key={k.key}>
                                        <td className="border border-black px-1 text-center">{i + 1}</td>
                                        <td className="border border-black px-1">{k.label}</td>
                                        <td className="border border-black px-1 text-center text-steel-gray">…</td>
                                        <td className="border border-black px-1 text-center text-steel-gray">…</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {L.appendix.enabled && <p className="indent-8">Chi tiết … bản ghi được thể hiện tại Phụ lục kèm theo Báo cáo này.</p>}
                    </>
                );
            case 'assessment':
                return (
                    <>
                        {heading}
                        {block.text && <p className="indent-8 italic text-[14px]">{fillText(block.text, vars)}</p>}
                        <p className="text-steel-gray tracking-widest overflow-hidden whitespace-nowrap">{'.'.repeat(160)}</p>
                        <p className="text-steel-gray tracking-widest overflow-hidden whitespace-nowrap">{'.'.repeat(160)}</p>
                    </>
                );
            default:
                return (
                    <>
                        {heading}
                        {String(fillText(block.text, vars)).split('\n').map((s) => s.trim()).filter(Boolean).map((line, i) => <p key={i} className="indent-8 text-justify">{line}</p>)}
                        {!block.text.trim() && <p className="indent-8 text-steel-gray italic">(nhập nội dung ở bảng bên phải)</p>}
                    </>
                );
        }
    };

    return (
        <div ref={fit.outer} style={fit.scale < 1 ? { height: fit.height, overflow: 'hidden' } : undefined}>
        <div
            ref={fit.inner}
            className="space-y-6"
            style={fit.scale < 1 ? { width: PAGE_PX, transform: `scale(${fit.scale})`, transformOrigin: 'top left' } : undefined}
            onClick={() => onSelect(null)}
        >
            <div
                className="relative bg-white shadow-sm-2 mx-auto text-black"
                style={{ width: PAGE_PX, minHeight: px(297), padding: `${MARGIN.top}px ${MARGIN.right}px ${MARGIN.bottom + 24}px ${MARGIN.left}px`, fontFamily: '"Times New Roman", Tinos, serif', fontSize: 15, lineHeight: 1.45 }}
                data-testid="template-page"
            >
                {L.watermark.enabled && (
                    <div
                        data-region="watermark"
                        className={`absolute pointer-events-none flex items-center justify-center ${selected === 'watermark' ? 'outline outline-2 outline-action-blue' : ''}`}
                        style={{ left: MARGIN.left, right: MARGIN.right, top: MARGIN.top, bottom: MARGIN.bottom }}
                    >
                        <AssetImage url={assetUrls[L.watermark.mediaFileId]} alt="Logo nền" style={{ width: `${L.watermark.widthPct}%`, aspectRatio: assetUrls[L.watermark.mediaFileId] ? undefined : '1', opacity: L.watermark.opacity }} className="object-contain" />
                    </div>
                )}

                {L.logo.enabled && L.logo.position === 'margin' && (
                    <Region {...sel('logo')} label="Logo" className="!absolute" style={{ top: MARGIN.top, left: Math.max(px(4), MARGIN.left - logoWidth - px(3)) }}>
                        {logo}
                    </Region>
                )}

                <div className="relative z-10 space-y-3">
                    <Region {...sel('header')} label="Đầu văn bản (quốc hiệu, cơ quan, số, địa danh)">
                        <div className="flex gap-2 text-[13px] leading-snug">
                            <div className="text-center" style={{ width: '45%' }}>
                                {L.logo.enabled && L.logo.position === 'above' && (
                                    <Region {...sel('logo')} label="Logo" className="inline-block mb-1">{logo}</Region>
                                )}
                                {h.parentAgency && <p>{h.parentAgency}</p>}
                                <p className="font-bold"><Agency agency={h.agency || '(TÊN CƠ QUAN)'} underline={h.agencyUnderline} /></p>
                                <p className="mt-2">Số:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/BC-{h.agencyShort || '…'}{h.unitCode ? `-${h.unitCode}` : ''}</p>
                            </div>
                            <div className="text-center flex-1">
                                <p className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                                <p className="font-bold"><span className="underline underline-offset-4">Độc lập - Tự do - Hạnh phúc</span></p>
                                <p className="italic mt-3">{h.place || '(địa danh)'}, {dateWordsVn(now)}</p>
                            </div>
                        </div>
                    </Region>

                    <Region {...sel('title')} label="Tên loại và trích yếu" className="text-center pt-3">
                        <p className="font-bold text-[16px]">BÁO CÁO</p>
                        <p className="font-bold">{subject}</p>
                        <p className="font-bold">từ ngày {period.from} đến ngày {period.to}</p>
                        <div className="mx-auto mt-1 border-t border-black w-28" />
                    </Region>

                    {L.addressee.enabled && (
                        <Region {...sel('addressee')} label="Kính gửi" className="text-center">
                            <p>Kính gửi: {fillText(L.addressee.text, vars) || '…'}</p>
                        </Region>
                    )}

                    <div className="space-y-2">
                        {L.body.map((block, index) => (block.enabled ? (
                            <div key={block.id}>
                                {drag.showsIndicator(block.id) && <DropLine />}
                                <Region
                                    {...sel(`block:${block.id}`)}
                                    label={block.kind === 'opening' ? 'Đoạn mở đầu (cố định đầu thân)' : `Mục ${numbers[block.id]} — kéo để đổi chỗ`}
                                    className={`group ${drag.dragId === block.id ? 'opacity-40' : ''}`}
                                    extra={drag.itemProps(block, index)}
                                >
                                    {block.kind !== 'opening' && (
                                        <GripVertical className="absolute -left-6 top-1 w-4 h-4 text-steel-gray opacity-0 group-hover:opacity-100 cursor-grab" aria-hidden="true" />
                                    )}
                                    {blockContent(block)}
                                </Region>
                            </div>
                        ) : (
                            // Khối tắt không in, nhưng vẫn là điểm thả để giữ thứ tự khi kéo.
                            <div key={block.id} {...drag.itemProps(block, index)} draggable={false}>
                                {drag.showsIndicator(block.id) && <DropLine />}
                            </div>
                        )))}
                        {drag.showsIndicator(null) && <DropLine />}
                    </div>

                    {L.closing.enabled && (
                        <Region {...sel('closing')} label="Câu kết">
                            <p className="indent-8 text-justify">{fillText(L.closing.text, vars)}</p>
                        </Region>
                    )}

                    {slots.length <= 1 ? (
                        <div className="flex justify-between gap-4 pt-2">
                            <div style={{ width: `${(220 / 467) * 100}%` }}>{recipients}</div>
                            <Region {...sel('signatures')} label="Khối ký" className="flex-1">
                                {slots.length ? <SignatureSlot slot={slots[0]} /> : <p className="font-sans text-[11px] text-steel-gray text-center py-6">Không in ô ký nào</p>}
                            </Region>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-2">
                            <Region {...sel('signatures')} label="Khối ký">
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                                    {slots.map((slot) => <SignatureSlot key={slot.id} slot={slot} />)}
                                </div>
                            </Region>
                            <div style={{ width: '50%' }}>{recipients}</div>
                        </div>
                    )}
                </div>

                {L.footer.provenance && (
                    <Region {...sel('footer')} label="Dòng nguồn dữ liệu" className="!absolute italic text-[10px] text-slate-blue" style={{ left: MARGIN.left, width: contentWidth, bottom: px(8) }}>
                        Báo cáo được trích xuất tự động từ Hệ thống VISMA lúc {dateTimeVn(now)} bởi (tài khoản đang đăng nhập)
                    </Region>
                )}
            </div>

            {L.appendix.enabled && (
                <Region {...sel('appendix')} label="Phụ lục (trang ngang)" className="mx-auto bg-white shadow-sm-2 text-black" style={{ width: PAGE_PX, padding: 24, fontFamily: '"Times New Roman", Tinos, serif', fontSize: 13 }}>
                    <p className="text-center font-bold">PHỤ LỤC</p>
                    <p className="text-center italic mb-2">Chi tiết dữ liệu — in trên trang khổ ngang, lặp tiêu đề cột mỗi trang</p>
                    <div className="flex border border-black text-[11px] font-bold overflow-hidden">
                        {['STT', ...(definition?.columns || []).slice(0, 7).map((c) => c.label), ...(definition ? [] : ['(Cột theo từng loại báo cáo)'])].map((label) => (
                            <span key={label} className="flex-1 px-1 py-0.5 border-r last:border-r-0 border-black text-center truncate">{label}</span>
                        ))}
                    </div>
                </Region>
            )}
        </div>
        </div>
    );
};

export default TemplateCanvas;
