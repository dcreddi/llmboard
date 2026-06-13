# LLMBoard for VS Code

Real-time monitoring for Claude Code, right from your editor — a **live status bar** showing tokens, active sessions, and security alerts, plus **one-click access** to the full dashboard.

Works in VS Code and any compatible editor (Cursor, Windsurf, VS Codium).

## Requirements

`llmboard` must be installed:
```bash
npm install -g llmboard
llmboard setup
```

(Or install the [Claude Code plugin](https://github.com/dcreddi/llmboard#installation) for hook setup without editing `settings.json`.)

## What you get

- **Live status bar** — `$(circuit-board) 204K tok · 1 active` updates every few seconds, with a `⚠` badge when there are unacknowledged anomaly alerts. Click it to open the dashboard.
- **One-click dashboard** — opens the full LLMBoard UI in your browser (live agents, tools, tokens, cost, sessions, projects, network, and security anomalies).
- **Auto-start** — optionally launches the server when VS Code opens.

> The dashboard opens in your browser rather than an embedded panel: a localhost server can't be safely embedded in an editor webview (cross-origin and clickjacking protections block it), so LLMBoard uses the browser, where everything works and stays on `127.0.0.1`.

## Commands

- `LLMBoard: Open Dashboard` — start the server if needed, then open it in your browser
- `LLMBoard: Stop Server`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llmboard.port` | `3456` | Server port |
| `llmboard.autoStart` | `true` | Start the server when the editor launches |

All data stays on your machine. Zero telemetry. [Source & docs](https://github.com/dcreddi/llmboard).
