import { describe, it, expect, vi, beforeEach } from "vitest";
import { CronScheduler } from "./cron-scheduler.js";
import type { ScheduleType } from "./cron-types.js";

// Mock dependencies
const mockLauncher = {
  launch: vi.fn().mockReturnValue({ sessionId: "test-session-123" }),
} as any;

const mockWsBridge = {
  sendUserMessageFromServer: vi.fn(),
  getOrCreateSession: vi.fn().mockReturnValue({ id: "test-session-123" }),
} as any;

describe("CronScheduler", () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new CronScheduler(mockLauncher, mockWsBridge);
  });

  describe("computeNextRun", () => {
    const now = new Date("2025-06-15T12:00:00Z").getTime();

    it("computes next cron run", () => {
      // Use UTC timezone explicitly to avoid local timezone issues
      const schedule: ScheduleType = { kind: "cron", expr: "0 9 * * *", tz: "UTC" };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeDefined();
      expect(next!).toBeGreaterThan(now);
      const nextDate = new Date(next!);
      expect(nextDate.getUTCHours()).toBe(9);
      expect(nextDate.getUTCMinutes()).toBe(0);
    });

    it("computes next cron run with timezone", () => {
      const schedule: ScheduleType = { kind: "cron", expr: "0 9 * * *", tz: "America/New_York" };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeDefined();
      expect(next!).toBeGreaterThan(now);
    });

    it("returns undefined for invalid cron expression", () => {
      const schedule: ScheduleType = { kind: "cron", expr: "invalid" };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeUndefined();
    });

    it("computes next interval run from lastRunAt", () => {
      const schedule: ScheduleType = { kind: "every", intervalMs: 3_600_000 };
      const lastRun = now - 1_800_000; // 30 min ago
      const next = scheduler.computeNextRun(schedule, now, lastRun);
      // Should be lastRun + interval
      expect(next).toBe(lastRun + 3_600_000);
    });

    it("computes next interval from now when no lastRunAt", () => {
      const schedule: ScheduleType = { kind: "every", intervalMs: 60_000 };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBe(now + 60_000);
    });

    it("returns undefined for non-positive interval", () => {
      const schedule: ScheduleType = { kind: "every", intervalMs: 0 };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeUndefined();
    });

    it("returns timestamp for future at schedule", () => {
      const futureTime = new Date(now + 86_400_000).toISOString();
      const schedule: ScheduleType = { kind: "at", at: futureTime };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeDefined();
      expect(next!).toBeGreaterThan(now);
    });

    it("returns undefined for past at schedule", () => {
      const pastTime = new Date(now - 86_400_000).toISOString();
      const schedule: ScheduleType = { kind: "at", at: pastTime };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeUndefined();
    });

    it("returns undefined for invalid at timestamp", () => {
      const schedule: ScheduleType = { kind: "at", at: "not-a-date" };
      const next = scheduler.computeNextRun(schedule, now);
      expect(next).toBeUndefined();
    });
  });
});
