import type { TokenUsage } from "../types";

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(Math.round(value));
}

export function money(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function credits(value: number): string {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)} cr`;
}

export function percent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function sumTokens(tokens: TokenUsage): number {
  return tokens.input + tokens.cachedInput + tokens.cacheWrite + tokens.output + tokens.reasoning;
}

export function clampText(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

export function bar(value: number, max: number, width: number, fill = "█", empty = "░"): string {
  if (width <= 0) return "";
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return `${fill.repeat(filled)}${empty.repeat(width - filled)}`;
}
