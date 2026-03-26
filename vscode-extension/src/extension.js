'use strict';

const vscode = require('vscode');
const path = require('path');
const http = require('http');

let serverProcess = null;
let panel = null;
let statusBarItem = null;

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'llmboard.open';
  statusBarItem.text = '$(circuit-board) LLMBoard';
  statusBarItem.tooltip = 'Open LLMBoard Dashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('llmboard.open', () => openDashboard(context)),
    vscode.commands.registerCommand('llmboard.stop', stopServer),
  );

  const config = vscode.workspace.getConfiguration('llmboard');
  if (config.get('autoStart')) {
    startServerIfNeeded(context);
  }
}

function getPort() {
  return vscode.workspace.getConfiguration('llmboard').get('port') || 3456;
}

function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function startServerIfNeeded(context) {
  const port = getPort();
  const running = await isServerRunning(port);
  if (running) {
    updateStatus('connected', port);
    return port;
  }

  // Find the llmboard server entry point relative to extension
  // Works when extension is installed alongside the llmboard package
  let serverPath;
  try {
    serverPath = require.resolve('llmboard/src/server/index');
  } catch {
    // Fallback: look for server relative to extension root
    serverPath = path.join(context.extensionPath, '..', 'src', 'server', 'index.js');
  }

  updateStatus('starting', port);

  const { fork } = require('child_process');
  serverProcess = fork(serverPath, [], {
    env: { ...process.env },
    silent: true,
  });

  serverProcess.on('exit', () => updateStatus('disconnected', port));

  // Wait up to 5s for server to be ready
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(port)) {
      updateStatus('connected', port);
      return port;
    }
  }

  updateStatus('error', port);
  return null;
}

function updateStatus(state, port) {
  const icons = { connected: '$(circuit-board)', starting: '$(sync~spin)', disconnected: '$(x)', error: '$(warning)' };
  statusBarItem.text = `${icons[state] || '$(circuit-board)'} LLMBoard`;
  statusBarItem.tooltip = state === 'connected'
    ? `LLMBoard running on port ${port} — click to open`
    : `LLMBoard ${state}`;
}

async function openDashboard(context) {
  const port = await startServerIfNeeded(context);
  if (!port) {
    vscode.window.showErrorMessage('LLMBoard: Failed to start server. Is llmboard installed?');
    return;
  }

  if (panel) {
    panel.reveal();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'llmboard',
    'LLMBoard',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  panel.webview.html = getWebviewHtml(port);
  panel.onDidDispose(() => { panel = null; });
}

function getWebviewHtml(port) {
  // VS Code WebView can't directly load localhost — use iframe via message bridge
  // We redirect through a simple proxy HTML that loads the dashboard in an iframe
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1C1917; }
    iframe { width: 100vw; height: 100vh; border: none; }
    #loading { display: flex; align-items: center; justify-content: center;
      height: 100vh; color: #A89E98; font-family: system-ui; font-size: 14px; flex-direction: column; gap: 12px; }
    .spinner { width: 24px; height: 24px; border: 2px solid #3D3935;
      border-top-color: #DA7756; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span>Connecting to LLMBoard...</span>
  </div>
  <script>
    // Poll until the server is ready, then load the iframe
    const port = ${port};
    function tryLoad() {
      fetch('http://localhost:' + port + '/api/health')
        .then(() => {
          document.getElementById('loading').remove();
          const iframe = document.createElement('iframe');
          iframe.src = 'http://localhost:' + port;
          document.body.appendChild(iframe);
        })
        .catch(() => setTimeout(tryLoad, 800));
    }
    tryLoad();
  </script>
</body>
</html>`;
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  updateStatus('disconnected', getPort());
}

function deactivate() {
  stopServer();
}

module.exports = { activate, deactivate };
