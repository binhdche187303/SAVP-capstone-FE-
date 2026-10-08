export const GUARD_GATE_EVENTS_STORAGE_KEY = 'smartracking_guard_gate_events_v8';

export const guardGates = [
    { id: 'main-in', name: 'Cổng chính', direction: 'in', cameraName: 'Camera cổng chính - vào' },
    { id: 'main-out', name: 'Cổng chính', direction: 'out', cameraName: 'Camera cổng chính - ra' },
    { id: 'side-in', name: 'Cổng phụ', direction: 'in', cameraName: 'Camera cổng phụ - vào' },
    { id: 'side-out', name: 'Cổng phụ', direction: 'out', cameraName: 'Camera cổng phụ - ra' }
];

const knownPeople = [
    {
        id: 'EMP003',
        code: 'NV003',
        name: 'Bùi Văn Long',
        role: 'Nhân viên',
        accessMatched: true,
        plateNumber: '51F-004.88'
    },
    {
        id: 'TEACHER001',
        code: 'GV001',
        name: 'Nguyễn Thị Giang',
        role: 'Giảng viên',
        accessMatched: true,
        plateNumber: '30A-123.45'
    },
    {
        id: 'STUDENT001',
        code: 'SV001',
        name: 'Lê Minh Sinh',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '29H-167.89'
    },
    {
        id: 'EMP004',
        code: 'NV004',
        name: 'Trần Minh Quân',
        role: 'Nhân viên',
        accessMatched: true,
        plateNumber: '30F-228.16'
    },
    {
        id: 'EMP005',
        code: 'NV005',
        name: 'Phạm Thu Hà',
        role: 'Nhân viên',
        accessMatched: true,
        plateNumber: '29C-778.21'
    },
    {
        id: 'TEACHER002',
        code: 'GV002',
        name: 'Hoàng Anh Tuấn',
        role: 'Giảng viên',
        accessMatched: true,
        plateNumber: '51G-552.90'
    },
    {
        id: 'TEACHER003',
        code: 'GV003',
        name: 'Vũ Thị Mai',
        role: 'Giảng viên',
        accessMatched: true,
        plateNumber: '60A-112.35'
    },
    {
        id: 'STUDENT002',
        code: 'SV002',
        name: 'Nguyễn Hoàng Nam',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '36B-901.45'
    },
    {
        id: 'STUDENT003',
        code: 'SV003',
        name: 'Ngô Thị Lan',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '18A-334.02'
    },
    {
        id: 'STUDENT004',
        code: 'SV004',
        name: 'Đỗ Gia Huy',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '43D-610.88'
    },
    {
        id: 'STUDENT005',
        code: 'SV005',
        name: 'Trần Ngọc Mai',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '29B-445.10'
    },
    {
        id: 'STUDENT006',
        code: 'SV006',
        name: 'Phạm Đức Anh',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '30K-773.22'
    },
    {
        id: 'STUDENT007',
        code: 'SV007',
        name: 'Võ Minh Thảo',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '51H-908.71'
    },
    {
        id: 'STUDENT008',
        code: 'SV008',
        name: 'Lê Đăng Khoa',
        role: 'Sinh viên',
        accessMatched: true,
        plateNumber: '59C-221.36'
    },
    {
        id: 'GUARD001',
        code: 'BV001',
        name: 'Nguyễn Văn Bảo Vệ',
        role: 'Bảo vệ',
        accessMatched: true,
        plateNumber: '30M-115.77'
    },
    {
        id: 'VISITOR001',
        code: 'UNK-001',
        name: 'Người lạ chưa xác định',
        role: 'Người lạ',
        accessMatched: false,
        plateNumber: '59X-000.00'
    }
];

