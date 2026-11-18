import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import './RefreshButton.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const BUTTON_CLASS = 'inline-flex h-9 w-9 shrink-0 items-center justify-center text-slate-blue bg-cloud-mist/50 rounded-xl hover:bg-cloud-mist transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2';

const Button = ({ standard, inline = false, before, showTime = true, busy = false, disabled, legacyClassName, legacyStyle, children, title, type, onClick, ...props }) => {
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);
    const [lastRefresh, setLastRefresh] = useState(() => busy ? null : new Date());
    const previousBusy = useRef(busy);

    useEffect(() => {
        if (standard && previousBusy.current && !busy) setLastRefresh(new Date());
        previousBusy.current = busy;
    }, [busy, standard]);

    if (!standard) {
        const plain = <button {...props} type={type} title={title} onClick={onClick} disabled={disabled} className={legacyClassName} style={legacyStyle}>{children}</button>;
        return before ? <span className="camai-refresh-row">{before}{plain}</span> : plain;
    }

    const handleClick = async (event) => {
        if (inFlight.current || disabled || busy) return;
        inFlight.current = true;
        setPending(true);
        try {
            const result = await onClick?.(event);
            if (result !== false && result?.success !== false) setLastRefresh(new Date());
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    const loading = busy || pending;
    const label = props['aria-label'] || title || 'Làm mới';
    const renderButton = () => (
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
    return (
        <span className={`camai-refresh-control${inline ? ' camai-refresh-control--inline' : ''}`}>
            {before ? <span className="camai-refresh-row">{before}{renderButton()}</span> : renderButton()}
            {showTime && <span className="camai-refresh-time" aria-live="polite">
                Lần cuối làm mới lúc:{' '}
                {lastRefresh ? <time dateTime={lastRefresh.toISOString()}>{lastRefresh.toLocaleTimeString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                })}</time> : '—'}
            </span>}
        </span>
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
