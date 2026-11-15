import ExportModeDialog from '../report/ExportModeDialog';
import { exportReport, completeReportExport } from '../../service/reportCenterService';
import { post } from '../../utils/request';
import toast from '../../utils/toast';

const CENTER_TYPES = new Set(['staff-attendance', 'student-attendance', 'gate-access', 'room-utilization', 'vehicle', 'visitor', 'security-alert']);
const centerTypeOf = endpoint => {
    const match = /^\/reports\/([a-z-]+)\/exports$/.exec(endpoint || '');
    return match && CENTER_TYPES.has(match[1]) ? match[1] : null;
};

export const reportPresetRange = (preset, from, to) => {
    if (preset === 'custom') return { from, to };
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);
    if (preset === 'week') { start.setDate(today.getDate() - ((today.getDay() + 6) % 7)); end.setDate(start.getDate() + 6); }
    if (preset === 'year') { start.setMonth(0, 1); end.setMonth(11, 31); }
    if (preset === 'month') { start.setDate(1); end.setMonth(today.getMonth() + 1, 0); }
    const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { from: ymd(start), to: ymd(end) };
};

// Legacy endpoints (notably CSV) share the same job and signed-download lifecycle.
const exportLegacy = async (endpoint, payload) => {
    const legacyPayload = endpoint === '/reports/room-utilization/exports'
        ? { from: payload.from, to: payload.to, format: payload.format, delivery: 'download', ...(payload.roomId ? { scope: { roomId: payload.roomId } } : {}) } : payload;
    const created = await post(endpoint, legacyPayload);
    return completeReportExport(created, { autoDownload: false, format: payload.format });
};

const ExportReportModal = ({ isOpen, onClose, endpoint = '/reports/room-utilization/exports',
    title = 'Xuất báo cáo', formats = ['xlsx', 'pdf', 'csv'], filters = {}, filterSummary = [], range }) => {
    const reportType = centerTypeOf(endpoint);
    const available = (reportType ? [...new Set([...formats, 'docx'])] : formats).filter(value => !(value === 'csv' && filters.building));
    const initialRange = range || { from: '', to: '' };
    return <ExportModeDialog isOpen={isOpen} onClose={onClose} title={title} formats={available}
        reportType={reportType || undefined} allowStandard={Boolean(reportType)}
        initialRange={initialRange} editableRange={!range?.from || !range?.to}
        filterSummary={filterSummary}
        onConfirm={async (extra, options) => {
            const payload = { ...filters, ...options.range, format: options.format, ...extra };
            const result = reportType && options.format !== 'csv'
                ? await exportReport(reportType, payload, { autoDownload: false }) : await exportLegacy(endpoint, payload);
            if (result?.success) { toast.success('Đã tạo file báo cáo.'); if (!result.data?.downloadUrl) onClose(); }
            return result || { success: false, message: 'Không xuất được báo cáo' };
        }} />;
};

export default ExportReportModal;
