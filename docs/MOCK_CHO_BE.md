# Phần FE đang giả lập — việc BE cần làm

Tài liệu gom mọi chỗ FE dùng dữ liệu giả (mock) hoặc dữ liệu chỉ có từ seed demo, kèm API/DB mà BE cần bổ sung.
Trong code, chỗ còn mock có comment `// MOCK-BE:` (`grep -rn "MOCK-BE" src`).

## 📝 CHANGELOG & REVISION HISTORY
| Ngày cập nhật | Tóm tắt thay đổi | Các dòng thay đổi |
| :--- | :--- | :--- |
| 2026-11-13 | BE đã làm xong mục "Đồng bộ UEL — 1 nút + tự động": `POST /uel-sync/run-all` (lịch học chỉ từ hôm nay tới +`sessionDaysAhead`, không lấy quá khứ), tự nhận học kỳ, cài đặt mới, cron động, `status` mới, chặn hủy nhầm. Cột "Hiện trạng BE" ghi rõ. | Mục "Đồng bộ UEL — 1 nút + tự động" |
| 2026-11-13 | Thêm mục "Lịch họp VPĐT": cờ `MEETING_BOOKING_ENABLED` để ẩn/hiện "Đăng ký họp" (hiện đang bật). `/teacher/my-schedule` (và `/employee`, `/manager` dùng chung `PersonalCalendar`) hiển thị lịch mock theo tài liệu "Mô tả về Lịch tuần UEL trên VPĐT": 3 loại lịch, điểm danh, ra vào trực tiếp, báo cáo. Ghi hợp đồng API BE cần làm. | Đầu file, mục "Lịch họp VPĐT" |
| 2026-11-12 | Thêm mục "Đồng bộ UEL — 1 nút + tự động": trang `/system-admin/uel-sync` có 1 nút "Đồng bộ toàn bộ" và cài đặt hằng ngày/hằng tuần + giờ chạy. FE xem trước bằng mock (`REACT_APP_UEL_SYNC_MOCK=true`); ghi hợp đồng API BE cần làm. | Đầu file, mục "Đồng bộ UEL — 1 nút + tự động" |
| 2026-11-11 | Bỏ hết `mockClassrooms` và mock điểm danh lớp: Home SV/GV, Dashboard điểm danh, Analytics, chuyên cần SV, Recordings và SystemSettings chỉ gọi API `/class-attendance/*`. Service không còn fallback cục bộ. Ghi chú fallback quét giả của BE. | Mục "Lịch học / lịch dạy", "Ghi hình & biên bản" |
| 2026-11-11 | Thêm bảng changelog. Thêm mục "Lịch học / lịch dạy": `/student/schedule` và `/teacher/schedule` bỏ `mockClassrooms`, đọc `GET /class-attendance/sessions` (buổi học thật từ TKB UEL). | Đầu file, mục "Lịch học / lịch dạy (STUDENT/TEACHER)" |

---

## Lịch học / lịch dạy (STUDENT/TEACHER) — đã chuyển sang BE thật

| Trước | Nay | Còn lại |
|---|---|---|
| `pages/classroom/StudentSchedule.jsx` và `TeacherSchedule.jsx` trộn `GET /class-attendance/classes` (giờ đọc từ `class_sections.note`) với `mockClassrooms`. | Cả hai dùng chung `WeeklySessionSchedule.jsx` và gọi `GET /class-attendance/sessions?from=&to=` (tối đa 62 ngày), đọc từ bảng `class_sessions`. Phạm vi xem giống `/classes`: GV thấy lớp mình phụ trách (`lecturer_user_id`), SV thấy lớp đã đăng ký, admin thấy tất cả. Không còn mock và không fallback: API lỗi thì hiện thông báo lỗi. | Buổi học chỉ có khi đã chạy bước 6 "Lịch học" của đồng bộ UEL. Hiện `tkb_lophp_1ngay` của UEL trả về 0 dòng, nên phải chạy theo mã GV/SV. Mỗi lớp HP chỉ lưu 1 giảng viên. Các trang khác (Home SV/GV, Dashboard điểm danh, Analytics, chuyên cần SV, Recordings, SystemSettings) cũng đã bỏ `mockClassrooms` và chỉ đọc API thật. UEL không có `note`, nên lịch và phòng trên thẻ lớp lấy từ buổi học trong ngày. |

