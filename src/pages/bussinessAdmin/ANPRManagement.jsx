import { filterValues } from '../../utils/filterSelection';
import FilterMultiSelect from '../../components/common/FilterMultiSelect';
import CalendarRangePresets, { calendarRange } from '../../components/common/CalendarRangePresets';
import './ANPRManagement.css';
import StatisticCard from '../../components/common/StatisticCard';
import StatisticGrid from '../../components/common/StatisticGrid';
import ResponsiveTable from '../../components/common/ResponsiveTable';
import ReportActions from '../../components/common/ReportActions';
import ReportExportButton from '../../components/common/ReportExportButton';
import FilterBar, { FilterField } from '../../components/common/FilterBar';
import PaginationFooter, { PaginationRegion } from '../../components/common/PaginationFooter';
import RefreshButton from '../../components/common/RefreshButton';
import { Car, Download, Search, X, Mail, Phone, Briefcase, Loader2, LogIn, LogOut, CheckCircle2, AlertTriangle, Filter, Repeat, ShieldAlert } from 'lucide-react';
import toast from '../../utils/toast';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import 'react-datepicker/dist/react-datepicker.css';

import {
    getAdminVehicleHistory,
    adminRegisterVehicle,
    getUnknownVehicles,
    mockAnprVehicleEvent,
    setupMockAnprCamera
} from '../../service/anprService';
import { getUsers } from '../../service/employeeServices'; // Để lấy danh sách nhân viên
import EventSnapshotModal from '../../components/security/EventSnapshotModal';
import ExportModeDialog from '../../components/report/ExportModeDialog';
import { exportAnprHistoryReport } from '../../utils/anprReportExport';
import ThumbnailImage from '../../components/common/ThumbnailImage';
import UserAvatar from '../../components/common/UserAvatar';

import { getDevices, getZones } from '../../service/sysAdminServices';
import { useDebouncedValue, useInstantFilter } from '../../hooks/useInstantSearch';
import { totalOf, useFacetCounts } from '../../hooks/useFilterCounts';

const ANPR_HISTORY_REFRESH_MS = 5000;

// "Xe máy" gộp hai mã camera có thể gửi: motorbike và motorcycle.
const expandVehicleType = (value) => filterValues(value).flatMap((v) => (v === 'motorbike' ? ['motorbike', 'motorcycle'] : [v]));

const getVehicleTypeLabel = (type) => {
    const normalized = String(type || '').toUpperCase();
    if (normalized === 'CAR') return 'Ô tô';
    if (normalized === 'MOTORBIKE' || normalized === 'MOTORCYCLE') return 'Xe máy';
    if (normalized === 'TRUCK') return 'Xe tải';
    if (normalized === 'BUS') return 'Xe buýt';
    return type || 'Chưa rõ';
};

