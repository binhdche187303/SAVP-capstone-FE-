import { render, screen } from '@testing-library/react';
import WeeklySessionSchedule from './WeeklySessionSchedule';
import { fetchClassSessions } from '../../service/classAttendanceService';

jest.mock('../../service/classAttendanceService', () => ({ fetchClassSessions: jest.fn() }));

const session = (id, subject, startTime, endTime, date = '2026-12-17') => ({
    id, subject, subjectCode: `M${id}`, classCode: `L${id}`, room: 'A.801 - Cơ sở chính', studentCount: 11,
    date, startTime, endTime, status: 'scheduled',
});

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 11, 17, 9, 30)); // Thứ 5 17/12/2026, 09:30
    fetchClassSessions.mockResolvedValue([
        session(1, 'Luật lao động', '07:00', '11:00'),
        session(2, 'Pháp luật về tài sản', '13:20', '17:25'),
        session(3, 'Buổi sáng sớm', '07:00', '09:30', '2026-12-16'), // hôm qua
    ]);
});
afterEach(() => jest.useRealTimers());

test('tô nổi buổi đang diễn ra, buổi đã qua có nhãn Đã xong', async () => {
    render(<WeeklySessionSchedule variant="teacher" badge="Lịch dạy" title="Lịch dạy của tôi" subtitle="" />);
    const current = await screen.findByTitle(/Luật lao động/);
    expect(current).toHaveAttribute('aria-current', 'time');
    expect(current).toHaveTextContent('Đang dạy');
    const later = screen.getByTitle(/Pháp luật về tài sản/);
    expect(later).not.toHaveAttribute('aria-current');
    expect(later).not.toHaveTextContent('Đã xong');
    expect(screen.getByTitle(/Buổi sáng sớm/)).toHaveTextContent('Đã xong');
});

test('buổi chiều ghi đúng tiết theo giờ thật (Tiết 8–11.5)', async () => {
    fetchClassSessions.mockResolvedValue([
        { ...session(4, 'Luật hiến pháp', '13:20', '17:25'), periodStart: 8, periodCount: 5 },
    ]);
    render(<WeeklySessionSchedule variant="teacher" badge="Lịch dạy" title="Lịch dạy của tôi" subtitle="" />);
    expect(await screen.findByText('Tiết 8–11.5 · 13:20–17:25')).toBeInTheDocument();
    expect(screen.getByText('Luật hiến pháp')).toBeInTheDocument();
});

test('tiết kết thúc tính theo giờ thật, có nửa tiết như app UEL', async () => {
    fetchClassSessions.mockResolvedValue([
        { ...session(5, 'Phương pháp NCKH pháp lý', '07:00', '11:00'), periodStart: 1, periodCount: 5 },
        { ...session(6, 'Luật hiến pháp', '17:45', '21:05'), periodStart: 13, periodCount: 4 },
    ]);
    render(<WeeklySessionSchedule variant="teacher" badge="Lịch dạy" title="Lịch dạy của tôi" subtitle="" />);
    expect(await screen.findByText('Tiết 1–4.5 · 07:00–11:00')).toBeInTheDocument();
    expect(screen.getByText('Tiết 13–16 · 17:45–21:05')).toBeInTheDocument();
});
