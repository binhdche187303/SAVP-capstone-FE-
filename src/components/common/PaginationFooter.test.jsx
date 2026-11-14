import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaginationFooter from './PaginationFooter';
import Pagination from './Pagination';

const defaults = { currentPage: 2, totalPages: 4, totalItems: 35, pageSize: 10, onPageChange: jest.fn() };

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'uses the same footer and range in %s', (area) => {
        render(<MemoryRouter initialEntries={[`/${area}/list`]}>
            <PaginationFooter {...defaults} legacy={<div>Phân trang cũ</div>} />
        </MemoryRouter>);
        expect(screen.getByText('Hiển thị 11–20 / 35 bản ghi')).toBeInTheDocument();
        expect(screen.queryByText('Phân trang cũ')).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Phân trang' })).toHaveAttribute('data-pagination', 'standard');
        expect(within(screen.getByRole('navigation', { name: 'Phân trang' })).getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    }
);

test.each(['teacher', 'student'])('retains the original shared footer in %s', (area) => {
    const change = jest.fn();
    render(<MemoryRouter initialEntries={[`/${area}/list`]}>
        <PaginationFooter {...defaults} legacy={<button className="text-sm" onClick={change}>Phân trang cũ</button>} />
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Phân trang cũ' }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('requests the chosen page, including the last page in a long list', () => {
    const onPageChange = jest.fn();
    render(<PaginationFooter {...defaults} currentPage={6} totalPages={20} totalItems={200} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    expect(onPageChange).toHaveBeenLastCalledWith(20);
    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(onPageChange).toHaveBeenLastCalledWith(7);
});

test('shows the final partial range and prevents moving beyond the last page', () => {
    render(<PaginationFooter {...defaults} currentPage={4} />);
    expect(screen.getByText('Hiển thị 31–35 / 35 bản ghi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('keeps the original page size change handler and options', () => {
    const change = jest.fn();
    render(<PaginationFooter {...defaults} pageSizeControl={<select defaultValue="10" onChange={change}><option value="10">10</option><option value="20">20</option></select>} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Số dòng/trang' }), { target: { value: '20' } });
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox')).toHaveValue('20');
});

test('uses hasMore without inventing a total or extra page numbers', () => {
    const onPageChange = jest.fn();
    const { rerender } = render(<PaginationFooter currentPage={3} hasNextPage visibleCount={10} itemLabel="cuộc họp" onPageChange={onPageChange} />);
    expect(screen.getByText('Trang 3 · 10 cuộc họp trên trang')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '4' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
    rerender(<PaginationFooter currentPage={3} hasNextPage={false} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('keeps disabled navigation for empty results and single-page lists', () => {
    const { rerender } = render(<PaginationFooter {...defaults} currentPage={1} totalPages={0} totalItems={0} />);
    expect(screen.getByText('Hiển thị 0–0 / 0 bản ghi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
    rerender(<PaginationFooter {...defaults} currentPage={1} totalPages={1} totalItems={5} />);
    expect(screen.getByText('Hiển thị 1–5 / 5 bản ghi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});

test('requests an actual page size change with common options, including the current size', () => {
    const change = jest.fn();
    render(<PaginationFooter {...defaults} pageSize={15} onPageSizeChange={change} />);
    const size = screen.getByRole('combobox', { name: 'Số dòng/trang' });
    expect(size).toHaveValue('15');
    fireEvent.change(size, { target: { value: '20' } });
    expect(change).toHaveBeenCalledWith(20);
});

test('uses compact navigation in a narrow panel even when the viewport is wide', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(180);
    try {
        render(<PaginationFooter {...defaults} />);
        expect(screen.getByLabelText('Trang 2 trên 4')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '3', exact: true })).not.toBeInTheDocument();
    } finally {
        width.mockRestore();
        window.matchMedia = original;
    }
});

test('disables navigation and page size controls during loading', () => {
    render(<PaginationFooter {...defaults} loading pageSizeControl={<select defaultValue="10"><option value="10">10</option></select>} />);
    expect(screen.getByText('Đang tải dữ liệu…')).toBeInTheDocument();
    expect(screen.queryByText('Hiển thị 11–20 / 35 bản ghi')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
});

test('keeps the current and final pages accessible on narrow screens without a long row of buttons', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    try {
        const onPageChange = jest.fn();
        render(<PaginationFooter {...defaults} currentPage={6} totalPages={20} totalItems={200} onPageChange={onPageChange} />);
        expect(screen.getByLabelText('Trang 6 trên 20')).toHaveAttribute('aria-current', 'page');
        expect(screen.queryByRole('button', { name: '5', exact: true })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Trang cuối', exact: true }));
        expect(onPageChange).toHaveBeenCalledWith(20);
        fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
        expect(onPageChange).toHaveBeenLastCalledWith(7);
    } finally {
        window.matchMedia = original;
    }
});


test.each(['teacher', 'student'])('keeps direct pagination styling unchanged in %s', area => {
    render(<MemoryRouter initialEntries={[`/${area}/list`]}>
        <Pagination currentPage={2} totalPages={4} onPageChange={jest.fn()} />
    </MemoryRouter>);
    expect(screen.getByRole('navigation', { name: 'Phân trang' })).not.toHaveAttribute('data-pagination');
});
