import { useState } from 'react';
import { submitBiometric } from '../../service/avatarService';

const ERROR_MAP = {
    BIOMETRIC_FILE_REQUIRED: 'Vui lòng chọn một ảnh để tải lên.',
    BIOMETRIC_FILE_TOO_LARGE: 'Ảnh vượt quá dung lượng cho phép (tối đa 5MB).',
    BIOMETRIC_FILE_TYPE_INVALID: 'Định dạng ảnh không hợp lệ. Chỉ hỗ trợ JPG, PNG, WEBP.',
    BIOMETRIC_CONSENT_REQUIRED: 'Bạn cần đồng ý cho phép sử dụng ảnh cho mục đích nhận diện khuôn mặt trước khi tiếp tục.',
    ACCOUNT_NOT_ACTIVE: 'Tài khoản của bạn hiện không ở trạng thái hoạt động.',
    BIOMETRIC_ALREADY_PENDING_REVIEW: 'Ảnh sinh trắc học của bạn đang chờ duyệt, vui lòng đợi kết quả trước khi nộp ảnh khác.',
    BIOMETRIC_STORAGE_FAILED: 'Không thể lưu ảnh vào hệ thống lưu trữ. Vui lòng thử lại.',
    BIOMETRIC_UPLOAD_FAILED: 'Có lỗi xảy ra khi xử lý ảnh. Vui lòng thử lại sau.',
};

const mapError = (code) => ERROR_MAP[code] || 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

// Không dùng FileReader: pptxviewjs (nạp ở InMeetingRoom) ghi đè window.FileReader toàn cục
// bằng bản thiếu readAsArrayBuffer ⇒ đọc trực tiếp qua Blob.arrayBuffer().
const validateMagicBytes = async (file) => {
    let arr;
    try {
        arr = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    } catch {
        return false;
    }
    if (arr.length < 4) return false;
    // PNG: 89 50 4E 47
    if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return true;
    // JPEG: FF D8 FF
    if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return true;
    // WEBP: RIFF ở 0-3, WEBP ở 8-11
    if (arr.length >= 12) {
        const isRiff = arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46;
        const isWebp = arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50;
        if (isRiff && isWebp) return true;
    }
    return false;
};

const BiometricUploadForm = ({ onSuccess, onCancel, compact }) => {
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [consentAgreed, setConsentAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleFileSelect = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;

        if (!ALLOWED_TYPES.includes(f.type)) {
            setError('Định dạng ảnh không hợp lệ. Chỉ hỗ trợ JPG, PNG, WEBP.');
            setFile(null);
            setPreviewUrl(null);
            return;
        }
        if (f.size > MAX_SIZE) {
            setError('Ảnh vượt quá dung lượng cho phép (tối đa 5MB).');
            setFile(null);
            setPreviewUrl(null);
            return;
        }

        // Validate magic bytes
        const isValid = await validateMagicBytes(f);
        if (!isValid) {
            setError('Tệp không phải là ảnh JPG, PNG hoặc WEBP hợp lệ (xác thực magic bytes thất bại).');
            setFile(null);
            setPreviewUrl(null);
            return;
        }

        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
        setError(null);
    };

    const handleSubmit = async () => {
        if (!file) {
            setError('Vui lòng chọn một ảnh để tải lên.');
            return;
        }
        if (!consentAgreed) {
            setError('Bạn cần đồng ý cho phép sử dụng ảnh cho mục đích nhận diện khuôn mặt trước khi tiếp tục.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const res = await submitBiometric(file, true);
            if (res?.success) {
                onSuccess?.(res.data);
            } else {
                setError(res?.error?.message || 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.');
            }
        } catch (err) {
            const code = err?.error?.code;
            setError(code ? mapError(code) : (err?.error?.message || 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={compact ? 'space-y-4' : 'space-y-5'}>
            {!compact && (
                <h3 className="text-base font-bold text-midnight-indigo">Tải lên ảnh FaceID</h3>
            )}

            {/* File picker area */}
            <div className="flex flex-col items-center gap-3">
                <div className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-action-blue/10 bg-gradient-to-tr from-action-blue to-glacier-blue flex items-center justify-center text-white text-3xl font-extrabold select-none">
                    {previewUrl ? (
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <svg className="w-10 h-10 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}
                </div>

                <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Chọn ảnh
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
                </label>
                <span className="text-[10px] text-steel-gray">Chấp nhận JPG, PNG, WEBP — tối đa 5MB</span>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {/* Consent checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={(e) => setConsentAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-steel-gray text-action-blue focus:ring-action-blue/30"
                />
                <span className="text-xs text-slate-blue leading-relaxed">
                    Tôi đồng ý cho phép VISMA IVA sử dụng ảnh này cho mục đích nhận diện khuôn mặt (bắt buộc).
                </span>
            </label>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !file || !consentAgreed}
                    className="flex-1 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {submitting ? 'Đang gửi...' : 'Gửi ảnh FaceID'}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="py-2.5 px-5 border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist rounded-xl text-sm font-semibold transition-all"
                    >
                        Hủy
                    </button>
                )}
            </div>
        </div>
    );
};

export default BiometricUploadForm;
