// Date-only filters cover the full local day, including the final millisecond.
export const buildSecurityAlertQuery = ({ from, to, ...filters }) => ({
    ...filters,
    ...(from && { from: from.includes('T') ? from : `${from}T00:00:00+07:00` }),
    ...(to && { to: to.includes('T') ? to : `${to}T23:59:59.999+07:00` }),
});
