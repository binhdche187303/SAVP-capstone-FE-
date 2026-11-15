import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetTemplates } from '../../mocks/visitorReport/templateApi';
import ExportMenu from './ExportMenu';

jest.mock('../../config/featureFlags', () => ({
    ...jest.requireActual('../../config/featureFlags'), REPORT_MOCK_ENABLED: true,
}));
const SEED_ID = '10000000-0000-4000-8000-000000000001';
const renderMenu = props => render(<MemoryRouter initialEntries={['/system-admin/room-access-logs']}><ExportMenu {...props} /></MemoryRouter>);
beforeEach(() => resetTemplates());

test('one dialog chooses a format and normal mode before starting export', async () => {
    const onExport = jest.fn().mockResolvedValue({ success: true });
    renderMenu({ onExport });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(onExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('pdf', {}));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('standard mode uses a saved template and signer choices in the same dialog', async () => {
    const onExport = jest.fn().mockResolvedValue({ success: true });
    renderMenu({ onExport, askMode: true });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Word' }));
    const standard = await screen.findByRole('radio', { name: /Bản quy chuẩn/ });
    await waitFor(() => expect(standard).toBeEnabled());
    fireEvent.click(standard);
    await screen.findByTestId('signer-maker');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('docx', expect.objectContaining({ mode: 'standard', templateId: SEED_ID })));
});

test('shows export failure, retains choices, and permits a retry', async () => {
    const onExport = jest.fn().mockResolvedValueOnce({ success: false, message: 'Máy chủ đang bận' }).mockResolvedValueOnce({ success: true });
    renderMenu({ onExport });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Excel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận');
    expect(screen.getByRole('radio', { name: 'Excel' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a queued export keeps one dialog open with a signed download link when the file is ready', async () => {
    const onExport = jest.fn().mockResolvedValue({ success: true, data: { fileName: 'bao-cao.pdf', downloadUrl: 'https://files.example/report.pdf' } });
    renderMenu({ onExport });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
    fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }));
    expect(await screen.findByRole('link', { name: 'Tải file' })).toHaveAttribute('href', 'https://files.example/report.pdf');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Xuất file' })).not.toBeInTheDocument();
});
