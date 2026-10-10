import { useState } from 'react';
import { Info, RotateCcw } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { ANY_DEMO_DATA } from '../../config/featureFlags';
import { resetDemoData } from '../../service/visitorService';
import toast from '../../utils/toast';

// Dải báo "đang dùng dữ liệu minh hoạ" của phân hệ Khách và Báo cáo; ẩn khi đã nối BE thật.
const DemoDataBanner = ({ onReset }) => {
    const [confirming, setConfirming] = useState(false);
    if (!ANY_DEMO_DATA) return null;

    const reset = async () => {
        setConfirming(false);
        const res = await resetDemoData();
        if (res?.success) {
            toast.success('Đã đặt lại dữ liệu demo');
            onReset?.();
        } else {
            toast.error(res?.message || 'Không đặt lại được dữ liệu');
        }
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-xs text-glacier-blue">
            <span className="flex items-center gap-2">
                <Info className="w-4 h-4 flex-shrink-0" />
                Đang dùng dữ liệu minh họa, lưu trên trình duyệt này. Số liệu thật sẽ có khi kết nối hệ thống.
            </span>
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                <RotateCcw className="w-3.5 h-3.5" /> Đặt lại dữ liệu demo
            </button>
            <ConfirmDialog
                isOpen={confirming}
                message="Đặt lại toàn bộ dữ liệu demo về trạng thái ban đầu? Các lượt khách, lịch gửi và file xuất bạn đã tạo sẽ bị xóa."
                confirmLabel="Đặt lại"
                onConfirm={reset}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
};

export default DemoDataBanner;
