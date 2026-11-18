import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportExportAction from './ReportExportAction';

test('teacher attendance exports use the common dialog and wait for confirmation', async () => {
    const exportAttendance = jest.fn().mockResolvedValue({ success: true });
    render(<MemoryRouter initialEntries={['/teacher/attendance-report']}>
        <ReportExportAction forceStandard format="csv" label="Xuất chuyên cần" onClick={exportAttendance} />
    </MemoryRouter>);

    const button = screen.getByRole('button', { name: 'Xuất chuyên cần' });
    expect(button).toHaveClass('camai-report-export-button');
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Xuất báo cáo' });
    expect(within(dialog).getByRole('radio', { name: 'CSV' })).toBeChecked();
    expect(exportAttendance).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xuất file' }));
    await waitFor(() => expect(exportAttendance).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
