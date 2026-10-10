// src/service/visitorService.js
// Hợp đồng API phân hệ Khách đến làm việc (2.10) — spec §6.4.
// Cờ mock bật: đọc dữ liệu giả. Cờ tắt: gọi BE thật qua utils/request.
import { get, post, buildQuery } from '../utils/request';
import { VISITOR_MOCK_ENABLED } from '../config/featureFlags';
import * as mock from '../mocks/visitorReport/visitorApi';

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
    if (!VISITOR_MOCK_ENABLED) return safeReal(realFn);
    await delay();
    try {
        return { success: true, data: mockFn() };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

// buildQuery đã kèm dấu '?' khi có tham số.
const qs = (params) => buildQuery(params || {});

export const getVisitorLookups = () => call(() => mock.getVisitorLookups(), () => get('/visitors/lookups'));
// Trang đăng ký công khai chưa có đăng nhập nên không được gọi /visitors/lookups (cần JWT).
export const getPublicPurposes = () => call(() => ({ purposes: mock.getVisitorLookups().purposes }), () => get('/public/visitor-purposes'));
export const searchHosts = (q) => call(() => mock.searchHosts(q), () => get(`/public/visitor-hosts${qs({ q })}`));
export const getPublicHost = (id) => call(() => mock.getPublicHost(id), () => get(`/public/visitor-hosts/${encodeURIComponent(id)}`));
export const createPublicRegistration = (payload) => call(() => mock.createPublicRegistration(payload), () => post('/public/visitor-registrations', payload));
export const getPublicRegistration = (code) => call(() => mock.getPublicRegistration(code), () => get(`/public/visitor-registrations/${encodeURIComponent(code)}`));
export const listVisits = (params) => call(() => mock.listVisits(params), () => get(`/visitors/visits${qs(params)}`));
export const getVisit = (id) => call(() => mock.getVisit(id), () => get(`/visitors/visits/${id}`));
export const listVisitsOfVisitor = (id) => call(() => mock.listVisitsOfVisitor(id), () => get(`/visitors/visits/${id}/related`));
export const createVisit = (payload) => call(() => mock.createVisit(payload), () => post('/visitors/visits', payload));
export const approveVisit = (id, body) => call(() => mock.approveVisit(id, body), () => post(`/visitors/visits/${id}/approve`, body));
export const rejectVisit = (id, body) => call(() => mock.rejectVisit(id, body), () => post(`/visitors/visits/${id}/reject`, body));
export const cancelVisit = (id) => call(() => mock.cancelVisit(id), () => post(`/visitors/visits/${id}/cancel`));
export const revokeVisit = (id, body) => call(() => mock.revokeVisit(id, body), () => post(`/visitors/visits/${id}/revoke`, body));
export const extendVisit = (id, body) => call(() => mock.extendVisit(id, body), () => post(`/visitors/visits/${id}/extend`, body));
export const attachVisitorPhoto = (id, body) => call(() => mock.attachVisitorPhoto(id, body), () => post(`/visitors/visits/${id}/photo`, body));
export const verifyFaceAtGate = (id, body) => call(() => mock.verifyFaceAtGate(id, body), () => Promise.resolve({ success: false, message: 'Nhận diện khuôn mặt do camera thực hiện, không gọi tay được' }));
export const checkInVisit = (id, body) => call(() => mock.checkInVisit(id, body), () => post(`/visitors/visits/${id}/check-in`, body));
export const checkOutVisit = (id) => call(() => mock.checkOutVisit(id), () => post(`/visitors/visits/${id}/check-out`));
export const closeVisitManually = (id, body) => call(() => mock.closeVisitManually(id, body), () => post(`/visitors/visits/${id}/close-manual`, body));
export const scanAtGate = (code, body) => call(() => mock.scanAtGate(code, body), () => post('/dev/mock-visitor-scan', { ...body, code }));
export const getDeskToday = () => call(() => mock.getDeskToday(), () => get('/visitors/desk/today'));
export const getMyVisits = () => call(() => mock.getMyVisits(), () => get('/visitors/my-visits'));
export const getMyNotifications = () => call(() => mock.getMyNotifications(), () => get('/visitors/my-notifications'));
export const markMyNotificationsRead = () => call(() => mock.markMyNotificationsRead(), () => post('/visitors/my-notifications/read'));
export const getVisitorStats = (params) => call(() => mock.getVisitorStats(params), () => get(`/visitors/stats${qs(params)}`));
export const resetDemoData = () => call(() => mock.resetDemoData(), () => Promise.resolve({ success: false, message: 'Chỉ dùng ở chế độ dữ liệu giả' }));
