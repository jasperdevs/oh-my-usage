import { BoxRenderable, createCliRenderer, TextRenderable } from "@opentui/core";
import { buildUsageReport, collectUsageFromCache, emptyReport } from "../collectors";
import { configPath, saveConfig } from "../lib/config";
import { bar, compactNumber, credits, money, percent } from "../lib/format";
import type { OhMyUsageConfig, ProviderAuthStatus, ProviderId, ProviderSummary, UsageRange, UsageRecord, UsageReport } from "../types";

const PROVIDERS: Array<ProviderId | "all"> = ["all", "codex", "claude", "opencode"];
const RANGES: UsageRange[] = ["day", "month", "year", "all"];

const PROVIDER_LABELS: Record<ProviderId | "all", string> = {
  all: "All",
  codex: "Codex",
  claude: "Claude",
  opencode: "opencode",
};

const RANGE_LABELS: Record<UsageRange, string> = {
  day: "Day",
  month: "Month",
  year: "Year",
  all: "All time",
};

interface DashboardOptions {
  config: OhMyUsageConfig;
  initialReport?: UsageReport;
  initialRange: UsageRange;
  loadFresh: (range: UsageRange) => UsageReport;
}

interface DashboardState {
  config: OhMyUsageConfig;
  range: UsageRange;
  provider: ProviderId | "all";
  report: UsageReport;
  refreshing: boolean;
  showSettings: boolean;
  settingsIndex: number;
  status: string;
}

const SETTINGS: Array<{ key: keyof Pick<OhMyUsageConfig, "defaultRange" | "sinceDays">; label: string }> = [
  { key: "defaultRange", label: "Default range" },
  { key: "sinceDays", label: "Month window" },
];

export async function runDashboard(options: DashboardOptions): Promise<void> {
  const state: DashboardState = {
    config: options.config,
    range: options.initialRange,
    provider: "all",
    report: options.initialReport || emptyReport(options.config, options.initialRange),
    refreshing: false,
    showSettings: false,
    settingsIndex: 0,
    status: options.initialReport ? "cached data loaded; refreshing in background" : "starting scan in background",
  };

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    clearOnShutdown: true,
    targetFps: 30,
    useMouse: true,
  });

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    gap: 1,
    shouldFill: false,
  });

  const header = new TextRenderable(renderer, {
    id: "header",
    content: "",
    fg: "#f8fafc",
    width: "100%",
    height: 4,
  });

  const content = new TextRenderable(renderer, {
    id: "content",
    content: "",
    fg: "#e5e7eb",
    width: "100%",
    flexGrow: 1,
  });

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: "",
    fg: "#9ca3af",
    width: "100%",
    height: 3,
  });

  root.add(header);
  root.add(content);
  root.add(footer);
  renderer.root.add(root);

  const render = () => {
    header.content = renderHeader(state);
    content.content = state.showSettings ? renderSettingsPopup(state) : renderProviderView(state);
    footer.content = renderFooter(state);
    renderer.requestRender();
  };

  root.onMouseDown = (event) => {
    const y = event.y;
    const x = event.x;
    if (y <= 3) {
      handleHeaderClick(state, x);
      render();
    }
  };

  renderer.on("key", (data: Buffer) => {
    const key = data.toString("utf8");
    if (key === "q" || key === "\u0003") renderer.destroy();
    else if (key === "s") state.showSettings = !state.showSettings;
    else if (key === "r") refresh();
    else if (state.showSettings) handleSettingsKey(state, key);
    else handleDashboardKey(state, key);
    render();
  });

  function refresh() {
    state.refreshing = true;
    state.status = "refreshing usage data";
    render();
    setTimeout(() => {
      try {
        state.report = options.loadFresh(state.range);
        state.status = `fresh scan complete: ${state.report.records.length} records`;
      } catch (error) {
        state.status = error instanceof Error ? error.message : String(error);
      } finally {
        state.refreshing = false;
        render();
      }
    }, 0);
  }

  render();
  renderer.start();
  setTimeout(refresh, 20);
}

function handleDashboardKey(state: DashboardState, key: string): void {
  if (key === "\t" || key === "\x1b[C") {
    state.provider = nextItem(PROVIDERS, state.provider, 1);
  } else if (key === "\x1b[D") {
    state.provider = nextItem(PROVIDERS, state.provider, -1);
  } else if (key === "\x1b[B") {
    state.range = nextItem(RANGES, state.range, 1);
    state.report = collectUsageFromCache(state.config, state.range) || buildUsageReport(state.report.records, authFromReport(state.report), state.report.warnings, state.config, state.range, { stale: state.report.stale });
  } else if (key === "\x1b[A") {
    state.range = nextItem(RANGES, state.range, -1);
    state.report = collectUsageFromCache(state.config, state.range) || buildUsageReport(state.report.records, authFromReport(state.report), state.report.warnings, state.config, state.range, { stale: state.report.stale });
  }
}

function handleSettingsKey(state: DashboardState, key: string): void {
  if (key === "\x1b[B") state.settingsIndex = Math.min(SETTINGS.length - 1, state.settingsIndex + 1);
  else if (key === "\x1b[A") state.settingsIndex = Math.max(0, state.settingsIndex - 1);
  else if (key === "\x1b[C" || key === "\r") bumpSetting(state, 1);
  else if (key === "\x1b[D") bumpSetting(state, -1);
  else if (key === "\x1b" || key === "s") state.showSettings = false;
}

