const VISITOR_CHANGED_EVENT = 'savp:visitor-alert-changed';

export const emitVisitorAlertChanged = (detail = {}) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(VISITOR_CHANGED_EVENT, { detail }));
    }
};

export const subscribeToVisitorAlertChanges = (handler) => {
    if (typeof window === 'undefined') return () => {};
    const listener = (event) => handler(event.detail);
    window.addEventListener(VISITOR_CHANGED_EVENT, listener);
    return () => window.removeEventListener(VISITOR_CHANGED_EVENT, listener);
};
