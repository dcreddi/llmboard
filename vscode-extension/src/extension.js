'use strict';

const vscode = require('vscode');
const path = require('path');
const http = require('http');

let serverProcess = null;
let statusBarItem = null;
let pollTimer = null;

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'llmboard.open';
  setStatus('idle');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('llmboard.open', () => openDashboard(context)),
    vscode.commands.registerCommand('llmboard.stop', stopServer),
  );

  startPolling();
  if (vscode.workspace.getConfiguration('llmboard').get('autoStart')) {
    startServerIfNeeded(context);
  }
}

function getPort() {
  return vscode.workspace.getConfiguration('llmboard').get('port') || 3456;
}

// Fetch JSON from the local server. This runs in the extension HOST (Node), which
// is NOT subject to CORS or X-Frame-Options — unlike a webview/browser context —
// so we can read live stats directly to drive the status bar.
function getJson(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1000, () => { req.destroy(); resolve(null); });
  });
}

async function isServerRunning(port) {
  return (await getJson(port, '/api/health')) != null;
}

function fmt(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(1) + 'K';
  return (n / 1e6).toFixed(2) + 'M';
}

function startPolling() {
  const tick = async () => {
    const port = getPort();
    const stats = await getJson(port, '/api/stats');
    if (stats) {
      const tokens = (stats.totalTokens && (stats.totalTokens.input + stats.totalTokens.output)) || 0;
      setStatus('connected', { tokens, active: stats.activeSessions || 0, anomalies: stats.anomalyCount || 0, port });
    } else {
      setStatus(serverProcess ? 'starting' : 'idle');
    }
  };
  tick();
  pollTimer = setInterval(tick, 5000);
}

function setStatus(state, info = {}) {
  if (!statusBarItem) return;
  if (state === 'connected') {
    const alert = info.anomalies > 0 ? ` $(warning)${info.anomalies}` : '';
    statusBarItem.text = `$(circuit-board) ${fmt(info.tokens)} tok · ${info.active} active${alert}`;
    statusBarItem.tooltip = `LLMBoard on :${info.port} — ${fmt(info.tokens)} tokens, ${info.active} active session(s)`
      + (info.anomalies ? `, ${info.anomalies} unacknowledged alert(s)` : '')
      + '. Click to open the dashboard in your browser.';
  } else if (state === 'starting') {
    statusBarItem.text = '$(sync~spin) LLMBoard';
    statusBarItem.tooltip = 'LLMBoard starting…';
  } else {
    statusBarItem.text = '$(circuit-board) LLMBoard';
    statusBarItem.tooltip = 'Click to start LLMBoard and open the dashboard';
  }
}

async function startServerIfNeeded(context) {
  const port = getPort();
  if (await isServerRunning(port)) return port;

  // Resolve the llmboard server: prefer the installed npm package, else a sibling checkout.
  let serverPath;
  try {
    serverPath = require.resolve('llmboard/src/server/index');
  } catch {
    serverPath = path.join(context.extensionPath, '..', 'src', 'server', 'index.js');
  }

  setStatus('starting');
  const { fork } = require('child_process');
  try {
    serverProcess = fork(serverPath, [], { env: { ...process.env }, silent: true });
  } catch {
    return null;
  }
  serverProcess.on('exit', () => { serverProcess = null; });

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(port)) return port;
  }
  return null;
}

async function openDashboard(context) {
  const port = await startServerIfNeeded(context);
  if (!port) {
    const pick = await vscode.window.showErrorMessage(
      'LLMBoard: could not start the server. Install it first: npm i -g llmboard',
      'Copy install command'
    );
    if (pick) await vscode.env.clipboard.writeText('npm i -g llmboard');
    return;
  }
  // Open in the real browser. A localhost dashboard can't be embedded in a VS Code
  // webview (X-Frame-Options + cross-origin fetch block it); the browser handles
  // localhost natively and the server allows the loopback Host.
  await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}`));
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  setStatus('idle');
}

function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
  stopServer();
}

module.exports = { activate, deactivate };
