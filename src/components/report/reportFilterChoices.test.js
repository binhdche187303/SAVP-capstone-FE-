import { changeReportFilters, reportFilterChoices } from './reportFilterChoices';

const definition = { type: 'student-attendance' };
const lookups = {
    subjects: [{ id: 'subject-a', name: 'Môn A' }, { id: 'subject-b', name: 'Môn B' }],
    classSections: [
        { id: 'section-a1', name: 'Lớp A1', semesterId: 'semester-1', subjectId: 'subject-a' },
        { id: 'section-b1', name: 'Lớp B1', semesterId: 'semester-1', subjectId: 'subject-b' },
        { id: 'section-a2', name: 'Lớp A2', semesterId: 'semester-2', subjectId: 'subject-a' },
    ],
};
test('shows subjects and sections from the selected semester and subject', () => {
    expect(reportFilterChoices(definition, { lookup: 'subjects' }, lookups, { semesterId: 'semester-2' }).map(x => x.value)).toEqual(['subject-a']);
    expect(reportFilterChoices(definition, { lookup: 'classSections' }, lookups, { semesterId: 'semester-1', subjectId: 'subject-b' }).map(x => x.value)).toEqual(['section-b1']);
});
test('changing semester or subject clears dependent selections for preview and schedules', () => {
    const selected = { semesterId: 'semester-1', subjectId: 'subject-a', classSectionId: 'section-a1', q: 'Sinh viên' };
    expect(changeReportFilters(definition, selected, { semesterId: 'semester-2' })).toEqual({ semesterId: 'semester-2', subjectId: '', classSectionId: '', q: 'Sinh viên' });
    expect(changeReportFilters(definition, selected, { subjectId: 'subject-b' }).classSectionId).toBe('');
});
test('does not manufacture choices when synchronization has not returned classes', () => {
    expect(reportFilterChoices(definition, { lookup: 'subjects' }, {}, {})).toEqual([]);
    expect(reportFilterChoices(definition, { lookup: 'classSections' }, { classSections: [] }, {})).toEqual([]);
});
test('does not apply academic dependencies to other report types', () => {
    const other = { type: 'staff-attendance' };
    expect(reportFilterChoices(other, { lookup: 'subjects' }, lookups, { semesterId: 'semester-2' })).toHaveLength(2);
    expect(changeReportFilters(other, { subjectId: 'keep' }, { semesterId: 'new' }).subjectId).toBe('keep');
});
