import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, FileBarChart } from 'lucide-react';
import { getReportDefinition } from '../../../config/reportDefinitions';
import { getReportCatalog, getRecentExports, exportReport } from '../../../service/reportCenterService';
import { formatDateTime } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import DemoDataBanner from '../../../components/common/DemoDataBanner';
import { pageCls, cardCls, thCls, tdCls, errorBoxCls, spinnerCls } from '../../../components/common/uiClasses';

// S8 (2.13): danh mục 7 báo cáo + các file đã xuất gần đây.
const FORMAT_LABELS = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word' };
const dmy = (ymd) => String(ymd || '').split('-').reverse().join('/');

const ReportCenter = () => {
    const base = useAreaBase();
    const [catalog, setCatalog] = useState(null);
    const [recent, setRecent] = useState([]);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        const [catalogRes, recentRes] = await Promise.all([getReportCatalog(), getRecentExports()]);
        if (!catalogRes?.success) {
            setError(catalogRes?.message || 'Không tải được danh mục báo cáo');
            return;
        }
        setCatalog(catalogRes.data);
        setRecent(recentRes?.success ? recentRes.data : []);
    }, []);

    useEffect(() => { load(); }, [load]);

    const exportAgain = async (item) => {
        setBusyId(item.id);
        const res = await exportReport(item.reportType, { format: item.format, from: item.from, to: item.to });
        if (res?.success) {
            toast.success(`Đã xuất ${res.data.fileName}`);
            load();
        } else {
            toast.error(res?.message || 'Không xuất được báo cáo');
        }
        setBusyId(null);
    };

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5">
                <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                    <FileBarChart className="w-6 h-6 text-action-blue" />
                    Trung tâm báo cáo
                </h2>
                <p className="text-xs text-slate-blue mt-1">
                    Xem, xuất PDF / Excel / Word và đặt lịch gửi tự động cho 7 báo cáo quản trị.
                </p>
            </div>

            <DemoDataBanner onReset={load} />

            {error && <div className={errorBoxCls}>{error}</div>}
            {!error && !catalog && <div className="flex items-center justify-center h-64"><div className={spinnerCls} /></div>}

            {catalog && (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {catalog.map((item) => {
                        const Icon = getReportDefinition(item.type)?.icon || FileBarChart;
                        return (
                            <Link key={item.type} to={`${base}/reports/${item.type}`} className={`${cardCls} p-5 flex flex-col gap-3 hover:border-action-blue hover:shadow-sm-1 transition-all group`}>
                                <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-action-blue" />
                                    </span>
                                    <h3 className="font-bold text-midnight-indigo text-sm">{item.title}</h3>
                                </div>
                                <p className="text-xs text-slate-blue flex-1">{item.description}</p>
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="inline-flex items-center gap-1 text-slate-blue">
                                        <CalendarClock className="w-3.5 h-3.5" /> {item.activeSchedules} lịch gửi đang bật
                                    </span>
                                    <span className="inline-flex items-center gap-1 font-semibold text-action-blue group-hover:underline">
                                        Xem báo cáo <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {catalog && (
                <div className={`${cardCls} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30">
                        <h3 className="font-bold text-midnight-indigo text-sm">File xuất gần đây</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-platinum-tint">
                                <tr>
                                    {['Báo cáo', 'Kỳ dữ liệu', 'Định dạng', 'Tên file', 'Thời điểm xuất', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {recent.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-blue">Chưa có file nào được xuất</td></tr>
                                ) : recent.map((item) => (
                                    <tr key={item.id} className="border-b border-pale-gray last:border-0">
                                        <td className={`${tdCls} font-semibold`}>{item.reportTitle}</td>
                                        <td className={tdCls}>{dmy(item.from)} – {dmy(item.to)}</td>
                                        <td className={tdCls}><span className="px-2 py-0.5 rounded-md bg-pale-gray text-[11px] font-semibold">{FORMAT_LABELS[item.format] || item.format}</span></td>
                                        <td className={`${tdCls} text-slate-blue`}>{item.fileName}</td>
                                        <td className={tdCls}>{formatDateTime(item.createdAt)}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <button type="button" disabled={busyId === item.id} onClick={() => exportAgain(item)} className="text-action-blue font-semibold hover:underline disabled:opacity-50">
                                                Xuất lại
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportCenter;
