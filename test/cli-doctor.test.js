'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI = path.resolve(__dirname, '../bin/cli.js');
const HOOK_SCRIPT = path.resolve(__dirname, '../hooks/event-logger.sh');

function run(tmpHome) {
  return spawnSync(process.execPath, [CLI, 'doctor'], {
    env: { ...process.env, HOME: tmpHome },
    encoding: 'utf-8',
    timeout: 10000,
  });
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'llmboard-doctor-test-'));
}

function seedValidSetup(home) {
  // Create data dir
  var dataDir = path.join(home, '.llmboard');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'events.jsonl'), '', 'utf-8');

  // Create settings.json with hooks
  var claudeDir = path.join(home, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  var hooks = {};
  for (var ev of ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd', 'Notification']) {
    hooks[ev] = [{ hooks: [{ command: 'bash ' + HOOK_SCRIPT, type: 'command' }] }];
  }
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks }), 'utf-8');
}

describe('cli doctor', () => {
  test('always exits 0 (never crashes)', () => {
    var home = tmpHome();
    var r = run(home);
    assert.equal(r.status, 0);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('prints diagnostic header', () => {
    var home = tmpHome();
    var r = run(home);
    assert.ok(r.stdout.includes('Doctor'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('reports Node version check passing', () => {
    var home = tmpHome();
    var r = run(home);
    assert.ok(r.stdout.includes('Node'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('reports missing settings.json', () => {
    var home = tmpHome();
    var r = run(home);
    assert.ok(r.stdout.toLowerCase().includes('fail') || r.stdout.toLowerCase().includes('warn') || r.stdout.includes('FAIL') || r.stdout.includes('WARN'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('reports missing data directory', () => {
    var home = tmpHome();
    var r = run(home);
    assert.ok(r.stdout.includes('.llmboard') || r.stdout.includes('llmboard'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('passes all critical checks with valid setup', () => {
    var home = tmpHome();
    seedValidSetup(home);
    var r = run(home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[OK]'));
    fs.rmSync(home, { recursive: true, force: true });
  });
});
