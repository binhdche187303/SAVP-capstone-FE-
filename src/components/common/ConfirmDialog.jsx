import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

/**
 * Thay thế window.confirm() với UI nhất quán.
 *
 * Cách dùng:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   // Khi cần xác nhận:
 *   setConfirm({ message: '...', onConfirm: () => doSomething() });
 *
 *   <ConfirmDialog
 *     isOpen={!!confirm}
 *     message={confirm?.message}
 *     onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
 *     onCancel={() => setConfirm(null)}
 *   />
 */
const ConfirmDialog = ({
    isOpen,
    message,
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Hủy',
    danger = true,
    onConfirm,
    onCancel,
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-platinum-tint max-w-sm w-full p-6 space-y-5 animate-fade-in-up">
                <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-midnight-indigo text-base">Xác nhận thao tác</h3>
                        <p className="text-sm text-slate-blue mt-1 leading-relaxed whitespace-pre-line">{message}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2.5">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl border border-platinum-tint text-sm font-semibold text-slate-blue hover:bg-cloud-mist transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors shadow-sm ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-action-blue hover:bg-blue-700'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmDialog;
