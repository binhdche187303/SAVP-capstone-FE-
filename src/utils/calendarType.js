// Loại lịch tuần UEL: BE lưu UNIT | SCHOOL_LEADERSHIP | SCHOOL_OTHER,
// FE dùng khoá ngắn của CALENDAR_TYPES (unit | leadership | other).
const API_TO_KEY = { UNIT: 'unit', SCHOOL_LEADERSHIP: 'leadership', SCHOOL_OTHER: 'other' };
const KEY_TO_API = { unit: 'UNIT', leadership: 'SCHOOL_LEADERSHIP', other: 'SCHOOL_OTHER' };

/** Giá trị BE -> khoá FE; giữ nguyên nếu đã là khoá FE (dữ liệu mock). */
export const toCalendarTypeKey = (value) => (value ? API_TO_KEY[value] || value : value);

/** Khoá FE -> giá trị BE; bỏ qua khoá không hợp lệ. */
export const toCalendarTypeApi = (key) => KEY_TO_API[key] || null;
