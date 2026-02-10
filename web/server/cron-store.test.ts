import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as store from "./cron-store.js";
import type { CronRunLogEntry } from "./cron-types.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cron-store-test-${randomUUID()}`);
  mkdirSync(testDir, { recursive: true });
  store._setBaseDir(testDir);
});

afterEach(() => {
  store._setBaseDir(null);
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("cron-store", () => {
  describe("listJobs", () => {
    it("returns empty array when no jobs exist", () => {
      expect(store.listJobs()).toEqual([]);
    });

    it("returns all created jobs", () => {
      store.createJob({
        name: "First",
        prompt: "Do thing 1",
        enabled: true,
        schedule: { kind: "every", intervalMs: 60_000 },
      });
      store.createJob({
        name: "Second",
        prompt: "Do thing 2",
        enabled: true,
        schedule: { kind: "cron", expr: "0 9 * * *" },
      });
      const jobs = store.listJobs();
      expect(jobs).toHaveLength(2);
      const names = jobs.map((j) => j.name).sort();
      expect(names).toEqual(["First", "Second"]);
    });
  });

  describe("createJob", () => {
    it("creates a job with generated id and timestamps", () => {
      const job = store.createJob({
        name: "Test Job",
        prompt: "Hello",
        enabled: true,
        schedule: { kind: "every", intervalMs: 300_000 },
      });
      expect(job.id).toBeTruthy();
      expect(job.name).toBe("Test Job");
      expect(job.prompt).toBe("Hello");
      expect(job.enabled).toBe(true);
      expect(job.createdAt).toBeGreaterThan(0);
      expect(job.updatedAt).toBe(job.createdAt);
      expect(job.state).toEqual({});
    });

    it("trims name and prompt", () => {
      const job = store.createJob({
        name: "  Trimmed Name  ",
        prompt: "  Trimmed Prompt  ",
        enabled: true,
        schedule: { kind: "at", at: "2030-01-01T00:00:00Z" },
      });
      expect(job.name).toBe("Trimmed Name");
      expect(job.prompt).toBe("Trimmed Prompt");
    });

    it("throws if name is empty", () => {
      expect(() =>
        store.createJob({
          name: "",
          prompt: "Hello",
          enabled: true,
          schedule: { kind: "every", intervalMs: 60_000 },
        }),
      ).toThrow("Job name is required");
    });

    it("throws if prompt is empty", () => {
      expect(() =>
        store.createJob({
          name: "Test",
          prompt: "",
          enabled: true,
          schedule: { kind: "every", intervalMs: 60_000 },
        }),
      ).toThrow("Job prompt is required");
    });
  });

  describe("getJob", () => {
    it("returns null for non-existent job", () => {
      expect(store.getJob("non-existent")).toBeNull();
    });

    it("returns created job by id", () => {
      const created = store.createJob({
        name: "Test",
        prompt: "Hello",
        enabled: true,
        schedule: { kind: "every", intervalMs: 60_000 },
      });
      const fetched = store.getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe("Test");
    });
  });

  describe("updateJob", () => {
    it("returns null for non-existent job", () => {
      expect(store.updateJob("non-existent", { name: "foo" })).toBeNull();
    });

    it("updates fields and bumps updatedAt", () => {
      const job = store.createJob({
        name: "Original",
        prompt: "Hello",
        enabled: true,
        schedule: { kind: "every", intervalMs: 60_000 },
      });
      const updated = store.updateJob(job.id, { name: "Updated", enabled: false });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated");
      expect(updated!.enabled).toBe(false);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(job.updatedAt);
      expect(updated!.state).toEqual({});
    });
  });

  describe("updateJobState", () => {
    it("updates state fields", () => {
      const job = store.createJob({
        name: "Test",
        prompt: "Hello",
        enabled: true,
        schedule: { kind: "every", intervalMs: 60_000 },
      });
      const updated = store.updateJobState(job.id, {
        nextRunAt: 1234567890,
        lastStatus: "ok",
      });
      expect(updated).not.toBeNull();
      expect(updated!.state.nextRunAt).toBe(1234567890);
      expect(updated!.state.lastStatus).toBe("ok");
    });
  });

  describe("deleteJob", () => {
    it("returns false for non-existent job", () => {
      expect(store.deleteJob("non-existent")).toBe(false);
    });

    it("deletes an existing job", () => {
      const job = store.createJob({
        name: "To Delete",
        prompt: "Hello",
        enabled: true,
        schedule: { kind: "every", intervalMs: 60_000 },
      });
      expect(store.deleteJob(job.id)).toBe(true);
      expect(store.getJob(job.id)).toBeNull();
      expect(store.listJobs()).toHaveLength(0);
    });
  });

  describe("run logs", () => {
    it("appends and reads run log entries", () => {
      const jobId = randomUUID();
      const entry: CronRunLogEntry = {
        ts: Date.now(),
        jobId,
        jobName: "Test",
        status: "ok",
        sessionId: "sess-1",
        durationMs: 100,
      };
      store.appendRunLog(entry);

      const logs = store.getRunLog(jobId);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("ok");
      expect(logs[0].sessionId).toBe("sess-1");
    });

    it("returns most recent entries first", () => {
      const jobId = randomUUID();
      store.appendRunLog({ ts: 1000, jobId, jobName: "Test", status: "ok" });
      store.appendRunLog({ ts: 2000, jobId, jobName: "Test", status: "error", error: "fail" });
      store.appendRunLog({ ts: 3000, jobId, jobName: "Test", status: "ok" });

      const logs = store.getRunLog(jobId);
      expect(logs).toHaveLength(3);
      expect(logs[0].ts).toBe(3000);
      expect(logs[2].ts).toBe(1000);
    });

    it("respects limit parameter", () => {
      const jobId = randomUUID();
      for (let i = 0; i < 10; i++) {
        store.appendRunLog({ ts: i, jobId, jobName: "Test", status: "ok" });
      }
      const logs = store.getRunLog(jobId, 3);
      expect(logs).toHaveLength(3);
    });

    it("getAllRecentRuns aggregates across jobs", () => {
      const jobId1 = randomUUID();
      const jobId2 = randomUUID();
      store.appendRunLog({ ts: 1000, jobId: jobId1, jobName: "Job1", status: "ok" });
      store.appendRunLog({ ts: 2000, jobId: jobId2, jobName: "Job2", status: "ok" });
      store.appendRunLog({ ts: 3000, jobId: jobId1, jobName: "Job1", status: "error" });

      const runs = store.getAllRecentRuns(10);
      expect(runs).toHaveLength(3);
      expect(runs[0].ts).toBe(3000);
    });
  });
});
