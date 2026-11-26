import React from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, X } from 'lucide-react';

// Bản đồ vị trí 1 camera (toạ độ lấy từ HGVision qua GET /hgvision/cameras).
const CameraMapModal = ({ camera, onClose }) => {
    if (!camera) return null;
    const { name, latitude, longitude } = camera;
    const pos = [latitude, longitude];
    const coord = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight-indigo/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-platinum-tint flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-action-blue"><MapPin className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-midnight-indigo truncate">{name}</h3>
                        <p className="text-xs text-slate-blue">{coord}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-blue hover:text-midnight-indigo" title="Đóng"><X className="w-5 h-5" /></button>
                </div>
                <MapContainer center={pos} zoom={17} style={{ height: 420 }} scrollWheelZoom>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={19}
                    />
                    <CircleMarker center={pos} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#10b981', fillOpacity: 1 }}>
                        <Popup>
                            <div className="text-sm">
                                <p className="font-bold mb-1">{name}</p>
                                <p>Toạ độ: {coord}</p>
                                <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noopener noreferrer">Mở Google Maps ↗</a>
                            </div>
                        </Popup>
                    </CircleMarker>
                </MapContainer>
            </div>
        </div>,
        document.body
    );
};

export default CameraMapModal;
