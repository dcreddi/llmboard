#!/usr/bin/env node
'use strict';

// Cross-platform Claude Code hook logger. Reads hook JSON from stdin, enriches it with
// a millisecond timestamp and a unique sequence id, and appends one JSONL line to
// ~/.llmboard/events.jsonl. Must never throw or block — always exits 0.
//
// Why Node (not bash): runs identically on macOS/Linux/Windows with no jq/bash dependency,
// always writes dashboard_ts (so time-ranged stats never silently drop events), and stamps
// a unique `seq` so two events in the same second don't collide in the dashboard's dedup.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.llmboard');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const RATE_FILE = path.join(DATA_DIR, '.rate');
const MAX_BYTES = 50 * 1024 * 1024;
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 50; // per second — high enough for parallel subagents, low enough to bound runaway loops

function readStdin() {
  try { return fs.readFileSync(0, 'utf-8'); } catch { return ''; }
}

// Returns false if we should drop this event (rate limit exceeded).
function underRateLimit(now) {
  try {
    let count = 0, start = now;
    try {
      const [ts, c] = fs.readFileSync(RATE_FILE, 'utf-8').split(':');
      const tsN = Number(ts), cN = Number(c);
      if (Number.isFinite(tsN) && now - tsN <= RATE_WINDOW_MS) { start = tsN; count = Number.isFinite(cN) ? cN : 0; }
    } catch { /* no rate file yet */ }
    if (count >= RATE_MAX) return false;
    fs.writeFileSync(RATE_FILE, `${start}:${count + 1}`);
    return true;
  } catch {
    return true; // never let rate-limiting bookkeeping block logging
  }
}

function main() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

  const now = Date.now();
  if (!underRateLimit(now)) process.exit(0);

  const input = readStdin();
  if (!input.trim()) process.exit(0);

  let obj;
  try {
    obj = JSON.parse(input);
  } catch {
    // Not valid JSON — preserve the raw payload on one line so the stream stays valid JSONL.
    obj = { raw: input.replace(/[\r\n]+/g, ' ') };
  }
  if (obj === null || typeof obj !== 'object') obj = { raw: String(obj) };

  obj.dashboard_ts = new Date(now).toISOString();
  // Unique per event: time + pid + counter — lets the dashboard distinguish two events
  // that share a session/second/tool instead of silently dropping the second one.
  obj.seq = `${now}-${process.pid}-${Math.floor(Math.random() * 1e6)}`;

  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(obj) + '\n');
  } catch { process.exit(0); }

  try {
    const { size } = fs.statSync(EVENTS_FILE);
    if (size > MAX_BYTES) {
      fs.renameSync(EVENTS_FILE, `${EVENTS_FILE}.${now}.bak`);
    }
  } catch { /* ignore rotation errors */ }

  process.exit(0);
}

main();
