import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import AppTypography from './AppTypography';

const renderAt = path => render(<MemoryRouter initialEntries={[path]}><AppTypography /></MemoryRouter>);

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'enables common typography for %s', role => {
        renderAt(`/${role}/reports`);
        expect(document.body).toHaveAttribute('data-standard-typography', 'true');
    }
);

test.each(['/teacher/attendance', '/student/schedule', '/login'])(
    'preserves the existing typography outside the five roles: %s', path => {
        renderAt(path);
        expect(document.body).not.toHaveAttribute('data-standard-typography');
    }
);

test('removes typography overrides when navigating from an operational role to Teacher', () => {
    const Navigate = () => {
        const navigate = useNavigate();
        return <button onClick={() => navigate('/teacher/attendance')}>Đổi vai trò</button>;
    };
    render(<MemoryRouter initialEntries={['/system-admin']}><AppTypography /><Navigate /></MemoryRouter>);
    expect(document.body).toHaveAttribute('data-standard-typography', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi vai trò' }));
    expect(document.body).not.toHaveAttribute('data-standard-typography');
});
