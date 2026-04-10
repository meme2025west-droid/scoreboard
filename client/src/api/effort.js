import api from './base.js';

export const getEffort = (token, params = {}) =>
  api.get(`/effort/user/${token}`, { params }).then(r => r.data);

export const getEffortAnalytics = (token, params = {}) =>
  api.get(`/effort/user/${token}/analytics`, { params }).then(r => r.data);

export const createEffortEntry = (token, data) =>
  api.post(`/effort/user/${token}`, data).then(r => r.data);

export const updateEffortEntry = (id, data) =>
  api.patch(`/effort/${id}`, data).then(r => r.data);

export const deleteEffortEntry = (id) =>
  api.delete(`/effort/${id}`).then(r => r.data);