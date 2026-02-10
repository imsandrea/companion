import { Cron } from "croner";
import type { CliLauncher } from "./cli-launcher.js";
import type { WsBridge } from "./ws-bridge.js";
import type { CronJob, CronRunLogEntry, ScheduleType } from "./cron-types.js";
import * as cronStore from "./cron-store.js";
import * as envManager from "./env-manager.js";

const TICK_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour
const BASE_BACKOFF_MS = 30_000; // 30 seconds

export class CronScheduler {
  private launcher: CliLauncher;
  private wsBridge: WsBridge;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(launcher: CliLauncher, wsBridge: WsBridge) {
    this.launcher = launcher;
    this.wsBridge = wsBridge;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Compute nextRunAt for all enabled jobs on startup
    const jobs = cronStore.listJobs();
    const now = Date.now();
    for (const job of jobs) {
      if (!job.enabled) continue;
      const next = this.computeNextRun(job.schedule, now, job.state.lastRunAt);
      if (next !== undefined) {
        cronStore.updateJobState(job.id, { nextRunAt: next });
      } else if (job.schedule.kind === "at") {
        // One-shot in the past — mark as skipped and disable
        cronStore.updateJobState(job.id, { lastStatus: "skipped" });
        cronStore.updateJob(job.id, { enabled: false });
      }
    }

    console.log(`[cron] Scheduler started (${jobs.filter((j) => j.enabled).length} enabled jobs)`);
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.running = false;
    console.log("[cron] Scheduler stopped");
  }

  // ─── Tick ────────────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const now = Date.now();
    const jobs = cronStore.listJobs();

    for (const job of jobs) {
      if (!job.enabled) continue;
      if (!job.state.nextRunAt || now < job.state.nextRunAt) continue;

      // Check backoff for consecutive errors
      if (job.state.consecutiveErrors && job.state.consecutiveErrors > 0) {
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, job.state.consecutiveErrors - 1),
          MAX_BACKOFF_MS,
        );
        const backoffUntil = (job.state.lastRunAt ?? 0) + backoff;
        if (now < backoffUntil) continue;
      }

      await this.executeJob(job, now);
    }
  }

  private async executeJob(job: CronJob, now: number): Promise<void> {
    const startMs = Date.now();
    console.log(`[cron] Executing job "${job.name}" (${job.id})`);

    try {
      // Resolve env variables
      let envVars: Record<string, string> | undefined;
      if (job.envSlug) {
        const env = envManager.getEnv(job.envSlug);
        if (env) envVars = env.variables;
      }

      // Launch a new session
      const info = this.launcher.launch({
        model: job.model,
        permissionMode: job.permissionMode,
        cwd: job.cwd,
        allowedTools: job.allowedTools,
        env: envVars,
      });

      // Queue the prompt as a user message (will be sent when CLI connects)
      this.wsBridge.sendUserMessageFromServer(info.sessionId, job.prompt);

      const durationMs = Date.now() - startMs;

      // Update job state
      const nextRunAt = this.computeNextRun(job.schedule, now);
      cronStore.updateJobState(job.id, {
        lastRunAt: now,
        lastStatus: "ok",
        lastError: undefined,
        lastSessionId: info.sessionId,
        consecutiveErrors: 0,
        nextRunAt,
      });

      // Disable one-shot jobs after execution
      if (job.deleteAfterRun || job.schedule.kind === "at") {
        cronStore.updateJob(job.id, { enabled: false });
      }

      // Append to run log
      const logEntry: CronRunLogEntry = {
        ts: now,
        jobId: job.id,
        jobName: job.name,
        status: "ok",
        sessionId: info.sessionId,
        durationMs,
      };
      cronStore.appendRunLog(logEntry);
      cronStore.pruneRunLog(job.id);

      console.log(`[cron] Job "${job.name}" launched session ${info.sessionId}`);
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] Job "${job.name}" failed:`, errorMsg);

      const nextRunAt = this.computeNextRun(job.schedule, now);
      cronStore.updateJobState(job.id, {
        lastRunAt: now,
        lastStatus: "error",
        lastError: errorMsg,
        consecutiveErrors: (job.state.consecutiveErrors ?? 0) + 1,
        nextRunAt,
      });

      const logEntry: CronRunLogEntry = {
        ts: now,
        jobId: job.id,
        jobName: job.name,
        status: "error",
        error: errorMsg,
        durationMs,
      };
      cronStore.appendRunLog(logEntry);
    }
  }

  // ─── Schedule computation ────────────────────────────────────────────────

  computeNextRun(schedule: ScheduleType, nowMs: number, lastRunAt?: number): number | undefined {
    switch (schedule.kind) {
      case "cron": {
        try {
          const job = new Cron(schedule.expr, { timezone: schedule.tz });
          const next = job.nextRun(new Date(nowMs));
          return next ? next.getTime() : undefined;
        } catch {
          return undefined;
        }
      }

      case "every": {
        if (schedule.intervalMs <= 0) return undefined;
        const anchor = lastRunAt ?? nowMs;
        return anchor + schedule.intervalMs;
      }

      case "at": {
        const ts = new Date(schedule.at).getTime();
        if (isNaN(ts)) return undefined;
        return ts > nowMs ? ts : undefined;
      }
    }
  }

  // ─── Public API (used by routes) ─────────────────────────────────────────

  listJobs(): CronJob[] {
    return cronStore.listJobs();
  }

  getJob(id: string): CronJob | null {
    return cronStore.getJob(id);
  }

  createJob(input: Omit<CronJob, "id" | "createdAt" | "updatedAt" | "state">): CronJob {
    const job = cronStore.createJob(input);

    // Compute initial nextRunAt
    if (job.enabled) {
      const next = this.computeNextRun(job.schedule, Date.now());
      if (next !== undefined) {
        cronStore.updateJobState(job.id, { nextRunAt: next });
        job.state.nextRunAt = next;
      }
    }

    console.log(`[cron] Created job "${job.name}" (${job.id}), next run: ${job.state.nextRunAt ? new Date(job.state.nextRunAt).toISOString() : "none"}`);
    return job;
  }

  updateJob(id: string, patch: Partial<Omit<CronJob, "id" | "createdAt" | "updatedAt" | "state">>): CronJob | null {
    const updated = cronStore.updateJob(id, patch);
    if (!updated) return null;

    // Recompute nextRunAt if schedule or enabled changed
    if (patch.schedule !== undefined || patch.enabled !== undefined) {
      if (updated.enabled) {
        const next = this.computeNextRun(updated.schedule, Date.now(), updated.state.lastRunAt);
        cronStore.updateJobState(id, { nextRunAt: next });
        updated.state.nextRunAt = next;
      } else {
        cronStore.updateJobState(id, { nextRunAt: undefined });
        updated.state.nextRunAt = undefined;
      }
    }

    return updated;
  }

  deleteJob(id: string): boolean {
    return cronStore.deleteJob(id);
  }

  async runNow(id: string): Promise<{ sessionId: string } | null> {
    const job = cronStore.getJob(id);
    if (!job) return null;
    await this.executeJob(job, Date.now());
    const updated = cronStore.getJob(id);
    return updated?.state.lastSessionId ? { sessionId: updated.state.lastSessionId } : null;
  }

  getRunLog(jobId: string, limit?: number): CronRunLogEntry[] {
    return cronStore.getRunLog(jobId, limit);
  }

  getAllRecentRuns(limit?: number): CronRunLogEntry[] {
    return cronStore.getAllRecentRuns(limit);
  }
}
