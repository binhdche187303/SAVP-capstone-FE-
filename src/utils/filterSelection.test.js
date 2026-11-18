import { filterValue, matchesFilter } from './filterSelection';
import { buildQuery } from './request';

test('combines OR selections within each field using AND across different fields', () => {
    const rows = [{ status: 'new', severity: 'high' }, { status: 'resolved', severity: 'high' }, { status: 'acknowledged', severity: 'high' }, { status: 'new', severity: 'low' }];
    expect(rows.filter(row => matchesFilter(['new', 'resolved'], row.status) && matchesFilter(['high', 'medium'], row.severity))).toEqual(rows.slice(0, 2));
    expect(filterValue([])).toBe('');
    expect(filterValue(['new'])).toBe('new');
});
test('serializes multiple selections without converting them into a comma-separated single value', () => {
    const query = new URLSearchParams(buildQuery({ status: ['new', 'resolved'], severity: ['high', 'medium'], page: 2 }));
    expect(query.getAll('status')).toEqual(['new', 'resolved']);
    expect(query.getAll('severity')).toEqual(['high', 'medium']);
    expect(query.get('page')).toBe('2');
});
