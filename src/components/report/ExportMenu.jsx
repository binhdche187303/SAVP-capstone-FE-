import ReportExportButton from '../common/ReportExportButton';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { btnPrimary } from '../common/uiClasses';
import ExportModeDialog from './ExportModeDialog';

const FORMATS = [
    { format: 'pdf', label: 'PDF', hint: 'Mở bản in, chọn "Lưu thành PDF"', icon: Printer },
    { format: 'xlsx', label: 'Excel', hint: 'Tệp .xlsx gồm sheet tổng hợp và dữ liệu', icon: FileSpreadsheet },
    { format: 'docx', label: 'Word', hint: 'Tệp mở bằng Microsoft Word', icon: FileText },
];

// askMode: chọn định dạng xong hỏi "bản thường / bản quy chuẩn" (mẫu dùng chung) rồi gọi onExport(format, extra);
//   extra = {} (bản thường) hoặc { mode: 'standard', templateId, signers, … } — chuyển nguyên vào downloadReport({ standard: extra }).
// compact: nút nhỏ (text-xs) cho thanh công cụ dày; mặc định là nút lớn của Trung tâm báo cáo.
const COMPACT_BTN = 'inline-flex items-center justify-center gap-1.5 bg-action-blue text-white rounded-xl px-3 py-2 text-xs font-semibold hover:bg-glacier-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const LegacyExportMenu = ({ onExport, disabled, busyFormat, compact = false, label = 'Xuất báo cáo', askMode = false }) => {
    const [open, setOpen] = useState(false);
    const [askFormat, setAskFormat] = useState(null);
    const ref = useRef(null);
    const menuRef = useRef(null);
    const [menuShift, setMenuShift] = useState(0);

    useLayoutEffect(() => {
        if (!open || !ref.current?.closest('body[data-standard-typography]')) return;
        const position = () => {
            if (!menuRef.current || !ref.current) return;
            const right = ref.current.getBoundingClientRect().right;
            const left = right - menuRef.current.offsetWidth;
            setMenuShift(left < 12 ? 12 - left : Math.min(0, window.innerWidth - 12 - right));
        };
        position();
        window.addEventListener('resize', position);
        return () => window.removeEventListener('resize', position);
    }, [open]);

    useEffect(() => {
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div className="relative camai-export-menu" ref={ref}>
            <ReportExportButton label={label} busy={Boolean(busyFormat)} menu aria-expanded={open} type="button" legacyClassName={compact ? COMPACT_BTN : btnPrimary} disabled={disabled || Boolean(busyFormat)} onClick={() => setOpen((v) => !v)}>
                <Download className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                {busyFormat ? 'Đang xuất...' : label}
                <ChevronDown className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            </ReportExportButton>
            {open && (
                <div ref={menuRef} style={{ transform: `translateX(${menuShift}px)` }} className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-24px)] bg-white rounded-2xl border border-platinum-tint shadow-sm-2 z-20 overflow-hidden">
                    {FORMATS.map(({ format, label, hint, icon: Icon }) => (
                        <button
                            key={format}
                            type="button"
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-cloud-mist"
                            onClick={() => { setOpen(false); if (askMode) setAskFormat(format); else onExport(format); }}
                        >
                            <Icon className="w-4 h-4 mt-0.5 text-action-blue" />
                            <span>
                                <span className="block text-sm font-semibold text-midnight-indigo">{label}</span>
                                <span data-ui-text="action" className="block text-[11px] text-slate-blue">{hint}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {askMode && (
                <ExportModeDialog
                    isOpen={Boolean(askFormat)}
                    format={askFormat}
                    onClose={() => setAskFormat(null)}
                    onConfirm={(extra) => { const f = askFormat; setAskFormat(null); onExport(f, extra); }}
                />
            )}
        </div>
    );
};

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const StandardExportMenu = ({ onExport, disabled, busyFormat, label = 'Xuất báo cáo', reportType,
    formats = ['xlsx', 'pdf', 'docx'], filterSummary = [], initialRange }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="camai-export-menu">
            <ReportExportButton label={label} busy={Boolean(busyFormat)} disabled={disabled || Boolean(busyFormat)}
                aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} />
            <ExportModeDialog isOpen={open} formats={formats} reportType={reportType}
                filterSummary={filterSummary} initialRange={initialRange} pdfPrint={!reportType}
                onClose={() => setOpen(false)}
                onConfirm={async (extra, options) => {
                    const result = await onExport(options.format, extra);
                    if (result?.success !== false && !result?.data?.downloadUrl) setOpen(false);
                    return result;
                }} />
        </div>
    );
};

const RoutedExportMenu = props => {
    const { pathname } = useLocation();
    return STANDARD_AREAS.has(pathname.split('/')[1]) ? <StandardExportMenu {...props} /> : <LegacyExportMenu {...props} />;
};

const ExportMenu = props => {
    const inRouter = useInRouterContext();
    return inRouter ? <RoutedExportMenu {...props} /> : <StandardExportMenu {...props} />;
};

export default ExportMenu;
