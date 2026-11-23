import TableColumns from '../../components/common/TableColumns';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import { Car } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from '../../utils/toast';
import { HGV_SYNC } from '../../utils/hgvisionSync';
import { getMyVehicles, createMyVehicle, updateMyVehicle, toggleMyVehicleStatus, deleteMyVehicle } from '../../service/anprService';

const MyVehicles = () => {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentVehicle, setCurrentVehicle] = useState(null);
    const [confirm, setConfirm] = useState(null);

    // Form state
    const [plateNumber, setPlateNumber] = useState('');
    const [vehicleType, setVehicleType] = useState('CAR');
    const [note, setNote] = useState('');

    useEffect(() => {
        fetchVehicles();
    }, []);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const res = await getMyVehicles();
            if (res && res.success && res.data) {
                const normalized = (res.data || []).map(v => ({
                    ...v,
                    status: (v.status === 'active' || v.status === 'ACTIVE') ? 'active' : 'disabled'
                }));
                setVehicles(normalized);
            } else {
                setVehicles([]);
            }
        } catch (err) {
            setError('Không thể tải danh sách phương tiện. Vui lòng thử lại sau.');
            console.error('Lỗi tải danh sách xe:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (vehicle = null) => {
        if (vehicle) {
            setCurrentVehicle(vehicle);
            setPlateNumber(vehicle.plate_raw || vehicle.plate_number || '');
            setVehicleType(vehicle.vehicle_type || 'CAR');
            setNote(vehicle.note || '');
        } else {
            setCurrentVehicle(null);
            setPlateNumber('');
            setVehicleType('CAR');
            setNote('');
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentVehicle(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = { plate_raw: plateNumber, vehicle_type: vehicleType, note };
        try {
            if (currentVehicle) {
                const res = await updateMyVehicle(currentVehicle.id, payload);
                const newPlate = res?.data?.plate_number;
                toast.success(newPlate && newPlate !== currentVehicle.plate_number
                    ? `Đã đổi biển số sang ${newPlate}.`
                    : 'Đã cập nhật phương tiện.');
            } else {
                await createMyVehicle(payload);
                toast.success('Đã đăng ký phương tiện.');
            }
            handleCloseModal();
            fetchVehicles();
        } catch (err) {
            // Lỗi từ BE (biển trùng / sai định dạng…) đã được request.js hiện toast — tránh báo 2 lần.
            if (!err?.error) toast.error('Có lỗi xảy ra: ' + (err?.message || 'Vui lòng kiểm tra lại.'));
        }
    };

    const handleToggleStatus = async (vehicle) => {
        try {
            const newStatus = vehicle.status === 'active' ? 'disabled' : 'active';
            await toggleMyVehicleStatus(vehicle.id, { status: newStatus });
            fetchVehicles();
        } catch (err) {
            toast.error('Lỗi thay đổi trạng thái phương tiện.');
        }
    };

    const handleDelete = (id) => {
        setConfirm({
            message: 'Bạn có chắc chắn muốn xóa phương tiện này?',
            onConfirm: async () => {
                try {
                    await deleteMyVehicle(id);
                    fetchVehicles();
                } catch (err) {
                    toast.error('Lỗi xóa phương tiện. Vui lòng thử lại.');
                }
            },
        });
    };

    return (
        <>
            <ConfirmDialog
                isOpen={!!confirm}
                message={confirm?.message}
                onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
                onCancel={() => setConfirm(null)}
            />
            <div data-page-surface="wide" className="max-w-5xl mx-auto space-y-6 animate-fade-in-up pb-8">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                <div>
                    <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Car className="w-3.5 h-3.5" />
                        Phương tiện
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Phương tiện cá nhân</h1>
                    <p className="text-slate-blue text-sm mt-1">
                        Quản lý biển số xe của bạn để tự động nhận diện khi ra vào bãi đỗ.
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="px-5 py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Đăng ký xe mới
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 overflow-hidden">
                <div className="overflow-x-auto">
                    <PaginatedCollection items={vehicles} itemLabel="phương tiện">
{(camaiPageItems, camaiStartIndex) => (
<ResponsiveTable className="w-full text-left border-collapse">
<TableColumns widths={[20, 16, 18, 26, 20]} />
                        <thead>
                            <tr className="bg-cloud-mist border-b border-platinum-tint">
                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase tracking-wider">Biển số xe</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase tracking-wider">Loại xe</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase tracking-wider">Trạng thái</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase tracking-wider">Ghi chú</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-blue uppercase tracking-wider text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-slate-blue">Đang tải dữ liệu...</td>
                                </tr>
                            ) : vehicles.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="py-12 text-center text-slate-blue">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <svg className="w-12 h-12 text-steel-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 17l.867 12.142A2 2 0 0117.87 31H6.13a2 2 0 01-1.997-1.858L5 17m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <p>Chưa có phương tiện nào được đăng ký.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                camaiPageItems.map((camaiRecord, camaiIndex) => ((vehicle) => (
                                    <tr key={vehicle.id} className="hover:bg-cloud-mist/50 transition-colors">
                                        <td className="py-4 px-6">
                                            <span className="font-bold text-midnight-indigo border border-steel-gray px-3 py-1 rounded bg-white shadow-sm font-mono tracking-widest">{vehicle.plate_number || vehicle.plate_raw}</span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="text-sm font-semibold text-slate-blue">
                                                {vehicle.vehicle_type === 'CAR' ? '🚗 Ô tô' : '🏍 Xe máy'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span data-ui-text="badge" className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                                vehicle.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-steel-gray/20 text-slate-blue'
                                            }`}>
                                                {vehicle.status === 'active' ? 'Đang hoạt động' : 'Tạm vô hiệu'}
                                            </span>
                                            {HGV_SYNC[vehicle.hgvision_sync_status] && (
                                                <div
                                                    className={`mt-1 text-[11px] font-semibold ${HGV_SYNC[vehicle.hgvision_sync_status].cls}`}
                                                    title={vehicle.hgvision_sync_error || ''}
                                                >
                                                    {HGV_SYNC[vehicle.hgvision_sync_status].text}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-slate-blue max-w-xs truncate">
                                            {vehicle.note || '-'}
                                        </td>
                                        <td className="py-4 px-6">
                                            {/* Thao tác dạng chữ, không viền, cùng 1 hàng: Sửa · Tạm dừng/Kích hoạt · Xóa */}
                                            <div className="flex items-center justify-end gap-4 whitespace-nowrap text-sm font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenModal(vehicle)}
                                                    className="text-action-blue hover:underline"
                                                >
                                                    Sửa
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(vehicle)}
                                                    className="text-slate-blue hover:text-midnight-indigo hover:underline"
                                                >
                                                    {vehicle.status === 'active' ? 'Tạm dừng' : 'Kích hoạt'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(vehicle.id)}
                                                    className="text-red-600 hover:text-red-700 hover:underline"
                                                >
                                                    Xóa
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))(camaiRecord, camaiStartIndex + camaiIndex, (vehicles)))
                            )}
                        </tbody>
                    </ResponsiveTable>
)}
</PaginatedCollection>
                </div>
            </div>
        </div>

            {/* Modal Đăng ký / Sửa */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="fixed inset-0 bg-midnight-indigo/40 backdrop-blur-md" onClick={handleCloseModal}></div>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-zoom-in relative z-10">
                        <div className="px-6 py-4 border-b border-platinum-tint flex justify-between items-center bg-cloud-mist">
                            <h3 className="font-bold text-lg text-midnight-indigo">
                                {currentVehicle ? 'Chỉnh sửa phương tiện' : 'Đăng ký xe mới'}
                            </h3>
                            <button onClick={handleCloseModal} className="text-slate-blue hover:text-midnight-indigo p-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Biển số xe *</label>
                                <input
                                    type="text"
                                    required
                                    value={plateNumber}
                                    onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                                    placeholder="VD: 30A-123.45"
                                    className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm font-mono outline-none"
                                />
                                <p data-ui-text="secondary" className="text-[11px] text-slate-blue mt-1">Viết liền hoặc có dấu gạch ngang đều được (Hệ thống sẽ tự chuẩn hóa).</p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Loại phương tiện *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${vehicleType === 'CAR' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                        <input type="radio" name="vtype" value="CAR" checked={vehicleType === 'CAR'} onChange={() => setVehicleType('CAR')} className="hidden" />
                                        <span>🚗 Ô tô</span>
                                    </label>
                                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${vehicleType === 'MOTORBIKE' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                        <input type="radio" name="vtype" value="MOTORBIKE" checked={vehicleType === 'MOTORBIKE'} onChange={() => setVehicleType('MOTORBIKE')} className="hidden" />
                                        <span>🏍 Xe máy</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Ghi chú (Tùy chọn)</label>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Màu xe, hiệu xe..."
                                    className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-platinum-tint text-slate-blue font-semibold hover:bg-cloud-mist transition-colors text-sm"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-action-blue hover:bg-glacier-blue text-white font-bold shadow-sm transition-colors text-sm"
                                >
                                    {currentVehicle ? 'Lưu thay đổi' : 'Đăng ký xe'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default MyVehicles;
