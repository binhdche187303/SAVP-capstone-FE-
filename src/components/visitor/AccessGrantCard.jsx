import { Camera, CameraOff, ChevronDown, DoorOpen, Lock } from 'lucide-react';
import { inputCls, labelCls } from '../common/uiClasses';
import { fmtDateTime, toLocalInput, fromLocalInput, ZONE_VISITOR_POLICY_LABELS } from './visitLabels';

// Khu `open` luôn được cấp (BE tự thêm) — dùng làm danh sách mặc định cho lượt mới.
export const openZoneIds = (zones = []) => zones.filter((z) => z.visitorPolicy === 'open').map((z) => z.id);

// Quyền ra vào của một lượt khách: khung hiệu lực + cổng vào + khu vực được phép (BR-V3).
// Chính sách khu do admin đặt: open = tự cấp, không bỏ được; restricted = chỉ quản lý (canManage) cấp được.
// Khu có FaceGate thì đóng/mở thật; khu chỉ có camera thì nhận diện và cảnh báo; khu chưa gán camera thì không cảnh báo được.
// showValidity=false hoặc zonesOnly: chỉ chọn khu, không sửa khung giờ (duyệt trong ngăn chi tiết, "Sửa khu vực" sau duyệt).
const AccessGrantCard = ({ access, zones = [], editable = false, onChange, showValidity = true, zonesOnly = false, canManage = false }) => {
    if (!access) return null;
    const selectedIds = access.zoneIds || [];
    const locked = (zone) => zone.visitorPolicy === 'open' || (zone.visitorPolicy === 'restricted' && !canManage);
    const isChecked = (zone) => zone.visitorPolicy === 'open' || selectedIds.includes(zone.id);
    const toggleZone = (zone) => {
        if (locked(zone)) return;
        const zoneIds = selectedIds.includes(zone.id) ? selectedIds.filter((z) => z !== zone.id) : [...selectedIds, zone.id];
        onChange({ ...access, zoneIds });
    };
    // Khu đã cấp hiển thị theo thứ tự lộ trình (route_order) mà BE trả trong access.zoneIds.
    const selectedZones = selectedIds.map((id) => zones.find((zone) => zone.id === id)).filter(Boolean);
    const checkedCount = zones.filter(isChecked).length;
    const noCamera = (zone) => zone.hasCamera === false && !zone.hasFaceGate;

    const renderZone = (zone) => {
        const Icon = zone.hasFaceGate ? DoorOpen : zone.hasCamera === false ? CameraOff : Camera;
        const device = zone.hasFaceGate ? 'đóng/mở bằng FaceGate' : zone.hasCamera === false ? 'chưa gán camera — không cảnh báo được' : 'chỉ nhận diện, cảnh báo';
        const policyNote = editable && zone.visitorPolicy && zone.visitorPolicy !== 'grantable' ? ZONE_VISITOR_POLICY_LABELS[zone.visitorPolicy] : null;
        const body = (
            <>
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${noCamera(zone) ? 'text-amber-600' : 'text-slate-blue'}`} />
                <span className="font-semibold">{zone.name}</span>
                {zone.visitorPolicy === 'restricted' && <Lock className="w-3 h-3 text-red-600" aria-label="Khu hạn chế" />}
                <span className={`text-[11px] ${noCamera(zone) ? 'text-amber-700' : 'text-slate-blue'}`}>{device}</span>
                {policyNote && <span className="text-[10px] text-slate-blue italic">· {policyNote}</span>}
            </>
        );
        if (!editable) return <div key={zone.id} className="flex items-center gap-2 text-xs text-midnight-indigo">{body}</div>;
        return (
            <label key={zone.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-midnight-indigo hover:bg-cloud-mist ${locked(zone) ? 'opacity-70' : ''}`}>
                <input type="checkbox" checked={isChecked(zone)} disabled={locked(zone)} onChange={() => toggleZone(zone)} />
                {body}
            </label>
        );
    };

    const groupsOf = (list) => [
        { title: 'Cổng khách được đi vào', items: list.filter((z) => z.type === 'gate') },
        { title: 'Khu vực được phép trong trường', items: list.filter((z) => z.type !== 'gate') },
    ].filter((g) => g.items.length > 0);

    return (
        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-3">
            {editable && showValidity && !zonesOnly ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className={labelCls} htmlFor="access-from">Hiệu lực từ</label>
                        <input id="access-from" type="datetime-local" className={`${inputCls} w-full`} value={toLocalInput(access.validFrom)} onChange={(e) => onChange({ ...access, validFrom: fromLocalInput(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls} htmlFor="access-to">Hiệu lực đến</label>
                        <input id="access-to" type="datetime-local" className={`${inputCls} w-full`} value={toLocalInput(access.validTo)} onChange={(e) => onChange({ ...access, validTo: fromLocalInput(e.target.value) })} />
                    </div>
                </div>
            ) : access.validFrom && access.validTo ? (
                <p className="text-xs text-midnight-indigo">
                    Hiệu lực từ <strong>{fmtDateTime(access.validFrom)}</strong> đến <strong>{fmtDateTime(access.validTo)}</strong>
                </p>
            ) : null}
            <div className="space-y-1.5">
                <span className={labelCls}>{editable ? 'Khu vực được phép' : 'Khu vực đã cấp'}</span>
                {editable ? (
                    <details className="relative">
                        <summary className={`${inputCls} flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold`}>
                            <span>{checkedCount ? `Đã chọn ${checkedCount} khu vực` : 'Chọn khu vực được phép'}</span>
                            <ChevronDown className="h-4 w-4 text-slate-blue" />
                        </summary>
                        <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-platinum-tint bg-white p-2 shadow-lg space-y-2">
                            {groupsOf(zones).map((g) => (
                                <div key={g.title} className="space-y-0.5">
                                    <span className={labelCls}>{g.title}</span>
                                    {g.items.map(renderZone)}
                                </div>
                            ))}
                        </div>
                    </details>
                ) : selectedZones.length ? selectedZones.map(renderZone) : <p className="text-xs text-slate-blue">Chưa cấp khu vực</p>}
            </div>
            {editable && (
                <p className="text-[11px] text-slate-blue">
                    Camera thấy khách ở khu không được tích sẽ cảnh báo bảo vệ và báo cho người được gặp.
                    {!canManage && zones.some((z) => z.visitorPolicy === 'restricted') && ' Khu có biểu tượng khóa chỉ quản lý khách / an ninh mới cấp được.'}
                </p>
            )}
        </div>
    );
};

export default AccessGrantCard;
