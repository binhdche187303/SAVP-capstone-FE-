import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, ImageOverlay, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getDevices, getFloorPlanImage, getFloorPlans } from '../../service/sysAdminServices';

// Bản đồ khuôn viên — chế độ "Mặt bằng tầng": ảnh bản vẽ thật của tầng (tải ở Sơ đồ lắp đặt camera)
// làm nền Leaflet CRS.Simple (phóng to/kéo được) + camera tại vị trí đã đặt (metadata_json.layout,
// toạ độ hệ 1000 × chiều cao ảnh) tô màu theo trạng thái, kèm cảnh báo đang mở của khu vực chứa camera.

const W = 1000; // bề rộng hệ toạ độ sơ đồ — khớp CameraLayout.jsx

const STATUS = {
    online: { color: '#22c55e', label: 'Online' },
    offline: { color: '#ef4444', label: 'Offline' },
    maintenance: { color: '#f59e0b', label: 'Bảo trì' },
    disabled: { color: '#94a3b8', label: 'Vô hiệu' }
};

// CRS.Simple: lat tăng lên trên → đổi (x, y) của sơ đồ (y tăng xuống dưới) thành [-y, x].
const toLatLng = (x, y) => [-y, x];

const cameraIcon = (status, openAlerts) => {
    const color = (STATUS[status] || STATUS.disabled).color;
    const badge = openAlerts > 0
        ? `<span style="position:absolute;top:-7px;right:-9px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#ef4444;color:#fff;font:600 10px/16px sans-serif;text-align:center;border:2px solid #fff">${openAlerts}</span>`
        : '';
    return L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11],
        html: `<div style="position:relative;width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)">${badge}</div>`
    });
};

