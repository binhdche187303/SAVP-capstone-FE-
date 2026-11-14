import ResponsiveTable from '../../components/common/ResponsiveTable';
import StatisticGrid from '../../components/common/StatisticGrid';
import ReportActions from '../../components/common/ReportActions';
import StatisticCard, { statisticTone } from '../../components/common/StatisticCard';
import FilterBar from '../../components/common/FilterBar';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { AlertTriangle, ArrowUpDown, Briefcase, Building, Calendar, Clock, DoorOpen, Eye, Filter, Camera, LogIn, LogOut, Mail, Phone, RotateCw, Route, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Users, X, ChevronDown } from 'lucide-react';
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
import { downloadReport, currentUserName, fmtVN, toDate } from '../../utils/exportExcel';
import ExportMenu from '../../components/report/ExportMenu';
import toast from '../../utils/toast';

// ─── constants ──────────────────────────────────────────────────────────────


// Các lượt cùng phòng + cùng hướng cách nhau ≤ 3s = camera bắt được nhiều người trong cùng khung hình.
const GROUP_WINDOW_MS = 3000;

// Họp 20/10: mọi log camera phải nói rõ camera nào / khu vực nào / nhóm nào.
const cameraLabel = (ev) => ev.deviceName || ev.deviceCode || null;
const cameraGroupsLabel = (ev) => (Array.isArray(ev.groupNames) && ev.groupNames.length ? ev.groupNames.join(', ') : '');

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



const getBookingMeetingId = (booking) =>
    booking?.meetingId || booking?.meeting_id || booking?.meeting?.id || booking?.id || '';

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');

const getSelectedRoomInfo = (rooms, selectedRoomId) => {
    const room = rooms.find(r => (r.id || r.roomId) === selectedRoomId);
    return {
        id: selectedRoomId,
        name: room?.roomName || room?.room_name || 'Phòng họp đang chọn',
    };
};

// ─── StatCard ────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, sub, colorCls, alert }) => (
    <StatisticCard icon={icon} label={label} value={value} helper={sub} tone={alert ? 'danger' : statisticTone(colorCls)} />
);

// ─── DirectionBadge ──────────────────────────────────────────────────────────

const DirectionBadge = ({ direction }) => {
    if (direction === 'enter')
        return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><LogIn className="w-3 h-3" />Vào</span>;
    if (direction === 'leave')
        return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-700 bg-amber-50 border-amber-200"><LogOut className="w-3 h-3" />Ra</span>;
    return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-slate-600 bg-slate-50 border-slate-200"><Eye className="w-3 h-3" />Thấy</span>;
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
    if (status === 'stranger')
        return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-red-700 bg-red-50 border-red-200"><AlertTriangle className="w-3 h-3" />Người lạ</span>;
    if (status === 'unmatched')
        return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-700 bg-amber-50 border-amber-200"><ShieldQuestion className="w-3 h-3" />Chưa khớp</span>;
    return <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><ShieldCheck className="w-3 h-3" />Khớp</span>;
};

// ─── main component ───────────────────────────────────────────────────────────

