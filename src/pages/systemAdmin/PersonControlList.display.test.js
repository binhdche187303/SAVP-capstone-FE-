import { displayNameOf, reasonPoints } from './PersonControlList';

jest.mock('../../service/personControlListService', () => ({}));

test('tên chứa mã nội bộ snapshot được hiển thị gọn, tên thường giữ nguyên', () => {
    expect(displayNameOf('Người lạ snapshot:1d30ae31-5c9e-4041-9014-45e30ee6245e'))
        .toEqual({ title: 'Người lạ chưa rõ danh tính' });
    expect(displayNameOf('Nguyễn Văn A')).toEqual({ title: 'Nguyễn Văn A' });
});

test('lý do tách thành gạch đầu dòng', () => {
    expect(reasonPoints('Người lạ xuất hiện 1 lần tại Camera 2, lần cuối 13:57 02-11'))
        .toEqual(['Người lạ xuất hiện 1 lần tại Camera 2', 'Lần cuối 13:57 02-11']);
    expect(reasonPoints('Xuất hiện 2 lần tại Cổng chính\nLần cuối: 18/11 11:55')).toHaveLength(2);
    expect(reasonPoints('Khách vãng lai')).toEqual(['Khách vãng lai']);
    expect(reasonPoints('')).toEqual([]);
});
