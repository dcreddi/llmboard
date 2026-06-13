---
description: Launch the LLMBoard dashboard to watch this Claude Code session's agents, tools, tokens, cost, and security anomalies live in the browser
disable-model-invocation: true
argument-hint: "[--port <n>]"
---

# Launch LLMBoard

Start the LLMBoard observability dashboard. It reads the events this plugin's hooks
capture (`~/.llmboard/events.jsonl`) and serves a live web UI.

Run:

```bash
npx --yes llmboard start $ARGUMENTS
```

Then open the printed URL (default **http://127.0.0.1:3456**; pass `--port <n>` to change).

You'll see live agent/tool/token/cost monitoring plus security anomaly alerts
(new external domains, dangerous commands, prompt-injection patterns). All data
stays on the local machine — zero telemetry.
