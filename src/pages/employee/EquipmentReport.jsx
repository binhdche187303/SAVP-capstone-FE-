import {
    Activity, AlertTriangle, ArrowLeft, ArrowUpDown, CheckCircle2, ChevronRight, Cpu, MapPin,
    Mic, Monitor, Package, RefreshCw, Search, Speaker, Video, WifiOff, Wrench, X,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import StatCard from '../../components/common/StatCard';

import { getMyMeetingHistory } from '../../service/employeeServices';
import { getEquipments, reportEquipmentFault } from '../../service/equipmentServices';

// Icon + màu riêng cho từng loại thiết bị (dùng cho chip lọc và card thiết bị).
const TYPE_META = {
    display: { label: 'Màn hình/Tivi', icon: Monitor, color: 'text-purple-500' },
    speaker: { label: 'Loa', icon: Speaker, color: 'text-green-600' },
    camera: { label: 'Camera', icon: Video, color: 'text-action-blue' },
    microphone: { label: 'Microphone', icon: Mic, color: 'text-orange-500' },
    capture_agent: { label: 'Bộ xử lý (Agent)', icon: Cpu, color: 'text-red-500' },
    sensor: { label: 'Cảm biến', icon: Activity, color: 'text-teal-600' },
    other: { label: 'Khác', icon: Package, color: 'text-slate-blue' },
};
const TYPE_ORDER = Object.keys(TYPE_META);
const typeMeta = (type) => TYPE_META[type] || { label: type || 'Khác', icon: Package, color: 'text-slate-blue' };
const getTypeLabel = (type) => typeMeta(type).label;

const HEALTH = {
    healthy: { label: 'Tốt', cls: 'bg-green-100 text-green-700', rank: 3 },
    warning: { label: 'Cảnh báo', cls: 'bg-amber-100 text-amber-800', rank: 1 },
    faulty: { label: 'Lỗi', cls: 'bg-red-100 text-red-700', rank: 0 },
    offline: { label: 'Mất kết nối', cls: 'bg-slate-200 text-slate-700', rank: 2 },
};
const getHealthBadge = (status) => HEALTH[status] || { label: status || 'Không rõ', cls: 'bg-slate-100 text-slate-600', rank: 4 };
const isIssue = (status) => status === 'faulty' || status === 'warning';

// Bộ lọc theo tình trạng (4 thẻ chính).
const HEALTH_FILTERS = {
    healthy: { label: 'Hoạt động tốt', match: (s) => s === 'healthy' },
    issue: { label: 'Có sự cố', match: isIssue },
    offline: { label: 'Mất kết nối', match: (s) => s === 'offline' },
};

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const normalize = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const compact = (text) => normalize(text).replace(/[^a-z0-9]/g, '');

// "A.401 - Cơ sở chính" → tên "A.401"; tên cơ sở đã có trong vị trí ("Cơ sở chính, A") nên chỉ giữ 1 chỗ.
const roomDisplay = (room) => {
    const fullName = String(room?.roomName || '').trim();
    const location = String(room?.location || '').trim();
    const cut = fullName.lastIndexOf(' - ');
    const suffix = cut > 0 ? fullName.slice(cut + 3) : '';
    const name = suffix && (!location || normalize(location).includes(normalize(suffix))) ? fullName.slice(0, cut) : fullName;
    const code = room?.roomCode && !compact(name).includes(compact(room.roomCode)) ? room.roomCode : '';
    return { name: name || room?.roomCode || 'Phòng', code, location };
};

const meetingTime = (meeting) => meeting?.startAt || meeting?.startTime || meeting?.start_at || meeting?.scheduledStart || null;
const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
};

const SearchBox = ({ value, onChange, placeholder }) => (
    <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-blue" />
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 pl-9 pr-8 bg-white border border-platinum-tint rounded-lg text-sm focus:outline-none focus:border-action-blue"
        />
        {value && (
            <button type="button" onClick={() => onChange('')} aria-label="Xóa tìm kiếm" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-blue hover:text-midnight-indigo">
                <X className="w-3.5 h-3.5" />
            </button>
        )}
    </div>
);

const SortSelect = ({ value, onChange, options }) => (
    <label className="h-10 inline-flex items-center gap-2 pl-3 pr-1 bg-white border border-platinum-tint rounded-lg text-xs font-semibold text-slate-blue">
        <ArrowUpDown className="w-4 h-4" />
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Sắp xếp" className="h-full bg-transparent pr-1 text-sm font-semibold text-midnight-indigo focus:outline-none">
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    </label>
);

