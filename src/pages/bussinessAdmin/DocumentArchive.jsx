import { countBy, totalOf, useProbeCounts } from '../../hooks/useFilterCounts';
import { matchesFilter } from '../../utils/filterSelection';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import './DocumentArchiveFilters.css';
import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import TableColumns from '../../components/common/TableColumns';
import PaginatedCollection from '../../components/common/PaginatedCollection';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { Archive, Calendar, ChevronLeft, ChevronRight, Clock, Download, FileText, Filter, Film, HardDrive, Mic, Play, RefreshCw, Search, Video, X, XCircle, AlertTriangle, CheckCircle, Users, Building2, Briefcase, ClipboardList, ListChecks, MapPin, User, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import toast from '../../utils/toast';
import {
    listMinutes,
    getMeetings, getMeetingMediaFiles, getMediaFile,
    updateMediaVisibility, getRooms,
} from '../../service/businessAdminServices';
import { getMeetingMinutesById } from '../../service/minutesServices';
import ExportMinutesModal from '../../components/minutes/ExportMinutesModal';
import MinutesInbox from '../../components/minutes/MinutesInbox';
import { useDebouncedValue, useInstantFilter } from '../../hooks/useInstantSearch';

// ─── Constants ───────────────────────────────────────────────



const MINUTES_STATUS_MAP = {
    draft:     { label: 'Bản nháp',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    published: { label: 'Đã ban hành', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    archived:  { label: 'Lưu trữ',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const FILE_TYPE_MAP = {
    video: { label: 'Video', icon: Video,  cls: 'text-red-600 bg-red-50' },
    audio: { label: 'Âm thanh', icon: Mic, cls: 'text-violet-600 bg-violet-50' },
};

// ─── Helpers ─────────────────────────────────────────────────
const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
};

const fmtBytes = (b) => {
    if (!b) return '—';
    const k = 1024, sz = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${(b / Math.pow(k, i)).toFixed(1)} ${sz[i]}`;
};

const fmtDur = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h && `${h}h`, m && `${m}m`, sec && `${sec}s`].filter(Boolean).join(' ') || '0s';
};

// ─── Minutes Status Badge ─────────────────────────────────────
const StatusBadge = ({ status }) => {
    const { label, cls } = MINUTES_STATUS_MAP[status] || { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
    return (
        <span data-ui-text="badge" className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
            {label}
        </span>
    );
};

// ─── Main Component ───────────────────────────────────────────
// Xuất file biên bản: chỉ Host / người soạn thảo (preparedBy) / Admin — khớp
// ownership-or-admin rule ở BE (MinutesExportService.createExportJob, UC-147).
// Participant thường KHÔNG được export dù biên bản đã published.
const canExportMinutesItem = (item, currentUser, isAdmin) => {
    if (!item) return false;
    if (isAdmin) return true;
    if (!currentUser) return false;
    return currentUser.id === item.preparedBy?.id || currentUser.id === item.host?.id;
};

const DocumentArchive = ({ scope = 'all' }) => {
    const [MINUTES_LIMIT, setMinutesLimit] = useState(10);
    const [MEDIA_LIMIT, setMediaLimit] = useState(10);
    const isSelfScope = scope === 'self';
    const [activeTab, setActiveTab] = useState('minutes');
    // "Cần xử lý" (trình ký biên bản) — chỉ ở Kho biên bản của tôi; tự mở khi có việc
    const [inboxCount, setInboxCount] = useState(0);
    const inboxAutoOpened = useRef(false);
    const handleInboxCount = useCallback((n) => {
        setInboxCount(n);
        if (n > 0 && !inboxAutoOpened.current) {
            inboxAutoOpened.current = true;
            setActiveTab('inbox');
        }
    }, []);

    // Quyền export biên bản của user hiện tại
    const [currentUser, setCurrentUser] = useState(null);
    useEffect(() => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) setCurrentUser(JSON.parse(userStr));
        } catch {
            // silent
        }
    }, []);
    const isAdmin = currentUser?.roles?.some(r => ['BUSINESS_ADMIN', 'SYSTEM_ADMIN'].includes(r.roleCode || r.role_code));

    // ── Minutes state ──
    const [minutes, setMinutes]               = useState([]);
    const [minutesMeta, setMinutesMeta]       = useState(null);
    const [minutesPage, setMinutesPage]       = useState(1);
    const [minutesLoading, setMinutesLoading] = useState(false);
    const [minutesError, setMinutesError]     = useState(null);

    const [mSearch, setMSearch]       = useState('');
    const debouncedMSearch            = useDebouncedValue(mSearch);
    const [mStatus, setMStatus]       = useState('');
    const [mFrom,   setMFrom]         = useState('');
    const [mTo,     setMTo]           = useState('');
    const [exportModalId, setExportModalId] = useState(null); // minutesId đang mở modal xuất file
    const [detailItem, setDetailItem]   = useState(null); // { ...min, detail: null | loaded, loading: bool }

    // ── Media state ──
    const [mediaRaw, setMediaRaw]         = useState([]); // toàn bộ tệp (chưa lọc theo loại)
    const [mediaPage, setMediaPage]       = useState(1);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaError, setMediaError]     = useState(null);
    const [rooms, setRooms]               = useState([]);

    const [mediaSearch, setMediaSearch]   = useState('');
    const debouncedMediaSearch            = useDebouncedValue(mediaSearch);
    const [mediaRoom, setMediaRoom]       = useState('');
    const [mediaType, setMediaType]       = useState(''); // '' | 'video' | 'audio'

    const [previewItem, setPreviewItem]   = useState(null); // { ...mediaFile, mediaUrl, previewLoading }

    // Lọc theo loại tệp tại chỗ (đổi loại không cần tải lại) + số đếm cạnh lựa chọn ô "Loại bản ghi".
    const mediaTypeOf    = (f) => (f.fileType || f.file_type || '').toLowerCase();
    const allMedia       = useMemo(
        () => (mediaType ? mediaRaw.filter(f => matchesFilter(mediaType, mediaTypeOf(f))) : mediaRaw),
        [mediaRaw, mediaType],
    );
    const mediaTypeCounts = useMemo(() => countBy(mediaRaw, mediaTypeOf), [mediaRaw]);

    // Lọc ngay trên dữ liệu đã tải trong lúc chờ BE trả kết quả cho từ khoá mới.
    const visibleMedia    = useInstantFilter(allMedia, mediaSearch, mediaSearch !== debouncedMediaSearch || mediaLoading);
    const mediaPageItems  = visibleMedia.slice((mediaPage - 1) * MEDIA_LIMIT, mediaPage * MEDIA_LIMIT);
    const mediaTotalPages = Math.max(1, Math.ceil(visibleMedia.length / MEDIA_LIMIT));

    // ── Debounce ref for minutes search ──
    const mSearchTimer = useRef(null);

    // ════════════════════════════════════
    // MINUTES FETCH
    // ════════════════════════════════════
    const fetchMinutes = useCallback(async (page = 1) => {
        setMinutesLoading(true);
        setMinutesError(null);
        try {
            const params = {
                page,
                limit: MINUTES_LIMIT,
                status: mStatus || undefined,
                q: debouncedMSearch.trim() || undefined,
                from: mFrom || undefined,
                to:   mTo   || undefined,
                sortBy: 'created_at',
                sortOrder: 'desc',
            };
            const res = await listMinutes(params);
            if (res?.success) {
                setMinutes(res.data || []);
                setMinutesMeta(res.meta || null);
            } else {
                setMinutesError(res?.message || 'Không thể tải danh sách biên bản.');
                setMinutes([]);
            }
        } catch (err) {
            setMinutesError('Lỗi kết nối khi tải biên bản.');
            setMinutes([]);
        } finally {
            setMinutesLoading(false);
        }
    }, [mStatus, debouncedMSearch, mFrom, mTo, MINUTES_LIMIT]);

    const visibleMinutes = useInstantFilter(minutes, mSearch, mSearch !== debouncedMSearch || minutesLoading);

    // Số đếm cạnh lựa chọn ô "Trạng thái biên bản" (đếm theo từ khoá + khoảng ngày đang chọn).
    const minutesStatusCounts = useProbeCounts(
        ['published', 'draft', 'archived'],
        (value) => listMinutes({
            page: 1,
            limit: 1,
            status: value || undefined,
            q: debouncedMSearch.trim() || undefined,
            from: mFrom || undefined,
            to: mTo || undefined,
        }).then(totalOf),
        `${debouncedMSearch.trim()}|${mFrom}|${mTo}`,
        { enabled: activeTab === 'minutes' },
    );

    // Fetch on tab open / filter change
    useEffect(() => {
        if (activeTab !== 'minutes') return;
        setMinutesPage(1);
        clearTimeout(mSearchTimer.current);
        mSearchTimer.current = setTimeout(() => fetchMinutes(1), 0);
        return () => clearTimeout(mSearchTimer.current);
    }, [activeTab, debouncedMSearch, mStatus, mFrom, mTo, fetchMinutes]);

    const handleMinutesPageChange = (p) => {
        setMinutesPage(p);
        fetchMinutes(p);
    };

    // Open detail modal
    const handleOpenDetail = async (min) => {
        setDetailItem({ ...min, _detail: null, _loading: true });
        try {
            const res = await getMeetingMinutesById(min.id);
            if (res?.success) {
                setDetailItem(prev => ({ ...prev, _detail: res.data, _loading: false }));
            } else {
                setDetailItem(prev => ({ ...prev, _loading: false }));
            }
        } catch {
            setDetailItem(prev => ({ ...prev, _loading: false }));
        }
    };

    // ════════════════════════════════════
    // MEDIA FETCH
    // ════════════════════════════════════
    const fetchMedia = useCallback(async () => {
        setMediaLoading(true);
        setMediaError(null);
        try {
            const baseParams = { limit: 10, status: 'completed', search: debouncedMediaSearch.trim() || undefined, roomId: mediaRoom || undefined };

            const firstRes = await getMeetings({ ...baseParams, page: 1 });
            if (!firstRes?.success) { setMediaRaw([]); return; }

            const totalPages = firstRes.meta?.totalPages || 1;
            let meetings = firstRes.data || [];

            if (totalPages > 1) {
                const rest = await Promise.allSettled(
                    Array.from({ length: totalPages - 1 }, (_, i) => getMeetings({ ...baseParams, page: i + 2 }))
                );
                rest.forEach(r => { if (r.status === 'fulfilled' && r.value?.success) meetings = meetings.concat(r.value.data || []); });
            }

            if (!meetings.length) { setMediaRaw([]); return; }

            const mediaResults = await Promise.allSettled(
                meetings.map(async (m) => {
                    const r = await getMeetingMediaFiles(m.id);
                    if (!r?.success || !r.data?.length) return [];
                    return r.data.map(f => ({
                        ...f,
                        meetingId:    m.id,
                        meetingTitle: m.title || 'Cuộc họp',
                        roomName:     m.room?.roomName || m.roomName || '',
                        meetingDate:  m.startTime || m.scheduledStart,
                        organizer:    m.organizer?.fullName || m.organizerName || '',
                    }));
                })
            );

            let flat = mediaResults
                .filter(r => r.status === 'fulfilled')
                .flatMap(r => r.value);


            flat.sort((a, b) => new Date(b.meetingDate || b.createdAt || 0) - new Date(a.meetingDate || a.createdAt || 0));
            setMediaRaw(flat);
        } catch {
            setMediaError('Lỗi tải dữ liệu media.');
            setMediaRaw([]);
        } finally {
            setMediaLoading(false);
        }
    }, [debouncedMediaSearch, mediaRoom]);

    useEffect(() => { getRooms({ limit: 100 }).then(r => { if (r?.success) setRooms(r.data || []); }); }, []);

    useEffect(() => {
        if (activeTab !== 'media') return;
        setMediaPage(1);
        fetchMedia();
    }, [activeTab, fetchMedia]);

    // Preview handler
    const handlePreview = async (item) => {
        setPreviewItem({ ...item, mediaUrl: null, previewLoading: true });
        try {
            const res = await getMediaFile(item.id);
            const d = res?.success ? res.data : {};
            setPreviewItem(prev => ({
                ...prev, ...d,
                mediaUrl: d?.downloadUrl || null,
                previewLoading: false,
                size: d?.size ?? d?.fileSizeBytes ?? item.size,
                durationSec: d?.durationSec ?? d?.durationSeconds ?? item.durationSec,
            }));
        } catch {
            setPreviewItem(prev => ({ ...prev, mediaUrl: null, previewLoading: false }));
        }
    };

    const handleDownload = async (item) => {
        try {
            const res = await getMediaFile(item.id);
            if (res?.success && res.data?.downloadUrl) {
                window.open(res.data.downloadUrl, '_blank');
            } else {
                toast.error('Không thể tạo liên kết tải xuống.');
            }
        } catch {
            toast.error('Lỗi kết nối khi tải file.');
        }
    };

    const handleHide = async (item) => {
        try {
            const res = await updateMediaVisibility(item.id, { action: 'hide' });
            if (res?.success) {
                toast.success('Đã ẩn file thành công.');
                fetchMedia();
            } else {
                toast.error('Không thể ẩn file này.');
            }
        } catch {
            toast.error('Lỗi kết nối khi ẩn file.');
        }
    };

    // ════════════════════════════════════
    // RENDER
    // ════════════════════════════════════
    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div>
                <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 mb-2">
                    <Archive className="w-3.5 h-3.5" />
                    Kho tài liệu
                </span>
                <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">
                    {isSelfScope ? 'Kho biên bản của tôi' : 'Quản lý tài liệu cuộc họp'}
                </h1>
                <p className="text-slate-blue text-sm mt-0.5">
                    {isSelfScope
                        ? 'Xem và tìm kiếm biên bản các cuộc họp bạn tham gia hoặc chủ trì.'
                        : 'Xem toàn bộ biên bản họp, ghi hình và ghi âm của công ty.'}
                </p>
            </div>

            {/* ── Tabs ── */}
            {(
                <div className="flex border-b border-platinum-tint gap-1">
                    {(isSelfScope ? [
                        { id: 'minutes', label: 'Tất cả biên bản', icon: FileText },
                        { id: 'inbox',   label: 'Cần xử lý', icon: ClipboardList, badge: inboxCount },
                    ] : [
                        { id: 'minutes', label: 'Biên bản họp', icon: FileText },
                        { id: 'media',   label: 'Ghi hình & Âm thanh', icon: Film },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all -mb-px ${
                                activeTab === tab.id
                                    ? 'border-action-blue text-action-blue'
                                    : 'border-transparent text-slate-blue hover:text-midnight-indigo'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.badge > 0 && (
                                <span data-ui-text="action" className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{tab.badge}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Luôn mount để lấy số việc cho badge; chỉ hiển thị khi đang ở tab */}
            {isSelfScope && (
                <div className={activeTab === 'inbox' ? '' : 'hidden'}>
                    <MinutesInbox onOpenMinutes={handleOpenDetail} onCount={handleInboxCount} />
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* ══════════════════════════════
                    TAB 1: BIÊN BẢN HỌP
                ══════════════════════════════ */}
                {activeTab === 'minutes' && (
                    <motion.div
                        key="minutes"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                    >
                        {/* Filters */}
                        <FilterBar forceStandard variant="card" className="minutes-archive-filters">
                            <div className="minutes-archive-filter-main">
                                <FilterField label="Tìm biên bản"><div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue/60" />
                                    <input type="text" placeholder="Tìm tiêu đề biên bản, tên cuộc họp..." value={mSearch}
                                        onChange={e => setMSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 border border-platinum-tint rounded-xl text-sm text-midnight-indigo" />
                                </div></FilterField>
                                <FilterField label="Trạng thái biên bản">
                                    <FilterMultiSelect counts={minutesStatusCounts} value={mStatus} onChange={e => setMStatus(e.target.value)}>
                                        <option value="">Tất cả trạng thái</option>
                                        <option value="published">Đã ban hành</option>
                                        <option value="draft">Bản nháp</option>
                                        <option value="archived">Lưu trữ</option>
                                    </FilterMultiSelect>
                                </FilterField>
                                <RefreshButton onClick={() => fetchMinutes(minutesPage)} busy={minutesLoading} title="Làm mới"
                                    legacyClassName="p-2 border border-platinum-tint rounded-xl text-slate-blue hover:bg-cloud-mist transition-colors" />
                            </div>
                            <div className="minutes-archive-filter-time">
                                <CalendarRangePresets from={mFrom} to={mTo} onChange={range => { setMFrom(range.from); setMTo(range.to); setMinutesPage(1); }} />
                                <div className="minutes-archive-filter-dates">
                                    <FilterField label="Từ ngày"><input type="date" value={mFrom} onChange={e => setMFrom(e.target.value)} /></FilterField>
                                    <FilterField label="Đến ngày"><input type="date" value={mTo} onChange={e => setMTo(e.target.value)} /></FilterField>
                                </div>
                                <button type="button" data-filter-action className="minutes-archive-filter-reset px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors"
                                    onClick={() => {
                                        if (!mSearch && !mStatus && !mFrom && !mTo) fetchMinutes(1);
                                        setMSearch(''); setMStatus(''); setMFrom(''); setMTo(''); setMinutesPage(1);
                                    }}>
                                    <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                                </button>
                            </div>
                        </FilterBar>

                        {/* Minutes table */}
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                            {minutesLoading && (!mSearch.trim() || visibleMinutes.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 className="w-9 h-9 mb-3 text-action-blue animate-spin" />
                                    <p data-ui-text="primary" className="text-slate-blue text-xs font-semibold">Đang tải biên bản họp...</p>
                                </div>
                            ) : minutesError ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                                    <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                                    <p className="text-sm font-bold text-midnight-indigo">Không thể tải dữ liệu</p>
                                    <p className="text-xs text-slate-blue mt-1">{minutesError}</p>
                                    <button onClick={() => fetchMinutes(1)} className="mt-4 px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold">Thử lại</button>
                                </div>
                            ) : visibleMinutes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <FileText className="w-12 h-12 text-platinum-tint mb-3" />
                                    <p className="text-sm font-bold text-midnight-indigo">Chưa có biên bản nào</p>
                                    <p className="text-xs text-slate-blue mt-1">Thử thay đổi bộ lọc hoặc khoảng thời gian.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <ResponsiveTable className="w-full text-left border-collapse minutes-archive-table">
                                        <colgroup>
                                            <col />
                                            <col style={{ width: '16%' }} />
                                            <col style={{ width: '23%' }} />
                                            <col style={{ width: '13%' }} />
                                            <col style={{ width: '160px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr className="border-b border-platinum-tint bg-cloud-mist/40 text-[11px] font-bold text-slate-blue uppercase tracking-wider">
                                                <th className="px-5 py-3.5">Biên bản / Cuộc họp</th>
                                                <th className="px-5 py-3.5">Ngày họp</th>
                                                <th className="px-5 py-3.5">Người ban hành</th>
                                                <th className="px-5 py-3.5">Trạng thái</th>
                                                <th className="px-5 py-3.5 text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-platinum-tint text-sm">
                                            {visibleMinutes.map(min => (
                                                <tr key={min.id} className="hover:bg-cloud-mist/20 transition-colors">
                                                    <td className="px-5 py-4">
                                                        <p className="font-semibold text-midnight-indigo leading-snug line-clamp-1">
                                                            {min.title || 'Biên bản chưa đặt tiêu đề'}
                                                        </p>
                                                        <p className="text-xs text-slate-blue mt-0.5 line-clamp-1">
                                                            {min.meeting?.title || min.meetingTitle || 'Chưa cung cấp'}
                                                        </p>
                                                    </td>
                                                    <td className="px-5 py-4 text-xs text-slate-blue whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                            {fmtDate(min.meeting?.startTime || min.meetingDate)}
                                                        </div>
                                                        {min.issuedAt && (
                                                            <div data-ui-text="primary" className="text-[10px] text-slate-blue/60 mt-0.5">
                                                                Ban hành: {fmtDate(min.issuedAt)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    {/* Người ban hành — avatar + tên */}
                                                    <td className="px-5 py-4">
                                                        {(() => {
                                                            const user = min.issuedBy || min.preparedBy;
                                                            if (!user) return <span className="text-xs text-slate-blue">—</span>;
                                                            return (
                                                                <div className="flex items-center gap-2">
                                                                    {user.avatarUrl ? (
                                                                        <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-platinum-tint" />
                                                                    ) : (
                                                                        <div className="w-7 h-7 rounded-full bg-action-blue/10 flex items-center justify-center shrink-0 text-[10px] font-extrabold text-action-blue">
                                                                            {user.fullName?.[0] || '?'}
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p data-ui-text="primary" className="text-xs font-semibold text-midnight-indigo leading-tight">{user.fullName}</p>
                                                                        {user.jobTitle && <p data-ui-text="secondary" className="text-[10px] text-slate-blue/70">{user.jobTitle}</p>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <StatusBadge status={min.status} />
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="minutes-archive-row-actions">
                                                            {/* Chi tiết — mở modal */}
                                                            <button data-ui-text="action"
                                                                onClick={() => handleOpenDetail(min)}
                                                                title="Xem chi tiết biên bản"
                                                                className="minutes-archive-detail flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-action-blue hover:bg-blue-100 rounded-lg text-[11px] font-bold transition-colors"
                                                            >
                                                                <FileText className="w-3.5 h-3.5" />
                                                                Chi tiết
                                                            </button>

                                                            {/* Xuất file — chỉ Host/người soạn thảo/Admin */}
                                                            <span className="minutes-archive-export-slot">
                                                            {canExportMinutesItem(min, currentUser, isAdmin) && (
                                                                <button
                                                                    onClick={() => setExportModalId(min.id)}
                                                                    title="Xuất file biên bản"
                                                                    className="p-1.5 text-slate-blue hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </ResponsiveTable>
                                </div>
                            )}

                            {/* Pagination */}
                            {minutesMeta && <PaginationRegion legacyVisible={!minutesLoading && minutesMeta && minutesMeta.totalPages > 1}><PaginationFooter
                                    currentPage={minutesPage}
                                    totalPages={minutesMeta.totalPages}
                                    totalItems={minutesMeta.total}
                                    pageSize={MINUTES_LIMIT}
                                    onPageChange={handleMinutesPageChange}
                                    itemLabel={"biên bản"}
                                    loading={minutesLoading}
                                    legacy={<div className="px-5 py-3.5 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                                    <span className="text-[11px] text-slate-blue">
                                        Trang {minutesPage} / {minutesMeta.totalPages} · {minutesMeta.total} biên bản
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleMinutesPageChange(minutesPage - 1)}
                                            disabled={minutesPage === 1}
                                            className="p-1.5 rounded-lg border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs font-bold text-midnight-indigo px-2">{minutesPage}</span>
                                        <button
                                            onClick={() => handleMinutesPageChange(minutesPage + 1)}
                                            disabled={minutesPage === minutesMeta.totalPages}
                                            className="p-1.5 rounded-lg border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>}
                                 onPageSizeChange={size => { setMinutesLimit(size); setMinutesPage(1); }} /></PaginationRegion>}
                        </div>
                    </motion.div>
                )}

                {/* ══════════════════════════════
                    TAB 2: GHI HÌNH & ÂM THANH
                ══════════════════════════════ */}
                {activeTab === 'media' && (
                    <motion.div
                        key="media"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                    >
                        {/* Filters */}
                        <FilterBar forceStandard variant="card" className="bg-white p-4 rounded-2xl border border-platinum-tint shadow-sm flex flex-col md:flex-row gap-3">
                            <FilterField label="Tìm bản ghi"><div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue/60" />
                                <input
                                    type="text"
                                    placeholder="Tìm theo tên cuộc họp, người tổ chức..."
                                    value={mediaSearch}
                                    onChange={e => { setMediaSearch(e.target.value); setMediaPage(1); }}
                                    className="w-full pl-9 pr-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo"
                                />
                            </div></FilterField>

                            <FilterField label="Phòng họp"><FilterMultiSelect
                                value={mediaRoom}
                                onChange={e => { setMediaRoom(e.target.value); setMediaPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo bg-white"
                            >
                                <option value="">Tất cả phòng</option>
                                {rooms.map(r => <option key={r.id ?? r.roomId} value={r.id ?? r.roomId}>{r.roomName}</option>)}
                            </FilterMultiSelect></FilterField>

                            <FilterField label="Loại bản ghi"><FilterMultiSelect singleSelect counts={mediaTypeCounts}
                                value={mediaType}
                                onChange={e => { setMediaType(e.target.value); setMediaPage(1); }}
                                className="px-3 py-2 border border-platinum-tint rounded-xl text-sm focus:outline-none focus:border-action-blue text-midnight-indigo bg-white"
                            >
                                <option value="">Video & Âm thanh</option>
                                <option value="video">Chỉ video</option>
                                <option value="audio">Chỉ âm thanh</option>
                            </FilterMultiSelect></FilterField>

                            <RefreshButton
                                onClick={() => { setMediaPage(1); fetchMedia(); }}
                                busy={mediaLoading}
                                title="Làm mới"
                                legacyClassName="p-2 border border-platinum-tint rounded-xl text-slate-blue hover:bg-cloud-mist transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </RefreshButton>
                        </FilterBar>

                        {/* Media table */}
                        <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">
                            {mediaLoading && (!mediaSearch.trim() || mediaPageItems.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 className="w-9 h-9 mb-3 text-action-blue animate-spin" />
                                    <p data-ui-text="primary" className="text-slate-blue text-xs font-semibold">Đang tải danh sách media...</p>
                                </div>
                            ) : mediaError ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                                    <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                                    <p className="text-sm font-bold text-midnight-indigo">Không thể tải dữ liệu</p>
                                    <p className="text-xs text-slate-blue mt-1">{mediaError}</p>
                                    <button onClick={fetchMedia} className="mt-4 px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold">Thử lại</button>
                                </div>
                            ) : mediaPageItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Film className="w-12 h-12 text-platinum-tint mb-3" />
                                    <p className="text-sm font-bold text-midnight-indigo">Chưa có file media nào</p>
                                    <p className="text-xs text-slate-blue mt-1">Thử thay đổi bộ lọc hoặc phòng họp.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <ResponsiveTable className="w-full text-left border-collapse">
<TableColumns widths={[10, 30, 17, 17, 10, 8, 8]} />
                                        <thead>
                                            <tr className="border-b border-platinum-tint bg-cloud-mist/40 text-[11px] font-bold text-slate-blue uppercase tracking-wider">
                                                <th className="px-5 py-3.5">Loại</th>
                                                <th className="px-5 py-3.5">Cuộc họp</th>
                                                <th className="px-5 py-3.5">Phòng</th>
                                                <th className="px-5 py-3.5">Thời gian</th>
                                                <th className="px-5 py-3.5">Thời lượng</th>
                                                <th className="px-5 py-3.5">Kích thước</th>
                                                <th className="px-5 py-3.5 text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-platinum-tint text-sm">
                                            {mediaPageItems.map(item => {
                                                const rawType = (item.fileType || item.file_type || '').toLowerCase();
                                                const typeInfo = FILE_TYPE_MAP[rawType] || FILE_TYPE_MAP.video;
                                                const TypeIcon = typeInfo.icon;
                                                return (
                                                    <tr key={item.id} className="hover:bg-cloud-mist/20 transition-colors">
                                                        <td className="px-5 py-4">
                                                            <span data-ui-text="secondary" className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${typeInfo.cls}`}>
                                                                <TypeIcon className="w-3.5 h-3.5" />
                                                                {typeInfo.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <p className="font-semibold text-midnight-indigo line-clamp-1">{item.meetingTitle}</p>
                                                            <p className="text-xs text-slate-blue mt-0.5">{item.organizer || 'Chưa cung cấp'}</p>
                                                        </td>
                                                        <td className="px-5 py-4 text-xs text-slate-blue">{item.roomName || 'Chưa cung cấp'}</td>
                                                        <td className="px-5 py-4 text-xs text-slate-blue whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                                                {fmt(item.meetingDate || item.createdAt)}
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-xs text-slate-blue">{fmtDur(item.durationSec ?? item.durationSeconds)}</td>
                                                        <td className="px-5 py-4 text-xs text-slate-blue">{fmtBytes(item.size ?? item.fileSizeBytes)}</td>
                                                        <td className="px-5 py-4">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    onClick={() => handlePreview(item)}
                                                                    title="Phát"
                                                                    className="p-1.5 text-slate-blue hover:text-action-blue hover:bg-blue-50 rounded-lg transition-colors"
                                                                >
                                                                    <Play className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownload(item)}
                                                                    title="Tải xuống"
                                                                    className="p-1.5 text-slate-blue hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                >
                                                                    <Download className="w-4 h-4" />
                                                                </button>
                                                                {item.visibility !== 'hidden' && (
                                                                    <button
                                                                        onClick={() => handleHide(item)}
                                                                        title="Ẩn file"
                                                                        className="p-1.5 text-slate-blue hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-xs font-semibold"
                                                                    >
                                                                        Ẩn
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </ResponsiveTable>
                                </div>
                            )}

                            {/* Pagination */}
                            {<PaginationRegion legacyVisible={!mediaLoading && visibleMedia.length > 0}><PaginationFooter
                                    currentPage={mediaPage}
                                    totalPages={mediaTotalPages}
                                    totalItems={visibleMedia.length}
                                    pageSize={MEDIA_LIMIT}
                                    onPageChange={setMediaPage}
                                    itemLabel={"tệp"}
                                    loading={mediaLoading}
                                    legacy={<div className="px-5 py-3.5 border-t border-platinum-tint bg-cloud-mist/20 flex items-center justify-between">
                                    <span className="text-[11px] text-slate-blue">
                                        Trang {mediaPage} / {mediaTotalPages} · {visibleMedia.length} file
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setMediaPage(p => Math.max(1, p - 1))}
                                            disabled={mediaPage === 1}
                                            className="p-1.5 rounded-lg border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs font-bold text-midnight-indigo px-2">{mediaPage}</span>
                                        <button
                                            onClick={() => setMediaPage(p => Math.min(mediaTotalPages, p + 1))}
                                            disabled={mediaPage === mediaTotalPages}
                                            className="p-1.5 rounded-lg border border-platinum-tint bg-white text-slate-blue hover:bg-cloud-mist disabled:opacity-40 transition-colors"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>}
                                 onPageSizeChange={size => { setMediaLimit(size); setMediaPage(1); }} /></PaginationRegion>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Media Preview Modal ── */}
            {previewItem && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl border border-platinum-tint flex flex-col"
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-4 border-b border-platinum-tint bg-cloud-mist/30">
                            <div>
                                <p className="font-bold text-midnight-indigo">{previewItem.meetingTitle}</p>
                                <p className="text-xs text-slate-blue mt-0.5">
                                    {previewItem.roomName} · {fmt(previewItem.meetingDate || previewItem.createdAt)}
                                </p>
                            </div>
                            <button onClick={() => setPreviewItem(null)} className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue hover:text-midnight-indigo transition-colors">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Player area */}
                        {(() => {
                            const rawType = (previewItem.fileType || previewItem.file_type || '').toLowerCase();
                            return (
                                <div className={`${rawType === 'audio' ? 'bg-gradient-to-br from-violet-50 to-indigo-50 p-10' : 'bg-black aspect-video'} flex items-center justify-center`}>
                                    {previewItem.previewLoading ? (
                                        <Loader2 className="w-10 h-10 text-white animate-spin" />
                                    ) : previewItem.mediaUrl ? (
                                        rawType === 'audio' ? (
                                            <div className="flex flex-col items-center gap-4 w-full max-w-md">
                                                <Mic className="w-16 h-16 text-violet-400" />
                                                <audio src={previewItem.mediaUrl} controls autoPlay className="w-full" />
                                            </div>
                                        ) : (
                                            <video src={previewItem.mediaUrl} controls autoPlay className="w-full h-full object-contain" />
                                        )
                                    ) : (
                                        <div className="text-white flex flex-col items-center gap-2 p-6">
                                            <AlertTriangle className="w-10 h-10 text-amber-400" />
                                            <span className="text-sm">Không thể tải file phát lại. Vui lòng thử tải xuống.</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Footer */}
                        <div className="flex items-center justify-between p-4 border-t border-platinum-tint bg-cloud-mist/10">
                            <div data-ui-text="primary" className="flex items-center gap-4 text-xs font-semibold text-slate-blue">
                                {previewItem.durationSec != null && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDur(previewItem.durationSec)}</span>}
                                {previewItem.size != null && <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />{fmtBytes(previewItem.size)}</span>}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleDownload(previewItem)}
                                    className="px-4 py-2 bg-action-blue text-white rounded-xl text-xs font-bold hover:bg-action-blue/90 flex items-center gap-1.5"
                                >
                                    <Download className="w-4 h-4" /> Tải xuống
                                </button>
                                <button
                                    onClick={() => setPreviewItem(null)}
                                    className="px-4 py-2 border border-platinum-tint bg-white text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}
            {/* ── Minutes Detail Modal ── */}
            {detailItem && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className="bg-white rounded-2xl shadow-2xl border border-platinum-tint w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                    >
                        {/* Modal header */}
                        <div className="flex items-start justify-between p-5 border-b border-platinum-tint bg-cloud-mist/30 shrink-0">
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <FileText className="w-4 h-4 text-action-blue shrink-0" />
                                    <StatusBadge status={detailItem.status} />
                                </div>
                                <h2 className="text-base font-extrabold text-midnight-indigo leading-snug line-clamp-2">
                                    {detailItem.title || 'Biên bản chưa đặt tiêu đề'}
                                </h2>
                                <p className="text-xs text-slate-blue mt-1 line-clamp-1">
                                    {detailItem.meeting?.title || detailItem.meetingTitle || 'Chưa cung cấp'}
                                </p>
                            </div>
                            <button
                                onClick={() => setDetailItem(null)}
                                className="p-1.5 hover:bg-cloud-mist rounded-lg text-slate-blue hover:text-midnight-indigo transition-colors shrink-0"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal body — scrollable */}
                        <div className="overflow-y-auto flex-1 p-5 space-y-5">
                            {detailItem._loading ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 className="w-9 h-9 mb-3 text-action-blue animate-spin" />
                                    <p data-ui-text="primary" className="text-xs font-semibold text-slate-blue">Đang tải chi tiết biên bản...</p>
                                </div>
                            ) : (() => {
                                const d = detailItem._detail || detailItem;
                                const issuedBy  = d.issuedBy || null;
                                const preparedBy = d.preparedBy || null;
                                const meeting   = d.meeting || {};
                                const decisions  = d.mainContent?.decisions || d._detail?.mainContent?.decisions || [];
                                const actionItems = d.mainContent?.actionItems || d._detail?.mainContent?.actionItems || [];
                                const attendees  = d.attendees || d._detail?.attendees || [];
                                const bodyHtml   = d.mainContent?.minutesContent || '';

                                const UserCard = ({ user, label }) => {
                                    if (!user) return null;
                                    return (
                                        <div className="flex items-center gap-3 p-3 bg-cloud-mist/40 rounded-xl border border-platinum-tint">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-white shadow" />
                                            ) : (
                                                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-action-blue/20 to-action-blue/10 flex items-center justify-center shrink-0 text-sm font-extrabold text-action-blue">
                                                    {user.fullName?.[0] || '?'}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p data-ui-text="label" className="text-[10px] font-bold text-slate-blue/60 uppercase tracking-wide mb-0.5">{label}</p>
                                                <p data-ui-text="primary" className="text-sm font-bold text-midnight-indigo leading-tight">{user.fullName}</p>
                                                {user.jobTitle && <p data-ui-text="secondary" className="text-[11px] text-slate-blue mt-0.5">{user.jobTitle}</p>}
                                                {user.department?.departmentName && (
                                                    <p data-ui-text="secondary" className="text-[10px] text-slate-blue/60 flex items-center gap-1 mt-0.5">
                                                        <Building2 className="w-3 h-3" />{user.department.departmentName}
                                                    </p>
                                                )}
                                                {user.email && <p data-ui-text="secondary" className="text-[10px] text-slate-blue/60 mt-0.5">{user.email}</p>}
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {/* Meeting info */}
                                        <section>
                                            <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2">Thông tin cuộc họp</p>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-blue">
                                                {(meeting.startTime || detailItem.meeting?.startTime) && (
                                                    <div className="flex items-center gap-1.5 bg-cloud-mist/50 px-3 py-2 rounded-lg border border-platinum-tint">
                                                        <Calendar className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                                        <span>{fmt(meeting.startTime || detailItem.meeting?.startTime)}</span>
                                                    </div>
                                                )}
                                                {(meeting.room?.roomName || detailItem.meeting?.room?.roomName) && (
                                                    <div className="flex items-center gap-1.5 bg-cloud-mist/50 px-3 py-2 rounded-lg border border-platinum-tint">
                                                        <MapPin className="w-3.5 h-3.5 text-action-blue shrink-0" />
                                                        <span>{meeting.room?.roomName || detailItem.meeting?.room?.roomName}</span>
                                                    </div>
                                                )}
                                                {d.issuedAt && (
                                                    <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                        <span className="text-emerald-700">Ban hành: {fmtDate(d.issuedAt)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </section>

                                        {/* Người ban hành / soạn thảo */}
                                        <section>
                                            <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2">Nhân sự biên bản</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <UserCard user={issuedBy} label="Người ban hành" />
                                                {preparedBy && preparedBy.id !== issuedBy?.id && (
                                                    <UserCard user={preparedBy} label="Người soạn thảo" />
                                                )}
                                            </div>
                                        </section>

                                        {/* Decisions */}
                                        {decisions.length > 0 && (
                                            <section>
                                                <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <ClipboardList className="w-3.5 h-3.5" /> Quyết định ({decisions.length})
                                                </p>
                                                <PaginatedCollection items={decisions} itemLabel="quyết định">
{(camaiPageItems, camaiStartIndex) => (
<ul className="space-y-1.5">
                                                    {camaiPageItems.map((camaiRecord, camaiIndex) => ((dec, i) => (
                                                        <li key={i} className="flex gap-2.5 text-sm text-midnight-indigo bg-cloud-mist/30 px-3 py-2 rounded-lg border border-platinum-tint">
                                                            <span data-ui-text="primary" className="text-action-blue font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
                                                            <span>{dec.text}</span>
                                                        </li>
                                                    ))(camaiRecord, camaiStartIndex + camaiIndex, (decisions)))}
                                                </ul>
)}
</PaginatedCollection>
                                            </section>
                                        )}

                                        {/* Nội dung biên bản */}
                                        {bodyHtml && (
                                            <section>
                                                <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2">Nội dung biên bản</p>
                                                {/<[a-z][\s\S]*>/i.test(bodyHtml)
                                                    ? <div data-typography-preserve className="prose prose-sm max-w-none text-midnight-indigo bg-cloud-mist/20 border border-platinum-tint rounded-xl p-4" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                                                    : <div className="text-sm text-midnight-indigo whitespace-pre-wrap bg-cloud-mist/20 border border-platinum-tint rounded-xl p-4">{bodyHtml}</div>}
                                            </section>
                                        )}

                                        {/* Action Items */}
                                        {actionItems.length > 0 && (
                                            <section>
                                                <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <ListChecks className="w-3.5 h-3.5" /> Việc cần làm ({actionItems.length})
                                                </p>
                                                <div className="space-y-2">
                                                    {actionItems.map((item, i) => (
                                                        <div key={i} className="flex gap-3 bg-cloud-mist/30 px-3 py-2.5 rounded-lg border border-platinum-tint">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-midnight-indigo">{item.task}</p>
                                                                <div data-ui-text="secondary" className="flex flex-wrap gap-3 mt-1 text-[10px] text-slate-blue">
                                                                    {item.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.owner}</span>}
                                                                    {item.deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(item.deadline)}</span>}
                                                                    {item.priority && (
                                                                        <span className={`px-1.5 py-0.5 rounded font-bold ${item.priority === 'high' ? 'bg-red-50 text-red-600' : item.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                                                                            {item.priority === 'high' ? 'Ưu tiên cao' : item.priority === 'medium' ? 'Trung bình' : 'Thấp'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Attendees */}
                                        {attendees.length > 0 && (
                                            <section>
                                                <p data-ui-text="label" className="text-[10px] font-extrabold text-slate-blue/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Users className="w-3.5 h-3.5" /> Người tham dự ({attendees.length})
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {attendees.map((att, i) => (
                                                        <div key={att.id || i} className="flex items-center gap-2 bg-cloud-mist/40 pl-1 pr-2.5 py-1 rounded-full border border-platinum-tint">
                                                            {att.avatarUrl ? (
                                                                <img src={att.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-action-blue/10 flex items-center justify-center text-[9px] font-extrabold text-action-blue">
                                                                    {att.fullName?.[0] || '?'}
                                                                </div>
                                                            )}
                                                            <span data-ui-text="primary" className="text-[11px] font-semibold text-midnight-indigo">{att.fullName}</span>
                                                            {att.attendanceStatus === 'absent' && (
                                                                <span data-ui-text="badge" className="text-[9px] font-bold text-red-500 bg-red-50 px-1 rounded">Vắng</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {!bodyHtml && decisions.length === 0 && actionItems.length === 0 && attendees.length === 0 && !detailItem._loading && (
                                            <div className="text-center py-6 text-xs text-slate-blue/60">
                                                Biên bản chưa có nội dung.
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end p-4 border-t border-platinum-tint bg-cloud-mist/10 shrink-0 gap-2">
                            {canExportMinutesItem(detailItem, currentUser, isAdmin) && (
                                <button
                                    onClick={() => setExportModalId(detailItem.id)}
                                    className="px-3 py-2 border border-platinum-tint bg-white text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist flex items-center gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Xuất file
                                </button>
                            )}
                            <button
                                onClick={() => setDetailItem(null)}
                                className="px-4 py-2 border border-platinum-tint bg-white text-slate-blue rounded-xl text-xs font-bold hover:bg-cloud-mist"
                            >
                                Đóng
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ── Export Minutes Modal ── */}
            <ExportMinutesModal
                minutesId={exportModalId}
                open={!!exportModalId}
                onClose={() => setExportModalId(null)}
            />
        </div>
    );
};

export default DocumentArchive;
