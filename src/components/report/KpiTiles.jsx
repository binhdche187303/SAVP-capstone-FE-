import StatisticGrid from '../common/StatisticGrid';
import StatisticCard from '../common/StatisticCard';
import { cardCls } from '../common/uiClasses';

// items: [{ key, label, value }] — value đã được định dạng thành chuỗi.
const KpiTiles = ({ items = [] }) => (
    <StatisticGrid columns={5} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {items.map((item) => (
            <StatisticCard key={item.key} label={item.label} value={item.value} legacy={(<div className={`${cardCls} p-4`}>
                <p className="text-[10px] font-bold text-slate-blue uppercase">{item.label}</p>
                <p className="text-2xl font-bold text-midnight-indigo mt-1">{item.value}</p>
            </div>)} />
        ))}
    </StatisticGrid>
);

export default KpiTiles;
