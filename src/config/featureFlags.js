/**
 * Cờ bật/tắt tính năng ở mức FE — chỉ ẩn UI, KHÔNG xoá code/service phía sau.
 * Đổi giá trị ở đây là bật/tắt được ngay, không cần sửa component.
 */

export const LIVE_SPEAKER_TAGGING_ENABLED = false;

const visitorMockFlag = process.env.REACT_APP_VISITOR_MOCK;
const reportMockFlag = process.env.REACT_APP_REPORT_MOCK;
const legacyMockFlag = process.env.REACT_APP_VISITOR_REPORT_MOCK === 'true';

export const VISITOR_MOCK_ENABLED = visitorMockFlag !== undefined
    ? visitorMockFlag === 'true'
    : legacyMockFlag;
export const REPORT_MOCK_ENABLED = reportMockFlag !== undefined
    ? reportMockFlag === 'true'
    : legacyMockFlag;
/** Dải "dữ liệu minh họa" hiện khi còn ít nhất một phân hệ dùng dữ liệu giả. */
export const ANY_DEMO_DATA = VISITOR_MOCK_ENABLED || REPORT_MOCK_ENABLED;
/**
 * Trang Đồng bộ UEL chạy bằng dữ liệu giả để xem trước giao diện khi chưa bật BE.
 * Chỉ có tác dụng ở bản dev (`npm start`); bản build production luôn tắt.
 */
export const UEL_SYNC_MOCK_ENABLED = process.env.NODE_ENV !== 'production'
    && process.env.REACT_APP_UEL_SYNC_MOCK === 'true';
/**
 * Lịch họp cá nhân (/…/my-schedule) chạy bằng dữ liệu giả cho tới khi có API lịch VPĐT.
 * Mặc định BẬT ở bản dev; đặt REACT_APP_MEETING_CALENDAR_MOCK=false để gọi API thật /me/schedule.
 * Bản build production luôn tắt.
 */
export const MEETING_CALENDAR_MOCK_ENABLED = process.env.NODE_ENV !== 'production'
    && process.env.REACT_APP_MEETING_CALENDAR_MOCK !== 'false';
/**
 * Đăng ký lịch họp trên SAVP. Đặt false để ẩn nút/menu "Đăng ký họp" (khi lịch họp chỉ lấy từ VPĐT);
 * route và trang BookMeeting luôn giữ nguyên.
 */
export const MEETING_BOOKING_ENABLED = true;
