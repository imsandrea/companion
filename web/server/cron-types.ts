// ─── Schedule Types ──────────────────────────────────────────────────────────

export type ScheduleType =
  | { kind: "cron"; expr: string; tz?: string }
  | { kind: "every"; intervalMs: number }
  | { kind: "at"; at: string };

// ─── Job State ───────────────────────────────────────────────────────────────

export interface CronJobState {
  nextRunAt?: number;
  lastRunAt?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastSessionId?: string;
  consecutiveErrors?: number;
}

// ─── CronJob ─────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAt: number;
  updatedAt: number;

  schedule: ScheduleType;

  // Session config
  prompt: string;
  model?: string;
  permissionMode?: string;
  cwd?: string;
  envSlug?: string;
  allowedTools?: string[];
  branch?: string;
  useWorktree?: boolean;

  state: CronJobState;
}

// ─── Create / Patch ──────────────────────────────────────────────────────────

export type CronJobCreate = Omit<CronJob, "id" | "createdAt" | "updatedAt" | "state">;

export type CronJobPatch = Partial<
  Omit<CronJob, "id" | "createdAt" | "updatedAt" | "state">
>;

// ─── Run Log ─────────────────────────────────────────────────────────────────

export interface CronRunLogEntry {
  ts: number;
  jobId: string;
  jobName: string;
  status: "ok" | "error" | "skipped";
  sessionId?: string;
  error?: string;
  durationMs?: number;
}
