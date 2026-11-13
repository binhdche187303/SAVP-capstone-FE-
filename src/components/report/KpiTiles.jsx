import StatCard from '../common/StatCard';

// items: [{ key, label, value, tone? }] — value đã được định dạng thành chuỗi.
const KpiTiles = ({ items = [] }) => (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {items.map((item) => (
            <StatCard key={item.key} label={item.label} value={item.value} tone={item.tone} />
        ))}
    </div>
);

export default KpiTiles;
