import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Share2, X, CheckCircle, AlertTriangle,
    Loader2, Search, Trash2, UserPlus, Mail
} from 'lucide-react';
import { getUsers } from '../../service/employeeServices';
import { 
    createMinutesShare, 
    getMinutesShares, 
    revokeMinutesShare 
} from '../../service/businessAdminServices';
import { motion, AnimatePresence } from 'framer-motion';
import UserAvatar from '../common/UserAvatar';

/**
 * ShareMinutesModal — M6.3, M6.4, M6.5
 * Luồng: 
 *   - Lấy danh sách đang được chia sẻ: GET /meeting-minutes/:id/shares
 *   - Chia sẻ cho user mới: POST /meeting-minutes/:id/shares { userId }
 *   - Thu hồi chia sẻ: DELETE /meeting-minutes/:id/shares/:userId
 */
const ShareMinutesModal = ({ minutesId, open, onClose }) => {
    const [shares, setShares] = useState([]);
    const [loadingShares, setLoadingShares] = useState(false);
    
    // User search & selection
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    // Form submission / actions state
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [actionSuccess, setActionSuccess] = useState(null);

    // Fetch current shares
    const fetchShares = useCallback(async () => {
        if (!minutesId) return;
        setLoadingShares(true);
        try {
            const res = await getMinutesShares(minutesId);
            if (res?.success) {
                setShares(Array.isArray(res.data) ? res.data : (res.data?.shares || []));
            } else {
                setShares([]);
            }
        } catch (e) {
            console.error('Error fetching shares:', e);
        } finally {
            setLoadingShares(false);
        }
    }, [minutesId]);

    // Fetch users based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setSearchingUsers(true);
            try {
                const res = await getUsers({ search: searchQuery });
                if (res?.success && Array.isArray(res.data)) {
                    // Filter out users who already have access
                    const sharedUserIds = shares.map(s => s.userId || s.user_id || s.user?.id);
                    const filtered = res.data.filter(u => !sharedUserIds.includes(u.id));
                    setSearchResults(filtered.slice(0, 5));
                }
            } catch (e) {
                console.error(e);
            } finally {
                setSearchingUsers(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, shares]);

    useEffect(() => {
        if (open) {
            fetchShares();
            setSelectedUser(null);
            setSearchQuery('');
            setActionError(null);
            setActionSuccess(null);
        }
    }, [open, fetchShares]);

    if (!open) return null;

    const handleShare = async () => {
        if (!selectedUser) return;
        setSubmitting(true);
        setActionError(null);
        setActionSuccess(null);
        try {
            const res = await createMinutesShare(minutesId, { userId: selectedUser.id });
            if (res?.success) {
                setActionSuccess(`Đã chia sẻ biên bản cho ${selectedUser.fullName || selectedUser.full_name || 'người dùng'}.`);
                setSelectedUser(null);
                setSearchQuery('');
                fetchShares();
                setTimeout(() => setActionSuccess(null), 3000);
            } else {
                setActionError(res?.message || 'Chia sẻ thất bại. Vui lòng thử lại.');
            }
        } catch (e) {
            setActionError(e?.error?.message || e?.message || 'Có lỗi xảy ra khi thực hiện chia sẻ.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async (userId, userName) => {
        setActionError(null);
        setActionSuccess(null);
        try {
            const res = await revokeMinutesShare(minutesId, userId);
            if (res?.success) {
                setActionSuccess(`Đã thu hồi quyền xem của ${userName}.`);
                fetchShares();
                setTimeout(() => setActionSuccess(null), 3000);
            } else {
                setActionError(res?.message || 'Thu hồi thất bại.');
            }
        } catch (e) {
            setActionError(e?.error?.message || e?.message || 'Có lỗi xảy ra khi thu hồi chia sẻ.');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-platinum-tint"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                            <Share2 className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-midnight-indigo text-sm">Chia sẻ biên bản</h3>
                            <p data-ui-text="secondary" className="text-[10px] text-slate-blue mt-0.5">Chia sẻ quyền xem biên bản cho nhân sự khác</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Action Feedbacks */}
                    <AnimatePresence>
                        {actionSuccess && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                <span className="font-semibold">{actionSuccess}</span>
                            </motion.div>
                        )}
                        {actionError && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <span className="font-semibold">{actionError}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Share Form */}
                    <div className="space-y-2 relative">
                        <label className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider">Chia sẻ với nhân sự mới</label>
                        
                        {selectedUser ? (
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <UserAvatar user={selectedUser} className="w-8 h-8 rounded-full" />
                                    <div>
                                        <span data-ui-text="primary" className="text-xs font-bold text-midnight-indigo block">{selectedUser.fullName || selectedUser.full_name}</span>
                                        <span data-ui-text="secondary" className="text-[10px] text-slate-blue">{selectedUser.email}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedUser(null)}
                                    className="p-1 hover:bg-blue-100 rounded text-slate-400 hover:text-red-500"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-blue/60 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    placeholder="Tìm theo tên hoặc email nhân sự..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-8 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                />
                                {searchingUsers && <Loader2 className="w-4 h-4 text-slate-blue animate-spin absolute right-3 top-2.5" />}
                            </div>
                        )}

                        {/* Search Results Dropdown */}
                        {searchResults.length > 0 && !selectedUser && (
                            <div className="absolute left-0 right-0 top-[60px] bg-white border border-platinum-tint rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto overflow-x-hidden p-1.5 space-y-1">
                                {searchResults.map(u => (
                                    <div
                                        key={u.id}
                                        onClick={() => {
                                            setSelectedUser(u);
                                            setSearchResults([]);
                                            setSearchQuery('');
                                        }}
                                        className="flex items-center gap-3 p-2 hover:bg-cloud-mist rounded-lg cursor-pointer transition-colors"
                                    >
                                        <UserAvatar user={u} className="w-7 h-7 rounded-full font-bold text-[10px]" />
                                        <div className="truncate">
                                            <span data-ui-text="primary" className="text-xs font-bold text-midnight-indigo block truncate">{u.fullName || u.full_name}</span>
                                            <span data-ui-text="secondary" className="text-[9.5px] text-slate-blue block truncate">{u.email}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedUser && (
                        <button
                            onClick={handleShare}
                            disabled={submitting}
                            className="w-full py-2 bg-action-blue hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                            Xác nhận chia sẻ
                        </button>
                    )}

                    {/* Shared list */}
                    <div className="space-y-3 pt-2 border-t border-platinum-tint/50">
                        <label className="block text-[10px] font-bold text-slate-blue uppercase tracking-wider">Đang được chia sẻ ({shares.length})</label>
                        
                        {loadingShares ? (
                            <div className="flex items-center justify-center py-6 text-slate-blue gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span data-ui-text="secondary" className="text-[11px] font-medium">Đang tải danh sách...</span>
                            </div>
                        ) : shares.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 flex flex-col items-center gap-1.5">
                                <Mail className="w-7 h-7 text-platinum-tint" />
                                <span data-ui-text="secondary" className="text-[11px]">Chưa chia sẻ cho ai ngoài các thành viên phòng họp.</span>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                                {shares.map(s => {
                                    // BE MinutesShareListItemDto trả field phẳng: id, userId, userFullName, userEmail
                                    // (không lồng object "user") — không cần đoán qua nhiều tên field.
                                    const uName = s.userFullName || 'Nhân sự';
                                    const uEmail = s.userEmail || '';
                                    const uId = s.userId;
                                    const u = { id: uId, fullName: uName, email: uEmail };
                                    return (
                                        <div key={s.id || uId} className="flex items-center justify-between p-2.5 bg-slate-50 border border-platinum-tint/65 rounded-xl">
                                            <div className="flex items-center gap-2.5 truncate">
                                                <UserAvatar user={u} name={uName} className="w-7.5 h-7.5 rounded-full shrink-0 font-bold text-[10px]" />
                                                <div className="truncate">
                                                    <span data-ui-text="primary" className="text-xs font-bold text-midnight-indigo block truncate">{uName}</span>
                                                    <span data-ui-text="secondary" className="text-[9.5px] text-slate-blue block truncate">{uEmail}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRevoke(uId, uName)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Thu hồi quyền xem"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all">
                        Đóng
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default ShareMinutesModal;