const EquipmentReport = () => {
    // ─── Level 1: recent rooms ────────────────────────────────────────────────
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [roomsError, setRoomsError] = useState(null);
    const [recentRooms, setRecentRooms] = useState([]); // [{ room, lastMeeting }] — thứ tự = họp gần nhất trước
    const [roomQuery, setRoomQuery] = useState('');
    const [roomSort, setRoomSort] = useState('recent');

    // ─── Level 2: room detail + equipment ─────────────────────────────────────
    const [view, setView] = useState('rooms'); // 'rooms' | 'detail'
    const [selectedEntry, setSelectedEntry] = useState(null); // { room, lastMeeting }
    const [equipmentList, setEquipmentList] = useState([]);
    const [loadingEquipment, setLoadingEquipment] = useState(false);
    const [equipmentError, setEquipmentError] = useState(null);
    const [typeFilter, setTypeFilter] = useState('all');
    const [healthFilter, setHealthFilter] = useState('all');
    const [equipmentQuery, setEquipmentQuery] = useState('');
    const [equipmentSort, setEquipmentSort] = useState('status');

    const [successMessage, setSuccessMessage] = useState(null);

    const visibleRooms = useMemo(() => {
        const text = normalize(roomQuery.trim());
        const list = recentRooms
            .map((entry, recentIndex) => ({ ...entry, recentIndex, display: roomDisplay(entry.room) }))
            .filter(({ room, display }) => !text || normalize(`${room.roomName} ${room.roomCode} ${display.location}`).includes(text));
        if (roomSort === 'name') list.sort((a, b) => collator.compare(a.display.name, b.display.name));
        return list;
    }, [recentRooms, roomQuery, roomSort]);

    const healthCounts = useMemo(() => {
        const counts = { all: equipmentList.length, healthy: 0, issue: 0, offline: 0 };
        equipmentList.forEach((eq) => {
            Object.entries(HEALTH_FILTERS).forEach(([key, f]) => { if (f.match(eq.healthStatus)) counts[key] += 1; });
        });
        return counts;
    }, [equipmentList]);

    const typeChips = useMemo(() => {
        const counts = {};
        const issues = {};
        equipmentList.forEach((eq) => {
            const t = eq.equipmentType || 'other';
            counts[t] = (counts[t] || 0) + 1;
            if (isIssue(eq.healthStatus)) issues[t] = (issues[t] || 0) + 1;
        });
        return Object.keys(counts)
            .sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99))
            .map((type) => ({ type, count: counts[type], issues: issues[type] || 0 }));
    }, [equipmentList]);

    const filteredEquipment = useMemo(() => {
        const text = normalize(equipmentQuery.trim());
        const list = equipmentList.filter((eq) => (
            (typeFilter === 'all' || (eq.equipmentType || 'other') === typeFilter)
            && (healthFilter === 'all' || HEALTH_FILTERS[healthFilter].match(eq.healthStatus))
            && (!text || normalize(`${eq.equipmentName} ${eq.equipmentCode} ${getTypeLabel(eq.equipmentType)}`).includes(text))
        ));
        return list.sort((a, b) => (
            equipmentSort === 'status'
                ? getHealthBadge(a.healthStatus).rank - getHealthBadge(b.healthStatus).rank || collator.compare(a.equipmentName || '', b.equipmentName || '')
                : collator.compare(a.equipmentName || '', b.equipmentName || '')
        ));
    }, [equipmentList, typeFilter, healthFilter, equipmentQuery, equipmentSort]);

    const activeFilters = [
        typeFilter !== 'all' && { key: 'type', label: getTypeLabel(typeFilter), clear: () => setTypeFilter('all') },
        healthFilter !== 'all' && { key: 'health', label: HEALTH_FILTERS[healthFilter].label, clear: () => setHealthFilter('all') },
        equipmentQuery.trim() && { key: 'query', label: `"${equipmentQuery.trim()}"`, clear: () => setEquipmentQuery('') },
    ].filter(Boolean);
    const clearEquipmentFilters = () => { setTypeFilter('all'); setHealthFilter('all'); setEquipmentQuery(''); };

    // ─── Fault modal ───────────────────────────────────────────────────────────
    const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [faultForm, setFaultForm] = useState({ healthStatus: 'faulty', issueNote: '' });
    const [submittingFault, setSubmittingFault] = useState(false);

    const fetchRecentRooms = useCallback(async () => {
        setLoadingRooms(true);
        setRoomsError(null);
        try {
            const res = await getMyMeetingHistory({
                status: ['scheduled', 'in_progress', 'completed'],
                page: 1,
                limit: 50,
            });
            if (!res?.success) throw new Error(res?.message || 'Không thể tải danh sách cuộc họp gần đây.');
            const meetings = res.data?.items || res.data || [];
            const map = new Map();
            meetings.forEach((m) => {
                if (!m.room?.id || map.has(m.room.id)) return;
                map.set(m.room.id, { room: m.room, lastMeeting: m });
            });
            const entries = Array.from(map.values());

            // Chỉ giữ lại các phòng có ít nhất 1 thiết bị được gán, tránh
            // cho phép báo hỏng ở phòng chưa gán thiết bị nào.
            const equipmentChecks = await Promise.all(
                entries.map((entry) =>
                    getEquipments({ currentRoomId: entry.room.id, limit: 1 })
                        .then((r) => (r?.success && (r.data || []).length > 0))
                        .catch(() => false)
                )
            );
            setRecentRooms(entries.filter((_, idx) => equipmentChecks[idx]));
        } catch (err) {
            setRoomsError(err?.message || 'Lỗi khi tải danh sách phòng.');
        } finally {
            setLoadingRooms(false);
        }
    }, []);

    useEffect(() => { fetchRecentRooms(); }, [fetchRecentRooms]);

    const fetchEquipmentForRoom = useCallback(async (roomId) => {
        setLoadingEquipment(true);
        setEquipmentError(null);
        try {
            const res = await getEquipments({ currentRoomId: roomId, limit: 100 });
            if (!res?.success) throw new Error(res?.message || 'Không thể tải danh sách thiết bị.');
            setEquipmentList(res.data || []);
        } catch (err) {
            setEquipmentError(err?.message || 'Lỗi khi tải thiết bị.');
        } finally {
            setLoadingEquipment(false);
        }
    }, []);

    const handleSelectRoom = (entry) => {
        setSelectedEntry(entry);
        setView('detail');
        clearEquipmentFilters();
        setSuccessMessage(null);
        fetchEquipmentForRoom(entry.room.id);
    };

    const handleBack = () => {
        setView('rooms');
        setSelectedEntry(null);
        setEquipmentList([]);
        setEquipmentError(null);
        setSuccessMessage(null);
    };

    const openFaultModal = (eq) => {
        setSelectedEquipment(eq);
        setFaultForm({ healthStatus: 'faulty', issueNote: '' });
        setIsFaultModalOpen(true);
    };

    const handleFaultSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEquipment) return;
        setSubmittingFault(true);
        setEquipmentError(null);
        try {
            const res = await reportEquipmentFault(selectedEquipment.id, {
                healthStatus: faultForm.healthStatus,
                issueNote: faultForm.issueNote,
            });
            if (res?.success) {
                setSuccessMessage(`Đã gửi báo cáo lỗi cho "${selectedEquipment.equipmentName}". Bộ phận quản trị sẽ xác nhận và xử lý.`);
                setIsFaultModalOpen(false);
                if (selectedEntry) fetchEquipmentForRoom(selectedEntry.room.id);
            } else {
                setEquipmentError(res?.message || 'Báo hỏng thất bại.');
            }
        } catch (err) {
            setEquipmentError(err?.message || 'Lỗi khi báo hỏng thiết bị.');
        } finally {
            setSubmittingFault(false);
        }
    };

    const selectedDisplay = selectedEntry ? roomDisplay(selectedEntry.room) : null;
    const errorBox = (message) => message && (
        <div className="p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-xl flex items-start">
            <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{message}</p>
        </div>
    );
    const headerButtonCls = 'inline-flex items-center px-4 py-2.5 bg-white border border-platinum-tint text-slate-blue rounded-xl text-sm font-semibold hover:bg-cloud-mist transition-all';

    return (
        <div className="pt-2 space-y-5 animate-fade-in-up">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                        <Wrench className="w-3.5 h-3.5" />
                        Báo hỏng thiết bị phòng họp
                    </span>
                    <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">
                        {view === 'rooms' ? 'Phòng họp gần đây của tôi' : selectedDisplay?.name}
                    </h1>
                    {view === 'rooms' ? (
                        <p className="text-sm text-slate-blue mt-1">Chọn một phòng để xem thiết bị và báo hỏng nếu phát hiện sự cố.</p>
                    ) : (
                        <p className="text-sm text-slate-blue mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {selectedDisplay?.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedDisplay.location}</span>}
                            {selectedDisplay?.location && <span className="text-slate-300">•</span>}
                            <span>Bấm "Báo hỏng" nếu phát hiện thiết bị gặp sự cố.</span>
                        </p>
                    )}
                </div>
                {view === 'detail' ? (
                    <button onClick={handleBack} className={headerButtonCls}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Quay lại danh sách phòng
                    </button>
                ) : (
                    <button onClick={fetchRecentRooms} className={headerButtonCls}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loadingRooms ? 'animate-spin' : ''}`} />
                        Làm mới
                    </button>
                )}
            </div>

            {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium">
                    {successMessage}
                </div>
            )}

            {view === 'rooms' ? (
                <>
                    {errorBox(roomsError)}
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchBox value={roomQuery} onChange={setRoomQuery} placeholder="Tìm theo tên, mã phòng hoặc vị trí…" />
                        <SortSelect
                            value={roomSort}
                            onChange={setRoomSort}
                            options={[{ value: 'recent', label: 'Họp gần đây nhất' }, { value: 'name', label: 'Tên phòng A → Z' }]}
                        />
                        {!loadingRooms && (
                            <span className="text-xs text-slate-blue ml-auto">
                                {roomQuery.trim() ? `${visibleRooms.length}/${recentRooms.length} phòng` : `${recentRooms.length} phòng`}
                            </span>
                        )}
                    </div>

                    {loadingRooms ? (
                        <div className="bg-white rounded-xl border border-platinum-tint divide-y divide-platinum-tint">
                            {Array(6).fill(0).map((_, idx) => <div key={idx} className="h-14 animate-pulse bg-cloud-mist/40" />)}
                        </div>
                    ) : recentRooms.length === 0 ? (
                        <div className="bg-white rounded-xl border border-platinum-tint p-12 text-center">
                            <MapPin className="w-12 h-12 mb-3 mx-auto text-slate-blue opacity-50" />
                            <p className="text-sm font-medium text-slate-blue">Bạn chưa có cuộc họp nào gắn với phòng gần đây.</p>
                        </div>
                    ) : (
                        <ul className="bg-white rounded-xl border border-platinum-tint divide-y divide-platinum-tint overflow-hidden">
                            {visibleRooms.map((entry) => {
                                const lastDate = formatDate(meetingTime(entry.lastMeeting));
                                return (
                                    <li key={entry.room.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectRoom(entry)}
                                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-blue-50/50 transition-colors group"
                                        >
                                            <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                                <MapPin className="w-4 h-4 text-action-blue" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-midnight-indigo truncate">{entry.display.name}</span>
                                                    {entry.display.code && <span className="text-[11px] font-semibold text-slate-blue">{entry.display.code}</span>}
                                                    {entry.recentIndex === 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-action-blue shrink-0">Họp gần nhất</span>
                                                    )}
                                                </span>
                                                {entry.display.location && <span className="block text-xs text-slate-blue truncate">{entry.display.location}</span>}
                                            </span>
                                            {lastDate && <span className="hidden sm:block text-xs text-slate-blue shrink-0">Họp lần cuối {lastDate}</span>}
                                            <ChevronRight className="w-4 h-4 text-slate-blue group-hover:text-action-blue shrink-0" />
                                        </button>
                                    </li>
                                );
                            })}
                            {visibleRooms.length === 0 && (
                                <li className="px-4 py-10 text-center text-sm text-slate-blue">Không có phòng khớp "{roomQuery.trim()}".</li>
                            )}
                        </ul>
                    )}
                </>
            ) : (
                <>
                    {errorBox(equipmentError)}

                    {loadingEquipment ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {Array(6).fill(0).map((_, idx) => <div key={idx} className="h-20 rounded-xl bg-cloud-mist animate-pulse" />)}
                        </div>
                    ) : equipmentList.length === 0 ? (
                        <div className="bg-white rounded-xl border border-platinum-tint p-12 text-center">
                            <Package className="w-12 h-12 mb-3 mx-auto text-slate-blue opacity-50" />
                            <p className="text-sm font-medium text-slate-blue">Phòng này chưa được gán thiết bị nào.</p>
                        </div>
                    ) : (
                        <>
                            {/* 4 thẻ chính theo tình trạng — chỉ tô màu cảnh báo khi thật sự có sự cố */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <StatCard
                                    label="Tất cả thiết bị"
                                    value={healthCounts.all}
                                    hint="trong phòng"
                                    icon={Package}
                                    tone="neutral"
                                    active={healthFilter === 'all'}
                                    onClick={() => setHealthFilter('all')}
                                />
                                <StatCard
                                    label="Hoạt động tốt"
                                    value={healthCounts.healthy}
                                    hint={healthCounts.healthy === healthCounts.all ? 'Tất cả đều ổn' : `${healthCounts.all - healthCounts.healthy} cần chú ý`}
                                    icon={CheckCircle2}
                                    tone="green"
                                    active={healthFilter === 'healthy'}
                                    onClick={() => setHealthFilter((v) => (v === 'healthy' ? 'all' : 'healthy'))}
                                />
                                <StatCard
                                    label="Có sự cố"
                                    value={healthCounts.issue}
                                    hint={healthCounts.issue ? 'Lỗi hoặc cảnh báo' : 'Không có sự cố'}
                                    icon={AlertTriangle}
                                    tone={healthCounts.issue ? 'red' : 'neutral'}
                                    active={healthFilter === 'issue'}
                                    onClick={() => setHealthFilter((v) => (v === 'issue' ? 'all' : 'issue'))}
                                />
                                <StatCard
                                    label="Mất kết nối"
                                    value={healthCounts.offline}
                                    hint={healthCounts.offline ? 'Không nhận tín hiệu' : 'Đều đang kết nối'}
                                    icon={WifiOff}
                                    tone={healthCounts.offline ? 'amber' : 'neutral'}
                                    active={healthFilter === 'offline'}
                                    onClick={() => setHealthFilter((v) => (v === 'offline' ? 'all' : 'offline'))}
                                />
                            </div>

                            {/* Loại thiết bị → chip lọc, mỗi loại 1 icon riêng */}
                            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo loại thiết bị">
                                <button
                                    type="button"
                                    onClick={() => setTypeFilter('all')}
                                    aria-pressed={typeFilter === 'all'}
                                    className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors ${typeFilter === 'all' ? 'bg-action-blue border-action-blue text-white' : 'bg-white border-platinum-tint text-slate-blue hover:border-action-blue/50'}`}
                                >
                                    Tất cả loại <span className="opacity-80">{equipmentList.length}</span>
                                </button>
                                {typeChips.map(({ type, count, issues }) => {
                                    const meta = typeMeta(type);
                                    const Icon = meta.icon;
                                    const active = typeFilter === type;
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setTypeFilter((v) => (v === type ? 'all' : type))}
                                            aria-pressed={active}
                                            title={issues ? `${issues} thiết bị đang có sự cố` : undefined}
                                            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors ${active ? 'bg-action-blue border-action-blue text-white' : 'bg-white border-platinum-tint text-midnight-indigo hover:border-action-blue/50'}`}
                                        >
                                            <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : meta.color}`} />
                                            {meta.label}
                                            <span className={active ? 'opacity-80' : 'text-slate-blue'}>{count}</span>
                                            {issues > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <SearchBox value={equipmentQuery} onChange={setEquipmentQuery} placeholder="Tìm theo tên hoặc mã thiết bị…" />
                                <SortSelect
                                    value={equipmentSort}
                                    onChange={setEquipmentSort}
                                    options={[{ value: 'status', label: 'Trạng thái (sự cố trước)' }, { value: 'name', label: 'Tên A → Z' }]}
                                />
                                {activeFilters.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-blue">Đang lọc:</span>
                                        {activeFilters.map((f) => (
                                            <span key={f.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 text-action-blue font-semibold">
                                                {f.label}
                                                <button type="button" onClick={f.clear} aria-label={`Bỏ lọc ${f.label}`} className="p-0.5 rounded-full hover:bg-blue-100"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                        {activeFilters.length > 1 && (
                                            <button type="button" onClick={clearEquipmentFilters} className="font-semibold text-slate-blue hover:text-red-600 hover:underline">Xóa tất cả</button>
                                        )}
                                    </div>
                                ) : null}
                                <span className="text-xs text-slate-blue ml-auto">
                                    Hiện {filteredEquipment.length}/{equipmentList.length} thiết bị
                                </span>
                            </div>

                            {filteredEquipment.length === 0 ? (
                                <div className="bg-white rounded-xl border border-platinum-tint p-10 text-center text-sm text-slate-blue">
                                    Không có thiết bị khớp bộ lọc.{' '}
                                    <button type="button" onClick={clearEquipmentFilters} className="font-semibold text-action-blue hover:underline">Xóa bộ lọc</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {filteredEquipment.map((eq) => {
                                        const badge = getHealthBadge(eq.healthStatus);
                                        const meta = typeMeta(eq.equipmentType);
                                        const Icon = meta.icon;
                                        return (
                                            <div
                                                key={eq.id}
                                                className={`bg-white rounded-xl border p-3 flex items-center gap-3 ${isIssue(eq.healthStatus) ? 'border-red-200' : 'border-platinum-tint'}`}
                                            >
                                                <span className="w-9 h-9 rounded-lg bg-cloud-mist flex items-center justify-center shrink-0">
                                                    <Icon className={`w-[18px] h-[18px] ${meta.color}`} />
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm text-midnight-indigo truncate" title={eq.equipmentName}>{eq.equipmentName}</p>
                                                    <p className="text-xs text-slate-blue truncate">
                                                        {meta.label} • {eq.equipmentCode}
                                                        {eq.assetStatus === 'maintenance' && <span className="ml-1.5 px-1.5 py-px rounded bg-gray-100 text-gray-700 text-[10px] font-semibold">Đang bảo trì</span>}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
                                                    <button
                                                        onClick={() => openFaultModal(eq)}
                                                        className="inline-flex items-center px-2 py-1 bg-red-50 text-red-600 rounded-md text-[11px] font-semibold hover:bg-red-100 transition-colors"
                                                    >
                                                        <Wrench className="w-3 h-3 mr-1" />
                                                        Báo hỏng
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* FAULT MODAL */}
            {isFaultModalOpen && selectedEquipment && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-4 animate-fade-in-up">
                    <div className="bg-white rounded-2xl border border-platinum-tint shadow-xl max-w-md w-full flex flex-col">
                        <div className="px-6 py-4 border-b border-platinum-tint flex items-center justify-between bg-red-50">
                            <h3 className="font-bold text-red-700">Báo hỏng thiết bị</h3>
                            <button onClick={() => setIsFaultModalOpen(false)} className="text-red-700 hover:text-red-900">✕</button>
                        </div>
                        <form onSubmit={handleFaultSubmit} className="p-6 space-y-4">
                            <div className="p-3 bg-cloud-mist/30 rounded-xl mb-4">
                                <p className="text-sm font-bold text-midnight-indigo">{selectedEquipment.equipmentName}</p>
                                <p className="text-xs text-slate-blue">Mã: {selectedEquipment.equipmentCode} • Phòng: {selectedEntry?.room?.roomName}</p>
                                {selectedEntry?.room?.location && (
                                    <p className="text-xs text-slate-blue mt-0.5 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 shrink-0" /> {selectedEntry.room.location}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mức độ sự cố</label>
                                <select
                                    value={faultForm.healthStatus}
                                    onChange={(e) => setFaultForm({ ...faultForm, healthStatus: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm bg-white"
                                >
                                    <option value="warning">Cảnh báo (vẫn dùng được)</option>
                                    <option value="faulty">Lỗi (không dùng được)</option>
                                    <option value="offline">Mất kết nối</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-blue uppercase mb-1">Mô tả sự cố <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    rows="3"
                                    value={faultForm.issueNote}
                                    onChange={(e) => setFaultForm({ ...faultForm, issueNote: e.target.value })}
                                    className="w-full px-3 py-2 border border-platinum-tint rounded-xl text-sm resize-none"
                                    placeholder="VD: Camera không lên hình, mic bị rè..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-platinum-tint">
                                <button type="button" onClick={() => setIsFaultModalOpen(false)} disabled={submittingFault} className="px-4 py-2 text-sm font-semibold text-slate-blue border border-platinum-tint rounded-xl hover:bg-cloud-mist disabled:opacity-50">
                                    Hủy
                                </button>
                                <button type="submit" disabled={submittingFault} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 min-w-[110px] inline-flex items-center justify-center">
                                    {submittingFault ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Gửi báo cáo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default EquipmentReport;
