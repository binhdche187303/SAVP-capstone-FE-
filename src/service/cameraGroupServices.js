import { get, post, patch, dele, buildQuery } from '../utils/request';

// BE: CAMG-001 — /camera-groups (quyền iot.camera_group.read / manage)
export const getCameraGroups = (params = {}) => get(`/camera-groups${buildQuery(params)}`);
export const getCameraGroupById = (id) => get(`/camera-groups/${id}`);
export const createCameraGroup = (data) => post('/camera-groups', data);
export const updateCameraGroup = (id, data) => patch(`/camera-groups/${id}`, data);
export const deleteCameraGroup = (id) => dele(`/camera-groups/${id}`);
export const addCameraGroupDevices = (id, deviceIds) => post(`/camera-groups/${id}/devices`, { device_ids: deviceIds });
export const removeCameraGroupDevice = (id, deviceId) => dele(`/camera-groups/${id}/devices/${deviceId}`);
