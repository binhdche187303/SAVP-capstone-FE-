import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Toạ độ GPS của khu vực (zones.latitude/longitude) — dùng cho Bản đồ khuôn viên.
// Giá trị trong form là chuỗi; parseZoneCoordinates đổi sang number|null trước khi gửi BE.

const DEFAULT_CENTER = [10.7554, 106.6634]; // ĐH Y Dược TP.HCM — 217 Hồng Bàng, Q.5

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * @returns {{ error: string } | { latitude: number|null, longitude: number|null }}
 * BE yêu cầu nhập đủ cặp hoặc để trống cả hai (ZONE_COORDINATES_INCOMPLETE).
 */
export const parseZoneCoordinates = (latStr, lngStr) => {
    const latRaw = String(latStr ?? '').trim();
    const lngRaw = String(lngStr ?? '').trim();
    if (!latRaw && !lngRaw) return { latitude: null, longitude: null };
    if (!latRaw || !lngRaw) return { error: 'Phải nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai).' };
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { error: 'Vĩ độ phải là số trong khoảng -90 đến 90.' };
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { error: 'Kinh độ phải là số trong khoảng -180 đến 180.' };
    return { latitude: round6(latitude), longitude: round6(longitude) };
};

const ClickToPick = ({ onPick }) => {
    useMapEvents({ click: (e) => onPick(round6(e.latlng.lat), round6(e.latlng.lng)) });
    return null;
};

const Recenter = ({ position }) => {
    const map = useMap();
    const key = position ? position.join(',') : '';
    useEffect(() => {
        if (position) map.setView(position, Math.max(map.getZoom(), 17));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);
    return null;
};

const ZoneLocationPicker = ({ latitude, longitude, onChange }) => {
    const parsed = parseZoneCoordinates(latitude, longitude);
    const position = !parsed.error && parsed.latitude != null ? [parsed.latitude, parsed.longitude] : null;
    const inputCls = 'w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm';

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-blue uppercase">Vị trí trên bản đồ</label>
                {(latitude !== '' || longitude !== '') && (
                    <button type="button" onClick={() => onChange('', '')} className="text-xs text-red-500 hover:underline">Xoá vị trí</button>
                )}
            </div>
            <div className="flex gap-4 mb-2">
                <input type="text" inputMode="decimal" value={latitude} onChange={(e) => onChange(e.target.value, longitude)}
                    className={inputCls} placeholder="Vĩ độ (VD: 10.755400)" />
                <input type="text" inputMode="decimal" value={longitude} onChange={(e) => onChange(latitude, e.target.value)}
                    className={inputCls} placeholder="Kinh độ (VD: 106.663400)" />
            </div>
            <div className="rounded-xl overflow-hidden border border-platinum-tint">
                <MapContainer center={position || DEFAULT_CENTER} zoom={17} style={{ height: 180 }} scrollWheelZoom>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={19}
                    />
                    <ClickToPick onPick={(lat, lng) => onChange(String(lat), String(lng))} />
                    <Recenter position={position} />
                    {position && <CircleMarker center={position} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />}
                </MapContainer>
            </div>
            <p className="text-[11px] text-slate-blue mt-1">Bấm lên bản đồ để chọn vị trí. Để trống nếu chưa muốn hiển thị khu vực trên bản đồ.</p>
        </div>
    );
};

export default ZoneLocationPicker;
