import { syncMessage } from './uelSyncMessages';

test.each(['cán bộ SDH162', 'SV C22603199BT'])('explains duplicate emails with record identity: %s', record => {
    const message = syncMessage(`${record}: duplicate key value violates unique constraint "ux_users_email_active"`);
    expect(message).toContain(record.replace(/^SV/, 'Sinh viên'));
    expect(message).toContain('Email này đã được dùng cho một tài khoản khác');
    expect(message).not.toMatch(/duplicate|constraint|ux_users/);
});
test('does not assume a different duplicate field is an email', () => {
    expect(syncMessage('lớp ABC: duplicate key value violates unique constraint "class_code_key"')).not.toContain('Email');
});
test('retains an actionable explanation without exposing technical connection details', () => {
    expect(syncMessage('Không kết nối được API UEL (/staff): fetch failed')).toBe('Hiện chưa kết nối được với hệ thống của trường. Vui lòng thử lại sau.');
    expect(syncMessage('UEL API HTTP 403 Forbidden (traceId xyz)')).toBe('Kết nối chưa được cấp quyền lấy dữ liệu. Vui lòng liên hệ người quản trị để kiểm tra.');
});
test('explains missing prerequisites in plain Vietnamese', () => {
    expect(syncMessage('lớp HP ABC: 3 SV chưa có trong hệ thống (chạy bước students).')).toBe('lớp học phần ABC: 3 sinh viên chưa có trong hệ thống (đồng bộ sinh viên trước).');
    expect(syncMessage('Bảng study_periods trống')).toContain('Chưa có bảng giờ tiết học');
});
test('does not expose unrecognized database failures', () => {
    expect(syncMessage('cán bộ NS01: relation "users" does not exist')).toBe('cán bộ NS01: Chưa xử lý được thông tin này. Vui lòng liên hệ người quản trị để kiểm tra nguyên nhân.');
});
