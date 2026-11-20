import PageHeading from '../../../components/common/PageHeading';
import ResponsiveTable from '../../../components/common/ResponsiveTable';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { getReportDefinition } from '../../../config/reportDefinitions';
import { listTemplates, deleteTemplate } from '../../../service/reportTemplateService';
import { templatesFull } from '../../../components/report/template/templateScope';
import { formatDateTime } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { pageCls, cardCls, btnPrimary, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// Danh sách mẫu báo cáo quy chuẩn (NĐ 30/2020). Mỗi loại báo cáo tối đa một mẫu riêng, cộng một mẫu
// "Tất cả báo cáo" dùng cho loại chưa có mẫu riêng — nên không có cờ mặc định, không nhân bản.
const iconBtn = 'p-1.5 rounded-lg text-slate-blue hover:bg-cloud-mist hover:text-action-blue disabled:opacity-40';

const chipCls = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold leading-5';

const AppliesTo = ({ types }) => (
    <span className="flex flex-wrap gap-1">
        {types?.length
            ? types.map((t) => <span key={t} data-ui-text="badge" className={`${chipCls} bg-blue-50 text-action-blue`}>{getReportDefinition(t)?.title || t}</span>)
            : <span data-ui-text="badge" className={`${chipCls} bg-cloud-mist text-midnight-indigo`}>Tất cả báo cáo</span>}
    </span>
);

const ReportTemplates = () => {
    const base = useAreaBase();
    const navigate = useNavigate();
    const [templates, setTemplates] = useState(null);
    const [error, setError] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        const res = await listTemplates();
        if (res?.success) {
            setTemplates(res.data);
            setError(null);
        } else {
            setTemplates([]);
            setError(res?.message || 'Không tải được danh sách mẫu');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

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

    const full = templatesFull(templates);
    const createNew = () => navigate(`${base}/report-templates/new`);

    return (
        <div data-page-surface="wide" className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Link to={`${base}/reports`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-blue hover:text-action-blue mb-2">
                        <ArrowLeft className="w-3.5 h-3.5" /> Trung tâm báo cáo
                    </Link>
                    <PageHeading badge="Báo cáo" icon={<LayoutTemplate className="w-6 h-6 text-action-blue" />} data-page-title className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        Mẫu báo cáo quy chuẩn
                    </PageHeading>
                    <p data-page-description className="text-xs text-slate-blue mt-1">
                        Bố cục theo thể thức Nghị định 30/2020: đầu văn bản, logo, thân báo cáo, khối ký, nơi nhận. Mẫu dùng khi xuất "bản quy chuẩn".
                    </p>
                </div>
                <button type="button" className={btnPrimary} onClick={createNew} disabled={full}
                    title={full ? 'Mọi loại báo cáo đều đã có mẫu — hãy sửa mẫu hiện có' : undefined}>
                    <Plus className="w-4 h-4" /> Tạo mẫu
                </button>
            </div>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full">
<colgroup>
<col style={{ width: '38%' }} />
<col style={{ width: '36%' }} />
<col style={{ width: '16%' }} />
<col style={{ width: '10%' }} />
</colgroup>
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Tên mẫu', 'Áp dụng cho', 'Cập nhật', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {!templates && <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-slate-blue">Đang tải dữ liệu...</td></tr>}
                            {templates?.length === 0 && !error && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-10 text-center text-xs text-slate-blue space-y-3">
                                        <p>Chưa có mẫu nào. Khi chưa có mẫu, người dùng chỉ xuất được bản thường.</p>
                                        <button data-ui-text="primary" type="button" className={btnPrimary} onClick={createNew}>Tạo mẫu từ bố cục chuẩn NĐ 30</button>
                                    </td>
                                </tr>
                            )}
                            {templates?.map((template) => (
                                <tr key={template.id} className="border-b border-pale-gray last:border-0">
                                    <td className={`${tdCls} !whitespace-normal align-middle`}>
                                        <Link to={`${base}/report-templates/${template.id}`} className="font-semibold text-midnight-indigo hover:text-action-blue hover:underline">{template.name}</Link>
                                    </td>
                                    <td className={`${tdCls} !whitespace-normal align-middle`}><AppliesTo types={template.reportTypes} /></td>
                                    <td className={`${tdCls} align-middle`}>
                                        {formatDateTime(template.updatedAt)}
                                        {template.updatedByName && <span data-ui-text="secondary" className="block text-[10px] text-slate-blue">{template.updatedByName}</span>}
                                    </td>
                                    <td className={`${tdCls} text-right`}>
                                        <span className="inline-flex items-center gap-1">
                                            <Link to={`${base}/report-templates/${template.id}`} className={iconBtn} aria-label={`Sửa ${template.name}`} title="Sửa"><Pencil className="w-4 h-4" /></Link>
                                            <button type="button" className={`${iconBtn} hover:text-red-600`} aria-label={`Xóa ${template.name}`} title="Xóa" disabled={busyId === template.id} onClick={() => setConfirm(template)}><Trash2 className="w-4 h-4" /></button>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </ResponsiveTable>
                </div>
            </div>

            <ConfirmDialog
                isOpen={Boolean(confirm)}
                message={`Xóa mẫu "${confirm?.name}"? Các file đã xuất theo mẫu này không bị ảnh hưởng.`}
                confirmLabel="Xóa"
                onConfirm={() => { const target = confirm; setConfirm(null); act(target.id, () => deleteTemplate(target.id), () => toast.success('Đã xóa mẫu')); }}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
};

export default ReportTemplates;