**BE cần sửa:** `POST /class-attendance/scan` hiện vẫn tự chọn sinh viên đầu tiên chưa điểm danh (chiều vào) hoặc người đầu tiên đang có lượt vào (chiều ra) khi HGVision không nhận diện được ai. Đây là điểm danh giả. Khi không nhận diện được, BE phải trả kết quả "không nhận diện được" và không ghi điểm danh.

---

## Đồng bộ UEL — 1 nút + tự động (BE đã làm 2026-11-13)

Tắt mock (bỏ `REACT_APP_UEL_SYNC_MOCK`) để FE gọi BE thật. FE: [UelSync.jsx](../src/pages/systemAdmin/UelSync.jsx). Mock ở [uelSyncMock.js](../src/mocks/uelSyncMock.js), chỉ bật ở bản dev khi `.env.local` có `REACT_APP_UEL_SYNC_MOCK=true`. Xem trước không cần BE: mở `/dev/uel-sync-preview` (gắn phiên SYSTEM_ADMIN giả rồi chuyển sang trang). Tắt mock thì FE gọi BE thật theo hợp đồng dưới.

| API | Hợp đồng | Hiện trạng BE |
|---|---|---|
| `POST /uel-sync/run-all` | Body rỗng. 202 `{accepted, run}`, 409 khi đang chạy. Chạy nền đủ 6 bước theo thứ tự: đơn vị → cán bộ → SV → (tự nhận học kỳ) → lớp HP → đăng ký → lịch học từ hôm nay đến `sessionDaysAhead` ngày. | ✅ Đã có. Khoảng lịch học = hôm nay (giờ VN) → hôm nay + `sessionDaysAhead` − 1, không đụng ngày quá khứ. |
| Tự nhận học kỳ | `termMode='auto'`: đọc `tkb_lophp_1ngay` toàn trường các ngày tới, lấy các cặp (`nam_hoc`, `hoc_ky`) khác nhau. Chồng kỳ thì chạy bước 4–5 cho từng kỳ. `termMode='fixed'`: dùng `namHoc`/`hocKy`. Ghi kết quả vào `run.options.terms`. | ✅ Đã có. TKB tải lúc nhận kỳ được dùng lại cho bước lịch học (không gọi 2 lần). API không trả kỳ nào thì lấy học kỳ `uel_api` trong DB còn hiệu lực. Mỗi kết quả bước 4–5 có thêm `term`. |
| `GET/PUT /uel-sync/settings` | Thêm `autoEnabled`, `frequency` (`daily`/`weekly`), `weekday` (0=CN..6), `time` (`HH:mm`), `termMode` (`auto`/`fixed`). Giữ `sessionDaysAhead` (1..120), `namHoc`, `hocKy`. Lưu `system_configs`. | ✅ Đã có (khóa mới `uel_sync.auto_enabled/frequency/weekday/time/term_mode`, tự tạo khi lưu lần đầu). |
| Bộ hẹn giờ | Đọc cài đặt, đăng ký cron động (SchedulerRegistry), sửa giờ là áp dụng ngay, không cần khởi động lại. Chỉ chạy khi env `SCHEDULER_ENABLED` + `SCHEDULER_UEL_SYNC_ENABLED` bật (bật trên 1 instance BE). | ✅ Đã có (job `uel-sync-auto`). |
| `GET /uel-sync/status` | `schedule = {enabled, serverAllowed, nextRunAt}`; `lastRun.currentStep` (bước đang chạy) để FE vẽ tiến trình. | ✅ Đã có (giữ thêm `label`). |
| Chặn hủy nhầm | Bước lịch học: ngày nào API trả 0 buổi mà DB đang có buổi thì không hủy, ghi cảnh báo. | ✅ Đã có. |

