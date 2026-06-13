'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI = path.resolve(__dirname, '../bin/cli.js');

function run(args, tmpHome) {
  return spawnSync(process.execPath, [CLI, 'service', ...args], {
    env: { ...process.env, HOME: tmpHome },
    encoding: 'utf-8',
    timeout: 5000,
  });
}

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'llmboard-service-test-'));
}

describe('cli service', () => {
  test('no args prints help with install/uninstall/status', () => {
    var home = tmpHome();
    var r = run([], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('install'));
    assert.ok(r.stdout.includes('uninstall'));
    assert.ok(r.stdout.includes('status'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('unknown subcommand prints help', () => {
    var home = tmpHome();
    var r = run(['foo'], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('install'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('uninstall when not installed says not installed (macOS)', function() {
    if (process.platform !== 'darwin') return this.skip();
    var home = tmpHome();
    var r = run(['uninstall'], home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('not installed'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('install writes plist file (macOS)', function() {
    if (process.platform !== 'darwin') return this.skip();
    var home = tmpHome();
    fs.mkdirSync(path.join(home, '.llmboard'), { recursive: true });
    run(['install'], home);
    // launchctl may fail in test env but plist file should be created
    var plist = path.join(home, 'Library', 'LaunchAgents', 'com.llmboard.agent.plist');
    assert.ok(fs.existsSync(plist), 'plist file should be written');
    var content = fs.readFileSync(plist, 'utf-8');
    assert.ok(content.includes('com.llmboard.agent'));
    assert.ok(content.includes('--no-open'));
    // cleanup
    spawnSync('launchctl', ['unload', plist]);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('install writes systemd unit file (Linux)', function() {
    if (process.platform !== 'linux') return this.skip();
    var home = tmpHome();
    run(['install'], home);
    var unit = path.join(home, '.config', 'systemd', 'user', 'llmboard.service');
    assert.ok(fs.existsSync(unit), 'systemd unit file should be written');
    var content = fs.readFileSync(unit, 'utf-8');
    assert.ok(content.includes('LLMBoard'));
    assert.ok(content.includes('--no-open'));
    fs.rmSync(home, { recursive: true, force: true });
  });
});
