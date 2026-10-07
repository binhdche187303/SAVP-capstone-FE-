import { io } from 'socket.io-client';
import { getAccessToken } from './request';
import { getWsBaseUrl } from './backendResolver';

let socket = null;

// Token getter — trang khách ghi đè bằng guestToken trong sessionStorage
const resolveToken = () => {
  const guestToken = sessionStorage.getItem('guestToken');
  return guestToken || getAccessToken() || null;
};

// [Fix realtime 2026-08-22 — B] Room ở server là per-connection: socket.io tự
// reconnect khi rớt mạng/BE restart/máy sleep, nhưng connection MỚI không nằm
// trong room nào cả. Trước đây FE chỉ emit `*:subscribe` 1 lần lúc component
// mount ⇒ sau lần rớt đầu tiên client im lặng vĩnh viễn, phải F5 mới thấy dữ
// liệu mới. Hai biến dưới đây là "ý định subscribe" bền vững của app, được
// replay lại ở mỗi sự kiện 'connect'.
//
// meetingRoomRefs đếm số listener đang cần room `meeting:{id}` — vì
// InMeetingRoom, MeetingAttendanceBoard và MinutesTabContent cùng subscribe 1
// meetingId. Trước đây component nào unmount trước (đổi tab trong phòng họp)
// sẽ emit `meeting:unsubscribe` và cắt luôn realtime của 2 component còn lại.
const meetingRoomRefs = new Map();
let wantsUserRoom = false;

// B2 (Zone realtime, gate ZONE_REALTIME_ENABLED ở BE — mặc định OFF): refcount
// theo zoneId, mirror ĐÚNG meetingRoomRefs ở trên — ZoneAccessLogCard/
// ZoneTimelineCard có thể cùng cần room `zone:{id}` tại các thời điểm khác
// nhau khi đổi tab, không để component nào cleanup trước cắt mất room của
// component còn lại.
const zoneRoomRefs = new Map();

const replaySubscriptions = (s) => {
  if (wantsUserRoom) s.emit('user:subscribe');
  for (const meetingId of meetingRoomRefs.keys()) {
    s.emit('meeting:subscribe', { meetingId });
  }
  for (const zoneId of zoneRoomRefs.keys()) {
    s.emit('zone:subscribe', { zoneId });
  }
};

// getSocket()/getGuestSocket() luôn được gọi từ trong phòng họp (sau khi người dùng đã
// đăng nhập/điều hướng qua vài trang), tức là sau khi request() đã await backendReady ít
// nhất 1 lần — nên đọc getWsBaseUrl() tại thời điểm gọi là đủ để đồng bộ đúng domain với
// REST, không cần đổi getSocket() thành async (tránh phải sửa thêm các nơi gọi nó).
export const getSocket = () => {
  if (!socket) {
    socket = io(getWsBaseUrl(), {
      path: '/ws',
      transports: ['websocket'],
      autoConnect: true,
      // [Fix realtime 2026-08-22 — A] auth PHẢI là callback, không phải object
      // tĩnh. Access token chỉ sống 900s (auth.login trả expiresIn=900); nếu
      // chốt cứng `auth: { token: resolveToken() }` thì mọi lần reconnect đều
      // gửi lại đúng token cũ đã hết hạn ⇒ EventsGateway.resolveIdentity() trả
      // null ⇒ `user:subscribe` bị từ chối ({ok:false}) và người dùng mất sạch
      // realtime. Callback được socket.io gọi lại ở TỪNG lần (re)connect nên
      // luôn lấy token vừa refresh trong localStorage.
      auth: (cb) => cb({ token: resolveToken() }),
    });
    socket.on('connect', () => replaySubscriptions(socket));
  }
  return socket;
};

// Dùng khi khách vào /guest/meeting — cần socket mới với guestToken
export const getGuestSocket = () => {
  const guestToken = sessionStorage.getItem('guestToken');
  if (!guestToken) return null;
  // Nếu socket hiện tại đang chạy với accessToken nhân viên, tạo socket tạm riêng
  return io(getWsBaseUrl(), {
    path: '/ws',
    transports: ['websocket'],
    autoConnect: true,
    auth: (cb) => cb({ token: sessionStorage.getItem('guestToken') }),
  });
};

// Có refcount: chỉ thực sự rời room khi listener CUỐI CÙNG của meetingId đó
// cleanup. Xem chú thích meetingRoomRefs phía trên.
export const subscribeToMeeting = (meetingId) => {
  const s = getSocket();
  const prev = meetingRoomRefs.get(meetingId) ?? 0;
  meetingRoomRefs.set(meetingId, prev + 1);
  if (prev === 0) s.emit('meeting:subscribe', { meetingId });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (meetingRoomRefs.get(meetingId) ?? 1) - 1;
    if (count > 0) {
      meetingRoomRefs.set(meetingId, count);
      return;
    }
    meetingRoomRefs.delete(meetingId);
    s.emit('meeting:unsubscribe', { meetingId });
  };
};

