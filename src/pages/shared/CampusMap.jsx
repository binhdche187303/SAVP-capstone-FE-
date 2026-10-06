import { AlertTriangle, Camera, ExternalLink, Map as MapIcon, MapPin, RefreshCw, Users } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCampusMap } from '../../service/campusService';
import { getAlertTypeLabel } from '../../constants/alertType';

// GIS: bản đồ khuôn viên — vị trí zone (GPS) + camera gắn zone + cảnh báo an ninh gần đây.
// Vị trí camera = vị trí zone (iot_devices không có toạ độ riêng). Nền OSM cần internet.

const REFRESH_MS = 60000;
const DEFAULT_CENTER = [21.0130, 105.5265];

const HOURS_OPTIONS = [
    { value: 1, label: '1 giờ qua' },
    { value: 6, label: '6 giờ qua' },
    { value: 24, label: '24 giờ qua' },
    { value: 48, label: '48 giờ qua' },
    { value: 168, label: '7 ngày qua' }
];

const CAMERA_LEVELS = {
    ok: { color: '#22c55e', label: 'Tất cả camera online' },
    partial: { color: '#f59e0b', label: 'Một phần offline / bảo trì' },
    down: { color: '#ef4444', label: 'Camera offline' },
    none: { color: '#94a3b8', label: 'Chưa có thiết bị' }
};

const SEVERITY = {
    critical: { label: 'Nghiêm trọng', color: '#b91c1c', cls: 'bg-red-100 text-red-700' },
    high: { label: 'Cao', color: '#ef4444', cls: 'bg-orange-100 text-orange-700' },
    medium: { label: 'Trung bình', color: '#f59e0b', cls: 'bg-amber-100 text-amber-700' },
    low: { label: 'Thấp', color: '#3b82f6', cls: 'bg-blue-100 text-blue-700' }
};

const ALERT_STATUS_LABELS = { new: 'Mới', acknowledged: 'Đã tiếp nhận', resolved: 'Đã xử lý' };

const DEVICE_STATUS = {
    online: { label: 'Online', cls: 'text-green-600' },
    offline: { label: 'Offline', cls: 'text-red-600' },
    maintenance: { label: 'Bảo trì', cls: 'text-amber-600' },
    disabled: { label: 'Vô hiệu', cls: 'text-gray-500' }
};

const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

const cameraLevel = ({ online, offline, disabled, maintenance }) => {
    const total = online + offline + disabled + maintenance;
    if (total === 0) return 'none';
    if (online === total) return 'ok';
    if (online > 0 || maintenance > 0 || disabled > 0) return 'partial';
    return 'down';
};

const zoneIcon = (zone) => {
    const level = CAMERA_LEVELS[cameraLevel(zone.cameraStatus)];
    const open = zone.alerts.open;
    const badgeColor = SEVERITY[zone.alerts.topOpenSeverity]?.color || '#ef4444';
    const badge = open > 0
        ? `<span style="position:absolute;top:-6px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:${badgeColor};color:#fff;font:600 11px/18px sans-serif;text-align:center;border:2px solid #fff">${open}</span>`
        : '';
    return L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
        html: `<div style="position:relative;width:28px;height:28px;border-radius:50%;background:${level.color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${badge}</div>`
    });
};

// Tự canh khung nhìn vừa đủ các marker mỗi khi tập zone hiển thị đổi.
const FitBounds = ({ points }) => {
    const map = useMap();
    const key = points.map((p) => p.join(',')).join('|');
    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) map.setView(points[0], 18);
        else map.fitBounds(points, { paddingTopLeft: [40, 40], paddingBottomRight: [260, 40], maxZoom: 18 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);
    return null;
};

