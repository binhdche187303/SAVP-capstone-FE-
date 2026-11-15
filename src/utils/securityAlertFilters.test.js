import { buildSecurityAlertQuery } from './securityAlertFilters';

test('date ranges include the entire day in Vietnam time', () => {
    expect(buildSecurityAlertQuery({ from: '2026-11-14', to: '2026-11-14', severity: 'high', page: 2 })).toEqual({
        from: '2026-11-14T00:00:00+07:00', to: '2026-11-14T23:59:59.999+07:00', severity: 'high', page: 2,
    });
});
test('empty and one-sided date criteria remain independent', () => {
    expect(buildSecurityAlertQuery({ from: '', to: '', page: 1 })).toEqual({ page: 1 });
    expect(buildSecurityAlertQuery({ from: '', to: '2026-11-14' })).toEqual({ to: '2026-11-14T23:59:59.999+07:00' });
    expect(buildSecurityAlertQuery({ from: '2026-11-14', to: '' })).toEqual({ from: '2026-11-14T00:00:00+07:00' });
});
