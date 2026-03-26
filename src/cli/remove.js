'use strict';

const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');
const DATA_DIR = path.join(process.env.HOME, '.llmboard');
const DASHBOARD_MARKER = 'llmboard';

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
  console.log('Claude Dashboard — Hook Removal\n');

  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log('No ~/.claude/settings.json found. Nothing to remove.');
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (e) {
    console.error('ERROR: ~/.claude/settings.json is not valid JSON.');
    console.error(`Parse error: ${e.message}`);
    process.exit(1);
  }

  if (!settings.hooks) {
    console.log('No hooks configured. Nothing to remove.');
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
      console.log(`  Removed ${removed} dashboard hook(s) from ${event}`);
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
    fs.writeFileSync(
      SETTINGS_PATH,
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8'
    );
  } catch (e) {
    console.error(`ERROR: Could not write settings.json: ${e.message}`);
    console.error('Hooks were NOT removed from disk.');
    process.exit(1);
  }

  if (removedCount === 0) {
    console.log('No dashboard hooks found. Settings unchanged.');
  } else {
    console.log(`\nRemoved ${removedCount} hook(s). Settings updated.`);
  }

  if (fs.existsSync(DATA_DIR)) {
    const backups = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('settings-backup.'))
      .sort()
      .reverse();

    if (backups.length > 0) {
      console.log(`\nBackup available: ${path.join(DATA_DIR, backups[0])}`);
      console.log(
        'To fully restore original settings, copy the backup manually.'
      );
    }
  }

  console.log('\nDashboard hooks removed. Claude Code settings restored.');
  console.log(
    'Note: Event data in ~/.llmboard/ is preserved. Delete manually if desired.'
  );
}

module.exports = { run };
