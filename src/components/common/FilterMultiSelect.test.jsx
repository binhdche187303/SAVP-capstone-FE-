import { useState } from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FilterMultiSelect from './FilterMultiSelect';

const Example = () => {
    const [value, setValue] = useState('');
    return <><label htmlFor="status">Trạng thái</label><FilterMultiSelect id="status" value={value} onChange={event => setValue(event.target.value)}><option value="">Tất cả</option><option value="new">Mới</option><option value="resolved">Đã xử lý</option><option value="disabled" disabled>Không dùng</option></FilterMultiSelect><output data-testid="selection">{JSON.stringify(value)}</output><button>Khác</button></>;
};
test('keeps multiple choices, allows searching and clearing, and closes without locking the page', () => {
    render(<Example />);
    const control = screen.getByLabelText('Trạng thái');
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('option', { name: 'Mới' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã xử lý' }));
    expect(screen.getByTestId('selection')).toHaveTextContent('["new","resolved"]');
    expect(control).toHaveTextContent('Đã chọn 2 mục');
    fireEvent.change(screen.getByPlaceholderText('Tìm lựa chọn…'), { target: { value: 'xử lý' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByText('Bỏ chọn'));
    expect(screen.getByTestId('selection')).toHaveTextContent('""');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(control);
    fireEvent.pointerDown(screen.getByText('Khác'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
test.each(['teacher', 'student'])('%s retains the native single selection', area => {
    render(<MemoryRouter initialEntries={[`/${area}/calendar`]}><Example /></MemoryRouter>);
    expect(screen.getByLabelText('Trạng thái').tagName).toBe('SELECT');
});

const BinaryFilter = ({ initialValue = '' }) => {
    const [value, setValue] = useState(initialValue);
    return <><label htmlFor="recognition">Kết quả nhận diện</label>
        <FilterMultiSelect singleSelect id="recognition" value={value} onChange={event => setValue(event.target.value)}>
            <option value="ALL">Tất cả trạng thái</option>
            <option value="matched">Khớp dữ liệu</option>
            <option value="unmatched">Biển lạ</option>
        </FilterMultiSelect>
        <output data-testid="binary-value">{JSON.stringify(value)}</output></>;
};

test('binary enums use a native single-value dropdown with the all option', () => {
    render(<BinaryFilter initialValue="ALL" />);
    const control = screen.getByLabelText('Kết quả nhận diện');
    expect(control.tagName).toBe('SELECT');
    expect(control.multiple).toBe(false);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.change(control, { target: { value: 'unmatched' } });
    expect(screen.getByTestId('binary-value')).toHaveTextContent('"unmatched"');
    expect(screen.queryByPlaceholderText('Tìm lựa chọn…')).not.toBeInTheDocument();
});

test('normalizes a previous two-value selection to all instead of displaying a stale array', async () => {
    render(<BinaryFilter initialValue={['matched', 'unmatched']} />);
    await waitFor(() => expect(screen.getByTestId('binary-value')).toHaveTextContent('"ALL"'));
    expect(screen.getByLabelText('Kết quả nhận diện')).toHaveValue('ALL');
});

test('a lookup with only two records still allows multiple selections', () => {
    const choices = ['Camera A', 'Camera B'];
    render(<FilterMultiSelect aria-label="Camera" value="" onChange={() => {}}>
        <option value="">Tất cả camera</option>
        {choices.map(name => <option key={name} value={name}>{name}</option>)}
    </FilterMultiSelect>);
    fireEvent.click(screen.getByRole('combobox', { name: 'Camera' }));
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
});
