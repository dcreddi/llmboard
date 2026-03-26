'use strict';

const fs = require('fs');
const path = require('path');

function run(args = []) {
  const DATA_DIR = path.join(process.env.HOME, '.llmboard');
  const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

  if (!fs.existsSync(EVENTS_FILE)) {
    console.log('No events found. Nothing to export.');
    return;
  }

  let format = 'json';
  let outputFile = null;
  let sessionFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv') format = 'csv';
    if (args[i] === '--json') format = 'json';
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1];
      i++;
    }
    if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    }
    if (args[i] === '--session' && args[i + 1]) {
      sessionFilter = args[i + 1];
      i++;
    }
  }

  const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  let events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip
    }
  }

  if (sessionFilter) {
    events = events.filter((e) => e.session_id === sessionFilter);
  }

  let output;
  if (format === 'csv') {
    const header = 'timestamp,session_id,hook_event,tool_name,cwd\n';
    const rows = events.map((e) => {
      return [
        e.dashboard_ts || '',
        e.session_id || '',
        e.hook_event_name || '',
        e.tool_name || '',
        '"' + (e.cwd || '').replace(/"/g, '""') + '"',
      ].join(',');
    });
    output = header + rows.join('\n') + '\n';
  } else {
    output = JSON.stringify(events, null, 2);
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, output, 'utf-8');
    console.log(`Exported ${events.length} events to ${outputFile} (${format})`);
  } else {
    process.stdout.write(output);
  }
}

module.exports = { run };
