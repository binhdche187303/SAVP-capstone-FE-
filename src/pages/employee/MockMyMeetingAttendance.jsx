import { useEffect, useState } from 'react';
import { Award, CheckCircle, Clock, MapPin, XCircle } from 'lucide-react';

import StatCard from '../../components/common/StatCard';
import { ATTENDANCE_STATUS, CALENDAR_TYPES, getMockMySchedule } from '../../mocks/meetingCalendarMock';

// MOCK-BE: "Lịch sử tham dự" khi chưa có API VPĐT — tổng hợp vi phạm của chính mình từ X đến Y
// (docx: Báo cáo theo nhân sự). Dữ liệu cùng nguồn với lịch (meetingCalendarMock).

const toInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (v) => new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--');

const MockMyMeetingAttendance = ({ onOpen }) => {
    const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return toInput(d); });
    const [to, setTo] = useState(() => toInput(new Date()));
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        getMockMySchedule({ from: `${from}T00:00:00+07:00`, to: `${to}T23:59:59+07:00`, status: ['completed'] }).then((res) => {
            if (!alive) return;
            setRows((res.data.items || [])
                .filter((m) => m.attendanceEnabled)
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime)));
            setLoading(false);
        });
        return () => { alive = false; };
    }, [from, to]);

    const att = rows.map((r) => r.myAttendance);
    const total = att.reduce((s, a) => s + (a?.points || 0), 0);
    const count = (fn) => att.filter(fn).length;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Cuộc họp có điểm danh" value={loading ? undefined : rows.length} loading={loading} icon={CheckCircle} />
                <StatCard label="Đúng giờ" value={loading ? undefined : count((a) => a?.status === 'present')} loading={loading} icon={CheckCircle} tone="green" />
                <StatCard label="Trễ / về sớm / vắng" value={loading ? undefined : `${count((a) => ['late', 'late_early'].includes(a?.status))} / ${count((a) => ['early_leave', 'late_early'].includes(a?.status))} / ${count((a) => a?.status === 'absent')}`} loading={loading} icon={Clock} tone="amber" />
                <StatCard label="Tổng điểm trừ" value={loading ? undefined : total} loading={loading} icon={Award} tone={total < 0 ? 'red' : 'neutral'} hint={`${count((a) => a?.excused)} lần có lý do được duyệt (0 điểm)`} />
            </div>

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                <div className="p-5 border-b border-platinum-tint flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-midnight-indigo uppercase tracking-wide">Lịch sử tham dự họp</h2>
                        <p className="text-xs text-slate-blue mt-1">Tổng hợp điểm danh và điểm trừ của bạn theo khoảng thời gian (camera + thư ký ghi nhận).</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-blue font-semibold">Từ</span>
                        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 border border-platinum-tint rounded-lg" />
                        <span className="text-slate-blue font-semibold">đến</span>
                        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 border border-platinum-tint rounded-lg" />
                    </div>
                </div>

                {!loading && rows.length === 0 && <p className="py-12 text-center text-sm text-slate-blue">Không có cuộc họp có điểm danh trong khoảng này.</p>}

                <div className="divide-y divide-platinum-tint">
                    {rows.map((m) => {
                        const a = m.myAttendance || {};
                        const st = ATTENDANCE_STATUS[a.status] || ATTENDANCE_STATUS.upcoming;
                        const Icon = a.status === 'present' ? CheckCircle : a.status === 'absent' ? XCircle : Clock;
                        const type = CALENDAR_TYPES[m.calendarType];
                        return (
                            <div
                                key={m.meetingId}
                                role="button"
                                tabIndex={0}
                                onClick={() => onOpen?.(m.meetingId)}
                                onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(m.meetingId); }}
                                className="cursor-pointer px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-cloud-mist/30"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        {type && <span className={`w-2 h-2 rounded-full shrink-0 ${type.dot}`} title={type.label} />}
                                        <p className="text-sm font-bold text-midnight-indigo truncate">{m.title}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-blue">
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmt(m.startTime)}</span>
                                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{m.roomName}</span>
                                        <span>Vào {fmtTime(a.checkInAt)} · Ra {fmtTime(a.checkOutAt)}</span>
                                    </div>
                                    {a.reason && <p className="text-[11px] mt-1 text-slate-blue">Lý do: <i>{a.reason}</i> – {a.reasonStatus === 'approved' ? 'đã duyệt' : 'chưa được duyệt'}</p>}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`text-sm font-bold ${a.points < 0 ? 'text-red-600' : 'text-midnight-indigo'}`}>{a.points ?? 0} điểm</span>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${st.cls}`}>
                                        <Icon className="w-3.5 h-3.5" /> {st.label}{a.excused ? ' (có lý do)' : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default MockMyMeetingAttendance;
