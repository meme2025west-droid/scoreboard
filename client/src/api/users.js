import api from './base.js';

export const createUser = () => api.post('/users').then(r => r.data);
export const getUser = (token) => api.get(`/users/${token}`).then(r => r.data);
export const updateUser = (token, data) => api.patch(`/users/${token}`, data).then(r => r.data);
