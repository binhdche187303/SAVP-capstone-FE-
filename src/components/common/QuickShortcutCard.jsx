import { ArrowRight } from 'lucide-react';

// Giữ màu chuyển sắc của thẻ lối tắt gốc; chỉ thu gọn kích thước, chữ và khoảng cách.
const TONES = {
    blue: { bg: 'from-blue-500 to-blue-600', text: 'text-blue-100' },
    indigo: { bg: 'from-indigo-500 to-indigo-600', text: 'text-indigo-100' },
    emerald: { bg: 'from-emerald-500 to-emerald-600', text: 'text-emerald-100' },
    purple: { bg: 'from-purple-500 to-purple-600', text: 'text-purple-100' },
    amber: { bg: 'from-amber-500 to-amber-600', text: 'text-amber-100' },
};

/** Thẻ lối tắt gọn trên trang chủ (manager / employee). */
const QuickShortcutCard = ({ icon: Icon, tone = 'blue', title, description, action, onClick }) => {
    const t = TONES[tone] || TONES.blue;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group w-full h-full text-left bg-gradient-to-br ${t.bg} rounded-2xl p-4 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3`}
        >
            <span className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Icon className="w-[18px] h-[18px] text-white" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-bold">{title}</span>
                    <span className={`block text-xs mt-0.5 line-clamp-2 ${t.text}`}>{description}</span>
                </span>
            </span>
            <span data-ui-text="action" className="mt-auto inline-flex items-center gap-1 text-xs font-bold group-hover:gap-2 transition-all">
                {action} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
        </button>
    );
};

export default QuickShortcutCard;
