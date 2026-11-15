import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaginatedCollection from './PaginatedCollection';

const rows = Array.from({ length: 23 }, (_, index) => ({ id: index, name: `Bản ghi ${index + 1}` }));
const List = ({ items = rows, remove = jest.fn(), ...props }) => <PaginatedCollection items={items} {...props}>
    {(visible, start) => <ul>{visible.map((item, index) => <li key={item.id}>{item.name}<button onClick={() => remove(start + index)}>Xóa {item.name}</button></li>)}</ul>}
</PaginatedCollection>;

test('chuyển trang, giữ chỉ số bản ghi và cố định 10 dòng mỗi trang', () => {
    const remove = jest.fn();
    render(<List remove={remove} />);
    expect(screen.getByText('Hiển thị 1–10 / 23 bản ghi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa Bản ghi 11' }));
    expect(remove).toHaveBeenCalledWith(10);
    expect(screen.queryByText('Bản ghi 1', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Số dòng/trang')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    expect(screen.getByText('Hiển thị 21–23 / 23 bản ghi')).toBeInTheDocument();
});

test('trở về trang đầu khi bộ lọc trả tập bản ghi mới', () => {
    const { rerender } = render(<List />);
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    rerender(<List items={rows.filter(item => item.id > 15)} />);
    expect(screen.getByText('Hiển thị 1–7 / 7 bản ghi')).toBeInTheDocument();
    expect(screen.getByText('Bản ghi 17', { exact: true })).toBeInTheDocument();
});

test('khóa bộ điều khiển lúc tải và xử lý danh sách rỗng', () => {
    const { rerender } = render(<List loading />);
    expect(screen.getByRole('button', { name: 'Sau', exact: true })).toBeDisabled();
    rerender(<List items={[]} />);
    expect(screen.getByText('Hiển thị 0–0 / 0 bản ghi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sau', exact: true })).toBeDisabled();
});

test('dữ liệu trực tiếp thêm mới không đẩy người đang đọc về trang đầu', () => {
    const { rerender } = render(<List />);
    fireEvent.click(screen.getByRole('button', { name: 'Sau', exact: true }));
    rerender(<List items={[{ id: 99, name: 'Bản ghi mới' }, ...rows]} />);
    expect(screen.getByText('Hiển thị 11–20 / 24 bản ghi')).toBeInTheDocument();
});

test('hiển thị bản ghi vừa thêm và giữ đúng chỉ số khi sửa danh sách', () => {
    const remove = jest.fn();
    const { rerender } = render(<List items={rows.slice(0, 6)} initialPageSize={5} resetKey="editor" revealAdded remove={remove} />);
    rerender(<List items={rows.slice(0, 7)} initialPageSize={5} resetKey="editor" revealAdded remove={remove} />);
    expect(screen.getByText('Hiển thị 6–7 / 7 bản ghi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa Bản ghi 7' }));
    expect(remove).toHaveBeenCalledWith(6);
});

test('chương trình họp chuyển tới trang có nội dung đang diễn ra', () => {
    const { rerender } = render(<List activeIndex={14} />);
    expect(screen.getByText('Hiển thị 11–20 / 23 bản ghi')).toBeInTheDocument();
    rerender(<List activeIndex={21} />);
    expect(screen.getByText('Hiển thị 21–23 / 23 bản ghi')).toBeInTheDocument();
});

test.each(['teacher', 'student'])('%s giữ nguyên danh sách hiện tại', area => {
    render(<MemoryRouter initialEntries={[`/${area}`]}><List /></MemoryRouter>);
    expect(screen.getByText('Bản ghi 23', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Phân trang' })).not.toBeInTheDocument();
});
