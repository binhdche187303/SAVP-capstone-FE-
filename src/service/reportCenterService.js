// src/service/reportCenterService.js
// Hợp đồng API Trung tâm báo cáo và lịch gửi (2.13) — spec §6.4.
// Cờ mock bật: đọc dữ liệu giả. Cờ tắt: gọi BE thật qua utils/request.
import { get, post, patch, dele, buildQuery } from '../utils/request';
import { VISITOR_REPORT_MOCK_ENABLED } from '../config/featureFlags';
import * as mock from '../mocks/visitorReport/reportApi';
import { runExport } from '../mocks/visitorReport/exporters';

const delay = () =>
    new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 0 : 200 + Math.random() * 300));

const call = async (mockFn, realFn) => {
    if (!VISITOR_REPORT_MOCK_ENABLED) return realFn();
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

export const exportReport = (type, params) =>
    call(() => exportInBrowser(mock.prepareExport(type, params), params?.format), () => post(`/reports/${type}/exports`, params));

export const downloadRunFile = (runId, format) =>
    call(() => exportInBrowser(mock.prepareRunFile(runId, format), format), () => get(`/report-schedule-runs/${runId}/files/${format}`));

export const getRecentExports = () => call(() => mock.getRecentExports(), () => get('/reports/exports/recent'));
