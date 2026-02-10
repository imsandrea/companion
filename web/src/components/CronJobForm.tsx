import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api, type CronJob, type CronJobCreate, type CronJobPatch, type CompanionEnv, type ScheduleType } from "../api.js";
import { FolderPicker } from "./FolderPicker.js";
import { getRecentDirs } from "../utils/recent-dirs.js";

const MODELS = [
  { value: "claude-opus-4-6", label: "Opus" },
  { value: "claude-sonnet-4-5-20250929", label: "Sonnet" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku" },
];

const MODES = [
  { value: "bypassPermissions", label: "Agent (auto-approve)" },
  { value: "plan", label: "Plan" },
];

const SCHEDULE_KINDS = [
  { value: "cron" as const, label: "Cron Expression" },
  { value: "every" as const, label: "Interval" },
  { value: "at" as const, label: "One-shot" },
];

const INTERVAL_UNITS = [
  { value: 60_000, label: "minutes" },
  { value: 3_600_000, label: "hours" },
  { value: 86_400_000, label: "days" },
];

interface Props {
  job?: CronJob;
  onSave: () => void;
  onClose: () => void;
}

export function CronJobForm({ job, onSave, onClose }: Props) {
  const isEdit = !!job;

  const [name, setName] = useState(job?.name ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? "");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [deleteAfterRun, setDeleteAfterRun] = useState(job?.deleteAfterRun ?? false);

  // Schedule
  const [scheduleKind, setScheduleKind] = useState<"cron" | "every" | "at">(
    job?.schedule.kind ?? "cron",
  );
  const [cronExpr, setCronExpr] = useState(
    job?.schedule.kind === "cron" ? job.schedule.expr : "0 9 * * 1-5",
  );
  const [cronTz, setCronTz] = useState(
    job?.schedule.kind === "cron" ? (job.schedule.tz ?? "") : "",
  );
  const [intervalValue, setIntervalValue] = useState(() => {
    if (job?.schedule.kind === "every") {
      const ms = job.schedule.intervalMs;
      if (ms >= 86_400_000 && ms % 86_400_000 === 0) return ms / 86_400_000;
      if (ms >= 3_600_000 && ms % 3_600_000 === 0) return ms / 3_600_000;
      return ms / 60_000;
    }
    return 30;
  });
  const [intervalUnit, setIntervalUnit] = useState(() => {
    if (job?.schedule.kind === "every") {
      const ms = job.schedule.intervalMs;
      if (ms >= 86_400_000 && ms % 86_400_000 === 0) return 86_400_000;
      if (ms >= 3_600_000 && ms % 3_600_000 === 0) return 3_600_000;
    }
    return 60_000;
  });
  const [atDatetime, setAtDatetime] = useState(() => {
    if (job?.schedule.kind === "at") return job.schedule.at;
    // Default to 1 hour from now
    const d = new Date(Date.now() + 3_600_000);
    return d.toISOString().slice(0, 16);
  });

  // Session config
  const [model, setModel] = useState(job?.model ?? MODELS[1].value);
  const [mode, setMode] = useState(job?.permissionMode ?? MODES[0].value);
  const [cwd, setCwd] = useState(() => job?.cwd ?? getRecentDirs()[0] ?? "");
  const [envSlug, setEnvSlug] = useState(job?.envSlug ?? "");
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Env list
  const [envs, setEnvs] = useState<CompanionEnv[]>([]);
  useEffect(() => {
    api.listEnvs().then(setEnvs).catch(() => {});
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function buildSchedule(): ScheduleType {
    switch (scheduleKind) {
      case "cron":
        return { kind: "cron", expr: cronExpr.trim(), ...(cronTz ? { tz: cronTz } : {}) };
      case "every":
        return { kind: "every", intervalMs: intervalValue * intervalUnit };
      case "at":
        return { kind: "at", at: new Date(atDatetime).toISOString() };
    }
  }

  async function handleSubmit() {
    if (!name.trim() || !prompt.trim()) {
      setError("Name and prompt are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const schedule = buildSchedule();
      if (isEdit && job) {
        const patch: CronJobPatch = {
          name, description, prompt, enabled, deleteAfterRun,
          schedule, model, permissionMode: mode, cwd, envSlug: envSlug || undefined,
        };
        await api.updateCronJob(job.id, patch);
      } else {
        const input: CronJobCreate = {
          name, description, prompt, enabled, deleteAfterRun,
          schedule, model, permissionMode: mode, cwd, envSlug: envSlug || undefined,
        };
        await api.createCronJob(input);
      }
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Human-readable schedule description
  function schedulePreview(): string {
    switch (scheduleKind) {
      case "cron":
        return `Cron: ${cronExpr}${cronTz ? ` (${cronTz})` : ""}`;
      case "every": {
        const unit = INTERVAL_UNITS.find((u) => u.value === intervalUnit);
        return `Every ${intervalValue} ${unit?.label ?? "?"}`;
      }
      case "at":
        return `Once at ${new Date(atDatetime).toLocaleString()}`;
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-cc-bg border border-cc-border rounded-[14px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cc-border">
          <h2 className="text-sm font-semibold text-cc-fg">
            {isEdit ? "Edit Schedule" : "New Schedule"}
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/20 text-xs text-cc-error">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-cc-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning PR Review"
              className="w-full px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium text-cc-muted mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this schedule does"
              className="w-full px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50"
            />
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-[11px] font-medium text-cc-muted mb-1">Schedule</label>
            <div className="flex gap-1.5 mb-2">
              {SCHEDULE_KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => setScheduleKind(k.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                    scheduleKind === k.value
                      ? "bg-cc-primary/10 border-cc-primary/30 text-cc-primary font-medium"
                      : "border-cc-border text-cc-muted hover:text-cc-fg hover:border-cc-fg/20"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {scheduleKind === "cron" && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  className="w-full px-3 py-2 text-xs font-mono-code bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50"
                />
                <input
                  type="text"
                  value={cronTz}
                  onChange={(e) => setCronTz(e.target.value)}
                  placeholder="Timezone (optional, e.g. Europe/Paris)"
                  className="w-full px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50"
                />
                <div className="text-[10px] text-cc-muted">
                  Format: minute hour day-of-month month day-of-week
                </div>
              </div>
            )}

            {scheduleKind === "every" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-cc-muted">Every</span>
                <input
                  type="number"
                  min={1}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value)))}
                  className="w-20 px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(Number(e.target.value))}
                  className="px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                >
                  {INTERVAL_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            )}

            {scheduleKind === "at" && (
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  value={atDatetime}
                  onChange={(e) => setAtDatetime(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deleteAfterRun}
                    onChange={(e) => setDeleteAfterRun(e.target.checked)}
                    className="accent-cc-primary"
                  />
                  <span className="text-xs text-cc-muted">Delete after execution</span>
                </label>
              </div>
            )}

            <div className="mt-1.5 text-[10px] text-cc-muted italic">{schedulePreview()}</div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-[11px] font-medium text-cc-muted mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should Claude do when this schedule triggers?"
              rows={4}
              className="w-full px-3 py-2 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50 resize-none"
            />
          </div>

          {/* Session Config */}
          <div className="border border-cc-border rounded-[10px] overflow-hidden">
            <div className="px-3 py-2.5 bg-cc-card">
              <span className="text-[11px] font-medium text-cc-muted">Session Config</span>
            </div>
            <div className="px-3 py-3 space-y-3 border-t border-cc-border">
              {/* Model */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-cc-muted w-20 shrink-0">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Permission Mode */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-cc-muted w-20 shrink-0">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Working Directory */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-cc-muted w-20 shrink-0">Directory</label>
                <button
                  onClick={() => setShowFolderPicker(true)}
                  className="flex-1 px-2 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-left text-cc-fg hover:border-cc-fg/20 transition-colors truncate cursor-pointer"
                >
                  {cwd || "Select folder..."}
                </button>
              </div>

              {/* Environment */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-cc-muted w-20 shrink-0">Env</label>
                <select
                  value={envSlug}
                  onChange={(e) => setEnvSlug(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg focus:outline-none focus:border-cc-primary/50"
                >
                  <option value="">None</option>
                  {envs.map((e) => (
                    <option key={e.slug} value={e.slug}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-cc-primary"
            />
            <span className="text-xs text-cc-fg">Enabled</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-cc-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-cc-muted hover:text-cc-fg rounded-lg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !prompt.trim()}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              saving || !name.trim() || !prompt.trim()
                ? "bg-cc-hover text-cc-muted cursor-not-allowed"
                : "bg-cc-primary hover:bg-cc-primary-hover text-white cursor-pointer"
            }`}
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>

      {showFolderPicker && (
        <FolderPicker
          initialPath={cwd}
          onSelect={(p) => { setCwd(p); setShowFolderPicker(false); }}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </div>,
    document.body,
  );
}
