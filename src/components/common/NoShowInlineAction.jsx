import { useState } from 'react';
import { patch } from '../../utils/request';

/**
 * NoShowInlineAction — [Fix 2026-08-21, Bug 1/2] nút "Tôi vẫn đến" DÙNG CHUNG
 * cho mọi nơi hiển thị notification loại no_show_alert (NotificationBell.jsx
 * dropdown VÀ trang đầy đủ Notifications.jsx) — trước fix này, 2 nơi có 2 logic
 * khác nhau (bell có nút, trang đầy đủ không có gì).
 *
 * Hiện/ẩn dựa vào `noShowLiveStatus` — trạng thái SỐNG của no_show_cases mà BE
 * tra lại mỗi lần GET /notifications (NotificationsService#fetchNoShowLiveStatusMap),
 * KHÔNG dựa vào `payloadJson.kind` (snapshot tĩnh lúc notification được tạo,
 * không bao giờ cập nhật lại — bug cũ: bấm xong rồi reload trang lại hiện nút
 * như chưa từng bấm, vì payloadJson.kind vẫn mãi là 'warning').
 */
const ELIGIBLE_STATUSES = ['risk', 'warning_sent'];

const formatTime = (iso) => {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return null;
    }
};

const NoShowInlineAction = ({ item }) => {
    const [localState, setLocalState] = useState(null); // null | {status:'loading'|'success'|'error', snoozeUntil?, message?}

    const caseId = item?.payloadJson?.noShowCaseId;
    if (item?.notificationType !== 'no_show_alert' || !caseId) return null;

    // Bấm thành công trong phiên này → override cục bộ NGAY (phản hồi tức thời,
    // không cần đợi refetch) — nhưng nguồn SỰ THẬT dài hạn vẫn là noShowLiveStatus
    // từ BE (đọc lại đúng ở lần fetch tiếp theo/sau khi reload).
    const effectiveStatus = localState?.status === 'success' ? 'snoozed' : item.noShowLiveStatus;
    const effectiveSnoozeUntil = localState?.status === 'success' ? localState.snoozeUntil : item.noShowSnoozeUntil;

    const handleClick = async (event) => {
        event.stopPropagation();
        setLocalState({ status: 'loading' });
        try {
            const res = await patch(`/no-show-cases/${caseId}`, { detectionStatus: 'snoozed' });
            if (res?.success) {
                setLocalState({ status: 'success', snoozeUntil: res.data?.snoozeUntil ?? null });
            } else {
                setLocalState({
                    status: 'error',
                    message: res?.error?.message || 'Không thể xác nhận, vui lòng thử lại.',
                });
            }
        } catch (err) {
            setLocalState({ status: 'error', message: 'Lỗi kết nối server, vui lòng thử lại.' });
        }
    };

    if (effectiveStatus === 'snoozed') {
        const untilStr = formatTime(effectiveSnoozeUntil);
        return (
            <p data-ui-text="primary" className="text-xs font-bold text-emerald-600 mt-1">
                {untilStr ? `✓ Đã xác nhận — đang chờ tới ${untilStr}` : '✓ Đã xác nhận, đang chờ'}
            </p>
        );
    }

    if (!ELIGIBLE_STATUSES.includes(effectiveStatus) && localState?.status !== 'loading' && localState?.status !== 'error') {
        // Case đã kết thúc theo hướng khác (released/dismissed/resolved) hoặc chưa
        // có dữ liệu live — không có hành động nào còn ý nghĩa, không hiện gì.
        return null;
    }

    return (
        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={handleClick}
                disabled={localState?.status === 'loading'}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
                {localState?.status === 'loading' ? 'Đang xử lý...' : 'Tôi vẫn đến — giữ phòng'}
            </button>
            {localState?.status === 'error' && (
                <p data-ui-text="secondary" className="text-[11px] text-red-600 mt-1">{localState.message}</p>
            )}
        </div>
    );
};

export default NoShowInlineAction;
