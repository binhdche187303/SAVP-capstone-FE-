import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { cardCls } from '../common/uiClasses';

const COLORS = ['#006BFF', '#22c55e', '#f59e0b', '#ef4444', '#8247f5', '#06b6d4'];
const AXIS = { fontSize: 11, fill: '#476788' };

const renderChart = (config, data) => {
    if (config.kind === 'pie') {
        const valueKey = config.series[0].key;
        return (
            <PieChart>
                <Pie data={data} dataKey={valueKey} nameKey={config.xKey} innerRadius={55} outerRadius={95} paddingAngle={2} isAnimationActive={false}>
                    {data.map((entry, i) => <Cell key={entry[config.xKey]} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
        );
    }
    const Chart = config.kind === 'line' ? LineChart : BarChart;
    return (
        <Chart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EDF6" />
            <XAxis dataKey={config.xKey} tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip />
            {config.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {config.series.map((s, i) => (config.kind === 'line'
                ? <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
                : <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />))}
        </Chart>
    );
};

// config: phần tử `charts` của khai báo báo cáo ({ title, kind, xKey, series }).
const ReportChart = ({ config, data = [] }) => (
    <div className={`${cardCls} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
            <h3 className="font-bold text-midnight-indigo text-sm">{config.title}</h3>
        </div>
        <div className="p-4" style={{ height: 312 }}>
            {data.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-blue">Chưa có dữ liệu trong kỳ đã chọn</div>
            ) : (
                <ResponsiveContainer width="100%" height={280}>{renderChart(config, data)}</ResponsiveContainer>
            )}
        </div>
    </div>
);

export default ReportChart;
