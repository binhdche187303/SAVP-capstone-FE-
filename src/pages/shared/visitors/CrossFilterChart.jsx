import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cardCls } from '../../../components/common/uiClasses';

// Biểu đồ của trang Thống kê khách có lọc chéo kiểu Power BI.
//   mode 'none'      — chưa chọn gì: vẽ bình thường.
//   mode 'source'    — biểu đồ đang được chọn: cột/lát đã chọn đậm, còn lại mờ.
//   mode 'highlight' — biểu đồ khác: nền mờ là toàn bộ, phần đậm (`hl`) là phần liên quan tới lựa chọn;
//                      mục không có dữ liệu liên quan chỉ còn nền mờ.
// rows: [{ ...dữ liệu gốc, count, hl?, selected? }]. onSelect(row) bấm 1 lần để chọn, bấm lại để bỏ chọn.

const COLORS = ['#006BFF', '#22c55e', '#f59e0b', '#ef4444', '#8247f5', '#06b6d4'];
const PRIMARY = COLORS[0];
const FADED = 0.25;
const AXIS = { fontSize: 11, fill: '#476788' };

const indexOfClick = (state) => {
    const idx = Number(state?.activeTooltipIndex ?? state?.activeIndex);
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
};

const PieLegend = ({ rows, xKey, mode, onSelect }) => (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
        {rows.map((row, i) => {
            const dimmed = (mode === 'source' && !row.selected) || (mode === 'highlight' && !row.hl);
            return (
                <button
                    key={row[xKey]}
                    type="button"
                    onClick={() => onSelect(row)}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-blue hover:text-midnight-indigo transition-opacity ${dimmed ? 'opacity-40' : ''}`}
                >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {row[xKey]}
                    {mode === 'highlight' && <span className="text-midnight-indigo">({row.hl || 0})</span>}
                </button>
            );
        })}
    </div>
);

const renderPie = (config, rows, mode, onSelect) => {
    // Highlight: lát cắt theo số liên quan; mục bằng 0 vẫn ở chú thích nhưng mờ.
    const colored = rows.map((row, i) => ({ ...row, color: COLORS[i % COLORS.length] }));
    const pieRows = mode === 'highlight' ? colored.filter((row) => row.hl > 0) : colored;
    const valueKey = mode === 'highlight' ? 'hl' : 'count';
    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
                {pieRows.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer={false}>
                            <Pie
                                data={pieRows}
                                dataKey={valueKey}
                                nameKey={config.xKey}
                                innerRadius={55}
                                outerRadius={90}
                                paddingAngle={2}
                                isAnimationActive={false}
                                onClick={(_, index) => pieRows[index] && onSelect(pieRows[index])}
                                style={{ cursor: 'pointer', outline: 'none' }}
                            >
                                {pieRows.map((row) => (
                                    <Cell key={row[config.xKey]} fill={row.color} fillOpacity={mode === 'source' && !row.selected ? FADED : 1} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-blue">Không có lượt liên quan</div>
                )}
            </div>
            <PieLegend rows={colored} xKey={config.xKey} mode={mode} onSelect={onSelect} />
        </div>
    );
};

const renderCartesian = (config, rows, mode, onSelect) => {
    const onClick = (state) => {
        const idx = indexOfClick(state);
        if (idx !== null && rows[idx]) onSelect(rows[idx]);
    };
    const common = {
        data: rows,
        margin: { top: 8, right: 16, left: -8, bottom: 0 },
        onClick,
        accessibilityLayer: false,
        style: { cursor: 'pointer' },
    };
    const axes = [
        <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#E7EDF6" />,
        <XAxis key="x" dataKey={config.xKey} tick={AXIS} interval="preserveStartEnd" />,
        <YAxis key="y" tick={AXIS} allowDecimals={false} />,
        <Tooltip key="tip" />,
    ];

    if (config.kind === 'line') {
        const selectedDot = (props) => {
            const { cx, cy, payload, index } = props;
            if (!payload?.selected || cx == null || cy == null) return <g key={index} />;
            return <circle key={index} cx={cx} cy={cy} r={5} fill={PRIMARY} stroke="#fff" strokeWidth={2} />;
        };
        return (
            <LineChart {...common}>
                {axes}
                {mode === 'highlight' ? (
                    [
                        <Line key="all" type="monotone" dataKey="count" name="Tất cả" stroke={PRIMARY} strokeOpacity={FADED} strokeWidth={2} dot={false} isAnimationActive={false} />,
                        <Line key="hl" type="monotone" dataKey="hl" name="Liên quan" stroke={PRIMARY} strokeWidth={2.5} dot={false} isAnimationActive={false} />,
                    ]
                ) : (
                    <Line
                        type="monotone"
                        dataKey="count"
                        name={config.series[0].label}
                        stroke={PRIMARY}
                        strokeOpacity={mode === 'source' ? 0.5 : 1}
                        strokeWidth={2}
                        dot={mode === 'source' ? selectedDot : false}
                        isAnimationActive={false}
                    />
                )}
            </LineChart>
        );
    }

    return (
        <BarChart {...common} barGap={mode === 'highlight' ? '-100%' : 4}>
            {axes}
            {mode === 'highlight' ? (
                [
                    <Bar key="all" dataKey="count" name="Tất cả" fill={PRIMARY} fillOpacity={FADED} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />,
                    <Bar key="hl" dataKey="hl" name="Liên quan" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />,
                ]
            ) : (
                <Bar dataKey="count" name={config.series[0].label} fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {rows.map((row, i) => (
                        <Cell key={i} fillOpacity={mode === 'source' && !row.selected ? FADED : 1} />
                    ))}
                </Bar>
            )}
        </BarChart>
    );
};

const CrossFilterChart = ({ config, rows = [], mode = 'none', onSelect }) => (
    <div className={`${cardCls} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex items-center justify-between gap-3">
            <h3 className="font-bold text-midnight-indigo text-sm">{config.title}</h3>
            {mode === 'source' && <span className="text-[11px] font-semibold text-action-blue">Đang lọc theo biểu đồ này</span>}
        </div>
        <div className="p-4" style={{ height: 312 }}>
            {rows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-blue">Chưa có dữ liệu trong kỳ đã chọn</div>
            ) : config.kind === 'pie' ? (
                renderPie(config, rows, mode, onSelect)
            ) : (
                <ResponsiveContainer width="100%" height={280}>{renderCartesian(config, rows, mode, onSelect)}</ResponsiveContainer>
            )}
        </div>
    </div>
);

export default CrossFilterChart;
