/**
 * Cờ bật/tắt tính năng ở mức FE — chỉ ẩn UI, KHÔNG xoá code/service phía sau.
 * Đổi giá trị ở đây là bật/tắt được ngay, không cần sửa component.
 */

export const LIVE_SPEAKER_TAGGING_ENABLED = false;

const flagOn = (specific) => {
    const own = process.env[specific];
    if (own !== undefined) return own === 'true';
    return process.env.REACT_APP_VISITOR_REPORT_MOCK === 'true';
};
export const VISITOR_MOCK_ENABLED = flagOn('REACT_APP_VISITOR_MOCK');
export const REPORT_MOCK_ENABLED = flagOn('REACT_APP_REPORT_MOCK');
/** Dải "dữ liệu minh họa" hiện khi còn ít nhất một phân hệ dùng dữ liệu giả. */
export const ANY_DEMO_DATA = VISITOR_MOCK_ENABLED || REPORT_MOCK_ENABLED;
