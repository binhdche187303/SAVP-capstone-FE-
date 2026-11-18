import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';

/**
 * Hộp xác nhận dạng Promise thay cho window.confirm(), dùng ConfirmDialog chung của dự án.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ message: 'Xóa mục này?' }))) return;
 *   ...
 *   return <>{...}{confirmDialog}</>;
 */
const useConfirm = () => {
    const [request, setRequest] = useState(null);
    const resolver = useRef(null);

    const confirm = useCallback((options) => new Promise((resolve) => {
        resolver.current?.(false); // đóng yêu cầu cũ nếu còn treo
        resolver.current = resolve;
        setRequest(typeof options === 'string' ? { message: options } : options);
    }), []);

    const settle = (value) => {
        resolver.current?.(value);
        resolver.current = null;
        setRequest(null);
    };

    const confirmDialog = (
        <ConfirmDialog
            isOpen={!!request}
            message={request?.message}
            confirmLabel={request?.confirmLabel}
            cancelLabel={request?.cancelLabel}
            danger={request?.danger}
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
        />
    );

    return [confirm, confirmDialog];
};

export default useConfirm;
