// src/mocks/visitorReport/visitorApi.test.js
import * as svc from '../../service/visitorService';
import { resetState } from './store';
import { ME_HOST_ID } from './seed';

const HOUR = 3600000;
const PHOTO = 'data:image/jpeg;base64,AAAA';
const payload = (over = {}) => ({
    visitor: { fullName: 'Trần Thị Demo', idNumber: '001099000111', phone: '0912345678', email: 'demo@example.com', organization: 'Công ty CP MISA', plateNumber: '', photo: PHOTO },
    hostId: ME_HOST_ID,
    purpose: 'Làm việc với đơn vị',
    companions: 0,
    scheduledFrom: new Date(Date.now() + HOUR).toISOString(),
    scheduledTo: new Date(Date.now() + 3 * HOUR).toISOString(),
    consent: true,
    ...over,
});
const ok = async (promise) => {
    const res = await promise;
    expect(res.success).toBe(true);
    return res.data;
};

beforeEach(() => {
    resetState();
});

test('luồng trọn vẹn: đăng ký → duyệt → nhận diện → rời', async () => {
    const created = await ok(svc.createPublicRegistration(payload()));
    expect(created.status).toBe('pending_approval');
    expect(created.code).toMatch(/^VS-\d{6}-\d{4}$/);
    expect(created.availableActions).toEqual(expect.arrayContaining(['approve', 'reject']));

    const pendingList = await ok(svc.listVisits({ status: 'pending_approval', q: 'tran thi demo' }));
    expect(pendingList.items.map((v) => v.id)).toContain(created.id);

    const approved = await ok(svc.approveVisit(created.id, {}));
    expect(approved.status).toBe('approved');
    expect(approved.access.zoneIds).toContain('zone-gate-main');

    const gate = await ok(svc.verifyFaceAtGate(created.id, { zoneId: 'zone-gate-main', scenario: 'normal' }));
    expect(gate.outcome).toBe('checked_in');
    expect(gate.score).toBeGreaterThanOrEqual(0.8);
    expect(gate.visit.status).toBe('checked_in');

    const left = await ok(svc.checkOutVisit(created.id));
    expect(left.status).toBe('checked_out');
    expect(left.events.map((e) => e.type)).toEqual(expect.arrayContaining(['registered', 'approved', 'face_verified', 'check_in', 'check_out', 'face_removed']));

    const notes = await ok(svc.getMyNotifications());
    const types = notes.filter((n) => n.visitId === created.id).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['pending_approval', 'visitor_arrived', 'visitor_left']));
});

test('ngoài khung giờ và sai khu vực bị chặn, lượt vẫn approved', async () => {
    const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
    const late = await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-gate-main', scenario: 'outside_window' }));
    expect(late).toMatchObject({ outcome: 'access_denied', reason: 'outside_window' });
    const wrong = await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-b2', scenario: 'normal' }));
    expect(wrong).toMatchObject({ outcome: 'access_denied', reason: 'zone_not_allowed' });
    expect((await ok(svc.getVisit(v.id))).status).toBe('approved');
});

test('độ khớp thấp → lễ tân check-in tay kèm ghi chú', async () => {
    const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
    const low = await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-gate-main', scenario: 'low_score' }));
    expect(low).toMatchObject({ outcome: 'manual_review', reason: 'low_score' });
    expect((await svc.checkInVisit(v.id, { note: '' })).success).toBe(false);
    expect((await ok(svc.checkInVisit(v.id, { note: 'Đã đối chiếu CCCD' }))).status).toBe('checked_in');
});

