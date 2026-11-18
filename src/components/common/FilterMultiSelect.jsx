import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { filterValue, filterValues } from '../../utils/filterSelection';
import './FilterMultiSelect.css';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node)
    : Children.toArray(node?.props?.children).map(textOf).join('');
const optionsOf = children => Children.toArray(children).flatMap(child => !isValidElement(child) ? []
    : child.type === 'option' ? [{ value: child.props.value ?? textOf(child), label: textOf(child), disabled: child.props.disabled }]
        : optionsOf(child.props.children));

// counts: { [giá trị lựa chọn]: số } — hiện "Nhãn (số)" cạnh từng lựa chọn; khoá '' là lựa chọn "Tất cả".
const countOf = (counts, value) => {
    if (!counts) return undefined;
    const key = filterValues(value).length ? String(value) : '';
    const n = counts[key];
    // Có counts mà không có khoá → lựa chọn này không có bản ghi nào.
    return typeof n === 'number' ? n : 0;
};
const withCount = (label, n) => (n === undefined ? label : `${label} (${n})`);

const Select = ({ standard, singleSelect = false, counts, children, value = '', onChange, id, className, style, ...props }) => {
    const generated = useId();
    const controlId = id || `multi-filter-${generated}`;
    const panelId = `${controlId}-options`;
    const root = useRef(null), panel = useRef(null), search = useRef(null);
    const [open, setOpen] = useState(false), [query, setQuery] = useState('');
    const [position, setPosition] = useState(null);
    const options = useMemo(() => optionsOf(children), [children]);
    const choices = options.filter(option => filterValues(option.value).length > 0);
    const all = options.find(option => filterValues(option.value).length === 0);
    const selected = filterValues(value);
    const selectedNames = choices.filter(option => selected.some(item => String(item) === String(option.value))).map(option => option.label);
    const label = !selected.length ? all?.label || 'Tất cả' : selectedNames.length === 1 ? selectedNames[0] : `Đã chọn ${selected.length} mục`;
    const visible = choices.filter(option => option.label.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')));
    const change = next => {
        const nextValue = filterValues(next).length ? filterValue(next) : all?.value ?? '';
        const target = { value: nextValue, id: controlId, name: props.name };
        onChange?.({ target, currentTarget: target });
    };

    useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
            const rect = root.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
            const below = window.innerHeight - rect.bottom - 16;
            const above = rect.top - 16;
            const height = Math.min(360, Math.max(below, above));
            setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
                top: below >= Math.min(280, above) ? rect.bottom + 6 : undefined,
                bottom: below < Math.min(280, above) ? window.innerHeight - rect.top + 6 : undefined,
                maxHeight: height });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open]);

    useEffect(() => {
        if (!open) { setQuery(''); return undefined; }
        const outside = event => {
            if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
        };
        const keyboard = event => { if (event.key === 'Escape') { setOpen(false); root.current?.focus(); } };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside, true);
        document.addEventListener('keydown', keyboard);
        return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true); document.removeEventListener('keydown', keyboard); };
    }, [open]);

    const panelReady = open && position !== null;
    useEffect(() => { if (panelReady) search.current?.focus(); }, [panelReady]);

    // Enum filters with two actual choices use a single-value dropdown.
    // Keep parent/API state scalar after a previous multi-selection (including HMR).
    const singleValue = Array.isArray(value) ? (selected.length === 1 ? selected[0] : all?.value ?? '') : value;
    useEffect(() => {
        if (!standard || !singleSelect) return;
        setOpen(false);
        if (Array.isArray(value)) {
            const target = { value: singleValue, id: controlId, name: props.name };
            onChange?.({ target, currentTarget: target });
        }
    }, [standard, singleSelect, value, singleValue, controlId, props.name, onChange]);

    // Ô chọn gốc của trình duyệt: khi có counts thì dựng lại <option> kèm số đếm.
    const nativeOptions = counts
        ? options.map(option => <option key={`${option.value}`} value={option.value} disabled={option.disabled}>{withCount(option.label, countOf(counts, option.value))}</option>)
        : children;
    if (!standard) return <select {...props} id={id} value={value} onChange={onChange} className={className} style={style}>{nativeOptions}</select>;
    if (singleSelect) return <select {...props} ref={root} id={controlId} value={singleValue} onChange={onChange}
        className={`camai-single-filter ${className || ''}`} style={style}>
        {!all && <option value="">{withCount('Tất cả', countOf(counts, ''))}</option>}
        {nativeOptions}
    </select>;
    return <>
        <button {...props} ref={root} id={controlId} type="button" role="combobox" aria-haspopup="listbox"
            aria-expanded={open} aria-controls={panelId} title={selectedNames.join(', ') || label}
            className="camai-multi-filter" onClick={() => setOpen(current => !current)}
            onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
            <span>{label}</span><ChevronDown aria-hidden="true" size={16} />
        </button>
        {open && position && createPortal(<div ref={panel} className="camai-multi-filter-panel" style={position}>
            <div className="camai-multi-filter-search"><Search size={16} aria-hidden="true" /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm lựa chọn…" aria-label="Tìm lựa chọn" /></div>
            <div className="camai-multi-filter-tools"><button type="button" onClick={() => change([...selected, ...visible.filter(option => !option.disabled).map(option => option.value)])}>Chọn tất cả</button><button type="button" onClick={() => change([])}>Bỏ chọn</button></div>
            <ul id={panelId} role="listbox" aria-multiselectable="true" aria-label={props['aria-label'] || 'Các lựa chọn'}>
                {visible.map(option => {
                    const checked = selected.some(item => String(item) === String(option.value));
                    return <li key={option.value}><button type="button" role="option" value={option.value} aria-selected={checked} disabled={option.disabled}
                        onClick={() => change(checked ? selected.filter(item => String(item) !== String(option.value)) : [...selected, option.value])}>
                        <span className="camai-multi-filter-check" data-checked={checked}>{checked && <Check size={12} aria-hidden="true" />}</span><span>{withCount(option.label, countOf(counts, option.value))}</span>
                    </button></li>;
                })}
                {!visible.length && <li className="camai-multi-filter-empty">Không có lựa chọn phù hợp</li>}
            </ul>
        </div>, document.body)}
    </>;
};
const Routed = props => { const { pathname } = useLocation(); return <Select {...props} standard={AREAS.has(pathname.split('/')[1])} />; };
export default function FilterMultiSelect(props) { return useInRouterContext() ? <Routed {...props} /> : <Select {...props} standard />; }
