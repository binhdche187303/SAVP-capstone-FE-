import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

const toneClass = {
    success: 'bg-emerald-600 border-emerald-500 text-white',
    warning: 'bg-amber-500 border-amber-400 text-white',
    error: 'bg-red-600 border-red-500 text-white',
    info: 'bg-midnight-indigo border-indigo-800 text-white',
};

const ToastIcon = ({ type }) => {
    if (type === 'success') return <Check className="w-3.5 h-3.5 shrink-0" />;
    if (type === 'warning') return <AlertTriangle className="w-3.5 h-3.5 shrink-0" />;
    if (type === 'error') return <X className="w-3.5 h-3.5 shrink-0" />;
    return <Info className="w-3.5 h-3.5 shrink-0" />;
};

const FloatingToastStack = ({ items = [], onClose, className = 'bottom-24 right-5' }) => (
    <div className={`fixed ${className} z-[9998] flex flex-col gap-2 pointer-events-auto`}>
        <AnimatePresence>
            {items.map(item => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 30 }}
                    className={`px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-start justify-between gap-3 max-w-[340px] ${toneClass[item.type] || toneClass.info}`}
                >
                    <div className="flex items-start gap-2.5 flex-1 pr-2">
                        <ToastIcon type={item.type} />
                        <div className="leading-snug">
                            <p>{item.message}</p>
                            {item.detail && <p className="mt-1 font-semibold opacity-85">{item.detail}</p>}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose?.(item.id)}
                        className="p-1.5 hover:bg-white/25 rounded-md transition-colors shrink-0 opacity-80 hover:opacity-100"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </motion.div>
            ))}
        </AnimatePresence>
    </div>
);

export default FloatingToastStack;
