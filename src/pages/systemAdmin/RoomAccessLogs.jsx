import {
    AlertTriangle, ArrowUpDown, Briefcase, Building, Calendar,
    CheckCircle2, Clock, DoorOpen, Eye, Filter,
    LogIn, LogOut, Mail, Phone, RefreshCw, RotateCw,
    Route, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Users, X, ChevronDown,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import UserAvatar from '../../components/common/UserAvatar';

import {
    getRooms,
    getRoomAccessLog,
    getRoomBookings,
    getUserById,
} from '../../service/sysAdminServices';
import { getUsers } from '../../service/employeeServices';

// ─── constants ──────────────────────────────────────────────────────────────

const LOGS_PER_PAGE = 10;
// Các lượt cùng phòng + cùng hướng cách nhau ≤ 3s = camera bắt được nhiều người trong cùng khung hình.
const GROUP_WINDOW_MS = 3000;

// ─── helpers ─────────────────────────────────────────────────────────────────

const formatVN = (iso) => {
    if (!iso) return { date: '—', time: '—' };
    try {
        const d = new Date(iso);
        return {
            date: d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
        };
    } catch { return { date: '—', time: '—' }; }
};

const formatVNFull = (iso) => {
    const { date, time } = formatVN(iso);
    return `${time} ${date}`;
};

const getTodayVNString = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const getIdentityStatus = (ev) => {
    if (ev.isStranger)  return 'stranger';
    if (ev.isUnmatched) return 'unmatched';
    return 'matched';
};

const getEventTs = (ev) => new Date(ev.eventTime || ev.timestamp).getTime();

// Gom các lượt liền kề (đã sort) cùng phòng + cùng hướng, lệch ≤ GROUP_WINDOW_MS so với lượt đầu nhóm.
const groupSimultaneous = (sorted) => {
    const groups = [];
    sorted.forEach(ev => {
        const last = groups[groups.length - 1];
        const head = last?.events[0];
        if (head && head.roomId === ev.roomId && head.direction === ev.direction
            && Math.abs(getEventTs(head) - getEventTs(ev)) <= GROUP_WINDOW_MS) {
            last.events.push(ev);
        } else {
            groups.push({ key: ev.id, events: [ev] });
        }
    });
    return groups;
};

const getPageNumbers =(current, total) => {
    const delta = 1, pages = [];
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) pages.push(i);
    }
    const withDots = []; let last = null;
    pages.forEach(p => {
        if (last !== null) {
            if (p - last === 2) withDots.push(last + 1);
            else if (p - last > 1) withDots.push('…');
        }
        withDots.push(p); last = p;
    });
    return withDots;
};

// ─── StatCard ────────────────────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, sub, colorCls, alert }) => (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 transition-all ${alert ? 'border-red-300' : 'border-platinum-tint'}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
            <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-blue truncate">{label}</p>
            <p className={`text-2xl font-extrabold leading-tight ${alert ? 'text-red-600' : 'text-midnight-indigo'}`}>{value}</p>
            {sub && <p className={`text-[10px] font-semibold mt-0.5 ${alert ? 'text-red-500' : 'text-slate-400'}`}>{sub}</p>}
        </div>
    </div>
);

// ─── DirectionBadge ──────────────────────────────────────────────────────────

const DirectionBadge = ({ direction }) => {
    if (direction === 'enter')
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><LogIn className="w-3 h-3" />Vào</span>;
    if (direction === 'leave')
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-700 bg-amber-50 border-amber-200"><LogOut className="w-3 h-3" />Ra</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-slate-600 bg-slate-50 border-slate-200"><Eye className="w-3 h-3" />Thấy</span>;
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
    if (status === 'stranger')
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-red-700 bg-red-50 border-red-200"><AlertTriangle className="w-3 h-3" />Người lạ</span>;
    if (status === 'unmatched')
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-700 bg-amber-50 border-amber-200"><ShieldQuestion className="w-3 h-3" />Chưa khớp</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><ShieldCheck className="w-3 h-3" />Khớp</span>;
};

