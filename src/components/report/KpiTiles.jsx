import StatCard from '../common/StatCard';
import StatisticGrid from '../common/StatisticGrid';

// items: [{ key, label, value, tone?, icon?, active?, onClick? }] — value đã được định dạng thành chuỗi.
const KpiTiles = ({ items = [], maxVisible, ariaLabel }) => {
    const hasLimit = Number.isInteger(maxVisible) && maxVisible > 0;
    const visibleItems = hasLimit ? items.slice(0, maxVisible) : items;
    const extraItems = hasLimit ? items.slice(maxVisible) : [];
    const dotClass = {
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        green: 'bg-emerald-500',
        slate: 'bg-slate-500',
        blue: 'bg-blue-600',
        violet: 'bg-violet-500',
    };

    return (
        <div role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel} className={`${hasLimit ? 'rounded-2xl border border-platinum-tint bg-white p-4 shadow-sm' : ''} space-y-3`}>
            <StatisticGrid
                columns={hasLimit ? maxVisible : 5}
                className={`grid grid-cols-2 ${hasLimit ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-4`}
            >
                {visibleItems.map((item) => (
                    <StatCard key={item.key} label={item.label} value={item.value} hint={item.hint} tone={item.tone} icon={item.icon}
                        active={item.active} onClick={item.onClick} to={item.to}
                        loading={item.loading} compactValue={item.compactValue} />
                ))}
            </StatisticGrid>

            {extraItems.length > 0 && (
                <div role="group" aria-label="Khác" className="flex flex-wrap items-center gap-2 border-t border-platinum-tint pt-3">
                    <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Khác:</span>
                    {extraItems.map((item) => {
                        const Tag = item.onClick ? 'button' : item.to ? 'a' : 'span';
                        return (
                        <Tag key={item.key} type={item.onClick ? 'button' : undefined} href={item.to}
                            onClick={item.onClick} aria-label={item.onClick && typeof item.label === 'string' ? item.label : undefined}
                            aria-pressed={item.onClick ? Boolean(item.active) : undefined}
                            className={`inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-blue shadow-sm transition ${item.active ? 'border-action-blue ring-1 ring-action-blue' : 'border-platinum-tint'} ${item.onClick || item.to ? 'cursor-pointer hover:border-blue-300 hover:text-action-blue' : ''}`}>
                            <span className={`h-2 w-2 rounded-full ${dotClass[item.tone] || 'bg-slate-400'}`} aria-hidden="true" />
                            {item.label}
                            <span className="min-w-5 rounded-full bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-midnight-indigo">{item.value}</span>
                        </Tag>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default KpiTiles;
