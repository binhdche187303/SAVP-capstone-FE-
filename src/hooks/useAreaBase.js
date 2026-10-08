import { useLocation } from 'react-router-dom';

// '/business-admin/reports/visitor' → '/business-admin'
const useAreaBase = () => `/${useLocation().pathname.split('/')[1]}`;

export default useAreaBase;
