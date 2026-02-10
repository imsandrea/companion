import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { CronJob, CronJobCreate, CronJobPatch, CronRunLogEntry } from "./cron-types.js";

// ─── Paths ──────────────────────────────────────────────────────────────────

let baseDirOverride: string | null = null;

function schedulesDir(): string {
  const base = baseDirOverride ?? join(homedir(), ".companion");
  return join(base, "schedules");
}

function runsDir(): string {
  return join(schedulesDir(), "runs");
}

/** Override the base directory (for testing). Pass null to reset. */
export function _setBaseDir(dir: string | null): void {
  baseDirOverride = dir;
}

function ensureDir(): void {
  mkdirSync(schedulesDir(), { recursive: true });
  mkdirSync(runsDir(), { recursive: true });
}

function jobPath(id: string): string {
  return join(schedulesDir(), `${id}.json`);
}

function runLogPath(jobId: string): string {
  return join(runsDir(), `${jobId}.jsonl`);
}

// ─── Job CRUD ───────────────────────────────────────────────────────────────

export function listJobs(): CronJob[] {
  ensureDir();
  try {
    const dir = schedulesDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const jobs: CronJob[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), "utf-8");
        jobs.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    jobs.sort((a, b) => b.createdAt - a.createdAt);
    return jobs;
  } catch {
    return [];
  }
}

export function getJob(id: string): CronJob | null {
  ensureDir();
  try {
    const raw = readFileSync(jobPath(id), "utf-8");
    return JSON.parse(raw) as CronJob;
  } catch {
    return null;
  }
}

export function createJob(input: CronJobCreate): CronJob {
  if (!input.name?.trim()) throw new Error("Job name is required");
  if (!input.prompt?.trim()) throw new Error("Job prompt is required");
  if (!input.schedule) throw new Error("Job schedule is required");

  ensureDir();
  const now = Date.now();
  const job: CronJob = {
    ...input,
    id: randomUUID(),
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    createdAt: now,
    updatedAt: now,
    state: {},
  };
  writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2), "utf-8");
  return job;
}

export function updateJob(id: string, patch: CronJobPatch): CronJob | null {
  ensureDir();
  const existing = getJob(id);
  if (!existing) return null;

  const updated: CronJob = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    state: existing.state,
  };

  if (patch.name !== undefined) updated.name = patch.name.trim();
  if (patch.prompt !== undefined) updated.prompt = patch.prompt.trim();

  writeFileSync(jobPath(id), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function updateJobState(id: string, state: Partial<CronJob["state"]>): CronJob | null {
  ensureDir();
  const existing = getJob(id);
  if (!existing) return null;

  existing.state = { ...existing.state, ...state };
  existing.updatedAt = Date.now();
  writeFileSync(jobPath(id), JSON.stringify(existing, null, 2), "utf-8");
  return existing;
}

export function deleteJob(id: string): boolean {
  ensureDir();
  if (!existsSync(jobPath(id))) return false;
  try {
    unlinkSync(jobPath(id));
    // Also clean up run logs
    try { unlinkSync(runLogPath(id)); } catch { /* ok */ }
    return true;
  } catch {
    return false;
  }
}

// ─── Run Logs ───────────────────────────────────────────────────────────────

export function appendRunLog(entry: CronRunLogEntry): void {
  ensureDir();
  appendFileSync(runLogPath(entry.jobId), JSON.stringify(entry) + "\n", "utf-8");
}

export function getRunLog(jobId: string, limit = 50): CronRunLogEntry[] {
  ensureDir();
  try {
    const raw = readFileSync(runLogPath(jobId), "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const entries: CronRunLogEntry[] = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
    // Return most recent first
    entries.reverse();
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

export function getAllRecentRuns(limit = 20): CronRunLogEntry[] {
  ensureDir();
  try {
    const dir = runsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    const all: CronRunLogEntry[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          try { all.push(JSON.parse(line)); } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    all.sort((a, b) => b.ts - a.ts);
    return all.slice(0, limit);
  } catch {
    return [];
  }
}

export function pruneRunLog(jobId: string, keepLines = 500): void {
  ensureDir();
  try {
    const raw = readFileSync(runLogPath(jobId), "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length <= keepLines) return;
    const kept = lines.slice(lines.length - keepLines);
    writeFileSync(runLogPath(jobId), kept.join("\n") + "\n", "utf-8");
  } catch { /* ok */ }
}
