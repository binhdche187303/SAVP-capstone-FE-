// MOCK-BE: dữ liệu giả cho trang Đồng bộ UEL khi REACT_APP_UEL_SYNC_MOCK=true (chỉ bản dev).
// Giả lập đúng hợp đồng API mới ghi ở docs/MOCK_CHO_BE.md mục "Đồng bộ UEL — 1 nút + tự động".
// Mã/tên ở đây đều là dữ liệu bịa, không phải dữ liệu thật của Trường.

import { nextRunOf } from '../utils/uelSyncSchedule';

const STEP_KEYS = ['departments', 'staff', 'students', 'sections', 'enrollments', 'sessions'];
const STEP_MS = 1800;

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
const fail = (message) => Promise.reject({ error: { message } });
const isoAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const TERMS = [{ namHoc: '2026-2027', hocKy: 'HK01' }, { namHoc: '2026-2027', hocKy: 'HK02' }];

/** Kết quả giả từng bước của một lượt chạy đủ. */
const RESULT_OF = {
    departments: { fetched: 68, upserted: 68, skipped: 0, deactivated: 0 },
    staff: { fetched: 1065, upserted: 1065, skipped: 0, deactivated: 2 },
    students: { fetched: 41230, upserted: 41230, skipped: 3, deactivated: 0, warnings: ['Lớp SV 99TEST01: Trường không trả danh sách sinh viên'] },
    sections: { fetched: 2979, upserted: 2979, skipped: 0, deactivated: 0 },
    enrollments: { fetched: 151880, upserted: 151880, skipped: 12, deactivated: 0, warnings: ['12 đăng ký có mã SV chưa có trong hệ thống — sẽ khớp ở lượt sau'] },
    sessions: {
        fetched: 4310, upserted: 4310, skipped: 0, deactivated: 0,
        warnings: [`${ymd(addDays(3))}: API trả 0 buổi nhưng hệ thống đang có 118 buổi — giữ nguyên, không hủy`],
    },
};

const fullResults = () => STEP_KEYS.map((step) => ({ step, error: null, warnings: [], ...RESULT_OF[step] }));

