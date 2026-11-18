import { cloneElement } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import './PageHeading.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

const Heading = ({ standard, as: Tag = 'h1', icon, badge, children, className = '', ...props }) => {
    if (!standard) return <Tag {...props} className={className}>{icon}{children}</Tag>;
    return (
        <div className="camai-page-heading" data-page-heading>
            <span className="camai-page-heading-badge">
                {icon && cloneElement(icon, { 'aria-hidden': true, focusable: false })}
                {badge}
            </span>
            <Tag {...props} data-page-title className={className}>{children}</Tag>
        </div>
    );
};
const RoutedHeading = props => {
    const { pathname } = useLocation();
    return <Heading {...props} standard={STANDARD_AREAS.has(pathname.split('/')[1])} />;
};

export default function PageHeading(props) {
    return useInRouterContext() ? <RoutedHeading {...props} /> : <Heading {...props} standard />;
}
