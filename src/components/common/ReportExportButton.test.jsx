import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportExportButton from './ReportExportButton';

const renderButton = (area, props = {}) => render(
    <MemoryRouter initialEntries={[`/${area}/reports`]}>
        <ReportExportButton {...props} legacyClassName="old-export" legacyStyle={{ color: 'red' }}>
            <span>Xuất cũ</span>
        </ReportExportButton>
    </MemoryRouter>
);

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'uses the common report button in %s', area => {
        const onClick = jest.fn();
        renderButton(area, { label: 'Xuất Excel', onClick });
        const button = screen.getByRole('button', { name: 'Xuất Excel' });
        expect(button).toHaveClass('camai-report-export-button');
        expect(button).toHaveAttribute('type', 'button');
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    }
);

test.each(['teacher', 'student'])(
    'preserves existing presentation and handler for %s', area => {
        const onClick = jest.fn();
        renderButton(area, { onClick });
        const button = screen.getByRole('button', { name: 'Xuất cũ' });
        expect(button).toHaveClass('old-export');
        expect(button).toHaveStyle({ color: 'red' });
        expect(button).not.toHaveAttribute('data-report-export');
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    }
);

test('blocks duplicate downloads until an asynchronous export finishes', async () => {
    let finish;
    const onClick = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    renderButton('system-admin', { onClick });
    const button = screen.getByRole('button', { name: 'Xuất báo cáo' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Đang xuất…');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Xuất báo cáo');
});

test('preserves native form submission and externally controlled loading', () => {
    const submit = jest.fn(e => e.preventDefault());
    const { rerender } = render(<form onSubmit={submit}><ReportExportButton type="submit" /></form>);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
    expect(submit).toHaveBeenCalledTimes(1);
    rerender(<form onSubmit={submit}><ReportExportButton type="submit" busy /></form>);
    expect(screen.getByRole('button', { name: 'Đang xuất…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(submit).toHaveBeenCalledTimes(1);
});