FE đã bỏ form chạy từng bước và form chạy theo mã GV/SV. `POST /uel-sync/run` vẫn để lại ở BE cho việc gỡ lỗi.

---

## Lịch họp VPĐT (FE đang mock, chưa có API VPĐT)

Lịch họp của trường đăng ký và duyệt trên **Văn phòng điện tử (VPĐT)**. SAVP chỉ hiển thị lịch, điểm danh vào họp, theo dõi
người ra vào theo thời gian thực và làm báo cáo. Chưa có API VPĐT, nên FE dùng mock dựng theo tài liệu
"Mô tả về Lịch tuần UEL trên VPĐT".

- **Cờ** (`src/config/featureFlags.js`):
  - `MEETING_BOOKING_ENABLED` (đang `true` — bật lại 2026-11-13 theo yêu cầu): đặt `false` để ẩn menu "Đăng ký họp",
    lối tắt trên trang chủ Nhân viên và nút "Đăng ký họp" trên trang Lịch cá nhân. Route `/book` luôn còn.
  - `MEETING_CALENDAR_MOCK_ENABLED`: bật ở bản dev. Đặt `REACT_APP_MEETING_CALENDAR_MOCK=false` để gọi `GET /me/schedule`
    thật. Bản production luôn tắt.
- **Code mock**:
  - `src/mocks/meetingCalendarMock.js`: 18 cuộc họp, từ −14 đến +12 ngày quanh hôm nay. Có 1 cuộc "đang diễn ra" luôn
    neo vào giờ hiện tại, cùng các cuộc chờ duyệt, đã hủy, Online, đi công tác. Mã giả `mock-…`, người giả `CBxxxx`;
    người đang đăng nhập được chèn vào danh sách tham dự.
  - `src/pages/employee/MockMeetingDetailPage.jsx`: **trang** chi tiết cuộc họp `/:role/meeting/mock-…` (4 tab, tab nằm
    trên URL `?tab=`). `MeetingDetailRoute.jsx` chọn trang mock khi id là `mock-…`, id thật vẫn vào `MeetingDetail.jsx`.
  - `src/pages/employee/MockMyMeetingAttendance.jsx`: tab "Lịch sử tham dự".
  - `PersonalCalendar.jsx`: thêm lọc loại lịch, thẻ số liệu tháng và chú giải màu.
  - Sửa điểm danh hay duyệt lý do **chỉ lưu trong state** (nhãn "Demo – chưa có API VPĐT").
- **Quy tắc điểm danh đang giả định** (cần chốt với trường):
  - Trễ: vào sau giờ bắt đầu hơn 5 phút.
  - Về sớm: ra trước giờ kết thúc hơn 15 phút.
  - Điểm trừ: vắng −2, trễ và về sớm −2, trễ −1, về sớm −1, đúng giờ 0.
  - Lý do được chủ trì hoặc thư ký duyệt thì không trừ điểm.
  - Phòng Online không có camera, thư ký điểm danh tay.

