import { Children, cloneElement, createContext, isValidElement, useContext, useId } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import FilterDateInput, { calendarProps } from './FilterDateInput';
import DateInput from './DateInput';
import './FilterBar.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const StandardFilters = createContext(false);

const isSearchField = child => isValidElement(child) && (
    child.props['data-filter-search'] !== undefined ||
    (child.type === FilterField && /^Tìm\s/.test(child.props.label || ''))
);

// Reorder actual elements so visual order and keyboard navigation agree.
// Explicit markers keep lookup forms and date-only filters in their intended order.
const standardDates = children => Children.map(children, child => {
    if (!isValidElement(child)) return child;
    if (child.type === 'input' && ['date', 'datetime-local'].includes(child.props.type)) {
        return <FilterDateInput {...child.props} inputElement={child} />;
    }
    if (typeof child.props.onChange === 'function' && ('selected' in child.props || 'selectsRange' in child.props)) {
        return cloneElement(child, {
            ...calendarProps,
            calendarClassName: `${child.props.calendarClassName || ''} ${calendarProps.calendarClassName}`,
            popperClassName: `${child.props.popperClassName || ''} ${calendarProps.popperClassName}`,
        });
    }
    return child.props.children ? cloneElement(child, {}, standardDates(child.props.children)) : child;
})?.sort((a, b) => Number(isSearchField(b)) - Number(isSearchField(a)));

const Bar = ({ standard, as: Tag = 'div', variant = 'card', className = '', children, ...props }) => (
    <StandardFilters.Provider value={standard}>
        <Tag {...props} className={standard ? `${className} camai-filter-bar` : className} data-filter-bar={standard ? variant : undefined}>
            {standard ? standardDates(children) : children}
        </Tag>
    </StandardFilters.Provider>
);

const RoutedBar = ({ forceStandard = false, ...props }) => {
    const { pathname } = useLocation();
    return <Bar {...props} standard={forceStandard || STANDARD_AREAS.has(pathname.split('/')[1])} />;
};

// Mark filter controls explicitly; forms for creating/editing data are unaffected.
const FilterBar = ({ forceStandard = false, ...props }) => {
    const inRouter = useInRouterContext();
    return inRouter ? <RoutedBar {...props} forceStandard={forceStandard} /> : <Bar {...props} standard />;
};

const findControl = (children) => {
    let result = null;
    Children.forEach(children, child => {
        if (result || !isValidElement(child)) return;
        const dateControl = typeof child.props.onChange === 'function' && ('selected' in child.props || 'selectsRange' in child.props);
        result = child.type === 'input' || child.type === 'select' || child.type === FilterDateInput || child.type === DateInput || dateControl ? child : findControl(child.props.children);
    });
    return result;
};

const identifyControl = (children, target, id) => Children.map(children, child => {
    if (!isValidElement(child)) return child;
    if (child === target) return cloneElement(child, { id });
    return child.props.children ? cloneElement(child, {}, identifyControl(child.props.children, target, id)) : child;
});

// A missing field label is added only in the five standardized role areas.
export const FilterField = ({ label, children, className = '' }) => {
    const standard = useContext(StandardFilters);
    const generatedId = useId();
    if (!standard) return children;
    const control = findControl(children);
    const id = control?.props.id || `filter-${generatedId}`;
    return (
        <div className={`camai-filter-field ${className}`}>
            <label htmlFor={id}>{label}</label>
            {identifyControl(children, control, id)}
        </div>
    );
};

export default FilterBar;
