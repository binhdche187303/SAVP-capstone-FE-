import { get, buildQuery } from '../utils/request';

/**
 * UC-TRACK-01: Get user journey/campus tracking details
 * GET /campus/user-journey
 * @param {object} params - { userId, date }
 * @returns {Promise<object>} response envelope { success, data: { userId, fullName, date, events: [...] } }
 */
export const getUserJourney = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/campus/user-journey${query}`);
};

/**
 * UC-TRACK-01 (own) — hành trình khuôn viên ĐẦY ĐỦ (cổng + họp + khu vực) của CHÍNH
 * user đang đăng nhập, không cần quyền zones.gate_log.read (userId lấy từ JWT ở BE).
 * GET /campus/user-journey/me
 * @param {object} params - { date }
 * @returns {Promise<object>} response envelope { success, data: { userId, fullName, date, gateCount, meetingCount, zoneCount, events: [...] } }
 */
export const getMyUserJourney = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/campus/user-journey/me${query}`);
};

/**
 * CDB-RS-001: Manager role-scoped dashboard summary
 * GET /campus-dashboard/manager-summary (MANAGER only, others 403)
 * @returns {Promise<object>} { success, data: { teamPresenceToday: {presentCount, totalCount}, pendingMeetingRequestsCount, onTimeRateThisWeek: {rate, sampleSize}, teamZoneSecurityAlerts: {value, note} } }
 */
export const getManagerSummary = async () => {
    return await get('/campus-dashboard/manager-summary');
};

/**
 * CDB-RS-001: Employee role-scoped dashboard summary
 * GET /campus-dashboard/employee-summary (all 4 roles)
 * @returns {Promise<object>} { success, data: { gateAccessToday, vehicleStatus: {plateNumber, status} | null, meetingsToday } }
 */
export const getEmployeeSummary = async () => {
    return await get('/campus-dashboard/employee-summary');
};

/**
 * CDB-RS-001: Business admin role-scoped dashboard summary
 * GET /campus-dashboard/business-admin-summary (BUSINESS_ADMIN, SYSTEM_ADMIN only)
 * @returns {Promise<object>} { success, data: { gateTrafficToday: {entriesToday}, securityAlertsBySeverity, zoneOccupancy: {totalCount, zonesWithDataCount, totalZoneCount}, vehicleControlHitsToday } }
 */
export const getBusinessAdminSummary = async () => {
    return await get('/campus-dashboard/business-admin-summary');
};

/**
 * CDB-001 / UC-126: Hiện diện hiện tại theo tòa nhà → tầng → khu
 * GET /campus-dashboard/overview (SYSTEM_ADMIN, BUSINESS_ADMIN, MANAGER — campus_dashboard.overview.read)
 * @param {object} params - { building?, floor? }
 * @returns {Promise<object>} { success, data: { generatedAt, buildings: [{ building, floors: [{ floor, zones: [{ zoneId, zoneCode, zoneName, zoneType, occupancy: {status, count}, gateTraffic: {entriesToday, exitsToday}, cameraStatus: {online, offline, disabled, maintenance, overall} }] }] }] } }
 */
export const getCampusOverview = async (params = {}, options = {}) => {
    const query = buildQuery(params);
    return await get(`/campus-dashboard/overview${query}`, options);
};

/**
 * 2.12: Nhân sự đang có mặt theo phòng ban (log cổng cuối hôm nay là 'enter')
 * GET /campus-dashboard/presence-by-department (campus_dashboard.overview.read)
 * @returns {Promise<object>} { success, data: { generatedAt, totalPresent, departments: [{ departmentId, departmentCode, departmentName, presentCount, totalStaff }] } }
 */
export const getPresenceByDepartment = async (options = {}) => {
    return await get('/campus-dashboard/presence-by-department', options);
};

/**
 * ZTH-001 / UC-120: Lưu lượng người + heatmap theo khu vực công cộng
 * GET /campus-dashboard/zones/traffic (SYSTEM_ADMIN, BUSINESS_ADMIN, MANAGER — campus_dashboard.traffic.read)
 * @param {object} params - { from, to (ISO, tối đa 31 ngày), building?, floor? }
 * @returns {Promise<object>} { success, data: { series: [{zoneId, hourBucket, avgOccupancy, peakOccupancy}], heatmap: [{zoneId, zoneName, building, floor, avgOccupancy, peakOccupancy, peakAt, relativeDensity}] } }
 */
export const getZoneTraffic = async (params = {}) => {
    const query = buildQuery(params);
    return await get(`/campus-dashboard/zones/traffic${query}`);
};

/**
 * GIS: Bản đồ khuôn viên — vị trí zone (GPS) kèm camera và cảnh báo an ninh gần đây
 * GET /campus-dashboard/map (campus_dashboard.overview.read)
 * @param {object} params - { hours? (1–168, mặc định 24), building? }
 * @returns {Promise<object>} { success, data: { generatedAt, hours, since, summary: {totalZones, zonesWithCoordinates, totalCameras, camerasOnline, alertsInWindow, openAlertsInWindow, unlocatedAlertsInWindow}, zones: [{ zoneId, zoneCode, zoneName, zoneType, building, floor, status, coordinates: {lat, lng} | null, occupancy, cameraStatus, cameras: [...], alerts: {total, open, topOpenSeverity, latest: [...]} }] } }
 */
export const getCampusMap = async (params = {}, options = {}) => {
    const query = buildQuery(params);
    return await get(`/campus-dashboard/map${query}`, options);
};
