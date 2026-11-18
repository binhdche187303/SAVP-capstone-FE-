import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Phone, Building2, Briefcase, ShieldAlert, BadgeCheck, Loader2 } from 'lucide-react';
import UserAvatar from '../common/UserAvatar';
import { getUserById } from '../../service/employeeServices';

/**
 * Hiển thị chi tiết người tham dự trong Meeting
 * Nếu là Internal (isExternal = false), Modal sẽ gọi API lấy thông tin chi tiết
 * Nếu là External, chỉ hiển thị thông tin tối giản có sẵn
 */
const ParticipantDetailModal = ({ isOpen, onClose, participant, isExternal = false }) => {
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen || !participant) {
            setDetail(null);
            setError(null);
            return;
        }

        if (isExternal) {
            // Khách ngoài thì dùng luôn thông tin truyền vào
            setDetail({
                fullName: participant.name || participant.fullName || participant.full_name || 'Khách mời',
                email: participant.email,
                isExternal: true
            });
            return;
        }

        // Lấy chi tiết user nội bộ
        let isMounted = true;
        setLoading(true);
        setError(null);

        getUserById(participant.id || participant.userId)
            .then(res => {
                if (isMounted) {
                    if (res?.success && res.data) {
                        setDetail(res.data);
                    } else {
                        // Fallback lại thông tin cơ bản nếu API lỗi
                        setDetail({
                            fullName: participant.fullName || participant.full_name || participant.name,
                            email: participant.email || 'Không có email',
                            avatarUrl: participant.avatarUrl || participant.avatar_url,
                        });
                        setError('Không thể tải toàn bộ chi tiết nhân viên.');
                    }
                }
            })
            .catch(err => {
                if (isMounted) {
                    setDetail({
                        fullName: participant.fullName || participant.full_name || participant.name,
                        email: participant.email || 'Không có email',
                        avatarUrl: participant.avatarUrl || participant.avatar_url,
                    });
                    setError('Có lỗi xảy ra khi tải thông tin.');
                }
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [isOpen, participant, isExternal]);

    if (!isOpen || !participant) return null;

    // Helpers
    const getStatusColor = (status) => {
        if (!status) return 'bg-slate-100 text-slate-500';
        const s = status.toLowerCase();
        if (s === 'active') return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        if (s === 'inactive' || s === 'resigned') return 'bg-red-50 text-red-600 border-red-200';
        if (s === 'on_leave') return 'bg-amber-50 text-amber-600 border-amber-200';
        return 'bg-blue-50 text-blue-600 border-blue-200';
    };

    const getStatusLabel = (status) => {
        if (!status) return 'Không rõ';
        const s = status.toLowerCase();
        if (s === 'active') return 'Đang làm việc';
        if (s === 'inactive' || s === 'resigned') return 'Đã nghỉ việc';
        if (s === 'on_leave') return 'Nghỉ phép';
        return status;
    };

    const isInternal = detail && !detail.isExternal;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                {/* Nền mờ chuẩn hệ thống */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header - Gradient background */}
                    <div className="h-32 bg-gradient-to-r from-action-blue to-blue-500 relative">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors z-10 backdrop-blur-md"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-8 pt-0 relative flex-1 flex flex-col">
                        {/* Avatar */}
                        <div className="flex justify-between items-end -mt-12 mb-4">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
                                    <UserAvatar
                                        user={detail || participant}
                                        className="w-full h-full text-3xl"
                                    />
                                </div>
                                {detail?.isDepartmentManager && (
                                    <div className="absolute -bottom-2 -right-2 bg-amber-400 text-white p-1.5 rounded-lg shadow-sm border-2 border-white" title="Trưởng/Phó phòng">
                                        <ShieldAlert className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                            
                            {!loading && isInternal && (
                                <div data-ui-text="badge" className={`px-3 py-1 rounded-lg border text-xs font-bold ${getStatusColor(detail?.employmentStatus)}`}>
                                    {getStatusLabel(detail?.employmentStatus)}
                                </div>
                            )}
                        </div>

                        {/* Name & Title */}
                        <div className="mb-6">
                            <h2 className="text-xl font-extrabold text-midnight-indigo mb-1 flex items-center gap-2">
                                {detail?.fullName || participant.fullName || participant.full_name || 'Đang tải...'}
                                {isInternal && detail?.employeeCode && (
                                    <BadgeCheck className="w-5 h-5 text-action-blue" />
                                )}
                            </h2>
                            <p className="text-sm font-semibold text-slate-blue/80">
                                {isInternal 
                                    ? (detail?.positionTitle || 'Nhân viên')
                                    : 'Khách mời (External)'}
                            </p>
                        </div>

                        {/* Loading State */}
                        {loading ? (
                            <div className="flex-1 flex flex-col justify-center items-center py-8 space-y-4">
                                <Loader2 className="w-8 h-8 text-action-blue animate-spin" />
                                <span data-ui-text="primary" className="text-xs font-bold text-slate-blue">Đang tải thông tin...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {error && (
                                    <p data-ui-text="badge" className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                        {error}
                                    </p>
                                )}

                                {/* Contact Info */}
                                <div className="space-y-3 p-4 bg-cloud-mist rounded-2xl border border-outline-gray">
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-blue shadow-sm">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p data-ui-text="secondary" className="text-[10px] font-bold text-slate-blue/70 uppercase tracking-wider mb-0.5">Email</p>
                                            <p className="text-midnight-indigo font-medium truncate">{detail?.email || 'Không có thông tin'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-blue shadow-sm">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue/70 uppercase tracking-wider mb-0.5">Số điện thoại</p>
                                            <p className="text-midnight-indigo font-medium">{detail?.phoneNumber || 'Không có thông tin'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Department Info (Only for internal) */}
                                {isInternal && (
                                    <div className="space-y-3 p-4 bg-cloud-mist rounded-2xl border border-outline-gray">
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-blue shadow-sm">
                                                <Building2 className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue/70 uppercase tracking-wider mb-0.5">Phòng ban</p>
                                                <p className="text-midnight-indigo font-medium">
                                                    {detail?.department?.departmentName || detail?.departmentName || 'Không xác định'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-blue shadow-sm">
                                                <Briefcase className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue/70 uppercase tracking-wider mb-0.5">Mã nhân viên</p>
                                                <p className="text-midnight-indigo font-medium">{detail?.employeeCode || 'Không có thông tin'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ParticipantDetailModal;
