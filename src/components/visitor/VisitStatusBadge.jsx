import { VISIT_STATUS_META } from './visitLabels';

const extraCls = 'px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap';

// visit (không bắt buộc): để hiện nhãn phụ "Bị thu hồi quyền" và "Giờ ra nhập tay".
const VisitStatusBadge = ({ status, overstay, visit }) => {
    const meta = VISIT_STATUS_META[status] || { label: status, cls: 'text-slate-blue bg-pale-gray' };
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            <span data-ui-text="badge" className={`px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
            {overstay && <span data-ui-text="badge" className={`${extraCls} text-white bg-red-600`}>Quá giờ</span>}
            {visit?.revokedAt && status === 'checked_out' && <span data-ui-text="badge" className={`${extraCls} text-red-700 bg-red-50`}>Bị thu hồi quyền</span>}
            {visit?.manualExit && <span data-ui-text="badge" className={`${extraCls} text-amber-700 bg-amber-50`}>Giờ ra nhập tay</span>}
        </span>
    );
};

export default VisitStatusBadge;
