import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMyPenaltyReport } from '../../service/managerServices';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList } from 'recharts';


export const summarizePointsByDay = (items = []) => {
    const days = new Map();
    for (const item of items) {
        const date = new Date(item.startTime);
        if (Number.isNaN(date.getTime())) continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
        const row = days.get(day) || { day, points: 0, meetings: 0 };
        row.points += Number(item.points) || 0;
        row.meetings += 1;
        days.set(day, row);
    }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
};

const formatChartDay = day => {
    const [, month, date] = day.split('-');
    return `${date}/${month}`;
};

export const usePersonalAttendancePoints = (from, to, enabled = true) => {
    const [result, setResult] = useState({ loading: true, data: null, error: false });
    useEffect(() => {
        if (!enabled) return undefined;
        let active = true;
        setResult({ loading: true, data: null, error: false });
        getMyPenaltyReport({ from, to }).then(response => {
            if (!active) return;
            if (response?.success === false || !response?.data?.summary) {
                setResult({ loading: false, data: null, error: true });
                return;
            }
            setResult({ loading: false, data: response.data, error: false });
        }).catch(() => {
            if (active) setResult({ loading: false, data: null, error: true });
        });
        return () => { active = false; };
    }, [from, to, enabled]);
    return result;
};

const PersonalAttendancePoints = ({ from, to, report }) => {
    const ownReport = usePersonalAttendancePoints(from, to, !report);
    const result = report || ownReport;
    const chartData = useMemo(() => summarizePointsByDay(result.data?.items), [result.data?.items]);
    return <section className="personal-stats-chart personal-points-overview" aria-label="Phân tích điểm chuyên cần" aria-busy={result.loading}>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>Điểm chuyên cần theo ngày</h3>
            <Link to="/employee/attendance-points" className="text-sm font-semibold text-action-blue hover:underline">Xem chi tiết điểm</Link>
        </div>
        <p data-ui-text="secondary">Theo dõi điểm của từng ngày có cuộc họp trong khoảng thời gian đã chọn.</p>
        {result.loading ? <div role="status" className="personal-points-chart-empty text-slate-blue">Đang tải biểu đồ điểm...</div>
            : result.error ? <p role="alert" className="text-sm text-red-600">Chưa tải được điểm chuyên cần. Bạn có thể xem tại báo cáo điểm hoặc tải lại trang.</p> : <>
            {chartData.length ? <div className="personal-points-line-chart" role="img"
                aria-label={`Điểm theo ngày: ${chartData.map(item => `${formatChartDay(item.day)}: ${item.points} điểm`).join('; ')}`}>
                <ResponsiveContainer width="100%" height={300} minWidth={0} debounce={100}>
                    <LineChart data={chartData} margin={{ top: 28, right: 28, left: 0, bottom: 16 }} accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1f6" />
                        <XAxis dataKey="day" tickFormatter={formatChartDay} minTickGap={28}
                            tick={{ fontSize: 12, fill: '#476788' }} padding={{ left: 16, right: 16 }} />
                        <YAxis allowDecimals={false} width={40}
                            domain={[minimum => Math.min(0, minimum) - 1, maximum => Math.max(0, maximum) + 1]}
                            tick={{ fontSize: 12, fill: '#476788' }} />
                        <ReferenceLine y={0} stroke="#9fb0c5" />
                        <Tooltip labelFormatter={day => `Ngày ${formatChartDay(day)}/${day.slice(0, 4)}`}
                            formatter={(value, name, entry) => [`${value} điểm · ${entry.payload.meetings} cuộc họp`, 'Điểm chuyên cần']}
                            contentStyle={{ fontSize: 14, borderRadius: 8, border: '1px solid #d4e0ed' }} />
                        <Line type="linear" dataKey="points" name="Điểm chuyên cần" stroke="#0066ff" strokeWidth={2.5}
                            dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                            {chartData.length <= 14 && <LabelList dataKey="points" position="top" offset={12} fill="#476788" fontSize={12} />}
                        </Line>
                    </LineChart>
                </ResponsiveContainer>
            </div> : <p data-ui-text="body" className="personal-points-chart-empty">Chưa có dữ liệu điểm trong khoảng đã chọn.</p>}

        </>}
    </section>;
};

export default PersonalAttendancePoints;
