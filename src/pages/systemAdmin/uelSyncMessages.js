// Translate stored results too, so earlier sync runs do not expose database errors.
export function syncMessage(message) {
    const text = String(message || '').trim();
    if (!text || text === '…') return text;
    const record = /^((?:cán bộ|SV|sinh viên|lớp HP|lớp|buổi)\s+[^:]+):\s*/i.exec(text);
    const prefix = record ? `${record[1].replace(/^SV\b/i, 'Sinh viên').replace(/^lớp HP\b/i, 'Lớp học phần')}: ` : '';
    let detail;
    if (/duplicate key|unique constraint|23505/i.test(text)) {
        detail = /email/i.test(text)
            ? 'Email này đã được dùng cho một tài khoản khác. Bản ghi này chưa được cập nhật; vui lòng kiểm tra lại email.'
            : 'Thông tin này bị trùng với dữ liệu đã có. Bản ghi này chưa được cập nhật; vui lòng kiểm tra lại.';
    } else if (/foreign key|23503/i.test(text)) {
        detail = 'Chưa tìm thấy thông tin liên quan trong hệ thống. Vui lòng đồng bộ đơn vị, cán bộ và sinh viên trước rồi thử lại.';
    } else if (/not-null|null value|23502/i.test(text)) {
        detail = 'Thông tin nhận về còn thiếu mục bắt buộc. Vui lòng kiểm tra lại dữ liệu tại trường.';
    } else if (/study_periods.*trống/i.test(text)) {
        detail = 'Chưa có bảng giờ tiết học. Vui lòng nhập giờ bắt đầu và kết thúc của từng tiết.';
    } else if (/UEL_API_BASE_URL|UEL_API_KEY/i.test(text)) {
        detail = 'Chưa thiết lập kết nối với hệ thống của trường. Vui lòng liên hệ người quản trị để bổ sung.';
    } else if (/Không kết nối|timeout|timed out|ECONN|ENOTFOUND|fetch failed|HTTP 5\d\d/i.test(text)) {
        detail = 'Hiện chưa kết nối được với hệ thống của trường. Vui lòng thử lại sau.';
    } else if (/HTTP (401|403)/i.test(text)) {
        detail = 'Kết nối chưa được cấp quyền lấy dữ liệu. Vui lòng liên hệ người quản trị để kiểm tra.';
    } else if (/sections\/enrollments cần/i.test(text)) {
        detail = 'Vui lòng chọn năm học và học kỳ trước khi đồng bộ lớp học phần hoặc đăng ký học phần.';
    } else if (/sessions cần fromDate/i.test(text)) {
        detail = 'Vui lòng chọn khoảng ngày lấy lịch học; ngày kết thúc phải bằng hoặc sau ngày bắt đầu.';
    } else if (/API không có giờ và bảng tiết/i.test(text)) {
        detail = 'Lịch học nhận về chưa có giờ cụ thể và bảng giờ tiết học chưa đầy đủ. Vui lòng bổ sung bảng giờ tiết rồi thử lại.';
    } else if (/duplicate|constraint|SQL|query|relation|column|syntax|invalid input|HTTP|traceId|Error|exception|failed/i.test(text)) {
        detail = 'Chưa xử lý được thông tin này. Vui lòng liên hệ người quản trị để kiểm tra nguyên nhân.';
    }
    if (detail) return prefix + detail;
    return text
        .replace(/\bSV\b/g, 'sinh viên')
        .replace(/\bGV\b/g, 'giảng viên')
        .replace(/lớp HP/g, 'lớp học phần')
        .replace(/chạy bước sections/g, 'đồng bộ lớp học phần trước')
        .replace(/chạy bước students/g, 'đồng bộ sinh viên trước')
        .replace(/\bAPI UEL\b|\bUEL API\b|\bAPI\b/g, 'hệ thống của trường')
        .replace(/\bnamHoc\b/g, 'năm học').replace(/\bhocKy\b/g, 'học kỳ');
}
