#!/usr/bin/env node

'use strict';

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  setup: '../src/cli/setup',
  remove: '../src/cli/remove',
  start: '../src/cli/start',
  stats: '../src/cli/stats',
  export: '../src/cli/export',
  config: '../src/cli/config',
  doctor: '../src/cli/doctor',
  service: '../src/cli/service',
};

function showHelp() {
  console.log(`
llmboard — Real-time monitoring dashboard for Claude Code

USAGE
  llmboard                          Start dashboard server + open browser
  llmboard setup                    Install hooks into Claude Code (one-time)
  llmboard remove                   Uninstall hooks, restore original settings
  llmboard service install          Install auto-start service (runs on login)
  llmboard service uninstall        Remove auto-start service
  llmboard service status           Show service status
  llmboard stats                    Print usage summary to terminal
  llmboard stats --today            Today's breakdown
  llmboard stats --week             Weekly breakdown
  llmboard stats --month            Monthly breakdown
  llmboard export --csv             Export analytics as CSV
  llmboard export --json            Export analytics as JSON
  llmboard config                   Open config in $EDITOR
  llmboard config set <key> <value>
  llmboard config get <key>
  llmboard doctor                   Diagnose hook installation and event flow

OPTIONS
  --port <number>   Custom port (default: 3456)
  --no-open         Don't auto-open browser
  --share           Share via Cloudflare Tunnel (requires cloudflared)
  --help, -h        Show this help message
  --version, -v     Show version

ALL DATA STAYS ON YOUR MACHINE. Zero telemetry. Zero external calls.
`);
}

function showVersion() {
  const pkg = require('../package.json');
  console.log(`llmboard v${pkg.version}`);
}

if (args.includes('--help') || args.includes('-h') || command === 'help') {
  showHelp();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v') || command === 'version') {
  showVersion();
  process.exit(0);
}

if (!command || command.startsWith('--')) {
  // Pass through flags like --port, --no-open
  const startArgs = command ? [command, ...args] : args;
  require('../src/cli/start').run(startArgs);
} else if (commands[command]) {
  require(commands[command]).run(args);
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "llmboard --help" for usage.');
  process.exit(1);
}
