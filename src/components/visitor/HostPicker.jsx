import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchHosts } from '../../service/visitorService';
import { searchInputCls } from '../common/uiClasses';

// Ô gõ tìm người cần gặp. value: { id, fullName, departmentName } hoặc null.
const HostPicker = ({ value, onChange, inputId = 'host-picker' }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        const timer = setTimeout(async () => {
            const res = await searchHosts(query);
            if (!cancelled) setResults(res?.success ? res.data : []);
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, open]);

    useEffect(() => {
        const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-midnight-indigo">
                <span><strong>{value.fullName}</strong> — {value.departmentName}</span>
                <button type="button" aria-label="Chọn người khác" onClick={() => onChange(null)} className="text-slate-blue hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <div className="relative" ref={boxRef}>
            <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
            <input
                id={inputId}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Gõ tên cán bộ hoặc đơn vị…"
                autoComplete="off"
                className={`${searchInputCls} w-full`}
            />
            {open && (
                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-platinum-tint rounded-xl shadow-sm-2">
                    {results.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-slate-blue">Không tìm thấy cán bộ phù hợp</li>
                    ) : results.map((host) => (
                        <li key={host.id}>
                            <button type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-cloud-mist" onClick={() => { onChange(host); setOpen(false); setQuery(''); }}>
                                <span className="font-semibold text-midnight-indigo">{host.fullName}</span>
                                <span className="text-slate-blue"> — {host.departmentName}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default HostPicker;
