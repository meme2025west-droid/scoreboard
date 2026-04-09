import api from './base.js';

export const getTimelog = (token, params = {}) =>
  api.get(`/timelog/user/${token}`, { params }).then(r => r.data);
export const getLastEntry = (token) =>
  api.get(`/timelog/user/${token}/last`).then(r => r.data);
export const getAnalytics = (token, params = {}) =>
  api.get(`/timelog/user/${token}/analytics`, { params }).then(r => r.data);
export const createEntry = (token, data) =>
  api.post(`/timelog/user/${token}`, data).then(r => r.data);
export const updateEntry = (id, data) =>
  api.patch(`/timelog/${id}`, data).then(r => r.data);
export const deleteEntry = (id) =>
  api.delete(`/timelog/${id}`).then(r => r.data);