const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const startOfLocalDay = (value) => {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) {
        const fallback = new Date();
        fallback.setHours(0, 0, 0, 0);
        return fallback;
    }
    date.setHours(0, 0, 0, 0);
    return date;
};

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const getPresenceRange = ({ rangeMode = 'day', anchorDate = todayKey() } = {}) => {
    const anchor = startOfLocalDay(anchorDate);
    if (rangeMode === 'week') {
        const day = anchor.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const start = addDays(anchor, mondayOffset);
        const end = addDays(start, 7);
        return { start, end };
    }
    return { start: anchor, end: addDays(anchor, 1) };
};

const isEventInRange = (event, range) => {
    const time = new Date(event?.occurredAt).getTime();
    return Number.isFinite(time) && time >= range.start.getTime() && time < range.end.getTime();
};

const formatTime = (date) => new Date(date).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
});

const formatDate = (date) => new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

const formatDuration = (minutes) => {
    const safeMinutes = Math.max(0, Math.round(minutes || 0));
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    if (!hours) return `${mins} phút`;
    if (!mins) return `${hours} giờ`;
    return `${hours} giờ ${mins} phút`;
};

const buildSnapshot = (person, gate, status, plateNumber = person.plateNumber) => {
    const color = status === 'authorized' ? '#059669' : '#dc2626';
    const initial = (person.name || '?').trim().charAt(0).toUpperCase();
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="360" height="210" viewBox="0 0 360 210">
            <rect width="360" height="210" rx="16" fill="#101827"/>
            <rect x="16" y="16" width="328" height="178" rx="12" fill="#1f2937" stroke="#334155"/>
            <text x="180" y="34" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" fill="#93c5fd">CAMAI GATE FACEID</text>
            <circle cx="180" cy="94" r="34" fill="${color}"/>
            <text x="180" y="105" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff">${initial}</text>
            <text x="180" y="145" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#fff">${person.code}</text>
            <text x="180" y="164" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="#bfdbfe">${plateNumber || '--'}</text>
            <text x="180" y="181" text-anchor="middle" font-family="Arial" font-size="11" fill="#cbd5e1">${gate.name} - ${gate.direction === 'in' ? 'VÀO' : 'RA'}</text>
            <text x="180" y="195" text-anchor="middle" font-family="Arial" font-size="9" fill="#94a3b8">${new Date().toLocaleString('vi-VN')}</text>
        </svg>
    `;
    return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
};

const seedEvents = () => {
    const now = Date.now();
    const base = [
        { personIndex: 14, gateId: 'main-in', minutesAgo: 520, status: 'authorized' },
        { personIndex: 14, gateId: 'main-out', minutesAgo: 35, status: 'authorized' },
        { personIndex: 0, gateId: 'main-in', minutesAgo: 485, status: 'authorized' },
        { personIndex: 0, gateId: 'main-out', minutesAgo: 70, status: 'authorized' },
        { personIndex: 1, gateId: 'main-in', minutesAgo: 360, status: 'authorized' },
        { personIndex: 1, gateId: 'main-out', minutesAgo: 42, status: 'authorized' },
        { personIndex: 2, gateId: 'side-in', minutesAgo: 310, status: 'authorized' },
        { personIndex: 2, gateId: 'side-out', minutesAgo: 18, status: 'authorized' },
        { personIndex: 3, gateId: 'main-in', minutesAgo: 185, status: 'authorized' },
        { personIndex: 4, gateId: 'side-in', minutesAgo: 215, status: 'authorized' },
        { personIndex: 4, gateId: 'side-out', minutesAgo: 50, status: 'authorized' },
        { personIndex: 5, gateId: 'main-in', minutesAgo: 240, status: 'authorized' },
        { personIndex: 5, gateId: 'main-out', minutesAgo: 35, status: 'authorized' },
        { personIndex: 6, gateId: 'main-in', minutesAgo: 64, status: 'authorized' },
        { personIndex: 7, gateId: 'side-in', minutesAgo: 118, status: 'authorized' },
        { personIndex: 7, gateId: 'side-out', minutesAgo: 18, status: 'authorized' },
        { personIndex: 8, gateId: 'main-in', minutesAgo: 92, status: 'authorized' },
        { personIndex: 9, gateId: 'side-in', minutesAgo: 76, status: 'authorized' },
        { personIndex: 10, gateId: 'main-in', minutesAgo: 140, status: 'authorized' },
        { personIndex: 10, gateId: 'main-out', minutesAgo: 20, status: 'authorized' },
        { personIndex: 11, gateId: 'main-in', minutesAgo: 104, status: 'authorized' },
        { personIndex: 12, gateId: 'side-in', minutesAgo: 88, status: 'authorized' },
        { personIndex: 15, gateId: 'main-in', minutesAgo: 55, status: 'denied', plateStatus: 'unknown' },
        { personIndex: 8, gateId: 'main-in', minutesAgo: 46, status: 'denied', plateNumber: '98A-999.99', plateStatus: 'mismatch' },
        { personIndex: 1, gateId: 'main-in', minutesAgo: 1510, status: 'authorized' },
        { personIndex: 1, gateId: 'main-out', minutesAgo: 1420, status: 'authorized' },
        { personIndex: 2, gateId: 'side-in', minutesAgo: 2960, status: 'authorized' },
        { personIndex: 2, gateId: 'side-out', minutesAgo: 2865, status: 'authorized' },
        { personIndex: 6, gateId: 'main-in', minutesAgo: 4210, status: 'authorized' },
        { personIndex: 6, gateId: 'main-out', minutesAgo: 4100, status: 'authorized' },
        { personIndex: 9, gateId: 'side-in', minutesAgo: 5820, status: 'authorized' },
        { personIndex: 9, gateId: 'side-out', minutesAgo: 5660, status: 'authorized' },
        { personIndex: 11, gateId: 'main-in', minutesAgo: 7260, status: 'authorized' },
        { personIndex: 11, gateId: 'main-out', minutesAgo: 7040, status: 'authorized' }
    ];

    return base.map((item, index) => {
        const person = knownPeople[item.personIndex];
        const gate = guardGates.find(g => g.id === item.gateId) || guardGates[0];
        const occurredAt = new Date(now - item.minutesAgo * 60 * 1000).toISOString();
        return {
            id: `seed-${todayKey()}-${index}`,
            userId: person.role === 'Người lạ' ? null : person.id,
            personCode: person.code,
            personName: person.name,
            personRole: person.role,
            gateId: gate.id,
            gateName: gate.name,
            cameraName: gate.cameraName,
            direction: gate.direction,
            occurredAt,
            dateText: formatDate(occurredAt),
            timeText: formatTime(occurredAt),
            status: item.status,
            statusLabel: item.status === 'authorized' ? 'Hợp lệ' : 'Từ chối',
            reason: item.status === 'authorized'
                ? 'FaceID và biển số hợp lệ, được phép ra/vào khuôn viên.'
                : item.plateStatus === 'mismatch'
                    ? 'FaceID hợp lệ nhưng biển số không khớp hồ sơ.'
                    : 'Không nhận diện được hồ sơ hợp lệ.',
            accessMatched: person.accessMatched,
            plateNumber: item.plateNumber || person.plateNumber,
            plateStatus: item.plateStatus || (item.status === 'authorized' ? 'matched' : 'unknown'),
            snapshot: buildSnapshot(person, gate, item.status, item.plateNumber || person.plateNumber),
            presenceDurationMinutes: null,
            presenceDurationText: '--'
        };
    });
};

export const getGuardGateEvents = () => {
    try {
        const raw = localStorage.getItem(GUARD_GATE_EVENTS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    const seeded = seedEvents();
    localStorage.setItem(GUARD_GATE_EVENTS_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
};

export const saveGuardGateEvents = (events) => {
    localStorage.setItem(GUARD_GATE_EVENTS_STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new Event('guard-gate-events-updated'));
};

export const clearGuardGateEvents = () => {
    const seeded = seedEvents();
    saveGuardGateEvents(seeded);
    return seeded;
};

const getLastAuthorizedDirection = (events, personId) => {
    const latest = events
        .filter(event => event.userId === personId && event.status === 'authorized')
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
    return latest?.direction || null;
};

const isPersonPresent = (events, person) => getLastAuthorizedDirection(events, person.id) === 'in';

const findLatestOpenEntry = (events, personId) => {
    const authorizedEvents = events
        .filter(event => event.userId === personId && event.status === 'authorized')
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    return authorizedEvents.find(event => event.direction === 'in') || null;
};

const buildPersonPresence = (events, person, now = Date.now(), range = getPresenceRange()) => {
    const rangeEvents = events
        .filter(event => event.userId === person.id && event.status === 'authorized' && isEventInRange(event, range))
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    let lastEntry = null;
    let totalMinutes = 0;
    let lastEvent = null;

    rangeEvents.forEach(event => {
        lastEvent = event;
        if (event.direction === 'in') {
            lastEntry = event;
            return;
        }
        if (event.direction === 'out' && lastEntry) {
            totalMinutes += (new Date(event.occurredAt).getTime() - new Date(lastEntry.occurredAt).getTime()) / 60000;
            lastEntry = null;
        }
    });

    if (lastEntry) {
        const rangeEndTime = Math.min(now, range.end.getTime());
        totalMinutes += (rangeEndTime - new Date(lastEntry.occurredAt).getTime()) / 60000;
    }
    const rangeIncludesNow = range.start.getTime() <= now && now < range.end.getTime();

    return {
        userId: person.id,
        personCode: person.code,
        personName: person.name,
        personRole: person.role,
        isPresent: Boolean(lastEntry) && rangeIncludesNow,
        isOpenInRange: Boolean(lastEntry),
        lastDirection: lastEvent?.direction || null,
        lastGateName: lastEvent?.gateName || '--',
        plateNumber: person.plateNumber,
        lastSeenAt: lastEvent?.occurredAt || null,
        lastSeenText: lastEvent ? `${formatTime(lastEvent.occurredAt)} · ${lastEvent.direction === 'in' ? 'Vào' : 'Ra'}` : 'Chưa ghi nhận hôm nay',
        totalPresenceMinutes: Math.max(0, Math.round(totalMinutes)),
        totalPresenceText: totalMinutes > 0 ? formatDuration(totalMinutes) : '--'
    };
};

const buildAccessCheckText = (person) => {
    if (!person.accessMatched) return 'Không có quyền ra/vào hợp lệ.';
    return 'Đã xác minh hồ sơ ra/vào hợp lệ.';
};

export const mockGuardGateEvent = ({ gateId = 'main-in', scenario = 'authorized', snapshotImageBase64 } = {}) => {
    const gate = guardGates.find(item => item.id === gateId) || guardGates[0];
    const currentEvents = getGuardGateEvents();
    const peopleWithFaceId = knownPeople.filter(person => person.accessMatched);
    const status = scenario === 'unknown' || scenario === 'plate_mismatch' ? 'denied' : 'authorized';
    const unknownPerson = knownPeople.find(person => !person.accessMatched) || knownPeople[knownPeople.length - 1];
    const person = scenario === 'unknown'
        ? unknownPerson
        : gate.direction === 'out'
            ? peopleWithFaceId.find(item => isPersonPresent(currentEvents, item))
            : peopleWithFaceId.find(item => !isPersonPresent(currentEvents, item));

    if (!person) {
        const message = gate.direction === 'out'
            ? 'Chưa có người hợp lệ nào đang ở trong khuôn viên để ghi nhận ra.'
            : 'Tất cả người hợp lệ đã được ghi nhận vào. Chỉ ghi nhận vào lại sau khi đã có lượt ra.';
        return {
            success: false,
            warning: true,
            message
        };
    }

    const plateNumber = scenario === 'unknown'
        ? unknownPerson.plateNumber
        : scenario === 'plate_mismatch'
            ? '98A-999.99'
            : person.plateNumber;
    const plateStatus = scenario === 'unknown'
        ? 'unknown'
        : scenario === 'plate_mismatch'
            ? 'mismatch'
            : 'matched';
    const occurredAt = new Date().toISOString();
    const latestEntry = gate.direction === 'out' && person?.id
        ? findLatestOpenEntry(currentEvents, person.id)
        : null;
    const presenceDurationMinutes = latestEntry
        ? (new Date(occurredAt).getTime() - new Date(latestEntry.occurredAt).getTime()) / 60000
        : null;
    const event = {
        id: `mock-${Date.now()}`,
        userId: person.role === 'Người lạ' ? null : person.id,
        personCode: person.code,
        personName: person.name,
        personRole: person.role,
        gateId: gate.id,
        gateName: gate.name,
        cameraName: gate.cameraName,
        direction: gate.direction,
        occurredAt,
        dateText: formatDate(occurredAt),
        timeText: formatTime(occurredAt),
        status,
        statusLabel: status === 'authorized' ? 'Hợp lệ' : 'Từ chối',
        reason: status === 'authorized'
            ? `FaceID và biển số hợp lệ. ${buildAccessCheckText(person)}`
            : scenario === 'plate_mismatch'
                ? 'Biển số không khớp với hồ sơ FaceID đã nhận diện.'
                : 'Người chưa có quyền truy cập hoặc chưa đăng ký FaceID.',
        accessMatched: person.accessMatched,
        plateNumber,
        plateStatus,
        snapshot: snapshotImageBase64 || buildSnapshot(person, gate, status, plateNumber),
        source: snapshotImageBase64 ? 'webcam' : 'mock-camera',
        presenceDurationMinutes,
        presenceDurationText: presenceDurationMinutes === null ? '--' : formatDuration(presenceDurationMinutes)
    };
    const next = [event, ...currentEvents].slice(0, 80);
    saveGuardGateEvents(next);
    return { success: true, event };
};

export const buildGuardSummary = (events, options = {}) => {
    const range = getPresenceRange(options);
    const rangeEvents = events.filter(event => isEventInRange(event, range));
    const authorizedEvents = rangeEvents.filter(event => event.status === 'authorized');
    const entries = authorizedEvents.filter(event => event.direction === 'in').length;
    const exits = authorizedEvents.filter(event => event.direction === 'out').length;
    const alerts = rangeEvents.filter(event => event.status === 'denied').length;
    const now = Date.now();
    const presenceByPerson = knownPeople
        .filter(person => person.accessMatched)
        .map(person => buildPersonPresence(events, person, now, range));
    const peopleWithPresence = presenceByPerson.filter(person => person.lastDirection);
    const totalPresenceMinutes = peopleWithPresence.reduce((sum, person) => sum + person.totalPresenceMinutes, 0);
    const presentPeople = peopleWithPresence.filter(person => person.isPresent);
    return {
        entries,
        exits,
        alerts,
        present: presentPeople.length,
        presenceMinutes: totalPresenceMinutes,
        presenceText: formatDuration(totalPresenceMinutes),
        presencePeopleCount: peopleWithPresence.length,
        presenceByPerson: peopleWithPresence
    };
};

export const exportGuardGateEventsCsv = (events = getGuardGateEvents()) => {
    const rows = [
        ['Thời gian', 'Ngày', 'Người qua cổng', 'Mã', 'Vai trò', 'Cổng', 'Camera', 'Hướng', 'Biển số', 'Trạng thái biển số', 'Đối chiếu', 'Thời gian hiện diện'],
        ...events.map(event => [
            event.timeText,
            event.dateText,
            event.personName,
            event.personCode,
            event.personRole,
            event.gateName,
            event.cameraName,
            event.direction === 'in' ? 'Vào' : 'Ra',
            event.plateNumber || '',
            event.plateStatus === 'matched' ? 'Khớp' : event.plateStatus === 'mismatch' ? 'Sai biển số' : 'Chưa xác minh',
            event.statusLabel,
            event.presenceDurationText || '--'
        ])
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nhat-ky-ra-vao-cong-${todayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};
