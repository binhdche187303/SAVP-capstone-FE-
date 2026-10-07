import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { btnPrimary } from '../common/uiClasses';

const FORMATS = [
    { format: 'pdf', label: 'PDF', hint: 'Mở bản in, chọn "Lưu thành PDF"', icon: Printer },
    { format: 'xlsx', label: 'Excel', hint: 'Tệp .xlsx gồm sheet tổng hợp và dữ liệu', icon: FileSpreadsheet },
    { format: 'docx', label: 'Word', hint: 'Tệp mở bằng Microsoft Word', icon: FileText },
];

const ExportMenu = ({ onExport, disabled, busyFormat }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button type="button" className={btnPrimary} disabled={disabled || Boolean(busyFormat)} onClick={() => setOpen((v) => !v)}>
                <Download className="w-4 h-4" />
                {busyFormat ? 'Đang xuất…' : 'Xuất báo cáo'}
                <ChevronDown className="w-4 h-4" />
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-platinum-tint shadow-sm-2 z-20 overflow-hidden">
                    {FORMATS.map(({ format, label, hint, icon: Icon }) => (
                        <button
                            key={format}
                            type="button"
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-cloud-mist"
                            onClick={() => { setOpen(false); onExport(format); }}
                        >
                            <Icon className="w-4 h-4 mt-0.5 text-action-blue" />
                            <span>
                                <span className="block text-sm font-semibold text-midnight-indigo">{label}</span>
                                <span className="block text-[11px] text-slate-blue">{hint}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExportMenu;
