import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

// Hộp thoại nền mờ dùng chung cho các form của phân hệ Khách và Báo cáo.
const SimpleModal = ({ isOpen, title, onClose, children, footer, size = 'md' }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-midnight-indigo/40" role="dialog" aria-modal="true" aria-label={title}>
            <div className={`bg-white rounded-2xl shadow-sm-2 w-full ${WIDTH[size]} max-h-[90vh] flex flex-col`}>
                <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between">
                    <h3 className="font-bold text-midnight-indigo">{title}</h3>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-slate-blue hover:bg-cloud-mist">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-6 py-5 overflow-y-auto">{children}</div>
                {footer && <div className="px-6 py-4 border-t border-platinum-tint flex justify-end gap-2">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
};

export default SimpleModal;
