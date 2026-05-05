#!/usr/bin/env bun
import { collectUsage } from "./collectors";
import { configPath, ensureConfig, loadConfig, saveConfig, setConfigValue } from "./lib/config";
import { syncModelsDevCache } from "./lib/pricing";
import { renderAuth, renderSettings, renderSummary } from "./commands/render";
import { runDashboard } from "./tui/dashboard";
import type { UsageReport } from "./types";

interface CliOptions {
  command: string;
  json: boolean;
  once: boolean;
  demo: boolean;
  since?: number;
  key?: string;
  value?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "dashboard",
    json: false,
    once: false,
    demo: false,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    options.command = args.shift() || "dashboard";
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--once" || arg === "--summary") options.once = true;
    else if (arg === "--demo") options.demo = true;
    else if (arg === "--since") options.since = Number(args[++i]);
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else if (options.command === "settings" && !options.key) options.key = arg;
    else if (options.command === "settings" && !options.value) options.value = arg;
  }

  return options;
}

function help(): string {
  return `oh-my-usage

Usage:
  oh-my-usage                 open the OpenTUI dashboard
  oh-my-usage --once          print a one-shot summary
  oh-my-usage --json          print the raw report as JSON
  oh-my-usage auth            show OAuth/subscription auth status
  oh-my-usage settings        show local settings
  oh-my-usage settings <key> <value>
  oh-my-usage sync-models     cache models.dev metadata for future pricing work

Settings keys:
  sinceDays
  codexRoot
  claudeRoot
  opencodeDb
  colors.codex
  colors.claude
  colors.opencode
`;
}

function writeOut(text: string): void {
  try {
    process.stdout.write(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPIPE") throw error;
  }
}

function demoReport(): UsageReport {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    sinceDays: 30,
    warnings: [],
    records: [
      {
        provider: "codex",
        providerLabel: "Codex",
        model: "gpt-5.3-codex",
        sessionId: "demo-codex",
        source: "demo",
        timestamp: now,
        tokens: { input: 120000, cachedInput: 900000, cacheWrite: 0, output: 23000, reasoning: 14000, total: 1057000 },
        creditEquivalent: 17.24,
      },
      {
        provider: "claude",
        providerLabel: "Claude Code",
        model: "claude-opus-4-7",
        sessionId: "demo-claude",
        source: "demo",
        timestamp: now,
        tokens: { input: 80000, cachedInput: 500000, cacheWrite: 200000, output: 12000, reasoning: 0, total: 792000 },
        costUsd: 2.85,
      },
      {
        provider: "opencode",
        providerLabel: "opencode Go",
        model: "kimi-k2.6",
        sessionId: "demo-opencode",
        source: "demo",
        timestamp: now,
        tokens: { input: 60000, cachedInput: 1000000, cacheWrite: 0, output: 11000, reasoning: 30000, total: 1101000 },
        costUsd: 0.08,
      },
    ],
    summaries: [],
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = ensureConfig();
  if (options.since) config.sinceDays = options.since;

  if (options.command === "help") {
    writeOut(help());
    return;
  }

  if (options.command === "settings") {
    if (options.key && options.value) {
      const next = setConfigValue(loadConfig(), options.key, options.value);
      saveConfig(next);
      writeOut(renderSettings(configPath(), next));
      return;
    }
    writeOut(renderSettings(configPath(), loadConfig()));
    return;
  }

  if (options.command === "sync-models") {
    const path = await syncModelsDevCache();
    writeOut(`Cached models.dev metadata at ${path}\n`);
    return;
  }

  const report = options.demo ? collectUsage(config) : collectUsage(config);

  if (options.command === "auth") {
    writeOut(renderAuth(report));
    return;
  }

  if (options.json) {
    writeOut(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (options.once || !process.stdout.isTTY) {
    writeOut(renderSummary(report));
    return;
  }

  await runDashboard(report);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
