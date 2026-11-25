import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import Pagination from '../common/Pagination';

const PAGE_SIZE = 10;

const numberOrZero = value => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const mapRoomUtilizationRows = rooms => (rooms || [])
    .map((room, index) => ({
        id: room.roomId || room.id || `${room.roomName || room.room_name || 'room'}-${index}`,
        name: (room.roomName || room.room_name || '').replace(/^Phòng\s+/i, '') || '—',
        rate: +numberOrZero(room.reservationUtilizationRate ?? room.utilizationRate).toFixed(1),
        bookedHours: +numberOrZero(room.bookedHours).toFixed(1),
        actualHours: room.actualHours === null || room.actualHours === undefined
            ? null
            : +numberOrZero(room.actualHours).toFixed(1),
    }))
    .filter(room => room.name !== '—');

export const rankRoomUtilizationRows = (rooms, limit = 8) => [...(rooms || [])]
    .sort((left, right) => right.rate - left.rate
        || right.bookedHours - left.bookedHours
        || left.name.localeCompare(right.name, 'vi'))
    .slice(0, limit);

const sorters = {
    rateDesc: (left, right) => right.rate - left.rate || right.bookedHours - left.bookedHours || left.name.localeCompare(right.name, 'vi'),
    bookedDesc: (left, right) => right.bookedHours - left.bookedHours || right.rate - left.rate || left.name.localeCompare(right.name, 'vi'),
    actualDesc: (left, right) => (right.actualHours ?? -1) - (left.actualHours ?? -1) || right.rate - left.rate || left.name.localeCompare(right.name, 'vi'),
    nameAsc: (left, right) => left.name.localeCompare(right.name, 'vi'),
};

const formatHours = value => value === null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN')} giờ`;

const RoomUtilizationDetailsModal = ({ isOpen, onClose, rooms = [], periodLabel }) => {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('rateDesc');
    const [page, setPage] = useState(1);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, onClose]);

    useEffect(() => { setPage(1); }, [search, sortBy, rooms]);

    const filteredRooms = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('vi');
        return [...rooms]
            .filter(room => !query || room.name.toLocaleLowerCase('vi').includes(query))
            .sort(sorters[sortBy]);
    }, [rooms, search, sortBy]);

    if (!isOpen) return null;

    const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageRooms = filteredRooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6"
            role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="room-utilization-title"
                className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-platinum-tint bg-white shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-platinum-tint px-5 py-4 sm:px-6">
                    <div>
                        <h2 id="room-utilization-title" className="text-lg font-bold text-midnight-indigo">Tất cả phòng họp</h2>
                        <p className="mt-1 text-xs text-slate-blue">{periodLabel} · {rooms.length.toLocaleString('vi-VN')} phòng đang hoạt động</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Đóng chi tiết phòng họp"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-blue hover:bg-cloud-mist hover:text-midnight-indigo">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="grid gap-3 border-b border-platinum-tint bg-cloud-mist/40 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-6">
                    <label className="relative block">
                        <span className="sr-only">Tìm phòng</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-gray" />
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên phòng..."
                            className="h-10 w-full rounded-xl border border-platinum-tint bg-white pl-9 pr-3 text-sm text-midnight-indigo outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/10" />
                    </label>
                    <label>
                        <span className="sr-only">Sắp xếp danh sách phòng</span>
                        <select value={sortBy} onChange={event => setSortBy(event.target.value)}
                            className="h-10 w-full rounded-xl border border-platinum-tint bg-white px-3 text-sm text-midnight-indigo outline-none focus:border-action-blue">
                            <option value="rateDesc">Tỷ lệ cao nhất</option>
                            <option value="bookedDesc">Giờ đặt nhiều nhất</option>
                            <option value="actualDesc">Giờ dùng thực tế</option>
                            <option value="nameAsc">Tên phòng A–Z</option>
                        </select>
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    {pageRooms.length ? (
                        <table className="w-full min-w-[720px] border-collapse text-left">
                            <thead className="sticky top-0 z-10 bg-cloud-mist text-[11px] font-bold uppercase text-slate-blue">
                                <tr>
                                    <th className="px-6 py-3">Xếp hạng</th>
                                    <th className="px-4 py-3">Phòng</th>
                                    <th className="px-4 py-3 text-right">Tỷ lệ được đặt</th>
                                    <th className="px-4 py-3 text-right">Giờ đã đặt</th>
                                    <th className="px-6 py-3 text-right">Sử dụng thực tế</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRooms.map((room, index) => (
                                    <tr key={room.id} className="border-b border-pale-gray last:border-0 hover:bg-cloud-mist/40">
                                        <td className="px-6 py-3 text-xs font-semibold text-slate-blue">#{(safePage - 1) * PAGE_SIZE + index + 1}</td>
                                        <td className="px-4 py-3 text-sm font-semibold text-midnight-indigo">{room.name}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${room.rate >= 80 ? 'bg-green-50 text-green-700' : room.rate >= 50 ? 'bg-blue-50 text-action-blue' : 'bg-amber-50 text-amber-700'}`}>
                                                {room.rate.toLocaleString('vi-VN')}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-midnight-indigo">{formatHours(room.bookedHours)}</td>
                                        <td className="px-6 py-3 text-right text-xs text-slate-blue">{formatHours(room.actualHours)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex min-h-52 items-center justify-center px-6 text-center text-sm text-slate-blue">Không tìm thấy phòng phù hợp.</div>
                    )}
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-platinum-tint px-5 py-4 sm:px-6">
                    <p className="text-xs font-medium text-slate-blue">Hiển thị {pageRooms.length} / {filteredRooms.length.toLocaleString('vi-VN')} phòng</p>
                    <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
                </footer>
            </section>
        </div>,
        document.body,
    );
};

export default RoomUtilizationDetailsModal;
