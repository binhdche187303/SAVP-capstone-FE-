import { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { calendarProps } from './FilterDateInput';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Picker = ({ standard, pickerRef, ...props }) => <DatePicker
    {...props}
    {...(standard ? {
        ...calendarProps,
        calendarClassName: `${props.calendarClassName || ''} ${calendarProps.calendarClassName}`,
        popperClassName: `${props.popperClassName || ''} ${calendarProps.popperClassName}`,
    } : {})}
    ref={pickerRef}
/>;
const RoutedPicker = props => {
    const { pathname } = useLocation();
    return <Picker {...props} standard={AREAS.has(pathname.split('/')[1])} />;
};

// Preserve range selection, constraints and Date callbacks in existing meeting forms.
export default forwardRef(function AppDatePicker(props, ref) {
    const routed = useInRouterContext();
    return routed ? <RoutedPicker {...props} pickerRef={ref} /> : <Picker {...props} pickerRef={ref} standard />;
});
