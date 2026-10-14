import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../../utils/request';

// showPlate: hiện thêm ảnh cắt biển số (chỉ sự kiện HGVision có; sự kiện khác 404 → tự ẩn).
const EventSnapshotModal = ({ isOpen, onClose, eventId, eventIds = [], initialIndex = 0, showPlate = false }) => {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [notFound, setNotFound] = useState(false);
    const [plateVisible, setPlateVisible] = useState(false);
    
    // Carousel state
    const [currentIndex, setCurrentIndex] = useState(0);

    // List of event IDs to display
    const idsList = eventIds && eventIds.length > 0 ? eventIds : (eventId ? [eventId] : []);

    useEffect(() => {
        if (isOpen) {
            if (eventIds && eventIds.length > 0) {
                // If an initial eventId is specified, try to find its index in the array
                if (eventId) {
                    const foundIndex = eventIds.indexOf(eventId);
                    setCurrentIndex(foundIndex !== -1 ? foundIndex : 0);
                } else {
                    setCurrentIndex(initialIndex >= 0 && initialIndex < eventIds.length ? initialIndex : 0);
                }
            } else {
                setCurrentIndex(0);
            }
        }
    }, [isOpen, eventId, eventIds, initialIndex]);

    const activeEventId = idsList[currentIndex] || null;

    useEffect(() => {
        if (!isOpen || !activeEventId) {
            setNotFound(false);
            setErrorMsg('');
            setLoading(false);
            return;
        }

        setLoading(true);
        setNotFound(false);
        setErrorMsg('');
        setPlateVisible(false);
    }, [isOpen, activeEventId]);

    // Handle Keyboard navigation
    useEffect(() => {
        if (!isOpen || idsList.length <= 1) return;

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                handlePrev(e);
            } else if (e.key === 'ArrowRight') {
                handleNext(e);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex, idsList]);

    const handlePrev = (e) => {
        if (e) e.stopPropagation();
        if (idsList.length <= 1) return;
        setCurrentIndex(prev => (prev === 0 ? idsList.length - 1 : prev - 1));
    };

    const handleNext = (e) => {
        if (e) e.stopPropagation();
        if (idsList.length <= 1) return;
        setCurrentIndex(prev => (prev === idsList.length - 1 ? 0 : prev + 1));
    };

    const token = localStorage.getItem('accessToken');
    const snapshotUrl = activeEventId ? `${API_BASE_URL}/ivss/device-events/${activeEventId}/snapshot?token=${token}` : null;
    const plateUrl = showPlate && snapshotUrl ? `${snapshotUrl}&type=plate` : null;

    if (!isOpen) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                className="absolute top-6 right-6 z-[10000] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Đóng"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Navigation Left */}
            {idsList.length > 1 && (
                <button
                    onClick={handlePrev}
                    className="absolute left-6 top-1/2 -translate-y-1/2 z-[10000] p-4 rounded-full bg-black/30 hover:bg-black/50 text-white border border-white/10 backdrop-blur-sm transition-all duration-200 hover:scale-105 active:scale-95"
                    title="Ảnh trước"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>
            )}

            {/* Navigation Right */}
            {idsList.length > 1 && (
                <button
                    onClick={handleNext}
                    className="absolute right-6 top-1/2 -translate-y-1/2 z-[10000] p-4 rounded-full bg-black/30 hover:bg-black/50 text-white border border-white/10 backdrop-blur-sm transition-all duration-200 hover:scale-105 active:scale-95"
                    title="Ảnh tiếp theo"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            )}

            {loading && (
                <div className="flex flex-col items-center text-white/70 gap-3">
                    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span className="text-sm font-semibold tracking-wide">Đang tải ảnh...</span>
                </div>
            )}

            {!loading && notFound && (
                <div 
                    className="flex flex-col items-center text-white/70 gap-4 p-8 bg-slate-900/50 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ImageIcon className="w-16 h-16 text-white/30" />
                    <span className="text-base font-medium">Không có ảnh cho sự kiện này</span>
                </div>
            )}

            {!loading && errorMsg && (
                <div 
                    className="flex flex-col items-center text-red-400 gap-4 p-8 bg-slate-900/50 rounded-2xl backdrop-blur-md border border-red-500/20 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <AlertCircle className="w-16 h-16 text-red-400/50" />
                    <span className="text-base font-medium text-center max-w-sm">{errorMsg}</span>
                </div>
            )}

            {snapshotUrl && !notFound && !errorMsg && (
                <div 
                    className={`relative w-full max-w-5xl h-full max-h-[85vh] flex items-center justify-center ${loading ? 'hidden' : 'flex'} animate-in zoom-in duration-300`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <img
                        src={snapshotUrl}
                        alt="Event Snapshot"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10 bg-black/20"
                        onLoad={() => setLoading(false)}
                        onError={() => {
                            setLoading(false);
                            setNotFound(true);
                        }}
                    />

                    {/* Ảnh cắt biển số (HGVision) — góc trên trái, ẩn nếu không có */}
                    {plateUrl && (
                        <div className={`absolute top-4 left-4 bg-black/70 border border-white/20 rounded-lg p-2 shadow-2xl ${plateVisible ? 'block' : 'hidden'}`}>
                            <div className="text-[11px] text-white/70 font-semibold mb-1">Biển số</div>
                            <img
                                key={plateUrl}
                                src={plateUrl}
                                alt="Plate crop"
                                className="max-w-[320px] max-h-[160px] object-contain rounded"
                                onLoad={() => setPlateVisible(true)}
                                onError={() => setPlateVisible(false)}
                            />
                        </div>
                    )}

                    {/* Image Counter Badge */}
                    {idsList.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 border border-white/10 px-4 py-1.5 rounded-full text-white text-xs font-bold font-mono tracking-wider backdrop-blur-sm select-none">
                            {currentIndex + 1} / {idsList.length}
                        </div>
                    )}
                </div>
            )}
        </div>,
        document.body
    );
};

export default EventSnapshotModal;
