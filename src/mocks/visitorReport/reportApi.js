// src/mocks/visitorReport/reportApi.js
// Cài đặt giả cho API Trung tâm báo cáo (spec §4.2, §6.4): danh mục, xem trước, lịch gửi, lần chạy.
// Mỗi hàm trả thẳng dữ liệu hoặc ném Error; `reportCenterService` bọc thành { success, data }.
import { loadState, saveState } from './store';
import { buildReport, getLookups } from './reportData';
import { normalizeText, localYmd } from './visitorApi';
import { computeNextRun, resolvePeriod } from './scheduleNextRun';
import { buildExportModel, buildFileName } from './exporters';
import { REPORT_TYPES, getReportDefinition } from '../../config/reportDefinitions';

const fail = (message) => {
    throw new Error(message);
};

const requireDefinition = (type) => getReportDefinition(type) || fail('Loại báo cáo không tồn tại');

const compareValues = (a, b) => {
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'vi');
};

// Báo cáo đầy đủ (chưa tìm kiếm, sắp xếp, phân trang) — dùng chung cho xem trước và xuất file.
export const buildFullReport = (type, params, state, now) => {
    const definition = requireDefinition(type);
    return { definition, report: buildReport(type, params || {}, state, now, definition) };
};

export const getReportCatalog = () => {
    const state = loadState();
    return REPORT_TYPES.map((type) => {
        const definition = getReportDefinition(type);
        const exportsOfType = state.exports.filter((e) => e.reportType === type);
        return {
            type,
            title: definition.title,
            description: definition.description,
            activeSchedules: state.schedules.filter((s) => s.enabled && s.reportType === type).length,
            lastExportAt: exportsOfType.reduce((latest, e) => (!latest || e.createdAt > latest ? e.createdAt : latest), null),
        };
    });
};

export const getReportLookups = () => getLookups(loadState());

export const getReportPreview = (type, params = {}) => {
    const now = new Date();
    const { definition, report } = buildFullReport(type, params, loadState(now), now);

    let { rows } = report;
    const needle = normalizeText(params.q).trim();
    if (needle) {
        const textKeys = definition.columns.filter((c) => c.format === 'text').map((c) => c.key);
        rows = rows.filter((row) => textKeys.some((key) => normalizeText(row[key]).includes(needle)));
    }
    if (params.sortKey && definition.columns.some((c) => c.key === params.sortKey)) {
        const direction = params.sortDir === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => compareValues(a[params.sortKey], b[params.sortKey]) * direction);
    }

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    return {
        kpis: report.kpis,
        charts: report.charts,
        rows: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
    };
};

// ---------- Lịch gửi báo cáo (BR-S1 … BR-S6) ----------

