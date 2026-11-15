import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import { Children } from 'react';
import './StatisticCard.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const Card = ({ label, value, helper, icon: Icon, tone = 'default', iconClassName = '', valueClassName = '', valueProps, loading = false, selected, onClick, to, title, compactValue = false, extraPosition = 'body', children, ...props }) => {
    const interactive = !!(onClick || to);
    const hasExtras = Children.toArray(children).some(child => typeof child !== 'string' || child.trim());
    const Tag = to ? Link : onClick ? 'button' : 'div';
    return (
        <Tag {...props}
            {...(to ? { to } : onClick ? { type: 'button', onClick, 'aria-pressed': selected } : { role: 'group', 'aria-label': typeof label === 'string' ? label : undefined })}
            data-stat-card="standard"
            data-tone={tone}
            data-selected={selected || undefined}
            data-extra-position={hasExtras ? extraPosition : undefined}
            className={`camai-stat-card${interactive ? ' camai-stat-card-interactive' : ''}`}
            title={title}
            aria-busy={loading || undefined}
        >
            <div className="camai-stat-heading">
                <span className="camai-stat-label">{label}</span>
                {Icon && <Icon className={`camai-stat-icon ${iconClassName}`} aria-hidden="true" />}
            </div>
            {loading ? <div className="camai-stat-skeleton animate-pulse" aria-label="Đang tải" />
                : <div {...valueProps} className={`camai-stat-value ${compactValue ? 'camai-stat-value-text' : ''} ${valueClassName}`}>{value ?? '—'}</div>}
            {helper && <div className="camai-stat-helper">{helper}</div>}
            {hasExtras && <div className="camai-stat-extra" data-position={extraPosition}>{children}</div>}
        </Tag>
    );
};

const RoutedCard = ({ legacy, ...props }) => {
    const { pathname } = useLocation();
    return STANDARD_AREAS.has(pathname.split('/')[1]) ? <Card {...props} /> : (legacy || <Card {...props} />);
};

// Shared screens retain their existing Teacher/Student cards through `legacy`.
const StatisticCard = ({ legacy, ...props }) => useInRouterContext()
    ? <RoutedCard {...props} legacy={legacy} /> : <Card {...props} />;

export default StatisticCard;

export const statisticTone = (classes = '') => /(?:red|rose)-/.test(classes) ? 'danger'
    : /(?:amber|yellow|orange)-/.test(classes) ? 'warning'
        : /(?:green|emerald)-/.test(classes) ? 'success' : 'default';
