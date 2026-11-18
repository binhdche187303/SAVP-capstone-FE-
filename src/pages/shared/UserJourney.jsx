import { countBy } from '../../hooks/useFilterCounts';
import { matchesFilter } from '../../utils/filterSelection';
import PageHeading from '../../components/common/PageHeading';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import StatisticGrid from '../../components/common/StatisticGrid';
import StatisticCard from '../../components/common/StatisticCard';
import ReportActions from '../../components/common/ReportActions';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import CalendarRangePresets from '../../components/common/CalendarRangePresets';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Calendar, CalendarCheck, Car, Check, Clock, Eye, Image as ImageIcon, Map, RefreshCw, Filter, Search, Timer, User, Loader2 } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExportMenu from '../../components/report/ExportMenu';
import { downloadReport, currentUserName, fmtVN } from '../../utils/exportExcel';
import toast from '../../utils/toast';

import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import { getUsers, getUserById } from '../../service/businessAdminServices';
import { getUserJourney, getMyUserJourney } from '../../service/campusService';
import './UserJourney.css';

/* ─── helpers ─────────────────────────────────────────────── */
const getVNTodayString = () => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vn.toISOString().split('T')[0];
};

const toVNTime = (utcStr) => {
    if (!utcStr) return '';
    const d = new Date(utcStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
};

const toVNFull = (utcStr) => {
    if (!utcStr) return '';
    return new Date(utcStr).toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh',
    });
};

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return null;
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin} phút`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}g ${m}p` : `${h} giờ`;
};

const MAX_RANGE_DAYS = 31;

const toVNDateKey = (utcStr) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(utcStr));

const formatDateVN = (dateKey) => new Date(dateKey + 'T00:00:00').toLocaleDateString('vi-VN');

const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

const TYPE_LABELS = { gate: 'Cổng (xe)', meeting: 'Phòng họp', zone: 'Khu vực' };

/** Tên nơi chốn của 1 sự kiện — dùng cho bộ lọc "nơi" và cột Excel. */
const getPlace = (event) => {
    const type = (event.type || '').toLowerCase();
    if (type === 'meeting') return event.roomName || null;
    return event.zoneName || null;
};

