'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SERVICE_NAME = 'llmboard';
const PLIST_ID = 'com.llmboard.agent';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_ID}.plist`);
const SYSTEMD_PATH = path.join(os.homedir(), '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);

function getCLIPath() {
  // Prefer the resolved bin path; fall back to the script's own location
  const bins = [
    path.resolve(__dirname, '../../bin/cli.js'),
  ];
  for (const p of bins) {
    if (fs.existsSync(p)) return p;
  }
  return bins[0];
}

function installMac() {
  const node = process.execPath;
  const cli = getCLIPath();

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${cli}</string>
    <string>start</string>
    <string>--no-open</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/.llmboard/service.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/.llmboard/service.log</string>
</dict>
</plist>`;

  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.writeFileSync(PLIST_PATH, plist);

  // Unload first (ignore error if not loaded)
  spawnSync('launchctl', ['unload', PLIST_PATH]);
  const result = spawnSync('launchctl', ['load', '-w', PLIST_PATH], { stdio: 'inherit' });

  if (result.status === 0) {
    console.log(`✓ LLMBoard service installed and started (launchd)`);
    console.log(`  Auto-starts on login. Logs: ~/.llmboard/service.log`);
  } else {
    console.error('✗ Failed to load service. Check logs at ~/.llmboard/service.log');
    process.exit(1);
  }
}

function uninstallMac() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log('Service is not installed.');
    return;
  }
  spawnSync('launchctl', ['unload', '-w', PLIST_PATH], { stdio: 'inherit' });
  fs.unlinkSync(PLIST_PATH);
  console.log('✓ LLMBoard service removed.');
}

function statusMac() {
  const result = spawnSync('launchctl', ['list', PLIST_ID], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout) {
    console.log('● LLMBoard service: running (launchd)');
    console.log(result.stdout.trim());
  } else {
    const installed = fs.existsSync(PLIST_PATH);
    console.log(`● LLMBoard service: ${installed ? 'installed but not running' : 'not installed'}`);
  }
}

function installLinux() {
  const node = process.execPath;
  const cli = getCLIPath();

  const unit = `[Unit]
Description=LLMBoard Dashboard
After=network.target

[Service]
Type=simple
ExecStart=${node} ${cli} start --no-open
Restart=on-failure
RestartSec=5
StandardOutput=append:%h/.llmboard/service.log
StandardError=append:%h/.llmboard/service.log

[Install]
WantedBy=default.target
`;

  fs.mkdirSync(path.dirname(SYSTEMD_PATH), { recursive: true });
  fs.writeFileSync(SYSTEMD_PATH, unit);

  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  spawnSync('systemctl', ['--user', 'enable', SERVICE_NAME], { stdio: 'inherit' });
  const result = spawnSync('systemctl', ['--user', 'start', SERVICE_NAME], { stdio: 'inherit' });

  if (result.status === 0) {
    console.log('✓ LLMBoard service installed and started (systemd)');
    console.log('  Auto-starts on login. Logs: ~/.llmboard/service.log');
  } else {
    console.error('✗ Failed to start service. Run: systemctl --user status llmboard');
    process.exit(1);
  }
}

function uninstallLinux() {
  spawnSync('systemctl', ['--user', 'stop', SERVICE_NAME], { stdio: 'inherit' });
  spawnSync('systemctl', ['--user', 'disable', SERVICE_NAME], { stdio: 'inherit' });
  if (fs.existsSync(SYSTEMD_PATH)) fs.unlinkSync(SYSTEMD_PATH);
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  console.log('✓ LLMBoard service removed.');
}

function statusLinux() {
  spawnSync('systemctl', ['--user', 'status', SERVICE_NAME], { stdio: 'inherit' });
}

function installWindows() {
  const node = process.execPath;
  const cli = getCLIPath();
  const taskArgs = `"${node}" "${cli}" start --no-open`;

  const result = spawnSync('schtasks', [
    '/create', '/f',
    '/tn', 'LLMBoard',
    '/tr', taskArgs,
    '/sc', 'ONLOGON',
    '/rl', 'LIMITED',
  ], { stdio: 'inherit' });

  if (result.status === 0) {
    console.log('✓ LLMBoard task installed (Task Scheduler). Starts on next login.');
    console.log('  To start now: schtasks /run /tn LLMBoard');
  } else {
    console.error('✗ Failed to create scheduled task.');
    process.exit(1);
  }
}

function uninstallWindows() {
  spawnSync('schtasks', ['/delete', '/f', '/tn', 'LLMBoard'], { stdio: 'inherit' });
  console.log('✓ LLMBoard task removed.');
}

function statusWindows() {
  spawnSync('schtasks', ['/query', '/tn', 'LLMBoard', '/fo', 'LIST'], { stdio: 'inherit' });
}

async function run(args = []) {
  const sub = args[0];
  const platform = process.platform;

  if (!['install', 'uninstall', 'status'].includes(sub)) {
    console.log(`llmboard service <command>

COMMANDS
  install     Install auto-start service (runs on login)
  uninstall   Remove auto-start service
  status      Show service status

PLATFORMS
  macOS:   launchd  (~/.llmboard/service.log)
  Linux:   systemd user service
  Windows: Task Scheduler (ONLOGON)
`);
    return;
  }

  if (platform === 'darwin') {
    if (sub === 'install') installMac();
    else if (sub === 'uninstall') uninstallMac();
    else statusMac();
  } else if (platform === 'linux') {
    if (sub === 'install') installLinux();
    else if (sub === 'uninstall') uninstallLinux();
    else statusLinux();
  } else if (platform === 'win32') {
    if (sub === 'install') installWindows();
    else if (sub === 'uninstall') uninstallWindows();
    else statusWindows();
  } else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }
}

module.exports = { run };
