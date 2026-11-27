// Chỉ dùng khi chạy `npm start` (dev server của CRA) — bản build production KHÔNG dùng file này.
// Mô phỏng nginx production: ảnh lưu local có đường dẫn tương đối `/uploads/...` (vd ảnh đại diện)
// được chuyển sang backend để `<img src="/uploads/...">` hiển thị được cả lúc lập trình.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
    const target = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '');
    if (!/^https?:\/\//.test(target)) return; // chế độ 1 địa chỉ: không có backend riêng để chuyển
    // v2: truyền context làm đối số đầu → giữ nguyên tiền tố /uploads khi chuyển tiếp.
    app.use(createProxyMiddleware('/uploads', { target, changeOrigin: true }));
};
