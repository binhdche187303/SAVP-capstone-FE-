/**
 * slideConfig.js — Cấu hình nội dung, màu sắc và ảnh cho từng slide.
 *
 * ─── THÊM / CHỈNH SLIDE ──────────────────────────────────────────────────────
 *  Chỉnh mảng SLIDES bên dưới. Banner tự nhận số lượng slide.
 *
 * ─── LOẠI SLIDE ──────────────────────────────────────────────────────────────
 *  fullImage: true  → ảnh phủ toàn bộ banner, không hiện text
 *  fullImage: false → ảnh bên phải, text bên trái (mặc định)
 *
 * ─── THAY ẢNH ────────────────────────────────────────────────────────────────
 *  Đặt file ảnh vào: public/images/banner/
 *  Cập nhật trường `image` bên dưới.
 *  blendMode: 'multiply' → ảnh nền TRẮNG  | 'screen' → nền ĐEN | 'normal' → giữ nguyên
 *  photo: ảnh chụp khuôn viên phủ toàn banner + lớp phủ tối bên trái (thay ảnh minh hoạ bên phải)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Building2 } from 'lucide-react';

const SLIDES = [
    {
        id: 0,
        photo: '/images/banner/uel-0.jpg',
        fullImage: false,

        tag: 'Trường ĐH Kinh tế – Luật',
        title: 'Khuôn Viên Số UEL',
        description:
            'Camera AI kết nối toàn khuôn viên: điểm danh, kiểm soát ra vào và giám sát an ninh trên một nền tảng.',
        Icon: Building2,
        accent: '#3A8DFF',
        badgeClass: 'bg-blue-500/20 text-blue-100 border-blue-400/30',
        bgFrom: '#06203f',
        bgTo: '#0b2a4a',
    },
];

export default SLIDES;