const RoomAccessLogs = () => {
    const [LOGS_PER_PAGE, setLogsPerPage] = useState(10);
    const [rooms, setRooms]                     = useState([]);
    const [selectedRoomId, setSelectedRoomId]   = useState('');
    const [busyFormat, setBusyFormat]           = useState(null);
    const [selectedDate, setSelectedDate]       = useState(getTodayVNString());
    const [meetings, setMeetings]               = useState([]);
    const [selectedMeetingId, setSelectedMeetingId] = useState('');
    const [isMeetingDropdownOpen, setIsMeetingDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [roomsLoading, setRoomsLoading] = useState(true);
    const [logsLoading, setLogsLoading]   = useState(false);
    const [error, setError]               = useState(null);
    const [roomsError, setRoomsError] = useState(null);
    const [meetingsError, setMeetingsError] = useState(null);
    const [logsData, setLogsData]         = useState(null);

    const [searchInput, setSearchInput]       = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [directionFilter, setDirectionFilter] = useState('');
    const [statusFilter, setStatusFilter]     = useState('');
    const [sortOrder, setSortOrder]           = useState('desc');
    const [currentPage, setCurrentPage]       = useState(1);

    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [snapshotUrl, setSnapshotUrl] = useState(null);
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

    // Read room and user data from the server; an empty response stays empty.
    const fetchRoomsList = useCallback(async () => {
        setRoomsLoading(true); setRoomsError(null);
        try {
            const res = await getRooms({ page: 1, limit: 100 });
            if (!res?.success) throw new Error(res?.message || 'Không thể tải danh sách phòng họp.');
            const data = res.data;
            const list = Array.isArray(data) ? data : data?.rooms || data?.items || [];
            setRooms(list);
            setSelectedRoomId(previous => list.some(room => (room.id || room.roomId) === previous) ? previous : list[0]?.id || list[0]?.roomId || '');
        } catch (err) {
            setRooms([]); setSelectedRoomId('');
            setRoomsError(err?.message || 'Không tải được danh sách phòng họp.');
        } finally { setRoomsLoading(false); }
    }, []);

    useEffect(() => {
        fetchRoomsList();
        getUsers({ limit: 1000 }).then(res => {
            const users = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
            setUsersMap(Object.fromEntries(users.map(user => [user.id, user])));
        }).catch(() => setUsersMap({}));
    }, [fetchRoomsList]);

    const fetchMeetings = useCallback(async () => {
        setMeetingsError(null);
        if (!selectedRoomId || !selectedDate) { setMeetings([]); setSelectedMeetingId(''); return; }
        try {
            const from = `${selectedDate}T00:00:00.000+07:00`;
            const to = `${selectedDate}T23:59:59.999+07:00`;
            const res = await getRoomBookings({ roomId: selectedRoomId, from, to, limit: 100, sortOrder: 'asc' });
            if (!res?.success) throw new Error(res?.message || 'Không tải được lịch phòng họp.');
            setMeetings(Array.isArray(res.data) ? res.data : res.data?.items || res.data?.bookings || []);
        } catch (err) {
            setMeetings([]);
            setMeetingsError(err?.message || 'Không tải được lịch phòng họp.');
        }
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
                    results.forEach(r => { if (!r?.success || !Array.isArray(r.data?.events)) throw new Error('Chưa tải đủ nhật ký. Vui lòng thử lại.'); allEvents = [...allEvents, ...r.data.events]; });
                }
                setLogsData({ ...meta, events: allEvents, totalEvents: allEvents.length, pagination: { ...pagination, total: allEvents.length } });
            } else throw new Error(firstRes?.message || 'Không thể tải nhật ký ra/vào.');
        } catch (err) {
            setLogsData(null);
            setError(err?.message || 'Không tải được nhật ký ra/vào phòng.');
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
            if (!isUuid(ev.userId)) return;
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


    const pageGroups  = allGroups.slice((currentPage - 1) * LOGS_PER_PAGE, currentPage * LOGS_PER_PAGE);
    const toggleGroup = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

    const showRoomColumn = !selectedRoomId;

    // Xuất đúng những gì đang lọc (ngày/phòng/hướng/trạng thái/cuộc họp/tìm kiếm), kèm tổng hợp theo người.
    const handleExport = async (format, extra = {}) => {
        if (allSorted.length === 0) {
            toast.error('Chưa có dữ liệu để xuất.');
            return;
        }
        setBusyFormat(format);
        try {
            const roomName = logsData?.roomName || getSelectedRoomInfo(rooms, selectedRoomId)?.name || 'Tất cả phòng';
            const statusLabel = { matched: 'Đã nhận diện', unmatched: 'Chưa khớp lịch/vị trí', stranger: 'Người lạ' };
            const dirLabel = (d) => (d === 'enter' ? 'Vào' : d === 'leave' ? 'Ra' : d || '');
            const meetingTitleOf = (ev) => {
                if (!ev.meetingId) return '';
                let t = ev.meetingTitle || ev.meetingName || ev.meeting_title || ev.meeting?.title;
                if (!t) {
                    const m = meetings.find((x) => (x.meetingId || x.meeting_id || x.id) === ev.meetingId);
                    if (m) t = m.meeting?.title || m.title;
                }
                return t || '';
            };
            const pctOf = (ev) => {
                const raw = ev.similarity ?? ev.reliability ?? ev.confidence;
                if (raw == null) return '';
                return Math.round((raw <= 1 ? raw * 100 : raw));
            };
            const tsOf = (ev) => toDate(ev.eventTime || ev.timestamp);
            // Thứ tự thời gian tăng dần cho sheet chi tiết & tính lần vào đầu/ra cuối.
            const chrono = [...allSorted].sort((x, y) => getEventTs(x) - getEventTs(y));

            const detail = chrono.map((ev, i) => ({
                stt: i + 1,
                time: tsOf(ev),
                person: ev.fullName || 'Không nhận diện được',
                email: ev.user?.email || '',
                dept: ev.user?.department || '',
                room: ev.roomName || roomName,
                dir: dirLabel(ev.direction),
                status: statusLabel[getIdentityStatus(ev)] || '',
                pct: pctOf(ev),
                meeting: meetingTitleOf(ev),
                camera: cameraLabel(ev) || '',
                code: ev.deviceCode || '',
                zone: ev.zoneName || '',
                group: cameraGroupsLabel(ev),
                id: ev.id || '',
            }));

            const byPerson = new Map();
            chrono.forEach((ev) => {
                const key = ev.userId || `unknown:${ev.fullName || ''}`;
                const cur = byPerson.get(key) || {
                    person: ev.fullName || 'Không nhận diện được', email: ev.user?.email || '', dept: ev.user?.department || '',
                    status: statusLabel[getIdentityStatus(ev)] || '', enters: 0, leaves: 0, seen: 0, first: null, last: null, lastDir: '', cams: new Set(),
                };
                if (ev.direction === 'enter') cur.enters += 1;
                else if (ev.direction === 'leave') cur.leaves += 1;
                else cur.seen += 1;
                const t = tsOf(ev);
                if (t && !cur.first) cur.first = t;
                if (t) cur.last = t;
                if (ev.direction === 'enter' || ev.direction === 'leave') cur.lastDir = ev.direction;
                const cam = cameraLabel(ev);
                if (cam) cur.cams.add(cam);
                byPerson.set(key, cur);
            });
            const people = [...byPerson.values()].sort((x, y) => (y.enters + y.leaves + y.seen) - (x.enters + x.leaves + x.seen));
            const stillIn = people.filter((p) => p.lastDir === 'enter').length;
            const summary = people.map((p, i) => ({
                stt: i + 1,
                person: p.person,
                email: p.email,
                dept: p.dept,
                status: p.status,
                enters: p.enters,
                leaves: p.leaves,
                seen: p.seen,
                first: p.first,
                last: p.last,
                state: p.lastDir === 'enter' ? 'Có thể còn trong phòng' : p.lastDir === 'leave' ? 'Đã ra' : 'Chưa xác định',
                cams: [...p.cams].join(', '),
            }));

            const exportedAt = new Date();
            const filters = [
                directionFilter && `Hướng: ${dirLabel(directionFilter)}`,
                statusFilter && `Trạng thái: ${statusLabel[statusFilter] || statusFilter}`,
                debouncedSearch && `Tìm tên: “${debouncedSearch}”`,
                selectedMeetingId && `Cuộc họp: ${meetingTitleOf({ meetingId: selectedMeetingId }) || selectedMeetingId}`,
            ].filter(Boolean);
            const count = (st) => allSorted.filter((e) => getIdentityStatus(e) === st).length;

            await downloadReport({
                format,
                standard: extra,
                period: { from: selectedDate, to: selectedDate },
                docTitle: `Nhật ký ra/vào phòng ${roomName}`,
                dataSource: 'Hệ thống VISMA — camera nhận diện khuôn mặt tại cửa phòng',
                fileName: `Nhat-ky-ra-vao-phong_${String(roomName).replace(/\s+/g, '-')}_${selectedDate}`,
                title: 'NHẬT KÝ RA/VÀO PHÒNG',
                subtitle: 'Đối soát an ninh dựa trên camera nhận diện khuôn mặt',
                info: [
                    { section: 'Phạm vi báo cáo' },
                    ['Phòng', roomName],
                    ['Ngày', selectedDate.split('-').reverse().join('/')],
                    ['Bộ lọc đang áp dụng', filters.length ? filters.join(' · ') : 'Không (toàn bộ lượt trong ngày)'],
                    { section: 'Kết quả tổng hợp' },
                    ['Tổng lượt ghi nhận', allSorted.length],
                    ['Lượt vào', allSorted.filter((e) => e.direction === 'enter').length],
                    ['Lượt ra', allSorted.filter((e) => e.direction === 'leave').length],
                    ['Đã nhận diện', count('matched')],
                    ['Chưa khớp lịch/vị trí', count('unmatched')],
                    ['Người lạ (không nhận diện được)', count('stranger')],
                    ['Số người khác nhau', people.length],
                    ['Người có thể chưa ra khỏi phòng', stillIn, stillIn > 0 ? { fill: 'FEF3C7', color: 'B45309' } : undefined],
                    { section: 'Thông tin xuất' },
                    ['Người xuất', currentUserName()],
                    ['Thời điểm xuất', fmtVN(exportedAt)],
                    { section: 'Ghi chú' },
                    ['Camera / Khu vực / Nhóm camera', 'Cho biết lượt ghi nhận do camera nào, thuộc khu vực và nhóm camera nào chụp được'],
                    ['Có thể còn trong phòng', 'Lượt vào/ra cuối cùng của người đó trong ngày là “Vào”'],
                    ['Độ tin cậy', 'Độ giống khuôn mặt do AI trả về (%)'],
                ],
                sheets: [
                    {
                        name: 'Tổng hợp theo người',
                        freezeCols: 2,
                        columns: [
                            { header: 'STT', key: 'stt', width: 6, align: 'center' },
                            { header: 'Người', key: 'person', width: 26 },
                            { header: 'Email', key: 'email', width: 28 },
                            { header: 'Phòng ban', key: 'dept', width: 22 },
                            { header: 'Trạng thái nhận diện', key: 'status', width: 22 },
                            { header: 'Số lượt vào', key: 'enters', width: 12 },
                            { header: 'Số lượt ra', key: 'leaves', width: 12 },
                            { header: 'Quan sát thấy', key: 'seen', width: 13 },
                            { header: 'Lần đầu ghi nhận', key: 'first', width: 20 },
                            { header: 'Lần cuối ghi nhận', key: 'last', width: 20 },
                            { header: 'Tình trạng cuối ngày', key: 'state', width: 26 },
                            { header: 'Camera đã ghi nhận', key: 'cams', width: 40, wrap: true },
                        ],
                        rows: summary,
                        cellStyle: (row, key) => (key === 'state' && row.state.startsWith('Có thể') ? { fill: 'FEF3C7', color: 'B45309', bold: true } : undefined),
                    },
                    {
                        name: 'Chi tiết lượt ra vào',
                        freezeCols: 3,
                        columns: [
                            { header: 'STT', key: 'stt', width: 6, align: 'center' },
                            { header: 'Thời gian', key: 'time', width: 20 },
                            { header: 'Người', key: 'person', width: 26 },
                            { header: 'Email', key: 'email', width: 28 },
                            { header: 'Phòng ban', key: 'dept', width: 22 },
                            { header: 'Phòng', key: 'room', width: 20 },
                            { header: 'Hướng', key: 'dir', width: 9, align: 'center' },
                            { header: 'Trạng thái nhận diện', key: 'status', width: 22 },
                            { header: 'Độ tin cậy (%)', key: 'pct', width: 14, align: 'center' },
                            { header: 'Cuộc họp', key: 'meeting', width: 30 },
                            { header: 'Camera', key: 'camera', width: 26 },
                            { header: 'Mã camera', key: 'code', width: 18 },
                            { header: 'Khu vực', key: 'zone', width: 20 },
                            { header: 'Nhóm camera', key: 'group', width: 24 },
                            { header: 'Mã sự kiện (đối chiếu ảnh)', key: 'id', width: 38, standard: false },
                        ],
                        rows: detail,
                        cellStyle: (row, key) => {
                            if (key === 'status' && row.status === 'Người lạ') return { fill: 'FEE2E2', color: 'B91C1C', bold: true };
                            if (key === 'status' && row.status.startsWith('Chưa khớp')) return { fill: 'FEF3C7', color: 'B45309' };
                            if (key === 'dir') return { fill: row.dir === 'Vào' ? 'DCFCE7' : row.dir === 'Ra' ? 'DBEAFE' : undefined };
                            return undefined;
                        },
                    },
                ],
            });
            toast.success(extra.mode === 'standard' ? `Đã tải bản quy chuẩn (${format.toUpperCase()}).` : format === 'pdf' ? 'Đã mở bản in — chọn “Lưu thành PDF”.' : `Đã xuất ${detail.length} lượt ra/vào (${({ xlsx: 'Excel', pdf: 'PDF', docx: 'Word' })[format]}).`);
        } catch (err) {
            return { success: false, message: err?.message || 'Không xuất được báo cáo.' };
        } finally {
            setBusyFormat(null);
        }
    };

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
                <td data-ui-text="secondary" className="px-6 py-4 text-[11px] text-slate-blue whitespace-nowrap font-mono">{nested ? '' : time}</td>

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
                            <p data-room-access-person className={`font-bold text-sm group-hover:text-action-blue transition-colors ${status === 'stranger' ? 'text-red-700' : status === 'unmatched' ? 'text-amber-700' : 'text-midnight-indigo'}`}>
                                {name}
                            </p>
                        </div>
                    </div>
                </td>

                {showRoomColumn && <td className="px-6 py-4 text-xs font-semibold text-slate-700">{ev.roomName || '—'}</td>}

                <td className="px-6 py-4 text-center"><DirectionBadge direction={ev.direction} /></td>
                <td className="px-6 py-4 text-center"><StatusBadge status={status} /></td>

                <td className="px-6 py-4 text-center">
                    {ev.snapshotUrl ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSnapshotEventId(ev.id);
                                setSnapshotUrl(ev.snapshotUrl);
                                setIsSnapshotOpen(true);
                            }}
                            className="inline-flex items-center justify-center rounded-lg overflow-hidden border border-slate-200 hover:border-action-blue transition-colors bg-slate-100 flex-shrink-0 w-32 md:w-40 aspect-video"
                            title="Xem ảnh hiện trường (phóng to)"
                        >
                            <img src={ev.snapshotUrl} alt="Ảnh quét phòng" className="w-full h-full object-contain" />
                        </button>
                    ) : (
                        <ThumbnailImage
                            eventId={ev.id}
                            onClick={() => {
                                setSnapshotEventId(ev.id);
                                setSnapshotUrl(null);
                                setIsSnapshotOpen(true);
                            }}
                        />
                    )}
                </td>

                <td className="px-6 py-4 text-xs min-w-[14rem]" title={cameraGroupsLabel(ev) ? `Nhóm: ${cameraGroupsLabel(ev)}` : undefined}>
                    {cameraLabel(ev) ? (
                        <>
                            <span className="inline-flex items-center gap-1 font-semibold text-midnight-indigo"><Camera className="w-3 h-3 text-slate-400" />{cameraLabel(ev)}</span>
                            {(ev.zoneName || cameraGroupsLabel(ev)) && (
                                <span data-ui-text="secondary" className="block text-[10px] text-slate-400">{[ev.zoneName, cameraGroupsLabel(ev)].filter(Boolean).join(' · ')}</span>
                            )}
                        </>
                    ) : <span className="text-slate-300">—</span>}
                </td>
                <td data-ui-text="secondary" className="px-6 py-4 text-center font-mono text-xs font-bold text-slate-500">{conf}</td>

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
                <td data-ui-text="secondary" className="px-6 py-4 text-[11px] text-slate-blue whitespace-nowrap font-mono">{time}</td>
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
                        ? <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold text-red-700 bg-red-50 border-red-200"><AlertTriangle className="w-3 h-3" />Có người lạ</span>
                        : hasUnmatched
                            ? <StatusBadge status="unmatched" />
                            : <StatusBadge status="matched" />}
                </td>
                <td className="px-6 py-4 text-center text-slate-300">—</td>
                <td className="px-6 py-4 text-center text-slate-300">—</td>
                <td className="px-6 py-4 text-center text-slate-300">—</td>
                <td className="px-6 py-4 text-xs text-slate-400">Bấm để {collapsed ? 'mở' : 'thu gọn'}</td>
            </motion.tr>
        );
        return collapsed ? [headerRow] : [headerRow, ...g.events.map((ev, i) => renderEventRow(ev, gIdx + i, true))];
    };

    // ── render ──────────────────────────────────────────────────────────────

    return (
        <div data-page-surface="wide" className="max-w-[1440px] mx-auto space-y-6 pb-10">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue">
                            <DoorOpen className="w-3.5 h-3.5" /> Phòng họp
                        </span>
                        <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600">
                            <ShieldAlert className="w-3.5 h-3.5" /> An ninh
                        </span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight-indigo tracking-tight">Nhật ký ra/vào phòng</h1>
                    <p className="text-slate-blue text-sm mt-1">Đối soát an ninh ra/vào dựa trên API camera nhận diện khuôn mặt</p>
                </div>
                <div className="self-start sm:self-center flex items-center">
                    <ReportActions>
                        <ExportMenu askMode initialRange={{ from: selectedDate, to: selectedDate }} filterSummary={[`Phòng: ${getSelectedRoomInfo(rooms, selectedRoomId)?.name || 'Tất cả phòng'}`, debouncedSearch ? `Tìm kiếm: ${debouncedSearch}` : '', directionFilter ? `Hướng: ${directionFilter === 'enter' ? 'Vào' : 'Ra'}` : 'Tất cả hướng', statusFilter ? `Trạng thái: ${{ matched: 'Đã nhận diện', unmatched: 'Chưa khớp', stranger: 'Người lạ' }[statusFilter] || statusFilter}` : 'Tất cả trạng thái']} onExport={handleExport} busyFormat={busyFormat} disabled={logsLoading || allSorted.length === 0} />
                        <RefreshButton
                            onClick={() => fetchLogs()}
                            disabled={logsLoading}
                            busy={logsLoading}
                        />
                    </ReportActions>
                </div>
            </div>

            {/* ── Stat cards ── */}
            <StatisticGrid columns={4} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Clock}         label="Tổng lượt ra/vào"      value={totalItems}     sub="Ghi nhận qua camera AI"          colorCls="bg-blue-50 text-action-blue" />
                <StatCard icon={ShieldCheck}   label="Lượt hợp lệ"           value={matchedCount}   sub="Đúng người, đúng bối cảnh"       colorCls="bg-emerald-50 text-emerald-600" />
                <StatCard icon={ShieldQuestion} label="Chưa khớp bối cảnh"   value={unmatchedCount} sub="Người quen, sai phòng/giờ"       colorCls={unmatchedCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-cloud-mist text-slate-400'} alert={false} />
                <StatCard icon={AlertTriangle} label="Người lạ"              value={strangerCount}  sub={strangerCount > 0 ? 'Cảnh báo bảo mật!' : 'Không có bất thường'} colorCls={strangerCount > 0 ? 'bg-red-100 text-red-600' : 'bg-cloud-mist text-slate-400'} alert={strangerCount > 0} />
            </StatisticGrid>

            {/* ── Error ── */}
            <AnimatePresence>
                {(error || roomsError || meetingsError) && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="font-semibold">{error || roomsError || meetingsError}</span>
                        </div>
                        <button onClick={() => roomsError ? fetchRoomsList() : meetingsError ? fetchMeetings() : fetchLogs()} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex-shrink-0">Thử lại</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Filter panel ── */}
            <FilterBar variant="card" className="bg-white p-5 rounded-2xl border border-platinum-tint shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-sm font-extrabold text-midnight-indigo">
                    <Filter className="w-4 h-4 text-slate-blue" /> Bộ lọc
                </div>
                <div data-filter-grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Room */}
                    <div className="camai-filter-field space-y-1.5">
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
                    <div className="camai-filter-field space-y-1.5">
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
                                disabled={!selectedRoomId}
                                className={`w-full pl-9 pr-8 py-2.5 border rounded-xl text-sm text-left font-semibold outline-none transition-all ${
                                    !selectedRoomId
                                        ? 'bg-slate-50 border-platinum-tint text-slate-400 cursor-not-allowed'
                                        : isMeetingDropdownOpen
                                            ? 'bg-white border-action-blue ring-2 ring-action-blue/20 text-midnight-indigo'
                                            : 'bg-cloud-mist hover:bg-white border-platinum-tint text-midnight-indigo'
                                }`}
                            >
                                <span className="truncate block">
                                    {selectedMeetingId === '' ? 'Toàn bộ ngày' : (() => {
                                        const m = meetings.find(x => getBookingMeetingId(x) === selectedMeetingId);
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
                                        {meetings.length === 0 && (
                                            <div className="px-4 py-3 text-[11px] text-slate-blue font-semibold border-t border-slate-50">
                                                Không có ca họp trong ngày/phòng đã chọn.
                                            </div>
                                        )}
                                        {meetings.map(m => {
                                            const tid  = getBookingMeetingId(m);
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
            </FilterBar>

            {/* ── Log table ── */}
            <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm overflow-hidden">

                {/* sub-filter bar */}
                <FilterBar variant="inline" className="px-6 py-4 border-b border-platinum-tint bg-cloud-mist/30 flex flex-col md:flex-row items-center gap-3">
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

                    <div data-filter-fields className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        {/* direction */}
                        <div className="relative flex-1 min-w-[160px]">
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-blue pointer-events-none" />
                            <select value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none">
                                <option value="">Tất cả hướng</option>
                                <option value="enter">Vào cửa</option>
                                <option value="leave">Ra cửa</option>
                                <option value="seen">Thấy</option>
                            </select>
                        </div>

                        {/* status */}
                        <div className="relative flex-1 min-w-[160px]">
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-blue pointer-events-none" />
                            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-platinum-tint rounded-xl text-xs text-midnight-indigo focus:ring-2 focus:ring-action-blue/20 focus:border-action-blue outline-none">
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
                </FilterBar>

                {/* table */}
                <div className="overflow-x-auto">
                    <ResponsiveTable className="w-full text-left text-sm">
                        <colgroup>
                            {(showRoomColumn
                                ? [8, 7, 22, 11, 7, 10, 11, 6, 6, 12]
                                : [9, 8, 22, 7, 10, 11, 9, 7, 17]
                            ).map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
                        </colgroup>
                        <thead className="bg-cloud-mist/60 border-b border-platinum-tint">
                            <tr>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Ngày</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Giờ</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Người</th>
                                {showRoomColumn && <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Phòng họp</th>}
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Hướng</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Trạng thái</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider text-center">Ảnh</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-blue uppercase tracking-wider">Camera</th>
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
                                        {showRoomColumn && <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>}
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-14 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-20 mx-auto" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-8 w-8 bg-gray-200 rounded mx-auto" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-20" /></td>
                                        <td className="px-6 py-4 text-center"><div className="h-3.5 bg-gray-200 rounded w-12 mx-auto" /></td>
                                        <td className="px-6 py-4"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
                                    </tr>
                                ))
                            ) : pageGroups.length === 0 ? (
                                <tr>
                                    <td colSpan={showRoomColumn ? 10 : 9} className="px-6 py-16 text-center">
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
                    </ResponsiveTable>
                </div>

                {/* Pagination */}
                {<PaginationRegion legacyVisible={!logsLoading && totalItems > 0}><PaginationFooter
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalGroups}
                        pageSize={LOGS_PER_PAGE}
                        onPageChange={setCurrentPage}
                        itemLabel={"nhóm nhật ký"}
                        loading={logsLoading}
                        note={`${totalItems} lượt nhật ký${multiGroupCount > 0 ? ` · ${multiGroupCount} nhóm nhiều người` : ""}`}
                     onPageSizeChange={size => { setLogsPerPage(size); setCurrentPage(1); }} /></PaginationRegion>}
            </div>

            {/* Snapshot modal */}
            {snapshotUrl ? (
                createPortal(
                    <div
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 animate-in fade-in duration-200"
                        onClick={() => { setIsSnapshotOpen(false); setSnapshotUrl(null); }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsSnapshotOpen(false);
                                setSnapshotUrl(null);
                            }}
                            className="absolute top-6 right-6 z-[10000] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                            title="Đóng"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <img
                            src={snapshotUrl}
                            alt="Ảnh bằng chứng"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10 bg-black/20"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>,
                    document.body
                )
            ) : (
                <EventSnapshotModal isOpen={isSnapshotOpen} onClose={() => setIsSnapshotOpen(false)} eventId={snapshotEventId} />
            )}

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
                                            {code && <span data-ui-text="code" className="mt-1.5 text-[11px] font-mono text-slate-blue bg-cloud-mist px-2.5 py-0.5 rounded-full border border-platinum-tint">{code}</span>}
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
                                                        <p data-ui-text="label" className="text-[11px] font-semibold text-slate-blue">{label}</p>
                                                        <p className="text-sm font-bold text-midnight-indigo truncate">{value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Link
                                            to={`/${window.location.pathname.split("/")[1]}/user-journey?userId=${selectedUser.id}${selectedUser.journeyDate ? `&date=${selectedUser.journeyDate}` : ''}`}
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
