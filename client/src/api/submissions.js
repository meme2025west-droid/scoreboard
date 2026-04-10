import api from './base.js';

export const submitList = (data) => api.post('/submissions', data).then(r => r.data);
export const getSubmissions = (listId) => api.get(`/submissions/list/${listId}`).then(r => r.data);
export const getSubmissionAnalytics = (listId, params = {}) => api.get(`/submissions/list/${listId}/analytics`, { params }).then(r => r.data);
export const getSubmission = (id) => api.get(`/submissions/${id}`).then(r => r.data);
export const deleteSubmission = (id) => api.delete(`/submissions/${id}`).then(r => r.data);