test('khách được mời hộ chưa có ảnh: không tự check-in được cho tới khi bổ sung ảnh', async () => {
    const v = await ok(svc.createVisit({ ...payload({ visitor: { ...payload().visitor, photo: null } }), channel: 'host_invite', consent: false }));
    expect(v.visitor.hasPhoto).toBe(false);
    expect((await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-gate-main', scenario: 'normal' }))).reason).toBe('no_photo');
    await ok(svc.attachVisitorPhoto(v.id, { photo: PHOTO }));
    expect((await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-gate-main', scenario: 'normal' }))).outcome).toBe('checked_in');
});

test('từ chối cần lý do; thao tác trên lượt đã đóng bị từ chối', async () => {
    const v = await ok(svc.createPublicRegistration(payload()));
    expect((await svc.rejectVisit(v.id, { reason: ' ' })).success).toBe(false);
    expect((await ok(svc.rejectVisit(v.id, { reason: 'Trùng lịch' }))).rejectReason).toBe('Trùng lịch');
    const again = await svc.approveVisit(v.id, {});
    expect(again.success).toBe(false);
    expect(again.message).toContain('Không thể');
});

test('gia hạn phải sau hiệu lực hiện tại', async () => {
    const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
    expect((await svc.extendVisit(v.id, { validTo: v.access.validFrom })).success).toBe(false);
    const later = new Date(new Date(v.access.validTo).getTime() + HOUR).toISOString();
    expect((await ok(svc.extendVisit(v.id, { validTo: later }))).access.validTo).toBe(later);
});

test.each([
    [{ visitor: { ...payload().visitor, fullName: '' } }, 'Vui lòng nhập họ tên khách'],
    [{ visitor: { ...payload().visitor, phone: '12345' } }, 'Số điện thoại không hợp lệ'],
    [{ visitor: { ...payload().visitor, email: 'sai' } }, 'Vui lòng nhập email hợp lệ để nhận kết quả'],
    [{ hostId: 'khong-co' }, 'Vui lòng chọn người cần gặp'],
    [{ scheduledFrom: new Date(Date.now() - 2 * HOUR).toISOString() }, 'Thời gian bắt đầu không được ở quá khứ'],
    [{ scheduledTo: new Date(Date.now() + HOUR).toISOString() }, 'Thời gian kết thúc phải sau thời gian bắt đầu'],
    [{ scheduledTo: new Date(Date.now() + 9 * 24 * HOUR).toISOString() }, 'Khung giờ hẹn tối đa 7 ngày'],
    [{ visitor: { ...payload().visitor, photo: null } }, 'Vui lòng chụp hoặc tải ảnh khuôn mặt'],
    [{ consent: false }, 'Cần đồng ý xử lý dữ liệu sinh trắc để tiếp tục'],
])('đăng ký công khai sai dữ liệu %#', async (over, message) => {
    const res = await svc.createPublicRegistration(payload(over));
    expect(res).toEqual({ success: false, message });
});

test('tra cứu công khai: ẩn dữ liệu cá nhân, mã sai trả lỗi', async () => {
    const v = await ok(svc.createPublicRegistration(payload()));
    const pub = await ok(svc.getPublicRegistration(v.code));
    expect(pub.code).toBe(v.code);
    expect(pub.visitor.idNumber).toBeUndefined();
    expect(pub.visitor.phone).toBeUndefined();
    expect(await svc.getPublicRegistration('VS-000000-0000')).toEqual({ success: false, message: 'Không tìm thấy lượt đăng ký với mã này' });
});

test('quầy lễ tân và thống kê đọc cùng kho dữ liệu', async () => {
    const desk = await ok(svc.getDeskToday());
    // 14 lượt hẹn hôm nay, trừ 1 lượt bị từ chối không còn là "dự kiến".
    expect(desk.kpis.expected).toBeGreaterThanOrEqual(13);
    expect(desk.kpis.overstay).toBeGreaterThanOrEqual(1);
    const mine = await ok(svc.getMyVisits());
    expect(mine.pending.length).toBeGreaterThanOrEqual(2);
    const today = new Date();
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stats = await ok(svc.getVisitorStats({ from: ymd(new Date(today.getTime() - 29 * 24 * HOUR)), to: ymd(today), groupBy: 'day' }));
    expect(stats.kpis.totalVisits).toBeGreaterThan(50);
    expect(stats.byDepartment.reduce((sum, d) => sum + d.count, 0)).toBe(stats.kpis.totalVisits);
});

test('phân trang và đếm theo tab', async () => {
    const page1 = await ok(svc.listVisits({ page: 1, limit: 10 }));
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBeGreaterThanOrEqual(350);
    const { counts } = page1;
    expect(counts.pending_approval + counts.approved + counts.checked_in + counts.checked_out + counts.closed).toBe(page1.total);
});

describe('bổ sung 2026-10-08', () => {
    const insideVisit = async () => {
        const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
        await ok(svc.verifyFaceAtGate(v.id, { zoneId: 'zone-gate-main', scenario: 'normal' }));
        return v;
    };

    test('thu hồi khi khách đang ở trong: phải rời, vẫn được đếm, cổng vẫn cho ra', async () => {
        const v = await insideVisit();
        const onSiteBefore = (await ok(svc.getDeskToday())).kpis.onSite;
        expect((await svc.revokeVisit(v.id, { reason: '' })).success).toBe(false);

        const revoked = await ok(svc.revokeVisit(v.id, { reason: 'Vi phạm nội quy' }));
        expect(revoked.status).toBe('must_leave');
        expect(revoked.revokedAt).toBeTruthy();
        expect(revoked.availableActions).toEqual(expect.arrayContaining(['check_out', 'close_manual']));
        expect(revoked.events.map((e) => e.type)).toEqual(expect.arrayContaining(['revoked', 'host_notified', 'security_notified']));

        const desk = await ok(svc.getDeskToday());
        expect(desk.kpis.onSite).toBe(onSiteBefore);
        expect(desk.attention.some((a) => a.kind === 'must_leave' && a.visit.id === v.id)).toBe(true);
        const notes = await ok(svc.getMyNotifications());
        expect(notes.some((n) => n.visitId === v.id && n.type === 'visitor_must_leave')).toBe(true);

        const tryIn = await ok(svc.scanAtGate(v.code, { zoneId: 'zone-b1', direction: 'in' }));
        expect(tryIn).toMatchObject({ outcome: 'access_denied', reason: 'access_revoked' });

        const out = await ok(svc.scanAtGate(v.code, { zoneId: 'zone-gate-main', direction: 'out' }));
        expect(out.outcome).toBe('checked_out');
        expect(out.visit.status).toBe('checked_out');
        expect(out.visit.revokedAt).toBeTruthy();
        expect((await ok(svc.getDeskToday())).attention.some((a) => a.visit.id === v.id)).toBe(false);
    });

    test('thu hồi lượt chưa đến vẫn là revoked như cũ', async () => {
        const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
        expect((await ok(svc.revokeVisit(v.id, { reason: 'Hủy lịch' }))).status).toBe('revoked');
    });

    test('đóng lượt thủ công: khách đã rời nhưng camera không ghi nhận', async () => {
        const v = await insideVisit();
        expect(await svc.closeVisitManually(v.id, { reason: 'khac' })).toEqual({ success: false, message: 'Vui lòng chọn lý do đóng lượt' });
        expect(await svc.closeVisitManually(v.id, { reason: 'left_unrecorded' })).toEqual({ success: false, message: 'Vui lòng nhập giờ ra ước tính' });
        const tooEarly = new Date(Date.now() - 5 * HOUR).toISOString();
        expect(await svc.closeVisitManually(v.id, { reason: 'left_unrecorded', exitAt: tooEarly })).toEqual({ success: false, message: 'Giờ ra phải sau giờ vào và không ở tương lai' });
        const future = new Date(Date.now() + HOUR).toISOString();
        expect((await svc.closeVisitManually(v.id, { reason: 'left_unrecorded', exitAt: future })).success).toBe(false);

        const closed = await ok(svc.closeVisitManually(v.id, { reason: 'left_unrecorded', exitAt: new Date().toISOString(), note: 'Bảo vệ xác nhận' }));
        expect(closed).toMatchObject({ status: 'checked_out', manualExit: true });
        expect(closed.events.map((e) => e.type)).toEqual(expect.arrayContaining(['manual_close', 'face_removed']));
    });

    test('đóng lượt thủ công: không tìm thấy khách → chưa ghi nhận giờ ra, sau đó vẫn đóng được', async () => {
        const v = await insideVisit();
        expect(await svc.closeVisitManually(v.id, { reason: 'not_found', note: ' ' })).toEqual({ success: false, message: 'Vui lòng ghi chú đã tìm khách ở đâu' });
        const lost = await ok(svc.closeVisitManually(v.id, { reason: 'not_found', note: 'Đã tìm ở Tòa B1 và nhà xe' }));
        expect(lost.status).toBe('exit_unrecorded');
        expect(lost.events.map((e) => e.type)).toEqual(expect.arrayContaining(['security_notified', 'exit_unrecorded']));
        expect((await ok(svc.getDeskToday())).attention.some((a) => a.kind === 'exit_unrecorded' && a.visit.id === v.id)).toBe(true);
        const closed = await ok(svc.closeVisitManually(v.id, { reason: 'left_unrecorded', exitAt: new Date().toISOString() }));
        expect(closed.status).toBe('checked_out');
    });

    test('không đóng thủ công được lượt chưa vào', async () => {
        const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
        const res = await svc.closeVisitManually(v.id, { reason: 'left_unrecorded', exitAt: new Date().toISOString() });
        expect(res.success).toBe(false);
        expect(res.message).toContain('Không thể');
    });

    test('quá giờ sinh sẵn nằm trong hàng cần xử lý với đúng mức leo thang, có lần cuối camera thấy; gia hạn thì hết cảnh báo', async () => {
        const desk = await ok(svc.getDeskToday());
        const item = desk.attention.find((a) => a.kind === 'overstay');
        expect(item).toBeTruthy();
        // Dữ liệu sinh sẵn quá giờ 45 phút (mức 2); chỉ trong 45 phút đầu ngày hạn mới bị kẹp về 00:00.
        const lateMs = Date.now() - new Date(item.visit.access.validTo).getTime();
        const level = lateMs >= 30 * 60 * 1000 ? 2 : 1;
        expect(item.visit.overstayLevel).toBe(level);
        expect(item.visit.lastSeen).toMatchObject({ zoneName: expect.any(String), at: expect.any(String) });
        expect(item.visit.events.some((e) => e.type === 'security_notified')).toBe(level === 2);

        await ok(svc.extendVisit(item.visit.id, { validTo: new Date(Date.now() + 2 * HOUR).toISOString() }));
        const after = await ok(svc.getDeskToday());
        expect(after.attention.some((a) => a.kind === 'overstay' && a.visit.id === item.visit.id)).toBe(false);
        expect(after.kpis.overstay).toBe(desk.kpis.overstay - 1);
    });

    test('dữ liệu sinh sẵn hôm nay có một khách phải rời nằm trong hàng cần xử lý', async () => {
        const desk = await ok(svc.getDeskToday());
        expect(desk.attention.filter((a) => a.kind === 'must_leave')).toHaveLength(1);
        expect(desk.attention.some((a) => a.kind === 'no_photo')).toBe(true);
    });

    test('quét tại cổng theo mã lượt: vào, ra, mã sai, chưa vào mà quét ra', async () => {
        const v = await ok(svc.createVisit({ ...payload(), channel: 'walk_in' }));
        expect(await svc.scanAtGate('VS-000000-0000', { direction: 'in' })).toEqual({ success: false, message: 'Không tìm thấy lượt khách với mã này' });
        expect(await ok(svc.scanAtGate(v.code, { zoneId: 'zone-gate-main', direction: 'out' }))).toMatchObject({ outcome: 'access_denied', reason: 'not_on_site' });

        const enter = await ok(svc.scanAtGate(v.code.toLowerCase(), { zoneId: 'zone-gate-main', direction: 'in', scenario: 'normal' }));
        expect(enter.outcome).toBe('checked_in');
        expect(enter.visit.lastSeen.zoneName).toBe('Cổng chính');
        expect(await ok(svc.scanAtGate(v.code, { zoneId: 'zone-gate-main', direction: 'in' }))).toMatchObject({ outcome: 'access_denied', reason: 'already_inside' });

        const leave = await ok(svc.scanAtGate(v.code, { zoneId: 'zone-gate-east', direction: 'out' }));
        expect(leave.outcome).toBe('checked_out');
        expect(leave.visit.lastSeen.zoneName).toBe('Cổng phụ phía Đông');
    });

    test('lấy người cần gặp theo mã cho link mời', async () => {
        expect(await ok(svc.getPublicHost(ME_HOST_ID))).toMatchObject({ id: ME_HOST_ID, departmentName: 'Trung tâm CNTT' });
        expect(await svc.getPublicHost('khong-co')).toEqual({ success: false, message: 'Không tìm thấy người cần gặp' });
    });

    test('báo cáo và thống kê: khách phải rời vẫn tính là đã đến', async () => {
        const today = new Date();
        const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // Lượt hẹn sau 1 giờ có thể rơi sang ngày mai nếu chạy test sát nửa đêm.
        const range = { from: ymd(today), to: ymd(new Date(today.getTime() + 24 * HOUR)), groupBy: 'day' };
        const before = (await ok(svc.getVisitorStats(range))).kpis.totalVisits;
        const v = await insideVisit();
        await ok(svc.revokeVisit(v.id, { reason: 'Vi phạm nội quy' }));
        expect((await ok(svc.getVisitorStats(range))).kpis.totalVisits).toBe(before + 1);
    });
});
