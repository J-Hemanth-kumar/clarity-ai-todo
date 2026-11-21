import { z } from 'zod';

export const prioritySchema = z.enum(['low', 'medium', 'high']);
export const statusSchema = z.enum(['todo', 'in_progress', 'done']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Add a task title').max(180),
  description: z.string().max(2000).optional().default(''),
  priority: prioritySchema.optional().default('medium'),
  dueDate: z.string().date().nullable().optional().default(null),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(2000).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: z.string().date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
});

export const improveInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(2000).optional().default(''),
});

export const breakdownInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(2000).optional().default(''),
});

export const prioritizeInputSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(180),
    description: z.string().max(2000).optional().default(''),
    priority: prioritySchema,
    dueDate: z.string().date().nullable(),
    status: statusSchema,
  })).min(1).max(30),
});

export const improvedTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(2000),
});

export const breakdownResultSchema = z.object({
  subtasks: z.array(z.string().trim().min(1).max(180)).min(1).max(8),
});

export const priorityPlanSchema = z.object({
  items: z.array(z.object({
    taskId: z.string().uuid(),
    priority: prioritySchema,
    reason: z.string().trim().min(1).max(240),
  })).min(1).max(30),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
