'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI = path.resolve(__dirname, '../bin/cli.js');

function run(args, tmpHome) {
  return spawnSync(process.execPath, [CLI, 'export', ...args], {
    env: { ...process.env, HOME: tmpHome },
    encoding: 'utf-8',
    timeout: 5000,
  });
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'llmboard-export-test-'));
}

function seedEvents(home, events) {
  var dir = path.join(home, '.llmboard');
  fs.mkdirSync(dir, { recursive: true });
  var lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'events.jsonl'), lines, 'utf-8');
}

describe('cli export', () => {
  test('reports no events when file missing', () => {
    var home = tmpHome();
    var r = run([], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('No events'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('--json outputs valid JSON array', () => {
    var home = tmpHome();
    seedEvents(home, [
      { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read', dashboard_ts: '2026-03-27T00:00:00Z' },
      { session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Read', dashboard_ts: '2026-03-27T00:00:01Z' },
    ]);
    var r = run(['--json'], home);
    assert.equal(r.status, 0);
    var parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 2);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('--csv outputs CSV with header row', () => {
    var home = tmpHome();
    seedEvents(home, [
      { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: '/tmp', dashboard_ts: '2026-03-27T00:00:00Z' },
    ]);
    var r = run(['--csv'], home);
    assert.equal(r.status, 0);
    var lines = r.stdout.trim().split('\n');
    assert.ok(lines[0].includes('session_id'));
    assert.ok(lines[0].includes('hook_event'));
    assert.ok(lines[1].includes('s1'));
    assert.ok(lines[1].includes('Bash'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('--session filters events by session id', () => {
    var home = tmpHome();
    seedEvents(home, [
      { session_id: 'sess-a', hook_event_name: 'PreToolUse', tool_name: 'Read' },
      { session_id: 'sess-b', hook_event_name: 'PreToolUse', tool_name: 'Write' },
    ]);
    var r = run(['--json', '--session', 'sess-a'], home);
    assert.equal(r.status, 0);
    var parsed = JSON.parse(r.stdout);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].session_id, 'sess-a');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('--output writes to file', () => {
    var home = tmpHome();
    seedEvents(home, [
      { session_id: 's1', hook_event_name: 'SessionStart' },
    ]);
    var outFile = path.join(home, 'out.json');
    var r = run(['--json', '--output', outFile], home);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(outFile));
    var parsed = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    assert.equal(parsed.length, 1);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('skips malformed lines in events file', () => {
    var home = tmpHome();
    var dir = path.join(home, '.llmboard');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'events.jsonl'),
      '{"session_id":"s1","hook_event_name":"SessionStart"}\nnot valid json\n{"session_id":"s2","hook_event_name":"SessionEnd"}\n',
      'utf-8');
    var r = run(['--json'], home);
    assert.equal(r.status, 0);
    var parsed = JSON.parse(r.stdout);
    assert.equal(parsed.length, 2);
    fs.rmSync(home, { recursive: true, force: true });
  });
});
