import type { OhMyUsageConfig, ProviderAuthStatus, ProviderId, ProviderSummary, TokenUsage, UsageRecord, UsageReport } from "../types";
import { collectCodex, codexAuthStatus } from "./codex";
import { collectClaude, claudeAuthStatus } from "./claude";
import { collectOpenCode, opencodeAuthStatus } from "./opencode";
import { providerColor, resolvedConfig } from "../lib/config";

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

export function collectUsage(config: OhMyUsageConfig): UsageReport {
  const resolved = resolvedConfig(config);
  const since = new Date(Date.now() - resolved.sinceDays * 24 * 60 * 60 * 1000);
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
      color: providerColor(resolved, provider),
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
    sinceDays: resolved.sinceDays,
    summaries,
    records,
    warnings,
  };
}