const PERIOD_STARTS = ['07:00', '07:50', '08:50', '09:40', '10:30', '13:00', '13:50', '14:50', '15:40', '16:30', '17:45', '18:35', '19:25', '20:15', '21:05'];
const plus50 = (hm) => { const [h, m] = hm.split(':').map(Number); const t = h * 60 + m + 50; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

const state = {
    settings: { autoEnabled: true, frequency: 'daily', weekday: 0, time: '02:00', sessionDaysAhead: 14, termMode: 'auto', namHoc: '', hocKy: '' },
    serverAllowed: true,
    periods: PERIOD_STARTS.map((startTime, i) => ({ periodNo: i + 1, startTime, endTime: plus50(startTime) })),
    runs: [
        {
            id: 'mock-2', trigger: 'schedule', mode: 'all', status: 'succeeded', requestedByName: null,
            startedAt: isoAgo(60 * 9), finishedAt: isoAgo(60 * 9 - 18), currentStep: null,
            options: { steps: STEP_KEYS, fromDate: ymd(new Date()), toDate: ymd(addDays(13)), terms: TERMS },
            results: fullResults(),
        },
        {
            id: 'mock-1', trigger: 'manual', mode: 'all', status: 'partial', requestedByName: 'Quản trị viên',
            startedAt: isoAgo(60 * 30), finishedAt: isoAgo(60 * 30 - 7), currentStep: null,
            options: { steps: STEP_KEYS, fromDate: ymd(addDays(-1)), toDate: ymd(addDays(12)), terms: TERMS.slice(0, 1) },
            results: [
                ...fullResults().slice(0, 4),
                { step: 'enrollments', fetched: 0, upserted: 0, skipped: 0, deactivated: 0, error: 'API UEL trả 429 (quá nhiều yêu cầu) — thử lại sau 60 giây', warnings: [] },
                { step: 'sessions', ...RESULT_OF.sessions, error: null, warnings: [] },
            ],
        },
    ],
};

const scheduleOf = () => ({
    enabled: state.settings.autoEnabled && state.serverAllowed,
    serverAllowed: state.serverAllowed,
    nextRunAt: state.serverAllowed ? nextRunOf(state.settings)?.toISOString() ?? null : null,
});

const running = () => state.runs[0]?.status === 'running';

const startMockRun = () => {
    const days = state.settings.sessionDaysAhead;
    const run = {
        id: `mock-${Date.now()}`, trigger: 'manual', mode: 'all', status: 'running', requestedByName: 'Quản trị viên',
        startedAt: new Date().toISOString(), finishedAt: null, currentStep: STEP_KEYS[0],
        options: {
            steps: STEP_KEYS, fromDate: ymd(new Date()), toDate: ymd(addDays(days - 1)),
            terms: state.settings.termMode === 'fixed' ? [{ namHoc: state.settings.namHoc, hocKy: state.settings.hocKy }] : [],
        },
        results: [],
    };
    state.runs.unshift(run);
    STEP_KEYS.forEach((step, i) => {
        setTimeout(() => {
            run.results.push({ step, error: null, warnings: [], ...RESULT_OF[step] });
            // Sau bước Sinh viên, BE đọc TKB toàn trường N ngày tới để tự nhận học kỳ.
            if (step === 'students' && !run.options.terms.length) run.options.terms = TERMS;
            run.currentStep = STEP_KEYS[i + 1] ?? null;
            if (!run.currentStep) {
                run.status = 'succeeded';
                run.finishedAt = new Date().toISOString();
            }
        }, STEP_MS * (i + 1));
    });
    return run;
};

export const uelSyncMock = {
    async getStatus() {
        await wait();
        return clone({
            configured: true, running: running(), settings: state.settings, schedule: scheduleOf(),
            periodCount: state.periods.length, lastRun: state.runs[0] ?? null,
        });
    },
    async getRuns(limit = 20) {
        await wait();
        return clone(state.runs.slice(0, limit));
    },
    async runAll() {
        await wait();
        if (running()) return fail('Đang có một lượt đồng bộ chạy.');
        return clone({ accepted: true, run: startMockRun() });
    },
    async updateSettings(payload) {
        await wait(400);
        if (payload.termMode === 'fixed' && (!payload.namHoc || !payload.hocKy)) return fail('Chỉ định học kỳ thì cần nhập năm học và học kỳ.');
        state.settings = { ...state.settings, ...payload };
        return clone(state.settings);
    },
    async getPeriods() {
        await wait();
        return clone(state.periods);
    },
    async replacePeriods(periods) {
        await wait(400);
        state.periods = clone(periods);
        return clone(state.periods);
    },
    async lookup({ type, code }) {
        await wait(600);
        const rows = {
            staff: [{ ma_nhan_su: code, ho_ten: 'Nguyễn Văn A', ten_phong_ban: 'Khoa Kinh tế', email: 'a@example.edu.vn' }],
            student: [{ ma_sinh_vien: code, ho_ten: 'Trần Thị B', lop: 'K26TEST01', khoa_hoc: 'K26' }],
            studentEnrollments: [{ ma_lop_hoc_phan: '261TEST0101', ten_hoc_phan: 'Học phần mẫu', so_tin_chi: 3, nam_hoc: '2026-2027', hoc_ky: 'HK01' }],
            lecturerDay: [{ ma_lop_hoc_phan: '261TEST0101', ten_hoc_phan: 'Học phần mẫu', tiet_bat_dau: 1, so_tiet: 3, ma_phong_hoc: 'A.101' }],
            studentDay: [{ ma_lop_hoc_phan: '261TEST0101', ten_hoc_phan: 'Học phần mẫu', tiet_bat_dau: 1, so_tiet: 3, ma_phong_hoc: 'A.101' }],
            session: [{ ma_sinh_vien: 'K260000001', ho_ten: 'Lê Văn C' }, { ma_sinh_vien: 'K260000002', ho_ten: 'Phạm Thị D' }],
        }[type] ?? [];
        return { items: rows, total: rows.length, truncated: false, api: `(xem trước) ${type}` };
    },
};
