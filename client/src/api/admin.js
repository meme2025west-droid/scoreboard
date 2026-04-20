import api from './base.js';

const h = (token) => ({ headers: { 'x-admin-token': token } });

export const verifyAdmin = (token) =>
  api.get('/admin/verify', h(token)).then(r => r.data);
export const getOverview = (token) =>
  api.get('/admin/overview', h(token)).then(r => r.data);
export const getAllUsers = (token) =>
  api.get('/admin/users', h(token)).then(r => r.data);
export const getUserLists = (token, userId) =>
  api.get(`/admin/users/${userId}/lists`, h(token)).then(r => r.data);
export const getUserTimelog = (token, userId, params = {}) =>
  api.get(`/admin/users/${userId}/timelog`, { ...h(token), params }).then(r => r.data);
export const deleteUser = (token, userId) =>
  api.delete(`/admin/users/${userId}`, h(token)).then(r => r.data);
