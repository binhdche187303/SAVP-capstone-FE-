import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RefreshButton from './RefreshButton';

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'uses the security alert refresh style in %s', (area) => {
        render(<MemoryRouter initialEntries={[`/${area}/notifications`]}>
            <RefreshButton legacyClassName="bg-white p-2" title="Tải lại thông báo">Giao diện cũ</RefreshButton>
        </MemoryRouter>);
        const button = screen.getByRole('button', { name: 'Tải lại thông báo' });
        expect(button).toHaveClass('h-9', 'w-9', 'rounded-xl', 'bg-cloud-mist/50');
        expect(button).not.toHaveClass('bg-white', 'p-2');
        expect(button).not.toHaveTextContent('Giao diện cũ');
        expect(button).toHaveAttribute('type', 'button');
    }
);

test.each(['teacher', 'student'])('retains the original shared button in %s', (area) => {
    const onClick = jest.fn();
    render(<MemoryRouter initialEntries={[`/${area}/notifications`]}>
        <RefreshButton busy onClick={onClick} title="Tải lại" legacyClassName="bg-white p-2" legacyStyle={{ color: 'red' }}>
            Làm mới theo giao diện cũ
        </RefreshButton>
    </MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Làm mới theo giao diện cũ' });
    expect(button).toHaveClass('bg-white', 'p-2');
    expect(button).not.toHaveClass('h-9', 'w-9');
    expect(button).toHaveStyle({ color: 'red' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
});

test('preserves the refresh callback and blocks repeat clicks until it finishes', async () => {
    let finish;
    const onClick = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter initialEntries={['/employee/recordings']}>
        <RefreshButton onClick={onClick} />
    </MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Làm mới' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
});

test('honors the callers loading and disabled states', () => {
    const onClick = jest.fn();
    const { rerender } = render(<RefreshButton busy onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Làm mới' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    rerender(<RefreshButton disabled onClick={onClick} />);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
});
