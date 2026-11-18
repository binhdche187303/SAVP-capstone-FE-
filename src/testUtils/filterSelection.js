import { fireEvent, screen } from '@testing-library/react';

// Exercise both the shared multi-choice control and legacy native form fields.
export const changeFilter = (control, event) => {
    if (control.tagName !== 'BUTTON' || control.getAttribute('role') !== 'combobox') return fireEvent.change(control, event);
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn', exact: true }));
    const value = event.target.value;
    if (value && value !== 'all' && value !== 'ALL') {
        const option = screen.getAllByRole('option').find(item => item.value === String(value));
        if (!option) throw new Error(`Không tìm thấy lựa chọn ${value}`);
        fireEvent.click(option);
    }
    fireEvent.keyDown(document, { key: 'Escape' });
};
