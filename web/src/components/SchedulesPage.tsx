import { useState, useEffect, useCallback } from "react";
import { useStore } from "../store.js";
import { api, type CronJob, type CronRunLogEntry } from "../api.js";
import { CronJobForm } from "./CronJobForm.js";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "now";
  if (diff < 60_000) return `in ${Math.ceil(diff / 1000)}s`;
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;
  return `in ${Math.floor(diff / 86_400_000)}d`;
}

function scheduleLabel(job: CronJob): string {
  switch (job.schedule.kind) {
    case "cron":
      return job.schedule.expr + (job.schedule.tz ? ` (${job.schedule.tz})` : "");
    case "every": {
      const ms = job.schedule.intervalMs;
      if (ms >= 86_400_000) return `Every ${ms / 86_400_000}d`;
      if (ms >= 3_600_000) return `Every ${ms / 3_600_000}h`;
      return `Every ${ms / 60_000}m`;
    }
    case "at":
      return `Once: ${new Date(job.schedule.at).toLocaleString()}`;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "ok":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cc-success/10 text-cc-success">ok</span>;
    case "error":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cc-error/10 text-cc-error">error</span>;
    case "skipped":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cc-warning/10 text-cc-warning">skipped</span>;
    default:
      return null;
  }
}

export function SchedulesPage() {
  const darkMode = useStore((s) => s.darkMode);

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [recentRuns, setRecentRuns] = useState<CronRunLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([
      api.listCronJobs(),
      api.getRecentCronRuns(20),
    ]).then(([j, r]) => {
      setJobs(j);
      setRecentRuns(r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleToggle(job: CronJob) {
    await api.updateCronJob(job.id, { enabled: !job.enabled });
    refresh();
  }

  async function handleDelete(id: string) {
    await api.deleteCronJob(id);
    setConfirmDeleteId(null);
    refresh();
  }

  async function handleRunNow(id: string) {
    try {
      const result = await api.runCronJob(id);
      if (result?.sessionId) {
        // Navigate to the created session
        window.location.hash = "";
        useStore.getState().setCurrentSession(result.sessionId);
      }
      refresh();
    } catch {
      refresh();
    }
  }

  function handleEdit(job: CronJob) {
    setEditingJob(job);
    setShowForm(true);
  }

  function handleCreate() {
    setEditingJob(undefined);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingJob(undefined);
  }

  function handleFormSave() {
    setShowForm(false);
    setEditingJob(undefined);
    refresh();
  }

  return (
    <div className={`h-[100dvh] flex flex-col font-sans-ui bg-cc-bg text-cc-fg antialiased ${darkMode ? "dark" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-cc-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { window.location.hash = ""; }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold">Scheduled Tasks</h1>
          <span className="text-[10px] text-cc-muted px-1.5 py-0.5 rounded-full bg-cc-hover">
            {jobs.filter((j) => j.enabled).length} active
          </span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white rounded-lg transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
            <path d="M8 3v10M3 8h10" strokeLinecap="round" />
          </svg>
          New
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
          {/* Job List */}
          {loading ? (
            <div className="text-xs text-cc-muted text-center py-8">Loading schedules...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="text-cc-muted text-sm">No scheduled tasks yet</div>
              <div className="text-cc-muted text-xs">
                Create a schedule to automatically run Claude Code sessions at specific times.
              </div>
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white rounded-lg transition-colors cursor-pointer"
              >
                Create your first schedule
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`border rounded-[10px] overflow-hidden transition-colors ${
                    job.enabled ? "border-cc-border" : "border-cc-border/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3 px-4 py-3 bg-cc-card">
                    {/* Enable/disable toggle */}
                    <button
                      onClick={() => handleToggle(job)}
                      className="cursor-pointer shrink-0"
                      title={job.enabled ? "Disable" : "Enable"}
                    >
                      <div
                        className={`w-8 h-[18px] rounded-full transition-colors relative ${
                          job.enabled ? "bg-cc-success" : "bg-cc-hover"
                        }`}
                      >
                        <div
                          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                            job.enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                          }`}
                        />
                      </div>
                    </button>

                    {/* Name and schedule */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-cc-fg truncate">{job.name}</span>
                        {job.state.lastStatus && statusBadge(job.state.lastStatus)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono-code text-cc-muted truncate">
                          {scheduleLabel(job)}
                        </span>
                        {job.state.nextRunAt && job.enabled && (
                          <>
                            <span className="text-[10px] text-cc-muted">|</span>
                            <span className="text-[10px] text-cc-muted">
                              next: {timeUntil(job.state.nextRunAt)}
                            </span>
                          </>
                        )}
                        {job.state.lastRunAt && (
                          <>
                            <span className="text-[10px] text-cc-muted">|</span>
                            <span className="text-[10px] text-cc-muted">
                              last: {timeAgo(job.state.lastRunAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRunNow(job.id)}
                        className="px-2 py-1 text-[10px] text-cc-muted hover:text-cc-success rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
                        title="Run now"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M5 3l8 5-8 5V3z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEdit(job)}
                        className="px-2 py-1 text-[10px] text-cc-muted hover:text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === job.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(job.id)}
                            className="px-2 py-1 text-[10px] text-cc-error hover:bg-cc-error/10 rounded-md transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[10px] text-cc-muted hover:text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(job.id)}
                          className="px-2 py-1 text-[10px] text-cc-muted hover:text-cc-error rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Prompt preview */}
                  {job.description && (
                    <div className="px-4 py-2 border-t border-cc-border">
                      <p className="text-[11px] text-cc-muted">{job.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recent Runs */}
          {recentRuns.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-cc-muted mb-2">Recent Runs</h2>
              <div className="border border-cc-border rounded-[10px] overflow-hidden divide-y divide-cc-border">
                {recentRuns.map((run, i) => (
                  <div key={`${run.jobId}-${run.ts}-${i}`} className="flex items-center gap-3 px-4 py-2.5 bg-cc-card">
                    <span className="text-[10px] text-cc-muted w-16 shrink-0">
                      {new Date(run.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs text-cc-fg truncate flex-1">{run.jobName}</span>
                    {statusBadge(run.status)}
                    {run.sessionId && (
                      <button
                        onClick={() => {
                          window.location.hash = "";
                          useStore.getState().setCurrentSession(run.sessionId!);
                        }}
                        className="text-[10px] text-cc-primary hover:underline cursor-pointer shrink-0"
                      >
                        Open session
                      </button>
                    )}
                    {run.error && (
                      <span className="text-[10px] text-cc-error truncate max-w-[200px]" title={run.error}>
                        {run.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <CronJobForm
          job={editingJob}
          onSave={handleFormSave}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
