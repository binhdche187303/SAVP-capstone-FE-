import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, LayoutTemplate, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { getReportDefinition } from '../../../config/reportDefinitions';
import { listTemplates, duplicateTemplate, deleteTemplate } from '../../../service/reportTemplateService';
import { formatDateTime } from '../../../utils/reportFormat';
import toast from '../../../utils/toast';
import useAreaBase from '../../../hooks/useAreaBase';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { SIGNATURE_MODE_LABELS } from '../../../components/report/template/layoutModel';
import { pageCls, cardCls, btnPrimary, thCls, tdCls, errorBoxCls } from '../../../components/common/uiClasses';

// Danh sách mẫu báo cáo quy chuẩn (NĐ 30/2020). Mẫu "dùng chung" áp cho mọi loại báo cáo;
// mẫu riêng chỉ hiện khi xuất đúng loại đó.
const iconBtn = 'p-1.5 rounded-lg text-slate-blue hover:bg-cloud-mist hover:text-action-blue disabled:opacity-40';

const signatureSummary = (layout) => {
    const slots = layout.signatures.filter((s) => s.mode !== 'hidden');
    if (!slots.length) return 'Không in khối ký';
    return slots.map((s) => `${s.title} (${SIGNATURE_MODE_LABELS[s.mode].toLowerCase()})`).join(' · ');
};

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

    const createNew = () => navigate(`${base}/report-templates/new`);

    return (
        <div className={pageCls}>
            <div className="border-b border-platinum-tint pb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link to={`${base}/reports`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-blue hover:text-action-blue mb-2">
                        <ArrowLeft className="w-3.5 h-3.5" /> Trung tâm báo cáo
                    </Link>
                    <h2 className="text-xl font-bold text-midnight-indigo flex items-center gap-2.5">
                        <LayoutTemplate className="w-6 h-6 text-action-blue" />
                        Mẫu báo cáo quy chuẩn
                    </h2>
                    <p className="text-xs text-slate-blue mt-1">
                        Bố cục theo thể thức Nghị định 30/2020: đầu văn bản, logo, thân báo cáo, khối ký, nơi nhận. Mẫu dùng khi xuất "bản quy chuẩn".
                    </p>
                </div>
                <button type="button" className={btnPrimary} onClick={createNew}>
                    <Plus className="w-4 h-4" /> Tạo mẫu
                </button>
            </div>

            {error && <div className={errorBoxCls}>{error}</div>}

            <div className={`${cardCls} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                {['Tên mẫu', 'Áp dụng cho', 'Khối ký', 'Cập nhật', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {!templates && <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-blue">Đang tải dữ liệu…</td></tr>}
                            {templates?.length === 0 && !error && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-blue space-y-3">
                                        <p>Chưa có mẫu nào. Khi chưa có mẫu, người dùng chỉ xuất được bản thường.</p>
                                        <button type="button" className={btnPrimary} onClick={createNew}>Tạo mẫu từ bố cục chuẩn NĐ 30</button>
                                    </td>
                                </tr>
                            )}
                            {templates?.map((template) => (
                                <tr key={template.id} className="border-b border-pale-gray last:border-0">
                                    <td className={`${tdCls} font-semibold`}>
                                        <Link to={`${base}/report-templates/${template.id}`} className="hover:text-action-blue hover:underline">{template.name}</Link>
                                        {template.isDefault && (
                                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold align-middle">
                                                <Star className="w-3 h-3" /> Mặc định
                                            </span>
                                        )}
                                    </td>
                                    <td className={tdCls}>{template.reportType ? getReportDefinition(template.reportType)?.title || template.reportType : 'Tất cả báo cáo'}</td>
                                    <td className={`${tdCls} !whitespace-normal text-slate-blue`}>{signatureSummary(template.layout)}</td>
                                    <td className={tdCls}>
                                        {formatDateTime(template.updatedAt)}
                                        {template.updatedByName && <span className="block text-[10px] text-slate-blue">{template.updatedByName}</span>}
                                    </td>
                                    <td className={`${tdCls} text-right`}>
                                        <span className="inline-flex items-center gap-1">
                                            <Link to={`${base}/report-templates/${template.id}`} className={iconBtn} aria-label={`Sửa ${template.name}`} title="Sửa"><Pencil className="w-4 h-4" /></Link>
                                            <button type="button" className={iconBtn} aria-label={`Nhân bản ${template.name}`} title="Nhân bản" disabled={busyId === template.id} onClick={() => act(template.id, () => duplicateTemplate(template.id), () => toast.success('Đã nhân bản mẫu'))}><Copy className="w-4 h-4" /></button>
                                            <button type="button" className={`${iconBtn} hover:text-red-600`} aria-label={`Xóa ${template.name}`} title="Xóa" onClick={() => setConfirm(template)}><Trash2 className="w-4 h-4" /></button>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
