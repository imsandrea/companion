import { useEffect, useState } from "react";
import { useStore } from "../store.js";
import { sendMcpGetStatus, sendMcpToggle, sendMcpReconnect } from "../ws.js";
import type { McpServerDetail } from "../types.js";

const EMPTY_SERVERS: McpServerDetail[] = [];

function statusBadge(status: McpServerDetail["status"]) {
  switch (status) {
    case "connected":
      return { label: "Connected", cls: "text-cc-success bg-cc-success/10" };
    case "connecting":
      return { label: "Connecting", cls: "text-cc-warning bg-cc-warning/10" };
    case "failed":
      return { label: "Failed", cls: "text-cc-error bg-cc-error/10" };
    case "disabled":
      return { label: "Disabled", cls: "text-cc-muted bg-cc-hover" };
    default:
      return { label: status, cls: "text-cc-muted bg-cc-hover" };
  }
}

function McpServerRow({
  server,
  sessionId,
}: {
  server: McpServerDetail;
  sessionId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = statusBadge(server.status);
  const isEnabled = server.status !== "disabled";
  const toolCount = server.tools?.length ?? 0;

  return (
    <div className="rounded-lg border border-cc-border bg-cc-bg">
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Status dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            server.status === "connected"
              ? "bg-cc-success"
              : server.status === "connecting"
              ? "bg-cc-warning animate-pulse"
              : server.status === "failed"
              ? "bg-cc-error"
              : "bg-cc-muted opacity-40"
          }`}
        />

        {/* Name + expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 text-left cursor-pointer"
        >
          <span className="text-[12px] font-medium text-cc-fg truncate block">
            {server.name}
          </span>
        </button>

        {/* Status badge */}
        <span
          className={`text-[9px] font-medium px-1.5 rounded-full leading-[16px] shrink-0 ${badge.cls}`}
        >
          {badge.label}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Toggle enable/disable */}
          <button
            onClick={() => sendMcpToggle(sessionId, server.name, !isEnabled)}
            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
              isEnabled
                ? "text-cc-muted hover:text-cc-fg hover:bg-cc-hover"
                : "text-cc-muted/50 hover:text-cc-success hover:bg-cc-success/10"
            }`}
            title={isEnabled ? "Disable server" : "Enable server"}
          >
            {isEnabled ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 8h6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v6M5 8h6" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* Reconnect */}
          {(server.status === "failed" || server.status === "connected") && (
            <button
              onClick={() => sendMcpReconnect(sessionId, server.name)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
              title="Reconnect server"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                <path d="M2.5 8a5.5 5.5 0 019.78-3.5M13.5 8a5.5 5.5 0 01-9.78 3.5" strokeLinecap="round" />
                <path d="M12.5 2v3h-3M3.5 14v-3h3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-cc-border pt-2">
          {/* Config info */}
          <div className="text-[11px] text-cc-muted space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="text-cc-muted/60">Type:</span>
              <span>{server.config.type}</span>
            </div>
            {server.config.command && (
              <div className="flex items-start gap-1">
                <span className="text-cc-muted/60 shrink-0">Cmd:</span>
                <span className="font-mono text-[10px] break-all">
                  {server.config.command}
                  {server.config.args?.length ? ` ${server.config.args.join(" ")}` : ""}
                </span>
              </div>
            )}
            {server.config.url && (
              <div className="flex items-start gap-1">
                <span className="text-cc-muted/60 shrink-0">URL:</span>
                <span className="font-mono text-[10px] break-all">{server.config.url}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-cc-muted/60">Scope:</span>
              <span>{server.scope}</span>
            </div>
          </div>

          {/* Error */}
          {server.error && (
            <div className="text-[11px] text-cc-error bg-cc-error/5 rounded px-2 py-1">
              {server.error}
            </div>
          )}

          {/* Tools */}
          {toolCount > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-cc-muted uppercase tracking-wider">
                Tools ({toolCount})
              </span>
              <div className="flex flex-wrap gap-1">
                {server.tools!.map((tool) => (
                  <span
                    key={tool.name}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cc-hover text-cc-fg"
                    title={
                      tool.annotations
                        ? Object.entries(tool.annotations)
                            .filter(([, v]) => v)
                            .map(([k]) => k)
                            .join(", ") || undefined
                        : undefined
                    }
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function McpSection({ sessionId }: { sessionId: string }) {
  const servers = useStore((s) => s.mcpServers.get(sessionId) || EMPTY_SERVERS);
  const cliConnected = useStore((s) => s.cliConnected.get(sessionId) ?? false);

  // The session_init mcp_servers gives us basic info (name + status).
  // We can detect if MCP servers exist from session state to show the section.
  const sessionMcpServers = useStore(
    (s) => s.sessions.get(sessionId)?.mcp_servers || [],
  );

  const hasMcp = servers.length > 0 || sessionMcpServers.length > 0;

  // Auto-fetch detailed status when section becomes visible and CLI is connected
  useEffect(() => {
    if (cliConnected && hasMcp) {
      sendMcpGetStatus(sessionId);
    }
  }, [sessionId, cliConnected, hasMcp]);

  if (!hasMcp) return null;

  // If we have detailed servers, use those; otherwise fall back to basic info
  const displayServers: McpServerDetail[] =
    servers.length > 0
      ? servers
      : sessionMcpServers.map((s) => ({
          name: s.name,
          status: s.status as McpServerDetail["status"],
          config: { type: "unknown" },
          scope: "",
        }));

  return (
    <>
      {/* MCP section header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-cc-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-cc-fg flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-cc-muted">
            <path d="M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v1A1.5 1.5 0 0113 5.5H3A1.5 1.5 0 011.5 4V3zm0 5A1.5 1.5 0 013 6.5h10A1.5 1.5 0 0114.5 8v1A1.5 1.5 0 0113 10.5H3A1.5 1.5 0 011.5 9V8zm0 5A1.5 1.5 0 013 11.5h10a1.5 1.5 0 011.5 1.5v1a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 14v-1z" />
          </svg>
          MCP Servers
        </span>
        <button
          onClick={() => sendMcpGetStatus(sessionId)}
          disabled={!cliConnected}
          className={`text-[11px] font-medium transition-colors ${
            cliConnected
              ? "text-cc-muted hover:text-cc-fg cursor-pointer"
              : "text-cc-muted/30 cursor-not-allowed"
          }`}
          title="Refresh MCP server status"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            <path d="M2.5 8a5.5 5.5 0 019.78-3.5M13.5 8a5.5 5.5 0 01-9.78 3.5" strokeLinecap="round" />
            <path d="M12.5 2v3h-3M3.5 14v-3h3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Server list */}
      <div className="px-3 py-2 space-y-1.5 border-b border-cc-border">
        {displayServers.map((server) => (
          <McpServerRow
            key={server.name}
            server={server}
            sessionId={sessionId}
          />
        ))}
      </div>
    </>
  );
}
