import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { buildUsageReport, collectUsage, rangeToSince } from "../src/collectors";
import type { OhMyUsageConfig } from "../src/types";

process.env.OH_MY_USAGE_DISABLE_CACHE_WRITE = "1";

function makeRoot(): string {
  return join(tmpdir(), `oh-my-usage-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function testConfig(root: string): OhMyUsageConfig {
  return {
    sinceDays: 365,
    defaultRange: "month",
    codexRoot: join(root, "codex"),
    claudeRoot: join(root, "claude"),
    opencodeDb: join(root, "opencode", "opencode.db"),
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
}

describe("collectUsage", () => {
  test("rangeToSince supports day month year and all", () => {
    const now = Date.parse("2026-05-05T12:00:00.000Z");
    const day = rangeToSince("day", now);
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
    expect(day.getSeconds()).toBe(0);
    expect(rangeToSince("month", now, 30).getTime()).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(rangeToSince("year", now).getTime()).toBe(now - 365 * 24 * 60 * 60 * 1000);
    expect(rangeToSince("all", now).getTime()).toBe(0);
  });

  test("parses Codex cumulative JSONL once per session", () => {
    const root = makeRoot();
    const sessionDir = join(root, "codex", "sessions", "2026", "05", "05");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(root, "codex", "auth.json"), "{}");
    writeFileSync(
      join(sessionDir, "session.jsonl"),
      [
        JSON.stringify({ timestamp: "2026-05-05T01:00:00.000Z", type: "session_meta", payload: { id: "codex-1", cwd: root, model: "gpt-5.3-codex" } }),
        JSON.stringify({ timestamp: "2026-05-05T01:01:00.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 20, output_tokens: 30, reasoning_output_tokens: 40, total_tokens: 100 } } } }),
        JSON.stringify({ timestamp: "2026-05-05T01:02:00.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 200, output_tokens: 300, reasoning_output_tokens: 400, total_tokens: 1000 } } } }),
      ].join("\n"),
    );

    const report = collectUsage(testConfig(root));
    const codex = report.summaries.find((item) => item.provider === "codex");
    expect(codex?.records).toBe(1);
    expect(codex?.tokens.total).toBe(1000);
    expect(codex?.tokens.output).toBe(300);
  });

  test("parses Claude Code usage records", () => {
    const root = makeRoot();
    const projectDir = join(root, "claude", "projects", "demo");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(root, "claude", ".credentials.json"), "{}");
    writeFileSync(
      join(projectDir, "session.jsonl"),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-05-05T02:00:00.000Z",
        sessionId: "claude-1",
        message: {
          model: "claude-opus-4-7",
          usage: {
            input_tokens: 11,
            cache_creation_input_tokens: 22,
            cache_read_input_tokens: 33,
            output_tokens: 44,
          },
        },
      }),
    );

    const report = collectUsage(testConfig(root));
    const claude = report.summaries.find((item) => item.provider === "claude");
    expect(claude?.records).toBe(1);
    expect(claude?.tokens.total).toBe(110);
    expect(claude?.auth.oauth).toBe("connected");
  });

  test("parses opencode SQLite usage records", () => {
    const root = makeRoot();
    const dbDir = join(root, "opencode");
    mkdirSync(dbDir, { recursive: true });
    const db = new Database(join(dbDir, "opencode.db"));
    db.exec("create table account (id text, email text, url text)");
    db.exec("create table message (id text, session_id text, time_created integer, data text)");
    db.query("insert into account values (?, ?, ?)").run("acct_1", "dev@example.com", "https://opencode.ai");
    db.query("insert into message values (?, ?, ?, ?)").run(
      "msg_1",
      "ses_1",
      Date.parse("2026-05-05T03:00:00.000Z"),
      JSON.stringify({
        role: "assistant",
        providerID: "opencode-go",
        modelID: "kimi-k2.6",
        cost: 0.01,
        tokens: { input: 1, output: 2, reasoning: 3, total: 16, cache: { read: 4, write: 6 } },
      }),
    );
    db.close();

    const report = collectUsage(testConfig(root));
    const opencode = report.summaries.find((item) => item.provider === "opencode");
    expect(opencode?.records).toBe(1);
    expect(opencode?.tokens.total).toBe(16);
    expect(opencode?.costUsd).toBe(0.01);
  });

  test("buildUsageReport filters records by selected range", () => {
    const root = makeRoot();
    const config = testConfig(root);
    const auth = {
      codex: { provider: "codex", label: "Codex", oauth: "connected", source: "test", detail: "test" },
      claude: { provider: "claude", label: "Claude Code", oauth: "connected", source: "test", detail: "test" },
      opencode: { provider: "opencode", label: "opencode", oauth: "connected", source: "test", detail: "test" },
    } as const;
    const report = buildUsageReport(
      [
        {
          provider: "codex",
          providerLabel: "Codex",
          model: "new",
          sessionId: "new",
          source: "test",
          timestamp: new Date().toISOString(),
          tokens: { input: 1, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 1 },
        },
        {
          provider: "codex",
          providerLabel: "Codex",
          model: "old",
          sessionId: "old",
          source: "test",
          timestamp: "2020-01-01T00:00:00.000Z",
          tokens: { input: 10, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 10 },
        },
      ],
      auth,
      [],
      config,
      "month",
    );
    expect(report.records).toHaveLength(1);
    expect(report.summaries.find((item) => item.provider === "codex")?.tokens.total).toBe(1);
  });
});
