# Phần FE đang giả lập — việc BE cần làm

Tài liệu gom mọi chỗ FE dùng dữ liệu giả (mock) hoặc dữ liệu chỉ có từ seed demo, kèm API/DB mà BE cần bổ sung.
Trong code, chỗ còn mock có comment `// MOCK-BE:` (`grep -rn "MOCK-BE" src`).

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
