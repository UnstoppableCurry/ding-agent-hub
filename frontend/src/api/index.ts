import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

export const usersApi = {
  list: (params?: Record<string, any>) => api.get('/users', { params }),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
  import: (users: any[]) => api.post('/users/import', { users }),
  sync: () => api.post('/users/sync'),
  batchUpdate: (ids: number[], is_active: number) => api.post('/users/batch-update', { ids, is_active }),
};

export const departmentsApi = {
  list: () => api.get('/departments'),
  create: (data: any) => api.post('/departments', data),
  update: (id: number, data: any) => api.put(`/departments/${id}`, data),
  delete: (id: number) => api.delete(`/departments/${id}`),
};

export const workspacesApi = {
  list: () => api.get('/workspaces'),
  setUsers: (deptId: number, userIds: number[]) => api.put(`/workspaces/${deptId}/users`, { userIds }),
};

export const statusApi = {
  get: () => api.get('/status'),
  syncLogs: (params?: Record<string, any>) => api.get('/sync-logs', { params }),
};

export default api;
