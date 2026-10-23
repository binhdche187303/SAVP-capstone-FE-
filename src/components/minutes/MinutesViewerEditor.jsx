import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from '../../utils/toast';
import {
    Edit3, Save, X,
    Send, Info, AlertCircle, FileText, Target, Sparkles, Loader2, BrainCircuit,
    Share2, Download, Trash2, PenLine, Radio
} from 'lucide-react';
import { updateMeetingMinutes, issueMeetingMinutes, distributeMeetingMinutes, deleteMeetingMinutes, toggleLiveShareMinutes } from '../../service/minutesServices';
import { submitMinutesSignoff } from '../../service/employeeServices';
import ExportMinutesModal from './ExportMinutesModal';
import ShareMinutesModal from './ShareMinutesModal';

const MinutesViewerEditor = ({ minutes, meetingId, isHost, isSecretary = false, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Modal state for Issue, Export, Share, Delete
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [distributing, setDistributing] = useState(false);
    const [isTogglingLive, setIsTogglingLive] = useState(false);
    const [isSubmittingSignoff, setIsSubmittingSignoff] = useState(false);

    const showToast = (message, type = 'success') => {
        (toast[type] || toast.info)(message);
    };

    const handleStartEdit = () => {
        setEditForm({
            minutesContent: minutes.mainContent?.minutesContent || '',
            decisions: [...(minutes.mainContent?.decisions || [])],
            actionItems: [...(minutes.mainContent?.actionItems || [])],
            aiSummary: minutes.aiSummary ? {
                keyPoints: [...(minutes.aiSummary.keyPoints || [])],
                risks: [...(minutes.aiSummary.risks || [])],
                openQuestions: [...(minutes.aiSummary.openQuestions || [])]
            } : null
        });
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        setIsSaving(true);
        try {
            const payload = {
                versionNo: minutes.versionNo,
                minutesContent: editForm.minutesContent,
                decisionsJson: editForm.decisions,
                actionItemsJson: editForm.actionItems
            };

            if (editForm.aiSummary) {
                payload.aiSummary = editForm.aiSummary;
            }

            const res = await updateMeetingMinutes(minutes.id, payload);
            if (res?.success) {
                showToast('Lưu bản nháp thành công!');
                setIsEditing(false);
                if (onRefresh) onRefresh();
            } else {
                showToast('Lỗi khi lưu bản nháp', 'error');
            }
        } catch (err) {
            if (err.message?.includes('conflict')) {
                showToast('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại.', 'error');
            } else {
                showToast(err.message || 'Lỗi hệ thống', 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitSignoff = async () => {
        setIsSubmittingSignoff(true);
        try {
            await submitMinutesSignoff(meetingId, { minutesId: minutes.id });
            showToast('Đã trình ký biên bản');
            // Báo khung "Trình ký biên bản" (MeetingPrepPanel) tải lại trạng thái.
            window.dispatchEvent(new CustomEvent('meeting-signoff-changed', { detail: { meetingId } }));
            if (onRefresh) onRefresh();
        } catch {
            // request.js đã toast lỗi
        } finally {
            setIsSubmittingSignoff(false);
        }
    };

    const handleDistribute = async () => {
        setDistributing(true);
        try {
            const res = await distributeMeetingMinutes(meetingId, {
                minutesId: minutes.id,
                recipientScope: 'participants',
                channels: ['email', 'in_app'],
            });
            if (res?.success) {
                showToast(`Đã gửi biên bản tới ${res.data?.queuedRecipientCount ?? 0} người.`);
            } else {
                showToast(res?.message || 'Gửi biên bản thất bại.', 'error');
            }
        } catch (e) {
            showToast(e?.error?.message || e?.message || 'Có lỗi khi gửi biên bản.', 'error');
        } finally {
            setDistributing(false);
        }
    };

    const handleToggleLiveShare = async () => {
        setIsTogglingLive(true);
        try {
            const nextEnabled = !minutes.isLiveShared;
            const res = await toggleLiveShareMinutes(minutes.id, nextEnabled);
            if (res?.success) {
                showToast(nextEnabled ? 'Đã bật chia sẻ trực tiếp — participant có thể xem bản nháp.' : 'Đã tắt chia sẻ trực tiếp.');
                if (onRefresh) onRefresh();
            } else {
                showToast(res?.message || 'Không thể đổi trạng thái chia sẻ trực tiếp.', 'error');
            }
        } catch (err) {
            showToast(err?.error?.message || err.message || 'Lỗi khi đổi trạng thái chia sẻ trực tiếp.', 'error');
        } finally {
            setIsTogglingLive(false);
        }
    };

    const handleIssue = async () => {
        setIsIssuing(true);
        try {
            const res = await issueMeetingMinutes(minutes.id);
            if (res?.success) {
                showToast('Ban hành biên bản thành công!');
                setShowIssueModal(false);
                if (onRefresh) onRefresh();
            } else {
                showToast('Lỗi khi ban hành', 'error');
            }
        } catch (err) {
            // request.js đã hiện toast lỗi từ server; chỉ báo thêm khi không có phản hồi
            if (!err?.error?.message) showToast(err?.message || 'Lỗi kết nối', 'error');
        } finally {
            setIsIssuing(false);
        }
    };

    const handleDeleteMinutes = async () => {
        setIsDeleting(true);
        try {
            const res = await deleteMeetingMinutes(minutes.id);
            if (res?.success) {
                const attachmentMsg = res.data?.cascadedAttachmentCount > 0 
                    ? ` (Đã xóa kèm theo ${res.data.cascadedAttachmentCount} file đính kèm)` 
                    : '';
                showToast(`Đã xóa biên bản họp nháp thành công${attachmentMsg}!`);
                setShowDeleteModal(false);
                if (onRefresh) onRefresh();
            } else {
                showToast(res?.message || 'Lỗi khi xóa biên bản', 'error');
            }
        } catch (err) {
            showToast(err.error?.message || err.message || 'Lỗi hệ thống khi xóa biên bản', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // Lấy thông tin user đăng nhập để kiểm tra quyền
    const localUserStr = localStorage.getItem('user');
    let currentUser = null;
    try {
        currentUser = localUserStr ? JSON.parse(localUserStr) : null;
    } catch (e) {
        console.error('Lỗi phân tích user từ localStorage:', e);
    }
    const isAdmin = currentUser?.roles?.some(r => ['BUSINESS_ADMIN', 'SYSTEM_ADMIN'].includes(r.roleCode || r.role_code));
    const isOwner = currentUser && (
        currentUser.id === minutes.preparedById || 
        currentUser.id === minutes.preparedBy?.id ||
        currentUser.id === minutes.preparedBy
    );

    // BE khoá sửa/xoá khi biên bản đang chờ ký hoặc đã ký duyệt (permissions.signoffLocked)
    const locked = !!minutes.permissions?.signoffLocked;
    const canEdit = !locked && (isHost || isSecretary || minutes.permissions?.canEdit) && minutes.status === 'draft';
    // Ban hành: theo BE (chỉ chủ trì; cuộc họp cần trình ký thì phải ký duyệt xong mới ban hành).
    const canIssue = (minutes.permissions ? minutes.permissions.canIssue : isHost) && minutes.status === 'draft';
    const canSubmitSignoff = !!minutes.permissions?.canSubmitSignoff;
    const canDelete = !locked && minutes.status === 'draft' && (isHost || isOwner || isAdmin || minutes.permissions?.canDelete);
    const canLiveShare = minutes.status === 'draft' && (minutes.permissions?.canLiveShare ?? isHost);
    // Xuất file: chỉ Host / người soạn thảo (preparedBy) / Admin — khớp ownership-or-admin
    // rule ở BE (MinutesExportService.createExportJob, UC-147). Participant thường KHÔNG
    // được export dù biên bản đã published (quyết định PO, xem spec feat-export-meeting-minutes).
    const canExport = isHost || isOwner || isAdmin;

    const getConfidenceBadge = (confidence) => {
        switch (confidence) {
            case 'high': return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700">Độ tin cậy cao</span>;
            case 'low': return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-100 text-red-700">Độ tin cậy thấp</span>;
            case 'medium':
            default: return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-700">Độ tin cậy T.Bình</span>;
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 overflow-hidden relative">
            {/* Header */}
            <div className="p-5 border-b border-platinum-tint flex flex-col sm:flex-row flex-wrap justify-between items-center gap-4 bg-cloud-mist/30">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <FileText className="w-5 h-5 text-action-blue" />
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wider">{minutes.title || 'Biên bản cuộc họp'}</h3>
                            {minutes.isAiGenerated ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 flex items-center gap-1 border border-purple-200">
                                    <Sparkles className="w-3 h-3" /> Tạo bởi AI
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-1 border border-blue-200">
                                    <PenLine className="w-3 h-3" /> Thủ công
                                </span>
                            )}
                            {minutes.contentFormat === 'blank' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    Trang trắng
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                minutes.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                                {minutes.status === 'published' ? 'Đã ban hành' : 'Bản nháp'}
                            </span>
                            <span className="text-[10px] text-slate-blue font-medium">Phiên bản: {minutes.versionNo}</span>
                            {minutes.isLiveShared && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-red-100 text-red-700 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                                    Đang chia sẻ trực tiếp
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                    {canLiveShare && (
                        <button
                            onClick={handleToggleLiveShare}
                            disabled={isTogglingLive}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                                minutes.isLiveShared
                                    ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                                    : 'border border-platinum-tint text-slate-blue hover:bg-cloud-mist'
                            }`}
                            title={minutes.isLiveShared ? 'Tắt chia sẻ trực tiếp cho participant' : 'Bật chia sẻ trực tiếp cho participant xem trong lúc soạn'}
                        >
                            {isTogglingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                            {minutes.isLiveShared ? 'Đang chia sẻ' : 'Chia sẻ trực tiếp'}
                        </button>
                    )}
                    {isEditing ? (
                        <>
                            <button 
                                onClick={() => setIsEditing(false)}
                                disabled={isSaving}
                                className="px-3 py-1.5 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button 
                                onClick={handleSaveEdit}
                                disabled={isSaving}
                                className="px-3 py-1.5 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Lưu bản nháp
                            </button>
                        </>
                    ) : (
                        <>
                            {canEdit && (
                                <button 
                                    onClick={handleStartEdit}
                                    className="px-3 py-1.5 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors flex items-center gap-1"
                                >
                                    <Edit3 className="w-3.5 h-3.5" /> Sửa
                                </button>
                            )}
                            {canDelete && (
                                <button 
                                    onClick={() => setShowDeleteModal(true)}
                                    disabled={minutes.status !== 'draft' || isDeleting}
                                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                    title={minutes.status !== 'draft' ? "Chỉ có thể xoá biên bản ở trạng thái nháp (draft)" : "Xoá biên bản nháp"}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                            )}
                            {canSubmitSignoff && (
                                <button
                                    onClick={handleSubmitSignoff}
                                    disabled={isSubmittingSignoff}
                                    className="px-3 py-1.5 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                                >
                                    {isSubmittingSignoff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
                                    Trình ký
                                </button>
                            )}
                            {canIssue && (
                                <button 
                                    onClick={() => setShowIssueModal(true)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    <Send className="w-3.5 h-3.5" /> Ban hành
                                </button>
                            )}
                            {minutes.status === 'published' && (
                                <>
                                    {(isHost || minutes.permissions?.canShare !== false) && (
                                        <button
                                            onClick={() => setShowShareModal(true)}
                                            className="px-3 py-1.5 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Share2 className="w-3.5 h-3.5 text-purple-600" /> Chia sẻ
                                        </button>
                                    )}
                                    {isHost && (
                                        <button
                                            onClick={handleDistribute}
                                            disabled={distributing}
                                            className="px-3 py-1.5 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                        >
                                            <Send className="w-3.5 h-3.5 text-emerald-600" />
                                            {distributing ? 'Đang gửi...' : 'Gửi thông báo'}
                                        </button>
                                    )}
                                    {canExport && (
                                        <button
                                            onClick={() => setShowExportModal(true)}
                                            className="px-3 py-1.5 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue transition-colors flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Download className="w-3.5 h-3.5" /> Xuất file
                                        </button>
                                    )}
                                </>
                            )}
                        </>
                    )}

                </div>
            </div>

            {/* Content Area */}
            <div className="p-5 overflow-y-auto max-h-[600px] scrollbar-thin space-y-6">
                
                {/* AI Summary Section */}
                {minutes.aiSummary && (
                    <div className="bg-purple-50/50 rounded-2xl p-4 border border-purple-100">
                        <h4 className="text-xs font-bold text-purple-900 uppercase flex items-center gap-1.5 mb-3">
                            <BrainCircuit className="w-4 h-4" /> Tổng quan AI
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Key Points */}
                            <div className="space-y-2">
                                <h5 className="text-[11px] font-bold text-purple-800">Ý chính (Key Points)</h5>
                                {isEditing ? (
                                    <textarea
                                        value={editForm.aiSummary.keyPoints.join('\n')}
                                        onChange={(e) => setEditForm({
                                            ...editForm,
                                            aiSummary: { ...editForm.aiSummary, keyPoints: e.target.value.split('\n') }
                                        })}
                                        className="w-full text-xs p-2 border border-purple-200 rounded-xl focus:outline-none focus:border-purple-400 min-h-[80px]"
                                    />
                                ) : (
                                    <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                                        {(minutes.aiSummary.keyPoints || []).map((point, idx) => (
                                            <li key={idx} className="leading-relaxed">{point}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Risks & Open Questions */}
                            <div className="space-y-4">
                                <div>
                                    <h5 className="text-[11px] font-bold text-amber-800 flex items-center gap-1">Rủi ro (Risks)</h5>
                                    {isEditing ? (
                                        <textarea
                                            value={editForm.aiSummary.risks.join('\n')}
                                            onChange={(e) => setEditForm({
                                                ...editForm,
                                                aiSummary: { ...editForm.aiSummary, risks: e.target.value.split('\n') }
                                            })}
                                            className="w-full text-xs p-2 border border-amber-200 bg-amber-50 rounded-xl focus:outline-none focus:border-amber-400 mt-1 min-h-[60px]"
                                        />
                                    ) : (
                                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 mt-1">
                                            {(minutes.aiSummary.risks || []).map((risk, idx) => (
                                                <li key={idx} className="leading-relaxed">{risk}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Decisions Section — ẩn ở chế độ 'Trang trắng' (không ép cấu trúc) */}
                {minutes.contentFormat !== 'blank' && (
                <div>
                    <h4 className="text-xs font-bold text-midnight-indigo uppercase flex items-center gap-1.5 mb-3 border-b border-platinum-tint pb-2">
                        <AlertCircle className="w-4 h-4 text-action-blue" /> Các quyết định
                    </h4>

                    {isEditing ? (
                        <div className="space-y-3">
                            {editForm.decisions.map((decision, idx) => (
                                <div key={idx} className="flex gap-2 items-start bg-cloud-mist/30 p-2 rounded-xl">
                                    <textarea
                                        value={decision.text}
                                        onChange={(e) => {
                                            const newDecisions = [...editForm.decisions];
                                            newDecisions[idx].text = e.target.value;
                                            setEditForm({ ...editForm, decisions: newDecisions });
                                        }}
                                        className="flex-1 text-xs p-2 border border-platinum-tint rounded-lg focus:outline-none focus:border-action-blue min-h-[60px]"
                                        placeholder="Nội dung quyết định"
                                    />
                                    <button 
                                        onClick={() => {
                                            const newDecisions = editForm.decisions.filter((_, i) => i !== idx);
                                            setEditForm({ ...editForm, decisions: newDecisions });
                                        }}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={() => setEditForm({ ...editForm, decisions: [...editForm.decisions, { text: '', confidence: 'high' }] })}
                                className="text-xs font-bold text-action-blue hover:underline"
                            >
                                + Thêm quyết định
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {(minutes.mainContent?.decisions || []).map((decision, idx) => (
                                <div key={idx} className="flex justify-between items-start p-3 bg-white border border-platinum-tint rounded-xl hover:shadow-sm transition-shadow">
                                    <p className="text-xs text-slate-700 leading-relaxed max-w-[80%]">{decision.text}</p>
                                    <div className="shrink-0 ml-4">
                                        {minutes.isAiGenerated && getConfidenceBadge(decision.confidence)}
                                    </div>
                                </div>
                            ))}
                            {(!minutes.mainContent?.decisions || minutes.mainContent.decisions.length === 0) && (
                                <p className="text-xs text-slate-blue italic">Không có quyết định nào được ghi nhận.</p>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* Action Items Section — ẩn ở chế độ 'Trang trắng' */}
                {minutes.contentFormat !== 'blank' && (
                <div>
                    <h4 className="text-xs font-bold text-midnight-indigo uppercase flex items-center gap-1.5 mb-3 border-b border-platinum-tint pb-2">
                        <Target className="w-4 h-4 text-emerald-600" /> Các công việc cần làm (Action Items)
                    </h4>

                    <div className="overflow-x-auto pb-2 scrollbar-thin w-full">
                        <table className="w-full text-left border-collapse min-w-[650px]">
                            <thead>
                                <tr className="border-b border-platinum-tint bg-cloud-mist/50">
                                    <th className="p-3 text-[10px] font-bold text-slate-blue uppercase">Công việc</th>
                                    <th className="p-3 text-[10px] font-bold text-slate-blue uppercase w-32">Người phụ trách</th>
                                    <th className="p-3 text-[10px] font-bold text-slate-blue uppercase w-24">Deadline</th>
                                    {minutes.isAiGenerated && !isEditing && <th className="p-3 text-[10px] font-bold text-slate-blue uppercase w-28">AI Confidence</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {isEditing ? (
                                    editForm.actionItems.map((item, idx) => (
                                        <tr key={idx} className="border-b border-platinum-tint/50">
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.task}
                                                    onChange={(e) => {
                                                        const newItems = [...editForm.actionItems];
                                                        newItems[idx].task = e.target.value;
                                                        setEditForm({ ...editForm, actionItems: newItems });
                                                    }}
                                                    className="w-full text-xs p-1.5 border border-platinum-tint rounded focus:outline-none focus:border-action-blue"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.owner || ''}
                                                    onChange={(e) => {
                                                        const newItems = [...editForm.actionItems];
                                                        newItems[idx].owner = e.target.value;
                                                        setEditForm({ ...editForm, actionItems: newItems });
                                                    }}
                                                    className="w-full text-xs p-1.5 border border-platinum-tint rounded focus:outline-none focus:border-action-blue"
                                                    placeholder="Tên..."
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.deadline || ''}
                                                    onChange={(e) => {
                                                        const newItems = [...editForm.actionItems];
                                                        newItems[idx].deadline = e.target.value;
                                                        setEditForm({ ...editForm, actionItems: newItems });
                                                    }}
                                                    className="w-full text-xs p-1.5 border border-platinum-tint rounded focus:outline-none focus:border-action-blue"
                                                    placeholder="Hạn..."
                                                />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    (minutes.mainContent?.actionItems || []).map((item, idx) => (
                                        <tr key={idx} className="border-b border-platinum-tint hover:bg-cloud-mist/30 transition-colors">
                                            <td className="p-3 text-xs text-midnight-indigo font-medium">{item.task}</td>
                                            <td className="p-3 text-xs text-slate-600">{item.owner || '-'}</td>
                                            <td className="p-3 text-[11px] text-slate-blue font-mono">{item.deadline || '-'}</td>
                                            {minutes.isAiGenerated && (
                                                <td className="p-3">{getConfidenceBadge(item.confidence)}</td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        {(!minutes.mainContent?.actionItems || minutes.mainContent.actionItems.length === 0) && !isEditing && (
                            <p className="text-xs text-slate-blue italic p-4 text-center">Không có công việc nào được giao.</p>
                        )}
                        {isEditing && (
                            <div className="pt-2">
                                <button 
                                    onClick={() => setEditForm({ ...editForm, actionItems: [...editForm.actionItems, { task: '', owner: '', deadline: '', priority: 'medium', confidence: 'high' }] })}
                                    className="text-xs font-bold text-action-blue hover:underline"
                                >
                                    + Thêm công việc
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* Raw Content — nội dung chính khi ở chế độ 'Trang trắng', ghi chú thêm khi ở 'Template' */}
                <div>
                    <h4 className="text-xs font-bold text-midnight-indigo uppercase flex items-center gap-1.5 mb-3 border-b border-platinum-tint pb-2">
                        <Info className="w-4 h-4 text-slate-blue" /> {minutes.contentFormat === 'blank' ? 'Nội dung biên bản' : 'Nội dung tự do'}
                    </h4>
                    {isEditing ? (
                        <textarea
                            value={editForm.minutesContent || ''}
                            onChange={(e) => setEditForm({ ...editForm, minutesContent: e.target.value })}
                            className={`w-full text-xs p-3 border border-platinum-tint rounded-xl focus:outline-none focus:border-action-blue ${minutes.contentFormat === 'blank' ? 'min-h-[400px]' : 'min-h-[120px]'}`}
                            placeholder={minutes.contentFormat === 'blank' ? 'Soạn nội dung biên bản...' : 'Ghi chú thêm...'}
                        />
                    ) : (
                        <div className="p-4 bg-cloud-mist/20 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {minutes.mainContent?.minutesContent || <span className="italic text-slate-blue">Không có ghi chú thêm.</span>}
                        </div>
                    )}
                </div>

            </div>

            {/* Backdrop Blur Issue Modal */}
            {createPortal(
                <AnimatePresence>
                    {showIssueModal && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-950/40 backdrop-blur-md"
                                onClick={() => setShowIssueModal(false)}
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative z-10"
                            >
                                <h3 className="text-base font-bold text-midnight-indigo mb-2">Xác nhận ban hành biên bản</h3>
                                <p className="text-xs text-slate-blue leading-relaxed mb-6">
                                    Sau khi ban hành, biên bản sẽ chuyển sang trạng thái <strong>Published</strong> và hệ thống sẽ gửi thông báo đến tất cả thành viên trong cuộc họp. Bạn sẽ không thể sửa nội dung biên bản sau bước này.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button 
                                        onClick={() => setShowIssueModal(false)}
                                        disabled={isIssuing}
                                        className="px-4 py-2 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <button 
                                        onClick={handleIssue}
                                        disabled={isIssuing}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                                    >
                                        {isIssuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Ban hành
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Backdrop Blur Delete Modal */}
            {createPortal(
                <AnimatePresence>
                    {showDeleteModal && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-950/40 backdrop-blur-md"
                                onClick={() => setShowDeleteModal(false)}
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative z-10"
                            >
                                <h3 className="text-base font-bold text-midnight-indigo mb-2">Xác nhận xoá biên bản họp nháp</h3>
                                <p className="text-xs text-slate-blue leading-relaxed mb-6">
                                    Bạn có chắc chắn muốn xóa bản nháp của biên bản cuộc họp này? Thao tác này sẽ xóa biên bản và các tài liệu đính kèm liên quan. Hành động này không thể khôi phục lại.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button 
                                        onClick={() => setShowDeleteModal(false)}
                                        disabled={isDeleting}
                                        className="px-4 py-2 border border-platinum-tint text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <button 
                                        onClick={handleDeleteMinutes}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                    >
                                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        Xóa bản nháp
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Export and Share Modals */}
            <ExportMinutesModal 
                minutesId={minutes.id}
                open={showExportModal}
                onClose={() => setShowExportModal(false)}
            />

            <ShareMinutesModal 
                minutesId={minutes.id}
                open={showShareModal}
                onClose={() => setShowShareModal(false)}
            />
        </div>
    );
};

export default MinutesViewerEditor;
