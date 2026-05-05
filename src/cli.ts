#!/usr/bin/env bun
import { collectUsage, collectUsageFromCache } from "./collectors";
import { configPath, ensureConfig, loadConfig, saveConfig, setConfigValue } from "./lib/config";
import { syncModelsDevCache } from "./lib/pricing";
import { renderAuth, renderSettings, renderSummary } from "./commands/render";
import { runDashboard } from "./tui/dashboard";
import type { UsageRange } from "./types";

interface CliOptions {
  command: string;
  json: boolean;
  once: boolean;
  refresh: boolean;
  range?: UsageRange;
  since?: number;
  key?: string;
  value?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "dashboard",
    json: false,
    once: false,
    refresh: false,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    options.command = args.shift() || "dashboard";
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--once" || arg === "--summary") options.once = true;
    else if (arg === "--demo") options.refresh = true;
    else if (arg === "--refresh") options.refresh = true;
    else if (arg === "--since") options.since = Number(args[++i]);
    else if (arg === "--range") options.range = parseRange(args[++i]);
    else if (arg === "--day") options.range = "day";
    else if (arg === "--month") options.range = "month";
    else if (arg === "--year") options.range = "year";
    else if (arg === "--all" || arg === "--all-time") options.range = "all";
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else if (options.command === "settings" && !options.key) options.key = arg;
    else if (options.command === "settings" && !options.value) options.value = arg;
  }

  return options;
}

function parseRange(value: string | undefined): UsageRange {
  if (value === "day" || value === "month" || value === "year" || value === "all") return value;
  throw new Error("--range must be day, month, year, or all");
}

function help(): string {
  return `oh-my-usage

Usage:
  oh-my-usage                 open the OpenTUI dashboard
  oh-my-usage --once          print a one-shot summary
  oh-my-usage --json          print the raw report as JSON
  oh-my-usage --day           show today
  oh-my-usage --month         show the configured month window
  oh-my-usage --year          show the last 365 days
  oh-my-usage --all           show all cached/scanned usage
  oh-my-usage --refresh       force a fresh scan instead of cached data
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
  defaultRange
`;
}

function writeOut(text: string): void {
  try {
    process.stdout.write(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPIPE") throw error;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = ensureConfig();
  if (options.since) config.sinceDays = options.since;
  const range = options.range || config.defaultRange;

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

  if (!options.once && !options.json && options.command === "dashboard" && process.stdout.isTTY) {
    await runDashboard({
      config,
      initialReport: collectUsageFromCache(config, range),
      initialRange: range,
      loadFresh: (nextRange) => collectUsage(config, nextRange),
    });
    return;
  }

  const report = options.refresh ? collectUsage(config, range) : collectUsageFromCache(config, range) || collectUsage(config, range);

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
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
