import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from './db.js';
import { TaskRepository } from './tasks.js';

let database: Knex;
let repository: TaskRepository;

beforeEach(async () => {
  database = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });
  await initializeDatabase(database);
  repository = new TaskRepository(database);
});

afterEach(async () => database.destroy());

describe('TaskRepository', () => {
  it('creates a task and returns it with an empty subtask list', async () => {
    const task = await repository.create({ title: 'Write release notes', description: '', priority: 'medium', dueDate: null });
    expect(task.title).toBe('Write release notes');
    expect(task.subtasks).toEqual([]);
    expect(task.status).toBe('todo');
  });

  it('adds and toggles subtasks', async () => {
    const task = await repository.create({ title: 'Prepare demo', description: '', priority: 'high', dueDate: null });
    const subtask = await repository.addSubtask(task.id, 'Check the flow');
    expect(subtask?.isCompleted).toBe(false);
    expect((await repository.toggleSubtask(subtask!.id, true))?.isCompleted).toBe(true);
  });

  it('saves multiple subtasks as one transaction', async () => {
    const task = await repository.create({ title: 'Prepare demo', description: '', priority: 'high', dueDate: null });
    const subtasks = await repository.addSubtasks(task.id, ['Draft intro', 'Run through screens']);
    expect(subtasks?.map((item) => item.title)).toEqual(['Draft intro', 'Run through screens']);
  });

  it('cascades task deletion to subtasks', async () => {
    const task = await repository.create({ title: 'Remove me', description: '', priority: 'low', dueDate: null });
    await repository.addSubtask(task.id, 'A child item');
    expect(await repository.delete(task.id)).toBe(true);
    expect(await database('subtasks').count({ count: '*' }).first()).toMatchObject({ count: 0 });
  });
});
