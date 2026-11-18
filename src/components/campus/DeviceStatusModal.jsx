import { Link } from 'react-router-dom';
import SimpleModal from '../common/SimpleModal';

export const DEVICE_STATUS_META = {
    online:      { label: 'Đang hoạt động', dot: '#10b981', order: 3 },
    offline:     { label: 'Mất kết nối',    dot: '#ef4444', order: 0 },
    maintenance: { label: 'Đang bảo trì',   dot: '#ffa600', order: 1 },
    disabled:    { label: 'Đã tắt',          dot: '#94a3b8', order: 2 },
};

const fmtLastSeen = (v) => {
    if (!v) return 'Chưa từng kết nối';
    const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    if (mins < 1440) return `${Math.floor(mins / 60)} giờ trước`;
    return new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

/** Thiết bị lỗi lên đầu, cùng trạng thái thì theo tên. */
export const sortDevices = (devices = []) => [...devices].sort((a, b) =>
    (DEVICE_STATUS_META[a.status]?.order ?? 9) - (DEVICE_STATUS_META[b.status]?.order ?? 9)
    || String(a.name || '').localeCompare(String(b.name || ''), 'vi'));

/**
 * Danh sách thiết bị kèm trạng thái — trả lời "thiết bị/camera NÀO đang lỗi".
 * devices: [{ id, name, code, type, status, lastSeenAt }]
 */
const DeviceStatusModal = ({ isOpen, title, devices = [], onClose, typeLabels = {}, manageHref }) => (
    <SimpleModal isOpen={isOpen} title={title} onClose={onClose}
        footer={manageHref && <Link to={manageHref} className="px-4 py-2 rounded-xl bg-action-blue text-white text-sm font-semibold">Mở trang Thiết bị IoT</Link>}>
        {devices.length === 0 ? (
            <p className="text-sm text-slate-blue">Không có thiết bị.</p>
        ) : (
            <ul className="divide-y divide-platinum-tint">
                {sortDevices(devices).map((d) => {
                    const st = DEVICE_STATUS_META[d.status] || { label: d.status || 'Không rõ', dot: '#94a3b8' };
                    return (
                        <li key={d.id || d.code} className="py-2.5 flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.dot }} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-midnight-indigo break-words">{d.name || d.code}</p>
                                <p className="text-xs text-slate-blue">
                                    {[typeLabels[d.type] || d.type, d.code].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xs font-semibold" style={{ color: st.dot }}>{st.label}</p>
                                <p className="text-xs text-slate-blue">{d.status === 'online' ? '' : `Lần cuối: ${fmtLastSeen(d.lastSeenAt)}`}</p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        )}
    </SimpleModal>
);

export default DeviceStatusModal;
