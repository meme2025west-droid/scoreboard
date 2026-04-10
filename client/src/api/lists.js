import api from './base.js';

export const getUserLists = (token) => api.get(`/lists/user/${token}`).then(r => r.data);
export const getList = (id) => api.get(`/lists/${id}`).then(r => r.data);
export const createList = (token, data) => api.post(`/lists/user/${token}`, data).then(r => r.data);
export const updateList = (id, data) => api.patch(`/lists/${id}`, data).then(r => r.data);
export const deleteList = (id) => api.delete(`/lists/${id}`).then(r => r.data);
export const syncListFromTemplate = (id) => api.post(`/lists/${id}/sync-template`).then(r => r.data);
export const moveList = (id, data) => api.post(`/lists/${id}/move`, data).then(r => r.data);
export const duplicateDetachedList = (id) => api.post(`/lists/${id}/duplicate-detached`).then(r => r.data);

export const addListItem = (listId, data) => api.post(`/lists/${listId}/items`, data).then(r => r.data);
export const updateListItem = (itemId, data) => api.patch(`/lists/items/${itemId}`, data).then(r => r.data);
export const moveListItem = (itemId, data) => api.post(`/lists/items/${itemId}/move`, data).then(r => r.data);
export const deleteListItem = (itemId) => api.delete(`/lists/items/${itemId}`).then(r => r.data);
