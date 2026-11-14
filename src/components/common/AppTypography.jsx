import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './AppTypography.css';
import './PageLayout.css';

const STANDARD_AREAS = new Set(['system-admin', 'business-admin', 'manager', 'employee', 'guard']);

// A route-level scope also reaches dialogs rendered through portals.
const AppTypography = () => {
    const { pathname } = useLocation();
    const enabled = STANDARD_AREAS.has(pathname.split('/')[1]);
    useLayoutEffect(() => {
        if (enabled) document.body.setAttribute('data-standard-typography', 'true');
        else document.body.removeAttribute('data-standard-typography');
        return () => document.body.removeAttribute('data-standard-typography');
    }, [enabled]);
    return null;
};

export default AppTypography;
