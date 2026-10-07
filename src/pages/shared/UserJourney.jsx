import {
    AlertCircle, ArrowDownLeft, ArrowUpRight, Calendar, CalendarCheck,
    Car, Check, Clock, Eye, Image as ImageIcon, Map, MapPin, RefreshCw,
    Download, Filter, Search, Sparkles, Timer, User, Video,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import { getUsers } from '../../service/businessAdminServices';
import { getUserJourney, getMyUserJourney } from '../../service/campusService';

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

const formatDayHeader = (dateKey) =>
    new Date(dateKey + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [page, setPage] = useState(1);
    const eventsPerPage = 10;

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
                const res = await getUsers({ search: undefined, limit: 50 });
                const list = res?.success ? (res.data || []) : [];
                const match = list.find(u => u.id === urlUserId || u.uuid === urlUserId);
                if (match) {
                    setSelectedUser(match);
                    setSearchQuery(match.fullName);
                } else {
                    const r2 = await getUsers({ id: urlUserId });
                    if (r2?.success && r2.data?.length > 0) {
                        setSelectedUser(r2.data[0]);
                        setSearchQuery(r2.data[0].fullName);
                    }
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
            .filter(e => (!typeFilter || (e.type || '').toLowerCase() === typeFilter) && (!placeFilter || getPlace(e) === placeFilter))
            .sort((a, b) => new Date(b.time) - new Date(a.time));
    }, [journeyData?.events, typeFilter, placeFilter]);

    /* số sự kiện mỗi ngày (sau lọc) — hiện trên nhãn phân cách ngày */
    const dayCounts = React.useMemo(() => {
        const m = {};
        sortedEvents.forEach(e => { const k = toVNDateKey(e.time); m[k] = (m[k] || 0) + 1; });
        return m;
    }, [sortedEvents]);

    useEffect(() => { setPage(1); }, [typeFilter, placeFilter]);

    const handleExport = () => {
        const rows = sortedEvents.map(e => {
            const type = (e.type || '').toLowerCase();
            const dir = (e.direction || '').toLowerCase();
            return {
                'Ngày': formatDateVN(toVNDateKey(e.time)),
                'Giờ': toVNTime(e.time),
                'Đến': e.endTime ? toVNTime(e.endTime) : '',
                'Thời lượng': formatDuration(e.durationMs) || '',
                'Loại': TYPE_LABELS[type] || type,
                'Hướng': dir === 'enter' ? 'Vào' : dir === 'leave' || dir === 'exit' ? 'Ra' : '',
                'Nơi': getPlace(e) || '',
                'Biển số': e.plateNumber || '',
                'Chi tiết': e.detail || '',
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 14 }, { wch: 60 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hành trình');
        const who = (selectedUser?.fullName || journeyData?.fullName || 'nhan-vien').replace(/[\\/:*?"<>|]/g, '');
        XLSX.writeFile(wb, `Hanh-trinh_${who}_${date}${isRange ? `_den_${dateTo}` : ''}.xlsx`);
    };

    const rangeLabel = isRange ? `${formatDateVN(date)} → ${formatDateVN(dateTo)}` : formatDateVN(date);

    const totalEvents = sortedEvents.length;
    const totalPages = Math.ceil(totalEvents / eventsPerPage);
    const currentEvents = React.useMemo(() => {
        const start = (page - 1) * eventsPerPage;
        return sortedEvents.slice(start, start + eventsPerPage);
    }, [sortedEvents, page]);

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

        return (
            <div className="flex flex-col sm:flex-row gap-4">

                {/* ── Left: time + detail ── */}
                <div className="flex-1 space-y-2 min-w-0">

                    {/* row 1: timestamps + tag */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-white border border-platinum-tint rounded-lg px-2.5 py-1 shadow-sm" title={toVNFull(event.time)}>
                            <Clock className="w-3.5 h-3.5 text-slate-blue shrink-0" />
                            <span className="text-sm font-black text-midnight-indigo font-mono tabular-nums">{timeStart}</span>
                            {timeEnd && (
                                <>
                                    <span className="text-slate-blue text-xs">→</span>
                                    <span className="text-sm font-black text-midnight-indigo font-mono tabular-nums" title={toVNFull(event.endTime)}>{timeEnd}</span>
                                </>
                            )}
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${tagCls}`}>
                            {tagLabel}
                        </span>
                        {duration && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-blue bg-cloud-mist border border-platinum-tint rounded-full px-2 py-0.5">
                                <Timer className="w-3 h-3" />
                                {duration}
                            </span>
                        )}
                    </div>

                    {/* row 2: main detail */}
                    <p className="text-sm font-bold text-midnight-indigo leading-relaxed">
                        {event.detail || 'Ghi nhận sự kiện'}
                    </p>

                    {/* row 3: eventCount (meeting only) */}
                    {type === 'meeting' && event.eventCount > 0 && (
                        <p className="text-[11px] text-slate-blue flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 text-action-blue shrink-0" />
                            Camera nhận diện <strong className="text-midnight-indigo mx-0.5">{event.eventCount}</strong> lần trong phiên
                        </p>
                    )}
                </div>

                {/* ── Right: widgets + thumbnail ── */}
                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-start sm:justify-center gap-2 shrink-0">

                    {/* License plate */}
                    {type === 'gate' && event.plateNumber && (
                        <div className="inline-block border-2 border-midnight-indigo rounded bg-white shadow-sm overflow-hidden px-3 py-1.5 text-center min-w-[110px] font-mono select-all">
                            <div className="text-[8px] text-slate-blue leading-none uppercase font-sans font-bold border-b border-platinum-tint pb-0.5 mb-0.5 tracking-widest">VIỆT NAM</div>
                            <div className="text-base font-black text-midnight-indigo tracking-widest leading-none">{event.plateNumber}</div>
                        </div>
                    )}

                    {/* Room badge */}
                    {type === 'meeting' && event.roomName && (
                        <div className="text-xs bg-white border border-platinum-tint rounded-xl px-3 py-1.5 font-bold text-midnight-indigo flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-action-blue shrink-0" />
                            {event.roomName}
                        </div>
                    )}

                    {/* Zone badge */}
                    {type === 'zone' && event.zoneName && (
                        <div className="text-xs bg-white border border-platinum-tint rounded-xl px-3 py-1.5 font-bold text-royal-amethyst flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {event.zoneName}
                        </div>
                    )}

                    {/* Snapshot thumbnail (gate / meeting) — placeholder cùng kích thước khi BE không trả sourceEventId, để timeline thẳng hàng */}
                    {event.sourceEventId ? (
                        <ThumbnailImage
                            eventId={event.sourceEventId}
                            className="w-28 md:w-36 aspect-video"
                            onClick={() => {
                                setSnapshotEventId(event.sourceEventId);
                                setIsSnapshotOpen(true);
                            }}
                        />
                    ) : (
                        <div className="inline-flex flex-col items-center justify-center gap-1 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 w-28 md:w-36 aspect-video px-1">
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide leading-none text-center">Không có ảnh</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    /* ════════════════════════════════════════════════════════ */
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in-up">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2">
                <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 bg-action-blue/10 text-action-blue rounded-2xl flex items-center justify-center shrink-0">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                            <Map className="w-3.5 h-3.5" />
                            Hành trình
                        </span>
                        <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Hành trình khuôn viên</h1>
                        <p className="text-slate-blue text-sm mt-0.5">
                            {isSelfOnly
                                ? 'Xem lại hành trình di chuyển (ra/vào cổng, phòng họp, khu vực) của bạn trong ngày.'
                                : 'Theo dõi lịch trình hoạt động tổng hợp của một nhân viên trong ngày.'}
                        </p>
                    </div>
                </div>
                {selectedUser && (
                    <button
                        onClick={fetchJourney}
                        disabled={loading}
                        className="self-start md:self-auto p-2.5 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist disabled:opacity-50 rounded-xl transition-all shadow-sm"
                        title="Tải lại dữ liệu hành trình"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                )}
            </div>

            {/* Filter controls */}
            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* User search / Display own user profile */}
                    {isSelfOnly ? (
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Nhân sự</label>
                            <div className="flex items-center gap-3 bg-cloud-mist border border-platinum-tint rounded-xl px-4 py-2 flex-1 min-h-[46px]">
                                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-action-blue flex items-center justify-center font-bold text-xs shrink-0">
                                    {(localUser?.fullName || 'N').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-midnight-indigo flex items-center gap-1.5">
                                        {localUser?.fullName}
                                        {(localUser?.employeeCode || localUser?.employee_code) && (
                                            <span className="text-[10px] font-mono font-bold text-slate-blue bg-white px-1.5 py-0.5 rounded border border-platinum-tint">
                                                {localUser?.employeeCode || localUser?.employee_code}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-slate-blue truncate">{localUser?.email}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5 relative" ref={dropdownRef}>
                            <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Chọn Nhân viên *</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-blue">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Nhập tên, email hoặc mã nhân viên..."
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
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-action-blue" />
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
                                                                <span className="text-[10px] font-mono font-bold text-slate-blue bg-cloud-mist px-1.5 py-0.5 rounded border border-platinum-tint">
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
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Khoảng ngày * <span className="normal-case font-semibold text-slate-400">(tối đa {MAX_RANGE_DAYS} ngày)</span></label>
                        <div className="flex items-center gap-2">
                            {[
                                { value: date, onChange: (v) => { setDate(v); if (v > dateTo) setDateTo(v); }, title: 'Từ ngày' },
                                { value: dateTo, onChange: setDateTo, title: 'Đến ngày', min: date },
                            ].map((p, i) => (
                                <React.Fragment key={p.title}>
                                    {i === 1 && <span className="text-slate-blue text-sm">→</span>}
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
                        {rangeError && <p className="text-xs font-semibold text-red-600">{rangeError}</p>}
                    </div>
                </div>
            </div>

            {/* Main area */}
            {loading ? (
                <div className="bg-white p-6 rounded-2xl border border-platinum-tint shadow-sm-2 space-y-6">
                    <div className="grid grid-cols-3 gap-4 animate-pulse">
                        {[0, 1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
                    </div>
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
                <div className="bg-white p-12 text-center rounded-2xl border border-platinum-tint shadow-sm-2">
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
                </div>
            ) : (
                <div className="space-y-6">

                    {/* KPI cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-1 flex items-center justify-between hover-lift">
                            <div>
                                <p className="text-xs font-bold text-slate-blue uppercase tracking-wider">Cổng ANPR (Xe)</p>
                                <p className="text-2xl font-black text-midnight-indigo mt-1">{journeyData.gateCount || 0}</p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Car className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-1 flex items-center justify-between hover-lift">
                            <div>
                                <p className="text-xs font-bold text-slate-blue uppercase tracking-wider">Cuộc họp (FaceID)</p>
                                <p className="text-2xl font-black text-midnight-indigo mt-1">{journeyData.meetingCount || 0}</p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-action-blue flex items-center justify-center">
                                <CalendarCheck className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm-1 flex items-center justify-between hover-lift">
                            <div>
                                <p className="text-xs font-bold text-slate-blue uppercase tracking-wider">Khu vực Giám sát</p>
                                <p className="text-2xl font-black text-midnight-indigo mt-1">{journeyData.zoneCount || 0}</p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-royal-amethyst flex items-center justify-center">
                                <Eye className="w-5 h-5" />
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="bg-white p-6 md:p-8 rounded-2xl border border-platinum-tint shadow-sm-2">
                        <div className="flex items-center justify-between pb-5 border-b border-platinum-tint/60 mb-8">
                            <h3 className="font-bold text-base text-midnight-indigo flex items-center gap-2">
                                <Clock className="w-4 h-4 text-action-blue" />
                                Nhật ký Hành trình chi tiết
                            </h3>
                            <span className="text-xs font-bold px-3 py-1 bg-cloud-mist border border-platinum-tint text-slate-blue rounded-full">
                                {selectedUser.fullName} &bull; {rangeLabel}
                            </span>
                        </div>

                        {/* bộ lọc loại + nơi + xuất Excel */}
                        <div className="flex flex-wrap items-center gap-2 mb-6">
                            <Filter className="w-4 h-4 text-slate-blue" />
                            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPlaceFilter(''); }}
                                className="pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none">
                                <option value="">Tất cả loại</option>
                                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <select value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} disabled={placeOptions.length === 0}
                                className="pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs font-semibold text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none disabled:opacity-50">
                                <option value="">Tất cả nơi</option>
                                {placeOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {(typeFilter || placeFilter) && (
                                <button onClick={() => { setTypeFilter(''); setPlaceFilter(''); }} className="text-xs font-semibold text-action-blue hover:underline">Bỏ lọc</button>
                            )}
                            <button onClick={handleExport} disabled={sortedEvents.length === 0}
                                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-action-blue hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                                <Download className="w-3.5 h-3.5" /> Xuất Excel ({sortedEvents.length})
                            </button>
                        </div>

                        {/* legend */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-6 text-[11px] font-semibold text-slate-blue">
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
                                {isRange && (idx === 0 || toVNDateKey(currentEvents[idx - 1].time) !== toVNDateKey(event.time)) && (
                                    <div className="relative -ml-6 sm:-ml-8 pl-2 pt-2">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-action-blue text-white text-xs font-bold shadow-sm">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span className="capitalize">{formatDayHeader(toVNDateKey(event.time))}</span>
                                            <span className="font-semibold opacity-80">· {dayCounts[toVNDateKey(event.time)]} sự kiện</span>
                                        </span>
                                    </div>
                                )}
                                <div className="relative group animate-fade-in-up" style={{ animationDelay: `${idx * 60}ms` }}>

                                    {/* node */}
                                    <div className="absolute -left-[45px] sm:-left-[53px] top-0 transition-transform duration-300 group-hover:scale-110">
                                        {renderEventIcon(event)}
                                    </div>

                                    {/* card */}
                                    <div className="bg-cloud-mist/40 group-hover:bg-cloud-mist/80 p-5 rounded-2xl border border-platinum-tint/60 hover:border-platinum-tint transition-all duration-300">
                                        {renderEventCard(event)}
                                    </div>
                                </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-8 border-t border-platinum-tint/60 pt-6">
                                <div className="text-sm text-slate-blue">
                                    Hiển thị{' '}
                                    <span className="font-bold text-midnight-indigo">{(page - 1) * eventsPerPage + 1}</span>
                                    {' '}–{' '}
                                    <span className="font-bold text-midnight-indigo">{Math.min(page * eventsPerPage, totalEvents)}</span>
                                    {' '}trong{' '}
                                    <span className="font-bold text-midnight-indigo">{totalEvents}</span> sự kiện
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">Trước</button>
                                    <span className="text-sm font-bold px-3 py-1.5 bg-cloud-mist rounded-lg">{page} / {totalPages}</span>
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-platinum-tint text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">Sau</button>
                                </div>
                            </div>
                        )}
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
