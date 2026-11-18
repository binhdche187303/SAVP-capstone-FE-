import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, MapPin, Cpu, Car, User, Calendar } from 'lucide-react';
import { globalSearch } from '../../service/searchService';

const SEARCH_TYPES = ['zone', 'device', 'vehicle', 'user', 'meeting'];

const TYPE_META = {
    zone: { label: 'Khu vực', icon: MapPin },
    device: { label: 'Thiết bị', icon: Cpu },
    vehicle: { label: 'Phương tiện', icon: Car },
    user: { label: 'Người dùng', icon: User },
    meeting: { label: 'Cuộc họp', icon: Calendar },
};

// Route sẵn có theo từng role — type nào role đó chưa có trang tương ứng thì để null (item hiện nhưng không điều hướng được)
const ROUTE_BY_BASEPATH = {
    '/system-admin': { zone: 'zones', device: 'devices', vehicle: 'vehicle-control-list', user: null, meeting: 'meeting' },
    '/business-admin': { zone: 'zones', device: null, vehicle: 'vehicle-control-list', user: 'users', meeting: 'meeting' },
    '/manager': { zone: null, device: null, vehicle: null, user: null, meeting: 'meeting' },
    '/employee': { zone: null, device: null, vehicle: null, user: null, meeting: 'meeting' },
};

const getItemLabel = (type, item) => {
    switch (type) {
        case 'zone':
            return item.zoneName || item.zone_name || item.name || 'Khu vực';
        case 'device':
            return item.deviceCode || item.code || item.name || 'Thiết bị';
        case 'vehicle':
            return item.plateNumber || item.plate_raw || item.plate || 'Phương tiện';
        case 'user':
            return item.fullName || item.full_name || item.email || 'Người dùng';
        case 'meeting':
            return item.title || item.subject || 'Cuộc họp';
        default:
            return item.name || item.id;
    }
};

const GlobalSearchBar = ({ basePath }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const runSearch = useCallback(async (q) => {
        setLoading(true);
        try {
            const res = await globalSearch(q, SEARCH_TYPES);
            if (res?.success) {
                setResults(res.data);
            } else {
                setResults(null);
            }
        } catch {
            setResults(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleChange = (e) => {
        const value = e.target.value;
        setQuery(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        const trimmed = value.trim();
        if (trimmed.length < 2) {
            setResults(null);
            setIsOpen(trimmed.length > 0);
            return;
        }

        setIsOpen(true);
        debounceRef.current = setTimeout(() => runSearch(trimmed), 300);
    };

    const handleClear = () => {
        setQuery('');
        setResults(null);
        setIsOpen(false);
    };

    const handleResultClick = (type, item) => {
        const routeSegment = ROUTE_BY_BASEPATH[basePath]?.[type];
        if (!routeSegment) return;
        if (type === 'meeting') {
            navigate(`${basePath}/${routeSegment}/${item.id}`);
        } else {
            navigate(`${basePath}/${routeSegment}`);
        }
        setIsOpen(false);
    };

    const typeEntries = results ? Object.entries(results).filter(([, group]) => group?.items?.length > 0) : [];
    const hasAnyResult = typeEntries.length > 0;

    return (
        <div ref={containerRef} className="relative hidden md:block w-full max-w-xs">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-blue pointer-events-none" />
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onFocus={() => query.trim().length > 0 && setIsOpen(true)}
                    placeholder="Tìm khu vực, thiết bị, xe, người dùng..."
                    aria-label="Tìm kiếm toàn hệ thống"
                    className="w-full h-10 pl-9 pr-8 rounded-lg border border-platinum-tint bg-cloud-mist/60 text-sm text-midnight-indigo placeholder:text-slate-blue focus:outline-none focus:ring-2 focus:ring-action-blue focus:border-action-blue transition-all duration-200"
                />
                {query && (
                    <button
                        type="button"
                        aria-label="Xóa tìm kiếm"
                        onClick={handleClear}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-blue hover:text-midnight-indigo"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-platinum-tint rounded-xl shadow-sm-2 z-50">
                    {query.trim().length < 2 ? (
                        <p className="p-4 text-sm text-slate-blue text-center">Nhập tối thiểu 2 ký tự để tìm kiếm.</p>
                    ) : loading ? (
                        <p className="p-4 text-sm text-slate-blue text-center">Đang tìm kiếm...</p>
                    ) : !hasAnyResult ? (
                        <p className="p-4 text-sm text-slate-blue text-center">Không tìm thấy kết quả phù hợp.</p>
                    ) : (
                        <div className="py-2">
                            {typeEntries.map(([type, group]) => {
                                const meta = TYPE_META[type] || { label: type, icon: Search };
                                const Icon = meta.icon;
                                const clickable = Boolean(ROUTE_BY_BASEPATH[basePath]?.[type]);
                                return (
                                    <div key={type} className="px-2 py-1">
                                        <p className="px-2 py-1 text-[11px] font-bold uppercase text-slate-blue tracking-wide">{meta.label}</p>
                                        {group.items.map((item, idx) => (
                                            <button
                                                key={item.id || idx}
                                                type="button"
                                                onClick={() => handleResultClick(type, item)}
                                                disabled={!clickable}
                                                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left text-sm transition-colors ${clickable ? 'hover:bg-cloud-mist cursor-pointer text-midnight-indigo' : 'text-slate-blue cursor-default'}`}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0 text-slate-blue" />
                                                <span className="truncate">{getItemLabel(type, item)}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearchBar;
