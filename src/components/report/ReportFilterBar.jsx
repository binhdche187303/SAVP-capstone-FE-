import { Search } from 'lucide-react';
import { cardCls, inputCls, searchInputCls, labelCls, btnPrimary } from '../common/uiClasses';

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Tuần tính từ thứ Hai, tháng từ ngày 1, đều đến hôm nay.
export const presetRange = (preset) => {
    const today = new Date();
    if (preset === 'week') {
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
        return { from: toYmd(monday), to: toYmd(today) };
    }
    if (preset === 'month') return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYmd(today) };
    return { from: toYmd(today), to: toYmd(today) };
};

export const defaultFilterValue = () => ({ preset: 'month', ...presetRange('month'), q: '' });

const PRESETS = [['today', 'Hôm nay'], ['week', 'Tuần này'], ['month', 'Tháng này'], ['custom', 'Tùy chọn']];

const ReportFilterBar = ({ definition, lookups = {}, value, onChange, onApply, loading }) => {
    const set = (patch) => onChange({ ...value, ...patch });
    const choosePreset = (preset) => set(preset === 'custom' ? { preset } : { preset, ...presetRange(preset) });
    const isCustom = value.preset === 'custom';

    return (
        <form
            className={`${cardCls} p-4 flex flex-wrap gap-4 items-end`}
            onSubmit={(e) => { e.preventDefault(); onApply(); }}
        >
            <div className="space-y-1">
                <span className={labelCls}>Kỳ báo cáo</span>
                <div className="flex rounded-xl border border-platinum-tint overflow-hidden">
                    {PRESETS.map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => choosePreset(key)}
                            className={`px-3 py-2 text-xs font-semibold ${value.preset === key ? 'bg-action-blue text-white' : 'bg-white text-slate-blue hover:bg-cloud-mist'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-1">
                <label className={labelCls} htmlFor="report-from">Từ ngày</label>
                <input id="report-from" type="date" value={value.from} disabled={!isCustom} onChange={(e) => set({ from: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
            </div>
            <div className="space-y-1">
                <label className={labelCls} htmlFor="report-to">Đến ngày</label>
                <input id="report-to" type="date" value={value.to} disabled={!isCustom} onChange={(e) => set({ to: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
            </div>
            {definition.filters.map((filter) => {
                const choices = filter.options
                    ? filter.options.map((o) => ({ value: o.value, label: o.label }))
                    : (lookups[filter.lookup] || []).map((o) => ({ value: o.id, label: o.name }));
                return (
                    <div className="space-y-1" key={filter.key}>
                        <label className={labelCls} htmlFor={`report-${filter.key}`}>{filter.label}</label>
                        <select
                            id={`report-${filter.key}`}
                            value={value[filter.key] || ''}
                            onChange={(e) => set({ [filter.key]: e.target.value })}
                            className={`${inputCls} max-w-[200px]`}
                        >
                            <option value="">Tất cả</option>
                            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                );
            })}
            <div className="space-y-1">
                <label className={labelCls} htmlFor="report-q">Tìm trong bảng</label>
                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
                    <input id="report-q" type="text" value={value.q || ''} onChange={(e) => set({ q: e.target.value })} placeholder="Tên, mã, biển số…" className={`${searchInputCls} w-44`} />
                </div>
            </div>
            <button type="submit" className={btnPrimary} disabled={loading}>{loading ? 'Đang tải…' : 'Xem báo cáo'}</button>
        </form>
    );
};

export default ReportFilterBar;
