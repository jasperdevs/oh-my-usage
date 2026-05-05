import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OhMyUsageConfig, ProviderAuthStatus, UsageRecord } from "../types";
import { codexCreditEstimate } from "../lib/pricing";
import { fileMtimeIso, readJsonFile, walkFiles } from "../lib/fs";

interface CodexSessionAccumulator {
  id: string;
  path: string;
  cwd?: string;
  model?: string;
  timestamp?: string;
  tokens?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
    total_tokens?: number;
  };
}

export function codexAuthStatus(root: string): ProviderAuthStatus {
  const authPath = join(root, "auth.json");
  const auth = readJsonFile<Record<string, unknown>>(authPath);
  const connected = existsSync(authPath) && auth !== undefined;

  return {
    provider: "codex",
    label: "Codex",
    oauth: connected ? "connected" : "missing",
    source: authPath,
    detail: connected ? "Codex auth file is present. Tokens are not read or displayed." : "No Codex auth file found.",
  };
}

export function collectCodex(root: string, config: OhMyUsageConfig, since: Date): UsageRecord[] {
  const sessionsRoot = join(root, "sessions");
  if (!existsSync(sessionsRoot)) return [];

  const records: UsageRecord[] = [];

  for (const path of walkFiles(sessionsRoot, [".jsonl"])) {
    const mtime = fileMtimeIso(path);
    if (mtime && new Date(mtime) < since) continue;

    const session: CodexSessionAccumulator = {
      id: path,
      path,
    };

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (!line.includes("session_meta") && !line.includes("turn_context") && !line.includes("token_count")) {
        continue;
      }

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "session_meta") {
        session.id = event.payload?.id || session.id;
        session.cwd = event.payload?.cwd || session.cwd;
        session.model = event.payload?.model || session.model;
        session.timestamp = event.timestamp || event.payload?.timestamp || session.timestamp;
      }

      if (event.type === "turn_context") {
        session.cwd = event.payload?.cwd || session.cwd;
        session.model = event.payload?.model || session.model;
      }

      if (event.type === "event_msg" && event.payload?.type === "token_count") {
        const usage = event.payload?.info?.total_token_usage;
        if (usage) {
          session.tokens = usage;
          session.timestamp = event.timestamp || session.timestamp;
        }
      }
    }

    if (!session.tokens) continue;

    const tokens = {
      input: Number(session.tokens.input_tokens || 0),
      cachedInput: Number(session.tokens.cached_input_tokens || 0),
      cacheWrite: 0,
      output: Number(session.tokens.output_tokens || 0),
      reasoning: Number(session.tokens.reasoning_output_tokens || 0),
      total: Number(session.tokens.total_tokens || 0),
    };

    records.push({
      provider: "codex",
      providerLabel: "Codex",
      model: session.model || "codex",
      sessionId: session.id,
      source: path,
      timestamp: session.timestamp || mtime || new Date().toISOString(),
      cwd: session.cwd,
      tokens,
      creditEquivalent: codexCreditEstimate(tokens, config),
    });
  }

  return records;
}
