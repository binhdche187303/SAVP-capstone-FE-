import { useEffect, useRef, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { searchSigners } from '../../service/reportTemplateService';
import { inputCls } from '../common/uiClasses';

// Ô chọn người ký: gõ để tìm trong danh sách người dùng, hoặc gõ thẳng họ tên (người ngoài hệ thống).
// value = { userId: string | null, fullName: string }.
const SignerPicker = ({ value, onChange, placeholder = 'Gõ tên để tìm hoặc nhập tay', disabled, ariaLabel }) => {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState([]);
    const ref = useRef(null);
    const name = value?.fullName || '';

    useEffect(() => {
        if (!open) return undefined;
        let stale = false;
        const timer = setTimeout(async () => {
            const res = await searchSigners(name.trim());
            if (!stale) setOptions(res?.success ? res.data : []);
        }, 250);
        return () => { stale = true; clearTimeout(timer); };
    }, [open, name]);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <div className="relative">
                <UserRound className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-gray pointer-events-none" />
                <input
                    type="text"
                    aria-label={ariaLabel}
                    className={`${inputCls} w-full !pl-8 !pr-8`}
                    value={name}
                    maxLength={120}
                    disabled={disabled}
                    placeholder={placeholder}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => { setOpen(true); onChange({ userId: null, fullName: e.target.value }); }}
                />
                {name && !disabled && (
                    <button type="button" aria-label="Xóa người ký" className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-gray hover:text-red-600" onClick={() => onChange({ userId: null, fullName: '' })}>
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {name && (
                <p className="mt-1 text-[10px] text-slate-blue">
                    {value?.userId ? 'Người dùng trong hệ thống — họ tên lấy theo hồ sơ.' : 'Nhập tay — in đúng như đã gõ.'}
                </p>
            )}
            {open && options.length > 0 && (
                <ul className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white rounded-xl border border-platinum-tint shadow-sm-2 z-30">
                    {options.map((o) => (
                        <li key={o.id}>
                            <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-cloud-mist"
                                onClick={() => { onChange({ userId: o.id, fullName: o.fullName }); setOpen(false); }}
                            >
                                <span className="block text-xs font-semibold text-midnight-indigo">{o.fullName}</span>
                                <span className="block text-[10px] text-slate-blue">{[o.positionTitle, o.departmentName].filter(Boolean).join(' · ') || 'Chưa có chức vụ'}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SignerPicker;
