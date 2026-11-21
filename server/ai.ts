
import { z } from 'zod';
import {
  breakdownResultSchema,
  improvedTaskSchema,
  priorityPlanSchema,
} from './validation.js';

export class AIUnavailableError extends Error {
  constructor(
    message = 'AI is not configured. Add GROQ_API_KEY to enable AI actions.',
  ) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

export class AIResponseError extends Error {
  constructor(
    message = 'The AI response could not be validated. Please try again.',
  ) {
    super(message);
    this.name = 'AIResponseError';
  }
}

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

type GroqCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    finish_reason?: string | null;
  }>;
};

type GroqApiErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
};

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';

async function askForJson<T>(
  systemPrompt: string,
  userData: unknown,
  validator: z.ZodType<T>,
  schemaName: string,
  schema: JsonSchema,
): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new AIUnavailableError();
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  let response: Response;

  // Send the request to Groq.
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              'Input data:',
              JSON.stringify(userData),
              '',
              'Return only a JSON object matching the required schema.',
            ].join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
        max_completion_tokens: 2500,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error('Groq connection error:', message);

    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new AIResponseError(
        'Groq request timed out. Please try again.',
      );
    }

    throw new AIResponseError(
      'Unable to connect to Groq. Check your internet connection and try again.',
    );
  }

  // Read and parse Groq's response.
  const rawResponse = await response.text();

  let responseData: unknown;

  try {
    responseData = JSON.parse(rawResponse);
  } catch {
    console.error(
      'Groq returned an invalid response:',
      rawResponse.slice(0, 500),
    );

    throw new AIResponseError(
      'Groq returned an invalid response. Please try again.',
    );
  }

  // Handle API errors.
  if (!response.ok) {
    const apiError = (
      responseData as GroqApiErrorResponse
    ).error;

    const apiMessage =
      apiError?.message || 'Unknown Groq API error';

    console.error('Groq API error:', {
      status: response.status,
      message: apiMessage,
    });

    if (response.status === 401 || response.status === 403) {
      throw new AIUnavailableError(
        'Groq rejected your API key. Check GROQ_API_KEY and your API permissions.',
      );
    }

    if (response.status === 429) {
      throw new AIResponseError(
        'Groq rate limit reached. Please try again shortly.',
      );
    }

    if (response.status === 404) {
      throw new AIResponseError(
        `Groq model "${model}" was not found or is unavailable. Check GROQ_MODEL.`,
      );
    }

    throw new AIResponseError(
      `Groq API error: ${apiMessage}`,
    );
  }

  // Extract generated content.
  const completion =
    responseData as GroqCompletionResponse;

  const choice = completion.choices?.[0];

  if (choice?.finish_reason === 'length') {
    throw new AIResponseError(
      'Groq response reached its token limit. Please try again.',
    );
  }

  const content = choice?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new AIResponseError(
      'Groq returned an empty response. Please try again.',
    );
  }

  // Parse generated JSON.
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(
      'Groq returned invalid JSON:',
      content.slice(0, 500),
    );

    throw new AIResponseError(
      'Groq returned invalid JSON. Please try again.',
    );
  }

  // Validate the generated data using Zod.
  const result = validator.safeParse(parsed);

  if (!result.success) {
    console.error(
      'Groq response validation failed:',
      result.error.issues,
    );

    throw new AIResponseError();
  }

  return result.data;
}

// --------------------------------------------------
// FEATURE 1: IMPROVE TASK
// --------------------------------------------------

export async function improveTask(
  title: string,
  description: string,
) {
  return askForJson(
    [
      'You are a concise productivity writing assistant.',
      'Improve the task title so it is clear, specific, and action-oriented.',
      'Keep the original user intent and facts.',
      'Do not invent deadlines or commitments.',
      'A blank description may become one short helpful sentence.',
      'Return JSON only with exactly: {"title":"...","description":"..."}',
    ].join(' '),
    { title, description },
    improvedTaskSchema,
    'improved_task',
    {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'description'],
      additionalProperties: false,
    },
  );
}

// --------------------------------------------------
// FEATURE 2: BREAK DOWN TASK
// --------------------------------------------------

export async function breakDownTask(
  title: string,
  description: string,
) {
  return askForJson(
    [
      'You are a practical task planner.',
      'Break the task into 3 to 6 small, concrete, independently actionable subtasks.',
      'Use concise action verbs.',
      'Do not invent external dependencies or dates.',
      'Return JSON only with exactly: {"subtasks":["..."]}.',
    ].join(' '),
    { title, description },
    breakdownResultSchema,
    'task_breakdown',
    {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['subtasks'],
      additionalProperties: false,
    },
  );
}

// --------------------------------------------------
// FEATURE 3: PRIORITIZE TASKS
// --------------------------------------------------

export async function prioritizeTasks(
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string | null;
    status: 'todo' | 'in_progress' | 'done';
  }>,
) {
  const unfinished = tasks.filter(
    (task) => task.status !== 'done',
  );

  if (!unfinished.length) {
    return { items: [] };
  }

  const result = await askForJson(
    [
      'You are a calm and practical productivity coach.',
      'Recommend a sensible priority for every supplied unfinished task.',
      'Consider existing priority, deadline, urgency, likely impact, and status.',
      'Do not assume hidden information.',
      'Do not prioritize completed tasks.',
      'Return every supplied task exactly once.',
      'Do not invent or modify task IDs.',
      'Each reason must contain fewer than 20 words.',
      'Return JSON only with exactly:',
      '{"items":[{"taskId":"<provided id>","priority":"low|medium|high","reason":"short reason"}]}.',
    ].join(' '),
    { tasks: unfinished },
    priorityPlanSchema,
    'priority_plan',
    {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
              },
              reason: { type: 'string' },
            },
            required: ['taskId', 'priority', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  );

  // Ensure Groq returns every unfinished task exactly once.
  const expected = new Set(
    unfinished.map((task) => task.id),
  );

  const seen = new Set<string>();

  for (const item of result.items) {
    if (
      !expected.has(item.taskId) ||
      seen.has(item.taskId)
    ) {
      throw new AIResponseError();
    }

    seen.add(item.taskId);
  }

  if (seen.size !== expected.size) {
    throw new AIResponseError();
  }

  return result;
}
