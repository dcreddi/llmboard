'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * These tests verify the hook merge logic by simulating what setup.js does.
 * We test the merge algorithm directly rather than calling setup.run()
 * because setup.run() writes to the real ~/.claude/settings.json.
 */

const DASHBOARD_MARKER = 'claude-dashboard';
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd', 'Notification'];

function isDashboardHook(entry) {
  return entry.hooks && Array.isArray(entry.hooks) &&
    entry.hooks.some(function(h) { return h.command && h.command.includes(DASHBOARD_MARKER); });
}

function createHookEntry() {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command: 'bash /path/to/claude-dashboard/hooks/event-logger.sh', timeout: 10 }]
  };
}

function mergeHooks(settings) {
  if (!settings.hooks) settings.hooks = {};
  var ourEntry = createHookEntry();

  for (var i = 0; i < HOOK_EVENTS.length; i++) {
    var event = HOOK_EVENTS[i];
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
    }
    var existingIdx = settings.hooks[event].findIndex(isDashboardHook);
    if (existingIdx >= 0) {
      settings.hooks[event][existingIdx] = ourEntry;
    } else {
      settings.hooks[event].push(ourEntry);
    }
  }
  return settings;
}

function removeHooks(settings) {
  if (!settings.hooks) return settings;
  for (var event of Object.keys(settings.hooks)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    settings.hooks[event] = settings.hooks[event].filter(function(e) { return !isDashboardHook(e); });
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

describe('Hook Merge Algorithm', () => {
  test('adds hooks to empty settings', () => {
    var settings = {};
    mergeHooks(settings);

    assert.ok(settings.hooks);
    for (var event of HOOK_EVENTS) {
      assert.ok(Array.isArray(settings.hooks[event]), event + ' should be array');
      assert.equal(settings.hooks[event].length, 1);
      assert.ok(isDashboardHook(settings.hooks[event][0]));
    }
  });

  test('preserves existing non-dashboard hooks', () => {
    var settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'prompt', prompt: 'Check security' }]
          }
        ]
      }
    };

    mergeHooks(settings);

    // Should have 2 entries in PreToolUse: existing + ours
    assert.equal(settings.hooks.PreToolUse.length, 2);
    // First is the original
    assert.equal(settings.hooks.PreToolUse[0].matcher, 'Write');
    // Second is ours
    assert.ok(isDashboardHook(settings.hooks.PreToolUse[1]));
  });

  test('idempotent reinstall updates existing dashboard hooks', () => {
    var settings = {};
    mergeHooks(settings);
    mergeHooks(settings); // run twice

    // Should still have exactly 1 dashboard hook per event
    for (var event of HOOK_EVENTS) {
      assert.equal(settings.hooks[event].length, 1);
    }
  });

  test('preserves other settings keys', () => {
    var settings = {
      enabledPlugins: { 'some-plugin': true },
      extraKnownMarketplaces: { test: {} }
    };

    mergeHooks(settings);

    assert.ok(settings.enabledPlugins);
    assert.ok(settings.extraKnownMarketplaces);
    assert.equal(settings.enabledPlugins['some-plugin'], true);
  });
});

describe('Hook Removal Algorithm', () => {
  test('removes only dashboard hooks', () => {
    var settings = {
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [{ type: 'prompt', prompt: 'Check' }] },
          createHookEntry()
        ]
      }
    };

    removeHooks(settings);

    assert.equal(settings.hooks.PreToolUse.length, 1);
    assert.equal(settings.hooks.PreToolUse[0].matcher, 'Write');
  });

  test('cleans up empty arrays and objects', () => {
    var settings = {};
    mergeHooks(settings);
    removeHooks(settings);

    // hooks key should be removed entirely
    assert.equal(settings.hooks, undefined);
  });

  test('preserves non-dashboard hooks after removal', () => {
    var settings = {
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'prompt', prompt: 'Always check' }] },
          createHookEntry()
        ],
        Stop: [createHookEntry()]
      }
    };

    removeHooks(settings);

    assert.ok(settings.hooks.PreToolUse);
    assert.equal(settings.hooks.PreToolUse.length, 1);
    assert.equal(settings.hooks.Stop, undefined); // removed because empty
  });
});
