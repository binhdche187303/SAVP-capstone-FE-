# Kịch bản demo: Khách đến làm việc (2.10) và Báo cáo & thống kê (2.13)

Tài liệu cho người chạy buổi review với khách hàng. Hai phân hệ này đang chạy bằng **dữ liệu minh họa** ngay trên trình duyệt; BE chưa có.

## 1. Chuẩn bị (5 phút trước buổi)

| Việc | Ghi chú |
|---|---|
| Chạy FE và BE như bình thường | BE chỉ cần cho đăng nhập và các màn cũ. Hai phân hệ mới không gọi BE. |
| Có sẵn 3 tài khoản | Business Admin, Manager, Employee. |
| Dùng **một cửa sổ Chrome thường**, không dùng ẩn danh | Dữ liệu demo lưu theo trình duyệt. Trang đăng ký công khai mở ở tab khác **cùng cửa sổ** thì lượt đăng ký mới hiện ở màn quản trị. Tab ẩn danh có kho dữ liệu riêng nên sẽ không thấy. |
| Đăng nhập tài khoản Employee một lần trước | Trong dữ liệu minh họa, người đang đăng nhập đóng vai "người được gặp". Tên người đó sẽ hiện trong ô tìm người cần gặp ở trang đăng ký. |
| Cho phép camera và cửa sổ bật lên cho trang | Camera để chụp ảnh khuôn mặt. Cửa sổ bật lên để xuất PDF. Không có camera thì dùng nút "Tải ảnh lên". |
| Bấm **Đặt lại dữ liệu demo** | Nút nằm ở dải xanh đầu màn Quầy lễ tân hoặc Trung tâm báo cáo. Dữ liệu "hôm nay" được dựng theo giờ hiện tại, nên đặt lại sát giờ demo. |

Địa chỉ trang công khai: `/visitor/register`, `/visitor/status` và `/visitor/gate` (màn hình cổng mô phỏng).

### Khách tiếp cận trang đăng ký bằng cách nào

| Tình huống | Lối vào |
|---|---|
| Khách được hẹn trước | Người được gặp vào "Khách của tôi" → "Sao chép link đăng ký" rồi gửi cho khách; link chọn sẵn người cần gặp. |
| Khách tự tìm đến | Trang đăng nhập có dòng "Khách đến làm việc? Đăng ký tại đây". |
| Khách đến cổng mà chưa đăng ký | Quét mã QR in từ Quầy lễ tân → "Mã QR đăng ký", hoặc mã QR ở góc Màn hình cổng. |

### Ai phải trực

Không ai phải trực cho đường thông thường: khách đã đăng ký, đã duyệt và có ảnh thì camera tại cổng tự cho vào và tự báo người được gặp. Quầy lễ tân (hoặc bảo vệ cổng) chỉ xử lý hàng "Cần xử lý": khách phải rời, khách quá giờ, chưa ghi nhận giờ ra, cần xác minh thủ công, chưa có ảnh.

## 2. Kịch bản 9 bước

