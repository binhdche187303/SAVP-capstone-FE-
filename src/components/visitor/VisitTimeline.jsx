import { VISIT_EVENT_LABELS, fmtDateTime, fmtScore } from './visitLabels';

const DOT = {
    access_denied: 'bg-red-500', rejected: 'bg-red-500', revoked: 'bg-red-500',
    manual_review: 'bg-amber-500', expired: 'bg-steel-gray', cancelled: 'bg-steel-gray',
    check_in: 'bg-green-500', face_verified: 'bg-green-500', check_out: 'bg-slate-blue',
};

// Dòng thời gian sự kiện của một lượt khách, mới nhất ở trên.
const VisitTimeline = ({ events = [], zones = [] }) => {
    const zoneName = (id) => zones.find((z) => z.id === id)?.name;
    const ordered = [...events].sort((a, b) => new Date(b.at) - new Date(a.at));
    if (ordered.length === 0) return <p className="text-xs text-slate-blue">Chưa có sự kiện nào.</p>;
    return (
        <ol className="space-y-3">
            {ordered.map((event, i) => (
                // Sự kiện không có id; thứ tự cố định trong một lần hiển thị.
                <li key={`${event.at}-${event.type}-${i}`} className="flex gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${DOT[event.type] || 'bg-action-blue'}`} />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-midnight-indigo">
                            {VISIT_EVENT_LABELS[event.type] || event.type}
                            {event.score !== null && event.score !== undefined && <span className="font-normal text-slate-blue"> · độ khớp {fmtScore(event.score)}</span>}
                        </p>
                        <p className="text-[11px] text-slate-blue">
                            {fmtDateTime(event.at)}
                            {event.zoneId && zoneName(event.zoneId) ? ` · ${zoneName(event.zoneId)}` : ''}
                            {event.actor ? ` · ${event.actor}` : ''}
                        </p>
                        {event.note && <p className="text-[11px] text-slate-blue italic">{event.note}</p>}
                    </div>
                </li>
            ))}
        </ol>
    );
};

export default VisitTimeline;
