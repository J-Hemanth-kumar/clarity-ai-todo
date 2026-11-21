import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { CreateTaskInput, UpdateTaskInput } from './validation.js';

export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in_progress' | 'done';

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  subtasks: Subtask[];
}

type TaskRow = {
  id: string; title: string; description: string; status: Status; priority: Priority;
  due_date: string | null; position: number; created_at: string; updated_at: string; completed_at: string | null;
};
type SubtaskRow = {
  id: string; task_id: string; title: string; is_completed: boolean | number; position: number; created_at: string; updated_at: string;
};

const mapSubtask = (row: SubtaskRow): Subtask => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  isCompleted: Boolean(row.is_completed),
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class TaskRepository {
  constructor(private readonly database: Knex) {}

  async list(filters: { status?: string; search?: string } = {}): Promise<Task[]> {
    let query = this.database('tasks').select('*');
    if (filters.status && filters.status !== 'all') query = query.where('status', filters.status);
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      query = query.whereRaw('(title LIKE ? OR description LIKE ?)', [term, term]);
    }
    const rows = await query
      .orderByRaw("CASE status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END")
      .orderByRaw("CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END")
      .orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
      .orderBy('due_date', 'asc')
      .orderBy('position', 'asc')
      .orderBy('created_at', 'desc') as TaskRow[];
    return this.hydrate(rows);
  }

  async get(id: string): Promise<Task | undefined> {
    const row = await this.database('tasks').where({ id }).first() as TaskRow | undefined;
    return row ? (await this.hydrate([row]))[0] : undefined;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const aggregate = await this.database('tasks').max({ next: 'position' }).first() as { next: number | string | null } | undefined;
    const position = Number(aggregate?.next ?? -1) + 1;
    await this.database('tasks').insert({
      id, title: input.title, description: input.description, priority: input.priority,
      due_date: input.dueDate, position, created_at: now, updated_at: now,
    });
    return (await this.get(id))!;
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const nextStatus = input.status ?? current.status;
    const completedAt = nextStatus === 'done' ? (current.completedAt ?? new Date().toISOString()) : null;
    const now = new Date().toISOString();
    await this.database('tasks').where({ id }).update({
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      status: nextStatus,
      priority: input.priority ?? current.priority,
      due_date: input.dueDate === undefined ? current.dueDate : input.dueDate,
      updated_at: now,
      completed_at: completedAt,
    });
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return (await this.database('tasks').where({ id }).delete()) > 0;
  }

  async addSubtask(taskId: string, title: string): Promise<Subtask | undefined> {
    if (!await this.get(taskId)) return undefined;
    const now = new Date().toISOString();
    const id = randomUUID();
    const aggregate = await this.database('subtasks').where({ task_id: taskId }).max({ next: 'position' }).first() as { next: number | string | null } | undefined;
    const position = Number(aggregate?.next ?? -1) + 1;
    await this.database('subtasks').insert({
      id, task_id: taskId, title, position, created_at: now, updated_at: now,
    });
    return this.getSubtask(id);
  }

  async addSubtasks(taskId: string, titles: string[]): Promise<Subtask[] | undefined> {
    if (!await this.get(taskId)) return undefined;
    const aggregate = await this.database('subtasks').where({ task_id: taskId }).max({ next: 'position' }).first() as { next: number | string | null } | undefined;
    const firstPosition = Number(aggregate?.next ?? -1) + 1;
    const now = new Date().toISOString();
    await this.database.transaction(async (transaction) => {
      await transaction('subtasks').insert(titles.map((title, index) => ({
        id: randomUUID(), task_id: taskId, title, position: firstPosition + index,
        created_at: now, updated_at: now,
      })));
    });
    return (await this.get(taskId))?.subtasks;
  }

  async toggleSubtask(id: string, isCompleted: boolean): Promise<Subtask | undefined> {
    await this.database('subtasks').where({ id }).update({ is_completed: isCompleted, updated_at: new Date().toISOString() });
    return this.getSubtask(id);
  }

  async deleteSubtask(id: string): Promise<boolean> {
    return (await this.database('subtasks').where({ id }).delete()) > 0;
  }

  private async getSubtask(id: string): Promise<Subtask | undefined> {
    const row = await this.database('subtasks').where({ id }).first() as SubtaskRow | undefined;
    return row ? mapSubtask(row) : undefined;
  }

  private async hydrate(rows: TaskRow[]): Promise<Task[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const subtaskRows = await this.database('subtasks').whereIn('task_id', ids).orderBy('position', 'asc') as SubtaskRow[];
    const subtasksByTask = new Map<string, Subtask[]>();
    for (const row of subtaskRows) {
      const items = subtasksByTask.get(row.task_id) ?? [];
      items.push(mapSubtask(row));
      subtasksByTask.set(row.task_id, items);
    }
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.due_date,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      subtasks: subtasksByTask.get(row.id) ?? [],
    }));
  }
}
