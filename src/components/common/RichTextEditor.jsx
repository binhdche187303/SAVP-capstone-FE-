import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react';
import { htmlToPlainText, sanitizeHtml } from '../../utils/richText';

const TOOLS = [
    { cmd: 'bold', icon: Bold, title: 'In đậm (Ctrl+B)' },
    { cmd: 'italic', icon: Italic, title: 'In nghiêng (Ctrl+I)' },
    { cmd: 'underline', icon: Underline, title: 'Gạch chân (Ctrl+U)' },
    { cmd: 'strikeThrough', icon: Strikethrough, title: 'Gạch ngang' },
    { cmd: 'insertUnorderedList', icon: List, title: 'Danh sách dấu chấm' },
    { cmd: 'insertOrderedList', icon: ListOrdered, title: 'Danh sách đánh số' },
    { cmd: 'createLink', icon: Link2, title: 'Chèn liên kết' },
    { cmd: 'removeFormat', icon: RemoveFormatting, title: 'Xoá định dạng' },
];

export default function RichTextEditor({ value, onChange, placeholder, maxLength, minHeight = 96 }) {
    const ref = useRef(null);
    const lastEmitted = useRef(null);
    const [active, setActive] = useState({});
    const [length, setLength] = useState(() => htmlToPlainText(value).length);

    // Chỉ ghi đè DOM khi value đổi từ bên ngoài (vd reset form), tránh nhảy con trỏ khi đang gõ
    useEffect(() => {
        const el = ref.current;
        if (!el || value === lastEmitted.current) return;
        el.innerHTML = sanitizeHtml(value || '');
        lastEmitted.current = value;
        setLength(htmlToPlainText(value).length);
    }, [value]);

    const refreshActive = () => {
        const next = {};
        TOOLS.forEach(({ cmd }) => {
            try { next[cmd] = document.queryCommandState(cmd); } catch { next[cmd] = false; }
        });
        setActive(next);
    };

    const emit = () => {
        const el = ref.current;
        if (!el) return;
        const text = htmlToPlainText(el.innerHTML);
        const html = text.trim() ? el.innerHTML : '';
        setLength(text.length);
        lastEmitted.current = html;
        onChange(html);
        refreshActive();
    };

    const run = (cmd) => {
        ref.current?.focus();
        if (cmd === 'createLink') {
            const url = window.prompt('Nhập liên kết (https://...)');
            if (!url) return;
            document.execCommand('createLink', false, /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`);
        } else {
            document.execCommand(cmd, false, null);
        }
        emit();
    };

    const handleBeforeInput = (e) => {
        if (!maxLength || length < maxLength) return;
        if (!window.getSelection()?.toString()) e.preventDefault();
    };

    // Dán: chỉ lấy text thuần để không mang font/style lạ từ Word/web
    const handlePaste = (e) => {
        e.preventDefault();
        let text = e.clipboardData.getData('text/plain');
        if (maxLength) text = text.slice(0, Math.max(0, maxLength - length));
        document.execCommand('insertText', false, text);
        emit();
    };

    return (
        <div className="border border-platinum-tint rounded-xl bg-white focus-within:border-action-blue focus-within:ring-2 focus-within:ring-action-blue/15">
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-cloud-mist">
                {TOOLS.map(({ cmd, icon: Icon, title }) => (
                    <button
                        key={cmd}
                        type="button"
                        title={title}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => run(cmd)}
                        className={`p-1.5 rounded-lg transition-colors ${active[cmd] ? 'bg-action-blue/10 text-action-blue' : 'text-slate-blue hover:bg-cloud-mist'}`}
                    >
                        <Icon size={15} />
                    </button>
                ))}
            </div>
            <div className="relative">
                {length === 0 && placeholder && (
                    <div className="absolute left-4 top-2.5 text-sm text-slate-blue/50 pointer-events-none select-none">{placeholder}</div>
                )}
                <div
                    ref={ref}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    onInput={emit}
                    onBeforeInput={handleBeforeInput}
                    onPaste={handlePaste}
                    onKeyUp={refreshActive}
                    onMouseUp={refreshActive}
                    style={{ minHeight }}
                    className="rich-text px-4 py-2.5 text-sm text-midnight-indigo focus:outline-none max-h-72 overflow-y-auto"
                />
            </div>
            {maxLength && (
                <div className={`px-4 pb-1.5 text-right text-[11px] ${length >= maxLength ? 'text-red-500' : 'text-slate-blue/60'}`}>
                    {length}/{maxLength}
                </div>
            )}
        </div>
    );
}

export function RichTextView({ html, className = '', fallback = null }) {
    if (!html || !htmlToPlainText(html).trim()) return fallback;
    return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
