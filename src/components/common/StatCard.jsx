import { Link } from 'react-router-dom';

// Thẻ số liệu dùng chung cho mọi trang — mẫu gốc: thẻ trạng thái ở trang Cảnh báo an ninh.
//   Nhãn: chữ nhỏ in đậm VIẾT HOA · icon nhỏ góc phải · số to 3xl · dòng gợi ý 11px.
//   tone 'neutral' = nền trắng (icon xanh); các tone khác = nền nhạt cùng màu, chữ/icon cùng màu.
// Chỉ là lớp giao diện: giá trị, onClick, link... do trang truyền vào giữ nguyên.

export const STAT_TONES = {
    neutral: { box: 'bg-white border-platinum-tint text-midnight-indigo', label: 'text-slate-blue', icon: 'text-action-blue', hint: 'text-slate-400', ring: 'ring-action-blue' },
    red: { box: 'bg-red-50 border-red-200 text-red-600', ring: 'ring-red-400' },
    amber: { box: 'bg-yellow-50 border-yellow-200 text-yellow-700', ring: 'ring-yellow-400' },
    green: { box: 'bg-green-50 border-green-200 text-green-700', ring: 'ring-green-400' },
    violet: { box: 'bg-violet-50 border-violet-200 text-violet-700', ring: 'ring-violet-400' },
    slate: { box: 'bg-slate-50 border-slate-200 text-slate-600', ring: 'ring-slate-400' },
    blue: { box: 'bg-blue-50 border-blue-200 text-blue-700', ring: 'ring-blue-400' },
};

// Lớp chữ của con số — dùng lại khi trang tự dựng hàng số (vd. số + biểu đồ mini).
export const STAT_VALUE_CLS = 'text-3xl font-bold mt-2 leading-tight';

// Đoán tone từ chuỗi class màu cũ của trang (vd. 'bg-emerald-50 text-emerald-600') — xanh dương giữ nền trắng.
export const toneOf = (cls = '') => {
    if (/cloud-mist/.test(cls)) return 'neutral';
    if (/red|rose/.test(cls)) return 'red';
    if (/amber|yellow|orange/.test(cls)) return 'amber';
    if (/emerald|green|teal/.test(cls)) return 'green';
    if (/violet|purple|fuchsia/.test(cls)) return 'violet';
    if (/gray|slate|steel/.test(cls)) return 'slate';
    return 'neutral';
};

// Giá trị là chữ dài (vd. "Đầy sau 10 ngày") ở cỡ 3xl sẽ xuống dòng làm cả hàng thẻ cao lên → tự thu nhỏ.
const valueSizeCls = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return STAT_VALUE_CLS;
    const len = String(value).length;
    if (len <= 10) return STAT_VALUE_CLS;
    return `${len <= 18 ? 'text-2xl' : 'text-xl'} font-bold mt-2 leading-tight`;
};

const StatCard = ({
    label, value, hint, icon: Icon, tone = 'neutral', onClick, to, active = false,
    loading = false, valueTestId, className = '', children,
}) => {
    const t = STAT_TONES[tone] || STAT_TONES.neutral;
    const interactive = Boolean(onClick || to);
    const cls = `block w-full text-left p-4 rounded-2xl border shadow-sm transition-all ${t.box} ${interactive ? 'hover:shadow-md cursor-pointer' : ''} ${active ? `ring-2 ${t.ring}` : ''} ${className}`;
    const body = (
        <>
            <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-bold uppercase ${t.label || ''}`}>{label}</span>
                {Icon && <Icon className={`w-5 h-5 shrink-0 ${t.icon || ''}`} />}
            </div>
            {loading ? (
                <div className="h-9 w-16 bg-current opacity-10 rounded animate-pulse mt-2" />
            ) : value !== undefined && (
                <p data-testid={valueTestId} className={valueSizeCls(value)}>{value}</p>
            )}
            {hint && <p className={`text-[11px] mt-1 ${t.hint || 'opacity-70'}`}>{hint}</p>}
            {children}
        </>
    );
    if (to) return <Link to={to} className={`no-underline ${cls}`}>{body}</Link>;
    if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
    return <div className={cls}>{body}</div>;
};

export default StatCard;
