import { ChevronDown, Download, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import './ReportExportButton.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const Button = ({ standard, label = 'Xuất báo cáo', busy = false, disabled, menu = false,
    fullWidth = false, alignEnd = false, legacyClassName, legacyStyle, children, type, onClick, ...props }) => {
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);
    if (!standard) {
        return <button {...props} type={type} onClick={onClick} disabled={disabled} className={legacyClassName} style={legacyStyle}>{children}</button>;
    }
    const loading = busy || pending;
    const handleClick = async event => {
        if (inFlight.current || busy || disabled) return;
        inFlight.current = true;
        setPending(true);
        try {
            await onClick(event);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    return (
        <button {...props} type={type || 'button'} onClick={onClick ? handleClick : undefined}
            disabled={disabled || loading} aria-busy={loading || undefined}
            data-report-export className={`camai-report-export-button${fullWidth ? ' camai-report-export-full' : ''}${alignEnd ? ' camai-report-export-end' : ''}`}>
            {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
            <span>{loading ? 'Đang xuất…' : label}</span>
            {menu && <ChevronDown aria-hidden="true" />}
        </button>
    );
};

const RoutedButton = props => {
    const { pathname } = useLocation();
    return <Button {...props} standard={STANDARD_AREAS.has(pathname.split('/')[1])} />;
};

const ReportExportButton = props => {
    const inRouter = useInRouterContext();
    return inRouter ? <RoutedButton {...props} /> : <Button {...props} standard />;
};

export default ReportExportButton;
