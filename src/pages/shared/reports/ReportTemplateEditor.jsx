import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, FileSpreadsheet, FileText, FileType2, GripVertical, Lock, Plus, Save, Trash2,
} from 'lucide-react';
import { REPORT_DEFINITIONS, REPORT_TYPES, getReportDefinition } from '../../../config/reportDefinitions';
import { createTemplate, getTemplate, getTemplateDefaults, previewTemplate, updateTemplate } from '../../../service/reportTemplateService';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import SimpleModal from '../../../components/common/SimpleModal';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import TemplateCanvas from '../../../components/report/template/TemplateCanvas';
import TemplateInspector from '../../../components/report/template/TemplateInspector';
import useBlockDrag from '../../../components/report/template/useBlockDrag';
import {
    BLOCK_LABELS, LIMITS, canAddTextBlock, canShift, cleanLayout, moveBlock, newTextBlock, sectionNumbers, setIn, shiftBlock, validateLayout,
} from '../../../components/report/template/layoutModel';
import { btnGhost, btnPrimary, cardCls, errorBoxCls, inputCls, labelCls, spinnerCls } from '../../../components/common/uiClasses';

// Trình cấu hình mẫu báo cáo quy chuẩn: danh sách phần (trái) — trang A4 (giữa) — thuộc tính (phải).
// Phần cố định theo NĐ 30 chỉ chỉnh nội dung; khối thân văn bản kéo thả / thêm / ẩn được.
const snapshot = (form) => JSON.stringify({ ...form, layout: cleanLayout(form.layout) });
const rowBtn = 'p-1 rounded-md text-slate-blue hover:bg-cloud-mist hover:text-action-blue disabled:opacity-30 disabled:hover:bg-transparent';

