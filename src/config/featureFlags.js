/**
 * Cờ bật/tắt tính năng ở mức FE — chỉ ẩn UI, KHÔNG xoá code/service phía sau.
 * Đổi giá trị ở đây là bật/tắt được ngay, không cần sửa component.
 */

/**
 * Gán (gắn thẻ) người nói NGAY TRONG lúc họp — gồm 2 chỗ dùng chung cơ chế này:
 *   1. `StationRecorder` — nút "Gắn thẻ người nói" khi đang ghi âm bằng mic của máy
 *      (mốc offset gửi kèm lúc upload qua `uploadStationSpeakerMarks`).
 *   2. `InMeetingRoom` (GA-32) — khối "Người đang nói" khi đang ghi hình camera
 *      (`createLiveSpeakerTag`), cùng mốc t=0 `startRecordingMarker` (GA-30) mà
 *      cơ chế live tag này phụ thuộc vào.
 *
 * TẮT (false) từ 2026-08-25 theo yêu cầu: gán người nói trong lúc họp chưa hiệu quả
 * trên thực tế. Toàn bộ code/handler/API service được GIỮ NGUYÊN — chỉ không render
 * UI và không gọi API nữa; đổi lại thành `true` là chạy lại như cũ.
 *
 * KHÔNG ảnh hưởng tới việc gán người nói SAU cuộc họp (`SpeakerMappingModal` /
 * `TranscriptViewer`) — luồng đó neo theo `recording_sessions.started_at`, độc lập
 * hoàn toàn với mốc live ở trên và vẫn hoạt động bình thường.
 */
export const LIVE_SPEAKER_TAGGING_ENABLED = false;

/**
 * Phân hệ Khách đến làm việc (2.10) và Trung tâm báo cáo (2.13): hai cờ độc lập.
 * BẬT (mặc định): service đọc dữ liệu giả ở `src/mocks/visitorReport`.
 * `REACT_APP_VISITOR_MOCK=false` → phân hệ Khách gọi BE thật; `REACT_APP_REPORT_MOCK=false` → Báo cáo gọi BE thật.
 * Cờ cũ `REACT_APP_VISITOR_REPORT_MOCK=false` vẫn tắt cả hai khi cờ riêng không được đặt.
 */
const flagOff = (specific) => {
    const own = process.env[specific];
    if (own !== undefined) return own === 'false';
    return process.env.REACT_APP_VISITOR_REPORT_MOCK === 'false';
};
export const VISITOR_MOCK_ENABLED = !flagOff('REACT_APP_VISITOR_MOCK');
export const REPORT_MOCK_ENABLED = !flagOff('REACT_APP_REPORT_MOCK');
/** Dải "dữ liệu minh họa" hiện khi còn ít nhất một phân hệ dùng dữ liệu giả. */
export const ANY_DEMO_DATA = VISITOR_MOCK_ENABLED || REPORT_MOCK_ENABLED;
