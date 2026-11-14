import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import userEvent from '@testing-library/user-event';
import FilterBar, { FilterField } from './FilterBar';

test('allows a specific learning screen to opt into the common filters', () => {
    render(<MemoryRouter initialEntries={['/teacher/class-analytics']}>
        <FilterBar forceStandard><FilterField label="Khoảng thời gian"><select defaultValue="week"><option value="week">Tuần</option></select></FilterField></FilterBar>
    </MemoryRouter>);
    expect(screen.getByRole('combobox', { name: 'Khoảng thời gian' })).toHaveValue('week');
});

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'standardizes the filter bar and associates added labels in %s', area => {
        const change = jest.fn();
        render(<MemoryRouter initialEntries={[`/${area}/list`]}>
            <FilterBar role="group" aria-label="Bộ lọc" className="legacy-filters">
                <FilterField label="Tìm kiếm"><div className="relative"><input placeholder="Nhập tên" defaultValue="" onChange={change} /></div></FilterField>
            </FilterBar>
        </MemoryRouter>);
        expect(screen.getByRole('group', { name: 'Bộ lọc' })).toHaveClass('camai-filter-bar', 'legacy-filters');
        expect(screen.getByRole('group')).toHaveAttribute('data-filter-bar', 'card');
        const input = screen.getByRole('textbox', { name: 'Tìm kiếm' });
        fireEvent.change(input, { target: { value: 'Nguyễn' } });
        expect(change).toHaveBeenCalledTimes(1);
        expect(input).toHaveValue('Nguyễn');
    }
);

test.each(['teacher', 'student'])(
    'keeps shared filters unchanged in %s', area => {
        const change = jest.fn();
        render(<MemoryRouter initialEntries={[`/${area}/recordings`]}>
            <FilterBar role="group" aria-label="Bộ lọc" className="legacy-filters" style={{ padding: 20 }}>
                <FilterField label="Nhãn mới"><input placeholder="Tìm cũ" defaultValue="" onChange={change} /></FilterField>
            </FilterBar>
        </MemoryRouter>);
        expect(screen.getByRole('group')).not.toHaveClass('camai-filter-bar');
        expect(screen.getByRole('group')).not.toHaveAttribute('data-filter-bar');
        expect(screen.getByRole('group')).toHaveStyle({ padding: '20px' });
        expect(screen.queryByText('Nhãn mới')).not.toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Tìm cũ'), { target: { value: 'Cũ' } });
        expect(change).toHaveBeenCalledTimes(1);
    }
);

test('retains form submission, date constraints and disabled fields', () => {
    const submit = jest.fn(e => e.preventDefault());
    render(<FilterBar as="form" aria-label="Lọc thời gian" onSubmit={submit}>
        <FilterField label="Từ ngày"><input id="from-day" type="date" min="2026-01-01" max="2026-12-31" defaultValue="2026-11-01" /></FilterField>
        <FilterField label="Đơn vị"><select disabled defaultValue="all"><option value="all">Tất cả</option></select></FilterField>
        <button type="submit">Áp dụng</button>
    </FilterBar>);
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('id', 'from-day');
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('min', '2026-01-01');
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('max', '2026-12-31');
    expect(screen.getByLabelText('Đơn vị')).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Lọc thời gian' }));
    expect(submit).toHaveBeenCalledTimes(1);
});

test('leaves checkbox controls and transparent date overlays intact', () => {
    render(<FilterBar>
        <label><input type="checkbox" defaultChecked />Tự cập nhật</label>
        <label data-filter-display>Ngày xem<input aria-label="Chọn ngày" type="date" className="absolute opacity-0" /></label>
    </FilterBar>);
    expect(screen.getByRole('checkbox', { name: 'Tự cập nhật' })).toBeChecked();
    expect(screen.getByLabelText('Chọn ngày')).toHaveClass('absolute', 'opacity-0');
});

test('associates a range label with the actual date-picker input', () => {
    render(<FilterBar>
        <FilterField label="Khoảng ngày">
            <div className="relative">
                <DatePicker selectsRange startDate={new Date(2026, 10, 1)} endDate={null} dateFormat="dd/MM/yyyy" onChange={jest.fn()} />
            </div>
        </FilterField>
    </FilterBar>);
    expect(screen.getByRole('textbox', { name: 'Khoảng ngày' })).toHaveValue('01/11/2026 - ');
});

test.each(['system-admin', 'business-admin', 'manager', 'employee', 'guard'])(
    'puts search before criteria in DOM and tab order for %s', area => {
        const change = jest.fn();
        render(<MemoryRouter initialEntries={[`/${area}/list`]}>
            <FilterBar>
                <FilterField label="Trạng thái"><select defaultValue="all"><option value="all">Tất cả</option></select></FilterField>
                <FilterField label="Tìm kiếm"><input defaultValue="" onChange={change} /></FilterField>
                <FilterField label="Phòng ban"><select><option>Phòng A</option></select></FilterField>
            </FilterBar>
        </MemoryRouter>);
        const search = screen.getByRole('textbox', { name: 'Tìm kiếm' });
        for (const control of [search, screen.getByLabelText('Trạng thái'), screen.getByLabelText('Phòng ban')]) {
            userEvent.tab();
            expect(control).toHaveFocus();
        }
        fireEvent.change(search, { target: { value: 'An' } });
        expect(change).toHaveBeenCalledTimes(1);
        expect(search).toHaveValue('An');
    }
);

test.each(['system-admin', 'teacher', 'student'])(
    'reorders marked nested fields only within the standard role scope: %s', area => {
        render(<MemoryRouter initialEntries={[`/${area}/list`]}>
            <FilterBar><div>
                <label>Ngày<input aria-label="Ngày" type="date" /></label>
                <div data-filter-search><input aria-label="Tìm nhân sự" /></div>
                <button>Áp dụng</button>
            </div></FilterBar>
        </MemoryRouter>);
        const order = area === 'system-admin' ? ['Tìm nhân sự', 'Ngày'] : ['Ngày', 'Tìm nhân sự'];
        for (const name of order) {
            userEvent.tab();
            expect(screen.getByLabelText(name)).toHaveFocus();
        }
        userEvent.tab();
        expect(screen.getByRole('button', { name: 'Áp dụng' })).toHaveFocus();
    }
);
