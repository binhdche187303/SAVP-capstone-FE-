import { useInRouterContext, useLocation } from 'react-router-dom';
import FilterDateInput from './FilterDateInput';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Input = ({ standard, ...props }) => standard
    ? <FilterDateInput id={props.id} inputElement={<input {...props} />} />
    : <input {...props} />;
const RoutedInput = props => {
    const { pathname } = useLocation();
    return <Input {...props} standard={AREAS.has(pathname.split('/')[1])} />;
};

// Form fields use the same calendar and local ISO value contract as filters.
export default function DateInput(props) {
    const routed = useInRouterContext();
    return routed ? <RoutedInput {...props} /> : <Input {...props} standard />;
}
