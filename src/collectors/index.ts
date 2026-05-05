import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OhMyUsageConfig, ProviderAuthStatus, ProviderId, ProviderSummary, TokenUsage, UsageCache, UsageRange, UsageRecord, UsageReport } from "../types";
import { collectCodex, codexAuthStatus } from "./codex";
import { collectClaude, claudeAuthStatus } from "./claude";
import { collectOpenCode, opencodeAuthStatus } from "./opencode";
import { providerColor, resolvedConfig } from "../lib/config";
import { stateDir } from "../lib/env";

function blankTokens(): TokenUsage {
  return {
    input: 0,
    cachedInput: 0,
    cacheWrite: 0,
    output: 0,
    reasoning: 0,
    total: 0,
  };
}

function addTokens(target: TokenUsage, next: TokenUsage): void {
  target.input += next.input;
  target.cachedInput += next.cachedInput;
  target.cacheWrite += next.cacheWrite;
  target.output += next.output;
  target.reasoning += next.reasoning;
  target.total += next.total || next.input + next.cachedInput + next.cacheWrite + next.output + next.reasoning;
}

const LABELS: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "opencode",
};

export function cachePath(): string {
  return join(stateDir(), "usage-cache.json");
}

export function loadUsageCache(): UsageCache | undefined {
  try {
    const path = cachePath();
    if (!existsSync(path)) return undefined;
    const cache = JSON.parse(readFileSync(path, "utf8")) as UsageCache;
    return cache.version === 1 ? cache : undefined;
  } catch {
    return undefined;
  }
}

export function saveUsageCache(cache: UsageCache): void {
  if (process.env.OH_MY_USAGE_DISABLE_CACHE_WRITE === "1") return;
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(cachePath(), `${JSON.stringify(cache)}\n`);
}

export function rangeToSince(range: UsageRange, now = Date.now(), sinceDays = 30): Date {
  if (range === "day") {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (range === "year") return new Date(now - 365 * 24 * 60 * 60 * 1000);
  if (range === "all") return new Date(0);
  return new Date(now - sinceDays * 24 * 60 * 60 * 1000);
}

export function emptyReport(config: OhMyUsageConfig, range: UsageRange): UsageReport {
  const resolved = resolvedConfig(config);
  const auth: Record<ProviderId, ProviderAuthStatus> = {
    codex: codexAuthStatus(resolved.codexRoot),
    claude: claudeAuthStatus(resolved.claudeRoot),
    opencode: opencodeAuthStatus(resolved.opencodeDb),
  };
  return buildUsageReport([], auth, [], config, range, { loading: true });
}

export function collectUsage(config: OhMyUsageConfig, range: UsageRange = config.defaultRange): UsageReport {
  const resolved = resolvedConfig(config);
  const since = new Date(0);
  const warnings: string[] = [];
  const auth: Record<ProviderId, ProviderAuthStatus> = {
    codex: codexAuthStatus(resolved.codexRoot),
    claude: claudeAuthStatus(resolved.claudeRoot),
    opencode: opencodeAuthStatus(resolved.opencodeDb),
  };

  let records: UsageRecord[] = [];

  try {
    records = records.concat(collectCodex(resolved.codexRoot, resolved, since));
  } catch (error) {
    warnings.push(`Codex collector failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    records = records.concat(collectClaude(resolved.claudeRoot, since));
  } catch (error) {
    warnings.push(`Claude collector failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    records = records.concat(collectOpenCode(resolved.opencodeDb, since));
  } catch (error) {
    warnings.push(`opencode collector failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const cache: UsageCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    records,
    auth,
    warnings,
  };
  saveUsageCache(cache);

  return buildUsageReport(records, auth, warnings, resolved, range);
}

export function collectUsageFromCache(config: OhMyUsageConfig, range: UsageRange = config.defaultRange): UsageReport | undefined {
  const cache = loadUsageCache();
  if (!cache) return undefined;
  return buildUsageReport(cache.records, cache.auth, cache.warnings, resolvedConfig(config), range, { stale: true });
}

export function buildUsageReport(
  allRecords: UsageRecord[],
  auth: Record<ProviderId, ProviderAuthStatus>,
  warnings: string[],
  config: OhMyUsageConfig,
  range: UsageRange,
  flags: Pick<UsageReport, "stale" | "loading"> = {},
): UsageReport {
  const since = rangeToSince(range, Date.now(), config.sinceDays);
  const records = allRecords.filter((record) => new Date(record.timestamp) >= since);
  const summaries = (["codex", "claude", "opencode"] as ProviderId[]).map((provider): ProviderSummary => {
    const providerRecords = records.filter((record) => record.provider === provider);
    const sessions = new Set(providerRecords.map((record) => record.sessionId));
    const models = new Set(providerRecords.map((record) => record.model));
    const tokens = blankTokens();
    let costUsd = 0;
    let creditEquivalent = 0;
    let firstSeen: string | undefined;
    let lastSeen: string | undefined;

    for (const record of providerRecords) {
      addTokens(tokens, record.tokens);
      costUsd += record.costUsd || 0;
      creditEquivalent += record.creditEquivalent || 0;
      firstSeen = !firstSeen || record.timestamp < firstSeen ? record.timestamp : firstSeen;
      lastSeen = !lastSeen || record.timestamp > lastSeen ? record.timestamp : lastSeen;
    }

    return {
      provider,
      label: LABELS[provider],
      color: providerColor(config, provider),
      records: providerRecords.length,
      sessions: sessions.size,
      models: models.size,
      tokens,
      costUsd,
      creditEquivalent,
      firstSeen,
      lastSeen,
      auth: auth[provider],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sinceDays: config.sinceDays,
    range,
    ...flags,
    summaries,
    records,
    warnings,
  };
}
