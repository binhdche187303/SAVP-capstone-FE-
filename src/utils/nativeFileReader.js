// Giữ FileReader gốc của trình duyệt.
//
// Thư viện pptxviewjs (dùng ở InMeetingRoom) khi được nạp sẽ gán class tiện ích trùng tên của nó vào
// `window.FileReader` — class này KHÔNG có readAsArrayBuffer/readAsDataURL/readAsText, nên mọi
// `new FileReader().readAs...()` trong app (import Excel, ảnh FaceID...) đều lỗi ngầm. Chính pptxviewjs
// cũng gọi `new window.FileReader()` bên trong nên nó cần bản gốc.
//
// Module này phải được import TRƯỚC pptxviewjs (xem index.js) để bắt được bản gốc, rồi gọi
// restoreNativeFileReader() sau khi pptxviewjs đã nạp.
const NativeFileReader = typeof window !== 'undefined' ? window.FileReader : undefined;

export const restoreNativeFileReader = () => {
    if (NativeFileReader && window.FileReader !== NativeFileReader) {
        window.FileReader = NativeFileReader;
    }
};
