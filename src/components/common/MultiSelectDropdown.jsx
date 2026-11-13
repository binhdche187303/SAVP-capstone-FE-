import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/**
 * Bộ lọc chọn nhiều: nút gọn + bảng thả xuống có ô tìm, checkbox, chọn tất cả / bỏ chọn.
 * `selected` rỗng = không lọc (tất cả).
 * options: [{ value, label, hint?, count? }]
 */
const MultiSelectDropdown = ({
    options,
    selected,
    onChange,
    allLabel,
    unitLabel,
    searchPlaceholder = 'Tìm…',
    ariaLabel,
    icon: Icon,
    widthClass = 'w-56',
    panelWidthClass = 'w-[360px]'
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef(null);
    const searchRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        // Nghe ở pha capture để thành phần khác có chặn lan truyền (stopPropagation) vẫn đóng được;
        // focusin bắt cả trường hợp chuyển ra ngoài bằng phím Tab.
        const closeIfOutside = event => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
        const onKey = event => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', closeIfOutside, true);
        document.addEventListener('focusin', closeIfOutside, true);
        document.addEventListener('keydown', onKey);
        searchRef.current?.focus();
        return () => {
            document.removeEventListener('pointerdown', closeIfOutside, true);
            document.removeEventListener('focusin', closeIfOutside, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    useEffect(() => { if (!open) setQuery(''); }, [open]);

    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const filtered = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (!text) return options;
        return options.filter(o => `${o.value} ${o.label} ${o.hint || ''}`.toLowerCase().includes(text));
    }, [options, query]);

    const toggle = value => onChange(selectedSet.has(value) ? selected.filter(v => v !== value) : [...selected, value]);
    const selectFiltered = () => onChange([...new Set([...selected, ...filtered.map(o => o.value)])]);

    const buttonText = selected.length === 0
        ? allLabel
        : selected.length === 1
            ? (options.find(o => o.value === selected[0])?.label || selected[0])
            : `${selected.length} ${unitLabel}`;

    return (
        <div ref={rootRef} className={`relative ${widthClass}`}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={`h-10 w-full pl-3 pr-2 inline-flex items-center gap-2 bg-white border rounded-lg text-xs font-bold transition-colors ${open || selected.length ? 'border-action-blue text-action-blue' : 'border-platinum-tint text-midnight-indigo hover:border-action-blue/50'}`}
            >
                {Icon && <Icon className="w-4 h-4 shrink-0" />}
                <span className="truncate flex-1 text-left">{buttonText}</span>
                {selected.length > 0 && (
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label="Bỏ lọc"
                        onClick={event => { event.stopPropagation(); onChange([]); }}
                        onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); onChange([]); } }}
                        className="p-0.5 rounded hover:bg-blue-50"
                    >
                        <X className="w-3.5 h-3.5" />
                    </span>
                )}
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className={`absolute right-0 top-full mt-1 z-30 ${panelWidthClass} max-w-[calc(100vw-2rem)] bg-white border border-platinum-tint rounded-xl shadow-lg overflow-hidden`}>
                    <div className="p-2 border-b border-platinum-tint">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-blue" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full h-9 pl-8 pr-3 rounded-lg border border-platinum-tint text-xs focus:outline-none focus:border-action-blue"
                            />
                        </div>
                        <div className="flex items-center justify-between mt-2 px-1 text-[11px]">
                            <span className="text-slate-blue">
                                {selected.length ? `Đã chọn ${selected.length}/${options.length}` : `${options.length} ${unitLabel}`}
                            </span>
                            <span className="flex items-center gap-3 font-semibold">
                                <button type="button" onClick={selectFiltered} disabled={!filtered.length} className="text-action-blue hover:underline disabled:opacity-40">
                                    {query ? 'Chọn kết quả' : 'Chọn tất cả'}
                                </button>
                                <button type="button" onClick={() => onChange([])} disabled={!selected.length} className="text-slate-blue hover:text-red-600 disabled:opacity-40">Bỏ chọn</button>
                            </span>
                        </div>
                    </div>
                    <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
                        {filtered.map(option => {
                            const checked = selectedSet.has(option.value);
                            return (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={checked}
                                        onClick={() => toggle(option.value)}
                                        className={`w-full px-3 py-2 flex items-start gap-2.5 text-left hover:bg-cloud-mist/60 ${checked ? 'bg-blue-50/60' : ''}`}
                                    >
                                        <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked ? 'bg-action-blue border-action-blue text-white' : 'border-slate-300 bg-white'}`}>
                                            {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-xs leading-snug ${checked ? 'font-bold text-midnight-indigo' : 'font-semibold text-midnight-indigo'}`}>{option.label}</span>
                                            {option.hint && <span className="block text-[11px] text-slate-blue truncate">{option.hint}</span>}
                                        </span>
                                        {option.count != null && <span className="shrink-0 mt-0.5 px-1.5 rounded bg-cloud-mist text-[10px] font-bold text-slate-blue">{option.count}</span>}
                                    </button>
                                </li>
                            );
                        })}
                        {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-blue">Không tìm thấy</li>}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default MultiSelectDropdown;
