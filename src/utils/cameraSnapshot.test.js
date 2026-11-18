import { snapshotFileName } from './cameraSnapshot';

test('tên file ảnh bỏ dấu, bỏ ký tự đặc biệt và gắn thời điểm chụp', () => {
    const at = new Date(2026, 10, 18, 9, 5, 7);
    expect(snapshotFileName('Cổng 1 hướng vào', at)).toBe('cong-1-huong-vao_20261118-090507.png');
    expect(snapshotFileName('[UI TEST] Sảnh bảo vệ', at)).toBe('ui-test-sanh-bao-ve_20261118-090507.png');
    expect(snapshotFileName('', at)).toBe('camera_20261118-090507.png');
});
