# Phần FE đang giả lập — việc BE cần làm

Tài liệu gom mọi chỗ FE dùng dữ liệu giả (mock) hoặc dữ liệu chỉ có từ seed demo, kèm API/DB mà BE cần bổ sung.
Trong code, chỗ còn mock có comment `// MOCK-BE:` (`grep -rn "MOCK-BE" src`).

## 📝 CHANGELOG & REVISION HISTORY
| Ngày cập nhật | Tóm tắt thay đổi | Các dòng thay đổi |
| :--- | :--- | :--- |
| 2026-11-11 | Bỏ hết `mockClassrooms` và mock điểm danh lớp: Home SV/GV, Dashboard điểm danh, Analytics, chuyên cần SV, Recordings và SystemSettings chỉ gọi API `/class-attendance/*`. Service không còn fallback cục bộ. Ghi chú fallback quét giả của BE. | Mục "Lịch học / lịch dạy", "Ghi hình & biên bản" |
| 2026-11-11 | Thêm bảng changelog. Thêm mục "Lịch học / lịch dạy": `/student/schedule` và `/teacher/schedule` bỏ `mockClassrooms`, đọc `GET /class-attendance/sessions` (buổi học thật từ TKB UEL). | Đầu file, mục "Lịch học / lịch dạy (STUDENT/TEACHER)" |

---

## Lịch học / lịch dạy (STUDENT/TEACHER) — đã chuyển sang BE thật

| Trước | Nay | Còn lại |
|---|---|---|
| `pages/classroom/StudentSchedule.jsx` và `TeacherSchedule.jsx` trộn `GET /class-attendance/classes` (giờ đọc từ `class_sections.note`) với `mockClassrooms`. | Cả hai dùng chung `WeeklySessionSchedule.jsx` và gọi `GET /class-attendance/sessions?from=&to=` (tối đa 62 ngày), đọc từ bảng `class_sessions`. Phạm vi xem giống `/classes`: GV thấy lớp mình phụ trách (`lecturer_user_id`), SV thấy lớp đã đăng ký, admin thấy tất cả. Không còn mock và không fallback: API lỗi thì hiện thông báo lỗi. | Buổi học chỉ có khi đã chạy bước 6 "Lịch học" của đồng bộ UEL. Hiện `tkb_lophp_1ngay` của UEL trả về 0 dòng, nên phải chạy theo mã GV/SV. Mỗi lớp HP chỉ lưu 1 giảng viên. Các trang khác (Home SV/GV, Dashboard điểm danh, Analytics, chuyên cần SV, Recordings, SystemSettings) cũng đã bỏ `mockClassrooms` và chỉ đọc API thật. UEL không có `note`, nên lịch và phòng trên thẻ lớp lấy từ buổi học trong ngày. |

**BE cần sửa:** `POST /class-attendance/scan` hiện vẫn tự chọn sinh viên đầu tiên chưa điểm danh (chiều vào) hoặc người đầu tiên đang có lượt vào (chiều ra) khi HGVision không nhận diện được ai. Đây là điểm danh giả. Khi không nhận diện được, BE phải trả kết quả "không nhận diện được" và không ghi điểm danh.

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
