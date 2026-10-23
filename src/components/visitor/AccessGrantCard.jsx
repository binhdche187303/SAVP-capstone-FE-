import { DoorOpen, Camera, CameraOff, Lock } from 'lucide-react';
import { inputCls, labelCls } from '../common/uiClasses';
import { fmtDateTime, toLocalInput, fromLocalInput, ZONE_VISITOR_POLICY_LABELS } from './visitLabels';

// Khu `open` luôn được cấp (BE tự thêm) — dùng làm danh sách mặc định cho lượt mới.
export const openZoneIds = (zones = []) => zones.filter((z) => z.visitorPolicy === 'open').map((z) => z.id);

// Quyền ra vào của một lượt khách: khung hiệu lực + cổng vào + khu vực được phép (BR-V3).
// Chính sách khu do admin đặt: open = tự cấp, không bỏ được; restricted = chỉ quản lý (canManage) cấp được.
// Khu có FaceGate thì đóng/mở thật; khu chỉ có camera thì nhận diện và cảnh báo; khu chưa gán camera thì không cảnh báo được.
// zonesOnly: chỉ sửa khu (thao tác "Sửa khu" sau khi duyệt), không sửa khung giờ.
const AccessGrantCard = ({ access, zones = [], editable = false, zonesOnly = false, canManage = false, onChange }) => {
    if (!access) return null;
    const locked = (zone) => zone.visitorPolicy === 'open' || (zone.visitorPolicy === 'restricted' && !canManage);
    const toggleZone = (zone) => {
        if (locked(zone)) return;
        const zoneIds = access.zoneIds.includes(zone.id) ? access.zoneIds.filter((z) => z !== zone.id) : [...access.zoneIds, zone.id];
        onChange({ ...access, zoneIds });
    };
    const isChecked = (zone) => zone.visitorPolicy === 'open' || access.zoneIds.includes(zone.id);
    const shown = editable ? zones : zones.filter((z) => access.zoneIds.includes(z.id));
    const groups = [
        { title: 'Cổng khách được đi vào', items: shown.filter((z) => z.type === 'gate') },
        { title: 'Khu vực được phép trong trường', items: shown.filter((z) => z.type !== 'gate') },
    ].filter((g) => g.items.length > 0);

    const renderZone = (zone) => {
        const Icon = zone.hasFaceGate ? DoorOpen : zone.hasCamera === false ? CameraOff : Camera;
        const device = zone.hasFaceGate ? 'đóng/mở bằng FaceGate' : zone.hasCamera === false ? 'chưa gán camera — không cảnh báo được' : 'chỉ nhận diện, cảnh báo';
        return (
            <label key={zone.id} className={`flex items-center gap-2 text-xs text-midnight-indigo ${editable && locked(zone) ? 'opacity-70' : ''}`}>
                {editable && <input type="checkbox" checked={isChecked(zone)} disabled={locked(zone)} onChange={() => toggleZone(zone)} />}
                <Icon className={`w-3.5 h-3.5 ${zone.hasCamera === false && !zone.hasFaceGate ? 'text-amber-600' : 'text-slate-blue'}`} />
                <span className="font-semibold">{zone.name}</span>
                {zone.visitorPolicy === 'restricted' && <Lock className="w-3 h-3 text-red-600" aria-label="Khu hạn chế" />}
                <span className={`text-[11px] ${zone.hasCamera === false && !zone.hasFaceGate ? 'text-amber-700' : 'text-slate-blue'}`}>{device}</span>
                {editable && zone.visitorPolicy && zone.visitorPolicy !== 'grantable' && (
                    <span className="text-[10px] text-slate-blue italic">· {ZONE_VISITOR_POLICY_LABELS[zone.visitorPolicy]}</span>
                )}
            </label>
        );
    };

    return (
        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-3">
            {editable && !zonesOnly ? (
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
            {groups.map((g) => (
                <div key={g.title} className="space-y-1.5">
                    <span className={labelCls}>{g.title}</span>
                    {g.items.map(renderZone)}
                </div>
            ))}
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
