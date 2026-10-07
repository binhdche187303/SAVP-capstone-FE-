import { labelCls } from '../common/uiClasses';
import { toLocalInput } from './visitLabels';

export const Field = ({ label, htmlFor, required, children, className = '' }) => (
    <div className={`space-y-1 ${className}`}>
        <label className={labelCls} htmlFor={htmlFor}>
            {label}{required && <span className="text-red-500"> *</span>}
        </label>
        {children}
    </div>
);

const HOUR = 60 * 60 * 1000;

// Giờ hẹn mặc định: bắt đầu ở giờ tròn kế tiếp (hoặc ngay bây giờ với khách vãng lai), dài 2 giờ.
export const defaultSchedule = (startNow = false) => {
    const now = new Date();
    const start = startNow
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
    return {
        scheduledFrom: toLocalInput(start.toISOString()),
        scheduledTo: toLocalInput(new Date(start.getTime() + 2 * HOUR).toISOString()),
    };
};

export const emptyVisitor = () => ({ fullName: '', idNumber: '', phone: '', email: '', organization: '', plateNumber: '', photo: null });

export const CONSENT_TEXT = 'Tôi đồng ý cho nhà trường xử lý ảnh khuôn mặt để xác thực ra vào trong thời gian chuyến thăm';
