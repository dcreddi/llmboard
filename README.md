# LLMBoard

Real-time observability dashboard for Claude Code. Watch agents, tool calls, tokens, commands, and security anomalies as they happen — all in your browser at `localhost:3456`.

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
| **Live Sessions** | Every active/stopped session — model, path, tool calls, tokens, duration. Click any row to expand the tool timeline, git diff, and CLAUDE.md rules. |
| **Project Intelligence** | All projects detected from session paths — git branch, remote URL, git identity, last commit, session count, alert summary. |
| **Agent Manager** | Parallel subagents with status, task description, and duration |
| **Anomaly Alerts** | Security alerts: dangerous commands, sensitive data detected, prompt injection risk, new external domains |
| **Command Center** | All Bash commands classified as Safe / Needs Info / Needs Permission / Dangerous, plus a custom rules editor |
| **Tool Activity** | Real-time feed of every tool call across all sessions |
| **Token Analytics** | Total/input/output tokens, tokens over time, tool usage distribution, daily breakdown |
| **Network & Domains** | Every external domain contacted — categorized, with call counts and session links |
| **Settings** | Theme, default model, token estimation, data export, bug reporting |

### Session row anatomy

```
› ACTIVE  Sonnet  ACCEPTEDITS  .../myapp   42 tools  12.4K tok  03:21
```

| Element | Meaning |
|---------|---------|
| `›` | Click to expand — shows tool timeline, git diff, CLAUDE.md |
| `ACTIVE` / `STOPPED` | Live session state |
| `Sonnet` | Model auto-detected from the event stream |
| `ACCEPTEDITS` | Permission mode |
| Path | Working directory (truncated, full path in tooltip) |
| `42 tools` | Tool calls so far this session |
| `12.4K tok` | Estimated tokens (input + output) |
| `03:21` | Elapsed time |

Click the **Ext. Domains** or **Alerts** counters in the header to jump directly to those tabs.

---

## Installation

### Requirements
- Node.js 18+
- `jq` (recommended for hook enrichment — `brew install jq`)

### Install globally

```bash
npm install -g llmboard
```

`postinstall` automatically runs `llmboard setup --silent` — installs Claude Code hooks and creates `~/.llmboard/`.

### Manual setup

```bash
llmboard setup
```

This will:
1. Create `~/.llmboard/` data directory and default config
2. Install event hooks into `~/.claude/settings.json`
3. Install a background auto-start service (launchd / systemd / Task Scheduler)

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
Claude Code
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

## How-To Guides

### Install LLMBoard as a PWA (desktop app)

Open `http://localhost:3456` in Chrome or Edge and click the **install** icon in the address bar. LLMBoard installs as a standalone desktop app — no browser chrome, opens from your dock.

### Change the dashboard port

```bash
llmboard config set port 4000
llmboard                          # starts on 4000
# or one-off:
llmboard --port 4000
```

Update any bookmarks or VS Code extension config to match.

### Share the dashboard with a teammate

```bash
llmboard --share                  # requires cloudflared to be installed
```

Creates a temporary public Cloudflare Tunnel URL valid for the session. No data is stored remotely — the tunnel proxies your local server only.

### Export data for analysis

```bash
llmboard export --csv > sessions.csv
llmboard export --json > sessions.json
```

Fields exported: `session_id`, `cwd`, `started_at`, `ended_at`, `status`, `tool_calls`, `input_tokens`, `output_tokens`, `model`.

### Run LLMBoard as a background service

```bash
llmboard service install      # launchd (macOS) / systemd (Linux) / Task Scheduler (Windows)
llmboard service status
llmboard service uninstall
```

After install, the dashboard starts automatically at login.

### View session activity in detail

Click any session row (`›` chevron) to expand:
- **Tool timeline** — every tool call in order with inputs/outputs
- **Git diff** — uncommitted changes in the session's working directory at session time
- **CLAUDE.md** — the active CLAUDE.md rules that governed the session

### Add a custom command rule

Open **Command Center** → scroll to **Custom Rules** → add a regex pattern and choose a classification (Safe / Needs Info / Needs Permission / Dangerous). Rules apply immediately to all future commands.

### View git identity per project

Open **Project Intelligence**. Each project card shows:
- **Remote** — the `origin` remote URL
- **Git user / email** — the local `git config` identity for that repo
- **Last commit** — short hash, subject, and relative time

Useful for confirming which GitHub account is active on each project.

### Diagnose a broken setup

```bash
llmboard doctor
```

Checks: Node ≥ 18, `jq` available, hooks in `~/.claude/settings.json`, events file writable, port 3456 free, WebSocket connects.

### Acknowledge an anomaly alert

Open **Anomaly Alerts** → click **Acknowledge** on any alert. Acknowledged alerts are dimmed and won't re-trigger for the same event.

### Query the REST API directly

The server exposes a full REST API at `http://localhost:3456`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | All sessions with stats |
| `GET /api/events?limit=50` | Recent raw events |
| `GET /api/stats` | Global token + session totals |
| `GET /api/export?format=csv` | CSV export |
| `GET /api/network` | External domains seen |
| `GET /api/anomalies` | All anomaly alerts |
| `GET /api/projects` | Project summaries |
| `GET /api/digest` | Daily digest (sessions, tokens, top tools) |
| `GET /api/skills` | Skill/plugin registry |
| `GET /api/git?cwd=<path>` | Git info for any local directory |
| `GET /api/sessions/:id/git` | Git diff for a specific session |
| `GET /api/sessions/:id/claudemd` | CLAUDE.md rules for a session |
| `GET /api/commands` | All logged Bash commands |
| `GET /api/command-rules` | Custom command classification rules |
| `GET /api/health` | Server health check |

