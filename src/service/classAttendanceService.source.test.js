import { get } from '../utils/request';
import { fetchClassAttendanceClasses, fetchTeacherClassAttendanceReport } from './classAttendanceService';
jest.mock('../utils/request', () => ({ ...jest.requireActual('../utils/request'), get: jest.fn() }));
beforeEach(() => get.mockReset().mockResolvedValue({ success: true, data: [] }));
test('all class selectors request synchronized classes by default', async () => {
    expect(await fetchClassAttendanceClasses()).toEqual([]);
    expect(get).toHaveBeenCalledWith('/class-attendance/classes?source=uel_api', { skipToast: true });
});
test('attendance reports request the same synchronized source', async () => {
    await fetchTeacherClassAttendanceReport({ anchorDate: '2026-11-14' });
    expect(get.mock.calls[0][0]).toContain('source=uel_api');
});