const FitImage = ({ bounds }) => {
    const map = useMap();
    const key = bounds.flat().join(',');
    useEffect(() => {
        map.fitBounds(bounds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);
    return null;
};

const FloorPlanView = ({ zones, building, alertsLink, layoutLink, height = 560 }) => {
    const [plans, setPlans] = useState([]);
    const [devices, setDevices] = useState([]);
    const [floorKey, setFloorKey] = useState('');
    const [imageUrl, setImageUrl] = useState(null);
    const [error, setError] = useState(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getFloorPlans(), getDevices({ limit: 100 })])
            .then(([pRes, dRes]) => {
                if (cancelled) return;
                setPlans(pRes?.data || []);
                setDevices(Array.isArray(dRes?.data) ? dRes.data : dRes?.data?.items || []);
            })
            .catch((err) => !cancelled && setError(err?.error?.message || err?.message || 'Không tải được mặt bằng tầng.'))
            .finally(() => !cancelled && setLoaded(true));
        return () => { cancelled = true; };
    }, []);

    // Lọc tầng theo bộ lọc tòa nhà của trang (floor_key dạng "Tòa - Tầng X").
    const floors = useMemo(
        () => plans
            .filter((p) => !building || p.floorKey.startsWith(`${building} - `))
            .sort((a, b) => a.floorKey.localeCompare(b.floorKey, 'vi')),
        [plans, building]
    );
    // Mặc định mở tầng đã có camera đặt trên bản vẽ (nếu không có thì tầng đầu tiên).
    const defaultFloor = floors.find((p) => devices.some((d) => d.metadata_json?.layout?.floor_key === p.floorKey)) || floors[0];
    const plan = floors.find((p) => p.floorKey === floorKey) || defaultFloor;

    useEffect(() => {
        if (!plan) { setImageUrl(null); return undefined; }
        let url = null;
        let cancelled = false;
        getFloorPlanImage(plan.floorKey)
            .then((res) => {
                if (cancelled || !res?.isBlob) return;
                url = URL.createObjectURL(res.data);
                setImageUrl(url);
            })
            .catch(() => !cancelled && setImageUrl(null));
        return () => {
            cancelled = true;
            setImageUrl(null);
            if (url) URL.revokeObjectURL(url);
        };
    }, [plan]);

    // Trạng thái camera + cảnh báo lấy từ dữ liệu bản đồ khuôn viên (tự làm mới 60 giây).
    const zoneByDevice = useMemo(() => {
        const out = {};
        (zones || []).forEach((z) => z.cameras.forEach((c) => { out[c.deviceId] = { zone: z, camera: c }; }));
        return out;
    }, [zones]);

    const planHeight = plan ? Math.round((W * plan.height) / plan.width) : 0;
    const bounds = [[-planHeight, 0], [0, W]];
    const cameras = useMemo(
        () => (plan ? devices.filter((d) => d.metadata_json?.layout?.floor_key === plan.floorKey) : []),
        [devices, plan]
    );

    if (!loaded) {
        return <div className="flex items-center justify-center text-sm text-gray-500" style={{ height }}>Đang tải mặt bằng tầng...</div>;
    }
    if (error) {
        return <div className="flex items-center justify-center text-sm text-red-600" style={{ height }}>{error}</div>;
    }
    if (!plan) {
        return (
            <div className="flex items-center justify-center text-sm text-gray-600 text-center px-6" style={{ height }}>
                <div>
                    {building ? `Tòa "${building}" chưa có ảnh mặt bằng.` : 'Chưa có tầng nào được tải ảnh mặt bằng.'}<br />
                    {layoutLink
                        ? <>Vào <Link to={layoutLink} className="text-blue-600 hover:underline">Sơ đồ lắp đặt camera</Link> → Chỉnh vị trí → Tải ảnh mặt bằng.</>
                        : 'Quản trị hệ thống tải ảnh ở trang Sơ đồ lắp đặt camera.'}
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            <div className="absolute top-3 left-14 z-[400] flex items-center gap-2 bg-white/95 rounded-lg shadow px-2 py-1.5">
                <select value={plan.floorKey} onChange={(e) => setFloorKey(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white" aria-label="Chọn tầng">
                    {floors.map((p) => <option key={p.floorKey} value={p.floorKey}>{p.floorKey}</option>)}
                </select>
                <span className="text-xs text-gray-500 whitespace-nowrap">{cameras.length} camera trên bản vẽ</span>
            </div>
            <MapContainer
                key={plan.floorKey}
                crs={L.CRS.Simple}
                bounds={bounds}
                minZoom={-3}
                maxZoom={3}
                zoomSnap={0.25}
                style={{ height, background: '#f8fafc' }}
                attributionControl={false}
            >
                <FitImage bounds={bounds} />
                {imageUrl && <ImageOverlay url={imageUrl} bounds={bounds} />}
                {cameras.map((d) => {
                    const ref = zoneByDevice[d.id];
                    const status = ref?.camera.status || d.status;
                    const open = ref?.zone.alerts.open || 0;
                    const { x, y } = d.metadata_json.layout;
                    return (
                        <Marker key={d.id} position={toLatLng(x, Math.min(y, planHeight))} icon={cameraIcon(status, open)}>
                            <Popup>
                                <div className="text-sm min-w-[200px]">
                                    <div className="font-semibold text-gray-800">{d.device_name || d.device_code}</div>
                                    <div className="text-xs text-gray-500 mb-1">{d.device_code}</div>
                                    <div className="text-xs">
                                        Trạng thái: <b style={{ color: (STATUS[status] || STATUS.disabled).color }}>{(STATUS[status] || {}).label || status}</b>
                                    </div>
                                    {ref && (
                                        <div className="text-xs mt-1">
                                            Khu vực: <b>{ref.zone.zoneName}</b> · Hiện diện: <b>{ref.zone.occupancy.count ?? '—'}</b><br />
                                            Cảnh báo đang mở: <b>{open}</b>
                                            {alertsLink && ref.zone.alerts.total > 0 && (
                                                <> · <Link to={`${alertsLink}?zone_id=${ref.zone.zoneId}`} className="text-blue-600 hover:underline">Xem</Link></>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
            {cameras.length === 0 && (
                <div className="absolute bottom-3 left-3 z-[400] bg-white/95 rounded-lg shadow px-3 py-2 text-xs text-gray-600">
                    Chưa đặt camera lên bản vẽ tầng này
                    {layoutLink && <> — <Link to={layoutLink} className="text-blue-600 hover:underline">đặt ở Sơ đồ lắp đặt camera</Link></>}.
                </div>
            )}
        </div>
    );
};

export default FloorPlanView;
