import {
    AlertCircle, BookOpen, Calendar, CheckCircle, ChevronLeft, ChevronRight,
    Clock, FileAudio, FileText, FolderOpen, Play, RefreshCw,
    Search, User, Video,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
    getMyMeetingHistory, getMeetingMediaFiles, getMediaFile, getMeetingMinutesByMeetingId,
} from '../../service/employeeServices';

const ITEMS_PER_PAGE = 9;

const containerVariants = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 14 } },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const getFileByType = (mediaFiles, type) =>
    mediaFiles?.find(f =>
        f.fileType?.toLowerCase().includes(type) ||
        f.type?.toLowerCase().includes(type) ||
        f.mimeType?.toLowerCase().includes(type)
    );

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '';

const isEffectivelyCompleted = (meeting, nowTs = Date.now()) => {
    const status = String(meeting?.status || '').toLowerCase();
    const endTime = meeting?.endTime || meeting?.end_time || meeting?.scheduledEnd || meeting?.scheduled_end;
    return status === 'completed' || (['scheduled', 'in_progress'].includes(status) && endTime && new Date(endTime).getTime() < nowTs);
};

// ─── Pagination control ───────────────────────────────────────────────────────

const Pagination = ({ current, total, onChange }) => {
    if (total <= 1) return null;
    const pages = [];
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) pages.push(i);
    }
    const withDots = []; let last = null;
    pages.forEach(p => {
        if (last !== null) {
            if      (p - last === 2) withDots.push(last + 1);
            else if (p - last > 2)  withDots.push('…');
        }
        withDots.push(p); last = p;
    });

    return (
        <div className="flex items-center justify-center gap-1.5 pt-2">
            <button
                disabled={current === 1}
                onClick={() => onChange(current - 1)}
                className="p-2 rounded-xl border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            {withDots.map((p, i) =>
                p === '…' ? (
                    <span key={`dot-${i}`} className="px-2 text-slate-400 text-sm select-none">…</span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onChange(p)}
                        className={`w-9 h-9 rounded-xl text-sm font-bold border transition-all ${
                            p === current
                                ? 'bg-action-blue text-white border-action-blue shadow-sm'
                                : 'bg-white text-midnight-indigo border-platinum-tint hover:bg-cloud-mist'
                        }`}
                    >
                        {p}
                    </button>
                )
            )}
            <button
                disabled={current === total}
                onClick={() => onChange(current + 1)}
                className="p-2 rounded-xl border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const EmployeeRecordings = () => {
    const navigate = useNavigate();
    const basePath = window.location.pathname.split('/')[1];

    const [loading, setLoading]           = useState(true);
    const [recordings, setRecordings]     = useState([]);
    const [searchQuery, setSearchQuery]   = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [startDate, setStartDate]       = useState('');
    const [endDate, setEndDate]           = useState('');
    const [currentPage, setCurrentPage]   = useState(1);
    const [downloadingId, setDownloadingId] = useState(null);
    const [successMsg, setSuccessMsg]     = useState(null);
    const [errorMsg, setErrorMsg]         = useState(null);

    // ── fetch ──────────────────────────────────────────────────────────────
    const fetchRecordingsData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            // default: show up to 2 years of history
            const todayStr    = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
            const twoYearsAgo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
                .format(new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000));
            const fromStr = `${startDate || twoYearsAgo}T00:00:00+07:00`;
            const toStr   = `${endDate   || todayStr  }T23:59:59+07:00`;

            const historyParams = {
                from: fromStr,
                to: toStr,
                status: ['completed', 'scheduled', 'in_progress'],
                limit: 100,
            };

            const firstRes = await getMyMeetingHistory(historyParams);
            if (!firstRes?.success) throw new Error(firstRes?.message || 'Lỗi khi tải lịch sử cuộc họp');

            let meetings = (firstRes.data?.items || firstRes.data || [])
                .filter((meeting) => isEffectivelyCompleted(meeting));

            if (!meetings.length) { setRecordings([]); return; }

            // Fetch media + minutes per meeting in parallel
            const results = await Promise.all(meetings.map(async (meeting) => {
                const mid = meeting.meetingId || meeting.id;
                if (!mid) return null;
                try {
                    const [mediaRes, minutesRes] = await Promise.all([
                        getMeetingMediaFiles(mid),
                        getMeetingMinutesByMeetingId(mid).catch(() => null),
                    ]);
                    const mediaFiles          = mediaRes?.success  ? (mediaRes.data  || []) : [];
                    const minutesList         = minutesRes?.success ? (minutesRes.data || []) : [];
                    const hasPublishedMinutes = minutesList[0]?.status === 'published';

                    return {
                        meetingId: mid,
                        meetingTitle:      meeting.title || meeting.subject || 'Cuộc họp không có tiêu đề',
                        roomName:          meeting.room?.roomName || meeting.roomName || meeting.room?.name || '—',
                        hostName:          meeting.organizerName || meeting.organizer?.fullName || '—',
                        startTime:         meeting.startTime || meeting.scheduledStart || null,
                        durationMinutes:   meeting.durationMinutes || null,
                        mediaFiles,
                        hasPublishedMinutes,
                    };
                } catch { return null; }
            }));

            // sort newest first
            const sorted = results.filter(Boolean).sort((a, b) => {
                const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
                const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
                return tB - tA;
            });

            setRecordings(sorted);
            setCurrentPage(1);
        } catch (err) {
            setErrorMsg('Không thể tải danh sách bản ghi cuộc họp. Vui lòng thử lại.');
            setRecordings([]);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { fetchRecordingsData(); }, [fetchRecordingsData]);

    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(null), 3000);
        return () => clearTimeout(t);
    }, [successMsg]);

    useEffect(() => {
        if (!errorMsg) return;
        const t = setTimeout(() => setErrorMsg(null), 5000);
        return () => clearTimeout(t);
    }, [errorMsg]);

    // ── playback ───────────────────────────────────────────────────────────
    const handlePlayback = async (fileId, fileType) => {
        if (!fileId) { setErrorMsg('Tệp tin này hiện không khả dụng.'); return; }
        setDownloadingId(fileId);
        try {
            const res = await getMediaFile(fileId);
            if (res?.success && res.data?.downloadUrl) {
                window.open(res.data.downloadUrl, '_blank');
                setSuccessMsg(fileType === 'video' || fileType === 'audio' ? `Đang mở ${fileType}...` : 'Đang tải xuống tệp...');
            } else {
                setErrorMsg(res?.message || 'Không thể tạo liên kết tải xuống.');
            }
        } catch (err) {
            setErrorMsg(err?.message || err?.error?.message || 'Lỗi khi tải tệp. Vui lòng thử lại.');
        } finally {
            setDownloadingId(null);
        }
    };

    // ── filter + paginate ──────────────────────────────────────────────────
    const filteredRecordings = useMemo(() => recordings.filter(rec => {
        const matchQuery = !searchQuery.trim() ||
            (rec.meetingTitle || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (rec.roomName     || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchRoom = !selectedRoom || rec.roomName === selectedRoom;
        return matchQuery && matchRoom;
    }), [recordings, searchQuery, selectedRoom]);

    // reset to page 1 when filters change
    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedRoom]);

    const todayStr   = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

    const handleStartDateChange = (e) => {
        const val = e.target.value;
        setStartDate(val);
        // if new start is after current end, clear end
        if (val && endDate && val > endDate) setEndDate('');
    };
    const handleEndDateChange = (e) => {
        const val = e.target.value;
        setEndDate(val);
        // if new end is before current start, clear start
        if (val && startDate && val < startDate) setStartDate('');
    };

    const totalPages        = Math.max(1, Math.ceil(filteredRecordings.length / ITEMS_PER_PAGE));
    const paginatedItems    = filteredRecordings.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const uniqueRooms       = [...new Set(recordings.map(r => r.roomName).filter(Boolean))];
    const rangeStart        = filteredRecordings.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const rangeEnd          = Math.min(currentPage * ITEMS_PER_PAGE, filteredRecordings.length);

    // ── render ─────────────────────────────────────────────────────────────
    return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 max-w-6xl mx-auto">

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700">
                            <Video className="w-3.5 h-3.5" /> Ghi hình
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue">
                            <BookOpen className="w-3.5 h-3.5" /> Biên bản
                        </span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Bản ghi & Tài liệu cuộc họp</h1>
                    <p className="text-slate-blue text-sm mt-0.5">Xem lại video/audio và tải xuống biên bản các cuộc họp đã diễn ra.</p>
                </div>
                <button
                    onClick={fetchRecordingsData}
                    disabled={loading}
                    className="self-start flex items-center gap-2 px-4 py-2 border border-platinum-tint bg-white hover:bg-cloud-mist text-slate-blue hover:text-midnight-indigo rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
                </button>
            </div>

            {/* Alerts */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 flex-shrink-0" /><span>{successMsg}</span>
                    </motion.div>
                )}
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{errorMsg}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Filter panel */}
            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Search */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Tìm kiếm</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Tiêu đề, phòng..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 transition-all"
                            />
                        </div>
                    </div>

                    {/* Room filter */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Phòng họp</label>
                        <select
                            value={selectedRoom}
                            onChange={e => setSelectedRoom(e.target.value)}
                            className="w-full px-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 transition-all"
                        >
                            <option value="">Tất cả phòng</option>
                            {uniqueRooms.map(rm => <option key={rm} value={rm}>{rm}</option>)}
                        </select>
                    </div>

                    {/* From date */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Từ ngày</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="date"
                                value={startDate}
                                max={endDate || todayStr}
                                onChange={handleStartDateChange}
                                className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 transition-all"
                            />
                        </div>
                    </div>

                    {/* To date */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-blue uppercase tracking-wider">Đến ngày</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="date"
                                value={endDate}
                                min={startDate || undefined}
                                max={todayStr}
                                onChange={handleEndDateChange}
                                className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:outline-none focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Count bar */}
            {!loading && filteredRecordings.length > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-blue font-semibold px-1">
                    <span>Hiển thị <strong className="text-midnight-indigo">{rangeStart}–{rangeEnd}</strong> / <strong className="text-midnight-indigo">{filteredRecordings.length}</strong> bản ghi · mới nhất trước</span>
                    <span>Trang {currentPage}/{totalPages}</span>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-platinum-tint shadow-sm p-5 animate-pulse space-y-4">
                            <div className="flex justify-between">
                                <div className="h-5 w-24 bg-slate-200 rounded-full" />
                                <div className="h-5 w-16 bg-slate-100 rounded-full" />
                            </div>
                            <div className="h-4 w-full bg-slate-200 rounded" />
                            <div className="h-4 w-3/4 bg-slate-200 rounded" />
                            <div className="space-y-2 pt-3 border-t border-platinum-tint">
                                <div className="h-3 w-36 bg-slate-100 rounded" />
                                <div className="h-3 w-28 bg-slate-100 rounded" />
                            </div>
                            <div className="h-9 w-full bg-slate-200 rounded-xl" />
                            <div className="grid grid-cols-3 gap-2">
                                {[0,1,2].map(j => <div key={j} className="h-10 bg-slate-100 rounded-xl" />)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : filteredRecordings.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-platinum-tint shadow-sm space-y-3">
                    <FolderOpen className="w-12 h-12 mx-auto text-slate-300" />
                    <h3 className="text-sm font-bold text-midnight-indigo">Không tìm thấy bản ghi</h3>
                    <p className="text-xs text-slate-blue max-w-sm mx-auto">
                        Không tìm thấy tài liệu khớp với bộ lọc, hoặc chưa có cuộc họp nào có bản ghi trong khoảng thời gian đã chọn.
                    </p>
                    <button onClick={fetchRecordingsData}
                        className="mt-2 px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-glacier-blue transition-colors inline-flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Tải lại
                    </button>
                </div>
            ) : (
                <>
                    <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {paginatedItems.map((rec, idx) => {
                            const isNewest = currentPage === 1 && idx === 0;
                            const videoFile = getFileByType(rec.mediaFiles, 'video');
                            const audioFile = getFileByType(rec.mediaFiles, 'audio');

                            return (
                                <motion.div
                                    key={rec.meetingId}
                                    variants={itemVariants}
                                    className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-4 ${
                                        isNewest ? 'border-action-blue/30 ring-1 ring-action-blue/10' : 'border-platinum-tint hover:border-action-blue/20'
                                    }`}
                                >
                                    {/* Top row: room + newest badge + duration */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 whitespace-nowrap">
                                                {rec.roomName}
                                            </span>
                                            {isNewest && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-action-blue text-white">
                                                    Mới nhất
                                                </span>
                                            )}
                                        </div>
                                        {rec.durationMinutes && (
                                            <span className="text-[11px] font-semibold text-slate-blue whitespace-nowrap flex items-center gap-1 shrink-0">
                                                <Clock className="w-3 h-3" />{rec.durationMinutes} ph
                                            </span>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <h3 className="font-bold text-midnight-indigo text-sm leading-snug line-clamp-2 -mt-1">
                                        {rec.meetingTitle}
                                    </h3>

                                    {/* Meta */}
                                    <div className="space-y-1.5 text-xs text-slate-blue font-medium border-t border-platinum-tint pt-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                            <span>{fmtDate(rec.startTime)}{rec.startTime ? ` — ${fmtTime(rec.startTime)}` : ''}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                            <span className="truncate">Chủ trì: <strong className="text-midnight-indigo">{rec.hostName}</strong></span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                            <span>{rec.mediaFiles?.length || 0} tệp đính kèm</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="space-y-2 mt-auto">
                                        <button
                                            onClick={() => navigate(`/${basePath}/meeting/${rec.meetingId}`)}
                                            className="w-full py-2.5 bg-action-blue hover:bg-glacier-blue text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                                        >
                                            <Play className="w-3.5 h-3.5 fill-white" /> Xem chi tiết & Transcript
                                        </button>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => handlePlayback(videoFile?.id || videoFile?.fileId, 'video')}
                                                disabled={!videoFile || downloadingId !== null}
                                                title={videoFile ? 'Phát Video' : 'Không có video'}
                                                className="py-2 border border-platinum-tint bg-white hover:bg-cloud-mist rounded-xl text-[10px] font-bold text-slate-blue hover:text-midnight-indigo transition-all flex flex-col items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <Video className="w-4 h-4 text-purple-500" />
                                                <span>Video</span>
                                            </button>
                                            <button
                                                onClick={() => handlePlayback(audioFile?.id || audioFile?.fileId, 'audio')}
                                                disabled={!audioFile || downloadingId !== null}
                                                title={audioFile ? 'Phát Audio' : 'Không có audio'}
                                                className="py-2 border border-platinum-tint bg-white hover:bg-cloud-mist rounded-xl text-[10px] font-bold text-slate-blue hover:text-midnight-indigo transition-all flex flex-col items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <FileAudio className="w-4 h-4 text-emerald-500" />
                                                <span>Audio</span>
                                            </button>
                                            <button
                                                onClick={() => navigate(`/${basePath}/meeting/${rec.meetingId}?tab=minutes`)}
                                                disabled={!rec.hasPublishedMinutes}
                                                title={rec.hasPublishedMinutes ? 'Xem biên bản' : 'Biên bản chưa ban hành'}
                                                className="py-2 border border-platinum-tint bg-white hover:bg-cloud-mist rounded-xl text-[10px] font-bold text-slate-blue hover:text-midnight-indigo transition-all flex flex-col items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <FileText className={`w-4 h-4 ${rec.hasPublishedMinutes ? 'text-blue-500' : 'text-slate-300'}`} />
                                                <span>Biên bản</span>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>

                    {/* Pagination */}
                    <Pagination current={currentPage} total={totalPages} onChange={p => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                </>
            )}
        </motion.div>
    );
};

export default EmployeeRecordings;
