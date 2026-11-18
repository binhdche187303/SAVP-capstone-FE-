import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => jest.useRealTimers());

test('shows Vietnam time below refresh and updates it only after the callback finishes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T07:05:00Z'));
    let finish;
    render(<RefreshButton onClick={() => new Promise(resolve => { finish = resolve; })} />);
    expect(screen.getByText(/Lần cuối làm mới lúc:/)).toBeInTheDocument();
    expect(screen.getByText('14:05', { selector: 'time' })).toBeInTheDocument();
    jest.setSystemTime(new Date('2026-11-16T07:08:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(screen.getByText('14:05', { selector: 'time' })).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.getByText('14:08', { selector: 'time' })).toHaveAttribute('dateTime', '2026-11-16T07:08:00.000Z');
});

test('updates the displayed time when a caller finishes loading', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T07:05:00Z'));
    const { rerender } = render(<RefreshButton busy />);
    expect(screen.queryByText('14:05', { selector: 'time' })).not.toBeInTheDocument();
    rerender(<RefreshButton busy={false} />);
    expect(screen.getByText('14:05', { selector: 'time' })).toBeInTheDocument();
});

test('retains the previous time when a refresh reports failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T07:05:00Z'));
    render(<RefreshButton onClick={async () => ({ success: false })} />);
    jest.setSystemTime(new Date('2026-11-16T07:08:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Làm mới' })).toBeEnabled());
    expect(screen.getByText('14:05', { selector: 'time' })).toBeInTheDocument();
    expect(screen.queryByText('14:08')).not.toBeInTheDocument();
});
