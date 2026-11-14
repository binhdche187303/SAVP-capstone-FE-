// Màn "Mẫu báo cáo quy chuẩn" và hộp thoại chọn kiểu bản xuất, chạy với kho mẫu giả.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { resetTemplates, getTemplate } from '../../../mocks/visitorReport/templateApi';
import ReportTemplates from './ReportTemplates';
import ReportTemplateEditor from './ReportTemplateEditor';
import ExportModeDialog from '../../../components/report/ExportModeDialog';

jest.mock('../../../config/featureFlags', () => ({
    ...jest.requireActual('../../../config/featureFlags'),
    REPORT_MOCK_ENABLED: true,
}));

const SEED_ID = '10000000-0000-4000-8000-000000000001';

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/business-admin/report-templates" element={<ReportTemplates />} />
            <Route path="/business-admin/report-templates/:id" element={<ReportTemplateEditor />} />
        </Routes>
        <Where />
    </MemoryRouter>,
);
const outlineOrder = () => screen.getAllByTestId(/^outline-/).map((el) => el.dataset.testid.replace('outline-', ''));

beforeEach(() => resetTemplates());

describe('ReportTemplates', () => {
    test('liệt kê mẫu chuẩn kèm tóm tắt khối ký', async () => {
        renderAt('/business-admin/report-templates');
        expect(await screen.findByText('Mẫu chuẩn VISMA (NĐ 30)')).toBeInTheDocument();
        expect(screen.getByText('Tất cả báo cáo')).toBeInTheDocument();
        expect(screen.getByText(/TRƯỞNG PHÒNG HÀNH CHÍNH \(bắt buộc\)/)).toBeInTheDocument();
    });
});

describe('ReportTemplateEditor', () => {
    test('đổi chỗ khối bằng nút mũi tên rồi lưu', async () => {
        renderAt(`/business-admin/report-templates/${SEED_ID}`);
        await screen.findByTestId('template-page');
        expect(outlineOrder()).toEqual(['opening', 'scope', 'summary', 'assessment']);
        expect(screen.getByLabelText('Đưa lên: PHẠM VI VÀ NGUỒN DỮ LIỆU')).toBeDisabled();

        fireEvent.click(screen.getByLabelText('Đưa lên: KẾT QUẢ TỔNG HỢP'));
        expect(outlineOrder()).toEqual(['opening', 'summary', 'scope', 'assessment']);
        expect(screen.getByText('Chưa lưu')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Lưu mẫu'));
        await waitFor(() => expect(screen.queryByText('Chưa lưu')).not.toBeInTheDocument());
        expect(getTemplate(SEED_ID).layout.body.map((b) => b.id)).toEqual(['opening', 'summary', 'scope', 'assessment']);
    });

    test('kéo thả trong danh sách: thả ở nửa trên khối đích = chèn trước nó', async () => {
        renderAt(`/business-admin/report-templates/${SEED_ID}`);
        await screen.findByTestId('template-page');
        const dataTransfer = { setData: jest.fn(), effectAllowed: '' };
        fireEvent.dragStart(screen.getByTestId('outline-assessment'), { dataTransfer });
        // jsdom: getBoundingClientRect = 0 nên clientY -1 rơi vào nửa trên.
        fireEvent.dragOver(screen.getByTestId('outline-scope'), { dataTransfer, clientY: -1 });
        fireEvent.drop(screen.getByTestId('outline-scope'), { dataTransfer });
        expect(outlineOrder()).toEqual(['opening', 'assessment', 'scope', 'summary']);
    });

    test('thêm đoạn tự soạn, ẩn mục và chọn phần trên trang mẫu', async () => {
        renderAt(`/business-admin/report-templates/${SEED_ID}`);
        await screen.findByTestId('template-page');
        fireEvent.click(screen.getByText('Thêm đoạn tự soạn'));
        expect(outlineOrder()).toEqual(['opening', 'scope', 'summary', 'assessment', 'text-1']);

        fireEvent.click(screen.getByLabelText('Ẩn II. KẾT QUẢ TỔNG HỢP'));
        // Mục ẩn không còn số; các mục sau dồn số lên.
        expect(within(screen.getByTestId('outline-assessment')).getByText(/^II\. ĐÁNH GIÁ/)).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Xóa đoạn NỘI DUNG BỔ SUNG'));
        expect(outlineOrder()).toEqual(['opening', 'scope', 'summary', 'assessment']);
    });

    test('tạo mẫu mới rồi chuyển sang địa chỉ của mẫu vừa lưu', async () => {
        renderAt('/business-admin/report-templates/new');
        const name = await screen.findByLabelText('Tên mẫu');
        fireEvent.change(name, { target: { value: 'Mẫu lưu trữ' } });
        // Bố cục mặc định chưa có người ký cho ô bắt buộc → lưu bị chặn tại chỗ.
        fireEvent.click(screen.getByText('Lưu mẫu'));
        expect(screen.getByTestId('where')).toHaveTextContent('/business-admin/report-templates/new');

        fireEvent.click(screen.getByLabelText('Ẩn Phụ lục chi tiết'));
        fireEvent.click(screen.getByText(/^Khối ký/));
        const toggles = screen.getAllByLabelText(/Tự điền tên người bấm xuất/);
        fireEvent.click(toggles[toggles.length - 1]);
        fireEvent.click(screen.getByText('Lưu mẫu'));
        await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('/new'));
        const id = screen.getByTestId('where').textContent.split('/').pop();
        expect(getTemplate(id)).toMatchObject({ name: 'Mẫu lưu trữ', layout: { appendix: { enabled: false } } });
    });
});

describe('ExportModeDialog', () => {
    const open = (onConfirm) => render(
        <MemoryRouter initialEntries={['/business-admin/reports/vehicle']}>
            <ExportModeDialog isOpen format="pdf" reportType="vehicle" onClose={() => {}} onConfirm={onConfirm} />
        </MemoryRouter>,
    );

    test('bản thường gửi đúng tham số cũ', async () => {
        const onConfirm = jest.fn();
        open(onConfirm);
        await screen.findByText('Bản quy chuẩn');
        fireEvent.click(screen.getByText('Xuất file'));
        expect(onConfirm).toHaveBeenCalledWith({});
    });

    test('bản quy chuẩn: bỏ ô ký tùy chọn, giữ người ký mặc định', async () => {
        const onConfirm = jest.fn();
        open(onConfirm);
        const standard = screen.getByRole('radio', { name: /Bản quy chuẩn/ });
        await waitFor(() => expect(standard).toBeEnabled());
        fireEvent.click(standard);
        const maker = await screen.findByTestId('signer-maker');
        expect(within(screen.getByTestId('signer-head')).queryByText('In ô ký này')).not.toBeInTheDocument();
        fireEvent.click(within(maker).getByLabelText('In ô ký này'));
        fireEvent.click(screen.getByText('Xuất file'));
        expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'standard', templateId: SEED_ID, signers: { maker: null },
        }));
    });
});
