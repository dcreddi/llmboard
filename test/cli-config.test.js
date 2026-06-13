'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI = path.resolve(__dirname, '../bin/cli.js');

function run(args, tmpHome) {
  return spawnSync(process.execPath, [CLI, 'config', ...args], {
    env: { ...process.env, HOME: tmpHome },
    encoding: 'utf-8',
    timeout: 5000,
  });
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'llmboard-config-test-'));
}

describe('cli config', () => {
  test('list returns empty object when no config exists', () => {
    var home = tmpHome();
    var r = run(['list'], home);
    assert.equal(r.status, 0);
    var parsed = JSON.parse(r.stdout);
    assert.deepEqual(parsed, {});
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set saves a string value', () => {
    var home = tmpHome();
    var r = run(['set', 'theme', 'light'], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('theme'));
    assert.ok(r.stdout.includes('light'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('get retrieves a previously set value', () => {
    var home = tmpHome();
    run(['set', 'port', '4000'], home);
    var r = run(['get', 'port'], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.trim() === '4000');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set converts "true" to boolean', () => {
    var home = tmpHome();
    run(['set', 'auto_open', 'true'], home);
    var configFile = path.join(home, '.llmboard', 'config.json');
    var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(config.auto_open, true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set converts "false" to boolean', () => {
    var home = tmpHome();
    run(['set', 'auto_open', 'false'], home);
    var configFile = path.join(home, '.llmboard', 'config.json');
    var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(config.auto_open, false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set converts numeric string to number', () => {
    var home = tmpHome();
    run(['set', 'port', '5000'], home);
    var configFile = path.join(home, '.llmboard', 'config.json');
    var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(config.port, 5000);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set converts "null" to null', () => {
    var home = tmpHome();
    run(['set', 'model', 'null'], home);
    var configFile = path.join(home, '.llmboard', 'config.json');
    var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(config.model, null);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('get reports missing key', () => {
    var home = tmpHome();
    var r = run(['get', 'nonexistent'], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('nonexistent'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('set without args prints usage to stderr', () => {
    var home = tmpHome();
    var r = run(['set'], home);
    assert.ok(r.stderr.includes('Usage'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('get without key prints usage to stderr', () => {
    var home = tmpHome();
    var r = run(['get'], home);
    assert.ok(r.stderr.includes('Usage'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('unknown subcommand prints error to stderr', () => {
    var home = tmpHome();
    var r = run(['foo'], home);
    assert.ok(r.stderr.includes('Unknown'));
    fs.rmSync(home, { recursive: true, force: true });
  });
});
