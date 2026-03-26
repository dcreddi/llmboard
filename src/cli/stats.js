'use strict';

const fs = require('fs');
const path = require('path');
const { CostEstimator } = require('../server/cost-estimator');

function run(args = []) {
  const DATA_DIR = path.join(process.env.HOME, '.llmboard');
  const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

  if (!fs.existsSync(EVENTS_FILE)) {
    console.log('No events found. Run "llmboard setup" and use Claude Code first.');
    return;
  }

  const today = args.includes('--today');
  const week = args.includes('--week');
  const month = args.includes('--month');

  const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip
    }
  }

  if (events.length === 0) {
    console.log('No events recorded yet.');
    return;
  }

  const now = new Date();
  let filtered = events;
  let rangeLabel = 'All time';

  if (today) {
    const todayStr = now.toISOString().slice(0, 10);
    filtered = events.filter((e) => {
      const ts = e.dashboard_ts || '';
      return ts.startsWith(todayStr);
    });
    rangeLabel = 'Today (' + todayStr + ')';
  } else if (week) {
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    filtered = events.filter((e) => {
      return new Date(e.dashboard_ts) >= weekAgo;
    });
    rangeLabel = 'Last 7 days';
  } else if (month) {
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    filtered = events.filter((e) => {
      return new Date(e.dashboard_ts) >= monthAgo;
    });
    rangeLabel = 'Last 30 days';
  }

  const sessions = new Set();
  const tools = {};
  const estimator = new CostEstimator();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  for (const e of filtered) {
    if (e.session_id) sessions.add(e.session_id);
    if (e.tool_name) {
      tools[e.tool_name] = (tools[e.tool_name] || 0) + 1;
    }
    const cost = estimator.estimateEventCost(e);
    totalInputTokens += cost.inputTokens;
    totalOutputTokens += cost.outputTokens;
    totalCost += cost.cost;
  }

  const toolRanking = Object.entries(tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  const timestamps = filtered
    .map((e) => e.dashboard_ts)
    .filter(Boolean)
    .sort();
  const firstDate = timestamps[0] ? timestamps[0].slice(0, 10) : 'N/A';
  const lastDate = timestamps[timestamps.length - 1]
    ? timestamps[timestamps.length - 1].slice(0, 10)
    : 'N/A';

  console.log(`
Claude Dashboard Statistics
Range:           ${rangeLabel}
Total events:    ${filtered.length.toLocaleString()}
Total sessions:  ${sessions.size}
Total tool calls: ${Object.values(tools).reduce((a, b) => a + b, 0)}
Most used tools: ${toolRanking || 'N/A'}
Est. tokens:     ~${estimator.formatTokens(totalInputTokens + totalOutputTokens)} (${estimator.formatTokens(totalInputTokens)} in / ${estimator.formatTokens(totalOutputTokens)} out)
Est. cost:       ${estimator.formatCost(totalCost)} (Sonnet 4 pricing)
Date range:      ${firstDate} to ${lastDate}
`);
}

module.exports = { run };