| API | Hợp đồng FE đang dùng (theo mock) | Hiện trạng BE |
|---|---|---|
| `GET /me/schedule?from=&to=&status=` | Giữ dạng `{success, data:{items}}`. Mỗi item thêm: `calendarType` (`leadership` lịch lãnh đạo trường / `other` lịch hoạt động khác / `unit` lịch đơn vị), `hostName`, `attendanceEnabled`, `myAttendance {status, checkInAt, checkOutAt, points, reason, reasonStatus, excused}`, `status` thêm `cancelled`. | Có API, chưa có các trường trên và chưa lấy lịch từ VPĐT. |
| Đồng bộ VPĐT → SAVP | Kéo lịch đã duyệt (và trạng thái chờ duyệt/hủy) từ VPĐT. Ánh xạ phòng VPĐT sang phòng/cửa có camera. Ánh xạ người theo mã CB. Đồng bộ lại khi VPĐT sửa hoặc hủy lịch. | Chưa có (chờ API VPĐT). |
| `GET /meetings/:id/vpdt-detail` (tên tùy BE) | Các trường VPĐT: `content`, `approval`/`approvedBy`/`cancelReason`, `room`/`place`, `vehicle`, `host`, `secretary`, `participantGroups[{name, members[]}]`, `attachments[]`, `requireReport`, `requireConclusion`, `restrictedView`, `reminderMinutes`, `recurrence`, `attendanceEnabled`, `attendanceSource` (`camera`/`manual`), `myRole`. | Chưa có. |
| `GET /meetings/:id/attendance` | Mỗi người tham dự: `{userCode, fullName, unit, role, required, checkInAt, checkOutAt, status, points, source, reason, reasonStatus, note}` kèm `summary` (số có mặt, trễ, về sớm, vắng, tổng điểm). Trạng thái tính theo quy tắc ở trên, lấy từ sự kiện camera ở cửa phòng. | Chưa có theo quy tắc này. |
| `GET /meetings/:id/access-log?since=` | Nhật ký ra vào trực tiếp: `{at, direction in/out, userCode?, fullName?, unit?, door, confidence, identified}`, kèm số người đang trong phòng. FE gọi lại mỗi 3 giây khi cuộc họp đang diễn ra (có thể chuyển sang WebSocket). | Chưa có. |
| `PATCH /meetings/:id/attendance/:userCode` | Chủ trì hoặc thư ký sửa giờ vào, trạng thái (kể cả `excused`) và ghi chú. Khóa khi cuộc họp kết thúc (BE cần chốt thời hạn sửa). Ghi audit. | Chưa có. |
| `POST /meetings/:id/attendance/reason` và `.../reason/:userCode/approve` | Người tham dự gửi lý do trước hoặc trong cuộc họp; chủ trì hoặc thư ký duyệt thì điểm về 0. | Chưa có. |
| `GET /me/meeting-attendance?from=&to=` | Lịch sử tham dự của chính mình, gồm danh sách và tổng điểm trừ. | Chưa có (FE đang tự tổng hợp từ mock). |
| Báo cáo cuộc họp | Tab "Báo cáo" xuất CSV ở FE. Nên chuyển sang báo cáo quy chuẩn (`render-document`) và thêm báo cáo theo đơn vị hoặc nhân sự. | Chưa có. |

---

## 2.2 Phân hệ Camera AI — đã chuyển sang BE thật

Không còn mock/localStorage. Cấu hình theo từng camera lưu trong `iot_devices.metadata_json` (theo tiền lệ
`ai_config`/`rtsp_config`, không thêm bảng). [src/mocks/cameraMock.js](../src/mocks/cameraMock.js) chỉ còn hằng số,
giá trị mặc định khi camera chưa cấu hình, và hàm tính hiển thị.

