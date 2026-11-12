// ExportMenu askMode: chọn định dạng → hỏi bản thường / bản quy chuẩn (chỉ mẫu dùng chung) → onExport(format, extra).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetTemplates } from '../../mocks/visitorReport/templateApi';
import ExportMenu from './ExportMenu';

jest.mock('../../config/featureFlags', () => ({
    ...jest.requireActual('../../config/featureFlags'),
    REPORT_MOCK_ENABLED: true,
}));

const SEED_ID = '10000000-0000-4000-8000-000000000001';

const renderMenu = (props) => render(
    <MemoryRouter initialEntries={['/system-admin/room-access-logs']}>
        <ExportMenu onExport={props.onExport} askMode={props.askMode} />
    </MemoryRouter>,
);

beforeEach(() => resetTemplates());

test('không askMode: gọi thẳng onExport(format)', () => {
    const onExport = jest.fn();
    renderMenu({ onExport });
    fireEvent.click(screen.getByText('Xuất báo cáo'));
    fireEvent.click(screen.getByText('Excel'));
    expect(onExport).toHaveBeenCalledWith('xlsx');
    expect(screen.queryByText('Bản quy chuẩn')).not.toBeInTheDocument();
});

test('askMode: bản thường → onExport(format, {})', async () => {
    const onExport = jest.fn();
    renderMenu({ onExport, askMode: true });
    fireEvent.click(screen.getByText('Xuất báo cáo'));
    fireEvent.click(screen.getByText('Word'));
    expect(onExport).not.toHaveBeenCalled();
    await screen.findByText('Bản quy chuẩn');
    fireEvent.click(screen.getByText('Xuất file'));
    expect(onExport).toHaveBeenCalledWith('docx', {});
});

test('askMode: bản quy chuẩn dùng mẫu chung mặc định', async () => {
    const onExport = jest.fn();
    renderMenu({ onExport, askMode: true });
    fireEvent.click(screen.getByText('Xuất báo cáo'));
    fireEvent.click(screen.getByText('PDF'));
    const standard = await screen.findByRole('radio', { name: /Bản quy chuẩn/ });
    await waitFor(() => expect(standard).toBeEnabled());
    fireEvent.click(standard);
    await screen.findByTestId('signer-maker');
    fireEvent.click(screen.getByText('Xuất file'));
    expect(onExport).toHaveBeenCalledWith('pdf', expect.objectContaining({ mode: 'standard', templateId: SEED_ID }));
});
