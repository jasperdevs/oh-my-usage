import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderAuthStatus, UsageRecord } from "../types";
import { fileMtimeIso, readJsonFile, walkFiles } from "../lib/fs";
import { claudeCostEstimate } from "../lib/pricing";

export function claudeAuthStatus(root: string): ProviderAuthStatus {
  const credentialsPath = join(root, ".credentials.json");
  const credentials = readJsonFile<Record<string, unknown>>(credentialsPath);
  const connected = existsSync(credentialsPath) && credentials !== undefined;

  return {
    provider: "claude",
    label: "Claude Code",
    oauth: connected ? "connected" : "missing",
    source: credentialsPath,
    detail: connected ? "Claude credentials file is present. Tokens are not read or displayed." : "No Claude credentials file found.",
  };
}

export function collectClaude(root: string, since: Date): UsageRecord[] {
  const projectsRoot = join(root, "projects");
  if (!existsSync(projectsRoot)) return [];

  const records: UsageRecord[] = [];

  for (const path of walkFiles(projectsRoot, [".jsonl"])) {
    const mtime = fileMtimeIso(path);
    if (mtime && new Date(mtime) < since) continue;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line.trim() || !line.includes('"usage"')) continue;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      const usage = event.message?.usage;
      const model = event.message?.model || "claude";
      if (event.type !== "assistant" || !usage) continue;

      const tokens = {
        input: Number(usage.input_tokens || 0),
        cachedInput: Number(usage.cache_read_input_tokens || 0),
        cacheWrite: Number(usage.cache_creation_input_tokens || 0),
        output: Number(usage.output_tokens || 0),
        reasoning: 0,
        total:
          Number(usage.input_tokens || 0) +
          Number(usage.cache_read_input_tokens || 0) +
          Number(usage.cache_creation_input_tokens || 0) +
          Number(usage.output_tokens || 0),
      };

      records.push({
        provider: "claude",
        providerLabel: "Claude Code",
        model,
        sessionId: event.sessionId || event.uuid || path,
        source: path,
        timestamp: event.timestamp || mtime || new Date().toISOString(),
        cwd: event.cwd,
        tokens,
        costUsd: claudeCostEstimate(model, tokens),
      });
    }
  }

  return records;
}
