import type { ParsedDraft, ScheduleBlock, Task, Theme, User } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'howerflow_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<{ user: User }>('/me'),
  updateSettings: (body: { theme?: Theme; focusMinutes?: number; reminderTone?: string }) =>
    request<{ user: User }>('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  updateOnboarding: (body: { completed?: boolean; step?: number }) =>
    request<{ user: User }>('/onboarding', { method: 'PATCH', body: JSON.stringify(body) }),
  tasks: () => request<{ tasks: Task[] }>('/tasks'),
  parse: (text: string) => request<{ drafts: ParsedDraft[] }>('/tasks/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  createTask: (body: Record<string, unknown>) =>
    request<{ task: Task }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  scheduleSuggestions: (id: string) => request<{ suggestions: ScheduleBlock[] }>(`/tasks/${id}/schedule/suggestions`),
  scheduleTask: (id: string, block: ScheduleBlock) =>
    request<{ task: Task }>(`/tasks/${id}/schedule`, { method: 'POST', body: JSON.stringify(block) }),
  startNow: (id: string, minutes: number) =>
    request<{ task: Task }>(`/tasks/${id}/start-now`, { method: 'POST', body: JSON.stringify({ minutes }) }),
  daily: () => request<{ today: Task[]; overdue: Task[]; q2Focus: Task[] }>('/overview/daily'),
  weekly: () => request<{ completed: Task[]; slipped: Task[]; q2Minutes: number }>('/reviews/weekly'),
  googleStatus: () => request<{ connected: boolean; email: string | null }>('/integrations/google/status'),
  googleConnectUrl: () => request<{ url: string | null; demo?: boolean; message?: string }>('/integrations/google/connect-url')
};