// ─── main component ───────────────────────────────────────────────────────────

const RoomAccessLogs = () => {
    const [rooms, setRooms]                     = useState([]);
    const [selectedRoomId, setSelectedRoomId]   = useState('');
    const [selectedDate, setSelectedDate]       = useState(getTodayVNString());
    const [meetings, setMeetings]               = useState([]);
    const [selectedMeetingId, setSelectedMeetingId] = useState('');
    const [isMeetingDropdownOpen, setIsMeetingDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [roomsLoading, setRoomsLoading] = useState(true);
    const [logsLoading, setLogsLoading]   = useState(false);
    const [error, setError]               = useState(null);
    const [logsData, setLogsData]         = useState(null);

    const [searchInput, setSearchInput]       = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [directionFilter, setDirectionFilter] = useState('');
    const [statusFilter, setStatusFilter]     = useState('');
    const [sortOrder, setSortOrder]           = useState('desc');
    const [currentPage, setCurrentPage]       = useState(1);

    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [isSnapshotOpen, setIsSnapshotOpen]   = useState(false);

    const [selectedUser, setSelectedUser]         = useState(null);
    const [userDetail, setUserDetail]             = useState(null);
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen]   = useState(false);

    const [usersMap, setUsersMap] = useState({});
    const [collapsedGroups, setCollapsedGroups] = useState({});

    // auto-update date when page becomes visible again (e.g. left open overnight)
    const autoDateRef = useRef(getTodayVNString());
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) return;
            const today = getTodayVNString();
            const prevAuto = autoDateRef.current;
            if (today !== prevAuto) {
                autoDateRef.current = today;
                // only auto-advance if user hadn't manually changed the date
                setSelectedDate(prev => prev === prevAuto ? today : prev);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    // close meeting dropdown on outside click
    useEffect(() => {
        const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsMeetingDropdownOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // debounce search 400ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // reset page on filter change
    useEffect(() => { setCurrentPage(1); }, [selectedRoomId, selectedDate, selectedMeetingId, debouncedSearch]);

    // fetch rooms + usersMap once
    const fetchRoomsList = useCallback(async () => {
        setRoomsLoading(true); setError(null);
        try {
            const res = await getRooms({ page: 1, limit: 100 });
            if (res?.success && res.data) {
                const list = res.data.rooms || res.data || [];
                setRooms(list);
                if (list.length > 0) {
                    const first = list[0].id || list[0].roomId;
                    setSelectedRoomId(prev => prev || first);
                }
            } else throw new Error(res?.message || 'Không thể tải danh sách phòng họp.');
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Lỗi khi tải danh sách phòng họp.');
        } finally { setRoomsLoading(false); }
    }, []);

    useEffect(() => {
        fetchRoomsList();
        (async () => {
            try {
                const res = await getUsers({ limit: 1000 });
                if (res?.success && res.data) {
                    const map = {};
                    res.data.forEach(u => { map[u.id] = u; });
                    setUsersMap(map);
                }
            } catch (_) {}
        })();
    }, [fetchRoomsList]);

    // fetch meetings for room+date
    const fetchMeetings = useCallback(async () => {
        if (!selectedRoomId || !selectedDate) { setMeetings([]); setSelectedMeetingId(''); return; }
        try {
            const from = new Date(`${selectedDate}T00:00:00`).toISOString();
            const to   = new Date(`${selectedDate}T23:59:59`).toISOString();
            const res  = await getRoomBookings({ roomId: selectedRoomId, from, to, limit: 100, sortOrder: 'asc' });
            setMeetings(res?.success && res.data ? res.data : []);
        } catch (_) { setMeetings([]); }
        setSelectedMeetingId('');
    }, [selectedRoomId, selectedDate]);

    useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

    // fetch access logs
    const fetchLogs = useCallback(async (silent = false) => {
        if (!silent) setLogsLoading(true);
        setError(null);
        try {
            const firstRes = await getRoomAccessLog(selectedRoomId, selectedDate, {
                page: 1, limit: 100,
                search: debouncedSearch || undefined,
                meetingId: selectedMeetingId || undefined,
            });
            if (firstRes?.success && firstRes.data) {
                let allEvents = [...(firstRes.data.events || [])];
                const meta = firstRes.data;
                const pagination = meta.pagination || {};
                const totalItems = pagination.total ?? pagination.totalItems ?? pagination.totalEvents ?? meta.totalEvents ?? allEvents.length;
                const backendTotalPages = pagination.totalPages ?? Math.max(1, Math.ceil(totalItems / 100));
                if (backendTotalPages > 1) {
                    const results = await Promise.all(
                        Array.from({ length: backendTotalPages - 1 }, (_, i) =>
                            getRoomAccessLog(selectedRoomId, selectedDate, {
                                page: i + 2, limit: 100,
                                search: debouncedSearch || undefined,
                                meetingId: selectedMeetingId || undefined,
                            }).catch(() => null)
                        )
                    );
                    results.forEach(r => { if (r?.success && r.data?.events) allEvents = [...allEvents, ...r.data.events]; });
                }
                setLogsData({ ...meta, events: allEvents, totalEvents: allEvents.length, pagination: { ...pagination, total: allEvents.length } });
            } else throw new Error(firstRes?.message || 'Không thể tải nhật ký ra/vào.');
        } catch (err) {
            if (!selectedRoomId && (err?.error?.code === 'UNKNOWN_ERROR' || /không tồn tại|not found/i.test(err?.error?.message || ''))) {
                setError('Vui lòng chọn 1 phòng họp để xem nhật ký.');
            } else {
                setError(err?.error?.message || err?.message || 'Lỗi khi tải nhật ký ra/vào.');
            }
        } finally { if (!silent) setLogsLoading(false); }
    }, [selectedRoomId, selectedDate, debouncedSearch, selectedMeetingId]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // silent polling 1s
    useEffect(() => {
        const id = setInterval(() => fetchLogs(true), 1000);
        return () => clearInterval(id);
    }, [fetchLogs]);

    // user modal
    const handleUserClick = useCallback(async (ev) => {
        if (!ev.userId) return;
        const base = usersMap[ev.userId] || { fullName: ev.fullName, id: ev.userId };
        const ts = getEventTs(ev);
        setSelectedUser({ ...base, id: base.id || ev.userId, journeyDate: ts ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(ts)) : null }); setUserDetail(null); setIsUserModalOpen(true); setUserDetailLoading(true);
        try {
            const res = await getUserById(ev.userId);
            if (res?.success && res.data) setUserDetail(res.data);
        } catch (_) {}
        finally { setUserDetailLoading(false); }
    }, [usersMap]);

    const closeUserModal = () => { setIsUserModalOpen(false); setSelectedUser(null); setUserDetail(null); };

    // ── derived data ────────────────────────────────────────────────────────

    if (roomsLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
            <RotateCw className="w-8 h-8 text-action-blue animate-spin" />
            <p className="text-slate-blue text-sm font-semibold">Đang tải danh sách phòng họp...</p>
        </div>
    );

    const events        = logsData?.events || [];
    const matchedCount  = events.filter(ev => getIdentityStatus(ev) === 'matched').length;
    const unmatchedCount = events.filter(ev => getIdentityStatus(ev) === 'unmatched').length;
    const strangerCount = events.filter(ev => getIdentityStatus(ev) === 'stranger').length;

    const filteredEvents = events.filter(ev =>
        (!directionFilter || ev.direction === directionFilter) &&
        (!statusFilter || getIdentityStatus(ev) === statusFilter)
    );

    const allSorted = [...filteredEvents].sort((a, b) =>
        sortOrder === 'desc' ? getEventTs(b) - getEventTs(a) : getEventTs(a) - getEventTs(b)
    );

    // Phân trang theo nhóm (1 nhóm nhiều người = 1 dòng) để nhóm không bị cắt giữa 2 trang.
    const allGroups   = groupSimultaneous(allSorted);
    const multiGroupCount = allGroups.filter(g => g.events.length > 1).length;
    const totalItems  = allSorted.length;
    const totalGroups = allGroups.length;
    const totalPages  = Math.max(1, Math.ceil(totalGroups / LOGS_PER_PAGE));
    const rangeStart  = totalGroups === 0 ? 0 : (currentPage - 1) * LOGS_PER_PAGE + 1;
    const rangeEnd    = Math.min(currentPage * LOGS_PER_PAGE, totalGroups);
    const pageGroups  = allGroups.slice((currentPage - 1) * LOGS_PER_PAGE, currentPage * LOGS_PER_PAGE);
    const toggleGroup = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

    const showRoomColumn = !selectedRoomId;

    const renderEventRow = (ev, idx, nested = false) => {
        const status   = getIdentityStatus(ev);
        const { date, time } = formatVN(ev.eventTime || ev.timestamp);
        const name     = ev.fullName || 'Không nhận diện được';
        const rowCls   = status === 'stranger'
            ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500'
            : status === 'unmatched'
                ? 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-400'
                : 'hover:bg-cloud-mist/30';
        // Dòng con trong nhóm "nhiều người cùng lúc": nền nhạt + thụt lề, ẩn ngày/giờ (đã có ở dòng nhóm).
        const nestedCls = nested && status === 'matched' ? 'bg-slate-50/60' : '';

        const conf = (() => {
            let c = ev.similarity ?? ev.reliability ?? ev.confidence;
            if (c == null) return '—';
            if (c <= 1) c = c * 100;
            return `${c.toFixed(0)}%`;
        })();

        const meetingLabel = (() => {
            if (!ev.meetingId) return null;
            let t = ev.meetingTitle || ev.meetingName || ev.meeting_title || ev.meeting?.title;
            if (!t) { const m = meetings.find(x => (x.meetingId || x.meeting_id || x.id) === ev.meetingId); if (m) t = m.meeting?.title || m.title; }
            return t || ev.meetingId.substring(0, 8);
        })();

        return (
            <motion.tr key={ev.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.025, duration: 0.18 }}
                className={`transition-colors ${rowCls} ${nestedCls}`}
            >
                <td className="px-6 py-4 text-sm font-bold text-midnight-indigo whitespace-nowrap">{nested ? '' : date}</td>
                <td className="px-6 py-4 text-[11px] text-slate-blue whitespace-nowrap font-mono">{nested ? '' : time}</td>

                {/* Người */}
                <td className={nested ? 'pl-12 pr-6 py-3' : 'px-6 py-4'}>
                    <div
                        className={`flex items-center gap-3 w-fit ${ev.userId ? 'cursor-pointer group' : ''}`}
                        onClick={ev.userId ? () => handleUserClick(ev) : undefined}
                        title={ev.userId ? 'Xem chi tiết người dùng' : undefined}
                    >
                        <UserAvatar
                            user={ev.user || (ev.userId ? usersMap[ev.userId] : null)}
                            name={name}
                            className={`w-8 h-8 rounded-full border flex-shrink-0 text-[10px] font-bold shadow-sm transition-all ${
                                status === 'stranger' ? 'border-red-300' : status === 'unmatched' ? 'border-amber-300' : 'border-platinum-tint group-hover:border-action-blue'
                            }`}
                        />
                        <div>
                            <p className={`font-bold text-sm group-hover:text-action-blue transition-colors ${status === 'stranger' ? 'text-red-700' : status === 'unmatched' ? 'text-amber-700' : 'text-midnight-indigo'}`}>
                                {name}
                            </p>
                        </div>
                    </div>
                </td>

                {showRoomColumn && <td className="px-6 py-4 text-xs font-semibold text-slate-700">{ev.roomName || '—'}</td>}

                <td className="px-6 py-4 text-center"><DirectionBadge direction={ev.direction} /></td>
                <td className="px-6 py-4 text-center"><StatusBadge status={status} /></td>

                <td className="px-6 py-4 text-center">
                    <ThumbnailImage eventId={ev.id} onClick={() => { setSnapshotEventId(ev.id); setIsSnapshotOpen(true); }} />
                </td>

                <td className="px-6 py-4 text-center font-mono text-xs font-bold text-slate-500">{conf}</td>

                <td className="px-6 py-4 text-xs">
                    {meetingLabel
                        ? <span className="text-midnight-indigo font-semibold">{meetingLabel}</span>
                        : <span className="text-slate-300">—</span>
                    }
                </td>
            </motion.tr>
        );
    };

    const renderGroup = (g, gIdx) => {
        if (g.events.length === 1) return [renderEventRow(g.events[0], gIdx)];
        const head = g.events[0];
        const { date, time } = formatVN(head.eventTime || head.timestamp);
        const hasStranger  = g.events.some(ev => getIdentityStatus(ev) === 'stranger');
        const hasUnmatched = g.events.some(ev => getIdentityStatus(ev) === 'unmatched');
        const collapsed = !!collapsedGroups[g.key];
        const headerRow = (
            <motion.tr key={`grp-${g.key}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gIdx * 0.025, duration: 0.18 }}
                onClick={() => toggleGroup(g.key)}
                className={`cursor-pointer transition-colors border-l-4 ${hasStranger ? 'bg-amber-50 hover:bg-amber-100 border-l-amber-500' : 'bg-blue-50/50 hover:bg-blue-50 border-l-action-blue'}`}
            >
                <td className="px-6 py-4 text-sm font-bold text-midnight-indigo whitespace-nowrap">{date}</td>
                <td className="px-6 py-4 text-[11px] text-slate-blue whitespace-nowrap font-mono">{time}</td>
                <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            {g.events.slice(0, 3).map(ev => (
                                <UserAvatar key={ev.id}
                                    user={ev.user || (ev.userId ? usersMap[ev.userId] : null)}
                                    name={ev.fullName || '?'}
                                    className="w-7 h-7 rounded-full border-2 border-white text-[9px] font-bold shadow-sm" />
                            ))}
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-action-blue">
                            <Users className="w-4 h-4" /> {g.events.length} người cùng lúc
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-blue transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    </div>
                </td>
                {showRoomColumn && <td className="px-6 py-4 text-xs font-semibold text-slate-700">{head.roomName || '—'}</td>}
                <td className="px-6 py-4 text-center"><DirectionBadge direction={head.direction} /></td>
                <td className="px-6 py-4 text-center">
                    {hasStranger
                        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-red-700 bg-red-50 border-red-200"><AlertTriangle className="w-3 h-3" />Có người lạ</span>
                        : hasUnmatched
                            ? <StatusBadge status="unmatched" />
                            : <StatusBadge status="matched" />}
                </td>
                <td className="px-6 py-4 text-center text-slate-300">—</td>
                <td className="px-6 py-4 text-center text-slate-300">—</td>
                <td className="px-6 py-4 text-xs text-slate-400">Bấm để {collapsed ? 'mở' : 'thu gọn'}</td>
            </motion.tr>
        );
        return collapsed ? [headerRow] : [headerRow, ...g.events.map((ev, i) => renderEventRow(ev, gIdx + i, true))];
    };

    // ── render ──────────────────────────────────────────────────────────────

    return (
        <div className="max-w-[1440px] mx-auto space-y-6 pb-10">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue">
                            <DoorOpen className="w-3.5 h-3.5" /> Phòng họp
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600">
                            <ShieldAlert className="w-3.5 h-3.5" /> An ninh
                        </span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Kiểm soát ra vào cổng</h1>
                    <p className="text-slate-blue text-sm mt-1">Đối soát an ninh ra/vào dựa trên camera AI nhận diện khuôn mặt (IVSS)</p>
                </div>
                <div className="self-start flex flex-col items-end gap-1">
                    <button
                        onClick={() => fetchLogs()}
                        disabled={logsLoading}
                        className="flex items-center gap-2 px-4 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo rounded-xl hover:bg-cloud-mist transition-colors text-sm font-semibold disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} /> Làm mới
                    </button>
                    <span className="text-[10px] text-slate-400">Tự động cập nhật mỗi 1s</span>
                </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Clock}         label="Tổng lượt ra/vào"      value={totalItems}     sub="Ghi nhận qua camera AI"          colorCls="bg-blue-50 text-action-blue" />
                <StatCard icon={ShieldCheck}   label="Lượt hợp lệ"           value={matchedCount}   sub="Đúng người, đúng bối cảnh"       colorCls="bg-emerald-50 text-emerald-600" />
                <StatCard icon={ShieldQuestion} label="Chưa khớp bối cảnh"   value={unmatchedCount} sub="Người quen, sai phòng/giờ"       colorCls={unmatchedCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-cloud-mist text-slate-400'} alert={false} />
                <StatCard icon={AlertTriangle} label="Người lạ"              value={strangerCount}  sub={strangerCount > 0 ? 'Cảnh báo bảo mật!' : 'Không có bất thường'} colorCls={strangerCount > 0 ? 'bg-red-100 text-red-600' : 'bg-cloud-mist text-slate-400'} alert={strangerCount > 0} />
            </div>

            {/* ── Error ── */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="font-semibold">{error}</span>
                        </div>
                        <button onClick={() => fetchLogs()} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex-shrink-0">Thử lại</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Filter panel ── */}
            <div className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-sm font-extrabold text-midnight-indigo">
                    <Filter className="w-4 h-4 text-slate-blue" /> Bộ lọc
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Room */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Phòng họp</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <select
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo font-semibold appearance-none focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                            >
                                {rooms.map((r, i) => (
                                    <option key={r.id || r.roomId || i} value={r.id || r.roomId}>
                                        {r.roomName || r.room_name}{r.siteName || r.site_name ? ` (${r.siteName || r.site_name})` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                        </div>
                    </div>

                    {/* Date */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Ngày giám sát</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-cloud-mist border border-platinum-tint rounded-xl text-sm text-midnight-indigo font-semibold focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Meeting */}
                    <div className="space-y-1.5" ref={dropdownRef}>
                        <label className="text-xs font-bold text-slate-blue uppercase tracking-wider block">Ca họp</label>
                        <div className="relative">
                            <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${!selectedRoomId || meetings.length === 0 ? 'text-slate-400' : 'text-action-blue'}`} />
                            <button
                                type="button"
                                onClick={() => setIsMeetingDropdownOpen(v => !v)}
                                disabled={!selectedRoomId || meetings.length === 0}
                                className={`w-full pl-9 pr-8 py-2.5 border rounded-xl text-sm text-left font-semibold outline-none transition-all ${
                                    !selectedRoomId || meetings.length === 0
                                        ? 'bg-slate-50 border-platinum-tint text-slate-400 cursor-not-allowed'
                                        : isMeetingDropdownOpen
                                            ? 'bg-white border-action-blue ring-2 ring-action-blue/20 text-midnight-indigo'
                                            : 'bg-cloud-mist hover:bg-white border-platinum-tint text-midnight-indigo'
                                }`}
                            >
                                <span className="truncate block">
                                    {selectedMeetingId === '' ? 'Toàn bộ ngày' : (() => {
                                        const m = meetings.find(x => (x.meetingId || x.meeting_id || x.id) === selectedMeetingId);
                                        if (!m) return 'Toàn bộ ngày';
                                        const s = formatVNFull(m.reservedStartTime || m.reserved_start_time).split(' ')[0].slice(0, 5);
                                        const e = formatVNFull(m.reservedEndTime || m.reserved_end_time).split(' ')[0].slice(0, 5);
                                        return `${s} – ${e} | ${m.meeting?.title || m.title || 'Ca họp'}`;
                                    })()}
                                </span>
                            </button>
                            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none transition-transform ${isMeetingDropdownOpen ? 'rotate-180' : ''}`} />

                            {isMeetingDropdownOpen && (
                                <div className="absolute z-50 w-full mt-1.5 bg-white border border-platinum-tint rounded-xl shadow-lg overflow-hidden">
                                    <div className="max-h-60 overflow-y-auto py-1">
                                        <button type="button" onClick={() => { setSelectedMeetingId(''); setIsMeetingDropdownOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-blue-50 transition-colors flex items-center gap-2 ${selectedMeetingId === '' ? 'bg-blue-50 text-action-blue' : 'text-midnight-indigo'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${selectedMeetingId === '' ? 'bg-action-blue' : 'bg-transparent'}`} />
                                            Toàn bộ ngày
                                        </button>
                                        {meetings.map(m => {
                                            const tid  = m.meetingId || m.meeting_id || m.id;
                                            const sel  = selectedMeetingId === tid;
                                            const s    = formatVNFull(m.reservedStartTime || m.reserved_start_time).split(' ')[0].slice(0, 5);
                                            const e    = formatVNFull(m.reservedEndTime || m.reserved_end_time).split(' ')[0].slice(0, 5);
                                            const title = m.meeting?.title || m.title || 'Ca họp';
                                            return (
                                                <button key={m.id} type="button"
                                                    onClick={() => { setSelectedMeetingId(tid); setIsMeetingDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-start gap-2 border-t border-slate-50 ${sel ? 'bg-blue-50/80' : ''}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${sel ? 'bg-action-blue' : 'bg-slate-300'}`} />
                                                    <div>
                                                        <p className={`text-[11px] font-bold ${sel ? 'text-action-blue' : 'text-slate-700'}`}>{s} – {e}</p>
                                                        <p className="text-[10px] text-slate-500 truncate">{title}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Log table ── */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">

                {/* sub-filter bar */}
                <div className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-col md:flex-row items-center gap-3">
                    {/* search */}
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Tìm theo tên người dùng..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-platinum-tint rounded-xl text-sm text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none transition-all"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        {/* direction */}
                        <div className="relative">
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-blue pointer-events-none" />
                            <select value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setCurrentPage(1); }}
                                className="appearance-none pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none">
                                <option value="">Tất cả hướng</option>
                                <option value="enter">Vào cửa</option>
                                <option value="leave">Ra cửa</option>
                                <option value="seen">Thấy</option>
                            </select>
                        </div>

                        {/* status */}
                        <div className="relative">
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-blue pointer-events-none" />
                            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="appearance-none pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none">
                                <option value="">Tất cả trạng thái</option>
                                <option value="matched">Khớp</option>
                                <option value="unmatched">Chưa khớp bối cảnh</option>
                                <option value="stranger">Người lạ</option>
                            </select>
                        </div>

                        {/* sort */}
                        <button onClick={() => setSortOrder(v => v === 'desc' ? 'asc' : 'desc')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo hover:bg-cloud-mist transition-colors font-semibold">
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-blue" />
                            {sortOrder === 'desc' ? 'Mới nhất trước ↓' : 'Cũ nhất trước ↑'}
                        </button>
                    </div>
                </div>

                {/* table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Ngày</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Giờ</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Người</th>
                                {showRoomColumn && <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Phòng họp</th>}
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Hướng</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Ảnh</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Độ tin cậy</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Cuộc họp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-platinum-tint">
                            {logsLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-16" /></td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                                                <div className="h-3.5 bg-gray-200 rounded w-28" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-14 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-8 w-8 bg-gray-200 rounded mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-3.5 bg-gray-200 rounded w-12 mx-auto" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
                                    </tr>
                                ))
                            ) : pageGroups.length === 0 ? (
                                <tr>
                                    <td colSpan={showRoomColumn ? 9 : 8} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-2xl bg-cloud-mist flex items-center justify-center">
                                                <Users className="w-7 h-7 text-slate-blue" />
                                            </div>
                                            <p className="font-bold text-midnight-indigo">Không có dữ liệu nhật ký</p>
                                            <p className="text-xs text-slate-blue">Không ghi nhận sự kiện nào trong ngày đã chọn hoặc bộ lọc quá hẹp.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {pageGroups.flatMap((g, gIdx) => renderGroup(g, gIdx))}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!logsLoading && totalItems > 0 && (
                    <div className="px-6 py-4 bg-cloud-mist/30 border-t border-platinum-tint flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-blue">
                            {rangeStart}–{rangeEnd} / {totalGroups} dòng · {totalItems} lượt nhật ký{multiGroupCount > 0 ? ` · ${multiGroupCount} nhóm nhiều người` : ''}
                        </span>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                    className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-bold hover:bg-cloud-mist disabled:opacity-40 transition-colors">Trước</button>
                                {getPageNumbers(currentPage, totalPages).map((p, i) =>
                                    p === '…' ? (
                                        <span key={`d${i}`} className="px-1 text-xs text-slate-400">…</span>
                                    ) : (
                                        <button key={p} onClick={() => setCurrentPage(p)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${currentPage === p ? 'bg-action-blue text-white border-action-blue' : 'border-platinum-tint hover:bg-cloud-mist text-slate-blue'}`}>
                                            {p}
                                        </button>
                                    )
                                )}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 border border-platinum-tint rounded-lg text-xs font-bold hover:bg-cloud-mist disabled:opacity-40 transition-colors">Sau</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Snapshot modal */}
            <EventSnapshotModal isOpen={isSnapshotOpen} onClose={() => setIsSnapshotOpen(false)} eventId={snapshotEventId} />

            {/* User detail modal */}
            {isUserModalOpen && selectedUser && createPortal(
                <AnimatePresence>
                    <motion.div key="user-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/60 backdrop-blur-md"
                        onClick={closeUserModal}>
                        <motion.div key="user-modal" initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-platinum-tint bg-cloud-mist">
                                <h3 className="text-base font-extrabold text-midnight-indigo">Thông tin người dùng</h3>
                                <button onClick={closeUserModal} className="p-1.5 rounded-lg text-slate-400 hover:text-midnight-indigo hover:bg-slate-200 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {(() => {
                                const d    = userDetail || selectedUser;
                                const name = d.fullName || d.full_name || 'Không có tên';
                                const email = d.email || 'Chưa cập nhật';
                                const phone = d.phoneNumber || d.phone_number || d.phone || 'Chưa cập nhật';
                                const dept  = d.department?.departmentName || d.department || d.departmentName || 'Chưa cập nhật';
                                const code  = d.employeeCode || d.employee_code;
                                return (
                                    <div className="p-6 overflow-y-auto">
                                        <div className="flex flex-col items-center mb-6">
                                            {userDetailLoading ? (
                                                <div className="w-24 h-24 rounded-full border-4 border-cloud-mist bg-slate-100 flex items-center justify-center mb-4">
                                                    <div className="w-8 h-8 border-4 border-action-blue/20 border-t-action-blue rounded-full animate-spin" />
                                                </div>
                                            ) : (
                                                <UserAvatar user={userDetail || selectedUser} name={name}
                                                    className="w-24 h-24 rounded-full text-3xl mb-4 border-4 border-cloud-mist shadow-sm" />
                                            )}
                                            <h4 className="text-xl font-extrabold text-midnight-indigo text-center">{name}</h4>
                                            {code && <span className="mt-1.5 text-[11px] font-mono text-slate-blue bg-cloud-mist px-2.5 py-0.5 rounded-full border border-platinum-tint">{code}</span>}
                                        </div>
                                        <div className="space-y-3">
                                            {[
                                                { icon: Briefcase, label: 'Phòng ban',     value: dept },
                                                { icon: Mail,      label: 'Email',          value: email },
                                                { icon: Phone,     label: 'Số điện thoại', value: phone },
                                            ].map(({ icon: Icon, label, value }) => (
                                                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm flex-shrink-0">
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-semibold text-slate-blue">{label}</p>
                                                        <p className="text-sm font-bold text-midnight-indigo truncate">{value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Link
                                            to={`/system-admin/user-journey?userId=${selectedUser.id}${selectedUser.journeyDate ? `&date=${selectedUser.journeyDate}` : ''}`}
                                            className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-action-blue hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                                            <Route className="w-4 h-4" /> Xem hành trình ngày này
                                        </Link>
                                    </div>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default RoomAccessLogs;
