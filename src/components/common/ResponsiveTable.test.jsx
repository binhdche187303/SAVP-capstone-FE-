/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Verify container sizing and cell labels across responsive transitions. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResponsiveTable from './ResponsiveTable';

const content = (onClick, extra = false) => <>
    <thead><tr><th>Họ tên</th>{extra && <th>Đơn vị</th>}<th>Thao tác</th></tr></thead>
    <tbody><tr><td>Nguyễn Văn An</td>{extra && <td>Phòng đào tạo</td>}<td><button onClick={onClick}>Chi tiết</button></td></tr>
        <tr><td colSpan={extra ? 3 : 2}>Tổng hợp</td></tr></tbody>
</>;

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])('%s giữ đủ dữ liệu và thao tác khi chuyển bố cục', area => {
    const click = jest.fn();
    const { container } = render(<MemoryRouter initialEntries={[`/${area}`]}><ResponsiveTable>{content(click)}</ResponsiveTable></MemoryRouter>);
    expect(container.querySelector('[data-table-layout]')).toHaveAttribute('data-table-layout', 'cards');
    expect(screen.getByText('Nguyễn Văn An')).toHaveAttribute('data-table-label', 'Họ tên');
    expect(screen.getByText('Tổng hợp')).toHaveAttribute('data-table-span', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(click).toHaveBeenCalledTimes(1);
    const host = container.querySelector('.camai-table-container');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
    fireEvent(window, new Event('resize'));
    expect(host).toHaveAttribute('data-table-layout', 'table');
});

test('cập nhật nhãn khi bộ lọc làm thay đổi các cột', async () => {
    const { rerender } = render(<ResponsiveTable>{content(jest.fn())}</ResponsiveTable>);
    rerender(<ResponsiveTable>{content(jest.fn(), true)}</ResponsiveTable>);
    await waitFor(() => expect(screen.getByText('Phòng đào tạo')).toHaveAttribute('data-table-label', 'Đơn vị'));
    expect(screen.getByRole('button', { name: 'Chi tiết' }).closest('td')).toHaveAttribute('data-table-label', 'Thao tác');
});

test('giữ tổng cộng có nhãn và bỏ ô căn cột rỗng khi xếp dọc', () => {
    render(<ResponsiveTable><thead><tr><th>Nhân sự</th><th>Số buổi</th><th>Điểm</th></tr></thead>
        <tbody><tr><td>Nguyễn An</td><td>3</td><td>-2</td></tr></tbody>
        <tfoot><tr><td>Tổng cộng</td><td /><td>-2 điểm</td></tr></tfoot>
    </ResponsiveTable>);
    expect(screen.getByText('Tổng cộng')).toHaveAttribute('data-table-label', 'Nhân sự');
    expect(screen.getByText('-2 điểm')).toHaveAttribute('data-table-label', 'Điểm');
});

test.each(['teacher', 'student'])('%s giữ bảng hiện tại', area => {
    const { container } = render(<MemoryRouter initialEntries={[`/${area}`]}><ResponsiveTable className="legacy-table">{content(jest.fn())}</ResponsiveTable></MemoryRouter>);
    expect(container.querySelector('table')).toHaveClass('legacy-table');
    expect(container.querySelector('.camai-table-container')).toBeNull();
    expect(screen.getByText('Nguyễn Văn An')).not.toHaveAttribute('data-table-label');
});
