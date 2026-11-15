import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClassAttendanceDashboard from './ClassAttendanceDashboard';
import * as service from '../../service/classAttendanceService';

jest.mock('../../service/classAttendanceService', () => ({
    ...jest.requireActual('../../service/classAttendanceService'),
    fetchClassAttendanceClasses: jest.fn(),
    fetchClassSessions: jest.fn(),
    fetchClassAttendanceRows: jest.fn().mockResolvedValue([]),
    fetchClassAttendanceEvents: jest.fn().mockResolvedValue([]),
    fetchClassAttendanceSettings: jest.fn().mockResolvedValue({}),
}));

beforeEach(() => {
    service.fetchClassSessions.mockResolvedValue([]);
    service.fetchClassAttendanceRows.mockResolvedValue([]);
    service.fetchClassAttendanceEvents.mockResolvedValue([]);
    service.fetchClassAttendanceSettings.mockResolvedValue({});
});

test('an empty API response leaves the class list empty instead of showing demo classes', async () => {
    service.fetchClassAttendanceClasses.mockResolvedValue([]);
    render(<MemoryRouter><ClassAttendanceDashboard /></MemoryRouter>);
    await waitFor(() => expect(service.fetchClassAttendanceClasses).toHaveBeenCalled());
    expect(screen.queryByText('Lập trình Web')).not.toBeInTheDocument();
    expect(screen.queryByText('Trí tuệ nhân tạo ứng dụng')).not.toBeInTheDocument();
});

test('keeps the requested real class and exposes the actual semester from UEL', async () => {
    service.fetchClassSessions.mockResolvedValue([{ id: 'session-real', date: new Date().toLocaleDateString('en-CA'), classId: 'real-class', startTime: '09:00', endTime: '11:00', room: 'A101' }]);
    service.fetchClassAttendanceClasses.mockResolvedValue([{
        id: 'real-class', code: 'UEL-01', subjectCode: 'UEL', subject: 'Môn đồng bộ UEL',
        semester: 'Học kỳ 1 năm học 2026-2027', schedule: '09:00 - 11:00',
        administrativeClasses: ['UEL-CLASS'], room: 'A101',
    }]);
    render(<MemoryRouter initialEntries={['/?classId=real-class']}><ClassAttendanceDashboard /></MemoryRouter>);
    await waitFor(() => expect(service.fetchClassAttendanceRows).toHaveBeenCalledWith('real-class', expect.any(String)));
    expect(await screen.findByText('Học kỳ 1 năm học 2026-2027')).toBeInTheDocument();
    expect((await screen.findAllByText(/09:00.*11:00/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A101/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Lập trình Web')).not.toBeInTheDocument();
});
