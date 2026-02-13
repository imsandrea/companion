import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_COMPANION_CODEX_HOME = join(
  homedir(),
  ".companion",
  "codex-home",
);

export function getLegacyCodexHome(): string {
  return join(homedir(), ".codex");
}

export function resolveCompanionCodexHome(explicitCodexHome?: string): string {
  return resolve(
    explicitCodexHome
      || process.env.CODEX_HOME
      || DEFAULT_COMPANION_CODEX_HOME,
  );
}

export function resolveCompanionCodexSessionHome(
  sessionId: string,
  explicitCodexHome?: string,
): string {
  return join(resolveCompanionCodexHome(explicitCodexHome), sessionId);
}
