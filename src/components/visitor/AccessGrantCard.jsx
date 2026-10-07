import { DoorOpen, Camera } from 'lucide-react';
import { inputCls, labelCls } from '../common/uiClasses';
import { fmtDateTime, toLocalInput, fromLocalInput } from './visitLabels';

// Quyền ra vào của một lượt khách: khung hiệu lực + khu vực được phép (BR-V3).
// Khu có FaceGate thì đóng/mở thật; khu chỉ có camera thì nhận diện và cảnh báo.
const AccessGrantCard = ({ access, zones = [], editable = false, onChange }) => {
    if (!access) return null;
    const toggleZone = (id) => {
        const zoneIds = access.zoneIds.includes(id) ? access.zoneIds.filter((z) => z !== id) : [...access.zoneIds, id];
        onChange({ ...access, zoneIds });
    };
    const shown = editable ? zones : zones.filter((z) => access.zoneIds.includes(z.id));

    return (
        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-3">
            {editable ? (
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
            ) : (
                <p className="text-xs text-midnight-indigo">
                    Hiệu lực từ <strong>{fmtDateTime(access.validFrom)}</strong> đến <strong>{fmtDateTime(access.validTo)}</strong>
                </p>
            )}
            <div className="space-y-1.5">
                <span className={labelCls}>Khu vực được phép</span>
                {shown.map((zone) => {
                    const Icon = zone.hasFaceGate ? DoorOpen : Camera;
                    return (
                        <label key={zone.id} className="flex items-center gap-2 text-xs text-midnight-indigo">
                            {editable && <input type="checkbox" checked={access.zoneIds.includes(zone.id)} onChange={() => toggleZone(zone.id)} />}
                            <Icon className="w-3.5 h-3.5 text-slate-blue" />
                            <span className="font-semibold">{zone.name}</span>
                            <span className="text-[11px] text-slate-blue">{zone.hasFaceGate ? 'đóng/mở bằng FaceGate' : 'chỉ nhận diện, cảnh báo'}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};

export default AccessGrantCard;