| Mục | API / nơi lưu | Còn lại (chỉ seed / chưa có thiết bị thật) |
|---|---|---|
| 2.2.1 Loại camera | `IoTDeviceType.ANPR_CAMERA`; đăng ký kèm `metadata_json.anpr = {lane_direction, lane_no}`; `GET /iot-devices/anpr-stats?date=` (lượt xe/camera, vào/ra, giờ VN) | Lượt xe là `iot_device_events` (`ivss_vehicle_event`) do seed part9 sinh |
| 2.2.2 Theo dõi trạng thái | Trạng thái, cảnh báo `device_error` | — |
| 2.2.3 Lịch sử kết nối | `GET /iot-devices/:id/connection-history` | — |
| 2.2.4 Sơ đồ lắp đặt | `PUT /iot-devices/layout` `{floor_key, positions[{device_id,x,y,angle}], reset?}` → `metadata_json.layout` | Mặt bằng FE tự vẽ từ zone/phòng (chưa có ảnh mặt bằng) |
| 2.2.6 Cấu hình AI | `PATCH /iot-devices/:id/ai-config`: 3 cờ + `confidence_threshold`, `detection_zone`, `active_from/to`, `active_days`, `stranger_alert`, `liveness_check`, `mask_support`, `low_light` → `metadata_json.ai_config`. `anpr_camera` đã cấu hình AI được | Là cấu hình khai báo — pipeline AI / face server **chưa đọc** các trường nâng cao |
| 2.2.7 Ghi hình & lưu trữ | `PATCH /iot-devices/:id/recording-policy` `{mode, retention_days, bitrate_mbps, schedule[7]}` → `metadata_json.recording`; `GET /iot-devices/recording-storage` (tổng ổ = env `RECORDING_STORAGE_CAPACITY_GB`, mặc định 20480) | `used_gb` đọc `metadata_json.recording_stats` do seed part9 ghi; chưa có kênh đẩy lịch xuống NVR, chưa có job xoá theo `retention_days` |

Response `/iot-devices` đã có `zone_id`. Lưu sơ đồ và lịch ghi có ghi audit (`configure_layout`, `configure_recording`).

### Việc BE còn lại khi có thiết bị thật
- Job đồng bộ dung lượng từ NVR → `metadata_json.recording_stats.used_gb`; đẩy `recording` xuống recorder.
- Pipeline AI / face server đọc `ai_config` nâng cao (dùng lại cho 2.3.6, 2.3.7).
- Không bắt buộc: ảnh mặt bằng theo tầng thay cho mặt bằng FE tự vẽ.

### Dữ liệu demo & môi trường (BE)
- **Seed part8** `scripts/demo-seed/part8-cameras.ts`: 4 camera ANPR; 30 ngày lịch sử online/offline (audit) + cảnh
  báo `device_error`; camera `DEMO-CAM-A-COR-2` đang mất kết nối.
- **Seed part9** `scripts/demo-seed/part9-camera-stats.ts` (cần part8): ~30 ngày lượt xe qua từng camera ANPR
  (`payload.demo=true`) và `recording_stats.used_gb` cho camera demo. Lịch ghi / vị trí sơ đồ không seed (FE dùng mặc định).
- Chạy: `npm run demo:seed -- part8`, `npm run demo:seed -- part9`. Lệnh purge xoá kèm dữ liệu các part này.
- **Tắt dò offline khi demo:** `DEVICE_OFFLINE_DETECT_ENABLED=false` trong `.env` local (nếu không, probe đánh dấu
  camera demo IP giả là offline). Chạy thật thì bật lại.

---

## 2.3 Phân hệ nhận diện khuôn mặt AI

_Chưa làm — ghi chú sẽ bổ sung khi triển khai từng mục._

| Mục | Phần đã thật (BE) | Phần mock (FE) | Việc BE cần làm |
|---|---|---|---|
| 2.3.1 Phát hiện khuôn mặt theo thời gian thực | | | |
| 2.3.2 Nhận diện nhiều người đồng thời | | | |
| 2.3.3 So khớp với cơ sở dữ liệu nhân sự | | | |
| 2.3.4 Theo dõi lịch sử xuất hiện của từng người | | | |
| 2.3.5 Quản lý người lạ và danh sách cảnh báo | | | |
| 2.3.6 Cảnh báo giả mạo hoặc sử dụng ảnh | | | |
| 2.3.7 Nhận diện khi thiếu sáng / đeo khẩu trang (nếu camera hỗ trợ) | | | |

Ghi chú liên quan: `liveness_check`, `mask_support`, `low_light` (2.2.6) đã lưu BE trong `ai_config`, sẽ được dùng
lại cho 2.3.6 và 2.3.7.

---

