import { RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const BUTTON_CLASS = 'inline-flex h-9 w-9 shrink-0 items-center justify-center text-slate-blue bg-cloud-mist/50 rounded-xl hover:bg-cloud-mist transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2';

const Button = ({ standard, busy = false, disabled, legacyClassName, legacyStyle, children, title, type, onClick, ...props }) => {
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);

    if (!standard) {
        return <button {...props} type={type} title={title} onClick={onClick} disabled={disabled} className={legacyClassName} style={legacyStyle}>{children}</button>;
    }

    const handleClick = async (event) => {
        if (inFlight.current || disabled || busy) return;
        inFlight.current = true;
        setPending(true);
        try {
            await onClick?.(event);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    const loading = busy || pending;
    const label = props['aria-label'] || title || 'Làm mới';
    return (
        <button
            {...props}
            type={type || 'button'}
            onClick={handleClick}
            title={title || 'Làm mới'}
            aria-label={label}
            aria-busy={loading || undefined}
            disabled={disabled || loading}
            className={BUTTON_CLASS}
        >
            <RefreshCw aria-hidden="true" className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
    );
};

const RoutedButton = (props) => {
    const { pathname } = useLocation();
    return <Button {...props} standard={STANDARD_AREAS.has(pathname.split('/')[1])} />;
};

// Shared screens retain their existing button markup for Teacher and Student.
// Callers supply the original presentation only when those roles share a screen.
const RefreshButton = (props) => {
    const inRouter = useInRouterContext();
    return inRouter ? <RoutedButton {...props} /> : <Button {...props} standard />;
};

export default RefreshButton;
