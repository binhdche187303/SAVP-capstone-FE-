import { get, post, put } from '../utils/request';

// ============================================================
// Đồng bộ dữ liệu API Đào tạo UEL (BE module uel-sync, quyền admin.manage_config)
// ============================================================

/** Các bước theo đúng thứ tự phụ thuộc của BE. */
export const UEL_SYNC_STEPS = [
    { key: 'departments', label: 'Đơn vị', hint: 'Phòng ban, khoa, đơn vị cha, trưởng đơn vị' },
    { key: 'staff', label: 'Cán bộ', hint: 'Họ tên, email, đơn vị, quản lý trực tiếp, nghỉ việc' },
    { key: 'students', label: 'Sinh viên', hint: 'Theo lớp sinh hoạt' },
    { key: 'sections', label: 'Lớp học phần', hint: 'Cần năm học + học kỳ' },
    { key: 'enrollments', label: 'Đăng ký học phần', hint: 'Cần năm học + học kỳ' },
    { key: 'sessions', label: 'Lịch học', hint: 'Cần khoảng ngày + bảng giờ tiết' },
];

export const stepLabel = (key) => UEL_SYNC_STEPS.find((s) => s.key === key)?.label ?? key;

/** GET /uel-sync/status — đã cấu hình API chưa, lịch tự động, cài đặt, lượt gần nhất. */
export const getUelSyncStatus = async () => (await get('/uel-sync/status')).data;

/** GET /uel-sync/runs — lịch sử các lượt, mới nhất trước. */
export const getUelSyncRuns = async (limit = 20) => (await get(`/uel-sync/runs?limit=${limit}`)).data;

/**
 * POST /uel-sync/run — chạy nền. 400 khi thiếu tham số, 409 khi đang có lượt khác.
 * @param {{steps?: string[], namHoc?: string, hocKy?: string, fromDate?: string, toDate?: string}} payload
 */
export const runUelSync = async (payload) => (await post('/uel-sync/run', payload)).data;

export const getUelSyncSettings = async () => (await get('/uel-sync/settings')).data;

/** PUT /uel-sync/settings — { namHoc, hocKy, sessionDaysAhead } */
export const updateUelSyncSettings = async (payload) => (await put('/uel-sync/settings', payload)).data;

/** GET /uel-sync/periods — [{ periodNo, startTime 'HH:mm', endTime 'HH:mm' }] */
export const getStudyPeriods = async () => (await get('/uel-sync/periods')).data;

/** PUT /uel-sync/periods — thay toàn bộ bảng giờ tiết. */
export const replaceStudyPeriods = async (periods) => (await put('/uel-sync/periods', { periods })).data;
