import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OhMyUsageConfig, TokenUsage } from "../types";
import { stateDir } from "./env";

export function codexCreditEstimate(tokens: TokenUsage, config: OhMyUsageConfig): number {
  const rates = config.codexCreditRates;
  return (
    (tokens.input / 1_000_000) * rates.inputPerMillion +
    (tokens.cachedInput / 1_000_000) * rates.cachedInputPerMillion +
    (tokens.output / 1_000_000) * rates.outputPerMillion
  );
}

const CLAUDE_RATES: Record<string, { input: number; cacheWrite: number; cachedInput: number; output: number }> = {
  "claude-opus-4-7": { input: 15, cacheWrite: 18.75, cachedInput: 1.5, output: 75 },
  "claude-sonnet-4-7": { input: 3, cacheWrite: 3.75, cachedInput: 0.3, output: 15 },
  "claude-haiku-4-5": { input: 1, cacheWrite: 1.25, cachedInput: 0.1, output: 5 },
};

export function claudeCostEstimate(model: string, tokens: TokenUsage): number | undefined {
  const key = Object.keys(CLAUDE_RATES).find((candidate) => model.toLowerCase().includes(candidate));
  const rates = key ? CLAUDE_RATES[key] : undefined;
  if (!rates) return undefined;

  return (
    (tokens.input / 1_000_000) * rates.input +
    (tokens.cacheWrite / 1_000_000) * rates.cacheWrite +
    (tokens.cachedInput / 1_000_000) * rates.cachedInput +
    (tokens.output / 1_000_000) * rates.output
  );
}

export async function syncModelsDevCache(): Promise<string> {
  const response = await fetch("https://models.dev/api.json");
  if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
  const text = await response.text();
  mkdirSync(stateDir(), { recursive: true });
  const path = join(stateDir(), "models.dev.json");
  writeFileSync(path, text);
  return path;
}

export function readModelsDevCache(): unknown | undefined {
  try {
    return JSON.parse(readFileSync(join(stateDir(), "models.dev.json"), "utf8"));
  } catch {
    return undefined;
  }
}
