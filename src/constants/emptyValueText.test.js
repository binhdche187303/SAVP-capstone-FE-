// Thống nhất: trường thông tin bị trống hiển thị "Chưa cung cấp".
// Không dùng lại các cách ghi cũ (N/A, Chưa cập nhật, Chưa có, Không có thông tin) làm giá trị thay thế.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const BANNED = /(\|\||\?\?)\s*['"`](N\/A|Chưa cập nhật|Chưa có|Không có thông tin)['"`]/;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'mocks' ? [] : walk(p);
    return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});

test('trường trống dùng chung "Chưa cung cấp"', () => {
    const offenders = walk(SRC).flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .map((line, i) => (BANNED.test(line) ? `${path.relative(SRC, file)}:${i + 1}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
});
