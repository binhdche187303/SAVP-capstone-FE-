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
