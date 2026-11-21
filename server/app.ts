import express, { type Request, type Response, type NextFunction } from 'express';
import type { Knex } from 'knex';
import { ZodError } from 'zod';
import { TaskRepository } from './tasks.js';
import {
  createSubtaskSchema,
  createTaskSchema,
  updateTaskSchema,
  improveInputSchema,
  breakdownInputSchema,
  prioritizeInputSchema,
} from './validation.js';
import { AIResponseError, AIUnavailableError, breakDownTask, improveTask, prioritizeTasks } from './ai.js';

export function createApp(database: Knex) {
  const app = express();
  const tasks = new TaskRepository(database);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/tasks', asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ tasks: await tasks.list({ status, search }) });
  }));

  app.post('/api/tasks', asyncRoute(async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    res.status(201).json({ task: await tasks.create(input) });
  }));

  app.patch('/api/tasks/:id', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  const input = updateTaskSchema.parse(req.body);
  const task = await tasks.update(id, input);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
}));

  app.delete('/api/tasks/:id', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  if (!await tasks.delete(id)) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(204).end();
}));

  app.post('/api/tasks/:id/subtasks', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  const { title } = createSubtaskSchema.parse(req.body);
  const subtask = await tasks.addSubtask(id, title);

  if (!subtask) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(201).json({ subtask });
}));

  app.post('/api/tasks/:id/subtasks/bulk', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  const body = req.body as { subtasks?: unknown };

  const parsed = createSubtaskSchema.array().min(1).max(8).safeParse(
    Array.isArray(body?.subtasks)
      ? body.subtasks.map((title) => ({ title }))
      : []
  );

  if (!parsed.success) {
    res.status(400).json({ error: 'Add between 1 and 8 valid subtasks' });
    return;
  }

  const subtasks = await tasks.addSubtasks(
    id,
    parsed.data.map((item) => item.title)
  );

  if (!subtasks) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(201).json({ subtasks });
}));

  app.patch('/api/subtasks/:id', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  const body = req.body as { isCompleted?: unknown };

  if (typeof body?.isCompleted !== 'boolean') {
    res.status(400).json({ error: 'isCompleted must be a boolean' });
    return;
  }

  const subtask = await tasks.toggleSubtask(id, body.isCompleted);

  if (!subtask) {
    res.status(404).json({ error: 'Subtask not found' });
    return;
  }

  res.json({ subtask });
}));

  app.delete('/api/subtasks/:id', asyncRoute(async (req, res) => {
  const id = getRouteId(req, res);
  if (id === null) return;

  if (!await tasks.deleteSubtask(id)) {
    res.status(404).json({ error: 'Subtask not found' });
    return;
  }

  res.status(204).end();
}));

  app.post('/api/ai/improve', asyncRoute(async (req, res) => {
    const input = improveInputSchema.parse(req.body);
    res.json({ suggestion: await improveTask(input.title, input.description) });
  }));

  app.post('/api/ai/breakdown', asyncRoute(async (req, res) => {
    const input = breakdownInputSchema.parse(req.body);
    res.json({ suggestion: await breakDownTask(input.title, input.description) });
  }));

  app.post('/api/ai/prioritize', asyncRoute(async (req, res) => {
    const input = prioritizeInputSchema.parse(req.body);
    res.json({ suggestion: await prioritizeTasks(input.tasks) });
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid request' });
      return;
    }
    if (err instanceof AIUnavailableError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof AIResponseError) {
      res.status(502).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

function getRouteId(req: Request, res: Response): string | null {
  const id = req.params.id;

  if (typeof id !== 'string' || id.trim().length === 0) {
    res.status(400).json({ error: 'Invalid ID parameter' });
    return null;
  }

  return id;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}
