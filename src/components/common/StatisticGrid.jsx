import { useInRouterContext, useLocation } from 'react-router-dom';
import './StatisticGrid.css';

const AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);
const Grid = ({ standard, columns = 4, className = '', children, ...props }) => standard ? (
    <div className={`${className} camai-stat-container`} data-stat-container>
        <div {...props} className="camai-stat-grid" data-stat-columns={columns}>{children}</div>
    </div>
) : <div {...props} className={className}>{children}</div>;
const Routed = props => {
    const { pathname } = useLocation();
    return <Grid {...props} standard={AREAS.has(pathname.split('/')[1])} />;
};
const StatisticGrid = props => useInRouterContext() ? <Routed {...props} /> : <Grid {...props} standard />;
export default StatisticGrid;
