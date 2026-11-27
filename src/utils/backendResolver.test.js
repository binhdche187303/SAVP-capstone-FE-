// setupTests.js mock backendResolver cho mọi test khác — ở đây cần bản thật.
jest.unmock('./backendResolver');

const ENV_KEYS = [
    'REACT_APP_API_BASE_URL',
    'REACT_APP_WS_URL',
    'REACT_APP_API_BASE_URL_BACKUP',
    'REACT_APP_WS_URL_BACKUP',
    'REACT_APP_DEVICE_CALLBACK_BASE_URL',
    'REACT_APP_DEVICE_CALLBACK_PORT',
];
const saved = {};

/** Nạp lại module với env + kết quả ping /health tuỳ chọn. */
const load = async (env, { healthOk = true } = {}) => {
    ENV_KEYS.forEach((k) => delete process.env[k]);
    Object.assign(process.env, env);
    global.fetch = jest.fn(() => (healthOk
        ? Promise.resolve({ ok: true })
        : Promise.reject(new Error('down'))));
    let mod;
    jest.isolateModules(() => {
        mod = require('./backendResolver');
    });
    await mod.backendReady;
    return mod;
};

beforeAll(() => ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; }));
beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});
afterAll(() => ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
}));

// jsdom chạy ở http://localhost (không có port).
describe('chế độ cùng địa chỉ (REACT_APP_API_BASE_URL=/api/v1)', () => {
    it('ghép API + WS với địa chỉ trình duyệt đang mở', async () => {
        const m = await load({ REACT_APP_API_BASE_URL: '/api/v1' });
        expect(m.SAME_ORIGIN_MODE).toBe(true);
        expect(m.getApiBaseUrl()).toBe('http://localhost/api/v1');
        expect(m.getWsBaseUrl()).toBe('http://localhost');
        expect(global.fetch).toHaveBeenCalledWith('http://localhost/api/v1/health', expect.any(Object));
    });

    it('backend chập chờn → vẫn ở địa chỉ hiện tại, KHÔNG nhảy sang domain mặc định', async () => {
        const m = await load({ REACT_APP_API_BASE_URL: '/api/v1' }, { healthOk: false });
        expect(m.getApiBaseUrl()).toBe('http://localhost/api/v1');
        expect(m.getWsBaseUrl()).toBe('http://localhost');
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('địa chỉ cho camera trỏ thẳng cổng 3000 của cùng máy', async () => {
        const m = await load({ REACT_APP_API_BASE_URL: '/api/v1' });
        expect(m.getDeviceCallbackBaseUrl()).toBe('http://localhost:3000/api/v1');
    });

    it('đổi được cổng / địa chỉ camera', async () => {
        let m = await load({ REACT_APP_API_BASE_URL: '/api/v1', REACT_APP_DEVICE_CALLBACK_PORT: '8080' });
        expect(m.getDeviceCallbackBaseUrl()).toBe('http://localhost:8080/api/v1');
        m = await load({ REACT_APP_API_BASE_URL: '/api/v1', REACT_APP_DEVICE_CALLBACK_BASE_URL: 'http://10.0.0.5:3000/api/v1/' });
        expect(m.getDeviceCallbackBaseUrl()).toBe('http://10.0.0.5:3000/api/v1');
    });

    it('vẫn cho khai WS riêng nếu cần', async () => {
        const m = await load({ REACT_APP_API_BASE_URL: '/api/v1', REACT_APP_WS_URL: 'https://ws.example.vn' });
        expect(m.getWsBaseUrl()).toBe('https://ws.example.vn');
    });
});

describe('chế độ cũ (URL đầy đủ) — hành vi giữ nguyên', () => {
    const ENV = {
        REACT_APP_API_BASE_URL: 'https://api.example.vn/api/v1',
        REACT_APP_WS_URL: 'https://api.example.vn',
        REACT_APP_API_BASE_URL_BACKUP: 'https://backup.example.vn/api/v1',
        REACT_APP_WS_URL_BACKUP: 'https://backup.example.vn',
    };

    it('dùng đúng URL khai báo, camera dùng chung URL API', async () => {
        const m = await load(ENV);
        expect(m.SAME_ORIGIN_MODE).toBe(false);
        expect(m.getApiBaseUrl()).toBe('https://api.example.vn/api/v1');
        expect(m.getWsBaseUrl()).toBe('https://api.example.vn');
        expect(m.getDeviceCallbackBaseUrl()).toBe('https://api.example.vn/api/v1');
    });

    it('CHÍNH chết → chuyển sang BACKUP như trước', async () => {
        const m = await load(ENV, { healthOk: false });
        expect(m.getApiBaseUrl()).toBe('https://backup.example.vn/api/v1');
        expect(m.getWsBaseUrl()).toBe('https://backup.example.vn');
        expect(console.warn).toHaveBeenCalled();
    });

    it('không khai gì → domain production mặc định', async () => {
        const m = await load({});
        expect(m.getApiBaseUrl()).toBe('https://api.smartracking.io.vn/api/v1');
        expect(m.getWsBaseUrl()).toBe('https://api.smartracking.io.vn');
    });
});
