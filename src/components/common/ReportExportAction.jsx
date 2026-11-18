import { useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import ReportExportButton from './ReportExportButton';
import ExportModeDialog from '../report/ExportModeDialog';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Action = ({ standard, format = 'xlsx', filterSummary = [], initialRange, onClick, ...props }) => {
    const [open, setOpen] = useState(false);
    if (!standard) return <ReportExportButton {...props} onClick={onClick} />;
    return <>
        <ReportExportButton {...props} forceStandard aria-haspopup="dialog" onClick={() => setOpen(true)} />
        <ExportModeDialog isOpen={open} title="Xuất báo cáo" formats={[format]} allowStandard={false}
            initialRange={initialRange} filterSummary={filterSummary}
            onClose={() => setOpen(false)} onConfirm={async () => {
                const result = await onClick();
                if (result?.success !== false) setOpen(false);
                return result;
            }} />
    </>;
};
const Routed = ({ forceStandard = false, ...props }) => {
    const { pathname } = useLocation();
    return <Action {...props} standard={forceStandard || AREAS.has(pathname.split('/')[1])} />;
};
const ReportExportAction = ({ forceStandard = false, ...props }) => {
    const routed = useInRouterContext();
    return routed ? <Routed {...props} forceStandard={forceStandard} /> : <Action {...props} standard />;
};
export default ReportExportAction;
