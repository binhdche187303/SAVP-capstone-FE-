import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClassAttendanceAnalytics from './ClassAttendanceAnalytics';
import { fetchClassAttendanceClasses, fetchTeacherClassAttendanceReport } from '../../service/classAttendanceService';

jest.mock('../../service/classAttendanceService', () => ({
    fetchClassAttendanceClasses: jest.fn(), fetchTeacherClassAttendanceReport: jest.fn(), exportSemesterClassAttendanceCsv: jest.fn(),
}));
jest.mock('recharts', () => {
    const Wrap = ({ children }) => <div>{children}</div>;
    return { ResponsiveContainer: Wrap, BarChart: Wrap, PieChart: Wrap, Pie: () => null, Bar: () => null,
        CartesianGrid: () => null, Cell: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null };
});

const rows = [
    { id: 'a', subjectCode: 'AI', subject: 'Trí tuệ nhân tạo', totalSessions: 3, attended: 2, onTime: 2, late: 0, absent: 1, rate: 67 },
    { id: 'b', subjectCode: 'DB', subject: 'Cơ sở dữ liệu', totalSessions: 2, attended: 2, onTime: 0, late: 2, absent: 0, rate: 100 },
    { id: 'c', subjectCode: 'WEB', subject: 'Lập trình web', totalSessions: 2, attended: 0, onTime: 0, late: 0, absent: 2, rate: 0 },
    { id: 'd', subjectCode: 'NET', subject: 'Mạng máy tính', totalSessions: 0, attended: 0, onTime: 0, late: 0, absent: 0, rate: 0 },
].map(row => ({ ...row, administrativeClass: 'Lớp A', administrativeClasses: ['Lớp A'], room: 'A101', semester: '2026-1' }));

beforeEach(() => {
    jest.clearAllMocks();
    fetchClassAttendanceClasses.mockResolvedValue(rows);
    fetchTeacherClassAttendanceReport.mockImplementation(async ({ subjectCode }) => {
        const selected = subjectCode === 'all' ? rows : rows.filter(row => row.subjectCode === subjectCode);
        return { rows: selected, period: { start: '2026-11-01', end: '2026-11-30' }, totals: {
            ...Object.fromEntries(['totalSessions', 'attended', 'onTime', 'late', 'absent'].map(key => [key, selected.reduce((sum, row) => sum + row[key], 0)])), rate: 57,
        } };
    });
});

const expectSubjects = names => {
    const table = within(screen.getByRole('table'));
    for (const row of rows) {
        if (names.includes(row.subject)) expect(table.getByText(row.subject, { exact: true })).toBeInTheDocument();
        else expect(table.queryByText(row.subject, { exact: true })).not.toBeInTheDocument();
    }
};

test.each(['business-admin', 'teacher'])('%s lọc được bằng cả năm thẻ và khôi phục toàn bộ', async area => {
    render(<MemoryRouter initialEntries={[`/${area}/class-attendance`]}><ClassAttendanceAnalytics mode={area === 'teacher' ? 'teacher' : 'admin'} /></MemoryRouter>);
    await screen.findByText('Trí tuệ nhân tạo', { exact: true });
    const cases = [
        ['Đúng giờ', ['Trí tuệ nhân tạo']], ['Đi muộn', ['Cơ sở dữ liệu']],
        ['Vắng', ['Trí tuệ nhân tạo', 'Lập trình web']], ['Đã điểm danh', ['Trí tuệ nhân tạo', 'Cơ sở dữ liệu']],
        ['Tổng buổi học', rows.map(row => row.subject)],
    ];
    for (const [name, expected] of cases) {
        const card = screen.getByRole('button', { name, exact: true });
        fireEvent.click(card);
        expect(card).toHaveAttribute('aria-pressed', 'true');
        expectSubjects(expected);
    }
});

test('kết hợp thẻ với môn học và hiển thị rỗng khi không có lượt phù hợp', async () => {
    render(<MemoryRouter initialEntries={['/business-admin/class-attendance']}><ClassAttendanceAnalytics /></MemoryRouter>);
    await screen.findByText('Trí tuệ nhân tạo', { exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Đi muộn', exact: true }));
    fireEvent.change(screen.getByLabelText('Môn học'), { target: { value: 'AI' } });
    await waitFor(() => expect(fetchTeacherClassAttendanceReport).toHaveBeenLastCalledWith(expect.objectContaining({ subjectCode: 'AI' })));
    expect(await screen.findByText('Không có lớp/môn học phù hợp với bộ lọc hiện tại.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tổng buổi học', exact: true }));
    expectSubjects(['Trí tuệ nhân tạo']);
});

test('phân trang danh sách thực tế, đổi số dòng và trở về đầu khi lọc', async () => {
    const manyRows = Array.from({ length: 23 }, (_, index) => ({ ...rows[index % rows.length], id: `synced-${index}`, subject: `Môn thực tế ${index + 1}` }));
    fetchTeacherClassAttendanceReport.mockResolvedValue({ rows: manyRows, totals: { totalSessions: 23, attended: 12, onTime: 6, late: 6, absent: 5, rate: 50 } });
    render(<MemoryRouter initialEntries={['/business-admin/class-attendance']}><ClassAttendanceAnalytics /></MemoryRouter>);
    await screen.findByText('Hiển thị 1–10 / 23 lớp/môn học');
    expect(fetchClassAttendanceClasses).toHaveBeenCalledWith({ source: 'uel_api' });
    expect(fetchTeacherClassAttendanceReport).toHaveBeenCalledWith(expect.objectContaining({ source: 'uel_api' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    expect(screen.getByText('Hiển thị 11–20 / 23 lớp/môn học')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Môn thực tế 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Số dòng/trang' }), { target: { value: '5' } });
    expect(screen.getByText('Hiển thị 1–5 / 23 lớp/môn học')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Đi muộn', exact: true }));
    expect(screen.getByText('Hiển thị 1–5 / 6 lớp/môn học')).toBeInTheDocument();
});

test('không chèn lớp mẫu khi API đồng bộ không có dữ liệu', async () => {
    fetchClassAttendanceClasses.mockResolvedValue([]);
    fetchTeacherClassAttendanceReport.mockResolvedValue({ rows: [], totals: {} });
    render(<MemoryRouter initialEntries={['/business-admin/class-attendance']}><ClassAttendanceAnalytics /></MemoryRouter>);
    expect(await screen.findByText('Chưa có lớp học thực tế đã đồng bộ phù hợp với bộ lọc hiện tại.')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 0–0 / 0 lớp/môn học')).toBeInTheDocument();
    expect(screen.queryByText('Trí tuệ nhân tạo')).not.toBeInTheDocument();
});
