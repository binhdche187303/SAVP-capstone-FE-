// src/mocks/visitorReport/visitorApi.js
// Cài đặt giả cho API phân hệ Khách đến làm việc (spec §4.1, §6.4).
// Mỗi hàm trả thẳng dữ liệu hoặc ném Error; `visitorService` bọc thành { success, data }.
import { loadState, saveState, resetState, getCurrentActor } from './store';
import { ME_HOST_ID, PURPOSES, pad, ymdCompact, zoneOfBuilding } from './seed';
import {
    nextStatus, canExtend, isOverstay, shouldExpire, defaultAccessWindow,
    evaluateGateAttempt, availableActions, isOnSite, overstayLevel, shouldMarkExitUnrecorded,
} from './visitStateMachine';
import { hashSeed, mulberry32 } from './prng';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MAIN_GATE = 'zone-gate-main';
const CLOSED_STATUSES = ['rejected', 'cancelled', 'revoked', 'expired', 'exit_unrecorded'];
// Thao tác do hệ thống tự làm, không hiện thành nút cho người dùng.
const SYSTEM_ACTIONS = ['expire', 'mark_unrecorded'];
const ATTENTION_ORDER = ['must_leave', 'overstay', 'exit_unrecorded', 'manual_review', 'no_photo'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GATE_REASON_NOTES = {
    outside_window: 'Ngoài khung giờ được cấp',
    zone_not_allowed: 'Khu vực không được phép',
    low_score: 'Độ khớp khuôn mặt dưới ngưỡng 80%',
    no_photo: 'Chưa có ảnh khuôn mặt',
    access_revoked: 'Quyền ra vào đã bị thu hồi',
};

const fail = (message) => {
    throw new Error(message);
};

export const normalizeText = (text) =>
    String(text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();

export const localYmd = (value) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addEvent = (visit, type, extra = {}) => {
    visit.events.push({ at: new Date().toISOString(), type, note: null, zoneId: null, score: null, actor: null, ...extra });
};

const notify = (state, visit, type, message, now) => {
    state.notifications.unshift({
        id: `n-${type}-${visit.id}-${now.getTime()}-${state.notifications.length}`,
        hostId: visit.hostId,
        visitId: visit.id,
        type,
        message,
        createdAt: now.toISOString(),
        read: false,
        userTouched: true,
    });
};

// BR-V9 + BR-V7: lượt quá hiệu lực mà chưa đến thì hết hạn; lượt quá giờ báo người được gặp một lần.
const sweep = (state, now) => {
    let changed = false;
    state.visits.forEach((visit) => {
        if (shouldExpire(visit, now)) {
            visit.status = 'expired';
            addEvent(visit, 'expired', { at: visit.access.validTo });
            addEvent(visit, 'face_removed', { at: visit.access.validTo });
            changed = true;
        } else if (shouldMarkExitUnrecorded(visit, now)) {
            visit.status = 'exit_unrecorded';
            addEvent(visit, 'exit_unrecorded', { note: 'Hết ngày vẫn chưa ghi nhận khách ra' });
            changed = true;
        } else if (isOverstay(visit, now)) {
            if (!visit.overstayNotified) {
                visit.overstayNotified = true;
                notify(state, visit, 'visitor_overstay', `${visit.visitor.fullName} đã quá giờ được cấp và vẫn trong khuôn viên`, now);
                changed = true;
            }
            // BR-V13 mức 2: quá 30 phút thì báo bảo vệ.
            if (overstayLevel(visit, now) === 2 && !visit.overstayEscalated) {
                visit.overstayEscalated = true;
                addEvent(visit, 'security_notified', { note: 'Quá giờ 30 phút, đã báo bảo vệ' });
                changed = true;
            }
        }
    });
    return changed;
};

const read = (fn) => {
    const now = new Date();
    const state = loadState(now);
    if (sweep(state, now)) saveState(state);
    return fn(state, now);
};

const write = (fn) => {
    const now = new Date();
    const state = loadState(now);
    sweep(state, now);
    const result = fn(state, now);
    saveState(state);
    return result;
};

const hostName = (host) => (host?.id === ME_HOST_ID ? getCurrentActor().fullName : host?.fullName || '');
const zoneName = (state, zoneId) => state.zones.find((z) => z.id === zoneId)?.name || zoneId;

const view = (visit, state, now) => ({
    ...visit,
    hostName: hostName(state.hosts.find((h) => h.id === visit.hostId)),
    departmentName: state.departments.find((d) => d.id === visit.departmentId)?.name || '',
    zoneNames: visit.access.zoneIds.map((id) => zoneName(state, id)),
    overstay: isOverstay(visit, now),
    overstayLevel: overstayLevel(visit, now),
    lastSeen: visit.lastSeen ? { ...visit.lastSeen, zoneName: zoneName(state, visit.lastSeen.zoneId) } : null,
    availableActions: availableActions(visit.status).filter((action) => !SYSTEM_ACTIONS.includes(action)),
});

const findVisit = (state, id) => state.visits.find((v) => v.id === id) || fail('Không tìm thấy lượt khách');

const touch = (visit) => {
    visit.userTouched = true;
};

export const validateVisitPayload = (payload, channel, state, now = new Date()) => {
    const visitor = payload?.visitor || {};
    if (!String(visitor.fullName || '').trim()) fail('Vui lòng nhập họ tên khách');
    if (!/^0\d{9}$/.test(String(visitor.phone || '').trim())) fail('Số điện thoại không hợp lệ');
    if (channel === 'online' && !EMAIL_PATTERN.test(String(visitor.email || '').trim())) {
        fail('Vui lòng nhập email hợp lệ để nhận kết quả');
    }
    if (!state.hosts.some((h) => h.id === payload.hostId)) fail('Vui lòng chọn người cần gặp');
    if (!String(payload.purpose || '').trim()) fail('Vui lòng chọn mục đích');

    const from = new Date(payload.scheduledFrom).getTime();
    const to = new Date(payload.scheduledTo).getTime();
    if (Number.isNaN(from) || from < now.getTime() - 5 * MIN) fail('Thời gian bắt đầu không được ở quá khứ');
    if (Number.isNaN(to) || to <= from) fail('Thời gian kết thúc phải sau thời gian bắt đầu');
    if (to - from > 7 * DAY) fail('Khung giờ hẹn tối đa 7 ngày');

    if (channel !== 'host_invite') {
        if (!visitor.photo) fail('Vui lòng chụp hoặc tải ảnh khuôn mặt');
        if (payload.consent !== true) fail('Cần đồng ý xử lý dữ liệu sinh trắc để tiếp tục');
    }
};

const createVisitRecord = (state, now, payload, channel, status) => {
    const host = state.hosts.find((h) => h.id === payload.hostId);
    const department = state.departments.find((d) => d.id === host.departmentId);
    const from = new Date(payload.scheduledFrom);
    const prefix = `VS-${ymdCompact(from).slice(2)}-`;
    const seq = state.visits
        .filter((v) => v.code.startsWith(prefix))
        .reduce((max, v) => Math.max(max, Number(v.code.slice(-4))), 0) + 1;
    const photo = payload.visitor.photo || null;

    const visit = {
        id: `u-${now.getTime()}-${seq}`,
        code: `${prefix}${pad(seq, 4)}`,
        channel,
        status,
        visitor: {
            fullName: String(payload.visitor.fullName).trim(),
            idNumber: String(payload.visitor.idNumber || '').trim(),
            phone: String(payload.visitor.phone).trim(),
            email: String(payload.visitor.email || '').trim(),
            organization: String(payload.visitor.organization || '').trim(),
            plateNumber: String(payload.visitor.plateNumber || '').trim(),
            photo,
            hasPhoto: Boolean(photo),
        },
        hostId: host.id,
        departmentId: host.departmentId,
        purpose: payload.purpose,
        companions: Number(payload.companions) || 0,
        scheduledFrom: from.toISOString(),
        scheduledTo: new Date(payload.scheduledTo).toISOString(),
        access: {
            ...defaultAccessWindow(payload.scheduledFrom, payload.scheduledTo),
            zoneIds: [MAIN_GATE, zoneOfBuilding(department.building)],
        },
        checkInAt: null,
        checkOutAt: null,
        faceScore: null,
        rejectReason: null,
        events: [],
        createdAt: now.toISOString(),
        userTouched: true,
    };
    state.visits.unshift(visit);
    return visit;
};

// ---------- Tra cứu ----------

export const getVisitorLookups = () =>
    read((state) => ({ departments: state.departments, zones: state.zones, purposes: PURPOSES }));

export const searchHosts = (q) =>
    read((state) => {
        const needle = normalizeText(q).trim();
        return state.hosts
            .map((h) => ({
                id: h.id,
                fullName: hostName(h),
                departmentId: h.departmentId,
                departmentName: state.departments.find((d) => d.id === h.departmentId)?.name || '',
            }))
            .filter((h) => !needle || normalizeText(`${h.fullName} ${h.departmentName}`).includes(needle))
            .slice(0, 10);
    });

export const getPublicHost = (id) =>
    read((state) => {
        const host = state.hosts.find((h) => h.id === id) || fail('Không tìm thấy người cần gặp');
        return {
            id: host.id,
            fullName: hostName(host),
            departmentId: host.departmentId,
            departmentName: state.departments.find((d) => d.id === host.departmentId)?.name || '',
        };
    });

// ---------- Tạo lượt ----------

export const createPublicRegistration = (payload) =>
    write((state, now) => {
        validateVisitPayload(payload, 'online', state, now);
        const visit = createVisitRecord(state, now, payload, 'online', 'pending_approval');
        addEvent(visit, 'registered', { actor: 'Khách' });
        addEvent(visit, 'email_sent', { note: `Đã gửi email xác nhận tới ${visit.visitor.email}` });
        notify(state, visit, 'pending_approval', `${visit.visitor.fullName} (${visit.visitor.organization || 'khách'}) xin gặp bạn, đang chờ duyệt`, now);
        return view(visit, state, now);
    });

export const createVisit = (payload) =>
    write((state, now) => {
        const channel = payload?.channel;
        if (channel !== 'walk_in' && channel !== 'host_invite') fail('Kênh đăng ký không hợp lệ');
        validateVisitPayload(payload, channel, state, now);
        const visit = createVisitRecord(state, now, payload, channel, 'approved');
        const actor = channel === 'walk_in' ? 'Lễ tân' : getCurrentActor().fullName;
        addEvent(visit, 'registered', { actor });
        addEvent(visit, 'approved', { actor });
        if (visit.visitor.email) addEvent(visit, 'email_sent', { note: `Đã gửi email kèm mã lượt và QR tới ${visit.visitor.email}` });
        if (channel === 'walk_in') notify(state, visit, 'visitor_registered', `Lễ tân đã đăng ký khách ${visit.visitor.fullName} đến gặp bạn`, now);
        return view(visit, state, now);
    });

// ---------- Thao tác trên lượt ----------

const mutate = (id, fn) =>
    write((state, now) => {
        const visit = findVisit(state, id);
        const result = fn(visit, state, now);
        touch(visit);
        return result === undefined ? view(visit, state, now) : result;
    });

export const approveVisit = (id, body = {}) =>
    mutate(id, (visit) => {
        const to = nextStatus(visit.status, 'approve');
        if (body.access) {
            const { validFrom, validTo, zoneIds } = body.access;
            if (!(new Date(validTo).getTime() > new Date(validFrom).getTime())) fail('Hiệu lực đến phải sau hiệu lực từ');
            if (!Array.isArray(zoneIds) || zoneIds.length === 0) fail('Chọn ít nhất một khu vực được phép');
            visit.access = {
                validFrom: new Date(validFrom).toISOString(),
                validTo: new Date(validTo).toISOString(),
                zoneIds: [...zoneIds],
            };
        }
        visit.status = to;
        addEvent(visit, 'approved', { actor: getCurrentActor().fullName });
        if (visit.visitor.email) addEvent(visit, 'email_sent', { note: `Đã gửi email kèm mã lượt và QR tới ${visit.visitor.email}` });
    });

export const rejectVisit = (id, body = {}) =>
    mutate(id, (visit) => {
        const to = nextStatus(visit.status, 'reject');
        const reason = String(body.reason || '').trim();
        if (!reason) fail('Vui lòng nhập lý do từ chối');
        visit.status = to;
        visit.rejectReason = reason;
        addEvent(visit, 'rejected', { note: reason, actor: getCurrentActor().fullName });
        if (visit.visitor.email) addEvent(visit, 'email_sent', { note: `Đã gửi email thông báo từ chối tới ${visit.visitor.email}` });
    });

export const cancelVisit = (id) =>
    mutate(id, (visit) => {
        visit.status = nextStatus(visit.status, 'cancel');
        addEvent(visit, 'cancelled', { actor: getCurrentActor().fullName });
    });

export const revokeVisit = (id, body = {}) =>
    mutate(id, (visit, state, now) => {
        const to = nextStatus(visit.status, 'revoke');
        const reason = String(body.reason || '').trim();
        if (!reason) fail('Vui lòng nhập lý do thu hồi');
        visit.status = to;
        addEvent(visit, 'revoked', { note: reason, actor: getCurrentActor().fullName });
        if (to === 'must_leave') {
            // BR-V11: khách đang ở trong — báo người được gặp và bảo vệ, theo dõi tới khi khách ra.
            visit.revokedAt = now.toISOString();
            addEvent(visit, 'host_notified', { note: 'Yêu cầu khách rời khuôn viên' });
            addEvent(visit, 'security_notified', { note: 'Đã báo bảo vệ hỗ trợ khách rời khuôn viên' });
            notify(state, visit, 'visitor_must_leave', `${visit.visitor.fullName} đã bị thu hồi quyền ra vào, cần rời khuôn viên`, now);
        } else {
            addEvent(visit, 'face_removed');
        }
    });

export const extendVisit = (id, body = {}) =>
    mutate(id, (visit) => {
        if (!['approved', 'checked_in'].includes(visit.status)) fail('Chỉ gia hạn được lượt đã duyệt hoặc đang trong khuôn viên');
        if (!body.validTo || !canExtend(visit, body.validTo)) fail('Thời điểm gia hạn phải sau hiệu lực hiện tại');
        visit.access.validTo = new Date(body.validTo).toISOString();
        visit.overstayNotified = false;
        visit.overstayEscalated = false;
        addEvent(visit, 'extended', { note: `Hiệu lực mới đến ${new Date(body.validTo).toLocaleString('vi-VN')}`, actor: getCurrentActor().fullName });
    });

export const attachVisitorPhoto = (id, body = {}) =>
    mutate(id, (visit) => {
        if (!/^data:image\//.test(String(body.photo || ''))) fail('Ảnh không hợp lệ');
        visit.visitor.photo = body.photo;
        visit.visitor.hasPhoto = true;
        addEvent(visit, 'photo_added', { actor: 'Lễ tân' });
    });

const simulatedScore = (visit, scenario) => {
    if (scenario === 'low_score') return 0.71;
    if (!visit.visitor.hasPhoto) return null;
    return Math.round((0.82 + mulberry32(hashSeed(visit.id))() * 0.17) * 100) / 100;
};

// Thời điểm dùng để ĐÁNH GIÁ theo tình huống mô phỏng; thời điểm GHI NHẬN luôn là hiện tại.
const simulatedArrival = (visit, scenario, now) => {
    const validFrom = new Date(visit.access.validFrom).getTime();
    const validTo = new Date(visit.access.validTo).getTime();
    if (scenario === 'outside_window') return validTo + 2 * HOUR;
    const t = now.getTime();
    return t < validFrom || t > validTo ? new Date(visit.scheduledFrom).getTime() : t;
};

// Một lượt camera chiều vào nhận diện khách (dùng chung cho quầy lễ tân và màn hình cổng).
const runGateEntry = (visit, state, now, body = {}) => {
        const scenario = body.scenario || 'normal';
        const zoneId = body.zoneId || MAIN_GATE;
        const score = simulatedScore(visit, scenario);
        const { outcome, reason } = evaluateGateAttempt(visit, {
            at: new Date(simulatedArrival(visit, scenario, now)).toISOString(),
            zoneId,
            score,
        });

        if (outcome === 'checked_in') {
            visit.status = 'checked_in';
            visit.checkInAt = now.toISOString();
            visit.faceScore = score;
            visit.lastSeen = { at: now.toISOString(), zoneId };
            addEvent(visit, 'face_verified', { zoneId, score });
            addEvent(visit, 'check_in', { zoneId });
            addEvent(visit, 'host_notified', { note: 'Thông báo khách đã đến' });
            notify(state, visit, 'visitor_arrived', `${visit.visitor.fullName} đã đến ${zoneName(state, zoneId)}`, now);
        } else if (outcome === 'manual_review') {
            addEvent(visit, 'manual_review', { zoneId, score, note: GATE_REASON_NOTES[reason] });
        } else if (reason === 'access_revoked') {
            // BR-V12: khách phải rời mà còn bị camera chiều vào thấy → cảnh báo, cập nhật vị trí.
            visit.lastSeen = { at: now.toISOString(), zoneId };
            addEvent(visit, 'access_denied', { zoneId, note: GATE_REASON_NOTES[reason] });
        } else if (reason !== 'invalid_status' && reason !== 'already_inside') {
            addEvent(visit, 'access_denied', { zoneId, score, note: GATE_REASON_NOTES[reason] });
        }
        return { outcome, reason, score, at: now.toISOString(), visit: view(visit, state, now) };
};

export const verifyFaceAtGate = (id, body = {}) => mutate(id, (visit, state, now) => runGateEntry(visit, state, now, body));

const recordExit = (visit, state, now, zoneId = MAIN_GATE) => {
    visit.status = nextStatus(visit.status, 'check_out');
    visit.checkOutAt = now.toISOString();
    visit.lastSeen = { at: now.toISOString(), zoneId };
    addEvent(visit, 'check_out', { zoneId });
    addEvent(visit, 'face_removed');
    addEvent(visit, 'host_notified', { note: 'Thông báo khách đã rời' });
    notify(state, visit, 'visitor_left', `${visit.visitor.fullName} đã rời khuôn viên`, now);
};

// Màn hình cổng: thiết bị gửi mã lượt (QR) kèm chiều vào/ra. Chiều ra không bao giờ bị chặn (BR-V11).
export const scanAtGate = (code, body = {}) =>
    write((state, now) => {
        const wanted = String(code || '').trim().toUpperCase();
        const visit = state.visits.find((v) => v.code === wanted) || fail('Không tìm thấy lượt khách với mã này');
        const zoneId = body.zoneId || MAIN_GATE;
        if (body.direction === 'out') {
            if (!isOnSite(visit)) {
                return { outcome: 'access_denied', reason: 'not_on_site', score: null, at: now.toISOString(), visit: view(visit, state, now) };
            }
            recordExit(visit, state, now, zoneId);
            touch(visit);
            return { outcome: 'checked_out', reason: null, score: simulatedScore(visit, 'normal'), at: now.toISOString(), visit: view(visit, state, now) };
        }
        const result = runGateEntry(visit, state, now, { ...body, zoneId });
        touch(visit);
        return result;
    });

export const checkInVisit = (id, body = {}) =>
    mutate(id, (visit, state, now) => {
        const to = nextStatus(visit.status, 'check_in');
        const note = String(body.note || '').trim();
        if (!note) fail('Vui lòng nhập ghi chú xác minh');
        visit.status = to;
        visit.checkInAt = now.toISOString();
        visit.lastSeen = { at: now.toISOString(), zoneId: MAIN_GATE };
        addEvent(visit, 'check_in', { zoneId: MAIN_GATE, note, actor: 'Lễ tân' });
        addEvent(visit, 'host_notified', { note: 'Thông báo khách đã đến' });
        notify(state, visit, 'visitor_arrived', `${visit.visitor.fullName} đã đến ${zoneName(state, MAIN_GATE)}`, now);
    });

export const checkOutVisit = (id) =>
    mutate(id, (visit, state, now) => {
        recordExit(visit, state, now);
    });

const CLOSE_REASON_NOTES = {
    left_unrecorded: 'Khách đã rời, camera không ghi nhận',
    not_found: 'Không tìm thấy khách',
};

// BR-V14: đóng lượt thủ công, bắt buộc có lý do.
export const closeVisitManually = (id, body = {}) =>
    mutate(id, (visit, state, now) => {
        const closedStatus = nextStatus(visit.status, 'close_manual');
        const note = String(body.note || '').trim();
        const actor = getCurrentActor().fullName;
        if (!CLOSE_REASON_NOTES[body.reason]) fail('Vui lòng chọn lý do đóng lượt');

        if (body.reason === 'not_found') {
            if (!note) fail('Vui lòng ghi chú đã tìm khách ở đâu');
            if (visit.status !== 'exit_unrecorded') visit.status = nextStatus(visit.status, 'mark_unrecorded');
            visit.notFound = true;
            addEvent(visit, 'security_notified', { note: `${CLOSE_REASON_NOTES.not_found}: ${note}`, actor });
            addEvent(visit, 'exit_unrecorded', { actor });
            return;
        }

        if (!body.exitAt) fail('Vui lòng nhập giờ ra ước tính');
        const exitAt = new Date(body.exitAt).getTime();
        if (Number.isNaN(exitAt) || exitAt < new Date(visit.checkInAt).getTime() || exitAt > now.getTime()) {
            fail('Giờ ra phải sau giờ vào và không ở tương lai');
        }
        visit.status = closedStatus;
        visit.checkOutAt = new Date(exitAt).toISOString();
        visit.manualExit = true;
        addEvent(visit, 'manual_close', { note: note ? `${CLOSE_REASON_NOTES.left_unrecorded}. ${note}` : CLOSE_REASON_NOTES.left_unrecorded, actor });
        addEvent(visit, 'face_removed');
        notify(state, visit, 'visitor_left', `${visit.visitor.fullName} đã được ghi nhận rời khuôn viên (giờ ra nhập tay)`, now);
    });

// ---------- Danh sách ----------

const matchesQuery = (visit, needle) =>
    !needle ||
    normalizeText([
        visit.visitor.fullName, visit.visitor.idNumber, visit.visitor.phone, visit.visitor.organization, visit.code,
    ].join(' ')).includes(needle);

// Khách phải rời vẫn thuộc nhóm "đang trong khuôn viên".
const statusGroup = (status) => {
    if (CLOSED_STATUSES.includes(status)) return 'closed';
    return status === 'must_leave' ? 'checked_in' : status;
};

export const listVisits = (params = {}) =>
    read((state, now) => {
        const { status, from, to, departmentId, hostId, q, page = 1, limit = 10 } = params;
        const needle = normalizeText(q).trim();
        const base = state.visits.filter((v) => {
            const day = localYmd(v.scheduledFrom);
            if (from && day < from) return false;
            if (to && day > to) return false;
            if (departmentId && v.departmentId !== departmentId) return false;
            if (hostId && v.hostId !== hostId) return false;
            return matchesQuery(v, needle);
        });

        const counts = { pending_approval: 0, approved: 0, checked_in: 0, checked_out: 0, closed: 0 };
        base.forEach((v) => {
            counts[statusGroup(v.status)] += 1;
        });

        const filtered = status ? base.filter((v) => statusGroup(v.status) === status || v.status === status) : base;
        filtered.sort((a, b) => new Date(b.scheduledFrom) - new Date(a.scheduledFrom));
        const start = (Number(page) - 1) * Number(limit);
        return {
            items: filtered.slice(start, start + Number(limit)).map((v) => view(v, state, now)),
            total: filtered.length,
            counts,
        };
    });

export const getVisit = (id) => read((state, now) => view(findVisit(state, id), state, now));

export const listVisitsOfVisitor = (id) =>
    read((state, now) => {
        const { visitor } = findVisit(state, id);
        return state.visits
            .filter((v) => (visitor.idNumber && v.visitor.idNumber === visitor.idNumber) || v.visitor.phone === visitor.phone)
            .sort((a, b) => new Date(b.scheduledFrom) - new Date(a.scheduledFrom))
            .map((v) => view(v, state, now));
    });

export const getPublicRegistration = (code) =>
    read((state, now) => {
        const wanted = String(code || '').trim().toUpperCase();
        const visit = state.visits.find((v) => v.code === wanted) || fail('Không tìm thấy lượt đăng ký với mã này');
        const full = view(visit, state, now);
        return {
            ...full,
            // Trang công khai: không trả số giấy tờ, điện thoại, email, ảnh.
            visitor: { fullName: full.visitor.fullName, organization: full.visitor.organization, hasPhoto: full.visitor.hasPhoto },
            lastSeen: null,
            events: full.events.map((e) => ({ at: e.at, type: e.type })),
        };
    });

// Hàng "Cần xử lý" của quầy lễ tân: chỉ các ngoại lệ, đường thông thường không cần người trực.
const buildAttention = (state, now, today) => {
    const weekAgo = now.getTime() - 7 * DAY;
    const items = [];
    const add = (kind, visit, since) => items.push({ kind, since, visit: view(visit, state, now) });
    state.visits.forEach((v) => {
        if (v.status === 'must_leave') add('must_leave', v, v.revokedAt);
        else if (isOverstay(v, now)) add('overstay', v, v.access.validTo);
        else if (v.status === 'exit_unrecorded' && new Date(v.access.validTo).getTime() >= weekAgo) add('exit_unrecorded', v, v.access.validTo);
        else if (v.status === 'approved' && localYmd(v.scheduledFrom) === today) {
            const lastGate = [...v.events].reverse().find((e) => e.type === 'manual_review' || e.type === 'check_in');
            if (lastGate?.type === 'manual_review' && localYmd(lastGate.at) === today) add('manual_review', v, lastGate.at);
            else if (!v.visitor.hasPhoto) add('no_photo', v, v.scheduledFrom);
        }
    });
    return items.sort((a, b) =>
        ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind) || new Date(a.since) - new Date(b.since));
};

export const getDeskToday = () =>
    read((state, now) => {
        const today = localYmd(now);
        const scheduledToday = state.visits.filter((v) => localYmd(v.scheduledFrom) === today);
        const carriedOver = state.visits.filter((v) => isOnSite(v) && localYmd(v.scheduledFrom) !== today);
        const items = [...scheduledToday, ...carriedOver].sort((a, b) => new Date(a.scheduledFrom) - new Date(b.scheduledFrom));

        const alerts = [];
        state.visits.forEach((v) => {
            v.events.forEach((e) => {
                if ((e.type === 'access_denied' || e.type === 'manual_review') && localYmd(e.at) === today) {
                    alerts.push({
                        at: e.at, type: e.type, note: e.note, zoneName: zoneName(state, e.zoneId),
                        visitId: v.id, code: v.code, visitorName: v.visitor.fullName,
                    });
                }
            });
        });
        alerts.sort((a, b) => new Date(b.at) - new Date(a.at));

        return {
            kpis: {
                expected: scheduledToday.filter((v) => v.status !== 'rejected' && v.status !== 'cancelled').length,
                arrived: state.visits.filter((v) => v.checkInAt && localYmd(v.checkInAt) === today).length,
                onSite: state.visits.filter(isOnSite).length,
                overstay: state.visits.filter((v) => isOverstay(v, now)).length,
            },
            items: items.map((v) => view(v, state, now)),
            alerts,
            attention: buildAttention(state, now, today),
        };
    });

export const getMyVisits = () =>
    read((state, now) => {
        const mine = state.visits.filter((v) => v.hostId === ME_HOST_ID);
        const asc = (a, b) => new Date(a.scheduledFrom) - new Date(b.scheduledFrom);
        const toView = (v) => view(v, state, now);
        return {
            pending: mine.filter((v) => v.status === 'pending_approval').sort(asc).map(toView),
            upcoming: mine.filter((v) => v.status === 'approved' || v.status === 'checked_in').sort(asc).map(toView),
            past: mine
                .filter((v) => !['pending_approval', 'approved', 'checked_in'].includes(v.status))
                .sort((a, b) => asc(b, a))
                .slice(0, 50)
                .map(toView),
        };
    });

export const getMyNotifications = () =>
    read((state) =>
        state.notifications
            .filter((n) => n.hostId === ME_HOST_ID)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50)
            .map(({ id, visitId, type, message, createdAt, read: isRead }) => ({ id, visitId, type, message, createdAt, read: isRead })));

export const markMyNotificationsRead = () =>
    write((state) => {
        let updated = 0;
        state.notifications.forEach((n) => {
            if (n.hostId === ME_HOST_ID && !n.read) {
                n.read = true;
                n.userTouched = true;
                updated += 1;
            }
        });
        return { updated };
    });

// ---------- Thống kê ----------

// Các lượt có ngày hẹn nằm trong kỳ (tính cả hai đầu). Dùng chung cho thống kê và báo cáo khách.
export const selectVisitsInRange = (state, { from, to, departmentId } = {}) =>
    state.visits.filter((v) => {
        const day = localYmd(v.scheduledFrom);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return !departmentId || v.departmentId === departmentId;
    });

const visitorKey = (v) => v.visitor.idNumber || v.visitor.phone;

export const computeVisitorKpis = (visits, now = new Date()) => {
    const arrived = visits.filter((v) => v.checkInAt);
    const left = arrived.filter((v) => v.checkOutAt);
    const expired = visits.filter((v) => v.status === 'expired').length;
    const stayMinutes = left.reduce((sum, v) => sum + (new Date(v.checkOutAt) - new Date(v.checkInAt)) / MIN, 0);
    return {
        totalVisits: arrived.length,
        uniqueVisitors: new Set(arrived.map(visitorKey)).size,
        avgStayMinutes: left.length ? Math.round(stayMinutes / left.length) : 0,
        overstayCount: arrived.filter((v) =>
            (v.checkOutAt && new Date(v.checkOutAt) > new Date(v.access.validTo)) || isOverstay(v, now)).length,
        noShowRate: expired + arrived.length ? Math.round((expired / (expired + arrived.length)) * 1000) / 10 : 0,
    };
};

const countBy = (items, keyOf) => {
    const map = new Map();
    items.forEach((item) => {
        const key = keyOf(item);
        map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
};

const mondayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

const bucketOf = (value, groupBy) => {
    const d = new Date(value);
    if (groupBy === 'month') return { sort: d.getFullYear() * 100 + d.getMonth(), label: `${pad(d.getMonth() + 1)}/${d.getFullYear()}` };
    if (groupBy === 'week') {
        const m = mondayOf(d);
        return { sort: m.getTime(), label: `Tuần ${pad(m.getDate())}/${pad(m.getMonth() + 1)}` };
    }
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { sort: day.getTime(), label: `${pad(day.getDate())}/${pad(day.getMonth() + 1)}` };
};

export const buildVisitSeries = (arrived, { from, to, groupBy = 'day' }) => {
    const buckets = new Map();
    if (groupBy === 'day' && from && to) {
        const [fy, fm, fd] = from.split('-').map(Number);
        const [ty, tm, td] = to.split('-').map(Number);
        const end = new Date(ty, tm - 1, td).getTime();
        for (let d = new Date(fy, fm - 1, fd), n = 0; d.getTime() <= end && n < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n += 1) {
            const b = bucketOf(d, 'day');
            buckets.set(b.sort, { bucket: b.label, count: 0 });
        }
    }
    arrived.forEach((v) => {
        const b = bucketOf(v.scheduledFrom, groupBy);
        const entry = buckets.get(b.sort) || { bucket: b.label, count: 0 };
        entry.count += 1;
        buckets.set(b.sort, entry);
    });
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
};

export const getVisitorStats = (params = {}) =>
    read((state, now) => {
        const { from, to, departmentId, groupBy = 'day' } = params;
        if (!from || !to) fail('Vui lòng chọn kỳ thống kê');
        if (from > to) fail('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
        const visits = selectVisitsInRange(state, { from, to, departmentId });
        const arrived = visits.filter((v) => v.checkInAt);
        const desc = (a, b) => b.count - a.count;

        const byHourMap = countBy(arrived, (v) => new Date(v.checkInAt).getHours());
        return {
            kpis: computeVisitorKpis(visits, now),
            byPeriod: buildVisitSeries(arrived, { from, to, groupBy }),
            byDepartment: [...countBy(arrived, (v) => v.departmentId).entries()]
                .map(([id, count]) => ({ departmentId: id, name: state.departments.find((d) => d.id === id)?.name || id, count }))
                .sort(desc),
            byPurpose: [...countBy(arrived, (v) => v.purpose).entries()].map(([purpose, count]) => ({ purpose, count })).sort(desc),
            byHour: Array.from({ length: 12 }, (_, i) => ({ hour: `${pad(i + 7)}h`, count: byHourMap.get(i + 7) || 0 })),
            topOrganizations: [...countBy(arrived, (v) => v.visitor.organization || 'Không rõ').entries()]
                .map(([organization, count]) => ({ organization, count }))
                .sort(desc)
                .slice(0, 8),
        };
    });

export const resetDemoData = () => {
    resetState();
    return { reset: true };
};
