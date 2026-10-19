import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Upload, X, FileText, AlertTriangle, CheckCircle,
    Download, TriangleAlert, Info, Search, UserPlus, Mail, Phone, Building, Loader2
} from 'lucide-react';
import {
    downloadParticipantImportTemplate,
    importMeetingParticipants,
    addExternalParticipant
} from '../../service/businessAdminServices';
import { addInternalParticipant, getUsers } from '../../service/employeeServices';
import { motion } from 'framer-motion';
import UserAvatar from '../common/UserAvatar';

/**
 * AddParticipantsModal — gộp 3 cách thêm người tham dự vào 1 modal, đúng như luồng
 * ở màn Đặt lịch họp (BookMeeting.jsx) để người dùng không phải học 2 giao diện:
 *   - "Nội bộ"      : tìm kiếm nhân viên (search server-side) rồi thêm.
 *   - "Import Excel": tải file mẫu CHUNG với booking, upload, xem preview từng dòng
 *                     rồi mới xác nhận.
 *   - "Khách ngoài" : mời khách theo email (POST .../participants/external).
 *
 * Thay thế cặp AddInternalParticipantModal + AddExternalParticipantModal cũ.
 */

/** Mã lý do cấp dòng của BE -> câu tiếng Việt cho người dùng cuối. */
const ROW_REASON_TEXT = {
    INVALID_ROW_TYPE: 'Cột "Loại" trong file điền sai giá trị',
    MISSING_IDENTIFIER: 'Thiếu cả Email lẫn Mã nhân viên',
    USER_NOT_FOUND: 'Không tìm thấy nhân viên này trong hệ thống',
    ROLE_NOT_ALLOWED: 'Tài khoản quản trị (Business/System Admin) không được mời họp',
    INVALID_EXTERNAL_ROW: 'Khách ngoài cần Email hợp lệ và Họ và tên',
    INVALID_EMAIL: 'Email sai định dạng',
    DUPLICATE_IN_FILE: 'Trùng với một dòng khác trong file',
    PARTICIPANT_ALREADY_EXISTS: 'Đã có trong danh sách người tham dự',
    SCHEDULE_CONFLICT: 'Trùng lịch với một cuộc họp khác trong khung giờ này',
    ROOM_CAPACITY_WARNING: 'Vượt sức chứa phòng họp',
    ROOM_CAPACITY_EXCEEDED: 'Vượt sức chứa phòng họp — không thể thêm',
    IMPORT_ROW_FAILED: 'Lỗi khi ghi vào hệ thống',
};

const ROW_TYPE_TEXT = {
    internal: 'Nhân viên',
    external: 'Khách ngoài',
    unknown: '—',
};