const OutlineRow = ({ label, active, onSelect, locked, toggle, children, extra = {}, muted }) => (
    <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer ${active ? 'bg-blue-50 text-action-blue font-semibold' : 'text-midnight-indigo hover:bg-cloud-mist'} ${muted ? 'opacity-60' : ''}`}
        onClick={onSelect}
        {...extra}
    >
        {locked ? <Lock className="w-3.5 h-3.5 text-steel-gray shrink-0" aria-label="Vị trí cố định" /> : <GripVertical className="w-3.5 h-3.5 text-steel-gray shrink-0 cursor-grab" aria-hidden="true" />}
        <span className="flex-1 truncate" title={label}>{label}</span>
        {children}
        {toggle && (
            <button type="button" className={rowBtn} aria-label={toggle.on ? `Ẩn ${label}` : `Hiện ${label}`} title={toggle.on ? 'Đang in — bấm để ẩn' : 'Đang ẩn — bấm để in'} onClick={(e) => { e.stopPropagation(); toggle.set(!toggle.on); }}>
                {toggle.on ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
        )}
    </div>
);

const ReportTemplateEditor = () => {
    const { id } = useParams();
    const isNew = id === 'new';
    const base = useAreaBase();
    const navigate = useNavigate();
    const [form, setForm] = useState(null);
    const [savedSnap, setSavedSnap] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [assetUrls, setAssetUrls] = useState({});
    const [selected, setSelected] = useState('header');
    const [saving, setSaving] = useState(false);
    const [previewing, setPreviewing] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [leaveConfirm, setLeaveConfirm] = useState(false);
    const localUrls = useRef([]);

    useEffect(() => {
        let stale = false;
        setForm(null);
        setLoadError(null);
        (isNew ? getTemplateDefaults() : getTemplate(id)).then((res) => {
            if (stale) return;
            if (!res?.success) { setLoadError(res?.message || 'Không tải được mẫu báo cáo'); return; }
            const next = isNew
                ? { name: 'Mẫu báo cáo mới', reportType: null, isDefault: false, layout: res.data.layout }
                : { name: res.data.name, reportType: res.data.reportType, isDefault: res.data.isDefault, layout: res.data.layout };
            setForm(next);
            setSavedSnap(snapshot(next));
            if (!isNew) setAssetUrls((prev) => ({ ...res.data.assetUrls, ...prev }));
        });
        return () => { stale = true; };
    }, [id, isNew]);

    // Thu hồi object URL của ảnh vừa tải và bản PDF xem thử khi rời trang.
    useEffect(() => () => localUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

    const dirty = form && snapshot(form) !== savedSnap;
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const layout = form?.layout;
    const setLayout = useCallback((fn) => setForm((prev) => ({ ...prev, layout: fn(prev.layout) })), []);
    const change = useCallback((path, value) => setLayout((l) => setIn(l, path, value)), [setLayout]);
    const onMove = useCallback((dragId, beforeId) => setLayout((l) => ({ ...l, body: moveBlock(l.body, dragId, beforeId) })), [setLayout]);
    const drag = useBlockDrag(layout?.body || [], onMove);
    const definition = useMemo(() => getReportDefinition(form?.reportType) || null, [form?.reportType]);
    const numbers = useMemo(() => (layout ? sectionNumbers(layout.body) : {}), [layout]);

    const addAsset = (mediaFileId, url) => {
        localUrls.current.push(url);
        setAssetUrls((prev) => ({ ...prev, [mediaFileId]: url }));
    };

    const addTextBlock = () => {
        const block = newTextBlock(layout.body);
        setLayout((l) => ({ ...l, body: [...l.body, block] }));
        setSelected(`block:${block.id}`);
    };
    const removeBlock = (blockId) => {
        setLayout((l) => ({ ...l, body: l.body.filter((b) => b.id !== blockId) }));
        if (selected === `block:${blockId}`) setSelected(null);
    };

    const save = async () => {
        const name = form.name.trim();
        if (!name) { toast.error('Vui lòng nhập tên mẫu'); return; }
        const clean = cleanLayout(form.layout);
        const problem = validateLayout(clean);
        if (problem) { toast.error(problem); return; }
        setSaving(true);
        const payload = { name, reportType: form.reportType || null, isDefault: form.isDefault, layout: clean };
        const res = isNew ? await createTemplate(payload) : await updateTemplate(id, payload);
        setSaving(false);
        if (!res?.success) { toast.error(res?.message || 'Không lưu được mẫu'); return; }
        const next = { name: res.data.name, reportType: res.data.reportType, isDefault: res.data.isDefault, layout: res.data.layout };
        setForm(next);
        setSavedSnap(snapshot(next));
        setAssetUrls((prev) => ({ ...prev, ...res.data.assetUrls }));
        toast.success(`Đã lưu mẫu "${res.data.name}"`);
        if (isNew) navigate(`${base}/report-templates/${res.data.id}`, { replace: true });
    };

    const preview = async (format) => {
        setPreviewing(format);
        const res = await previewTemplate({ layout: cleanLayout(form.layout), format, reportType: form.reportType || undefined });
        setPreviewing(null);
        if (!res?.success || !res.data) { toast.error(res?.message || 'Không dựng được bản xem thử'); return; }
        const url = URL.createObjectURL(res.data);
        localUrls.current.push(url);
        if (format === 'pdf') { setPdfUrl(url); return; }
        const a = document.createElement('a');
        a.href = url;
        a.download = `xem-thu-mau-bao-cao.${format}`;
        a.click();
        toast.success(`Đã tải bản xem thử ${format === 'docx' ? 'Word' : 'Excel'}`);
    };

    const back = () => (dirty ? setLeaveConfirm(true) : navigate(`${base}/report-templates`));

    if (loadError) {
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
                <div className={errorBoxCls}>{loadError}</div>
                <Link to={`${base}/report-templates`} className={btnGhost}><ArrowLeft className="w-4 h-4" /> Về danh sách mẫu</Link>
            </div>
        );
    }
    if (!form) return <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>;

    const fixedRow = (key, label, toggle) => (
        <OutlineRow key={key} label={label} locked active={selected === key} onSelect={() => setSelected(key)} toggle={toggle} muted={toggle && !toggle.on} />
    );
    const toggleOf = (section, key = 'enabled') => ({ on: layout[section][key], set: (v) => change([section, key], v) });
    // Logo chưa có ảnh: bấm hiện = mở bảng thuộc tính để tải ảnh, không bật suông.
    const assetToggle = (section) => ({
        on: layout[section].enabled,
        set: (v) => { if (v && !layout[section].mediaFileId) { setSelected(section); toast.info('Chọn ảnh trước khi bật'); return; } change([section, 'enabled'], v); },
    });

    return (
        <div className="p-6 space-y-4 max-w-[1600px] mx-auto">
            <div className={`${cardCls} px-4 py-3 flex flex-wrap items-end gap-3`}>
                <button type="button" onClick={back} className="self-center p-2 rounded-lg text-slate-blue hover:bg-cloud-mist" aria-label="Về danh sách mẫu"><ArrowLeft className="w-4 h-4" /></button>
                <label className="space-y-1 flex-1 min-w-[220px]">
                    <span className={labelCls}>Tên mẫu</span>
                    <input type="text" className={`${inputCls} w-full`} value={form.name} maxLength={LIMITS.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="space-y-1">
                    <span className={labelCls}>Áp dụng cho</span>
                    <select className={inputCls} value={form.reportType || ''} onChange={(e) => setForm((f) => ({ ...f, reportType: e.target.value || null }))}>
                        <option value="">Tất cả báo cáo</option>
                        {REPORT_TYPES.map((t) => <option key={t} value={t}>{REPORT_DEFINITIONS[t].title}</option>)}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-midnight-indigo self-center cursor-pointer" title="Mẫu được chọn sẵn khi xuất bản quy chuẩn">
                    <input type="checkbox" className="w-4 h-4 accent-[#006BFF]" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
                    Mẫu mặc định
                </label>
                <div className="flex items-center gap-2 ml-auto">
                    {dirty && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">Chưa lưu</span>}
                    <button type="button" className={btnGhost} disabled={Boolean(previewing)} onClick={() => preview('pdf')}><FileText className="w-4 h-4" /> {previewing === 'pdf' ? 'Đang dựng…' : 'Xem thử PDF'}</button>
                    <button type="button" className={`${btnGhost} !px-3`} disabled={Boolean(previewing)} onClick={() => preview('docx')} title="Tải bản xem thử Word"><FileType2 className="w-4 h-4" /> Word</button>
                    <button type="button" className={`${btnGhost} !px-3`} disabled={Boolean(previewing)} onClick={() => preview('xlsx')} title="Tải bản xem thử Excel"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
                    <button type="button" className={btnPrimary} disabled={saving || (!dirty && !isNew)} onClick={save}><Save className="w-4 h-4" /> {saving ? 'Đang lưu…' : 'Lưu mẫu'}</button>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_320px] lg:grid-cols-[210px_minmax(0,1fr)]">
                <aside className={`${cardCls} p-3 space-y-0.5 self-start xl:sticky xl:top-4`} aria-label="Các phần của mẫu">
                    <p className={`${labelCls} px-2 pb-1`}>Đầu văn bản</p>
                    {fixedRow('header', 'Quốc hiệu, cơ quan, số')}
                    {fixedRow('logo', 'Logo', assetToggle('logo'))}
                    {fixedRow('watermark', 'Logo nền', assetToggle('watermark'))}
                    {fixedRow('title', 'Tên loại, trích yếu')}
                    {fixedRow('addressee', 'Kính gửi', toggleOf('addressee'))}

                    <p className={`${labelCls} px-2 pt-3 pb-1`}>Thân báo cáo — kéo để đổi chỗ</p>
                    {layout.body.map((block, index) => (
                        <div key={block.id}>
                            {drag.showsIndicator(block.id) && <div className="h-0.5 bg-action-blue rounded-full mx-2" />}
                            <OutlineRow
                                label={`${numbers[block.id] ? `${numbers[block.id]}. ` : ''}${block.kind === 'opening' ? BLOCK_LABELS.opening : block.title || BLOCK_LABELS[block.kind]}`}
                                locked={block.kind === 'opening'}
                                active={selected === `block:${block.id}`}
                                onSelect={() => setSelected(`block:${block.id}`)}
                                toggle={{ on: block.enabled, set: (v) => change(['body', index, 'enabled'], v) }}
                                muted={!block.enabled}
                                extra={{ ...drag.itemProps(block, index), 'data-testid': `outline-${block.id}` }}
                            >
                                {block.kind !== 'opening' && (
                                    <>
                                        <button type="button" className={rowBtn} aria-label={`Đưa lên: ${block.title}`} disabled={!canShift(layout.body, block.id, -1)} onClick={(e) => { e.stopPropagation(); setLayout((l) => ({ ...l, body: shiftBlock(l.body, block.id, -1) })); }}><ArrowUp className="w-3.5 h-3.5" /></button>
                                        <button type="button" className={rowBtn} aria-label={`Đưa xuống: ${block.title}`} disabled={!canShift(layout.body, block.id, 1)} onClick={(e) => { e.stopPropagation(); setLayout((l) => ({ ...l, body: shiftBlock(l.body, block.id, 1) })); }}><ArrowDown className="w-3.5 h-3.5" /></button>
                                    </>
                                )}
                                {block.kind === 'text' && (
                                    <button type="button" className={`${rowBtn} hover:!text-red-600`} aria-label={`Xóa đoạn ${block.title}`} onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                                )}
                            </OutlineRow>
                        </div>
                    ))}
                    {drag.showsIndicator(null) && <div className="h-0.5 bg-action-blue rounded-full mx-2" />}
                    <button type="button" className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-action-blue hover:bg-cloud-mist disabled:opacity-40" disabled={!canAddTextBlock(layout.body)} onClick={addTextBlock}>
                        <Plus className="w-3.5 h-3.5" /> Thêm đoạn tự soạn
                    </button>

                    <p className={`${labelCls} px-2 pt-3 pb-1`}>Cuối văn bản</p>
                    {fixedRow('closing', 'Câu kết', toggleOf('closing'))}
                    {fixedRow('signatures', `Khối ký (${layout.signatures.filter((s) => s.mode !== 'hidden').length} ô)`)}
                    {fixedRow('recipients', 'Nơi nhận', toggleOf('recipients'))}
                    {fixedRow('appendix', 'Phụ lục chi tiết', toggleOf('appendix'))}
                    {fixedRow('footer', 'Dòng nguồn dữ liệu', toggleOf('footer', 'provenance'))}
                </aside>

                <main className="rounded-2xl bg-pale-gray/70 border border-platinum-tint p-6 overflow-x-auto">
                    <p className="text-[11px] text-slate-blue text-center mb-4">
                        Trang minh họa {definition ? `với chỉ tiêu của báo cáo ${definition.title.toLowerCase()}` : 'dùng chung'}. Bản in chính xác (ngắt trang, phông chữ) xem bằng nút "Xem thử PDF".
                    </p>
                    <TemplateCanvas layout={layout} definition={definition} assetUrls={assetUrls} selected={selected} onSelect={setSelected} drag={drag} />
                </main>

                <aside className={`${cardCls} p-4 self-start xl:sticky xl:top-4 lg:col-span-2 xl:col-span-1 max-h-[calc(100vh-2rem)] overflow-y-auto`} aria-label="Thuộc tính">
                    <TemplateInspector layout={layout} selected={selected} onChange={change} onAsset={addAsset} />
                </aside>
            </div>

            <SimpleModal isOpen={Boolean(pdfUrl)} title="Xem thử PDF (số liệu minh họa)" size="lg" onClose={() => setPdfUrl(null)}>
                {pdfUrl && <iframe title="Bản xem thử PDF" src={pdfUrl} className="w-full h-[70vh] rounded-lg border border-platinum-tint" />}
            </SimpleModal>
            <ConfirmDialog
                isOpen={leaveConfirm}
                message="Mẫu có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?"
                confirmLabel="Rời trang"
                onConfirm={() => { setLeaveConfirm(false); navigate(`${base}/report-templates`); }}
                onCancel={() => setLeaveConfirm(false)}
            />
        </div>
    );
};

export default ReportTemplateEditor;