| # | Vai trò | Màn hình | Thao tác | Khách hàng thấy gì | Checklist |
|---|---|---|---|---|---|
| 1 | Khách (tab mới, không cần đăng nhập) | `/visitor/register` | Điền 4 bước: thông tin, chọn người cần gặp (gõ tên tài khoản Employee), chụp ảnh khuôn mặt, gửi | Mã lượt `VS-…`, mã QR, trạng thái "Chờ duyệt" | 52, 53 |
| 2 | Business Admin | Khách → Quản lý khách | Mở lượt vừa đăng ký ở tab "Chờ duyệt", bấm Duyệt, chỉnh khung giờ và khu vực, xác nhận | Quyền ra vào theo thời gian; khu có FaceGate và khu chỉ có camera được ghi rõ; dòng thời gian có "Đã duyệt", "Đã gửi email" | 54 |
| 3 | Employee | Khách của tôi | Xem khối "Cần bạn duyệt" và bảng Thông báo; thử Mời khách | Người được gặp tự duyệt khách của mình, nhận thông báo; khách được mời "chưa có ảnh" | 52, 55 |
| 4 | Thiết bị cổng (tab mới) | Quầy lễ tân → "Cổng" ở dòng khách vừa duyệt, mở `/visitor/gate?code=…` | Cho phép camera, bấm "Quét khuôn mặt" | Màn xanh "Cho phép vào", ảnh đăng ký cạnh ảnh camera, độ khớp %, "Đã báo <người được gặp>" | 53, 55 |
| 5 | Thiết bị cổng | Màn hình cổng, khách đã duyệt khác | Chọn tình huống "Đến ngoài khung giờ" rồi quét; thử "Độ khớp thấp" | Màn đỏ "Từ chối" kèm lý do; màn vàng "Vui lòng đến quầy lễ tân"; cả hai hiện ở Quầy lễ tân | 54 |
| 5b | Business Admin | Quản lý khách → mở khách đang trong khuôn viên → "Thu hồi quyền" | Nhập lý do; sang Quầy lễ tân xem "Cần xử lý"; ở Màn hình cổng chọn "Chiều ra" rồi quét | Lượt thành "Phải rời khuôn viên", vẫn được đếm là đang ở trong; chiều vào bị từ chối, chiều ra vẫn mở; ra xong lượt thành "Đã rời · Bị thu hồi quyền" | 54, 55 |
| 5c | Business Admin | Quầy lễ tân → "Xử lý" ở khách quá giờ | Xem "Lần cuối camera thấy"; thử Gia hạn, hoặc "Đóng lượt thủ công" với hai lý do | Quá 30 phút thì ghi "đã báo bảo vệ"; đóng thủ công bắt buộc lý do; "không tìm thấy" thành "Chưa ghi nhận giờ ra" | 54, 55 |
| 6 | Business Admin | Lịch sử khách, Thống kê khách | Tìm theo tên, bấm tên để xem các lượt của khách; mở Thống kê | Lịch sử đầy đủ mốc camera, nhãn "Giờ ra nhập tay" ở lượt đóng thủ công; thống kê theo đơn vị và thời gian | 56, 57 |
| 7 | Business Admin | Báo cáo → Trung tâm báo cáo → Khách đến làm việc | Đổi bộ lọc, xuất PDF, Excel, Word | Số liệu khớp màn Thống kê; ba file mở được | 77, 79 |
| 8 | Business Admin | Trung tâm báo cáo | Lướt 6 báo cáo còn lại | Chuyên cần cán bộ, chuyên cần sinh viên, ra vào khuôn viên, phòng họp, phương tiện, an ninh | 72–76, 78 |
| 9 | Business Admin | Báo cáo → Lịch gửi báo cáo, Lịch sử gửi | Tạo lịch hằng tuần, bấm Gửi thử, mở Lịch sử gửi, lọc "Thất bại", bấm Gửi lại | Lịch chạy kế tiếp được tính sẵn; lịch sử có lần lỗi kèm lý do | 80 |

Mẹo: ở bước 1, sau khi gửi bấm "Tra cứu trạng thái" để mở sẵn trang `/visitor/status/<mã>`. Sau bước 2 tải lại trang đó để khách hàng thấy mốc "Đã duyệt" và khung giờ được cấp.

## 3. Checklist ↔ màn hình

| STT | Chức năng | Màn hình |
|---|---|---|
| 52 | Đăng ký khách trực tuyến | `/visitor/register`; Khách của tôi → Mời khách; Quầy lễ tân → Đăng ký khách vãng lai |
| 53 | Xác thực khách bằng khuôn mặt | Bước chụp ảnh khi đăng ký; Màn hình cổng `/visitor/gate` |
| 54 | Cấp quyền ra vào theo thời gian | Quản lý khách → Duyệt, Gia hạn, Thu hồi; Quầy lễ tân → Cần xử lý; `/visitor/status/<mã>` |
| 55 | Thông báo cho người được gặp | Khách của tôi → Thông báo; dòng thời gian của lượt khách |
| 56 | Theo dõi lịch sử khách đến | Khách → Lịch sử khách |
| 57 | Thống kê khách theo đơn vị và thời gian | Khách → Thống kê khách |
| 72 | Báo cáo chuyên cần cán bộ | Trung tâm báo cáo → Chuyên cần cán bộ |
| 73 | Báo cáo chuyên cần sinh viên | Trung tâm báo cáo → Chuyên cần sinh viên |
| 74 | Báo cáo ra vào khuôn viên | Trung tâm báo cáo → Ra vào khuôn viên |
| 75 | Báo cáo sử dụng phòng họp | Trung tâm báo cáo → Sử dụng phòng họp |
| 76 | Báo cáo phương tiện | Trung tâm báo cáo → Phương tiện |
| 77 | Báo cáo khách đến làm việc | Trung tâm báo cáo → Khách đến làm việc |
| 78 | Báo cáo sự kiện an ninh | Trung tâm báo cáo → Sự kiện an ninh |
| 79 | Xuất PDF, Excel, Word | Nút "Xuất báo cáo" ở mọi trang báo cáo |
| 80 | Lịch gửi báo cáo tự động | Báo cáo → Lịch gửi báo cáo, Lịch sử gửi |

## 4. Câu hỏi cần khách hàng trả lời tại buổi review

Các câu này quyết định cách làm BE. Mockup đang dùng giả định ghi trong ngoặc.

