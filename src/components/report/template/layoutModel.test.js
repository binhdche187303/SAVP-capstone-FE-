import {
    buildSignerPayload, canAddTextBlock, canShift, cleanLayout, defaultLayout, fillText, initialSignerState, moveBlock,
    newSignatureSlot, newTextBlock, sectionNumbers, setIn, shiftBlock, validateLayout,
} from './layoutModel';

const ids = (body) => body.map((b) => b.id);

describe('setIn / fillText', () => {
    test('setIn sao chép theo đường dẫn, không sửa bản gốc', () => {
        const l = defaultLayout();
        const next = setIn(l, ['body', 1, 'enabled'], false);
        expect(next.body[1].enabled).toBe(false);
        expect(l.body[1].enabled).toBe(true);
        expect(next.header).toBe(l.header);
    });

    test('fillText thay biến, biến lạ giữ nguyên', () => {
        expect(fillText('{unit} báo cáo {title} {period} {x}', { unit: 'P.HC', title: 'khách', period: 'tháng 11' }))
            .toBe('P.HC báo cáo khách tháng 11 {x}');
    });
});

describe('đổi chỗ khối thân văn bản', () => {
    test('moveBlock chuyển trước khối đích, null = xuống cuối', () => {
        const body = defaultLayout().body;
        expect(ids(moveBlock(body, 'assessment', 'scope'))).toEqual(['opening', 'assessment', 'scope', 'summary']);
        expect(ids(moveBlock(body, 'scope', null))).toEqual(['opening', 'summary', 'assessment', 'scope']);
    });

    test('đoạn mở đầu luôn đứng đầu, không kéo được', () => {
        const body = defaultLayout().body;
        expect(moveBlock(body, 'opening', null)).toBe(body);
        expect(ids(moveBlock(body, 'summary', 'opening'))).toEqual(['opening', 'summary', 'scope', 'assessment']);
    });

    test('moveBlock không đổi gì thì trả lại đúng mảng cũ', () => {
        const body = defaultLayout().body;
        expect(moveBlock(body, 'scope', 'summary')).toBe(body);
        expect(moveBlock(body, 'assessment', null)).toBe(body);
    });

    test('canShift / shiftBlock không cho vượt lên trên đoạn mở đầu', () => {
        const body = defaultLayout().body;
        expect(canShift(body, 'scope', -1)).toBe(false);
        expect(canShift(body, 'opening', 1)).toBe(false);
        expect(canShift(body, 'assessment', 1)).toBe(false);
        expect(ids(shiftBlock(body, 'summary', -1))).toEqual(['opening', 'summary', 'scope', 'assessment']);
        expect(shiftBlock(body, 'scope', -1)).toBe(body);
    });

    test('đánh số La Mã bỏ qua mục ẩn và đoạn mở đầu', () => {
        const body = setIn(defaultLayout().body, [1, 'enabled'], false);
        expect(sectionNumbers(body)).toEqual({ summary: 'I', assessment: 'II' });
    });

    test('đoạn tự soạn có id không trùng và có giới hạn số lượng', () => {
        let body = defaultLayout().body;
        const first = newTextBlock(body);
        body = [...body, first];
        expect(newTextBlock(body).id).not.toBe(first.id);
        while (canAddTextBlock(body)) body = [...body, newTextBlock(body)];
        expect(body.filter((b) => b.kind === 'text')).toHaveLength(6);
    });

    test('ô ký mới không trùng id', () => {
        const sigs = defaultLayout().signatures;
        const a = newSignatureSlot(sigs);
        expect(newSignatureSlot([...sigs, a]).id).not.toBe(a.id);
    });
});

describe('validateLayout', () => {
    test('bố cục mặc định cần người ký mặc định cho ô bắt buộc', () => {
        const l = defaultLayout();
        expect(validateLayout(l)).toMatch(/người ký mặc định/);
        const ok = setIn(l, ['signatures', 1, 'defaultSigner'], { userId: null, fullName: 'Trần Thị Bình' });
        expect(validateLayout(ok)).toBeNull();
    });

    test.each([
        [['header', 'agencyUnderline'], 'KHÔNG CÓ', /gạch chân/],
        [['header', 'place'], '  ', /địa danh/],
        [['body', 2, 'title'], ' ', /cần có tiêu đề/],
        [['logo', 'enabled'], true, /ảnh logo/],
        [['watermark', 'enabled'], true, /logo nền/],
    ])('%j = %j bị từ chối', (path, value, message) => {
        const base = setIn(defaultLayout(), ['signatures', 1, 'useExporter'], true);
        expect(validateLayout(setIn(base, path, value))).toMatch(message);
    });

    test('mục đang ẩn được để trống tiêu đề', () => {
        let l = setIn(defaultLayout(), ['signatures', 1, 'useExporter'], true);
        l = setIn(l, ['body', 2], { ...l.body[2], enabled: false, title: '' });
        expect(validateLayout(l)).toBeNull();
    });

    test('cleanLayout bỏ dòng nơi nhận trống trước khi kiểm số lượng', () => {
        let l = setIn(defaultLayout(), ['signatures', 1, 'useExporter'], true);
        l = setIn(l, ['recipients', 'items'], [' A; ', '', ...Array(10).fill('   '), 'Lưu: VT.']);
        expect(validateLayout(l)).toMatch(/Tối đa 10/);
        const clean = cleanLayout(l);
        expect(clean.recipients.items).toEqual(['A;', 'Lưu: VT.']);
        expect(validateLayout(clean)).toBeNull();
    });
});

describe('người ký lúc xuất', () => {
    const layout = setIn(defaultLayout(), ['signatures', 1, 'defaultSigner'], { userId: 'u-2', fullName: 'Trần Thị Bình' });

    test('giữ nguyên người ký mặc định thì không gửi gì', () => {
        expect(buildSignerPayload(layout, initialSignerState(layout))).toEqual({ signers: {} });
    });

    test('bỏ ô tùy chọn gửi null, đổi người ký gửi người mới', () => {
        const state = initialSignerState(layout);
        state.maker.included = false;
        state.head = { included: true, userId: null, fullName: '  Lê Hoàng Cường ' };
        expect(buildSignerPayload(layout, state)).toEqual({
            signers: { maker: null, head: { userId: null, fullName: 'Lê Hoàng Cường' } },
        });
    });

    test('không bỏ được ô bắt buộc', () => {
        const state = initialSignerState(layout);
        state.head.included = false;
        expect(buildSignerPayload(layout, state).error).toMatch(/bắt buộc/);
    });

    test('ô bắt buộc không có mặc định thì phải chọn tên', () => {
        const bare = defaultLayout();
        expect(buildSignerPayload(bare, initialSignerState(bare)).error).toMatch(/chọn người ký/);
    });

    test('ô ẩn không xuất hiện trong hộp thoại', () => {
        const hidden = setIn(layout, ['signatures', 0, 'mode'], 'hidden');
        expect(Object.keys(initialSignerState(hidden))).toEqual(['head']);
    });
});
