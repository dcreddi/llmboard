'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_SCRIPT = path.resolve(__dirname, '../hooks/event-logger.sh');

/**
 * Run the hook script by piping input via stdin using spawnSync.
 * Uses spawnSync (no shell) for safety — stdin is passed as buffer.
 */
function runHook(input, tmpHome) {
  var result = spawnSync('bash', [HOOK_SCRIPT], {
    input: input,
    env: Object.assign({}, process.env, { HOME: tmpHome }),
    encoding: 'utf-8',
    timeout: 5000,
  });
  return result;
}

function createTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dashboard-test-'));
}

describe('event-logger.sh', function() {
  test('writes valid JSONL from hook stdin', function() {
    var tmpHome = createTmpHome();
    var input = JSON.stringify({
      session_id: 'test-session-001',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      cwd: '/tmp/test-project',
    });

    var result = runHook(input, tmpHome);
    assert.equal(result.status, 0, 'Script should exit 0');

    var eventsFile = path.join(tmpHome, '.claude-dashboard', 'events.jsonl');
    assert.ok(fs.existsSync(eventsFile), 'events.jsonl should be created');

    var content = fs.readFileSync(eventsFile, 'utf-8').trim();
    var parsed = JSON.parse(content);

    assert.equal(parsed.session_id, 'test-session-001');
    assert.equal(parsed.hook_event_name, 'PreToolUse');
    assert.equal(parsed.tool_name, 'Bash');

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('creates data directory if missing', function() {
    var tmpHome = createTmpHome();
    var input = JSON.stringify({ session_id: 'test', hook_event_name: 'SessionStart' });

    runHook(input, tmpHome);

    var dataDir = path.join(tmpHome, '.claude-dashboard');
    assert.ok(fs.existsSync(dataDir), 'data directory should be created');

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('handles empty stdin gracefully', function() {
    var tmpHome = createTmpHome();
    var result = runHook('', tmpHome);
    assert.equal(result.status, 0, 'Hook should exit 0 on empty input');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('appends multiple events to same file', function() {
    var tmpHome = createTmpHome();

    var event1 = JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read' });
    var event2 = JSON.stringify({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Read' });

    runHook(event1, tmpHome);
    runHook(event2, tmpHome);

    var eventsFile = path.join(tmpHome, '.claude-dashboard', 'events.jsonl');
    var lines = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2, 'Should have 2 event lines');

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('always exits with code 0 even with bad input', function() {
    var tmpHome = createTmpHome();
    var result = runHook('not valid json at all', tmpHome);
    assert.equal(result.status, 0, 'Exit code should always be 0');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });
});