## Ghi hình & biên bản buổi học (TEACHER) — mockup

| Phần đã thật (BE) | Phần mock (FE) | Việc BE cần làm |
|---|---|---|
| Ghi hình + biên bản AI cho **cuộc họp** (`recording_sessions.meeting_id` NOT NULL). | `/teacher/recordings` (`pages/classroom/TeacherRecordings.jsx`): danh sách buổi đã dạy trong 60 ngày lấy từ `GET /class-attendance/sessions` (buổi thật), mọi buổi "Chưa có ghi hình / Chưa có biên bản". | Liên kết buổi học với ghi hình: hoặc `class_sessions.meeting_id` (mỗi buổi 1 meeting ẩn → tái dùng ghi hình/biên bản), hoặc `recording_sessions.class_session_id` + `meeting_id` nullable. API `GET /teacher/class-sessions/:id/recordings` (chỉ giảng viên của lớp). FE gắn API ghi hình vào từng buổi + dùng lại player của `employee/Recordings.jsx`. |

---

## Mẫu báo cáo quy chuẩn (NĐ 30/2020) — bản xuất "quy chuẩn"

| Phần đã thật (BE) | Phần mock (FE) | Việc BE cần làm |
|---|---|---|
| Nhánh `feature/report-template` (capstone-be): bảng `report_templates`, API `/report-templates` (CRUD, `defaults`, `signers?q`, `assets`, `preview`), bộ dựng PDF/Word/Excel theo mẫu, export nhận `mode: 'standard'`, `templateId`, `signers`, `addressee`, `recipients`; `GET /reports/exports/recent` trả thêm `standard` để "Xuất lại". | Cờ `REACT_APP_REPORT_MOCK=true`: mẫu lưu localStorage khóa `savp.reportTemplateMock` (seed 1 mẫu "Mẫu chuẩn VISMA (NĐ 30)"), ảnh logo chỉ sống trong phiên, danh sách người ký là 5 tên giả. **Xem thử PDF/Word/Excel và xuất bản quy chuẩn báo lỗi ở chế độ mock** (bộ dựng nằm ở BE). | Chạy migration `20261112000001-CreateReportTemplates`. Quyền `report.template.manage` hiện gán SYSTEM_ADMIN + BUSINESS_ADMIN (văn thư đơn vị — làm sau). ~~Chưa có mẫu seed~~ → đã có migration `20261112000002-SeedDefaultReportTemplate` (mẫu "Mẫu chuẩn VISMA (NĐ 30)", mọi loại báo cáo, mặc định, 2 ô ký đều tùy chọn). Chưa test API sống / e2e DB (`RUN_DB_TESTS=1`). |

**Bản quy chuẩn ở các trang tự tổng hợp dữ liệu (2026-11-12)**

| Phần đã thật (BE) | Phần mock (FE) | Việc BE cần làm |
|---|---|---|
| `POST /report-templates/render-document` (quyền `report.center.export`): nhận `{ format, mode:'standard', templateId, signers, addressee?, recipients?, document }`, trả file ngay (không qua job). `document` = `{ title, period, filterLines, dataSource, kpis, notes, tables[] }`, tối đa 10 bảng / 20.000 dòng. Chỉ nhận mẫu "mọi loại báo cáo". Ghi audit `report_document_export`. | FE dựng `document` từ spec của `downloadReport` (`src/utils/standardDocument.js`). Trang dùng: Nhật ký ra/vào phòng, Truy vết camera, Hành trình theo người, Lưu lượng khu vực (`ExportMenu askMode`). `ExportReportModal` (Kiểm soát xe, Sự kiện an ninh, Hiệu suất phòng) chuyển sang `/reports/center/<loại>/exports` khi chọn bản quy chuẩn hoặc Word. **Chế độ mock không dựng được bản quy chuẩn.** | Các trang khác vẫn chỉ xuất bản thường (xem danh sách ở báo cáo bàn giao). |