// Shared gate-control workspace for administrators and guards.
const ANPRManagement = ({ guardMode = false }) => {
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [activeTab, setActiveTab] = useState('history'); // 'history', 'register', 'unknown'
    useEffect(() => { if (guardMode) setActiveTab('history'); }, [guardMode]);
    const [loading, setLoading] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Snapshot Modal
    const [snapshotEventId, setSnapshotEventId] = useState(null);
    const [snapshotItem, setSnapshotItem] = useState(null);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);

    // Inline Owner Modal
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);

    // ============================================
    // TAB 1: LỊCH SỬ QUÉT BIỂN
    // ============================================
    const [historyList, setHistoryList] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [filterMatchState, setFilterMatchState] = useState('ALL');
    const [recognitionCounts, setRecognitionCounts] = useState({ ALL: null, matched: null, unmatched: null });
    const selectRecognitionFilter = value => {
        setFilterMatchState(value);
        setHistoryPage(1);
    };
    const [filterCamera, setFilterCamera] = useState('');
    const [filterZone, setFilterZone] = useState('');
    const [filterVehicleType, setFilterVehicleType] = useState('');
    const [cameraOptions, setCameraOptions] = useState([]);
    const [zoneOptions, setZoneOptions] = useState([]);

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            getDevices({ page: 1, limit: 100 }),
            getZones({ page: 1, limit: 100, status: 'active', zone_type: 'gate' }),
        ])
            .then(([devicesRes, zonesRes]) => {
                if (cancelled) return;

                const devicePayload = devicesRes?.data ?? devicesRes;
                const zonePayload = zonesRes?.data ?? zonesRes;

                const devices = Array.isArray(devicePayload)
                    ? devicePayload
                    : (devicePayload?.items || []);

                const zones = Array.isArray(zonePayload)
                    ? zonePayload
                    : (zonePayload?.items || []);

                setCameraOptions(
                    devices.filter((device) => {
                        const type = String(
                            device.device_type || device.deviceType || ''
                        ).toLowerCase();

                        return type === 'door_camera';
                    })
                );

                setZoneOptions(
                    zones.filter((zone) => {
                        const type = String(
                            zone.zone_type || zone.zoneType || ''
                        ).toLowerCase();

                        return (
                            ['active', undefined].includes(zone.status) &&
                            (!type || type === 'gate')
                        );
                    })
                );

                console.log('[ANPR] Camera từ DB:', devices);
                console.log('[ANPR] Khu vực từ DB:', zones);
            })
            .catch((error) => {
                console.error('[ANPR] Không tải được camera/khu vực:', error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const [historyPage, setHistoryPage] = useState(1);
    const [dateRange, setDateRange] = useState([null, null]);
    const [startDate, endDate] = dateRange;
    const [searchKeyword, setSearchKeyword] = useState('');
    const debouncedSearch = useDebouncedValue(searchKeyword);
    const clearHistoryFilters = () => {
        setSearchKeyword('');
        setFilterMatchState('ALL');
        setFilterCamera('');
        setFilterZone('');
        setFilterVehicleType('');
        setDateRange([null, null]);
        setHistoryPage(1);
    };
    const [mockPlate, setMockPlate] = useState('30A-123.45');
    const [mockVehicleType, setMockVehicleType] = useState('CAR');
    const [mockLoading, setMockLoading] = useState(false);



    useEffect(() => {
        setHistoryPage(1);
    }, [filterMatchState, filterCamera, filterZone, filterVehicleType, debouncedSearch, startDate, endDate]);

    // Số đếm cạnh lựa chọn của các ô lọc tab "Lịch sử quét" (mỗi ô đếm theo các bộ lọc khác).
    const historyFilters = useMemo(() => ({
        matchState: filterMatchState === 'ALL' ? '' : filterMatchState,
        cameraName: filterCamera,
        zoneId: filterZone,
        vehicleType: filterVehicleType,
        search: debouncedSearch,
        from: startDate ? startDate.toISOString() : '',
        to: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString() : '',
    }), [filterMatchState, filterCamera, filterZone, filterVehicleType, debouncedSearch, startDate, endDate]);
    const fetchHistoryCount = useCallback((f) => getAdminVehicleHistory({
        page: 1,
        limit: 1,
        ...(f.matchState ? { matchState: f.matchState } : {}),
        ...(f.cameraName ? { cameraName: f.cameraName } : {}),
        ...(f.zoneId ? { zoneId: f.zoneId } : {}),
        ...(f.vehicleType ? { vehicleType: expandVehicleType(f.vehicleType) } : {}),
        ...(f.search ? { plateNumber: f.search, ownerName: f.search } : {}),
        ...(f.from ? { from: f.from } : {}),
        ...(f.to ? { to: f.to } : {}),
    }).then(totalOf), []);
    const historyCountsOn = activeTab === 'history';
    const matchStateCounts = useFacetCounts(historyFilters, 'matchState', ['matched', 'unmatched'], fetchHistoryCount, { enabled: historyCountsOn });
    const cameraCounts = useFacetCounts(historyFilters, 'cameraName', cameraOptions.map((c) => c.deviceName || c.device_name).filter(Boolean), fetchHistoryCount, { enabled: historyCountsOn });
    const zoneCounts = useFacetCounts(historyFilters, 'zoneId', zoneOptions.map((z) => z.id), fetchHistoryCount, { enabled: historyCountsOn });
    const vehicleTypeCounts = useFacetCounts(historyFilters, 'vehicleType', ['car', 'motorbike', 'truck', 'bus'], fetchHistoryCount, { enabled: historyCountsOn });

    // Lọc ngay trên lịch sử đang hiển thị trong lúc chờ BE trả kết quả cho từ khoá mới.
    const visibleHistory = useInstantFilter(historyList, searchKeyword, searchKeyword !== debouncedSearch || loading);

    const fetchHistory = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const params = {
                page: historyPage,
                limit: itemsPerPage
            };
            if (filterMatchState !== 'ALL') {
                params.matchState = filterMatchState;
            }
            if (filterCamera) params.cameraName = filterCamera;
            if (filterZone) params.zoneId = filterZone;
            if (filterVehicleType) params.vehicleType = expandVehicleType(filterVehicleType);
            if (debouncedSearch) {
                params.plateNumber = debouncedSearch;
                params.ownerName = debouncedSearch; // Hỗ trợ BE filter theo Tên Chủ xe
            }
            if (startDate) {
                params.from = startDate.toISOString();
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                params.to = end.toISOString();
            }
            // Guard cards show totals across the current date/search/camera scope,
            // rather than counting only the rows on the displayed page.
            const summaryStates = guardMode ? ['ALL', 'matched', 'unmatched'].filter(state => state !== filterMatchState) : [];
            const summaryParams = { ...params, page: 1, limit: 1 };
            delete summaryParams.matchState;
            const [res, ...summaries] = await Promise.all([
                getAdminVehicleHistory(params),
                ...summaryStates.map(state => getAdminVehicleHistory({
                    ...summaryParams,
                    ...(state === 'ALL' ? {} : { matchState: state }),
                })),
            ]);
            if (res?.success) {
                setHistoryList(res.data);
                setHistoryTotal(res.meta?.total || 0);
                if (guardMode) {
                    setRecognitionCounts(previous => {
                        const next = { ...previous, [filterMatchState]: res.meta?.total ?? 0 };
                        summaryStates.forEach((state, index) => {
                            if (summaries[index]?.success) next[state] = summaries[index].meta?.total ?? 0;
                        });
                        return next;
                    });
                }
            } else {
                setHistoryList([]);
                setHistoryTotal(0);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
        }
        if (!silent) setLoading(false);
    };

    const handleMockVehicle = async (direction) => {
        setMockLoading(true);
        const startedAt = performance.now();
        try {
            await setupMockAnprCamera();
            await mockAnprVehicleEvent({
                plateNumber: mockPlate,
                direction,
                vehicleType: mockVehicleType
            });
            const elapsed = Math.round(performance.now() - startedAt);
            setActiveTab('history');
            setHistoryPage(1);
            await fetchHistory(true);
            toast.success(`Đã mock xe ${direction === 'leave' ? 'ra' : 'vào'} cổng (${elapsed}ms).`);
        } catch (err) {
            toast.error(err?.error?.message || err?.message || 'Không thể mock sự kiện ANPR.');
        } finally {
            setMockLoading(false);
        }
    };

    // ============================================
    // TAB 2: ĐĂNG KÝ HỘ (ADMIN)
    // ============================================
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [regPlate, setRegPlate] = useState('');
    const [regType, setRegType] = useState('CAR');
    const [regNote, setRegNote] = useState('');

    // Tìm theo tên/email/mã trên toàn bộ người dùng (hàng chục nghìn tài khoản sau đồng bộ UEL),
    // thay vì nạp 100 người đầu theo thứ tự chữ cái.
    const fetchUsers = async (search = '') => {
        try {
            const res = await getUsers({ search: search.trim() || undefined, limit: 20 });
            if (res?.success) setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleRegisterVehicle = async (e) => {
        e.preventDefault();
        try {
            await adminRegisterVehicle({
                user_id: selectedUser,
                plate_raw: regPlate,
                vehicle_type: regType,
                note: regNote
            });
            toast.success('Đăng ký xe cho nhân viên thành công!');
            setRegPlate('');
            setRegNote('');
            setSelectedUser('');
        } catch (err) {
            toast.error('Lỗi đăng ký xe: ' + (err.message || 'Thất bại'));
        }
    };

    // ============================================
    // TAB 3: BIỂN LẠ
    // ============================================
    const [unknownList, setUnknownList] = useState([]);
    const [unknownTotal, setUnknownTotal] = useState(0);
    const [unknownPage, setUnknownPage] = useState(1);
    // Bộ lọc + thẻ số liệu của tab "Biển số lạ"
    const [unknownSearch, setUnknownSearch] = useState('');
    const debouncedUnknownSearch = useDebouncedValue(unknownSearch);
    const [unknownDirection, setUnknownDirection] = useState('');
    const [unknownFlag, setUnknownFlag] = useState(''); // '' | 'controlled' | 'normal'
    const [unknownView, setUnknownView] = useState(''); // '' | 'distinct' | 'repeat' (gom theo biển)
    // Thẻ số liệu dùng như bộ lọc nhanh, chọn loại trừ nhau.
    const selectUnknownCard = (card) => {
        setUnknownFlag(card === 'controlled' ? 'controlled' : '');
        setUnknownView(card === 'distinct' || card === 'repeat' ? card : '');
        setUnknownPage(1);
    };
    const activeUnknownCard = unknownView || (unknownFlag === 'controlled' ? 'controlled' : unknownFlag ? '' : 'all');
    const [unknownFrom, setUnknownFrom] = useState('');
    const [unknownTo, setUnknownTo] = useState('');
    const [unknownStats, setUnknownStats] = useState(null);
    // Số đếm cạnh từng lựa chọn của ô lọc (giống Nhật ký hệ thống: "Nhãn (số)").
    const [unknownFacets, setUnknownFacets] = useState(null);
    const withCount = (label, count) => (count == null ? label : `${label} (${count})`);
    const updateUnknownFilter = (setter) => (value) => { setter(value); setUnknownPage(1); };
    const clearUnknownFilters = () => {
        setUnknownSearch('');
        setUnknownDirection('');
        setUnknownFlag('');
        setUnknownView('');
        setUnknownFrom('');
        setUnknownTo('');
        setUnknownPage(1);
    };
    const hasUnknownFilters = !!(unknownSearch.trim() || unknownDirection || unknownFlag || unknownView || unknownFrom || unknownTo);

    const fetchUnknown = async () => {
        setLoading(true);
        try {
            const res = await getUnknownVehicles({
                page: unknownPage,
                limit: itemsPerPage,
                q: debouncedUnknownSearch.trim() || undefined,
                direction: unknownDirection || undefined,
                flag: unknownFlag || undefined,
                view: unknownView || undefined,
                from: unknownFrom ? `${unknownFrom}T00:00:00+07:00` : undefined,
                to: unknownTo ? `${unknownTo}T23:59:59+07:00` : undefined,
            });
            if (res?.success) {
                setUnknownList(res.data);
                setUnknownTotal(res.meta?.total || 0);
                setUnknownStats(res.stats || null);
                setUnknownFacets(res.facets || null);
            } else {
                setUnknownList([]);
                setUnknownTotal(0);
                setUnknownStats(null);
                setUnknownFacets(null);
            }
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    // ============================================
    // EFFECTS
    // ============================================
    useEffect(() => {
        if (activeTab === 'history') fetchHistory(true);
    }, [guardMode, activeTab, filterMatchState, filterCamera, filterZone, filterVehicleType, debouncedSearch, startDate, endDate, historyPage, itemsPerPage]);

    useEffect(() => {
        if (!guardMode && activeTab === 'unknown') fetchUnknown();
    }, [guardMode, activeTab, unknownPage, itemsPerPage, debouncedUnknownSearch, unknownDirection, unknownFlag, unknownView, unknownFrom, unknownTo]);

    // Lọc ngay khi gõ biển số, trong lúc chờ BE trả kết quả.
    const visibleUnknown = useInstantFilter(unknownList, unknownSearch, unknownSearch !== debouncedUnknownSearch || loading);

    useEffect(() => {
        if (guardMode || activeTab !== 'register') return undefined;
        const timer = setTimeout(() => fetchUsers(userSearch), 300);
        return () => clearTimeout(timer);
    }, [guardMode, activeTab, userSearch]);

    useEffect(() => {
        // Auto-refresh logic for Dashboard (history/unknown)
        let interval;
        if (activeTab === 'history' || activeTab === 'unknown') {
            interval = setInterval(() => {
                if (document.hidden) return;
                if (activeTab === 'history') fetchHistory();
                if (!guardMode && activeTab === 'unknown') fetchUnknown();
            }, ANPR_HISTORY_REFRESH_MS);
        }
        return () => clearInterval(interval);
    }, [
        guardMode,
        activeTab,
        filterMatchState,
        filterCamera,
        filterZone,
        filterVehicleType,
        debouncedSearch,
        startDate,
        endDate,
        historyPage,
        unknownPage,
        itemsPerPage,
        debouncedUnknownSearch,
        unknownDirection,
        unknownFlag,
        unknownView,
        unknownFrom,
        unknownTo,
    ]);

    return (
        <div data-page-surface="wide" className="max-w-6xl mx-auto space-y-6 animate-fade-in-up pb-10">
            <div>
                <span data-ui-text="badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-action-blue mb-2">
                    <Car className="w-3.5 h-3.5" />
                    Biển số
                </span>
                <h1 className="text-2xl font-bold text-midnight-indigo tracking-tight">Kiểm soát ra vào cổng</h1>
                <p className="text-slate-blue text-sm mt-1">
                    {guardMode
                        ? 'Theo dõi lượt xe ra vào và lọc theo kết quả nhận diện biển số.'
                        : 'Theo dõi lịch sử vào ra, quản lý biển lạ và đăng ký phương tiện cho nhân sự.'}
                </p>
            </div>

            {/* Guard cards filter the history table; administrators retain their tabs. */}
            {guardMode ? (
                <StatisticGrid columns={3}>
                    <StatisticCard label="Tất cả lượt xe" aria-label="Tất cả lượt xe" icon={Car}
                        value={recognitionCounts.ALL} selected={filterMatchState === 'ALL'}
                        onClick={() => selectRecognitionFilter('ALL')} />
                    <StatisticCard label="Khớp dữ liệu" aria-label="Khớp dữ liệu" icon={CheckCircle2} tone="success"
                        value={recognitionCounts.matched} selected={filterMatchState === 'matched'}
                        onClick={() => selectRecognitionFilter(filterMatchState === 'matched' ? 'ALL' : 'matched')} />
                    <StatisticCard label="Biển lạ" aria-label="Biển lạ" icon={AlertTriangle} tone="danger"
                        value={recognitionCounts.unmatched} selected={filterMatchState === 'unmatched'}
                        onClick={() => selectRecognitionFilter(filterMatchState === 'unmatched' ? 'ALL' : 'unmatched')} />
                </StatisticGrid>
            ) : (
            <div className="flex bg-white rounded-2xl border border-platinum-tint p-1 shadow-sm-2">
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-cloud-mist text-action-blue shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    📊 Lịch sử quét (Dashboard)
                </button>
                <button
                    onClick={() => setActiveTab('unknown')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'unknown' ? 'bg-cloud-mist text-sunset-gold shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    ⚠️ Biển số lạ
                </button>
                <button
                    onClick={() => setActiveTab('register')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'register' ? 'bg-cloud-mist text-action-blue shadow-sm border border-outline-gray' : 'text-slate-blue hover:bg-cloud-mist/50 hover:text-midnight-indigo'
                        }`}
                >
                    📝 Đăng ký xe nhân viên
                </button>
            </div>
            )}

            {/* TAB CONTENT: HISTORY */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-6 space-y-5 animate-fade-in">

                    {/* Header */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-midnight-indigo">Luồng xe vào ra hệ thống</h2>
                            <p className="text-xs text-slate-blue mt-0.5">Nhật ký nhận diện biển số qua camera ANPR · cập nhật mỗi giây</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">

                            <ReportActions>
                                {!guardMode && <ReportExportButton label="Xuất báo cáo"
                                    onClick={() => setIsExportOpen(true)}
                                    legacyClassName="inline-flex items-center gap-2 px-3 py-2 border border-platinum-tint bg-white text-slate-blue hover:text-midnight-indigo hover:bg-cloud-mist rounded-xl text-xs font-semibold transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Xuất báo cáo
                                </ReportExportButton>}
                                <RefreshButton
                                    onClick={() => fetchHistory()}
                                    disabled={loading}
                                    busy={loading}
                                />
                            </ReportActions>
                        </div>
                    </div>

                    {/* Filter bar */}
                    <FilterBar data-filter-grid variant="card" className="anpr-history-filters grid gap-4">
                        <div className="anpr-history-filter-main">
                            {/* Search */}
                            <FilterField label="Tìm kiếm"><div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Tìm theo biển số"
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-platinum-tint text-sm text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none bg-white transition-all"
                                />
                            </div></FilterField>

                            {/* Match state */}
                            <FilterField label="Kết quả nhận diện"><FilterMultiSelect singleSelect counts={matchStateCounts}
                                value={filterMatchState}
                                onChange={(e) => selectRecognitionFilter(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none bg-white transition-all"
                            >
                                <option value="ALL">Tất cả trạng thái</option>
                                <option value="matched">Khớp dữ liệu</option>
                                <option value="unmatched">Biển lạ</option>
                            </FilterMultiSelect></FilterField>

                            <FilterField label="Camera"><FilterMultiSelect counts={cameraCounts}
                                value={filterCamera}
                                onChange={(e) => setFilterCamera(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">Tất cả camera</option>
                                {cameraOptions.map((camera) => {
                                    const name = camera.deviceName || camera.device_name;
                                    return <option key={camera.id || name} value={name}>{name}</option>;
                                })}
                            </FilterMultiSelect></FilterField>

                            <FilterField label="Khu vực"><FilterMultiSelect counts={zoneCounts}
                                value={filterZone}
                                onChange={(e) => setFilterZone(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">Tất cả khu vực</option>
                                {zoneOptions.map((zone) => (
                                    <option key={zone.id} value={zone.id}>{zone.zoneName || zone.zone_name || zone.name}</option>
                                ))}
                            </FilterMultiSelect></FilterField>

                            <FilterField label="Loại phương tiện"><FilterMultiSelect counts={vehicleTypeCounts}
                                value={filterVehicleType}
                                onChange={(e) => setFilterVehicleType(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">Tất cả loại xe</option>
                                <option value="car">Ô tô</option>
                                <option value="motorbike">Xe máy</option>
                                <option value="truck">Xe tải</option>
                                <option value="bus">Xe buýt</option>
                            </FilterMultiSelect></FilterField>
                        </div>
                        <div className="anpr-history-filter-time">
                            <CalendarRangePresets from={startDate ? calendarRange('day', startDate).from : ''}
                                to={endDate ? calendarRange('day', endDate).from : ''}
                                onChange={range => { setDateRange([new Date(`${range.from}T00:00:00`), new Date(`${range.to}T00:00:00`)]); setHistoryPage(1); }} />
                            <div className="anpr-history-filter-dates">
                                <FilterField label="Từ ngày">
                                    <input type="date" value={startDate ? calendarRange('day', startDate).from : ''}
                                        max={endDate ? calendarRange('day', endDate).from : undefined}
                                        onChange={event => { const value = event.target.value; setDateRange(current => [value ? new Date(`${value}T00:00:00`) : null, current[1]]); setHistoryPage(1); }} />
                                </FilterField>
                                <FilterField label="Đến ngày">
                                    <input type="date" value={endDate ? calendarRange('day', endDate).from : ''}
                                        min={startDate ? calendarRange('day', startDate).from : undefined}
                                        onChange={event => { const value = event.target.value; setDateRange(current => [current[0], value ? new Date(`${value}T00:00:00`) : null]); setHistoryPage(1); }} />
                                </FilterField>
                            </div>
                            <div className="anpr-history-reset">
                                <button type="button" data-filter-action onClick={clearHistoryFilters}
                                    className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors">
                                    <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                                </button>
                            </div>
                        </div>
                    </FilterBar>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-platinum-tint">
                        <ResponsiveTable className="w-full min-w-[1100px] table-fixed text-left border-collapse">
                            <colgroup>
                                <col className="w-[11%]" />
                                <col className="w-[7%]" />
                                <col className="w-[15%]" />
                                <col className="w-[14%]" />
                                <col className="w-[9%]" />
                                <col className="w-[11%]" />
                                <col className="w-[23%]" />
                                <col className="w-[10%]" />
                            </colgroup>
                            <thead>
                                <tr className="bg-cloud-mist border-b border-platinum-tint">
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap">Thời điểm</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Hướng</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Camera</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Biển số</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Loại xe</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Đối soát</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap">Chủ xe</th>
                                    <th className="py-3 px-4 text-[11px] font-extrabold text-slate-blue uppercase tracking-wider whitespace-nowrap text-center">Ảnh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-platinum-tint">
                                {loading && visibleHistory.length === 0 ? (
                                    <tr><td colSpan="8" className="py-10 text-center text-slate-blue text-sm">Đang tải...</td></tr>
                                ) : visibleHistory.length === 0 ? (
                                    <tr><td colSpan="8" className="py-10 text-center text-slate-blue text-sm">Không có dữ liệu phù hợp.</td></tr>
                                ) : (
                                    visibleHistory.map((item, idx) => {
                                        const evtDate = item.eventTime ? new Date(item.eventTime) : null;
                                        const dir = item.direction;
                                        const isEnter = dir === 'enter' || dir === 'in' || dir === 'ENTRY';
                                        const isLeave = dir === 'leave' || dir === 'out' || dir === 'EXIT';

                                        return (
                                            <tr key={item.id || idx} className="hover:bg-cloud-mist/40 transition-colors">
                                                {/* Thời điểm */}
                                                <td className="py-3 px-2 whitespace-nowrap">
                                                    <p className="text-sm font-semibold text-midnight-indigo">
                                                        {evtDate ? evtDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                                                    </p>
                                                    <p data-ui-text="secondary" className="text-xs text-slate-blue mt-0.5 font-mono">
                                                        {evtDate ? evtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                                                    </p>
                                                </td>

                                                {/* Hướng */}
                                                <td className="py-3 px-2 text-center break-words">
                                                    {isEnter ? (
                                                        <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            ↓ Vào
                                                        </span>
                                                    ) : isLeave ? (
                                                        <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            ↑ Ra
                                                        </span>
                                                    ) : (
                                                        <span data-ui-text="badge" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
                                                            — Thấy
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Camera */}
                                                <td className="py-3 px-2 text-center break-words">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span data-ui-text="primary" className="text-xs font-semibold text-slate-blue">{item.cameraName || 'Chưa xác định'}</span>
                                                        <span data-ui-text="secondary" className="text-[11px] text-slate-blue">{item.zoneName || 'Chưa xác định'}</span>
                                                    </div>
                                                </td>

                                                {/* Biển số */}
                                                <td className="py-3 px-2 text-center break-words">
                                                    <div className="inline-flex flex-col items-center gap-1">
                                                        <span className="font-bold text-midnight-indigo border border-slate-300 px-2.5 py-0.5 rounded-md bg-white shadow-sm font-mono text-sm tracking-wider">
                                                            {item.plateNumber}
                                                        </span>
                                                        {item.isBlacklisted && (
                                                            <span data-ui-text="badge" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                                                                ⚠ Danh sách đen
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Loại xe */}
                                                <td className="py-3 px-2 text-center break-words">
                                                    <span data-ui-text="badge" className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-blue border border-platinum-tint">
                                                        {getVehicleTypeLabel(item.vehicleType || item.vehicle_type)}
                                                    </span>
                                                </td>

                                                {/* Đối soát */}
                                                <td className="py-3 px-2 text-center break-words">
                                                    {item.matchState === 'matched' ? (
                                                        <span data-ui-text="badge" className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Khớp</span>
                                                    ) : (
                                                        <span data-ui-text="badge" className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">Biển lạ</span>
                                                    )}
                                                </td>

                                                {/* Chủ xe */}
                                                <td className="py-3 px-2 break-words">
                                                    {item.owner ? (
                                                        <div
                                                            className="flex min-w-0 w-full items-center gap-1.5 cursor-pointer hover:bg-slate-50 px-1 py-1.5 rounded-lg transition-colors group"
                                                            onClick={() => { setSelectedOwner(item.owner); setIsOwnerModalOpen(true); }}
                                                        >
                                                            <UserAvatar
                                                                user={item.owner}
                                                                name={item.owner.fullName}
                                                                className="w-8 h-8 rounded-full text-xs shadow-sm border border-platinum-tint group-hover:border-action-blue flex-shrink-0"
                                                            />
                                                            <span data-ui-text="primary" className="min-w-0 text-xs font-semibold text-action-blue group-hover:text-blue-700 whitespace-normal break-words" title={item.owner.fullName}>
                                                                {item.owner.fullName}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span data-ui-text="secondary" className="text-xs text-slate-400 font-medium px-2">Không xác định</span>
                                                    )}
                                                </td>

                                                {/* Ảnh */}
                                                <td className="py-3 px-2">
                                                    <div className="flex justify-center">
                                                        <ThumbnailImage
                                                            eventId={item.id}
                                                            className="w-full max-w-[92px] aspect-video"
                                                            onClick={() => { setSnapshotItem(item); setSnapshotEventId(item.id); setIsSnapshotOpen(true); }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </ResponsiveTable>
                    </div>

                    {/* Pagination */}
                    <PaginationFooter
                        currentPage={historyPage}
                        totalPages={Math.ceil(historyTotal / itemsPerPage)}
                        totalItems={historyTotal}
                        pageSize={itemsPerPage}
                        onPageChange={setHistoryPage}
                        itemLabel={"lượt quét"}
                        loading={loading}
                     onPageSizeChange={size => { setItemsPerPage(size); setHistoryPage(1); setUnknownPage(1); }} />
                </div>
            )}

            {/* TAB CONTENT: UNKNOWN VEHICLES */}
            {!guardMode && activeTab === 'unknown' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-6 space-y-6 animate-fade-in">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-midnight-indigo">Danh sách biển số lạ</h2>
                            <p className="text-xs text-slate-blue mt-1">Những phương tiện đi qua camera nhưng không khớp với bất kỳ đăng ký nào trong hệ thống.</p>
                        </div>
                        <RefreshButton onClick={() => fetchUnknown()} disabled={loading} busy={loading} />
                    </div>

                    {/* Thẻ số liệu theo bộ lọc hiện tại; thẻ danh sách kiểm soát bấm để lọc nhanh */}
                    <StatisticGrid columns={4}>
                        <StatisticCard label="Lượt biển lạ" aria-label="Lượt biển lạ" icon={AlertTriangle}
                            value={unknownStats?.total ?? '—'} helper="lượt xe không khớp đăng ký"
                            selected={activeUnknownCard === 'all'} onClick={() => selectUnknownCard('all')} />
                        <StatisticCard label="Thuộc danh sách kiểm soát" aria-label="Thuộc danh sách kiểm soát" icon={ShieldAlert} tone="danger"
                            value={unknownStats?.controlled ?? '—'} helper="lượt cần chú ý"
                            selected={activeUnknownCard === 'controlled'}
                            onClick={() => selectUnknownCard(activeUnknownCard === 'controlled' ? 'all' : 'controlled')} />
                        <StatisticCard label="Biển số khác nhau" aria-label="Biển số khác nhau" icon={Car}
                            value={unknownStats?.distinctPlates ?? '—'} helper="mỗi biển một dòng, lần gần nhất"
                            selected={activeUnknownCard === 'distinct'}
                            onClick={() => selectUnknownCard(activeUnknownCard === 'distinct' ? 'all' : 'distinct')} />
                        <StatisticCard label="Xuất hiện nhiều lần" aria-label="Xuất hiện nhiều lần" icon={Repeat} tone="warning"
                            value={unknownStats?.repeatPlates ?? '—'} helper="biển qua cổng từ 2 lần trở lên"
                            selected={activeUnknownCard === 'repeat'}
                            onClick={() => selectUnknownCard(activeUnknownCard === 'repeat' ? 'all' : 'repeat')} />
                    </StatisticGrid>

                    {/* Bộ lọc */}
                    <FilterBar data-filter-grid variant="card" className="anpr-history-filters anpr-unknown-filters grid gap-4">
                        <div className="anpr-history-filter-main">
                            <FilterField label="Tìm kiếm"><div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Tìm theo biển số"
                                    value={unknownSearch}
                                    onChange={(e) => updateUnknownFilter(setUnknownSearch)(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-platinum-tint text-sm text-midnight-indigo focus:border-action-blue focus:ring-2 focus:ring-action-blue/20 outline-none"
                                />
                            </div></FilterField>
                            <FilterField label="Hướng"><FilterMultiSelect singleSelect
                                value={unknownDirection}
                                onChange={(e) => updateUnknownFilter(setUnknownDirection)(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">{withCount('Tất cả hướng', unknownFacets?.direction?.all)}</option>
                                <option value="in">{withCount('Vào', unknownFacets?.direction?.in)}</option>
                                <option value="out">{withCount('Ra', unknownFacets?.direction?.out)}</option>
                            </FilterMultiSelect></FilterField>
                            <FilterField label="Danh sách kiểm soát"><FilterMultiSelect singleSelect
                                value={unknownFlag}
                                onChange={(e) => updateUnknownFilter(setUnknownFlag)(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">{withCount('Tất cả biển lạ', unknownFacets?.flag?.all)}</option>
                                <option value="controlled">{withCount('Có trong danh sách kiểm soát', unknownFacets?.flag?.controlled)}</option>
                                <option value="normal">{withCount('Không có trong danh sách', unknownFacets?.flag?.normal)}</option>
                            </FilterMultiSelect></FilterField>
                            <FilterField label="Hiển thị"><FilterMultiSelect singleSelect
                                value={unknownView}
                                onChange={(e) => updateUnknownFilter(setUnknownView)(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-platinum-tint text-sm font-semibold text-midnight-indigo bg-white outline-none"
                            >
                                <option value="">{withCount('Từng lượt qua cổng', unknownFacets?.view?.all)}</option>
                                <option value="distinct">{withCount('Mỗi biển một dòng', unknownFacets?.view?.distinct)}</option>
                                <option value="repeat">{withCount('Biển lặp lại', unknownFacets?.view?.repeat)}</option>
                            </FilterMultiSelect></FilterField>
                        </div>
                        <div className="anpr-history-filter-time">
                            <CalendarRangePresets from={unknownFrom} to={unknownTo}
                                onChange={range => { setUnknownFrom(range.from); setUnknownTo(range.to); setUnknownPage(1); }} />
                            <div className="anpr-history-filter-dates">
                                <FilterField label="Từ ngày">
                                    <input type="date" value={unknownFrom} max={unknownTo || undefined}
                                        onChange={(e) => updateUnknownFilter(setUnknownFrom)(e.target.value)} />
                                </FilterField>
                                <FilterField label="Đến ngày">
                                    <input type="date" value={unknownTo} min={unknownFrom || undefined}
                                        onChange={(e) => updateUnknownFilter(setUnknownTo)(e.target.value)} />
                                </FilterField>
                            </div>
                            <div className="anpr-history-reset">
                                <button type="button" data-filter-action onClick={clearUnknownFilters}
                                    className="w-full px-4 py-2 bg-cloud-mist/50 text-slate-blue font-semibold rounded-xl text-sm hover:bg-cloud-mist border border-platinum-tint transition-colors">
                                    <Filter className="w-4 h-4 inline mr-2" /> Xóa bộ lọc
                                </button>
                            </div>
                        </div>
                    </FilterBar>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loading && visibleUnknown.length === 0 && !hasUnknownFilters ? (
                            <div className="col-span-full py-8 text-center text-slate-blue">Đang tải...</div>
                        ) : visibleUnknown.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-slate-blue bg-cloud-mist rounded-xl border border-dashed border-outline-gray">
                                {hasUnknownFilters ? 'Không có biển số lạ nào khớp bộ lọc.' : 'Không có cảnh báo biển lạ nào hiện tại.'}
                            </div>
                        ) : (
                            visibleUnknown.map((item, idx) => (
                                <div key={item.id || idx} className="p-4 rounded-xl border border-orange-200 bg-orange-50 flex items-start gap-4 shadow-sm">
                                    <div className="w-12 h-12 rounded-full bg-white border border-orange-200 flex items-center justify-center flex-shrink-0 text-xl shadow-sm">
                                        ⚠️
                                    </div>
                                    <div>
                                        <div className="flex items-center flex-wrap gap-2">
                                            <span className="font-bold text-midnight-indigo border border-steel-gray px-2 py-0.5 rounded bg-white font-mono text-sm shadow-sm">{item.plateNumber}</span>
                                            {item.sightingCount > 1 && (
                                                <span data-ui-text="badge" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                    <Repeat className="w-3 h-3" /> {item.sightingCount} lần
                                                </span>
                                            )}
                                            {item.isBlacklisted && (
                                                <span data-ui-text="badge" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200" title="Chỉ hiện cho lượt đầu tiên trong 5 phút">
                                                    ⚠️ Danh sách đen
                                                </span>
                                            )}
                                        </div>
                                        <p data-ui-text="primary" className="text-xs font-semibold text-slate-blue mt-2">Phát hiện lúc:</p>
                                        <p className="text-sm font-bold text-midnight-indigo">{new Date(item.eventTime).toLocaleString('vi-VN')}</p>
                                        <div className="mt-1 space-y-0.5 text-xs text-slate-blue">
                                            <p><span className="font-semibold">Khu vực/cổng:</span> {item.zoneName || 'Chưa xác định'}</p>
                                            <p><span className="font-semibold">Camera:</span> {item.cameraName || 'Chưa xác định'}</p>
                                        </div>
                                        <ThumbnailImage
                                            eventId={item.id}
                                            className="w-full h-24 mt-3 object-cover shadow-sm border border-orange-200 rounded-lg hover:border-action-blue"
                                            onClick={() => {
                                                setSnapshotItem(item);
                                                setSnapshotEventId(item.id);
                                                setIsSnapshotOpen(true);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination Unknown */}
                    {<PaginationRegion legacyVisible={!loading && Math.ceil(unknownTotal / itemsPerPage) > 1}><PaginationFooter
                            currentPage={unknownPage}
                            totalPages={Math.ceil(unknownTotal / itemsPerPage)}
                            totalItems={unknownTotal}
                            pageSize={itemsPerPage}
                            onPageChange={setUnknownPage}
                            itemLabel={unknownView ? 'biển số' : 'lượt biển lạ'}
                         onPageSizeChange={size => { setItemsPerPage(size); setHistoryPage(1); setUnknownPage(1); }} /></PaginationRegion>}
                </div>
            )}

            {/* TAB CONTENT: REGISTER */}
            {!guardMode && activeTab === 'register' && (
                <div className="bg-white rounded-2xl border border-platinum-tint shadow-sm-2 p-8 animate-fade-in max-w-2xl mx-auto">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-midnight-indigo">Đăng ký xe cho nhân viên</h2>
                        <p className="text-xs text-slate-blue mt-1">Đăng ký phương tiện cho nhân viên để đối chiếu khi xe ra vào cổng.</p>
                    </div>

                    <form onSubmit={handleRegisterVehicle} className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Chọn nhân viên *</label>
                            <input
                                type="search"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Gõ tên, email hoặc mã nhân viên..."
                                className="w-full mb-2 bg-white px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                            />
                            <select
                                required
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="w-full bg-white px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                            >
                                <option value="" disabled>-- Nhấn để chọn nhân viên --</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.fullName} - {u.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Biển số xe *</label>
                            <input
                                type="text"
                                required
                                value={regPlate}
                                onChange={(e) => setRegPlate(e.target.value.toUpperCase())}
                                placeholder="VD: 30A-123.45"
                                className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm font-mono outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Loại phương tiện *</label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${regType === 'CAR' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                    <input type="radio" value="CAR" checked={regType === 'CAR'} onChange={() => setRegType('CAR')} className="hidden" />
                                    <span>🚗 Ô tô</span>
                                </label>
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${regType === 'MOTORBIKE' ? 'border-action-blue bg-blue-50 text-action-blue font-bold shadow-sm' : 'border-platinum-tint text-slate-blue hover:bg-cloud-mist'}`}>
                                    <input type="radio" value="MOTORBIKE" checked={regType === 'MOTORBIKE'} onChange={() => setRegType('MOTORBIKE')} className="hidden" />
                                    <span>🏍 Xe máy</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-midnight-indigo mb-1.5">Ghi chú (Tùy chọn)</label>
                            <input
                                type="text"
                                value={regNote}
                                onChange={(e) => setRegNote(e.target.value)}
                                placeholder="Ghi chú thêm..."
                                className="w-full px-4 py-2.5 rounded-xl border border-platinum-tint focus:border-action-blue focus:ring-1 focus:ring-action-blue text-sm outline-none"
                            />
                        </div>

                        <div className="pt-4 text-right">
                            <button
                                type="submit"
                                className="px-6 py-2.5 rounded-xl bg-action-blue hover:bg-glacier-blue text-white font-bold shadow-sm transition-colors text-sm"
                            >
                                Xác nhận Đăng ký
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <EventSnapshotModal 
                isOpen={isSnapshotOpen} 
                eventId={snapshotEventId} 
                showPlate
                details={snapshotItem ? [
                    { label: 'Biển số xe', value: snapshotItem.plateNumber },
                    { label: 'Loại đối tượng', value: getVehicleTypeLabel(snapshotItem.vehicleType || snapshotItem.vehicle_type) },
                    { label: 'Camera', value: snapshotItem.cameraName },
                    { label: 'Khu vực/cổng', value: snapshotItem.zoneName },
                    { label: 'Thời gian', value: snapshotItem.eventTime ? new Date(snapshotItem.eventTime).toLocaleString('vi-VN') : null },
                    ...(snapshotItem.owner?.fullName ? [{ label: 'Chủ xe', value: snapshotItem.owner.fullName }] : []),
                ] : null}
                onClose={() => {
                    setIsSnapshotOpen(false);
                    setSnapshotItem(null);
                    setSnapshotEventId(null);
                }} 
            />

            {/* Inline Owner Profile Modal */}
            {isOwnerModalOpen && selectedOwner && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-midnight-indigo/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-slide-up relative">
                        <div className="flex items-center justify-between p-5 border-b border-platinum-tint bg-cloud-mist">
                            <h3 className="text-lg font-bold text-midnight-indigo">Thông tin Chủ xe</h3>
                            <button
                                onClick={() => {
                                    setIsOwnerModalOpen(false);
                                    setSelectedOwner(null);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-midnight-indigo hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="flex flex-col items-center">
                                <UserAvatar 
                                    user={selectedOwner} 
                                    className="w-24 h-24 rounded-full text-3xl mb-4 border-4 border-cloud-mist shadow-sm"
                                />
                                <h4 className="text-xl font-bold text-midnight-indigo text-center">{selectedOwner.fullName || 'Không có tên'}</h4>

                                <div className="w-full mt-6 space-y-4">
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Briefcase className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p data-ui-text="primary" className="text-xs font-semibold text-slate-blue">Phòng ban</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.department || 'Chưa cung cấp'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p data-ui-text="secondary" className="text-xs font-semibold text-slate-blue">Email</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.email || 'Chưa cung cấp'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-action-blue shadow-sm">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p data-ui-text="primary" className="text-xs font-semibold text-slate-blue">Số điện thoại</p>
                                            <p className="text-sm font-bold text-midnight-indigo">{selectedOwner.phoneNumber || 'Chưa cung cấp'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ExportModeDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)}
                title="Xuất báo cáo phương tiện" pdfPrint formats={['xlsx', 'pdf', 'docx']} reportType="vehicle"
                initialRange={{ from: startDate ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}` : '', to: endDate ? `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}` : '' }}
                editableRange={!startDate || !endDate}
                filterSummary={[debouncedSearch ? `Tìm kiếm: ${debouncedSearch}` : 'Tất cả biển số', filterCamera ? `Camera: ${filterCamera}` : 'Tất cả camera', filterZone ? `Khu vực: ${filterValues(filterZone).map(value => { const zone = zoneOptions.find(item => item.id === value); return zone?.zoneName || zone?.name || 'Khu vực đã chọn'; }).join(', ')}` : 'Tất cả khu vực', filterVehicleType ? `Loại xe: ${filterValues(filterVehicleType).map(getVehicleTypeLabel).join(', ')}` : 'Tất cả loại xe', filterMatchState !== 'ALL' ? `Kết quả nhận diện: ${(filterValues(filterMatchState).map(value => value === 'matched' ? 'Khớp' : 'Biển lạ').join(', '))}` : 'Tất cả kết quả nhận diện']}
                onConfirm={async (extra, options) => {
                    await exportAnprHistoryReport({ format: options.format, standard: extra, range: options.range,
                        filters: { ...(filterMatchState !== 'ALL' ? { matchState: filterMatchState } : {}), ...(filterCamera ? { cameraName: filterCamera } : {}), ...(filterZone ? { zoneId: filterZone } : {}), ...(filterVehicleType ? { vehicleType: expandVehicleType(filterVehicleType) } : {}), ...(debouncedSearch ? { plateNumber: debouncedSearch, ownerName: debouncedSearch } : {}) },
                        filterSummary: [filterCamera ? `Camera: ${filterCamera}` : 'Tất cả camera', filterMatchState !== 'ALL' ? `Đối soát: ${filterValues(filterMatchState).map(value => value === 'matched' ? 'Khớp' : 'Biển lạ').join(', ')}` : 'Tất cả trạng thái đối soát'] });
                    setIsExportOpen(false);
                }} />
        </div>
    );
};

export default ANPRManagement;
