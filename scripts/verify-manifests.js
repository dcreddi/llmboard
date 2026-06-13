#!/usr/bin/env node
'use strict';

// Verify the version is identical across every manifest LLMBoard publishes from.
// LLMBoard ships to npm, the Claude Code plugin marketplace, and the VS Code /
// Open VSX marketplaces — each reads a different file, so they must stay in sync.
//
// Usage:
//   node scripts/verify-manifests.js            # assert all four match each other
//   node scripts/verify-manifests.js 1.2.0      # assert all four equal 1.2.0 (release gate)

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const sources = {
  'package.json': read('package.json').version,
  '.claude-plugin/plugin.json': read('.claude-plugin/plugin.json').version,
  '.claude-plugin/marketplace.json': read('.claude-plugin/marketplace.json').plugins[0].version,
  'vscode-extension/package.json': read('vscode-extension/package.json').version,
};

// Tag arg arrives as v1.2.0 or 1.2.0; normalize.
const expected = (process.argv[2] || sources['package.json']).replace(/^v/, '');

let ok = true;
for (const [file, version] of Object.entries(sources)) {
  const match = version === expected;
  if (!match) ok = false;
  console.log(`${match ? 'ok ' : 'XX '}${file}: ${version}`);
}

if (!ok) {
  console.error(`\nVersion mismatch — expected ${expected}. Keep all four manifests in sync before releasing.`);
  process.exit(1);
}
console.log(`\nAll manifests at ${expected}`);
