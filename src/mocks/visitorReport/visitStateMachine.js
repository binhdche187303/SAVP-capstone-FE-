// src/mocks/visitorReport/visitStateMachine.js
// Máy trạng thái lượt khách (spec §4.1). Hàm thuần — BE sẽ cài lại đúng bảng này.

export const VISIT_STATUS = {
    PENDING: 'pending_approval',
    APPROVED: 'approved',
    CHECKED_IN: 'checked_in',
    CHECKED_OUT: 'checked_out',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
    MUST_LEAVE: 'must_leave',
    EXIT_UNRECORDED: 'exit_unrecorded',
};

export const VISIT_ACTION = {
    APPROVE: 'approve',
    REJECT: 'reject',
    CANCEL: 'cancel',
    CHECK_IN: 'check_in',
    CHECK_OUT: 'check_out',
    REVOKE: 'revoke',
    EXPIRE: 'expire',
    CLOSE_MANUAL: 'close_manual',
    MARK_UNRECORDED: 'mark_unrecorded',
};

const TRANSITIONS = {
    pending_approval: { approve: 'approved', reject: 'rejected', cancel: 'cancelled' },
    approved: { check_in: 'checked_in', revoke: 'revoked', cancel: 'cancelled', expire: 'expired' },
    // Thu hồi khi khách đang ở trong: khách phải rời nhưng vẫn được theo dõi tới khi ra (spec §12.1).
    checked_in: { check_out: 'checked_out', revoke: 'must_leave', close_manual: 'checked_out', mark_unrecorded: 'exit_unrecorded' },
    must_leave: { check_out: 'checked_out', close_manual: 'checked_out', mark_unrecorded: 'exit_unrecorded' },
    exit_unrecorded: { close_manual: 'checked_out' },
};

export const TERMINAL_STATUSES = ['checked_out', 'rejected', 'cancelled', 'revoked', 'expired'];

export const FACE_MATCH_THRESHOLD = 0.8;
const ACCESS_BUFFER_MS = 30 * 60 * 1000;
// BR-V13: quá giờ 30 phút thì leo thang lên bảo vệ.
export const OVERSTAY_ESCALATE_MS = 30 * 60 * 1000;

export const canTransition = (status, action) => Boolean(TRANSITIONS[status]?.[action]);

export const nextStatus = (status, action) => {
    const to = TRANSITIONS[status]?.[action];
    if (!to) throw new Error(`Không thể thực hiện "${action}" khi lượt khách đang ở trạng thái "${status}"`);
    return to;
};

export const availableActions = (status) => Object.keys(TRANSITIONS[status] || {});

export const canExtend = (visit, newValidTo) =>
    ['approved', 'checked_in'].includes(visit.status) &&
    new Date(newValidTo).getTime() > new Date(visit.access.validTo).getTime();

export const isOverstay = (visit, now = new Date()) =>
    visit.status === 'checked_in' && now.getTime() > new Date(visit.access.validTo).getTime();

export const isOnSite = (visit) => visit.status === 'checked_in' || visit.status === 'must_leave';

// 0: trong hạn · 1: vừa quá giờ (báo người được gặp) · 2: quá 30 phút (báo bảo vệ).
export const overstayLevel = (visit, now = new Date()) => {
    if (!isOverstay(visit, now)) return 0;
    return now.getTime() - new Date(visit.access.validTo).getTime() >= OVERSTAY_ESCALATE_MS ? 2 : 1;
};

// BR-V15: sang ngày mới sau ngày hết hiệu lực (khách phải rời: sau ngày bị thu hồi) mà chưa có giờ ra.
export const shouldMarkExitUnrecorded = (visit, now = new Date()) => {
    if (!isOnSite(visit)) return false;
    const reference = new Date(visit.status === 'must_leave' && visit.revokedAt ? visit.revokedAt : visit.access.validTo);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return reference.getTime() < startOfToday.getTime();
};

export const shouldExpire = (visit, now = new Date()) =>
    visit.status === 'approved' && now.getTime() > new Date(visit.access.validTo).getTime();

export const defaultAccessWindow = (scheduledFrom, scheduledTo) => ({
    validFrom: new Date(new Date(scheduledFrom).getTime() - ACCESS_BUFFER_MS).toISOString(),
    validTo: new Date(new Date(scheduledTo).getTime() + ACCESS_BUFFER_MS).toISOString(),
});

// BR-V5, BR-V6. Thứ tự kiểm tra: trạng thái → khung giờ → khu vực → ảnh → độ khớp.
export const evaluateGateAttempt = (visit, { at, zoneId, score }) => {
    if (visit.status === 'must_leave') return { outcome: 'access_denied', reason: 'access_revoked' };
    if (visit.status === 'checked_in') return { outcome: 'access_denied', reason: 'already_inside' };
    if (visit.status !== 'approved') return { outcome: 'access_denied', reason: 'invalid_status' };
    const t = new Date(at).getTime();
    if (t < new Date(visit.access.validFrom).getTime() || t > new Date(visit.access.validTo).getTime()) {
        return { outcome: 'access_denied', reason: 'outside_window' };
    }
    if (!visit.access.zoneIds.includes(zoneId)) return { outcome: 'access_denied', reason: 'zone_not_allowed' };
    if (!visit.visitor.hasPhoto) return { outcome: 'manual_review', reason: 'no_photo' };
    if (score < FACE_MATCH_THRESHOLD) return { outcome: 'manual_review', reason: 'low_score' };
    return { outcome: 'checked_in', reason: null };
};
