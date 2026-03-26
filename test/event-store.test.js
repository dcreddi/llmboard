'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { EventStore } = require('../src/server/event-store');

describe('EventStore', () => {
  test('creates session from first event', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'SessionStart',
        cwd: '/home/user/project',
        dashboard_ts: new Date().toISOString(),
      }
    ]);

    var sessions = store.getSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'sess-1');
    assert.equal(sessions[0].status, 'active');
    assert.equal(sessions[0].cwd, '/home/user/project');
  });

  test('tracks tool calls', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'SessionStart',
        cwd: '/project',
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/index.js' },
        dashboard_ts: '2026-03-21T10:00:01.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        dashboard_ts: '2026-03-21T10:00:02.000Z',
      }
    ]);

    var sessions = store.getSessions();
    assert.equal(sessions[0].toolCallCount, 2);

    var stats = store.getStats();
    assert.equal(stats.toolCounts.Read, 1);
    assert.equal(stats.toolCounts.Bash, 1);
  });

  test('tracks agent spawns', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'SessionStart',
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { description: 'Explore codebase', subagent_type: 'Explore' },
        dashboard_ts: '2026-03-21T10:00:05.000Z',
      }
    ]);

    var sessions = store.getSessions();
    assert.equal(sessions[0].agents.length, 1);
    assert.equal(sessions[0].agents[0].agentType, 'Explore');
    assert.equal(sessions[0].agents[0].status, 'running');
    assert.equal(sessions[0].agents[0].task, 'Explore codebase');
  });

  test('completes agents on SubagentStop', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { description: 'Search files' },
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'SubagentStop',
        reason: 'complete',
        dashboard_ts: '2026-03-21T10:00:10.000Z',
      }
    ]);

    var sessions = store.getSessions();
    assert.equal(sessions[0].agents[0].status, 'completed');
    assert.ok(sessions[0].agents[0].endedAt);
  });

  test('handles session end', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'SessionStart',
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'SessionEnd',
        dashboard_ts: '2026-03-21T11:00:00.000Z',
      }
    ]);

    var sessions = store.getSessions();
    assert.equal(sessions[0].status, 'ended');
    assert.ok(sessions[0].endedAt);
  });

  test('skips test events', () => {
    var store = new EventStore();
    store.processEvents([
      { session_id: 'test', _test: true, hook_event_name: 'Notification' }
    ]);

    assert.equal(store.eventCount, 0);
    assert.equal(store.getSessions().length, 0);
  });

  test('filters events by session', () => {
    var store = new EventStore();
    store.processEvents([
      { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read', dashboard_ts: '2026-03-21T10:00:00.000Z' },
      { session_id: 's2', hook_event_name: 'PreToolUse', tool_name: 'Write', dashboard_ts: '2026-03-21T10:00:01.000Z' },
    ]);

    var s1Events = store.getRecentEvents({ sessionId: 's1' });
    assert.equal(s1Events.length, 1);
    assert.equal(s1Events[0].tool_name, 'Read');
  });

  test('estimates tokens and cost', () => {
    var store = new EventStore({ model: 'sonnet-4' });
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/long-file.js' },
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      }
    ]);

    var sessions = store.getSessions();
    assert.ok(sessions[0].tokens.input > 0);
    assert.ok(sessions[0].cost > 0);
  });

  test('aggregates daily stats', () => {
    var store = new EventStore();
    store.processEvents([
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'test.js' },
        dashboard_ts: '2026-03-21T10:00:00.000Z',
      },
      {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'test.js', content: 'hello' },
        dashboard_ts: '2026-03-21T11:00:00.000Z',
      }
    ]);

    var stats = store.getStats();
    assert.ok(stats.daily.length > 0);
    assert.equal(stats.daily[0].date, '2026-03-21');
    assert.ok(stats.daily[0].events >= 2);
  });
});
