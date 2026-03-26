'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { WebSocket } = require('ws');

// Isolated temp home so server never touches ~/.claude-dashboard
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'agentboard-home-'));
const DATA_DIR = path.join(TEST_HOME, '.claude-dashboard');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const ORIG_HOME = process.env.HOME;
process.env.HOME = TEST_HOME;

const { startServer } = require('../src/server/index');

const TEST_PORT = 19456;

function makeEvent(overrides = {}) {
  return JSON.stringify({
    session_id: 'e2e-sess-1',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/test.js' },
    cwd: '/tmp/test-project',
    dashboard_ts: new Date().toISOString(),
    ...overrides,
  }) + '\n';
}

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

function httpPost(port, urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost', port, path: urlPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('E2E — REST API', () => {
  let handle;

  before(async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EVENTS_FILE, [
      makeEvent({ hook_event_name: 'SessionStart', tool_name: undefined, tool_input: undefined, permission_mode: 'acceptEdits' }),
      makeEvent(),
    ].join(''));

    handle = await startServer({ port: TEST_PORT });
  });

  after(async () => {
    handle.wss.close();
    handle.watcher.close();
    await new Promise((r) => handle.server.close(r));
    process.env.HOME = ORIG_HOME;
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  test('GET /api/health', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(typeof body.uptime === 'number');
  });

  test('GET /api/sessions returns seeded session', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/sessions');
    assert.equal(status, 200);
    const sess = body.find((s) => s.sessionId === 'e2e-sess-1');
    assert.ok(sess, 'seeded session must exist');
    assert.equal(sess.cwd, '/tmp/test-project');
  });

  test('GET /api/events returns seeded events', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/events');
    assert.equal(status, 200);
    assert.ok(body.length >= 1);
  });

  test('GET /api/events?session= filters by session', async () => {
    const { body } = await httpGet(TEST_PORT, '/api/events?session=e2e-sess-1');
    assert.ok(body.every((e) => e.session_id === 'e2e-sess-1'));
  });

  test('GET /api/stats returns aggregates', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/stats');
    assert.equal(status, 200);
    assert.ok(body.totalSessions >= 1);
    assert.ok(typeof body.toolCounts === 'object');
    assert.ok('permissionModes' in body);
    assert.ok(typeof body.anomalyCount === 'number');
  });

  test('GET /api/network returns domains array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/network');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('GET /api/anomalies returns array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/anomalies');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('GET /api/projects returns array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/projects');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('GET /api/skills returns array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/skills');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('GET /api/digest returns today summary', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/digest');
    assert.equal(status, 200);
    assert.ok(typeof body.date === 'string');
    assert.ok(typeof body.sessions === 'number');
    assert.ok(Array.isArray(body.projects));
  });

  test('GET /api/config returns defaults', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/config');
    assert.equal(status, 200);
    assert.ok(body.model);
  });

  test('POST /api/config only saves allowlisted keys', async () => {
    const { status, body } = await httpPost(TEST_PORT, '/api/config', {
      billingMode: 'api',
      injectedKey: 'should-be-dropped',
    });
    assert.equal(status, 200);
    assert.equal(body.billingMode, 'api');
    assert.ok(!('injectedKey' in body), 'non-allowlisted key must be dropped');
  });

  test('GET /api/sessions/:id/git 404 on unknown session', async () => {
    const { status } = await httpGet(TEST_PORT, '/api/sessions/no-such/git');
    assert.equal(status, 404);
  });

  test('GET /api/sessions/:id/git returns shape for known session', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/sessions/e2e-sess-1/git');
    assert.equal(status, 200);
    assert.ok('branch' in body);
    assert.ok('status' in body);
    assert.ok('diff' in body);
  });

  test('GET /api/sessions/:id/claudemd returns files array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/sessions/e2e-sess-1/claudemd');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.files));
  });

  test('GET /api/export?format=json returns array', async () => {
    const { status, body } = await httpGet(TEST_PORT, '/api/export?format=json');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test('POST /api/anomalies/:id/acknowledge 404 on unknown id', async () => {
    const { status } = await httpPost(TEST_PORT, '/api/anomalies/no-such-id/acknowledge', {});
    assert.equal(status, 404);
  });
});

describe('E2E — WebSocket', () => {
  let handle;
  const WS_PORT = TEST_PORT + 1;

  before(async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EVENTS_FILE, '');
    handle = await startServer({ port: WS_PORT });
  });

  after(async () => {
    handle.wss.close();
    handle.watcher.close();
    await new Promise((r) => handle.server.close(r));
  });

  test('receives init message with required fields', (t, done) => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
    ws.once('message', (data) => {
      const msg = JSON.parse(data.toString());
      assert.equal(msg.type, 'init');
      assert.ok(Array.isArray(msg.sessions));
      assert.ok(Array.isArray(msg.recentEvents));
      assert.ok(Array.isArray(msg.domains));
      assert.ok(Array.isArray(msg.anomalies));
      assert.ok(Array.isArray(msg.projects));
      assert.ok(Array.isArray(msg.skillRegistry));
      ws.close();
      done();
    });
    ws.once('error', done);
  });

  test('receives events broadcast after file append', (t, done) => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}/ws`);
    let initDone = false;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        initDone = true;
        setImmediate(() => {
          fs.appendFileSync(EVENTS_FILE, makeEvent({
            session_id: 'ws-test', hook_event_name: 'SessionStart',
            tool_name: undefined, tool_input: undefined,
          }));
        });
        return;
      }
      if (msg.type === 'events' && initDone) {
        assert.ok(Array.isArray(msg.sessions));
        assert.ok(Array.isArray(msg.anomalies));
        ws.close();
        done();
      }
    });
    ws.once('error', done);
  });
});