---

## Training Guide

### Understanding the dashboard tabs

| Tab | When to use it |
|-----|---------------|
| **Live Sessions** | See what agents are doing right now — click to expand tool timeline, git diff, CLAUDE.md |
| **Project Intelligence** | Cross-session view per repo: sessions, identity, branch, alerts, last commit |
| **Agent Manager** | Debug parallel subagents — which are running, how long, what task |
| **Tool Activity** | Audit every file read, Bash command, and web fetch in real time |
| **Command Center** | Review shell commands with safety classifications; add custom rules |
| **Token Analytics** | Track usage trends, find expensive sessions, plan budget |
| **Network & Domains** | Every external domain contacted — useful for security reviews |
| **Anomaly Alerts** | Dangerous commands, sensitive data, prompt injection, new domains |
| **Settings** | Theme, model for token estimates, data export, feedback links |

### Understanding anomaly types

| Alert type | What triggered it |
|-----------|------------------|
| Dangerous command | Bash matched a high-risk pattern (`rm -rf`, `curl \| bash`, `chmod 777`, etc.) |
| Sensitive data | Tool input/output contained API keys, passwords, or tokens |
| Prompt injection risk | Tool result contained suspicious instruction-like content |
| New external domain | A domain contacted for the first time in this session |

### Command safety classifications

Every Bash command is automatically classified:

| Label | Meaning |
|-------|---------|
| **Safe** | Read-only — `ls`, `cat`, `grep`, `git status` |
| **Needs Info** | Modifies files or state |
| **Needs Permission** | Installs, network calls, service changes |
| **Dangerous** | High-risk — `rm -rf`, `chmod 777`, `curl pipe`, `ngrok` |

Add your own rules in **Command Center** → **Custom Rules**.

### Reading Project Intelligence

Each project card shows all sessions Claude ran in that directory, the git branch and remote, and the git identity (user + email) configured locally. If a project shows a different git email than expected, it means the repo has a local `git config user.email` override — LLMBoard reads the effective config, not just the global one.

---

## FAQ

**Q: Does LLMBoard slow down Claude Code?**
The hook is a shell script (~10ms). Claude Code's tool calls take hundreds of milliseconds minimum — LLMBoard adds no perceptible delay.

**Q: Does my data leave my machine?**
No. Everything stays in `~/.llmboard/events.jsonl` served from a local Express server. The only exception is `llmboard --share`, which proxies via Cloudflare Tunnel — only if you explicitly pass `--share`.

**Q: Why are token counts estimates?**
Claude Code hooks don't expose the actual API token counts. LLMBoard estimates from character length (~4 chars/token). Estimates are labeled clearly in the UI.

**Q: The dashboard shows "No Active Sessions" even though Claude is running.**
Run `llmboard doctor`. Common causes: hooks not installed (`llmboard setup`), `~/.llmboard/events.jsonl` not writable, or the server started before any events were logged.

**Q: How do I reset all data?**
```bash
rm ~/.llmboard/events.jsonl && touch ~/.llmboard/events.jsonl
```
The server picks up the empty file immediately — no restart needed.

**Q: Can I run multiple dashboards on different ports?**
Yes: `llmboard --port 3457 --no-open` in a second terminal. Both watch the same `events.jsonl`.

**Q: What does the VS Code extension add?**
It embeds the dashboard as a side panel so you don't need a separate browser tab and auto-starts the server when VS Code opens. See `vscode-extension/`.

**Q: How do I add my team's internal domains to the allowlist?**
There's no allowlist UI yet — all external domains appear in **Network & Domains**. You can filter by session there. Domain allowlisting is on the roadmap.

**Q: Why does Project Intelligence show the wrong git identity?**
LLMBoard reads the effective `git config user.name` and `user.email` for each repo (local config takes priority over global). If a project shows unexpected credentials, check `git config --list` in that directory.

**Q: Can I use LLMBoard without installing it globally?**
Yes:
```bash
git clone https://github.com/dcreddi/llmboard
cd llmboard
npm install
node bin/cli.js setup
node bin/cli.js
```

**Q: How do I uninstall completely?**
```bash
llmboard remove              # remove hooks from ~/.claude/settings.json
llmboard service uninstall   # remove auto-start service
npm uninstall -g llmboard
rm -rf ~/.llmboard           # delete all local data
```

---

## Contributing & Feedback

Found a bug or have an idea?

| Type | Link |
|------|------|
| **Bug report** | [Open an issue](https://github.com/dcreddi/llmboard/issues/new?template=bug_report.md&labels=bug) |
| **Feature request** | [Request a feature](https://github.com/dcreddi/llmboard/issues/new?template=feature_request.md&labels=enhancement) |
| **Questions** | [GitHub Discussions](https://github.com/dcreddi/llmboard/discussions) |

You can also click **Report a Bug** or **Request a Feature** directly from the **Settings** tab inside the dashboard.

### What to include in a bug report

1. **LLMBoard version** — `llmboard --version`
2. **OS and Node version** — `node --version`, `uname -a`
3. **Doctor output** — `llmboard doctor` (paste full output)
4. **What you expected vs what happened**
5. **Steps to reproduce**

For event pipeline issues, also include:
```bash
tail -5 ~/.llmboard/events.jsonl
```

---

## License

MIT — Copyright (c) 2026 DCReddi Inc (katuru@dcreddi.com)
