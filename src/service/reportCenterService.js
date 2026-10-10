// src/service/reportCenterService.js
// Hợp đồng API Trung tâm báo cáo và lịch gửi (2.13) — spec §6.4.
// Cờ mock bật: đọc dữ liệu giả. Cờ tắt: gọi BE thật qua utils/request.
import { get, post, patch, dele, buildQuery } from '../utils/request';
import { REPORT_MOCK_ENABLED } from '../config/featureFlags';
import * as mock from '../mocks/visitorReport/reportApi';
import { runExport } from '../mocks/visitorReport/exporters';

const delay = () =>
    new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 0 : 200 + Math.random() * 300));

// BE thật: request() ném đối tượng lỗi khi HTTP ≥ 400 hoặc mất kết nối. Trang chỉ biết đọc { success, message },
// nên quy về cùng dạng để hiện khối lỗi thay vì quay "Đang tải…" mãi.
const safeReal = async (realFn) => {
    try {
        return await realFn();
    } catch (error) {
        return { success: false, message: error?.message || error?.error?.message || 'Không kết nối được máy chủ' };
    }
};

const call = async (mockFn, realFn) => {
    if (!REPORT_MOCK_ENABLED) return safeReal(realFn);
    await delay();
    try {
        return { success: true, data: mockFn() };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

// buildQuery đã kèm dấu '?' khi có tham số.
const qs = (params) => buildQuery(params || {});

export const getReportCatalog = () => call(() => mock.getReportCatalog(), () => get('/reports/catalog'));
export const getReportLookups = () => call(() => mock.getReportLookups(), () => get('/reports/lookups'));
export const getReportPreview = (type, params) =>
    call(() => mock.getReportPreview(type, params), () => get(`/reports/${type}/preview${qs(params)}`));

// ---------- Lịch gửi báo cáo ----------

export const listSchedules = () => call(() => mock.listSchedules(), () => get('/report-schedules'));
export const createSchedule = (payload) => call(() => mock.createSchedule(payload), () => post('/report-schedules', payload));
export const updateSchedule = (id, payload) => call(() => mock.updateSchedule(id, payload), () => patch(`/report-schedules/${id}`, payload));
export const toggleSchedule = (id, enabled) => call(() => mock.toggleSchedule(id, enabled), () => patch(`/report-schedules/${id}`, { enabled }));
export const duplicateSchedule = (id) => call(() => mock.duplicateSchedule(id), () => post(`/report-schedules/${id}/duplicate`));
export const deleteSchedule = (id) => call(() => mock.deleteSchedule(id), () => dele(`/report-schedules/${id}`));
export const runScheduleNow = (id) => call(() => mock.runScheduleNow(id), () => post(`/report-schedules/${id}/run-now`));
export const listScheduleRuns = (params) => call(() => mock.listScheduleRuns(params), () => get(`/report-schedule-runs${qs(params)}`));
export const retryScheduleRun = (id) => call(() => mock.retryScheduleRun(id), () => post(`/report-schedule-runs/${id}/retry`));

// ---------- Xuất file ----------

const POPUP_BLOCKED = 'Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.';

// Chế độ giả: tạo file ngay trên trình duyệt. BE thật dùng luồng job như ExportReportModal.
const exportInBrowser = (prepared, format) => {
    if (!runExport(format, prepared.model, prepared.fileName)) throw new Error(POPUP_BLOCKED);
    mock.recordExport(prepared.record);
    return { fileName: prepared.fileName, format };
};

// Chế độ thật: tạo job (202) → hỏi /background-jobs/:id mỗi 2 giây (tối đa 2 phút) → mở liên kết tải đã ký.
// Dùng chung luồng với ExportReportModal. Hàm chờ tách riêng, nhận `sleep` để test không phải đợi.
const POLL_MS = 2000;
const POLL_MAX_MS = 120000;
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForExportJob = async (jobId, { sleep = realSleep, intervalMs = POLL_MS, maxMs = POLL_MAX_MS } = {}) => {
    for (let waited = 0; waited <= maxMs; waited += intervalMs) {
        const res = await get(`/background-jobs/${jobId}`);
        if (!res?.success) return res || { success: false, message: 'Không kiểm tra được tiến trình xuất báo cáo' };
        if (res.data.status === 'completed') return { success: true, data: res.data };
        if (res.data.status === 'failed') return { success: false, message: res.data.errorMessage || 'Xuất báo cáo thất bại' };
        await sleep(intervalMs);
    }
    return { success: false, message: 'Quá thời gian chờ tạo file. Vui lòng thử lại hoặc thu hẹp kỳ báo cáo.' };
};

const openSignedUrl = (url) => {
    if (typeof window !== 'undefined' && url) window.open(url, '_blank');
};

const realExport = async (type, params) => {
    const created = await post(`/reports/center/${type}/exports`, params);
    if (!created?.success) return created;
    const job = await waitForExportJob(created.data.jobId);
    if (!job.success) return job;
    const file = await get(`/media-files/${job.data.outputFileId}`);
    if (!file?.success || !file.data?.downloadUrl) return { success: false, message: file?.message || 'Không tạo được liên kết tải xuống' };
    openSignedUrl(file.data.downloadUrl);
    return { success: true, data: { fileName: job.data.result?.fileName || file.data.fileName || `${type}.${params?.format}`, format: params?.format } };
};

export const exportReport = (type, params) =>
    call(() => exportInBrowser(mock.prepareExport(type, params), params?.format), () => realExport(type, params));

const realDownloadRunFile = async (runId, format) => {
    const res = await get(`/report-schedule-runs/${runId}/files/${format}`);
    if (!res?.success) return res;
    openSignedUrl(res.data.downloadUrl);
    return { success: true, data: { fileName: res.data.fileName, format } };
};

export const downloadRunFile = (runId, format) =>
    call(() => exportInBrowser(mock.prepareRunFile(runId, format), format), () => realDownloadRunFile(runId, format));

export const getRecentExports = () => call(() => mock.getRecentExports(), () => get('/reports/exports/recent'));
