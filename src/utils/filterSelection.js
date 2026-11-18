// Empty selection means all values. A single value remains scalar for existing APIs.
export const filterValues = value => (Array.isArray(value) ? value : [value])
    .filter(item => item !== '' && item !== null && item !== undefined && item !== 'all' && item !== 'ALL');

export const filterValue = values => {
    const selected = [...new Set(filterValues(values))];
    return selected.length > 1 ? selected : selected[0] ?? '';
};

export const matchesFilter = (selection, actual) => {
    const selected = filterValues(selection);
    const values = Array.isArray(actual) ? actual : [actual];
    return !selected.length || values.some(value => selected.some(item => String(item) === String(value)));
};

export const selectionLabel = (selection, options = []) => filterValues(selection)
    .map(value => options.find(option => String(option.value ?? option.id) === String(value))?.label ?? options.find(option => String(option.id) === String(value))?.name ?? value)
    .join(', ');