const ZonePopup = ({ zone, alertsLink }) => (
    <div className="min-w-[240px] text-sm">
        <div className="font-semibold text-gray-800">{zone.zoneName}</div>
        <div className="text-xs text-gray-500 mb-2">
            {zone.zoneCode} · {zone.building || '—'}{zone.floor ? ` · Tầng ${zone.floor}` : ''}
        </div>
        <div className="flex items-center gap-1 text-xs mb-2">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            Hiện diện: <b>{zone.occupancy.count ?? '—'}</b>
            {zone.occupancy.status !== 'ok' && <span className="text-gray-400">(không có dữ liệu mới)</span>}
        </div>
        <div className="text-xs font-semibold text-gray-700 mb-1">Thiết bị ({zone.cameras.length})</div>
        {zone.cameras.length === 0 ? (
            <div className="text-xs text-gray-400 mb-2">Chưa gắn thiết bị.</div>
        ) : (
            <ul className="text-xs mb-2 space-y-0.5">
                {zone.cameras.map((c) => (
                    <li key={c.deviceId} className="flex justify-between gap-2">
                        <span className="truncate">{c.deviceName || c.deviceCode}</span>
                        <span className={DEVICE_STATUS[c.status]?.cls || 'text-gray-500'}>
                            {DEVICE_STATUS[c.status]?.label || c.status}
                        </span>
                    </li>
                ))}
            </ul>
        )}
        <div className="text-xs font-semibold text-gray-700 mb-1">
            Cảnh báo ({zone.alerts.total}, đang mở {zone.alerts.open})
        </div>
        {zone.alerts.latest.length === 0 ? (
            <div className="text-xs text-gray-400">Không có cảnh báo trong khoảng thời gian.</div>
        ) : (
            <ul className="text-xs space-y-1">
                {zone.alerts.latest.map((a) => (
                    <li key={a.alertId} className="flex items-center gap-1.5">
                        <span className={`px-1.5 rounded ${SEVERITY[a.severity]?.cls || 'bg-gray-100'}`}>
                            {SEVERITY[a.severity]?.label || a.severity}
                        </span>
                        <span className="truncate">{getAlertTypeLabel(a.alertType)}</span>
                        {a.occurrenceCount > 1 && <span className="text-gray-400">×{a.occurrenceCount}</span>}
                        <span className="ml-auto text-gray-400 whitespace-nowrap">
                            {ALERT_STATUS_LABELS[a.status] || a.status} · {fmtDateTime(a.lastSeenAt || a.triggeredAt)}
                        </span>
                    </li>
                ))}
            </ul>
        )}
        {alertsLink && zone.alerts.total > 0 && (
            <Link to={`${alertsLink}?zone_id=${zone.zoneId}`} className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                Xem tất cả cảnh báo của khu vực <ExternalLink className="w-3 h-3" />
            </Link>
        )}
    </div>
);