/* ─── component ───────────────────────────────────────────── */
const UserJourney = () => {
    const [eventsPerPage, setEventsPerPage] = useState(10);
    const [searchParams, setSearchParams] = useSearchParams();

    const localUser = React.useMemo(() => {
        try {
            const userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        } catch {
            return null;
        }
    }, []);

    const isSelfOnly = React.useMemo(() => {
        if (!localUser) return true;
        const isAdmin = localUser.roles?.some(r => {
            const roleStr = (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase();
            return ['SYSTEM_ADMIN', 'BUSINESS_ADMIN', 'ADMIN'].includes(roleStr);
        });
        return !isAdmin;
    }, [localUser]);

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(() => {
        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user) {
                const isAdmin = user.roles?.some(r => {
                    const roleStr = (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase();
                    return ['SYSTEM_ADMIN', 'BUSINESS_ADMIN', 'ADMIN'].includes(roleStr);
                });
                if (!isAdmin) {
                    return user;
                }
            }
        } catch {}
        return null;
    });
    const [searchQuery, setSearchQuery] = useState(() => {
        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            if (user) {
                const isAdmin = user.roles?.some(r => {
                    const roleStr = (typeof r === 'string' ? r : r.roleCode || r.role_code || '').toUpperCase();
                    return ['SYSTEM_ADMIN', 'BUSINESS_ADMIN', 'ADMIN'].includes(roleStr);
                });
                if (!isAdmin) {
                    return user.fullName || '';
                }
            }
        } catch {}
        return '';
    });
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [usersLoading, setUsersLoading] = useState(false);

    const [date, setDate] = useState(searchParams.get('date') || getVNTodayString());
    const [dateTo, setDateTo] = useState(searchParams.get('to') || searchParams.get('date') || getVNTodayString());
    const [typeFilter, setTypeFilter] = useState('');
    const [placeFilter, setPlaceFilter] = useState('');
    const isRange = dateTo !== date;
    const rangeError = dateTo < date
        ? 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'
        : dayDiff(date, dateTo) + 1 > MAX_RANGE_DAYS ? `Chỉ xem tối đa ${MAX_RANGE_DAYS} ngày một lần.` : null;

    const [journeyData, setJourneyData] = useState(null);
    const [busyFormat, setBusyFormat] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [page, setPage] = useState(1);


    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

    const dropdownRef = useRef(null);
    const urlUserId = searchParams.get('userId');
    const autoLoadedRef = useRef(false);

    /* fetch users for dropdown search — no auto-select logic here */
    const fetchUsers = useCallback(async (query = '') => {
        if (isSelfOnly) return;
        setUsersLoading(true);
        try {
            const res = await getUsers({ search: query || undefined, limit: 15 });
            if (res?.success) setUsers(res.data || []);
        } catch (_) { /* ignore */ }
        finally { setUsersLoading(false); }
    }, [isSelfOnly]);

    useEffect(() => {
        if (isSelfOnly) return;
        const t = setTimeout(() => fetchUsers(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery, fetchUsers, isSelfOnly]);

    /* auto-select user from URL — runs once per urlUserId, never re-runs after clear */
    useEffect(() => {
        if (isSelfOnly) return;
        if (!urlUserId || autoLoadedRef.current) return;
        autoLoadedRef.current = true;
        (async () => {
            try {
                // GET /users không lọc theo id ⇒ lấy thẳng người dùng theo id (DB có hàng chục nghìn tài khoản).
                const res = await getUserById(urlUserId);
                const match = res?.success ? res.data : null;
                if (match?.id) {
                    setSelectedUser(match);
                    setSearchQuery(match.fullName);
                }
            } catch (_) { /* ignore */ }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlUserId, isSelfOnly]);

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target))
                setIsDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    /* fetch journey */
    // isSelfOnly (EMPLOYEE) không có quyền zones.gate_log.read (BE campus/user-journey
    // admin route) — dùng GET /campus/user-journey/me (JWT-only, tự lọc theo user hiện tại,
    // userId lấy từ token) thay thế. Route "me" trả ĐẦY ĐỦ 3 nguồn (cổng/họp/khu vực) giống
    // hệt bản admin, chỉ khác ở chỗ luôn tự khoá vào chính user đang đăng nhập.
    const fetchJourney = useCallback(async () => {
        if (!selectedUser || rangeError) return;
        setLoading(true);
        setError(null);
        try {
            const range = isRange ? { date, to: dateTo } : { date };
            const res = isSelfOnly
                ? await getMyUserJourney(range)
                : await getUserJourney({ userId: selectedUser.id || selectedUser.uuid, ...range });
            if (res?.success) {
                setJourneyData(res.data);
                setPage(1);
                setTypeFilter('');
                setPlaceFilter('');
                setSearchParams({ userId: selectedUser.id || selectedUser.uuid, ...range });
            } else {
                setError(res?.message || 'Không thể tải hành trình di chuyển.');
            }
        } catch (err) {
            setError(err?.message || 'Lỗi kết nối khi tải hành trình.');
        } finally {
            setLoading(false);
        }
    }, [selectedUser, date, dateTo, isRange, rangeError, setSearchParams, isSelfOnly]);

    useEffect(() => {
        if (selectedUser) fetchJourney();
        else setJourneyData(null);
    }, [selectedUser, date, dateTo, fetchJourney]);

    /* các nơi xuất hiện trong dữ liệu đã tải — nguồn cho dropdown lọc nơi */
    const placeOptions = React.useMemo(() => {
        const set = new Set();
        (journeyData?.events || []).forEach(e => {
            if (typeFilter && (e.type || '').toLowerCase() !== typeFilter) return;
            const p = getPlace(e);
            if (p) set.add(p);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
    }, [journeyData?.events, typeFilter]);

    /* sorted events — newest first, đã áp bộ lọc loại + nơi (lọc phía FE trên dữ liệu đã tải) */
    const sortedEvents = React.useMemo(() => {
        if (!journeyData?.events) return [];
        return journeyData.events
            .filter(e => (!typeFilter || (e.type || '').toLowerCase() === typeFilter) && (matchesFilter(placeFilter, getPlace(e))))
            .sort((a, b) => new Date(b.time) - new Date(a.time));
    }, [journeyData?.events, typeFilter, placeFilter]);

    // Số đếm cạnh lựa chọn ô "Vị trí" (đếm tại chỗ theo loại sự kiện đang chọn).
    const placeCounts = React.useMemo(() => countBy(
        (journeyData?.events || []).filter(e => !typeFilter || (e.type || '').toLowerCase() === typeFilter),
        getPlace,
    ), [journeyData?.events, typeFilter]);

    useEffect(() => { setPage(1); }, [typeFilter, placeFilter]);

    const handleExport = async (format, extra = {}) => {
        if (sortedEvents.length === 0) return;
        setBusyFormat(format);
        try {
            const rows = sortedEvents.map(e => {
                const type = (e.type || '').toLowerCase();
                const dir = (e.direction || '').toLowerCase();
                return {
                    day: formatDateVN(toVNDateKey(e.time)),
                    time: toVNTime(e.time),
                    until: e.endTime ? toVNTime(e.endTime) : '',
                    duration: formatDuration(e.durationMs) || '',
                    type: TYPE_LABELS[type] || type,
                    dir: dir === 'enter' ? 'Vào' : dir === 'leave' || dir === 'exit' ? 'Ra' : '',
                    place: getPlace(e) || '',
                    plate: e.plateNumber || '',
                    detail: e.detail || '',
                    camera: e.deviceName || '',
                    camCode: e.deviceCode || '',
                    group: (e.groupNames || []).join(', '),
                };
            });
            const who = (selectedUser?.fullName || journeyData?.fullName || 'nhan-vien').replace(/[\\/:*?"<>|]/g, '');
            const exportedAt = new Date();
            const byType = {};
            sortedEvents.forEach(e => { const t = TYPE_LABELS[(e.type || '').toLowerCase()] || e.type || 'Khác'; byType[t] = (byType[t] || 0) + 1; });
            await downloadReport({
                format,
                standard: extra,
                period: { from: date, to: isRange ? dateTo : date },
                docTitle: `Lịch sử di chuyển của ${selectedUser?.fullName || journeyData?.fullName || 'nhân sự'}`,
                dataSource: 'Hệ thống VISMA — camera nhận diện tại cổng, phòng họp và khu vực',
                fileName: `Hanh-trinh_${who}_${date}${isRange ? `_den_${dateTo}` : ''}`,
                title: 'BÁO CÁO LỊCH SỬ DI CHUYỂN THEO NGƯỜI',
                subtitle: 'Các lần camera ghi nhận một người (cổng, phòng họp, khu vực) trong khoảng thời gian đã chọn',
                info: [
                    { section: 'Phạm vi báo cáo' },
                    ['Họ tên', selectedUser?.fullName || journeyData?.fullName || ''],
                    ['Mã nhân sự', selectedUser?.employeeCode || selectedUser?.employee_code || ''],
                    ['Khoảng thời gian', rangeLabel],
                    ['Bộ lọc loại', typeFilter ? (TYPE_LABELS[typeFilter] || typeFilter) : 'Tất cả loại'],
                    ['Bộ lọc nơi', placeFilter || 'Tất cả nơi'],
                    { section: 'Kết quả tổng hợp' },
                    ['Tổng số sự kiện', sortedEvents.length],
                    ...Object.entries(byType).map(([t, n]) => [`Số sự kiện: ${t}`, n]),
                    { section: 'Thông tin xuất' },
                    ['Người xuất', currentUserName()],
                    ['Thời điểm xuất', fmtVN(exportedAt)],
                ],
                sheets: [{
                    name: 'Hành trình',
                    freezeCols: 2,
                    columns: [
                        { header: 'Ngày', key: 'day', width: 12 },
                        { header: 'Giờ', key: 'time', width: 9 },
                        { header: 'Đến', key: 'until', width: 9 },
                        { header: 'Thời lượng', key: 'duration', width: 12 },
                        { header: 'Loại', key: 'type', width: 14 },
                        { header: 'Hướng', key: 'dir', width: 8, align: 'center' },
                        { header: 'Nơi', key: 'place', width: 26 },
                        { header: 'Biển số', key: 'plate', width: 13 },
                        { header: 'Chi tiết', key: 'detail', width: 46, wrap: true },
                        { header: 'Camera', key: 'camera', width: 26 },
                        { header: 'Mã camera', key: 'camCode', width: 17 },
                        { header: 'Nhóm camera', key: 'group', width: 26, wrap: true },
                    ],
                    rows,
                }],
            });
            toast.success(extra.mode === 'standard' ? `Đã tải bản quy chuẩn (${format.toUpperCase()}).` : format === 'pdf' ? 'Đã mở bản in — chọn “Lưu thành PDF”.' : `Đã xuất ${rows.length} sự kiện (${{ xlsx: 'Excel', docx: 'Word' }[format]}).`);
        } catch (err) {
            return { success: false, message: err?.message || 'Không xuất được báo cáo.' };
        } finally {
            setBusyFormat(null);
        }
    };

    const rangeLabel = isRange ? `${formatDateVN(date)} → ${formatDateVN(dateTo)}` : formatDateVN(date);

    const totalEvents = sortedEvents.length;
    const totalPages = Math.ceil(totalEvents / eventsPerPage);
    const currentEvents = React.useMemo(() => {
        const start = (page - 1) * eventsPerPage;
        return sortedEvents.slice(start, start + eventsPerPage);
    }, [sortedEvents, page, eventsPerPage]);

    /* ── Icon node on timeline ── */
    const renderEventIcon = (event) => {
        const type = (event.type || '').toLowerCase();
        const dir = (event.direction || '').toLowerCase();
        if (type === 'gate') {
            const isEnter = dir === 'enter';
            return (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm border relative ${isEnter ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-orange-50 border-orange-200 text-orange-600'}`}>
                    {isEnter
                        ? <ArrowDownLeft className="w-4 h-4 absolute -top-1 -left-1 bg-emerald-600 text-white rounded-full p-0.5 border border-white" />
                        : <ArrowUpRight className="w-4 h-4 absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5 border border-white" />}
                    <Car className="w-5 h-5" />
                </div>
            );
        }
        if (type === 'meeting') {
            return (
                <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 text-action-blue flex items-center justify-center shadow-sm">
                    <CalendarCheck className="w-5 h-5" />
                </div>
            );
        }
        return (
            <div className="w-10 h-10 rounded-full bg-purple-50 border border-purple-200 text-royal-amethyst flex items-center justify-center shadow-sm">
                <Eye className="w-5 h-5" />
            </div>
        );
    };

    /* ── Event card content ── */
    const renderEventCard = (event) => {
        const type = (event.type || '').toLowerCase();
        const dir = (event.direction || '').toLowerCase();
        const timeStart = toVNTime(event.time);
        const timeEnd = event.endTime ? toVNTime(event.endTime) : null;
        const duration = formatDuration(event.durationMs);

        /* tag colors */
        const tagCls =
            type === 'gate' ? (dir === 'enter' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700') :
            type === 'meeting' ? 'bg-blue-100 text-action-blue' :
            'bg-purple-100 text-royal-amethyst';
        const tagLabel =
            type === 'gate' ? (dir === 'enter' ? 'Vào cổng' : 'Ra cổng') :
            type === 'meeting' ? 'Phòng họp' : 'Khu vực';

        const description = type === 'gate'
            ? (dir === 'enter' ? 'Ghi nhận lượt xe vào cổng' : 'Ghi nhận lượt xe ra cổng')
            : type === 'zone' ? (dir === 'disappear' ? 'Ghi nhận rời khỏi khu vực' : 'Ghi nhận hiện diện tại khu vực')
                : event.detail || 'Ghi nhận tham dự cuộc họp';
        const location = type === 'meeting' ? event.roomName : event.zoneName;

        return (
            <div className="journey-event">
                <div className="journey-event-content">
                    <div className="journey-event-heading">
                        <span data-ui-text="primary" className="journey-event-time font-semibold" title={toVNFull(event.time)}>
                            <Clock size={14} aria-hidden="true" />
                            {isRange && <span>{formatDateVN(toVNDateKey(event.time))} ·</span>}
                            {timeStart}
                            {timeEnd && <span title={toVNFull(event.endTime)}>– {timeEnd}</span>}
                        </span>
                        <span data-ui-text="badge" className={`journey-event-badge ${tagCls}`}>{tagLabel}</span>
                        {duration && <span data-ui-text="secondary" className="journey-event-duration"><Timer size={14} aria-hidden="true" />{duration}</span>}
                    </div>
                    <p data-ui-text="primary" className="journey-event-description font-semibold">{description}</p>
                    <dl className="journey-event-details">
                        {location && <div><dt data-ui-text="label">{type === 'meeting' ? 'Phòng họp' : 'Vị trí'}</dt><dd data-ui-text="body">{location}</dd></div>}
                        {type === 'gate' && event.plateNumber && <div><dt data-ui-text="label">Biển số</dt><dd data-ui-text="body"><span data-ui-text="primary" className="journey-event-plate font-semibold">{event.plateNumber}</span></dd></div>}
                        {(event.deviceName || event.deviceCode) && <div><dt data-ui-text="label">Camera</dt><dd data-ui-text="body">{event.deviceName || event.deviceCode}</dd></div>}
                        {event.groupNames?.length > 0 && <div><dt data-ui-text="label">Nhóm camera</dt><dd data-ui-text="body">{event.groupNames.join(', ')}</dd></div>}
                    </dl>
                    {type === 'meeting' && event.eventCount > 0 && (
                        <p data-ui-text="secondary" className="journey-event-note">Được camera ghi nhận {event.eventCount} lần trong buổi họp.</p>
                    )}
                </div>
                <div className="journey-event-image">
                    {event.sourceEventId ? (
                        <ThumbnailImage eventId={event.sourceEventId} className="w-28 md:w-36 aspect-video"
                            onClick={() => { setSnapshotEventId(event.sourceEventId); setIsSnapshotOpen(true); }} />
                    ) : (
                        <div className="journey-event-no-image">
                            <ImageIcon size={18} aria-hidden="true" />
                            <span data-ui-text="secondary">Chưa có ảnh</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    /* ════════════════════════════════════════════════════════ */
    return (
        <div data-page-surface="wide" className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in-up">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-platinum-tint pb-5">
                <div className="min-w-0">
                    <PageHeading badge="Hành trình" icon={<Map />} className="text-2xl font-bold text-midnight-indigo tracking-tight">Lịch sử di chuyển theo người</PageHeading>
                    <p data-page-description className="text-slate-blue text-sm mt-1">
                        {isSelfOnly
                            ? 'Xem lại hành trình di chuyển (ra/vào cổng, phòng họp, khu vực) của bạn trong ngày.'
                            : 'Theo dõi lịch trình hoạt động tổng hợp của một nhân viên trong ngày.'}
                    </p>
                </div>
                {selectedUser && (
                    <ReportActions>
                        <ExportMenu compact askMode initialRange={{ from: date, to: isRange ? dateTo : date }} filterSummary={[`Người: ${selectedUser.fullName || selectedUser.full_name || ''}`, typeFilter ? `Loại sự kiện: ${TYPE_LABELS[typeFilter] || typeFilter}` : 'Tất cả loại sự kiện', placeFilter ? `Vị trí: ${placeFilter}` : 'Tất cả vị trí']} onExport={handleExport} busyFormat={busyFormat} disabled={loading || !journeyData || sortedEvents.length === 0} label={`Xuất báo cáo (${sortedEvents.length})`} />
                        <RefreshButton
                            onClick={fetchJourney}
                            disabled={loading}
                            title="Làm mới dữ liệu hành trình"
                            busy={loading}
                        />
                    </ReportActions>
                )}
            </div>

            {/* Filter controls */}
            <FilterBar variant="card" className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2">
                <div data-filter-grid={isSelfOnly ? undefined : true} className={isSelfOnly ? "grid grid-cols-1 xl:grid-cols-3 gap-4 items-end" : "grid grid-cols-1 md:grid-cols-2 gap-5"}>

                    {/* User search / Display own user profile */}
                    {isSelfOnly ? (
                        <CalendarRangePresets
                            from={date}
                            to={dateTo}
                            options={[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"], ["custom", "Tùy chọn khoảng"]]}
                            onChange={({ from, to }) => { setDate(from); setDateTo(to); }}
                        />
                    ) : (
                        <div className="camai-filter-field space-y-1.5 relative" ref={dropdownRef}>
                            <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Chọn Nhân viên *</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-blue">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Tên, email, mã nhân viên..." title="Nhập tên, email hoặc mã nhân viên"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setIsDropdownOpen(true);
                                        if (selectedUser && selectedUser.fullName !== e.target.value)
                                            setSelectedUser(null);
                                    }}
                                    onFocus={() => setIsDropdownOpen(true)}
                                    className="w-full pl-9 pr-9 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setSelectedUser(null);
                                            setJourneyData(null);
                                            autoLoadedRef.current = false;
                                            setSearchParams({});
                                        }}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-blue hover:text-midnight-indigo text-xs font-medium"
                                    >
                                        Xóa
                                    </button>
                                )}
                            </div>
                            {isDropdownOpen && (
                                <div className="absolute z-20 w-full mt-1.5 bg-white border border-platinum-tint rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-platinum-tint/40">
                                    {usersLoading && users.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-blue flex items-center justify-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-action-blue" />
                                            Đang tìm kiếm...
                                        </div>
                                    ) : users.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-blue">Không tìm thấy nhân viên nào</div>
                                    ) : (
                                        users.map((u) => {
                                            const isSel = selectedUser && (selectedUser.id === u.id || selectedUser.uuid === u.uuid);
                                            return (
                                                <div
                                                    key={u.id || u.uuid}
                                                    onClick={() => { setSelectedUser(u); setSearchQuery(u.fullName); setIsDropdownOpen(false); }}
                                                    className={`px-4 py-2.5 hover:bg-cloud-mist cursor-pointer flex items-center justify-between transition-colors ${isSel ? 'bg-blue-50/50' : ''}`}
                                                >
                                                    <div>
                                                        <div className="text-sm font-bold text-midnight-indigo flex items-center gap-2">
                                                            {u.fullName}
                                                            {(u.employeeCode || u.employee_code) && (
                                                                <span data-ui-text="code" className="text-[10px] font-mono font-bold text-slate-blue bg-cloud-mist px-1.5 py-0.5 rounded border border-platinum-tint">
                                                                    {u.employeeCode || u.employee_code}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-blue mt-0.5">{u.email}</div>
                                                    </div>
                                                    {isSel && <Check className="w-4 h-4 text-action-blue" />}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date picker */}
                    {isSelfOnly ? (
                        <div className="xl:col-span-2 min-w-0">
                            <div className="grid grid-cols-2 gap-4">
                                <FilterField label="Từ ngày">
                                    <input type="date" value={date} max={dateTo || getVNTodayString()}
                                        onChange={e => e.target.value && setDate(e.target.value)} />
                                </FilterField>
                                <FilterField label="Đến ngày">
                                    <input type="date" value={dateTo} min={date} max={getVNTodayString()}
                                        onChange={e => e.target.value && setDateTo(e.target.value)} />
                                </FilterField>
                            </div>
                            {rangeError && <p className="text-xs font-semibold text-red-600 mt-2">{rangeError}</p>}
                        </div>
                    ) : (
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Khoảng ngày * <span className="normal-case font-semibold text-slate-400">(tối đa {MAX_RANGE_DAYS} ngày)</span></label>
                        <div className="flex items-center gap-2">
                            {[
                                { value: date, onChange: (v) => { setDate(v); if (v > dateTo) setDateTo(v); }, title: 'Từ ngày' },
                                { value: dateTo, onChange: setDateTo, title: 'Đến ngày', min: date },
                            ].map((p, i) => (
                                <React.Fragment key={p.title}>
                                    {i === 1 && <span data-filter-separator className="text-slate-blue text-sm">→</span>}
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-blue">
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="date"
                                            title={p.title}
                                            value={p.value}
                                            min={p.min}
                                            max={getVNTodayString()}
                                            onChange={(e) => e.target.value && p.onChange(e.target.value)}
                                            className="w-full pl-9 pr-2 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                                        />
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                        {rangeError && <p data-ui-text="secondary" className="text-xs font-semibold text-red-600">{rangeError}</p>}
                    </div>
                    )}
                </div>
            </FilterBar>

            {/* Main area */}
            {loading ? (
                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-6">
                    <div className="h-10 w-full max-w-md bg-gray-100 rounded-lg animate-pulse" />
                    <div className="border-t border-platinum-tint pt-6 space-y-6 animate-pulse">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
                                <div className="space-y-2 flex-1">
                                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : error ? (
                <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
                    <AlertCircle className="w-10 h-10 text-red-600" />
                    <div>
                        <h4 className="font-bold text-base">Đã xảy ra lỗi</h4>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                    <button onClick={fetchJourney} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />Thử lại
                    </button>
                </div>
            ) : !selectedUser ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-platinum-tint shadow-sm-2">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                        <div className="w-16 h-16 bg-action-blue/10 rounded-full flex items-center justify-center text-action-blue">
                            <Search className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-midnight-indigo">Chưa chọn nhân viên</h3>
                            <p className="text-slate-blue text-sm mt-1">Vui lòng tìm kiếm và chọn một nhân viên để tra cứu lịch trình di chuyển và hiện diện trong khuôn viên.</p>
                        </div>
                    </div>
                </div>
            ) : !journeyData?.events?.length ? (
                <><div className="bg-white p-12 text-center rounded-2xl border border-platinum-tint shadow-sm-2">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                        <div className="w-16 h-16 bg-cloud-mist rounded-full flex items-center justify-center text-slate-blue border border-platinum-tint">
                            <Clock className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-midnight-indigo">Không có dữ liệu hành trình</h3>
                            <p className="text-slate-blue text-sm mt-1">
                                Không tìm thấy bất kỳ hoạt động nào của <strong>{selectedUser.fullName}</strong> trong {isRange ? 'khoảng' : 'ngày'} {rangeLabel}.
                            </p>
                        </div>
                    </div>
                </div><PaginationRegion legacyVisible={false}><PaginationFooter
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={totalEvents}
                                pageSize={eventsPerPage}
                                onPageChange={setPage}
                                itemLabel={"sự kiện"}
                                loading={loading}
                             onPageSizeChange={size => { setEventsPerPage(size); setPage(1); }} /></PaginationRegion></>
            ) : (
                <div className="space-y-6">

                    <StatisticGrid columns={4}>
                        {[
                            ['', 'Tất cả sự kiện', Clock, 'default'],
                            ['gate', 'Cổng', Car, 'success'],
                            ['meeting', 'Phòng họp', CalendarCheck, 'default'],
                            ['zone', 'Khu vực', Eye, 'default'],
                        ].map(([value, label, icon, tone]) => (
                            <StatisticCard key={value} label={label} icon={icon} tone={tone}
                                value={(journeyData.events || []).filter(event => !value || (event.type || '').toLowerCase() === value).length}
                                selected={typeFilter === value}
                                onClick={() => { setTypeFilter(value); setPlaceFilter(''); }}
                            />
                        ))}
                    </StatisticGrid>

                    {/* Timeline */}
                    <div className="bg-white p-6 md:p-8 rounded-2xl border border-platinum-tint shadow-sm-2">
                        <div className="flex items-center justify-between pb-5 border-b border-platinum-tint/60 mb-8">
                            <h3 className="font-bold text-base text-midnight-indigo flex items-center gap-2">
                                <Clock className="w-4 h-4 text-action-blue" />
                                Nhật ký Hành trình chi tiết
                            </h3>
                            <span data-ui-text="badge" className="text-xs font-bold px-3 py-1 bg-cloud-mist border border-platinum-tint text-slate-blue rounded-full">
                                {selectedUser.fullName} &bull; {rangeLabel}
                            </span>
                        </div>

                        <FilterBar variant="card" className="journey-place-filters mb-6">
                            <FilterField label="Vị trí">
                                <FilterMultiSelect counts={placeCounts} value={placeFilter} onChange={e => setPlaceFilter(e.target.value)} disabled={placeOptions.length === 0}>
                                    <option value="">Tất cả vị trí</option>
                                    {placeOptions.map(place => <option key={place} value={place}>{place}</option>)}
                                </FilterMultiSelect>
                            </FilterField>
                            <button data-filter-action type="button"
                                onClick={() => { setTypeFilter(''); setPlaceFilter(''); setPage(1); }}
                                className="px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors">
                                <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                            </button>
                        </FilterBar>

                        {/* legend */}
                        <div data-ui-text="secondary" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-6 text-[11px] font-semibold text-slate-blue">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                Vào cổng
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                                Ra cổng
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-action-blue shrink-0" />
                                Phòng họp
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-royal-amethyst shrink-0" />
                                Khu vực
                            </span>
                        </div>

                        {/* vertical timeline */}
                        <div className="relative pl-6 sm:pl-8 border-l border-platinum-tint/80 ml-5 sm:ml-6 space-y-8 pb-4">
                            {currentEvents.length === 0 && (
                                <p className="text-sm text-slate-blue py-6">Không có sự kiện nào khớp bộ lọc.</p>
                            )}
                            {currentEvents.map((event, idx) => (
                                <React.Fragment key={idx}>
                                <div className="relative group animate-fade-in-up" style={{ animationDelay: `${idx * 60}ms` }}>

                                    {/* node */}
                                    <div className="absolute -left-[45px] sm:-left-[53px] top-0 transition-transform duration-300 group-hover:scale-110">
                                        {renderEventIcon(event)}
                                    </div>

                                    {/* card */}
                                    <div className="journey-event-card">
                                        {renderEventCard(event)}
                                    </div>
                                </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* pagination */}
                        {<PaginationRegion legacyVisible={totalPages > 1}><PaginationFooter
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={totalEvents}
                                pageSize={eventsPerPage}
                                onPageChange={setPage}
                                itemLabel={"sự kiện"}
                                loading={loading}
                             onPageSizeChange={size => { setEventsPerPage(size); setPage(1); }} /></PaginationRegion>}
                    </div>
                </div>
            )}

            {/* Snapshot fullscreen modal */}
            <EventSnapshotModal
                isOpen={isSnapshotOpen}
                onClose={() => setIsSnapshotOpen(false)}
                eventId={snapshotEventId}
            />
        </div>
    );
};

export default UserJourney;