// Room `user:{userId}` dùng chung cho nhiều listener độc lập (meeting-request
// updates, notification bell, ...) trên cùng 1 socket. Chỉ join, KHÔNG bao giờ
// tự emit 'user:unsubscribe' khi 1 listener cleanup — vì các listener khác
// đang dùng chung room vẫn cần nhận event. Socket tự rời mọi room khi disconnect
// (logout/đóng tab) nên không cần rời tay.
const ensureUserRoomJoined = () => {
  const s = getSocket();
  wantsUserRoom = true;
  s.emit('user:subscribe');
  return s;
};

// Dùng ở /manager/meeting-approvals — nhận `meeting_request.updated` realtime
// khi có yêu cầu mới/được duyệt/từ chối/hết hạn, thay vì phải bấm "Tải lại".
// BE chỉ cho join room user:{userId} của chính người gọi (bỏ qua mọi userId
// truyền lên) — xem EventsGateway#handleUserSubscribe.
export const subscribeToMeetingRequestUpdates = (onUpdate) => {
  const s = ensureUserRoomJoined();
  s.on('meeting_request.updated', onUpdate);
  return () => {
    s.off('meeting_request.updated', onUpdate);
  };
};

// Dùng ở chuông thông báo (NotificationBell) — nhận `notification.created`
// realtime ngay khi BE tạo notification mới cho user hiện tại (NotificationsService.
// createNotification → WebsocketService.emitToUser), để badge số lượng chưa đọc
// và banner cập nhật ngay, không cần load lại trang.
export const subscribeToNotificationUpdates = (onCreate) => {
  const s = ensureUserRoomJoined();
  s.on('notification.created', onCreate);
  return () => {
    s.off('notification.created', onCreate);
  };
};

// Dùng ở Trung tâm Cảnh báo An ninh (SecurityAlerts) — nhận `security.alert.new`
// khi BE tạo cảnh báo an ninh MỚI (SecurityAlertNotifierService → emitToUser cho
// người có quyền security_alert.read). Cảnh báo đang mở có thêm lượt → `security.alert.updated`
// (onUpdated, tuỳ chọn) — chỉ cập nhật màn hình, KHÔNG chuông/in-app.
export const subscribeToSecurityAlerts = (onNew, onUpdated) => {
  const s = ensureUserRoomJoined();
  s.on('security.alert.new', onNew);
  if (onUpdated) s.on('security.alert.updated', onUpdated);
  return () => {
    s.off('security.alert.new', onNew);
    if (onUpdated) s.off('security.alert.updated', onUpdated);
  };
};

// Dùng ở ZoneManagement (ZoneAccessLogCard/ZoneTimelineCard) — nhận
// `zone.presence.updated` realtime khi BE bật ZONE_REALTIME_ENABLED (mặc định
// OFF — khi tắt, subscribe vẫn join room bình thường nhưng không bao giờ
// nhận event, KHÔNG lỗi gì; polling silent 2s/2s/6s ở FE vẫn là nguồn cập
// nhật chính, đây chỉ là lớp "tăng tốc" tuỳ chọn). Lọc theo zoneId trong
// payload — BE emit đúng room `zone:{zoneId}` nhưng lọc thêm ở client để an
// toàn nếu 1 socket đang join nhiều zone room cùng lúc.
export const subscribeToZonePresence = (zoneId, onUpdate) => {
  const s = getSocket();
  const prev = zoneRoomRefs.get(zoneId) ?? 0;
  zoneRoomRefs.set(zoneId, prev + 1);
  if (prev === 0) s.emit('zone:subscribe', { zoneId });

  const handler = (payload) => {
    if (payload?.zoneId === zoneId) onUpdate(payload);
  };
  s.on('zone.presence.updated', handler);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    s.off('zone.presence.updated', handler);
    const count = (zoneRoomRefs.get(zoneId) ?? 1) - 1;
    if (count > 0) {
      zoneRoomRefs.set(zoneId, count);
      return;
    }
    zoneRoomRefs.delete(zoneId);
    s.emit('zone:unsubscribe', { zoneId });
  };
};

// Gọi khi logout: huỷ socket đang mang token của người dùng cũ và xoá mọi ý
// định subscribe, để phiên đăng nhập kế tiếp tạo socket mới với token mới.
export const resetSocket = () => {
  meetingRoomRefs.clear();
  zoneRoomRefs.clear();
  wantsUserRoom = false;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
