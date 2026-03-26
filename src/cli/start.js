'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

async function run(args = []) {
  const DATA_DIR = path.join(process.env.HOME, '.llmboard');
  const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

  let port = null;
  let noOpen = false;
  let share = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--no-open') noOpen = true;
    if (args[i] === '--share') share = true;
  }

  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    // defaults
  }

  if (!port) port = config.port || 3456;
  if (config.auto_open_browser === false) noOpen = true;

  const settingsPath = path.join(process.env.HOME, '.claude', 'settings.json');
  let hooksInstalled = false;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.hooks) {
      const hookValues = Object.values(settings.hooks);
      for (const entries of hookValues) {
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (
              entry.hooks &&
              entry.hooks.some(
                (h) => h.command && h.command.includes('llmboard')
              )
            ) {
              hooksInstalled = true;
              break;
            }
          }
        }
        if (hooksInstalled) break;
      }
    }
  } catch {
    // No settings file
  }

  if (!hooksInstalled) {
    console.log(
      '\x1b[33mWarning: Dashboard hooks are not installed.\x1b[0m'
    );
    console.log('Run "llmboard setup" first to capture events.\n');
  }

  const { startServer } = require('../server/index');
  const result = await startServer({ port });

  if (!noOpen) {
    try {
      const open = (await import('open')).default;
      await open(`http://localhost:${result.port}`);
    } catch {
      console.log(`Open http://localhost:${result.port} in your browser`);
    }
  }

  if (share) {
    startShareTunnel(result.port);
  }
}

function startShareTunnel(port) {
  // Requires cloudflared — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  cf.on('error', () => {
    console.log('\x1b[33m--share requires cloudflared. Install: brew install cloudflared\x1b[0m');
  });

  // cloudflared prints the public URL to stderr
  const onData = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (match) {
      console.log(`\n\x1b[32mShare URL: ${match[0]}\x1b[0m`);
      console.log('\x1b[90mAnyone with this link can view your dashboard.\x1b[0m\n');
    }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);

  process.on('exit', () => cf.kill());
}

module.exports = { run };
