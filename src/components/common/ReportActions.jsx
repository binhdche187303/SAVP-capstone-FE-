import './ReportActions.css';

// Keep the export action and its refresh action together when a header wraps.
const ReportActions = ({ children, className = '' }) => (
    <div data-report-actions className={`camai-report-actions ${className}`}>{children}</div>
);

export default ReportActions;
