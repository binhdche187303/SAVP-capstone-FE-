import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, FileEdit, LayoutTemplate, Loader2 } from 'lucide-react';

/**
 * Modal chọn hình thức soạn biên bản thủ công khi Host bấm "Tạo thủ công":
 * - 'blank': trang trắng, chỉ có 1 ô soạn tự do, không ép cấu trúc.
 * - 'template': giữ nguyên cấu trúc hiện có (Quyết định / Action Items / Nội dung tự do).
 * Chọn 1 lần lúc tạo, không đổi được sau đó (xem meeting-minutes.entity.ts contentFormat).
 */
const CreateManualMinutesModal = ({ open, creating, onClose, onSelect }) => {
    if (!open) return null;

    const options = [
        {
            format: 'blank',
            icon: FileEdit,
            title: 'Trang trắng',
            description: 'Soạn tự do như một trang giấy trắng, không ép theo mục cố định nào.',
        },
        {
            format: 'template',
            icon: LayoutTemplate,
            title: 'Theo template',
            description: 'Có sẵn các mục Quyết định, Công việc cần làm (Action Items)... giống biên bản AI.',
        },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-platinum-tint"
            >
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-midnight-indigo text-sm">Chọn hình thức soạn biên bản</h3>
                        <p data-ui-text="secondary" className="text-[10px] text-slate-blue mt-0.5">Áp dụng cho bản thủ công này, không thể đổi lại sau khi tạo.</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={creating}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {options.map(({ format, icon: Icon, title, description }) => (
                        <button
                            key={format}
                            onClick={() => onSelect(format)}
                            disabled={creating}
                            className="text-left p-4 border-2 border-platinum-tint rounded-2xl hover:border-action-blue hover:bg-blue-50/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col gap-2"
                        >
                            <div className="w-9 h-9 rounded-xl bg-cloud-mist flex items-center justify-center text-action-blue">
                                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                            </div>
                            <span data-ui-text="action" className="text-xs font-bold text-midnight-indigo">{title}</span>
                            <span data-ui-text="action" className="text-[11px] text-slate-blue leading-relaxed">{description}</span>
                        </button>
                    ))}
                </div>

                <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end">
                    <button
                        onClick={onClose}
                        disabled={creating}
                        className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all disabled:opacity-50"
                    >
                        Hủy
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default CreateManualMinutesModal;
