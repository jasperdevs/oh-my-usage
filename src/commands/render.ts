import type { ProviderSummary, UsageReport } from "../types";
import { bar, compactNumber, credits, money, percent } from "../lib/format";

function providerLine(summary: ProviderSummary, maxTokens: number): string {
  const tokenTotal = summary.tokens.total || summary.tokens.input + summary.tokens.cachedInput + summary.tokens.cacheWrite + summary.tokens.output + summary.tokens.reasoning;
  const auth = summary.auth.oauth === "connected" ? "oauth ok" : summary.auth.oauth;
  const cost = summary.costUsd > 0 ? money(summary.costUsd) : summary.creditEquivalent > 0 ? credits(summary.creditEquivalent) : "-";
  return [
    summary.label.padEnd(12),
    bar(tokenTotal, maxTokens, 24),
    compactNumber(tokenTotal).padStart(7),
    `${summary.sessions} sessions`.padStart(11),
    `${summary.models} models`.padStart(9),
    cost.padStart(10),
    auth,
  ].join("  ");
}

export function renderSummary(report: UsageReport): string {
  const totals = report.summaries.reduce(
    (acc, summary) => {
      acc.tokens += summary.tokens.total || summary.tokens.input + summary.tokens.cachedInput + summary.tokens.cacheWrite + summary.tokens.output + summary.tokens.reasoning;
      acc.cost += summary.costUsd;
      acc.credits += summary.creditEquivalent;
      return acc;
    },
    { tokens: 0, cost: 0, credits: 0 },
  );
  const maxTokens = Math.max(1, ...report.summaries.map((summary) => summary.tokens.total || 0));

  const lines = [
    "oh-my-usage",
    `Last ${report.sinceDays} days · ${compactNumber(totals.tokens)} tokens · ${money(totals.cost)} tracked cost · ${credits(totals.credits)} Codex equivalent`,
    "",
    "Provider      Usage                     Tokens     Sessions    Models    Estimate    Auth",
    "────────────  ────────────────────────  ───────  ───────────  ───────  ──────────  ────────",
    ...report.summaries.map((summary) => providerLine(summary, maxTokens)),
    "",
    "Token mix",
    `input ${compactNumber(report.summaries.reduce((n, s) => n + s.tokens.input, 0))} · cached ${compactNumber(report.summaries.reduce((n, s) => n + s.tokens.cachedInput, 0))} · cache write ${compactNumber(report.summaries.reduce((n, s) => n + s.tokens.cacheWrite, 0))} · output ${compactNumber(report.summaries.reduce((n, s) => n + s.tokens.output, 0))} · reasoning ${compactNumber(report.summaries.reduce((n, s) => n + s.tokens.reasoning, 0))}`,
    "",
    "Recent models",
    ...topModels(report).map((line) => `  ${line}`),
  ];

  if (report.warnings.length > 0) {
    lines.push("", "Warnings", ...report.warnings.map((warning) => `  - ${warning}`));
  }

  lines.push("", "Subscription note: remaining plan quota is only shown when a provider exposes it; this tool tracks real local usage and OAuth presence without reading token values.");

  return `${lines.join("\n")}\n`;
}

function topModels(report: UsageReport): string[] {
  const totals = new Map<string, { tokens: number; provider: string }>();

  for (const record of report.records) {
    const key = `${record.providerLabel} / ${record.model}`;
    const current = totals.get(key) || { tokens: 0, provider: record.providerLabel };
    current.tokens += record.tokens.total || record.tokens.input + record.tokens.cachedInput + record.tokens.cacheWrite + record.tokens.output + record.tokens.reasoning;
    totals.set(key, current);
  }

  const allTokens = Array.from(totals.values()).reduce((sum, item) => sum + item.tokens, 0);

  return Array.from(totals.entries())
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 6)
    .map(([name, item]) => `${name.padEnd(36)} ${compactNumber(item.tokens).padStart(8)} ${percent(item.tokens, allTokens)}`);
}

export function renderAuth(report: UsageReport): string {
  return `${report.summaries
    .map((summary) => `${summary.label}: ${summary.auth.oauth}\n  ${summary.auth.detail}\n  ${summary.auth.source}`)
    .join("\n\n")}\n`;
}

export function renderSettings(configPath: string, config: object): string {
  return `Settings file: ${configPath}\n\n${JSON.stringify(config, null, 2)}\n`;
}
