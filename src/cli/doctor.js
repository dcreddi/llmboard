'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const net = require('net');

const DATA_DIR = path.join(process.env.HOME, '.llmboard');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const SETTINGS_PATH = path.join(process.env.HOME, '.claude', 'settings.json');
const HOOK_SCRIPT = path.resolve(__dirname, '../../hooks/event-logger.sh');

function check(label, fn) {
  try {
    var result = fn();
    if (result === true || (typeof result === 'string' && result)) {
      var msg = typeof result === 'string' ? result : '';
      console.log('  \x1b[32m[OK]\x1b[0m   ' + label + (msg ? ' \u2014 ' + msg : ''));
      return true;
    } else {
      console.log('  \x1b[33m[WARN]\x1b[0m ' + label);
      return false;
    }
  } catch (e) {
    console.log('  \x1b[31m[FAIL]\x1b[0m ' + label + ' \u2014 ' + e.message);
    return false;
  }
}

function checkPort(port) {
  return new Promise(function(resolve) {
    var server = net.createServer();
    server.listen(port, function() {
      server.close(function() { resolve(true); });
    });
    server.on('error', function() { resolve(false); });
  });
}

async function run() {
  console.log('\nClaude Dashboard Doctor\n');

  var allPassed = true;

  var nodeOk = check('Node.js version', function() {
    var ver = process.version;
    var major = parseInt(ver.slice(1), 10);
    if (major >= 18) return ver + ' (>= 18 required)';
    throw new Error(ver + ' \u2014 Node 18+ required');
  });
  allPassed = allPassed && nodeOk;

  check('jq installed (optional, improves event logging)', function() {
    try {
      // execFileSync does not invoke a shell, so no injection risk
      var ver = execFileSync('jq', ['--version'], { encoding: 'utf-8' }).trim();
      return ver;
    } catch {
      return false;
    }
  });

  var settingsOk = check('~/.claude/settings.json exists', function() {
    if (!fs.existsSync(SETTINGS_PATH)) throw new Error('File not found');
    JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    return 'valid JSON';
  });
  allPassed = allPassed && settingsOk;

  var hooksOk = check('Dashboard hooks installed', function() {
    var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    if (!settings.hooks) throw new Error('No hooks configured');

    var expectedEvents = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd', 'Notification'];
    var found = [];
    var missing = [];

    for (var i = 0; i < expectedEvents.length; i++) {
      var event = expectedEvents[i];
      var entries = settings.hooks[event];
      if (!Array.isArray(entries)) {
        missing.push(event);
        continue;
      }
      var hasDashboard = entries.some(function(e) {
        return e.hooks && e.hooks.some(function(h) {
          return h.command && h.command.includes('llmboard');
        });
      });
      if (hasDashboard) found.push(event);
      else missing.push(event);
    }

    if (missing.length > 0) {
      throw new Error('Missing hooks for: ' + missing.join(', ') + '. Run "llmboard setup"');
    }
    return found.join(', ');
  });
  allPassed = allPassed && hooksOk;

  var dirOk = check('~/.llmboard/ exists and writable', function() {
    if (!fs.existsSync(DATA_DIR)) throw new Error('Directory not found. Run "llmboard setup"');
    var testFile = path.join(DATA_DIR, '.doctor-test');
    fs.writeFileSync(testFile, 'test', 'utf-8');
    fs.unlinkSync(testFile);
    return true;
  });
  allPassed = allPassed && dirOk;

  check('events.jsonl status', function() {
    if (!fs.existsSync(EVENTS_FILE)) return 'File not found \u2014 no events recorded yet';
    var raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    var lines = raw.split('\n').filter(function(l) { return l.trim(); });
    var eventCount = lines.length;

    if (lines.length > 0) {
      try {
        var last = JSON.parse(lines[lines.length - 1]);
        var lastTs = last.dashboard_ts;
        if (lastTs) {
          var ago = Date.now() - new Date(lastTs).getTime();
          var agoStr = ago < 60000 ? '<1m ago' : Math.round(ago / 60000) + 'm ago';
          return eventCount.toLocaleString() + ' events, last event ' + agoStr;
        }
      } catch {
        // skip malformed last line
      }
    }

    var stat = fs.statSync(EVENTS_FILE);
    var sizeKb = (stat.size / 1024).toFixed(1);
    return eventCount.toLocaleString() + ' events (' + sizeKb + ' KB)';
  });

  var scriptOk = check('event-logger.sh is executable', function() {
    if (!fs.existsSync(HOOK_SCRIPT)) throw new Error('Not found at ' + HOOK_SCRIPT);
    var stat = fs.statSync(HOOK_SCRIPT);
    if (!(stat.mode & 0o100)) throw new Error('Not executable. Run: chmod +x ' + HOOK_SCRIPT);
    return true;
  });
  allPassed = allPassed && scriptOk;

  var port = 3456;
  try {
    var config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf-8'));
    port = config.port || 3456;
  } catch {
    // default
  }

  var portAvail = await checkPort(port);
  if (portAvail) {
    console.log('  \x1b[32m[OK]\x1b[0m   Port ' + port + ' is available');
  } else {
    console.log('  \x1b[33m[WARN]\x1b[0m Port ' + port + ' is in use (dashboard will auto-select next available)');
  }

  console.log('\n' + (allPassed ? '\x1b[32mAll critical checks passed.\x1b[0m' : '\x1b[33mSome checks need attention. See above.\x1b[0m') + '\n');
}

module.exports = { run };
