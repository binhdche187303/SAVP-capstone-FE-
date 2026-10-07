import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, Copy, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import {
    listSchedules, toggleSchedule, duplicateSchedule, deleteSchedule, runScheduleNow, getReportLookups,
} from '../../../service/reportCenterService';
import { formatDateTime } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ScheduleFormModal from '../../../components/report/ScheduleFormModal';
import { describeFrequency, FORMAT_LABELS } from '../../../components/report/scheduleLabels';
import { pageCls, cardCls, btnPrimary, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// S10 (2.13): thiết lập lịch gửi báo cáo tự động.
const iconBtn = 'p-1.5 rounded-lg text-slate-blue hover:bg-cloud-mist hover:text-action-blue disabled:opacity-40';

const ReportSchedules = () => {
    const base = useAreaBase();
    const [searchParams, setSearchParams] = useSearchParams();
    const [schedules, setSchedules] = useState(null);
    const [lookups, setLookups] = useState({});
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ open: false, initial: null });
    const [confirm, setConfirm] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        const res = await listSchedules();
        if (res?.success) {
            setSchedules(res.data);
            setError(null);
        } else {
            setError(res?.message || 'Không tải được danh sách lịch gửi');
        }
    }, []);

    useEffect(() => {
        getReportLookups().then((res) => { if (res?.success) setLookups(res.data); });
        load();
    }, [load]);

    // Mở từ trang xem báo cáo với ?new=1&type=<loại>: tự mở form điền sẵn loại.
    useEffect(() => {
        if (searchParams.get('new') !== '1') return;
        setForm({ open: true, initial: { reportType: searchParams.get('type') || undefined, filters: {} } });
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const act = async (id, call, onDone) => {
        setBusyId(id);
        const res = await call();
        setBusyId(null);
        if (res?.success) {
            onDone?.(res.data);
            load();
        } else {
            toast.error(res?.message || 'Thao tác không thành công');
        }
    };

    const sendTest = (schedule) => act(schedule.id, () => runScheduleNow(schedule.id), (run) => {
        setNotice(`Đã gửi thử "${schedule.name}" tới ${run.recipientCount} người nhận.`);
        toast.success(`Đã gửi thử tới ${run.recipientCount} người nhận`);
    });

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <CalendarClock className="w-6 h-6 text-action-blue" />
                        Lịch gửi báo cáo tự động
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">Hệ thống tự tạo báo cáo theo kỳ và gửi email kèm file PDF, Excel, Word tới người nhận.</p>
                </div>
                <button type="button" className={btnPrimary} onClick={() => setForm({ open: true, initial: null })}>
                    <Plus className="w-4 h-4" /> Tạo lịch gửi
                </button>
            </div>

            {notice && (
                <div className="px-4 py-3 rounded-2xl bg-green-50 border border-green-200 text-xs text-green-800 flex flex-wrap items-center justify-between gap-3">
                    <span>{notice}</span>
                    <Link to={`${base}/report-schedules/runs`} className="font-semibold underline">Xem lịch sử gửi</Link>
                </div>
            )}
            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Tên lịch', 'Báo cáo', 'Tần suất', 'Định dạng', 'Người nhận', 'Chạy gần nhất', 'Chạy kế tiếp', 'Bật', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {!schedules && <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-blue">Đang tải dữ liệu…</td></tr>}
                            {schedules?.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-blue space-y-3">
                                        <p>Chưa có lịch gửi nào</p>
                                        <button type="button" className={btnPrimary} onClick={() => setForm({ open: true, initial: null })}>Tạo lịch gửi đầu tiên</button>
                                    </td>
                                </tr>
                            )}
                            {schedules?.map((schedule) => (
                                <tr key={schedule.id} className="border-b border-pale-gray last:border-0">
                                    <td className={`${tdCls} font-semibold`}>{schedule.name}</td>
                                    <td className={tdCls}>{schedule.reportTitle}</td>
                                    <td className={tdCls}>{describeFrequency(schedule)}</td>
                                    <td className={tdCls}>
                                        <span className="flex gap-1">
                                            {schedule.formats.map((f) => <span key={f} className="px-2 py-0.5 rounded-md bg-pale-gray text-[11px] font-semibold">{FORMAT_LABELS[f]}</span>)}
                                        </span>
                                    </td>
                                    <td className={tdCls} title={schedule.recipients.map((r) => r.label).join('\n')}>{schedule.recipients.length} người</td>
                                    <td className={tdCls}>{formatDateTime(schedule.lastRunAt)}</td>
                                    <td className={tdCls} data-testid="next-run">{formatDateTime(schedule.nextRunAt)}</td>
                                    <td className={tdCls}>
                                        <input
                                            type="checkbox"
                                            role="switch"
                                            aria-label={`Bật lịch ${schedule.name}`}
                                            className="w-4 h-4 accent-[#006BFF] cursor-pointer"
                                            checked={schedule.enabled}
                                            disabled={busyId === schedule.id}
                                            onChange={(e) => act(schedule.id, () => toggleSchedule(schedule.id, e.target.checked))}
                                        />
                                    </td>
                                    <td className={`${tdCls} text-right`}>
                                        <span className="inline-flex items-center gap-1">
                                            <button type="button" className={iconBtn} aria-label="Gửi thử" title="Gửi thử ngay" disabled={busyId === schedule.id} onClick={() => sendTest(schedule)}><Send className="w-4 h-4" /></button>
                                            <button type="button" className={iconBtn} aria-label="Sửa" title="Sửa" onClick={() => setForm({ open: true, initial: schedule })}><Pencil className="w-4 h-4" /></button>
                                            <button type="button" className={iconBtn} aria-label="Nhân bản" title="Nhân bản" disabled={busyId === schedule.id} onClick={() => act(schedule.id, () => duplicateSchedule(schedule.id), () => toast.success('Đã nhân bản lịch gửi (đang tắt)'))}><Copy className="w-4 h-4" /></button>
                                            <button type="button" className={`${iconBtn} hover:text-red-600`} aria-label="Xóa" title="Xóa" onClick={() => setConfirm(schedule)}><Trash2 className="w-4 h-4" /></button>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ScheduleFormModal
                isOpen={form.open}
                initial={form.initial}
                lookups={lookups}
                onClose={() => setForm({ open: false, initial: null })}
                onSaved={(saved) => {
                    setForm({ open: false, initial: null });
                    toast.success(`Đã lưu lịch gửi "${saved.name}"`);
                    load();
                }}
            />
            <ConfirmDialog
                isOpen={Boolean(confirm)}
                message={`Xóa lịch gửi "${confirm?.name}"? Lịch sử các lần đã gửi vẫn được giữ.`}
                confirmLabel="Xóa"
                onConfirm={() => { const target = confirm; setConfirm(null); act(target.id, () => deleteSchedule(target.id), () => toast.success('Đã xóa lịch gửi')); }}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
};

export default ReportSchedules;
