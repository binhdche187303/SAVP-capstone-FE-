// Chuẩn hóa ảnh logo / logo nền trước khi tải lên: luôn đổi sang PNG (giữ nền trong suốt),
// cạnh dài tối đa 1200 px, thu nhỏ dần nếu file vẫn quá 2 MB (giới hạn của BE).
const MAX_BYTES = 2 * 1024 * 1024;

const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được ảnh. Hãy chọn file PNG hoặc JPEG.'));
    };
    img.src = url;
});

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

export const toPngFile = async (file, name = 'logo.png') => {
    if (!file || !/^image\//.test(file.type)) throw new Error('Vui lòng chọn file ảnh (PNG, JPEG)');
    const { img, url } = await loadImage(file);
    try {
        let max = 1200;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
            canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const blob = await toBlob(canvas);
            if (blob && blob.size <= MAX_BYTES) return new File([blob], name, { type: 'image/png' });
            max = Math.round(max * 0.7);
        }
        throw new Error('Ảnh quá lớn, hãy chọn ảnh dưới 2 MB');
    } finally {
        URL.revokeObjectURL(url);
    }
};
