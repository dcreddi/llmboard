'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
const DATA_DIR = path.join(HOME, '.llmboard');
const HOOK_SCRIPT = path.resolve(__dirname, '../../hooks/event-logger.sh');
const DASHBOARD_MARKER = 'llmboard';

const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
  'SessionStart', 'SessionEnd', 'Notification',
];

// ── Claude Code hooks ──────────────────────────────────────────────────────

function createHookEntry() {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command: `bash "${HOOK_SCRIPT}"`, timeout: 10 }],
  };
}

function isDashboardHook(entry) {
  return entry.hooks?.some((h) => h.command?.includes(DASHBOARD_MARKER));
}

function installClaudeHooks() {
  console.log('\n[1/3] Installing Claude Code hooks...');

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (e) {
      console.error(`  ✗ ~/.claude/settings.json is invalid JSON: ${e.message}`);
      process.exit(1);
    }
    const backup = path.join(DATA_DIR, `settings-backup.${Date.now()}.json`);
    try { fs.copyFileSync(SETTINGS_PATH, backup); } catch {}
  } else {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  }

  if (!settings.hooks) settings.hooks = {};
  const entry = createHookEntry();

  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    const idx = settings.hooks[event].findIndex(isDashboardHook);
    if (idx >= 0) {
      settings.hooks[event][idx] = entry;
    } else {
      settings.hooks[event].push(entry);
    }
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  try { fs.chmodSync(HOOK_SCRIPT, '755'); } catch {}
  console.log(`  ✓ Hooks installed for ${HOOK_EVENTS.length} events`);
}

// ── Background service ─────────────────────────────────────────────────────

function installService() {
  console.log('\n[2/3] Installing background service...');
  try {
    const { run } = require('./service');
    // Call install directly — it handles macOS/Linux/Windows
    run(['install']);
  } catch (e) {
    console.log(`  ⚠ Service install skipped: ${e.message}`);
    console.log('  Run "llmboard service install" manually later.');
  }
}

// ── Data directory + config ────────────────────────────────────────────────

function initDataDir() {
  console.log('\n[3/3] Initialising data directory...');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const eventsFile = path.join(DATA_DIR, 'events.jsonl');
  if (!fs.existsSync(eventsFile)) fs.writeFileSync(eventsFile, '');

  const configFile = path.join(DATA_DIR, 'config.json');
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify({
      port: 3456,
      model: 'sonnet-4',
      retention_days: 30,
      max_file_size_mb: 50,
      auto_open_browser: true,
      theme: 'dark',
      budget: { daily_limit_usd: null, monthly_limit_usd: null, warn_at_percent: 80 },
    }, null, 2) + '\n');
  }

  // Write a test event so the server has something to show immediately
  fs.appendFileSync(eventsFile, JSON.stringify({
    session_id: 'setup-test',
    hook_event_name: 'Notification',
    cwd: process.cwd(),
    dashboard_ts: new Date().toISOString(),
    _test: true,
  }) + '\n');

  console.log(`  ✓ Data directory: ${DATA_DIR}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

function run(args = []) {
  const silent = args.includes('--silent');

  console.log('LLMBoard Setup\n' + '─'.repeat(40));

  initDataDir();
  installClaudeHooks();

  // Skip service install in --silent mode (postinstall hook)
  if (!silent) {
    installService();
  }

  console.log(`
${'─'.repeat(40)}
✓ Setup complete!

• Dashboard:   llmboard            (start + open browser)
• Doctor:      llmboard doctor     (verify everything works)
• Service:     llmboard service status

ALL DATA STAYS ON YOUR MACHINE. Zero telemetry.
`);
}

module.exports = { run };
