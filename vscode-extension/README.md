# LLMBoard for VS Code

Real-time monitoring for Claude Code inside VS Code — agents, tools, tokens, command log, and anomaly alerts.

## Requirements

`llmboard` must be installed globally:
```bash
npm install -g llmboard
llmboard setup
```

## Usage

- Dashboard opens automatically as a panel when VS Code starts
- Click **`$(circuit-board) LLMBoard`** in the status bar to open/focus it
- Command palette: `LLMBoard: Open Dashboard` / `LLMBoard: Stop Server`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llmboard.port` | `3456` | Server port |
| `llmboard.autoStart` | `true` | Start server on VS Code launch |
