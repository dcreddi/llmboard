# LLMBoard

Real-time observability dashboard for Claude Code and other LLM tools. Watch agents, tool calls, tokens, commands, and security anomalies as they happen — all in your browser at `localhost:3456`.

![LLMBoard Dashboard](https://img.shields.io/badge/version-1.0.0-orange) ![License](https://img.shields.io/badge/license-MIT-blue) ![Privacy](https://img.shields.io/badge/privacy-local%20only-green)

---

## Quick Start

```bash
npm install -g llmboard
llmboard setup
llmboard
```

That's it. Your browser opens to `http://localhost:3456`.

---

## What It Shows

| Tab | What you see |
|-----|-------------|
| **Live Sessions** | Every active/stopped session — model, path, tool calls, tokens, duration. Click any row to expand the tool timeline. |
| **Agent Manager** | Parallel subagents with status, task description, and duration |
| **Tool Activity** | Real-time feed of every tool call across all sessions |
| **Command Center** | All Bash commands classified as Safe / Needs Info / Needs Permission / Dangerous, plus a rules editor |
| **Token Analytics** | Total/input/output tokens, tokens over time, tool usage distribution, daily breakdown |
| **Network & Domains** | Every external domain contacted — categorized, with call counts and session links |
| **Anomaly Alerts** | Security alerts: dangerous commands, sensitive data detected, prompt injection risk, new external domains |
| **Project Intelligence** | Projects detected from session paths with git branch, session count, and alert summary |
| **Settings** | Theme, default model, data export, hook status |

---

## Installation

### Requirements
- Node.js 18+
- `jq` (recommended for hook enrichment — `brew install jq`)

### Install globally

```bash
npm install -g llmboard
```

`postinstall` automatically runs `llmboard setup --silent` which installs Claude Code hooks and creates `~/.llmboard/`.

### Manual setup

```bash
llmboard setup
```

This will:
1. Install event hooks into `~/.claude/settings.json`
2. Detect other LLM CLIs (Gemini, Aider, etc.) and offer to wrap them
3. Install a background auto-start service (launchd / systemd / Task Scheduler)
4. Create `~/.llmboard/` data directory and default config

---

## CLI Reference

```
llmboard                          Start dashboard + open browser
llmboard setup                    Full setup (hooks + service)
llmboard remove                   Uninstall hooks, restore settings.json
llmboard service install          Install auto-start service (runs on login)
llmboard service uninstall        Remove auto-start service
llmboard service status           Show service status
llmboard stats                    Print token/session summary to terminal
llmboard stats --today            Today's breakdown
llmboard stats --week             Weekly breakdown
llmboard export --csv             Export analytics as CSV
llmboard export --json            Export analytics as JSON
llmboard config set <key> <val>   Update config
llmboard doctor                   Diagnose hooks, jq, port, event flow

Options:
  --port <n>    Custom port (default: 3456)
  --no-open     Don't auto-open browser
  --share       Share via Cloudflare Tunnel (requires cloudflared)
```

---

## VS Code Extension

The `vscode-extension/` directory contains a companion extension that embeds the dashboard as a panel inside VS Code.

```bash
cd vscode-extension
npm install -g @vscode/vsce
vsce package
code --install-extension llmboard-1.0.0.vsix
```

The extension:
- Starts the LLMBoard server automatically when VS Code opens
- Shows a status bar item (`⬡ LLMBoard`) — click to open the panel
- Command palette: `LLMBoard: Open Dashboard` / `LLMBoard: Stop Server`

---

## Architecture

```
LLM tool (Claude Code, Gemini, etc.)
    │
    ▼
hooks/event-logger.sh          ← bash script, ~10ms, never blocks
    │  writes JSONL
    ▼
~/.llmboard/events.jsonl       ← append-only log, rotates at 50MB
    │  chokidar file watch
    ▼
src/server/                    ← Express + WebSocket server
  file-tailer.js               ← byte-offset tailing, handles rotation
  event-store.js               ← in-memory index (sessions, domains, anomalies)
  routes.js                    ← REST API (/api/sessions, /api/events, etc.)
  index.js                     ← WS broadcast + ping/pong heartbeat
    │  WebSocket
    ▼
src/public/                    ← Vanilla JS dashboard (no build step)
  dashboard.js                 ← WS client, view router, event bus
  components/                  ← One file per tab
```

**Key design decisions:**

- **Shell script hook** — ~10ms vs ~100ms for a Node.js process; hooks fire on every tool call
- **JSONL file** — simple append from bash; server builds the in-memory index
- **Chokidar** — reliable file watching on macOS (fs.watch misses events)
- **Vanilla JS** — no build step, no bundler, <50KB total
- **Zero external calls** — all data stays on your machine

---

## Data & Privacy

All data is stored locally in `~/.llmboard/`:

| File | Purpose |
|------|---------|
| `events.jsonl` | Raw event stream — auto-rotated at 50MB |
| `config.json` | User preferences (port, model, theme) |
| `settings-backup.*.json` | Pre-setup backup of `~/.claude/settings.json` |
| `service.log` | Background service stdout/stderr |

**Zero telemetry. Zero external calls. Nothing leaves your machine.**

---

## Configuration

Edit `~/.llmboard/config.json` or use `llmboard config set <key> <value>`:

```json
{
  "port": 3456,
  "model": "sonnet-4",
  "retention_days": 30,
  "max_file_size_mb": 50,
  "auto_open_browser": true,
  "theme": "dark"
}
```

---

## Contributing & Feedback

Found a bug or have an idea? Use GitHub:

| Type | Link |
|------|------|
| **Bug report** | [github.com/dcreddi/llmboard/issues/new?template=bug_report.md](https://github.com/dcreddi/llmboard/issues/new?template=bug_report.md&labels=bug) |
| **Feature request** | [github.com/dcreddi/llmboard/issues/new?template=feature_request.md](https://github.com/dcreddi/llmboard/issues/new?template=feature_request.md&labels=enhancement) |
| **Questions / discussion** | [github.com/dcreddi/llmboard/discussions](https://github.com/dcreddi/llmboard/discussions) |

### What to include in a bug report

1. **LLMBoard version** — run `llmboard --version`
2. **OS and Node version** — `node --version`, `uname -a`
3. **Doctor output** — `llmboard doctor` (paste the full output)
4. **What you expected vs what happened**
5. **Reproduction steps** — minimum steps to trigger the bug

For event pipeline issues, also include:
```bash
tail -5 ~/.llmboard/events.jsonl   # last few events
```

### What to include in a feature request

- The problem you're solving (not just the solution)
- How often you'd use it
- Any workaround you're currently using

---

## Uninstall

```bash
llmboard remove              # removes hooks from ~/.claude/settings.json
llmboard service uninstall   # removes auto-start service
npm uninstall -g llmboard
rm -rf ~/.llmboard           # delete all data
```

---

## How-To Guides

### Set a token budget alert

Edit `~/.llmboard/config.json`:

```json
{
  "budget": {
    "daily_limit_usd": 5.00,
    "monthly_limit_usd": 50.00,
    "warn_at_percent": 80
  }
}
```

The dashboard will surface an alert when you hit the warning threshold.

### Change the dashboard port

```bash
llmboard config set port 4000
llmboard                          # starts on 4000
# or one-off:
llmboard --port 4000
```

### Share the dashboard with a teammate

```bash
llmboard --share                  # requires cloudflared to be installed
```

This creates a temporary public Cloudflare Tunnel URL valid for the session. No data is stored remotely — the tunnel just proxies your local server.

### Export data for analysis

```bash
llmboard export --csv > sessions.csv
llmboard export --json > sessions.json
```

Fields exported: session_id, cwd, started_at, ended_at, status, tool_calls, input_tokens, output_tokens, model.

### Run LLMBoard as a background service

```bash
llmboard service install      # installs launchd (macOS) / systemd (Linux) / Task Scheduler (Windows)
llmboard service status       # check it's running
llmboard service uninstall    # remove it
```

After install the dashboard starts automatically at login — no need to run `llmboard` manually.

### Diagnose a broken setup

```bash
llmboard doctor
```

Checks: Node version ≥ 18, `jq` available, hooks installed in `~/.claude/settings.json`, events file exists and is writable, port 3456 free, WebSocket connects successfully.

---

## Training Guide

### Understanding the dashboard tabs

| Tab | When to use it |
|-----|---------------|
| **Live Sessions** | See what agents are doing right now — click any row to expand its tool timeline |
| **Agent Manager** | Debug parallel subagents: see which are running, for how long, and what task they got |
| **Tool Activity** | Audit every file read, bash command, and web fetch in real time |
| **Command Center** | Review all shell commands with safety classifications; add custom rules |
| **Token Analytics** | Track usage trends, identify expensive sessions, plan budget |
| **Network & Domains** | See every external domain contacted — useful for security reviews |
| **Anomaly Alerts** | Get notified of dangerous commands, sensitive data exposure, prompt injection attempts |
| **Project Intelligence** | Cross-session summary per repo: how many sessions, which branch, any alerts |
| **Settings** | Theme, model selection for token estimates, data export |

### Reading a session row

```
› ACTIVE  sonnet  ~/projects/myapp   42 tools  12.4K tok  03:21
```

- `›` — click to expand the tool timeline
- `ACTIVE` / `STOPPED` — current session state
- `sonnet` — model detected from the event stream
- Path — working directory (truncated if long)
- `42 tools` — total tool calls so far
- `12.4K tok` — estimated tokens (input + output, ~4 chars/token)
- `03:21` — elapsed time

### Understanding anomaly types

| Alert type | What triggered it |
|-----------|------------------|
| Dangerous command | Bash command matched a high-risk pattern (rm -rf, curl \| bash, etc.) |
| Sensitive data | Tool input/output contained API keys, passwords, or tokens |
| Prompt injection risk | Tool result contained suspicious instruction-like content |
| New external domain | A domain was contacted for the first time this session |

### Command safety classifications

Every Bash command is automatically classified:

| Label | Meaning |
|-------|---------|
| **Safe** | Read-only operations — ls, cat, grep, git status |
| **Needs Info** | Commands that modify files or state |
| **Needs Permission** | Installs, network calls, service changes |
| **Dangerous** | Destructive or high-risk patterns — rm -rf, chmod 777, curl pipe |

Add your own rules in the **Command Center** tab → **Custom Rules** panel.

---

## FAQ

**Q: Does LLMBoard slow down Claude Code?**
The hook is a shell script that takes ~10ms. Claude Code's own tool calls take hundreds of milliseconds minimum — LLMBoard is not a bottleneck.

**Q: Does my data leave my machine?**
No. Everything is written to `~/.llmboard/events.jsonl` and served from a local Express server. The only exception is `llmboard --share`, which creates a Cloudflare Tunnel proxy — but only if you explicitly pass `--share`.

**Q: Why are my token counts estimates?**
Claude Code hooks don't expose the actual token counts from the API response. LLMBoard estimates using the character length of tool inputs and outputs (~4 chars per token). The estimate is labeled clearly in the UI.

**Q: The dashboard shows "No Active Sessions" even though Claude is running.**
Run `llmboard doctor` to diagnose. Common causes: hooks not installed (run `llmboard setup`), `~/.llmboard/events.jsonl` not writable, or the server started before any events were generated.

**Q: How do I reset all data?**
```bash
rm ~/.llmboard/events.jsonl
touch ~/.llmboard/events.jsonl
```
The server will pick up an empty file immediately — no restart needed.

**Q: Can I run multiple dashboards on different ports?**
Yes: `llmboard --port 3457 --no-open` in a second terminal. Both watch the same `events.jsonl` file.

**Q: What does the VS Code extension add?**
It embeds the dashboard as a side panel so you don't need a separate browser tab. It also auto-starts the server when VS Code opens. See the `vscode-extension/` directory.

**Q: How do I add my team's internal domains to the allowlist?**
Currently there's no allowlist UI — all external domains are shown in the **Network & Domains** tab. You can filter by session there. Domain allowlisting is on the roadmap.

---

## License

MIT — Copyright (c) 2026 DCReddi Inc (katuru@dcreddi.com)
