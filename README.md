# Clarity — AI-assisted To-do list

Clarity is a small, responsive to-do app built around a dependable manual task workflow and three focused AI assists. AI is optional: task creation, editing, status changes, priorities, subtasks, search, and deletion continue to work without an API key.

## Features

### Core task management
- Create, edit, complete, and delete tasks.
- Set a priority and optional due date.
- Track `To do`, `In progress`, and `Done` states.
- Break work into subtasks, check off individual steps, and remove steps.
- Search tasks and filter by status.
- See completion progress and overdue dates.

### AI assistance
1. **Improve writing** — turn a rough note into a clearer, action-oriented title and description. The suggestion is editable before saving.
2. **Break it into steps** — generate a short checklist for a task. Each step can be edited, removed, or supplemented before saving.
3. **Plan my day** — suggest priorities and a reason for each unfinished task. Review and adjust each priority before applying the plan.

AI output is treated as untrusted input: Schema-constrained JSON output is parsed and validated again with Zod, list sizes and string lengths are bounded, and priority suggestions must reference each supplied task exactly once. AI failures show an actionable message and leave the normal task workflow available.

## One-command local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install && npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API runs on port `3001`; Vite proxies `/api` requests to it. For local development, SQLite is created automatically at `./data/clarity.sqlite`. The same repository can use PostgreSQL by setting `DATABASE_URL`.

To enable AI, create a `.env` file in the project root (or set the same variables in your hosting environment):

```env
GEMINI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-6-luna
```

`GEMINI_API_KEY` is read only by the Express server. Do not prefix it with `VITE_` or expose it in client-side code. Without the key, the AI actions return a clear setup message and the rest of the app remains usable.

## Useful scripts

```bash
npm run dev        # frontend + backend in watch mode
npm run typecheck  # TypeScript checks for client and server
npm test           # validation and repository tests
npm run build      # typecheck server, then build production client/server
npm start          # run the production Express server
```

## Deploy on Replit

This project is configured for a Replit Reserved VM deployment. Use a managed PostgreSQL database for published task data; the local SQLite fallback is intended for local development and demos, not as the durable store for a published app.

1. Create a Replit app by importing the project folder (or upload the ZIP archive).
2. Provision a managed PostgreSQL database (for example, Neon) and add its connection URL as `DATABASE_URL` in the published app secrets. This keeps tasks outside the deploy filesystem.
3. In **Secrets**, add `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. The key is optional for manual use.
4. Run the app with `npm run dev` to preview it.
5. Choose **Publish** and use **Reserved VM** for the Express server. Set the build command to `npm run build` and the run command to `npm start`. Add `DATABASE_URL` and `OPENAI_API_KEY` under published app secrets.

The app listens on Replit's `PORT` environment variable. For a public deployment, add authentication and rate limiting before using it for multiple users; this starter intentionally keeps the product single-user and focused.

## Architecture

```text
React + TypeScript + Vite
        │  /api (dev proxy; same origin in production)
        ▼
Express API (server/app.ts)
   ├── Zod request validation (server/validation.ts)
   ├── Task repository (server/tasks.ts)
   │      └── Knex → SQLite locally / PostgreSQL when DATABASE_URL is set
   └── AI service + prompts (server/ai.ts)
          └── OpenAI Chat Completions API (server-side fetch)
```

- **Database:** Knex selects SQLite locally and PostgreSQL when `DATABASE_URL` is set. `tasks` and `subtasks` have a foreign-key cascade, timestamps, status/priority checks, and indexes for status/position, status/priority/due date, due date, and recent updates.
- **Separation:** HTTP routes, repository/database access, input/output schemas, and AI prompts live in separate modules.
- **Reliability:** UI loading, empty, and error states; AI requests time out; AI failures do not disable CRUD; request and AI response data are validated before use.
- **Tests:** Zod request/AI-output tests and in-memory SQLite repository tests.

## 3–5 minute demo story

1. **Problem (20 sec):** A to-do list often captures work but does not help turn a vague intention into an actionable next step.
2. **Core workflow (60 sec):** Add a task, set a due date and priority, move it to `In progress`, then add/check a subtask.
3. **AI writing (40 sec):** Open “Improve writing,” generate a clearer task, edit the suggestion, and save it.
4. **AI breakdown (45 sec):** Generate steps for a larger task, remove or rewrite one suggestion, then add the checklist.
5. **AI planning (45 sec):** Run “Plan my day,” inspect the priority reasons, adjust a recommendation, and apply the plan.
6. **Engineering (30 sec):** Explain the React → Express → Knex → SQLite/PostgreSQL flow, Zod validation, and the fact that the task workflow remains available if AI is offline.
7. **Limitations / next steps (20 sec):** Single-user app, no auth or collaboration, and no recurring tasks yet. Next: authentication, user-level data isolation, and reminders.

## Current limitations

- Designed as a single-user starter; there is no authentication, sharing, or multi-user data isolation.
- Local development falls back to SQLite. Set `DATABASE_URL` to use managed PostgreSQL for published Replit usage rather than relying on deploy-local files.
- AI quality depends on the model and task context. Suggestions are drafts, not automatic changes; the user reviews them first.
- No recurring tasks, notifications, attachments, or calendar integrations are included by design.
