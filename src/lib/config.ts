import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OhMyUsageConfig, ProviderId } from "../types";
import { configDir, homePath, resolveUserPath } from "./env";

const DEFAULT_CONFIG: OhMyUsageConfig = {
  sinceDays: 30,
  codexRoot: "~/.codex",
  claudeRoot: "~/.claude",
  opencodeDb: "~/.local/share/opencode/opencode.db",
  colors: {
    codex: "#10a7ff",
    claude: "#d97745",
    opencode: "#f8fafc",
  },
  codexCreditRates: {
    inputPerMillion: 43.75,
    cachedInputPerMillion: 4.375,
    outputPerMillion: 350,
  },
};

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): OhMyUsageConfig {
  const path = configPath();
  if (!existsSync(path)) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<OhMyUsageConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      colors: { ...DEFAULT_CONFIG.colors, ...parsed.colors },
      codexCreditRates: { ...DEFAULT_CONFIG.codexCreditRates, ...parsed.codexCreditRates },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: OhMyUsageConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`);
}

export function ensureConfig(): OhMyUsageConfig {
  const config = loadConfig();
  if (!existsSync(configPath())) saveConfig(config);
  return config;
}

export function providerColor(config: OhMyUsageConfig, provider: ProviderId): string {
  return config.colors[provider] || DEFAULT_CONFIG.colors[provider];
}

export function resolvedConfig(config: OhMyUsageConfig): Required<OhMyUsageConfig> {
  return {
    ...config,
    codexRoot: resolveUserPath(config.codexRoot || homePath(".codex")),
    claudeRoot: resolveUserPath(config.claudeRoot || homePath(".claude")),
    opencodeDb: resolveUserPath(config.opencodeDb || homePath(".local", "share", "opencode", "opencode.db")),
  };
}

export function setConfigValue(config: OhMyUsageConfig, key: string, value: string): OhMyUsageConfig {
  const next: OhMyUsageConfig = JSON.parse(JSON.stringify(config));

  if (key === "sinceDays") {
    const days = Number(value);
    if (!Number.isFinite(days) || days < 1) throw new Error("sinceDays must be a positive number");
    next.sinceDays = Math.round(days);
    return next;
  }

  if (key === "codexRoot" || key === "claudeRoot" || key === "opencodeDb") {
    next[key] = value;
    return next;
  }

  const colorMatch = key.match(/^colors\.(codex|claude|opencode)$/);
  if (colorMatch) {
    next.colors[colorMatch[1] as ProviderId] = value;
    return next;
  }

  throw new Error(`Unknown setting: ${key}`);
}