function bumpSetting(state: DashboardState, direction: 1 | -1): void {
  const setting = SETTINGS[state.settingsIndex];
  if (setting.key === "defaultRange") {
    state.config.defaultRange = nextItem(RANGES, state.config.defaultRange, direction);
    state.range = state.config.defaultRange;
  } else {
    state.config.sinceDays = Math.max(1, state.config.sinceDays + direction);
  }
  saveConfig(state.config);
  state.report = collectUsageFromCache(state.config, state.range) || state.report;
  state.status = `saved ${setting.label.toLowerCase()} to ${configPath()}`;
}

function handleHeaderClick(state: DashboardState, x: number): void {
  const providerIndex = Math.floor(Math.max(0, x - 1) / 13);
  if (providerIndex >= 0 && providerIndex < PROVIDERS.length) {
    state.provider = PROVIDERS[providerIndex];
    return;
  }
  const rangeIndex = Math.floor(Math.max(0, x - 58) / 12);
  if (rangeIndex >= 0 && rangeIndex < RANGES.length) {
    state.range = RANGES[rangeIndex];
    state.report = collectUsageFromCache(state.config, state.range) || state.report;
  }
}

function nextItem<T>(items: T[], current: T, direction: 1 | -1): T {
  const index = items.indexOf(current);
  return items[(index + direction + items.length) % items.length];
}

function renderHeader(state: DashboardState): string {
  const providerTabs = PROVIDERS.map((provider) => (state.provider === provider ? `[${PROVIDER_LABELS[provider]}]` : ` ${PROVIDER_LABELS[provider]} `)).join("  ");
  const rangeTabs = RANGES.map((range) => (state.range === range ? `[${RANGE_LABELS[range]}]` : ` ${RANGE_LABELS[range]} `)).join("  ");
  const loading = state.refreshing ? " scanning" : state.report.stale ? " cached" : " fresh";
  return `oh-my-usage${loading}\n${providerTabs}\n${rangeTabs}\n`;
}

function renderProviderView(state: DashboardState): string {
  const summaries = state.provider === "all" ? state.report.summaries : state.report.summaries.filter((summary) => summary.provider === state.provider);
  const records = state.provider === "all" ? state.report.records : state.report.records.filter((record) => record.provider === state.provider);
  const maxTokens = Math.max(1, ...summaries.map((summary) => summary.tokens.total || 0));
  const totalTokens = summaries.reduce((sum, summary) => sum + summary.tokens.total, 0);
  const totalCost = summaries.reduce((sum, summary) => sum + summary.costUsd, 0);
  const totalCredits = summaries.reduce((sum, summary) => sum + summary.creditEquivalent, 0);
  const lines = [
    `${RANGE_LABELS[state.range]} · ${compactNumber(totalTokens)} tokens · ${money(totalCost)} · ${credits(totalCredits)}`,
    "",
    "Provider      Usage                         Tokens     Sessions   Models    Estimate     Auth",
    "------------  ----------------------------  ---------  ---------  --------  -----------  --------",
    ...summaries.map((summary) => renderSummaryLine(summary, maxTokens)),
    "",
    "Model mix",
    ...topModels(records).map((line) => `  ${line}`),
    "",
    "Recent sessions",
    ...recentSessions(records).map((line) => `  ${line}`),
  ];
  if (state.report.warnings.length > 0) lines.push("", "Warnings", ...state.report.warnings.map((warning) => `  ${warning}`));
  return `${lines.join("\n")}\n`;
}

function renderSummaryLine(summary: ProviderSummary, maxTokens: number): string {
  const total = summary.tokens.total || summary.tokens.input + summary.tokens.cachedInput + summary.tokens.cacheWrite + summary.tokens.output + summary.tokens.reasoning;
  const estimate = summary.costUsd > 0 ? money(summary.costUsd) : summary.creditEquivalent > 0 ? credits(summary.creditEquivalent) : "-";
  const auth = summary.auth.oauth === "connected" ? "oauth ok" : summary.auth.oauth;
  return [
    summary.label.padEnd(12),
    bar(total, maxTokens, 28).padEnd(28),
    compactNumber(total).padStart(9),
    String(summary.sessions).padStart(9),
    String(summary.models).padStart(8),
    estimate.padStart(11),
    auth,
  ].join("  ");
}

function topModels(records: UsageRecord[]): string[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const key = `${record.providerLabel} / ${record.model}`;
    totals.set(key, (totals.get(key) || 0) + (record.tokens.total || 0));
  }
  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, tokens]) => `${name.padEnd(42)} ${compactNumber(tokens).padStart(9)} ${percent(tokens, total)}`);
}

function recentSessions(records: UsageRecord[]): string[] {
  return [...records]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 6)
    .map((record) => `${record.timestamp.slice(0, 10)} ${record.providerLabel.padEnd(12)} ${record.model.padEnd(24).slice(0, 24)} ${compactNumber(record.tokens.total || 0).padStart(8)}`);
}

function renderSettingsPopup(state: DashboardState): string {
  const rows = SETTINGS.map((setting, index) => {
    const active = index === state.settingsIndex ? ">" : " ";
    const value = setting.key === "defaultRange" ? state.config.defaultRange : `${state.config.sinceDays} days`;
    return `${active} ${setting.label.padEnd(18)} ${value}`;
  });
  return [
    "Settings",
    "--------",
    ...rows,
    "",
    "Up/down chooses a setting. Left/right changes it. Enter also advances. s or Esc closes.",
    `Config: ${configPath()}`,
  ].join("\n");
}

function renderFooter(state: DashboardState): string {
  return [
    "left/right: provider tab  up/down: range  r: refresh  s: settings  q: quit",
    `status: ${state.status}`,
  ].join("\n");
}

function authFromReport(report: UsageReport): Record<ProviderId, ProviderAuthStatus> {
  return Object.fromEntries(report.summaries.map((summary) => [summary.provider, summary.auth])) as Record<ProviderId, ProviderAuthStatus>;
}
