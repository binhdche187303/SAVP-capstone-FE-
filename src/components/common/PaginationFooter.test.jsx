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

test('does not display a page-size picker even when a screen supplies one', () => {
    const change = jest.fn();
    render(<PaginationFooter {...defaults} pageSizeControl={<select onChange={change}><option value="10">10</option></select>} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText('Hiển thị 11–20 / 35 bản ghi')).toBeInTheDocument();
});

test('uses hasMore without inventing a total or extra page numbers', () => {
    const onPageChange = jest.fn();
    const { rerender } = render(<PaginationFooter currentPage={3} hasNextPage visibleCount={10} itemLabel="cuộc họp" onPageChange={onPageChange} />);
    expect(screen.getByText('Trang 3 · 10 cuộc họp trên trang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-current', 'page');
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

test('fixed card counts retain the correct range without a size picker', () => {
    render(<PaginationFooter {...defaults} currentPage={1} pageSize={12} totalItems={33} totalPages={3} onPageSizeChange={jest.fn()} tone="danger" />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1–12 / 33 bản ghi')).toBeInTheDocument();
});

test('keeps text buttons and numbered pages in a narrow panel', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(180);
    try {
        render(<PaginationFooter {...defaults} />);
        expect(screen.getByRole('button', { name: 'Trước', exact: true })).toHaveTextContent('Trước');
        expect(screen.getByRole('button', { name: 'Sau', exact: true })).toHaveTextContent('Sau');
        expect(screen.getByRole('button', { name: '3', exact: true })).toBeInTheDocument();
    } finally {
        width.mockRestore();
        window.matchMedia = original;
    }
});

test('disables navigation during loading without displaying a size picker', () => {
    render(<PaginationFooter {...defaults} loading pageSizeControl={<select defaultValue="10"><option value="10">10</option></select>} />);
    expect(screen.getByText('Đang tải dữ liệu…')).toBeInTheDocument();
    expect(screen.queryByText('Hiển thị 11–20 / 35 bản ghi')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

test('keeps the same numbered navigation on mobile, including current and final pages', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    try {
        const onPageChange = jest.fn();
        render(<PaginationFooter {...defaults} currentPage={6} totalPages={20} totalItems={200} onPageChange={onPageChange} />);
        expect(screen.getByRole('button', { name: '6', exact: true })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: '5', exact: true })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '20', exact: true }));
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
