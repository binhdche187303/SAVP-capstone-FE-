export const changeReportFilters = (definition, value, patch) => {
    const next = { ...value, ...patch };
    if (definition.type === 'student-attendance') {
        if ('semesterId' in patch) { next.subjectId = ''; next.classSectionId = ''; }
        else if ('subjectId' in patch) next.classSectionId = '';
    }
    return next;
};

export const reportFilterChoices = (definition, filter, lookups, value) => {
    if (filter.options) return filter.options.map(item => ({ value: item.value, label: item.label }));
    let items = lookups[filter.lookup] || [];
    if (definition.type === 'student-attendance') {
        const sections = lookups.classSections || [];
        if (filter.lookup === 'classSections') {
            items = items.filter(item => (!value.semesterId || item.semesterId === value.semesterId) && (!value.subjectId || item.subjectId === value.subjectId));
        }
        if (filter.lookup === 'subjects' && value.semesterId) {
            const subjectIds = new Set(sections.filter(item => item.semesterId === value.semesterId).map(item => item.subjectId));
            items = items.filter(item => subjectIds.has(item.id));
        }
    }
    return items.map(item => ({ value: item.id, label: item.name }));
};