const PERIODS = ['yesterday', 'last_week', 'last_month'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const FORMATS = ['pdf', 'xlsx', 'docx'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const titleOf = (type) => getReportDefinition(type)?.title || type;

export const validateSchedule = (payload) => {
    const p = payload || {};
    if (!String(p.name || '').trim()) fail('Vui lòng nhập tên lịch gửi');
    if (!REPORT_TYPES.includes(p.reportType)) fail('Loại báo cáo không tồn tại');
    if (!PERIODS.includes(p.period)) fail('Kỳ dữ liệu không hợp lệ');
    if (!FREQUENCIES.includes(p.frequency)) fail('Tần suất không hợp lệ');
    if (!TIME_PATTERN.test(String(p.time || ''))) fail('Giờ gửi không hợp lệ');
    if (p.frequency === 'weekly' && !(Number.isInteger(p.dayOfWeek) && p.dayOfWeek >= 0 && p.dayOfWeek <= 6)) {
        fail('Vui lòng chọn thứ trong tuần');
    }
    if (p.frequency === 'monthly' && p.dayOfMonth !== 'last' && !(Number.isInteger(p.dayOfMonth) && p.dayOfMonth >= 1 && p.dayOfMonth <= 28)) {
        fail('Ngày trong tháng phải từ 1 đến 28 hoặc ngày cuối tháng');
    }
    if (!Array.isArray(p.formats) || p.formats.length === 0 || p.formats.some((f) => !FORMATS.includes(f))) {
        fail('Vui lòng chọn ít nhất một định dạng');
    }
    const recipients = Array.isArray(p.recipients) ? p.recipients : [];
    if (recipients.length === 0) fail('Cần ít nhất 1 người nhận');
    if (recipients.length > 20) fail('Tối đa 20 người nhận');
    const badEmail = recipients.find((r) => r.type === 'email' && !EMAIL_PATTERN.test(String(r.value || '')));
    if (badEmail) fail(`Email không hợp lệ: ${badEmail.value}`);
};

const scheduleFields = (p) => ({
    name: String(p.name).trim(),
    reportType: p.reportType,
    filters: { ...(p.filters || {}) },
    period: p.period,
    frequency: p.frequency,
    time: p.time,
    dayOfWeek: p.frequency === 'weekly' ? p.dayOfWeek : null,
    dayOfMonth: p.frequency === 'monthly' ? p.dayOfMonth : null,
    formats: [...p.formats],
    recipients: p.recipients.map((r) => ({ type: r.type, value: r.value, label: r.label || r.value })),
    subject: String(p.subject || '').trim(),
    message: String(p.message || '').trim(),
    enabled: p.enabled !== false,
});

const scheduleView = (schedule, now) => ({
    ...schedule,
    reportTitle: titleOf(schedule.reportType),
    nextRunAt: computeNextRun(schedule, now)?.toISOString() ?? null,
});

const runView = (run) => ({ ...run, reportTitle: titleOf(run.reportType) });

const findSchedule = (state, id) => state.schedules.find((s) => s.id === id) || fail('Không tìm thấy lịch gửi');

const withState = (fn) => {
    const now = new Date();
    const state = loadState(now);
    const result = fn(state, now);
    saveState(state);
    return result;
};

export const listSchedules = () => {
    const now = new Date();
    return [...loadState(now).schedules]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((s) => scheduleView(s, now));
};

export const createSchedule = (payload) =>
    withState((state, now) => {
        validateSchedule(payload);
        const schedule = {
            id: `sch-u-${now.getTime()}-${state.schedules.length}`,
            ...scheduleFields(payload),
            lastRunAt: null,
            createdAt: now.toISOString(),
            userTouched: true,
        };
        state.schedules.unshift(schedule);
        return scheduleView(schedule, now);
    });

export const updateSchedule = (id, payload) =>
    withState((state, now) => {
        const schedule = findSchedule(state, id);
        validateSchedule(payload);
        Object.assign(schedule, scheduleFields(payload), { userTouched: true });
        return scheduleView(schedule, now);
    });

export const toggleSchedule = (id, enabled) =>
    withState((state, now) => {
        const schedule = findSchedule(state, id);
        schedule.enabled = Boolean(enabled);
        schedule.userTouched = true;
        return scheduleView(schedule, now);
    });

export const duplicateSchedule = (id) =>
    withState((state, now) => {
        const source = findSchedule(state, id);
        const copy = {
            ...JSON.parse(JSON.stringify(source)),
            id: `sch-u-${now.getTime()}-${state.schedules.length}`,
            name: `${source.name} (bản sao)`,
            enabled: false,
            lastRunAt: null,
            createdAt: now.toISOString(),
            userTouched: true,
        };
        state.schedules.unshift(copy);
        return scheduleView(copy, now);
    });

export const deleteSchedule = (id) =>
    withState((state) => {
        findSchedule(state, id);
        state.schedules = state.schedules.filter((s) => s.id !== id);
        return { deleted: true };
    });

const newRun = (state, now, fields) => {
    const run = {
        id: `run-u-${now.getTime()}-${state.runs.length}`,
        trigger: 'manual',
        status: 'success',
        error: null,
        ranAt: now.toISOString(),
        retriedByRunId: null,
        userTouched: true,
        ...fields,
    };
    state.runs.unshift(run);
    return run;
};

// BR-S5: gửi thử không làm đổi lần chạy kế tiếp.
export const runScheduleNow = (id) =>
    withState((state, now) => {
        const schedule = findSchedule(state, id);
        const run = newRun(state, now, {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            reportType: schedule.reportType,
            ...resolvePeriod(schedule.period, now),
            formats: [...schedule.formats],
            recipientCount: schedule.recipients.length,
        });
        schedule.lastRunAt = run.ranAt;
        schedule.userTouched = true;
        return runView(run);
    });

export const listScheduleRuns = (params = {}) => {
    const { scheduleId, status, from, to, page = 1, limit = 10 } = params;
    const runs = loadState().runs
        .filter((r) => {
            if (scheduleId && r.scheduleId !== scheduleId) return false;
            if (status && r.status !== status) return false;
            const day = localYmd(r.ranAt);
            if (from && day < from) return false;
            return !(to && day > to);
        })
        .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt));
    const start = (Math.max(1, Number(page)) - 1) * Number(limit);
    return { items: runs.slice(start, start + Number(limit)).map(runView), total: runs.length };
};

export const retryScheduleRun = (id) =>
    withState((state, now) => {
        const failed = state.runs.find((r) => r.id === id) || fail('Không tìm thấy lần chạy');
        if (failed.status !== 'failed') fail('Chỉ gửi lại được lần chạy thất bại');
        if (failed.retriedByRunId) fail('Lần chạy này đã được gửi lại');
        const run = newRun(state, now, {
            scheduleId: failed.scheduleId,
            scheduleName: failed.scheduleName,
            reportType: failed.reportType,
            from: failed.from,
            to: failed.to,
            formats: [...failed.formats],
            recipientCount: failed.recipientCount,
        });
        failed.retriedByRunId = run.id;
        failed.userTouched = true;
        return runView(run);
    });

// ---------- Xuất file ----------

// Dựng mô hình xuất với toàn bộ dòng (không phân trang). Chưa ghi lịch sử: service gọi
// recordExport sau khi file thật sự được tạo.
export const prepareExport = (type, params = {}, now = new Date()) => {
    if (!FORMATS.includes(params.format)) fail('Định dạng xuất không hợp lệ');
    const state = loadState(now);
    const { definition, report } = buildFullReport(type, params, state, now);
    const fileName = buildFileName(type, params.from, params.to, params.format);
    return {
        model: buildExportModel({ definition, filters: params, lookups: getLookups(state), report, now }),
        fileName,
        record: {
            id: `exp-u-${now.getTime()}`,
            reportType: type,
            format: params.format,
            from: params.from,
            to: params.to,
            fileName,
            createdAt: now.toISOString(),
            userTouched: true,
        },
    };
};

export const recordExport = (record) =>
    withState((state) => {
        state.exports.unshift(record);
        return record;
    });

export const prepareRunFile = (runId, format) => {
    const state = loadState();
    const run = state.runs.find((r) => r.id === runId) || fail('Không tìm thấy lần chạy');
    if (run.status !== 'success') fail('Lần chạy thất bại không có file để tải');
    if (!run.formats.includes(format)) fail('Lần chạy này không có file ở định dạng đã chọn');
    const filters = state.schedules.find((s) => s.id === run.scheduleId)?.filters || {};
    return prepareExport(run.reportType, { ...filters, from: run.from, to: run.to, format });
};

export const getRecentExports = () =>
    [...loadState().exports]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map((e) => ({ ...e, reportTitle: titleOf(e.reportType) }));
