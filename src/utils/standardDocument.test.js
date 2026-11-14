import { toStandardDocument } from './standardDocument';

const cfg = () => ({
    title: 'NHẬT KÝ RA/VÀO PHÒNG',
    period: { from: '2026-11-10', to: '2026-11-10' },
    info: [
        { section: 'Phạm vi báo cáo' },
        ['Phòng', 'A.101'],
        ['Bộ lọc', ''],
        { section: 'Kết quả tổng hợp' },
        ['Tổng lượt', 12],
        ['Khu đông nhất', 'Sảnh A'],
        { section: 'Thông tin xuất' },
        ['Người xuất', 'Nguyễn Văn A'],
        { section: 'Ghi chú' },
        ['Độ tin cậy', 'Độ giống khuôn mặt (%)'],
    ],
    sheets: [{
        name: 'Chi tiết',
        note: 'Đã gộp lượt trùng',
        columns: [
            { header: 'STT', key: 'stt' },
            { header: 'Thời gian', key: 'time' },
            { header: 'Ngày', key: 'day', numFmt: 'dd/mm/yyyy' },
            { header: 'Người', key: 'person' },
            { header: 'Số lượt', key: 'n' },
            { header: 'Tỷ lệ', key: 'rate' },
            { header: 'Mã sự kiện', key: 'id', standard: false },
        ],
        rows: [
            { stt: 1, time: new Date('2026-11-10T01:02:03Z'), day: new Date(2026, 10, 10), person: 'An', n: 3, rate: 1.256, id: 'x' },
            { stt: 2, time: new Date('2026-11-10T02:00:00Z'), day: new Date(2026, 10, 10), person: '', n: 1, rate: 2, id: 'y' },
        ],
    }],
});

describe('toStandardDocument', () => {
    test('chia mục info thành điều kiện lọc / chỉ tiêu / ghi chú, bỏ thông tin xuất', () => {
        const doc = toStandardDocument(cfg());
        expect(doc.title).toBe('Nhật ký ra/vào phòng');
        expect(doc.period).toEqual({ from: '2026-11-10', to: '2026-11-10' });
        expect(doc.filterLines).toEqual(['Phòng: A.101']);
        expect(doc.kpis).toEqual([{ label: 'Tổng lượt', value: 12 }, { label: 'Khu đông nhất', value: 'Sảnh A' }]);
        expect(doc.notes).toEqual(['Độ tin cậy: Độ giống khuôn mặt (%)', 'Chi tiết: Đã gộp lượt trùng']);
        expect(JSON.stringify(doc)).not.toContain('Nguyễn Văn A');
    });

    test('bảng: bỏ STT và cột standard:false, định dạng theo dữ liệu', () => {
        const [t] = toStandardDocument(cfg()).tables;
        expect(t.columns.map((c) => [c.label, c.format])).toEqual([
            ['Thời gian', 'datetime'], ['Ngày', 'text'], ['Người', 'text'], ['Số lượt', 'number'], ['Tỷ lệ', 'text'],
        ]);
        expect(t.rows[0]).toEqual({ c0: '2026-11-10T01:02:03.000Z', c1: '10/11/2026', c2: 'An', c3: 3, c4: '1,26' });
        expect(t.rows[1].c2).toBeNull();
    });

    test('kỳ báo cáo: nhận Date, đảo khi ngược, mặc định hôm nay; docTitle và dataSource ưu tiên', () => {
        const doc = toStandardDocument({ ...cfg(), period: { from: new Date(2026, 10, 12, 9), to: '2026-11-01' }, docTitle: 'Tên riêng', dataSource: 'Nguồn X' });
        expect(doc.period).toEqual({ from: '2026-11-01', to: '2026-11-12' });
        expect(doc.title).toBe('Tên riêng');
        expect(doc.dataSource).toBe('Nguồn X');
        const plain = toStandardDocument({ title: 'Báo cáo A', sheets: [] });
        expect(plain.period.from).toBe(plain.period.to);
        expect(plain.title).toBe('Báo cáo A');
        expect(plain).not.toHaveProperty('dataSource');
    });
});