1. Ai được duyệt khách: người được gặp, lễ tân, bảo vệ, hay nhiều cấp? (người được gặp hoặc quản trị)
2. Khách có bắt buộc khai số CCCD không? Ảnh khuôn mặt khách lưu bao lâu sau khi rời? (không bắt buộc; gỡ khỏi thiết bị ngay khi rời hoặc hết hạn)
3. Cổng nào có thiết bị đóng/mở (FaceGate, barrier), cổng nào chỉ có camera? (Cổng chính và 3 tòa có FaceGate; cổng phụ và 1 tòa chỉ có camera)
4. Quy tắc chuyên cần cán bộ: giờ làm, ân hạn, ca kíp, lấy dữ liệu từ cổng hay từ camera tòa nhà? (08:00–17:00 thứ Hai–thứ Sáu, ân hạn 15 phút)
5. Ngưỡng cảnh báo chuyên cần sinh viên? (vắng quá 20% số buổi)
6. Kênh thông báo ngoài email và trong ứng dụng: có cần SMS, Zalo không? (chỉ email và trong ứng dụng)
7. Báo cáo có phải theo biểu mẫu sẵn có của trường (quốc hiệu, chữ ký, số hiệu) không? (mẫu chung)
8. Lịch gửi báo cáo: ai được tạo, có giới hạn người nhận ngoài trường không? (Business Admin và System Admin; tối đa 20 người nhận)
9. Khách quá giờ: sau bao lâu thì báo bảo vệ, và ai nhận cảnh báo? (nhắc người được gặp ngay, báo bảo vệ sau 30 phút)
10. Thu hồi quyền khi khách đang ở trong: ai đưa khách ra, có cần biên bản không? (báo người được gặp và bảo vệ; cổng vẫn cho ra)
11. Trường có người trực quầy lễ tân không, hay bảo vệ cổng xử lý các trường hợp ngoại lệ? (ai có quyền Business Admin hoặc System Admin đều dùng được màn Quầy lễ tân)

## 5. Điều cần nói rõ với khách hàng

- Số liệu là minh họa, sinh tự động cho 90 ngày gần nhất.
- Màn hình cổng bật webcam thật để thấy trải nghiệm đứng trước camera, nhưng phần so khớp khuôn mặt là mô phỏng: người demo nhập mã lượt và chọn tình huống, hệ thống áp đúng quy tắc (ngưỡng khớp 80%, khung giờ, khu vực, quyền bị thu hồi). Hệ thống thật dùng FaceGate hoặc camera AI và tự nhận ra khách, không cần mã.
- Email chưa gửi thật. Dòng thời gian ghi "Đã gửi email" để thể hiện vị trí của bước đó trong quy trình.
- File PDF trong bản demo đi qua hộp thoại in của trình duyệt; file Word là `.doc`. Bản chính thức sẽ xuất `.pdf` và `.docx` từ máy chủ.
- Báo cáo chuyên cần sinh viên phụ thuộc phân hệ điểm danh phòng học (2.7) đang làm.

## 6. Ghi chú kỹ thuật

- Cờ bật/tắt: `VISITOR_REPORT_MOCK_ENABLED` trong `src/config/featureFlags.js`, đọc từ `REACT_APP_VISITOR_REPORT_MOCK` (mặc định bật).
- Lớp dữ liệu giả: `src/mocks/visitorReport/`. Trang chỉ gọi `src/service/visitorService.js` và `src/service/reportCenterService.js`.
- Trong dữ liệu giả, mọi tài khoản đăng nhập đều đóng vai cùng một "người được gặp" (`host-me`), nên Manager và Employee thấy cùng danh sách ở "Khách của tôi".
- Sang ngày mới, dữ liệu "hôm nay" tự sinh lại; những gì người demo đã tạo hoặc sửa được giữ. Khách còn "đang ở trong" từ hôm trước tự chuyển "Chưa ghi nhận giờ ra".
- Tránh demo trong 45 phút đầu ngày: lượt quá giờ sinh sẵn khi đó mới ở mức 1 (chưa tới mốc báo bảo vệ).
- Kiểm thử: `CI=true npx react-scripts test --watchAll=false`.

### Khi nối BE thật

1. Đặt `REACT_APP_VISITOR_REPORT_MOCK=false`. Endpoint mỗi hàm service gọi đã ghi sẵn trong hai file service (hợp đồng ở spec §6.4).
2. Thêm `/public/visitor-` vào danh sách `publicPaths` của `isPublicEndpoint` trong `src/utils/request.js` để trang đăng ký và tra cứu không bị đòi đăng nhập.
3. Thay nhánh gọi thật của `exportReport` và `downloadRunFile` bằng luồng tạo job rồi tải file như `src/components/common/ExportReportModal.jsx`.
4. Thay chặn theo role bằng mã quyền và chuyển mục menu sang `src/config/navigationRegistry.js`.
5. Bỏ `host-me`: `getMyVisits` và `getMyNotifications` lấy theo người dùng đang đăng nhập ở BE.
