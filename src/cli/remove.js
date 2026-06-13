'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const DATA_DIR = path.join(os.homedir(), '.llmboard');
// Match our own hook by the script filename, which is identical regardless of where
// the package is installed (npm global, local clone, relocated). Matching the brand
// string "llmboard" silently missed local-clone installs and appended duplicates.
const DASHBOARD_MARKER = 'event-logger';

function isDashboardHook(entry) {
  return (
    entry.hooks &&
    Array.isArray(entry.hooks) &&
    entry.hooks.some(
      (h) => h.command && h.command.includes(DASHBOARD_MARKER)
    )
  );
}

function run(args = []) {
  const silent = args.includes('--silent');
  const purge = args.includes('--purge');
  const log = silent ? () => {} : (...a) => console.log(...a);

  log('Claude Dashboard — Hook Removal\n');

  // Best-effort: also remove the auto-start service so it stops launching on login.
  try { require('./service').run(['uninstall']); } catch { /* not installed / unsupported */ }

  if (!fs.existsSync(SETTINGS_PATH)) {
    log('No ~/.claude/settings.json found. Nothing to remove.');
    if (purge) purgeData(log);
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (e) {
    console.error('ERROR: ~/.claude/settings.json is not valid JSON.');
    console.error(`Parse error: ${e.message}`);
    if (silent) return; // preuninstall must not abort the npm lifecycle
    process.exit(1);
  }

  if (!settings.hooks) {
    log('No hooks configured. Nothing to remove.');
    if (purge) purgeData(log);
    return;
  }

  let removedCount = 0;
  for (const event of Object.keys(settings.hooks)) {
    if (!Array.isArray(settings.hooks[event])) continue;

    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter(
      (entry) => !isDashboardHook(entry)
    );
    const removed = before - settings.hooks[event].length;

    if (removed > 0) {
      log(`  Removed ${removed} dashboard hook(s) from ${event}`);
      removedCount += removed;
    }

    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  try {
    // Atomic write: a crash mid-write must not corrupt the user's entire Claude config.
    const tmp = SETTINGS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, SETTINGS_PATH);
  } catch (e) {
    console.error(`ERROR: Could not write settings.json: ${e.message}`);
    console.error('Hooks were NOT removed from disk.');
    if (silent) return;
    process.exit(1);
  }

  if (removedCount === 0) {
    log('No dashboard hooks found. Settings unchanged.');
  } else {
    log(`\nRemoved ${removedCount} hook(s). Settings updated.`);
  }

  if (fs.existsSync(DATA_DIR)) {
    const backups = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('settings-backup.'))
      .sort()
      .reverse();

    if (backups.length > 0) {
      log(`\nBackup available: ${path.join(DATA_DIR, backups[0])}`);
      log('To fully restore original settings, copy the backup manually.');
    }
  }

  if (purge) purgeData(log);

  log('\nDashboard hooks removed. Claude Code settings restored.');
  if (!purge) {
    log('Note: Event data in ~/.llmboard/ is preserved. Run "llmboard remove --purge" to delete it.');
  }
}

function purgeData(log) {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    log(`\nDeleted all data in ${DATA_DIR}`);
  } catch (e) {
    console.error(`Could not delete ${DATA_DIR}: ${e.message}`);
  }
}

module.exports = { run };
