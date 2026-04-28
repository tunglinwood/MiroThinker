// API client and typed functions for MiroThinker API

import axios from 'axios';
import type {
  Task,
  TaskCreate,
  TaskListResponse,
  TaskStatusUpdate,
  ConfigListResponse,
  UploadResponse,
  TaskTelemetry,
  AdminHealthResponse,
  AdminUsersResponse,
  AdminTaskListResponse,
} from './types';

const API_BASE_URL = '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('mirothinker_token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses — clear token and redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('mirothinker_token');
      localStorage.removeItem('mirothinker_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth functions
export async function enterPassword(password: string, username: string): Promise<{ token: string; username: string; role: string }> {
  const response = await apiClient.post<{ access_token: string; username: string; role: string }>('/api/auth/enter', {
    password,
    username,
  });
  const { access_token, username: name, role } = response.data;
  localStorage.setItem('mirothinker_token', access_token);
  localStorage.setItem('mirothinker_user', name);
  localStorage.setItem('mirothinker_role', role || 'user');
  return { token: access_token, username: name, role: role || 'user' };
}

export function getStoredUser(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('mirothinker_user') : null;
}

export function logout(): void {
  localStorage.removeItem('mirothinker_token');
  localStorage.removeItem('mirothinker_user');
  localStorage.removeItem('mirothinker_role');
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export function isAdmin(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem('mirothinker_role') === 'admin';
}

export async function createTask(data: TaskCreate): Promise<Task> {
  const payload: Record<string, unknown> = {
    task_description: data.task_description,
    agent_config: data.agent_config || 'mirothinker_1.7_microsandbox',
    llm_config: data.llm_config || 'local-qwen35',
  };
  if (data.file_id) {
    payload.file_id = data.file_id;
  }
  const response = await apiClient.post<Task>('/api/tasks', payload);
  return response.data;
}

export async function listTasks(page = 1, pageSize = 20): Promise<TaskListResponse> {
  const response = await apiClient.get<TaskListResponse>('/api/tasks', {
    params: { page, page_size: pageSize },
  });
  return response.data;
}

export async function getTask(taskId: string): Promise<Task> {
  const response = await apiClient.get<Task>(`/api/tasks/${taskId}`);
  return response.data;
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusUpdate> {
  const response = await apiClient.get<TaskStatusUpdate>(`/api/tasks/${taskId}/status`);
  return response.data;
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiClient.delete(`/api/tasks/${taskId}`);
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiClient.post(`/api/tasks/${taskId}/cancel`);
}

export async function listConfigs(): Promise<ConfigListResponse> {
  const response = await apiClient.get<ConfigListResponse>('/api/configs');
  return response.data;
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<UploadResponse>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getTaskTelemetry(taskId: string): Promise<TaskTelemetry> {
  const response = await apiClient.get<TaskTelemetry>(`/api/tasks/${taskId}/telemetry`);
  return response.data;
}

// Admin API functions
export async function getAdminHealth(): Promise<AdminHealthResponse> {
  const response = await apiClient.get<AdminHealthResponse>('/api/admin/health');
  return response.data;
}

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  const response = await apiClient.get<AdminUsersResponse>('/api/admin/users');
  return response.data;
}

export async function getAdminTasks(
  page = 1,
  pageSize = 50,
  userId?: string,
  status?: string,
): Promise<AdminTaskListResponse> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (userId) params.user_id = userId;
  if (status) params.status = status;
  const response = await apiClient.get<AdminTaskListResponse>('/api/admin/tasks', { params });
  return response.data;
}

// Utility helpers
export function getApiBaseUrl(): string {
  return '';
}

export function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

export function truncateTitle(title: string, maxWords = 12): string {
  const tokens = title.split(/\s+/);
  if (tokens.length <= maxWords) return title;
  return tokens.slice(0, maxWords).join(' ') + '...';
}
