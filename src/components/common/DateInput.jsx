import { useInRouterContext, useLocation } from 'react-router-dom';
import FilterDateInput from './FilterDateInput';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Input = ({ standard, ...props }) => standard
    ? <FilterDateInput id={props.id} inputElement={<input {...props} />} />
    : <input {...props} />;
const RoutedInput = ({ forceStandard = false, ...props }) => {
    const { pathname } = useLocation();
    return <Input {...props} standard={forceStandard || AREAS.has(pathname.split('/')[1])} />;
};

// Form fields use the same calendar and local ISO value contract as filters.
export default function DateInput({ forceStandard = false, ...props }) {
    const routed = useInRouterContext();
    return routed ? <RoutedInput {...props} forceStandard={forceStandard} /> : <Input {...props} standard />;
}