const ROW_STATUS_CONFIG = {
    valid: { color: 'text-green-700 bg-green-50', label: 'Hợp lệ' },
    success: { color: 'text-green-700 bg-green-50', label: 'Thành công' },
    warning: { color: 'text-orange-700 bg-orange-50', label: 'Cảnh báo' },
    error: { color: 'text-red-700 bg-red-50', label: 'Lỗi' },
    failed: { color: 'text-red-700 bg-red-50', label: 'Thất bại' },
    skipped: { color: 'text-slate-500 bg-slate-50', label: 'Bỏ qua' },
    unknown: { color: 'text-slate-500 bg-slate-50', label: 'Không xác định' },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AddParticipantsModal = ({
    meetingId,
    open,
    onClose,
    onSuccess,
    users = [],
    initialTab = 'manual',
    canAddExternal = true,
}) => {
    const [activeTab, setActiveTab] = useState(initialTab);

    // --- TAB NỘI BỘ ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null); // null = chưa search
    const [searching, setSearching] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [manualError, setManualError] = useState(null);
    const searchRequestRef = useRef(0);

    // --- TAB IMPORT EXCEL ---
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [downloadingTemplate, setDownloadingTemplate] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);   // báo cáo TRƯỚC khi ghi (422)
    const [report, setReport] = useState(null);     // báo cáo SAU khi ghi (200)
    const [forceConfirmed, setForceConfirmed] = useState(false);

    const inputRef = useRef(null);

    // --- TAB KHÁCH NGOÀI ---
    const [guestName, setGuestName] = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const [guestOrg, setGuestOrg] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestSubmitting, setGuestSubmitting] = useState(false);
    const [guestError, setGuestError] = useState(null);

    useEffect(() => {
        if (open) setActiveTab(canAddExternal ? initialTab : 'manual');
    }, [open, initialTab, canAddExternal]);

    const reset = () => {
        setSearchQuery('');
        setSearchResults(null);
        setSelectedUserId('');
        setManualLoading(false);
        setManualError(null);
        setFile(null);
        setError(null);
        setPreview(null);
        setReport(null);
        setForceConfirmed(false);
        setGuestName('');
        setGuestEmail('');
        setGuestOrg('');
        setGuestPhone('');
        setGuestError(null);
    };

    const handleClose = () => { reset(); onClose(); };

    // ── TAB NỘI BỘ ─────────────────────────────────────────────────────────
    // Tìm kiếm phía server (debounce 300ms) — giống BookMeeting.jsx. Danh sách
    // `users` truyền vào chỉ là 1 trang đầu (GET /users mặc định limit=20), nếu chỉ
    // lọc client thì phần lớn nhân viên sẽ không bao giờ tìm thấy.
    useEffect(() => {
        const query = searchQuery.trim();
        if (!query) {
            setSearchResults(null);
            setSearching(false);
            return;
        }
        const requestId = ++searchRequestRef.current;
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await getUsers({ search: query, limit: 20, meetingEligibleOnly: true });
                if (requestId !== searchRequestRef.current) return; // kết quả cũ
                setSearchResults(res?.success ? (res.data || []) : []);
            } catch {
                if (requestId === searchRequestRef.current) setSearchResults([]);
            } finally {
                if (requestId === searchRequestRef.current) setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const visibleUsers = useMemo(
        () => (searchResults !== null ? searchResults : users).slice(0, 20),
        [searchResults, users]
    );

    const handleManualAdd = async () => {
        if (!selectedUserId) {
            setManualError('Vui lòng chọn một người dùng.');
            return;
        }
        setManualLoading(true);
        setManualError(null);
        try {
            const res = await addInternalParticipant(meetingId, { userId: selectedUserId });
            if (res?.success) {
                onSuccess?.('Đã thêm người tham dự nội bộ.');
                handleClose();
            } else {
                setManualError(res?.message || 'Thêm thất bại.');
            }
        } catch (err) {
            setManualError(err?.error?.message || err?.message || 'Lỗi hệ thống khi thêm người tham dự.');
        } finally {
            setManualLoading(false);
        }
    };

    // ── TAB IMPORT EXCEL ───────────────────────────────────────────────────
    const pickFile = (picked) => {
        if (picked && picked.name.toLowerCase().endsWith('.xlsx')) {
            setFile(picked);
            setError(null);
            setPreview(null);
            setReport(null);
            setForceConfirmed(false);
        } else {
            setError('Chỉ chấp nhận file Excel (.xlsx).');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        pickFile(e.dataTransfer.files[0]);
    };

    const handleDownloadTemplate = async () => {
        setDownloadingTemplate(true);
        try {
            const res = await downloadParticipantImportTemplate(meetingId);
            if (!res?.isBlob || !res.data) throw new Error('INVALID_TEMPLATE_RESPONSE');
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'SmarTracking_Template_Them_Danh_Sach.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            setError('Không thể tải file mẫu. Vui lòng thử lại.');
        } finally {
            setDownloadingTemplate(false);
        }
    };

    const runImport = async (force) => {
        if (!file) { setError('Vui lòng chọn file Excel trước khi import.'); return; }
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (force) formData.append('forceAddWithWarnings', 'true');

            const res = await importMeetingParticipants(meetingId, formData, { skipToast: true });
            if (res?.success) {
                setPreview(null);
                setReport(res.data || null);
                // Báo cho trang cha refetch ngay, nhưng GIỮ modal mở để người dùng đọc
                // kết quả từng dòng (trước đây modal đóng ngay và giấu hết dòng lỗi).
                onSuccess?.(
                    `Import xong: thêm thành công ${res.data?.successCount ?? 0} người`
                    + `${res.data?.failedCount ? `, ${res.data.failedCount} dòng không thêm được` : ''}.`,
                    { keepOpen: true }
                );
            } else {
                setError(res?.message || 'Import thất bại. Vui lòng kiểm tra lại file.');
            }
        } catch (e) {
            // BE trả 422 kèm preview từng dòng trong error.details (xem utils/request.js:
            // handleResponse dựng errorObj = { success:false, error:{ code, details }, status }).
            const details = e?.error?.details;
            if (details?.results) {
                setPreview(details);
                setError(null);
            } else {
                setError(e?.error?.message || e?.message || 'Lỗi khi import. Vui lòng thử lại.');
            }
        } finally {
            setLoading(false);
        }
    };

    const resetImport = () => {
        setFile(null);
        setPreview(null);
        setReport(null);
        setError(null);
        setForceConfirmed(false);
    };

    // ── TAB KHÁCH NGOÀI ────────────────────────────────────────────────────
    const handleInviteGuest = async (e) => {
        e.preventDefault();
        if (!guestName.trim() || !guestEmail.trim()) {
            setGuestError('Họ tên và email là bắt buộc.');
            return;
        }
        if (!EMAIL_REGEX.test(guestEmail.trim())) {
            setGuestError('Email sai định dạng.');
            return;
        }
        setGuestSubmitting(true);
        setGuestError(null);
        try {
            const res = await addExternalParticipant(meetingId, {
                fullName: guestName.trim(),
                email: guestEmail.trim(),
                organizationName: guestOrg.trim() || undefined,
                phoneNumber: guestPhone.trim() || undefined,
            });
            if (res?.success) {
                onSuccess?.(`Đã gửi lời mời tới ${guestEmail.trim()}.`);
                handleClose();
            } else {
                setGuestError(res?.message || 'Không thể mời khách ngoài. Vui lòng thử lại.');
            }
        } catch (err) {
            setGuestError(err?.error?.message || err?.message || 'Có lỗi xảy ra khi gửi lời mời.');
        } finally {
            setGuestSubmitting(false);
        }
    };

    if (!open) return null;

    const resultData = preview || report;
    const isPreviewStage = !!preview;
    const importableCount = preview
        ? (preview.successCount ?? 0)
        : (report?.successCount ?? 0);

    const tabs = [
        { key: 'manual', label: 'Nội bộ' },
        { key: 'import', label: 'Import Excel' },
        ...(canAddExternal ? [{ key: 'external', label: 'Khách ngoài' }] : []),
    ];

    const renderResultTable = (data) => (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Tổng dòng', val: data.totalRows, color: 'text-midnight-indigo' },
                    {
                        label: isPreviewStage ? 'Sẽ thêm' : 'Thành công',
                        val: data.successCount,
                        color: 'text-green-700',
                    },
                    { label: 'Cảnh báo', val: data.warningCount, color: 'text-orange-600' },
                    {
                        label: isPreviewStage ? 'Dòng lỗi' : 'Thất bại',
                        val: data.failedCount ?? data.errorCount,
                        color: 'text-red-600',
                    },
                ].map(({ label, val, color }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-platinum-tint">
                        <p className={`text-2xl font-extrabold ${color}`}>{val ?? 0}</p>
                        <p className="text-[10px] text-slate-blue mt-0.5 font-semibold uppercase">{label}</p>
                    </div>
                ))}
            </div>

            <div className="border border-platinum-tint rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-cloud-mist/50 border-b border-platinum-tint sticky top-0">
                            <tr>
                                <th className="px-3 py-2.5 font-bold text-slate-blue uppercase">Dòng</th>
                                <th className="px-3 py-2.5 font-bold text-slate-blue uppercase">Định danh</th>
                                <th className="px-3 py-2.5 font-bold text-slate-blue uppercase">Loại</th>
                                <th className="px-3 py-2.5 font-bold text-slate-blue uppercase">Trạng thái</th>
                                <th className="px-3 py-2.5 font-bold text-slate-blue uppercase">Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {(data.results || []).map((r, i) => {
                                const cfg = ROW_STATUS_CONFIG[r.status] || ROW_STATUS_CONFIG.unknown;
                                const reason = r.reason ? (ROW_REASON_TEXT[r.reason] || r.reason) : '—';
                                return (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono">{r.row}</td>
                                        <td className="px-3 py-2 max-w-[150px] truncate" title={r.identifier}>{r.identifier || '—'}</td>
                                        <td className="px-3 py-2 text-slate-blue">{ROW_TYPE_TEXT[r.type] || r.type}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-blue max-w-[220px] truncate" title={reason}>{reason}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-platinum-tint flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-col shrink-0">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h3 className="font-bold text-midnight-indigo text-lg">Thêm người tham dự</h3>
                            <p className="text-xs text-slate-blue mt-0.5">
                                Thêm nhân viên trong hệ thống, import danh sách từ Excel hoặc mời khách ngoài theo email.
                            </p>
                        </div>
                        <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg inline-flex self-start">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === t.key ? 'bg-white text-action-blue shadow-sm' : 'text-slate-500 hover:text-midnight-indigo'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'manual' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase tracking-wider mb-2">Tìm kiếm người dùng <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nhập tên, email hoặc mã nhân viên..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-10 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-action-blue/30 focus:border-action-blue"
                                    />
                                    {searching && (
                                        <div className="absolute inset-y-0 right-3 flex items-center">
                                            <Loader2 className="w-4 h-4 text-action-blue animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border border-platinum-tint rounded-xl overflow-hidden max-h-[300px] overflow-y-auto scrollbar-thin">
                                {visibleUsers.length > 0 ? (
                                    <div className="divide-y divide-platinum-tint">
                                        {visibleUsers.map(u => (
                                            <div
                                                key={u.id}
                                                onClick={() => setSelectedUserId(u.id)}
                                                className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedUserId === u.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar user={u} className="w-8 h-8 rounded-full text-xs font-bold" />
                                                    <div>
                                                        <p className="text-sm font-bold text-midnight-indigo">{u.fullName || u.full_name}</p>
                                                        <p className="text-[10px] text-slate-500">{u.email} • {u.employeeCode || u.employee_code || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedUserId === u.id ? 'border-action-blue bg-action-blue' : 'border-slate-300'}`}>
                                                    {selectedUserId === u.id && <CheckCircle className="w-3 h-3 text-white" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-slate-500 text-sm italic">
                                        {searching ? 'Đang tìm kiếm...' : 'Không tìm thấy người dùng phù hợp.'}
                                    </div>
                                )}
                            </div>

                            {manualError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    <span className="font-medium">{manualError}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'import' && (
                        <div className="space-y-5">
                            {/* Bước 1: Tải template */}
                            {!resultData && (
                                <div className="flex items-center justify-between gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                    <div className="flex items-start gap-3">
                                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-blue-800">Bước 1: Tải file mẫu</p>
                                            <p className="text-xs text-blue-600 mt-0.5">
                                                5 cột: Email, Mã nhân viên, Họ và tên, Tổ chức/Công ty, Số điện thoại.
                                                Hệ thống tự nhận diện nhân viên nội bộ theo Email/Mã nhân viên; không khớp ai
                                                thì tính là khách ngoài (bắt buộc điền Họ và tên). Dùng chung được với file
                                                mẫu ở màn Đặt lịch họp.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleDownloadTemplate}
                                        disabled={downloadingTemplate}
                                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap self-start"
                                    >
                                        {downloadingTemplate
                                            ? <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin" />
                                            : <Download className="w-3.5 h-3.5" />
                                        }
                                        Tải mẫu
                                    </button>
                                </div>
                            )}

                            {/* Bước 2: Upload */}
                            {!resultData && (
                                <div>
                                    <p className="text-xs font-bold text-slate-blue uppercase tracking-wider mb-2">Bước 2: Upload file đã điền</p>
                                    <div
                                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                                        onDragLeave={() => setDragging(false)}
                                        onDrop={handleDrop}
                                        onClick={() => inputRef.current?.click()}
                                        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all ${
                                            dragging ? 'border-action-blue bg-blue-50' : 'border-platinum-tint hover:border-action-blue hover:bg-blue-50/30 bg-slate-50'
                                        }`}
                                    >
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept=".xlsx"
                                            className="hidden"
                                            onChange={e => pickFile(e.target.files?.[0])}
                                        />
                                        <Upload className="w-8 h-8 text-slate-400 mb-3" />
                                        {file ? (
                                            <div className="flex items-center gap-2 text-action-blue font-bold text-sm">
                                                <FileText className="w-4 h-4" />
                                                {file.name}
                                            </div>
                                        ) : (
                                            <>
                                                <p className="text-sm font-bold text-midnight-indigo">Kéo thả file vào đây hoặc nhấn để chọn</p>
                                                <p className="text-xs text-slate-blue mt-1">Chỉ chấp nhận file <strong>.xlsx</strong></p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    <span className="font-medium">{error}</span>
                                </div>
                            )}

                            {/* Preview (chưa ghi) hoặc báo cáo kết quả (đã ghi) */}
                            {resultData && (
                                <div className="space-y-4">
                                    {isPreviewStage && (preview.warningCount > 0 || (preview.failedCount ?? preview.errorCount) > 0) && (
                                        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                            <TriangleAlert className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-orange-800">
                                                    Chưa có gì được thêm — file cần bạn xem lại
                                                </p>
                                                <p className="text-xs text-orange-700 mt-0.5">
                                                    Sửa file rồi upload lại, hoặc tích xác nhận bên dưới để thêm
                                                    {' '}{preview.successCount ?? 0} dòng hợp lệ và bỏ qua phần còn lại.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {!isPreviewStage && (
                                        <div className={`flex items-start gap-3 p-4 rounded-xl border ${report.failedCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                                            <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${report.failedCount > 0 ? 'text-orange-500' : 'text-green-600'}`} />
                                            <div>
                                                <p className={`text-sm font-bold ${report.failedCount > 0 ? 'text-orange-800' : 'text-green-800'}`}>
                                                    Đã thêm {report.successCount ?? 0} người tham dự
                                                </p>
                                                {report.failedCount > 0 && (
                                                    <p className="text-xs text-orange-700 mt-0.5">
                                                        {report.failedCount} dòng không thêm được — xem lý do trong bảng bên dưới.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {renderResultTable(resultData)}

                                    {isPreviewStage && importableCount > 0 && (
                                        <label className="flex items-start gap-3 p-4 bg-slate-50 border border-platinum-tint rounded-xl cursor-pointer hover:bg-cloud-mist transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={forceConfirmed}
                                                onChange={e => setForceConfirmed(e.target.checked)}
                                                className="mt-0.5 accent-action-blue"
                                            />
                                            <div>
                                                <p className="text-sm font-bold text-midnight-indigo">
                                                    Xác nhận thêm {importableCount} dòng hợp lệ
                                                </p>
                                                <p className="text-xs text-slate-blue mt-0.5">
                                                    Các dòng bị đánh dấu Lỗi sẽ được bỏ qua, dòng Cảnh báo vẫn được thêm.
                                                </p>
                                            </div>
                                        </label>
                                    )}

                                    {isPreviewStage && importableCount === 0 && (
                                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                                            Không có dòng nào hợp lệ. Vui lòng sửa file rồi upload lại.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'external' && (
                        <form id="invite-guest-form" onSubmit={handleInviteGuest} className="space-y-4">
                            <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                                <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-purple-700">
                                    Khách ngoài sẽ nhận email lời mời kèm đường dẫn tham gia. Cần mời nhiều khách
                                    một lúc thì dùng tab <strong>Import Excel</strong>.
                                </p>
                            </div>

                            {guestError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                    <span className="font-semibold">{guestError}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Họ và tên khách mời <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Nguyễn Văn A"
                                    value={guestName}
                                    onChange={e => setGuestName(e.target.value)}
                                    className="w-full px-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Địa chỉ Email <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-slate-blue/60 absolute left-3.5 top-2.5" />
                                    <input
                                        type="email"
                                        required
                                        placeholder="email@example.com"
                                        value={guestEmail}
                                        onChange={e => setGuestEmail(e.target.value)}
                                        className="w-full pl-10 pr-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Tên tổ chức / Công ty</label>
                                <div className="relative">
                                    <Building className="w-4 h-4 text-slate-blue/60 absolute left-3.5 top-2.5" />
                                    <input
                                        type="text"
                                        placeholder="Công ty đối tác"
                                        value={guestOrg}
                                        onChange={e => setGuestOrg(e.target.value)}
                                        className="w-full pl-10 pr-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-blue uppercase mb-1">Số điện thoại</label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 text-slate-blue/60 absolute left-3.5 top-2.5" />
                                    <input
                                        type="text"
                                        placeholder="0901234567"
                                        value={guestPhone}
                                        onChange={e => setGuestPhone(e.target.value)}
                                        className="w-full pl-10 pr-3.5 py-2 border border-platinum-tint rounded-xl text-xs focus:outline-none focus:border-action-blue"
                                    />
                                </div>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-platinum-tint bg-cloud-mist/30 flex justify-between items-center gap-3 shrink-0">
                    {activeTab === 'import' && resultData ? (
                        <button onClick={resetImport} className="text-xs font-bold text-slate-blue hover:text-midnight-indigo transition-colors">
                            ← Upload file khác
                        </button>
                    ) : <div />}

                    <div className="flex gap-3">
                        <button onClick={handleClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-midnight-indigo bg-white border border-platinum-tint hover:bg-slate-50 rounded-xl transition-all">
                            {report ? 'Xong' : 'Hủy bỏ'}
                        </button>

                        {activeTab === 'manual' && (
                            <button
                                onClick={handleManualAdd}
                                disabled={manualLoading || !selectedUserId}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
                            >
                                {manualLoading
                                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : <><UserPlus className="w-4 h-4" /> Thêm nội bộ</>
                                }
                            </button>
                        )}

                        {activeTab === 'import' && !report && (
                            <button
                                onClick={() => runImport(isPreviewStage)}
                                disabled={
                                    loading
                                    || !file
                                    || (isPreviewStage && (!forceConfirmed || importableCount === 0))
                                }
                                className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
                            >
                                {loading
                                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : isPreviewStage
                                        ? <><CheckCircle className="w-4 h-4" /> Xác nhận Import</>
                                        : <><Upload className="w-4 h-4" /> Kiểm tra & Import</>
                                }
                            </button>
                        )}

                        {activeTab === 'external' && (
                            <button
                                type="submit"
                                form="invite-guest-form"
                                disabled={guestSubmitting}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-action-blue hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
                            >
                                {guestSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Mời khách</>}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default AddParticipantsModal;
