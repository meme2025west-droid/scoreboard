import api from './base.js';

export const getTemplates = () => api.get('/templates').then(r => r.data);
export const getTemplate = (id) => api.get(`/templates/${id}`).then(r => r.data);

const adminHeaders = (token) => ({ headers: { 'x-admin-token': token } });

export const createTemplate = (adminToken, data) =>
  api.post('/templates', data, adminHeaders(adminToken)).then(r => r.data);
export const updateTemplate = (adminToken, id, data) =>
  api.patch(`/templates/${id}`, data, adminHeaders(adminToken)).then(r => r.data);
export const deleteTemplate = (adminToken, id) =>
  api.delete(`/templates/${id}`, adminHeaders(adminToken)).then(r => r.data);
export const addTemplateItem = (adminToken, id, data) =>
  api.post(`/templates/${id}/items`, data, adminHeaders(adminToken)).then(r => r.data);
export const updateTemplateItem = (adminToken, itemId, data) =>
  api.patch(`/templates/items/${itemId}`, data, adminHeaders(adminToken)).then(r => r.data);
export const moveTemplateItem = (adminToken, itemId, data) =>
  api.post(`/templates/items/${itemId}/move`, data, adminHeaders(adminToken)).then(r => r.data);
export const deleteTemplateItem = (adminToken, itemId) =>
  api.delete(`/templates/items/${itemId}`, adminHeaders(adminToken)).then(r => r.data);
