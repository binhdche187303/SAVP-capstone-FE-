import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatisticCard from './StatisticCard';

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'keeps the card filter interactive and exposes selection in %s', area => {
        const click = jest.fn();
        render(<MemoryRouter initialEntries={[`/${area}`]}>
            <StatisticCard label="Đang hoạt động" value={0} selected onClick={click} legacy={<div>Cũ</div>} />
        </MemoryRouter>);
        const button = screen.getByRole('button', { name: /Đang hoạt động/ });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(button).toHaveTextContent('0');
        fireEvent.click(button);
        expect(click).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Cũ')).not.toBeInTheDocument();
    }
);

test.each(['teacher', 'student'])('preserves legacy card content in %s', area => {
    render(<MemoryRouter initialEntries={[`/${area}`]}>
        <StatisticCard label="Mới" value={5} legacy={<div data-testid="old-card">Thẻ cũ</div>} />
    </MemoryRouter>);
    expect(screen.getByTestId('old-card')).toHaveTextContent('Thẻ cũ');
    expect(screen.queryByText('Mới')).not.toBeInTheDocument();
});

test('retains dashboard navigation as a link', () => {
    render(<MemoryRouter initialEntries={['/guard']}>
        <StatisticCard label="Cảnh báo mới" value={2} to="/guard/security-alerts?status=new" />
    </MemoryRouter>);
    expect(screen.getByRole('link', { name: /Cảnh báo mới/ })).toHaveAttribute('href', '/guard/security-alerts?status=new');
});
