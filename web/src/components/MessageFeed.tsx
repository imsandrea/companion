import { useEffect, useRef, useMemo, useState } from "react";
import { useStore } from "../store.js";
import { MessageBubble } from "./MessageBubble.js";
import { getToolIcon, getToolLabel, getPreview, ToolIcon } from "./ToolBlock.js";
import type { ChatMessage, ContentBlock } from "../types.js";

const EMPTY_MESSAGES: ChatMessage[] = [];

// ─── Message-level grouping ─────────────────────────────────────────────────

interface ToolMsgGroup {
  kind: "tool_msg_group";
  toolName: string;
  items: { id: string; name: string; input: Record<string, unknown> }[];
  firstId: string;
}

type FeedEntry =
  | { kind: "message"; msg: ChatMessage }
  | ToolMsgGroup;

/**
 * Get the dominant tool name if this message is "tool-only"
 * (assistant message whose contentBlocks are ALL tool_use of the same name).
 * Returns null if it has text/thinking or mixed tool types.
 */
function getToolOnlyName(msg: ChatMessage): string | null {
  if (msg.role !== "assistant") return null;
  const blocks = msg.contentBlocks;
  if (!blocks || blocks.length === 0) return null;

  let toolName: string | null = null;
  for (const b of blocks) {
    if (b.type === "text" && b.text.trim()) return null;
    if (b.type === "thinking") return null;
    if (b.type === "tool_use") {
      if (toolName === null) toolName = b.name;
      else if (toolName !== b.name) return null;
    }
  }
  return toolName;
}

function extractToolItems(msg: ChatMessage): { id: string; name: string; input: Record<string, unknown> }[] {
  const blocks = msg.contentBlocks || [];
  return blocks
    .filter((b): b is ContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

function groupMessages(messages: ChatMessage[]): FeedEntry[] {
  const entries: FeedEntry[] = [];

  for (const msg of messages) {
    const toolName = getToolOnlyName(msg);

    if (toolName) {
      const last = entries[entries.length - 1];
      if (last?.kind === "tool_msg_group" && last.toolName === toolName) {
        last.items.push(...extractToolItems(msg));
        continue;
      }
      // Start new group
      entries.push({
        kind: "tool_msg_group",
        toolName,
        items: extractToolItems(msg),
        firstId: msg.id,
      });
    } else {
      entries.push({ kind: "message", msg });
    }
  }

  return entries;
}

// ─── Components ──────────────────────────────────────────────────────────────

function ToolMessageGroup({ group }: { group: ToolMsgGroup }) {
  const [open, setOpen] = useState(false);
  const iconType = getToolIcon(group.toolName);
  const label = getToolLabel(group.toolName);
  const count = group.items.length;

  // Single item — don't group, render inline
  if (count === 1) {
    const item = group.items[0];
    return (
      <div className="animate-[fadeSlideIn_0.2s_ease-out]">
        <div className="flex items-start gap-3">
          <AssistantAvatar />
          <div className="flex-1 min-w-0">
            <div className="border border-cc-border rounded-[10px] overflow-hidden bg-cc-card">
              <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cc-hover transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-cc-muted transition-transform shrink-0 ${open ? "rotate-90" : ""}`}>
                  <path d="M6 4l4 4-4 4" />
                </svg>
                <ToolIcon type={iconType} />
                <span className="text-xs font-medium text-cc-fg">{label}</span>
                <span className="text-xs text-cc-muted truncate flex-1 font-mono-code">
                  {getPreview(item.name, item.input)}
                </span>
              </button>
              {open && (
                <div className="px-3 pb-3 pt-0 border-t border-cc-border mt-0">
                  <pre className="mt-2 text-[11px] text-cc-muted font-mono-code whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {JSON.stringify(item.input, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-item group
  return (
    <div className="animate-[fadeSlideIn_0.2s_ease-out]">
      <div className="flex items-start gap-3">
        <AssistantAvatar />
        <div className="flex-1 min-w-0">
          <div className="border border-cc-border rounded-[10px] overflow-hidden bg-cc-card">
            <button
              onClick={() => setOpen(!open)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cc-hover transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-cc-muted transition-transform shrink-0 ${open ? "rotate-90" : ""}`}>
                <path d="M6 4l4 4-4 4" />
              </svg>
              <ToolIcon type={iconType} />
              <span className="text-xs font-medium text-cc-fg">{label}</span>
              <span className="text-[10px] text-cc-muted bg-cc-hover rounded-full px-1.5 py-0.5 tabular-nums font-medium">
                {count}
              </span>
            </button>

            {open && (
              <div className="border-t border-cc-border px-3 py-1.5">
                {group.items.map((item, i) => {
                  const preview = getPreview(item.name, item.input);
                  return (
                    <div key={item.id || i} className="flex items-center gap-2 py-1 text-xs text-cc-muted font-mono-code truncate">
                      <span className="w-1 h-1 rounded-full bg-cc-muted/40 shrink-0" />
                      <span className="truncate">{preview || JSON.stringify(item.input).slice(0, 80)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-cc-primary/10 flex items-center justify-center shrink-0 mt-0.5">
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-cc-primary">
        <circle cx="8" cy="8" r="3" />
      </svg>
    </div>
  );
}

// ─── Main Feed ───────────────────────────────────────────────────────────────

export function MessageFeed({ sessionId }: { sessionId: string }) {
  const messages = useStore((s) => s.messages.get(sessionId) ?? EMPTY_MESSAGES);
  const streamingText = useStore((s) => s.streaming.get(sessionId));
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !streamingText) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none px-6">
        <div className="w-14 h-14 rounded-2xl bg-cc-card border border-cc-border flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-cc-muted">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm text-cc-fg font-medium mb-1">Start a conversation</p>
          <p className="text-xs text-cc-muted leading-relaxed">
            Send a message to begin working with The Vibe Companion.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scroll-smooth px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-5">
          {grouped.map((entry, i) => {
            if (entry.kind === "tool_msg_group") {
              return <ToolMessageGroup key={entry.firstId || i} group={entry} />;
            }
            return <MessageBubble key={entry.msg.id} message={entry.msg} />;
          })}

          {/* Streaming indicator */}
          {streamingText && (
            <div className="animate-[fadeSlideIn_0.2s_ease-out]">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cc-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-cc-primary">
                    <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <pre className="font-serif-assistant text-[15px] text-cc-fg whitespace-pre-wrap break-words leading-relaxed">
                    {streamingText}
                    <span className="inline-block w-0.5 h-4 bg-cc-primary ml-0.5 align-middle animate-[pulse-dot_0.8s_ease-in-out_infinite]" />
                  </pre>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
