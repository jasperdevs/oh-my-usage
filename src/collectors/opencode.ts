import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import type { ProviderAuthStatus, UsageRecord } from "../types";

function openReadonly(path: string): Database {
  return new Database(path, { readonly: true });
}

export function opencodeAuthStatus(dbPath: string): ProviderAuthStatus {
  const authPath = join(dirname(dbPath), "auth.json");
  if (existsSync(authPath)) {
    return {
      provider: "opencode",
      label: "opencode",
      oauth: "connected",
      source: authPath,
      detail: "opencode auth file is present. Tokens are not read or displayed.",
    };
  }

  if (!existsSync(dbPath)) {
    return {
      provider: "opencode",
      label: "opencode",
      oauth: "missing",
      source: dbPath,
      detail: "No opencode database found.",
    };
  }

  try {
    const db = openReadonly(dbPath);
    const account =
      (db.query("select id, email, url from account limit 1").get() as { id?: string; email?: string; url?: string } | null) ||
      (db.query("select email, url from control_account where active = 1 limit 1").get() as { email?: string; url?: string } | null);
    db.close();

    return {
      provider: "opencode",
      label: "opencode",
      oauth: account ? "connected" : "unknown",
      source: dbPath,
      detail: account ? `OAuth account found for ${account.url || "opencode"}. Tokens are not read or displayed.` : "Database exists, but no account row was found.",
    };
  } catch {
    return {
      provider: "opencode",
      label: "opencode",
      oauth: "unknown",
      source: dbPath,
      detail: "Could not inspect opencode account state.",
    };
  }
}

export function collectOpenCode(dbPath: string, since: Date): UsageRecord[] {
  if (!existsSync(dbPath)) return [];

  const db = openReadonly(dbPath);
  const rows = db
    .query(
      "select id, session_id, time_created, data from message where time_created >= ? order by time_created asc",
    )
    .all(since.getTime()) as Array<{ id: string; session_id: string; time_created: number; data: string }>;

  const records: UsageRecord[] = [];

  for (const row of rows) {
    let data: any;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }

    if (data.role !== "assistant" || !data.tokens) continue;

    const providerId = String(data.providerID || "opencode");
    const tokens = {
      input: Number(data.tokens.input || 0),
      cachedInput: Number(data.tokens.cache?.read || 0),
      cacheWrite: Number(data.tokens.cache?.write || 0),
      output: Number(data.tokens.output || 0),
      reasoning: Number(data.tokens.reasoning || 0),
      total: Number(data.tokens.total || 0),
    };

    records.push({
      provider: "opencode",
      providerLabel: providerId === "opencode-go" ? "opencode Go" : "opencode",
      model: String(data.modelID || "opencode"),
      sessionId: row.session_id,
      source: join(dirname(dbPath), "opencode.db"),
      timestamp: new Date(row.time_created).toISOString(),
      tokens,
      costUsd: Number.isFinite(Number(data.cost)) ? Number(data.cost) : undefined,
    });
  }

  db.close();
  return records;
}
