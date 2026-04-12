import api from './base.js';

export const getUserProjects = (token) => api.get(`/projects/user/${token}`).then(r => r.data);
export const createProject = (token, data) => api.post(`/projects/user/${token}`, data).then(r => r.data);
export const createProjectsFromTemplate = (token, templateId) =>
	api.post(`/projects/user/${token}/from-template/${templateId}`).then(r => r.data);
export const updateProject = (id, data) => api.patch(`/projects/${id}`, data).then(r => r.data);
export const moveProject = (id, data) => api.post(`/projects/${id}/move`, data).then(r => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`).then(r => r.data);
