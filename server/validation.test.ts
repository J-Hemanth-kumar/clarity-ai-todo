import { describe, expect, it } from 'vitest';
import {
  breakdownResultSchema,
  createTaskSchema,
  improvedTaskSchema,
  priorityPlanSchema,
  updateTaskSchema,
} from './validation.js';

const id = '3a3e3e3c-ff3b-4c3e-9d0b-0a7e5c1355f1';

describe('request validation', () => {
  it('trims task titles and applies safe defaults', () => {
    expect(createTaskSchema.parse({ title: '  Ship the feature  ' })).toMatchObject({
      title: 'Ship the feature', description: '', priority: 'medium', dueDate: null,
    });
  });

  it('rejects blank or oversized task titles', () => {
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(181) }).success).toBe(false);
  });

  it('requires at least one field for a task update', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ priority: 'high' }).success).toBe(true);
  });
});

describe('AI output validation', () => {
  it('accepts a useful rewritten task', () => {
    expect(improvedTaskSchema.safeParse({ title: 'Send the project update', description: 'Share progress and next steps.' }).success).toBe(true);
  });

  it('rejects malformed or excessive AI subtasks', () => {
    expect(breakdownResultSchema.safeParse({ subtasks: ['Draft outline', 'Review'] }).success).toBe(true);
    expect(breakdownResultSchema.safeParse({ subtasks: [] }).success).toBe(false);
    expect(breakdownResultSchema.safeParse({ subtasks: Array(9).fill('step') }).success).toBe(false);
  });

  it('rejects malformed priority suggestions', () => {
    expect(priorityPlanSchema.safeParse({ items: [{ taskId: id, priority: 'urgent', reason: 'Soon' }] }).success).toBe(false);
    expect(priorityPlanSchema.safeParse({ items: [{ taskId: id, priority: 'high', reason: 'Due today' }] }).success).toBe(true);
  });
});
