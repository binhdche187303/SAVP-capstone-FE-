import { Camera, Check, ChevronDown, DoorOpen } from 'lucide-react';
import { inputCls, labelCls } from '../common/uiClasses';
import { fmtDateTime, toLocalInput, fromLocalInput } from './visitLabels';

// Quyền ra vào của một lượt khách: khung hiệu lực + khu vực được phép (BR-V3).
// Khu có FaceGate thì đóng/mở thật; khu chỉ có camera thì nhận diện và cảnh báo.
const AccessGrantCard = ({ access, zones = [], editable = false, onChange, showValidity = true }) => {
    if (!access) return null;
    const toggleZone = (id) => {
        const zoneIds = access.zoneIds.includes(id) ? access.zoneIds.filter((z) => z !== id) : [...access.zoneIds, id];
        onChange({ ...access, zoneIds });
    };
    const selectedIds = access.zoneIds || [];
    const selectedZones = selectedIds
        .map((id) => zones.find((zone) => zone.id === id))
        .filter(Boolean);
    const renderZone = (zone) => {
        const Icon = zone.hasFaceGate ? DoorOpen : Camera;
        return (
            <div key={zone.id} className="flex items-center gap-2 text-xs text-midnight-indigo">
                <Icon className="w-3.5 h-3.5 flex-shrink-0 text-slate-blue" />
                <span className="font-semibold">{zone.name}</span>
                <span className="text-[11px] text-slate-blue">{zone.hasFaceGate ? 'FaceGate' : 'camera'}</span>
            </div>
        );
    };

    return (
        <div className="rounded-xl border border-platinum-tint bg-cloud-mist/40 p-4 space-y-3">
            {editable && showValidity ? (
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
                <span className={labelCls}>{editable ? 'Khu vực được phép' : 'Khu vực đã cấp'}</span>
                {editable ? (
                    <details className="relative">
                        <summary className={`${inputCls} flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold`}>
                            <span>{selectedZones.length ? `Đã chọn ${selectedZones.length} khu vực` : 'Chọn khu vực được phép'}</span>
                            <ChevronDown className="h-4 w-4 text-slate-blue" />
                        </summary>
                        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-platinum-tint bg-white p-2 shadow-lg">
                            {zones.map((zone) => (
                                <label key={zone.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs text-midnight-indigo hover:bg-cloud-mist">
                                    <input type="checkbox" checked={selectedIds.includes(zone.id)} onChange={() => toggleZone(zone.id)} />
                                    <span className="flex-1">{zone.name}</span>
                                    {selectedIds.includes(zone.id) && <Check className="h-3.5 w-3.5 text-action-blue" />}
                                </label>
                            ))}
                        </div>
                    </details>
                ) : selectedZones.length ? selectedZones.map(renderZone) : <p className="text-xs text-slate-blue">Chưa cấp khu vực</p>}
            </div>
        </div>
    );
};

export default AccessGrantCard;