const CampusMap = () => {
    const { pathname } = useLocation();
    // Chỉ SA có trang Cảnh báo an ninh.
    const alertsLink = pathname.startsWith('/system-admin') ? '/system-admin/security-alerts' : null;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [hours, setHours] = useState(24);
    const [building, setBuilding] = useState('');
    const [onlyAlerts, setOnlyAlerts] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await getCampusMap({ hours });
            if (res?.success) {
                setData(res.data);
                setError(null);
            } else {
                setError(res?.message || 'Không thể tải dữ liệu bản đồ.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi khi tải dữ liệu bản đồ.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [hours]);

    useEffect(() => {
        fetchData();
        const id = setInterval(() => fetchData(true), REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchData]);

    const buildings = useMemo(
        () => [...new Set((data?.zones || []).map((z) => z.building).filter(Boolean))].sort(),
        [data]
    );

    const zones = useMemo(
        () => (data?.zones || [])
            .filter((z) => !building || z.building === building)
            .filter((z) => !onlyAlerts || z.alerts.open > 0),
        [data, building, onlyAlerts]
    );
    const located = zones.filter((z) => z.coordinates);
    const unlocated = zones.filter((z) => !z.coordinates);
    const points = located.map((z) => [z.coordinates.lat, z.coordinates.lng]);

    const summary = data?.summary;
    const tiles = summary ? [
        { label: 'Khu vực có toạ độ', value: `${summary.zonesWithCoordinates}/${summary.totalZones}`, icon: MapPin, cls: 'text-blue-600 bg-blue-50' },
        { label: 'Camera online', value: `${summary.camerasOnline}/${summary.totalCameras}`, icon: Camera, cls: 'text-green-600 bg-green-50' },
        { label: 'Cảnh báo đang mở', value: `${summary.openAlertsInWindow}/${summary.alertsInWindow}`, icon: AlertTriangle, cls: 'text-red-600 bg-red-50' },
        { label: 'Cảnh báo không định vị', value: summary.unlocatedAlertsInWindow, icon: AlertTriangle, cls: 'text-gray-600 bg-gray-100' }
    ] : [];

    return (
        <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <MapIcon className="w-6 h-6 text-blue-600" /> Bản đồ khuôn viên
                    </h1>
                    <p className="text-sm text-gray-500">
                        Vị trí khu vực, trạng thái camera và cảnh báo an ninh. Tự cập nhật mỗi 60 giây.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {HOURS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={building} onChange={(e) => setBuilding(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="">Tất cả tòa nhà</option>
                        {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-gray-700 px-2">
                        <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
                        Chỉ khu có cảnh báo mở
                    </label>
                    <button onClick={() => fetchData()} disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                    </button>
                </div>
            </div>

            {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {tiles.map((t) => (
                        <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${t.cls}`}><t.icon className="w-5 h-5" /></div>
                            <div>
                                <div className="text-xl font-bold text-gray-800">{t.value}</div>
                                <div className="text-xs text-gray-500">{t.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                <div className="xl:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden relative">
                    <MapContainer center={DEFAULT_CENTER} zoom={17} style={{ height: 560 }} scrollWheelZoom>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            maxZoom={19}
                        />
                        <FitBounds points={points} />
                        {located.map((z) => (
                            <Marker key={z.zoneId} position={[z.coordinates.lat, z.coordinates.lng]} icon={zoneIcon(z)}
                                eventHandlers={{ click: () => setSelectedId(z.zoneId) }}>
                                <Popup><ZonePopup zone={z} alertsLink={alertsLink} /></Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                    {data && located.length === 0 && (
                        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/70 pointer-events-none">
                            <div className="text-sm text-gray-600 text-center">
                                Chưa có khu vực nào được đặt toạ độ.<br />
                                Vào <b>Quản lý khu vực</b> → Sửa → chọn vị trí trên bản đồ.
                            </div>
                        </div>
                    )}
                    <div className="absolute top-3 right-3 z-[400] bg-white/95 rounded-lg shadow px-3 py-2 text-xs space-y-1">
                        {Object.values(CAMERA_LEVELS).map((l) => (
                            <div key={l.label} className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full inline-block" style={{ background: l.color }} /> {l.label}
                            </div>
                        ))}
                        <div className="text-gray-500 pt-1 border-t">Số trên marker = cảnh báo đang mở</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4 max-h-[560px] overflow-y-auto">
                    <h2 className="font-semibold text-gray-800 mb-3">Khu vực ({zones.length})</h2>
                    {zones.length === 0 && <div className="text-sm text-gray-400">Không có khu vực phù hợp.</div>}
                    <ul className="space-y-2">
                        {[...located, ...unlocated].map((z) => {
                            const level = CAMERA_LEVELS[cameraLevel(z.cameraStatus)];
                            return (
                                <li key={z.zoneId}
                                    className={`p-2 rounded-lg border text-sm ${selectedId === z.zoneId ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: level.color }} title={level.label} />
                                        <span className="font-medium text-gray-800 truncate">{z.zoneName}</span>
                                        {z.alerts.open > 0 && (
                                            <span className={`ml-auto shrink-0 whitespace-nowrap text-xs px-1.5 rounded${SEVERITY[z.alerts.topOpenSeverity]?.cls || 'bg-red-100 text-red-700'}`}>
                                                {z.alerts.open} mở
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {z.building || '—'}{z.floor ? ` · Tầng ${z.floor}` : ''} · {z.cameraStatus.online}/{z.cameras.length} camera online
                                    </div>
                                    {!z.coordinates && <div className="text-xs text-amber-600 mt-0.5">Chưa đặt vị trí</div>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default CampusMap;
