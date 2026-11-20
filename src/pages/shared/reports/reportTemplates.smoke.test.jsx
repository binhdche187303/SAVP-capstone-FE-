// Màn "Mẫu báo cáo quy chuẩn" và hộp thoại chọn kiểu bản xuất, chạy với kho mẫu giả.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { resetTemplates, getTemplate, createTemplate, updateTemplate } from '../../../mocks/visitorReport/templateApi';
import { defaultLayout } from '../../../components/report/template/layoutModel';
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
    test('liệt kê mẫu chuẩn', async () => {
        renderAt('/business-admin/report-templates');
        expect(await screen.findByText('Mẫu chuẩn VISMA (NĐ 30)')).toBeInTheDocument();
        expect(screen.getByText('Tất cả báo cáo')).toBeInTheDocument();
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

describe('Chống tạo trùng mẫu', () => {
    // Bố cục lưu được: ô ký bắt buộc tự lấy người bấm xuất.
    const layout = () => { const l = defaultLayout(); l.signatures[1].useExporter = true; return l; };

    test('mỗi loại một mẫu, một mẫu "Tất cả báo cáo", tên không trùng', () => {
        expect(() => createTemplate({ name: 'Chung 2', reportTypes: [], layout: layout() })).toThrow(/"Tất cả báo cáo" đã có mẫu/);
        const vehicle = createTemplate({ name: 'Mẫu xe', reportTypes: ['vehicle'], layout: layout() });
        expect(() => createTemplate({ name: 'Mẫu xe 2', reportTypes: ['visitor', 'vehicle'], layout: layout() })).toThrow(/"Phương tiện" đã có mẫu "Mẫu xe"/);
        expect(() => createTemplate({ name: '  mẫu XE ', reportTypes: ['visitor'], layout: layout() })).toThrow(/Đã có mẫu tên "Mẫu xe"/);
        // Sửa nội dung mẫu đang có (không đổi loại / tên) vẫn được.
        expect(updateTemplate(vehicle.id, { layout: layout() }).name).toBe('Mẫu xe');
    });

    test('trình sửa báo trùng và khóa nút lưu, có lối sang mẫu hiện có', async () => {
        createTemplate({ name: 'Mẫu xe', reportTypes: ['vehicle'], layout: layout() });
        renderAt('/business-admin/report-templates/new');
        const name = await screen.findByLabelText('Tên mẫu');
        expect(screen.queryByTestId('template-conflict')).not.toBeInTheDocument();
        expect(screen.queryByText('Mẫu mặc định')).not.toBeInTheDocument();
        fireEvent.change(name, { target: { value: 'mẫu xe' } });
        const alert = screen.getByTestId('template-conflict');
        expect(alert).toHaveTextContent('Đã có mẫu tên Mẫu xe');
        expect(screen.getByText('Lưu mẫu').closest('button')).toBeDisabled();
        fireEvent.click(within(alert).getByText('Sửa mẫu hiện có'));
        await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('/new'));
    });

    test('danh sách không còn nút nhân bản; đủ mẫu thì khóa nút tạo', async () => {
        ['staff-attendance', 'student-attendance', 'gate-access', 'room-utilization', 'vehicle', 'visitor', 'security-alert']
            .forEach((t, i) => createTemplate({ name: `Mẫu ${i}`, reportTypes: [t], layout: layout() }));
        renderAt('/business-admin/report-templates');
        await screen.findByText('Mẫu 0');
        expect(screen.queryByLabelText(/Nhân bản/)).not.toBeInTheDocument();
        expect(screen.getByText('Tạo mẫu').closest('button')).toBeDisabled();
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
