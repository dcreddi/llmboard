'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG_FILE = path.join(process.env.HOME, '.llmboard', 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  var dir = path.dirname(CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function run(args) {
  args = args || [];
  var subcommand = args[0];

  if (!subcommand) {
    // Open config in editor
    if (!fs.existsSync(CONFIG_FILE)) {
      saveConfig({
        port: 3456,
        model: 'sonnet-4',
        retention_days: 30,
        max_file_size_mb: 50,
        auto_open_browser: true,
        theme: 'dark',
      });
    }

    var editor = process.env.EDITOR || process.env.VISUAL || 'nano';
    try {
      // Safe: execFileSync does not use a shell, preventing injection
      execFileSync(editor, [CONFIG_FILE], { stdio: 'inherit' });
    } catch {
      console.log('Config file: ' + CONFIG_FILE);
      console.log('Open it manually in your editor.');
    }
    return;
  }

  if (subcommand === 'get') {
    var key = args[1];
    if (!key) {
      console.error('Usage: llmboard config get <key>');
      return;
    }
    var config = loadConfig();
    var value = config[key];
    if (value !== undefined) {
      console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
    } else {
      console.log('Key "' + key + '" not found in config.');
    }
    return;
  }

  if (subcommand === 'set') {
    var setKey = args[1];
    var setValue = args[2];
    if (!setKey || setValue === undefined) {
      console.error('Usage: llmboard config set <key> <value>');
      return;
    }

    // Auto-type conversion
    if (setValue === 'true') setValue = true;
    else if (setValue === 'false') setValue = false;
    else if (setValue === 'null') setValue = null;
    else if (!isNaN(setValue) && setValue !== '') setValue = Number(setValue);

    var setConfig = loadConfig();
    setConfig[setKey] = setValue;
    saveConfig(setConfig);
    console.log('Set ' + setKey + ' = ' + JSON.stringify(setValue));
    return;
  }

  if (subcommand === 'list') {
    console.log(JSON.stringify(loadConfig(), null, 2));
    return;
  }

  console.error('Unknown config subcommand: ' + subcommand);
  console.error('Usage: llmboard config [get|set|list]');
}

module.exports = { run };
