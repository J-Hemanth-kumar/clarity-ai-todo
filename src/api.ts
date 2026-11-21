import type { Priority, Status, Task, Subtask, PrioritySuggestion } from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const api = {
  getTasks: async (filters: { status?: Status | 'all'; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    const result = await request<{ tasks: Task[] }>(`/api/tasks?${params.toString()}`);
    return result.tasks;
  },
  createTask: async (input: { title: string; priority: Priority; dueDate: string | null }) =>
    (await request<{ task: Task }>('/api/tasks', { method: 'POST', body: JSON.stringify(input) })).task,
  updateTask: async (id: string, input: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>>) =>
    (await request<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) })).task,
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  addSubtask: async (taskId: string, title: string) =>
    (await request<{ subtask: Subtask }>(`/api/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) })).subtask,
  addSubtasks: (taskId: string, subtasks: string[]) =>
    request<{ subtasks: Subtask[] }>(`/api/tasks/${taskId}/subtasks/bulk`, { method: 'POST', body: JSON.stringify({ subtasks }) }),
  toggleSubtask: async (id: string, isCompleted: boolean) =>
    (await request<{ subtask: Subtask }>(`/api/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) })).subtask,
  deleteSubtask: (id: string) => request<void>(`/api/subtasks/${id}`, { method: 'DELETE' }),
  improve: async (title: string, description: string) =>
    (await request<{ suggestion: { title: string; description: string } }>('/api/ai/improve', { method: 'POST', body: JSON.stringify({ title, description }) })).suggestion,
  breakdown: async (title: string, description: string) =>
    (await request<{ suggestion: { subtasks: string[] } }>('/api/ai/breakdown', { method: 'POST', body: JSON.stringify({ title, description }) })).suggestion,
  prioritize: async (tasks: Task[]) => {
    const payload = tasks.filter((task) => task.status !== 'done').slice(0, 30).map(({ id, title, description, priority, dueDate, status }) => ({ id, title, description, priority, dueDate, status }));
    return (await request<{ suggestion: { items: PrioritySuggestion[] } }>('/api/ai/prioritize', { method: 'POST', body: JSON.stringify({ tasks: payload }) })).suggestion;
  },
};
