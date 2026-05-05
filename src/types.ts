export type ProviderId = "codex" | "claude" | "opencode";
export type UsageRange = "day" | "month" | "year" | "all";

export interface TokenUsage {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface UsageRecord {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  sessionId: string;
  source: string;
  timestamp: string;
  cwd?: string;
  tokens: TokenUsage;
  costUsd?: number;
  creditEquivalent?: number;
}

export interface ProviderAuthStatus {
  provider: ProviderId;
  label: string;
  oauth: "connected" | "missing" | "unknown";
  source: string;
  detail: string;
}

export interface ProviderSummary {
  provider: ProviderId;
  label: string;
  color: string;
  records: number;
  sessions: number;
  models: number;
  tokens: TokenUsage;
  costUsd: number;
  creditEquivalent: number;
  firstSeen?: string;
  lastSeen?: string;
  auth: ProviderAuthStatus;
}

export interface UsageReport {
  generatedAt: string;
  sinceDays: number;
  range: UsageRange;
  stale?: boolean;
  loading?: boolean;
  summaries: ProviderSummary[];
  records: UsageRecord[];
  warnings: string[];
}

export interface UsageCache {
  version: 1;
  generatedAt: string;
  records: UsageRecord[];
  auth: Record<ProviderId, ProviderAuthStatus>;
  warnings: string[];
}

export interface OhMyUsageConfig {
  sinceDays: number;
  defaultRange: UsageRange;
  codexRoot?: string;
  claudeRoot?: string;
  opencodeDb?: string;
  colors: Record<ProviderId, string>;
  codexCreditRates: {
    inputPerMillion: number;
    cachedInputPerMillion: number;
    outputPerMillion: number;
  };
}

export const EMPTY_TOKENS: TokenUsage = {
  input: 0,
  cachedInput: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  total: 0,
};
