import { useInRouterContext, useLocation } from 'react-router-dom';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Columns = ({ widths }) => <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>;
const RoutedColumns = props => {
    const { pathname } = useLocation();
    return AREAS.has(pathname.split('/')[1]) ? <Columns {...props} /> : null;
};

// Shared meeting screens keep the existing Teacher/Student column layout.
export default function TableColumns(props) {
    const routed = useInRouterContext();
    return routed ? <RoutedColumns {...props} /> : <Columns {...props} />;
}
