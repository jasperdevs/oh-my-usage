<p align="center">
  <img src="./assets/logo.png" alt="oh-my-usage logo" width="180" />
</p>

<h1 align="center">oh-my-usage</h1>

<p align="center">A local-first OpenTUI dashboard for Codex, Claude Code, and opencode usage.</p>

## Install

```bash
npm install -g oh-my-usage
oh-my-usage
```

Requires [Bun](https://bun.sh/) because the CLI is built on OpenTUI and uses Bun's SQLite runtime for opencode.

## Usage

```bash
oh-my-usage             # OpenTUI dashboard
oh-my-usage --once      # one-shot terminal summary
oh-my-usage --json      # raw report for scripts
oh-my-usage --day       # today
oh-my-usage --month     # configured month window
oh-my-usage --year      # last 365 days
oh-my-usage --all       # all cached/scanned usage
oh-my-usage --refresh   # force a fresh scan
oh-my-usage auth        # subscription/OAuth status
oh-my-usage settings    # local config
omu --once              # short alias
```

Inside the TUI:

```text
left/right  provider tabs
up/down     day/month/year/all-time range
r           refresh in the background
s           OpenTUI settings panel
q           quit
```

The dashboard reads local usage records that the tools already write:

| Provider | Source | What works today |
| --- | --- | --- |
| Codex | `~/.codex/sessions/**/*.jsonl` | cumulative token usage, sessions, model mix, Codex credit estimate |
| Claude Code | `~/.claude/projects/**/*.jsonl` | per-message token usage, cache usage, model mix, cost estimate for known Claude models |
| opencode | `~/.local/share/opencode/opencode.db` | assistant-message tokens, sessions, models, stored cost values, opencode Go usage |

`oh-my-usage` also checks whether local OAuth/subscription auth appears connected, but it does not print or export token values.

## Settings

Settings live at `~/.config/oh-my-usage/config.json`.

```bash
oh-my-usage settings sinceDays 14
oh-my-usage settings defaultRange month
oh-my-usage settings colors.codex "#10a7ff"
oh-my-usage settings colors.claude "#d97745"
oh-my-usage settings colors.opencode "#f8fafc"
oh-my-usage settings opencodeDb "~/.local/share/opencode/opencode.db"
```

## Notes

Provider subscription quota is not always exposed as a local API. This tool tracks real local usage and OAuth presence, then shows estimates where the local records contain enough data. It is not a scraper for private web dashboards.

Pricing metadata can change. Codex credit estimates use configurable rates in the settings file, Claude estimates use a small built-in table for common Claude Code models, and opencode uses the cost stored in its own database when available.

## Development

```bash
bun install
bun test
npm run typecheck
npm run build
bun ./src/cli.ts --once
```

## License

MIT
