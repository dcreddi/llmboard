'use strict';

// Claude model pricing (USD per million tokens). Cache write = 1.25x input (5-min TTL),
// cache read = 0.1x input. Users can override in ~/.llmboard/config.json.
// Keep aliases (sonnet-4 / opus-4 / haiku-3.5) so existing configs keep resolving.
const DEFAULT_PRICING = {
  'fable-5':    { input: 10.0, output: 50.0, cacheWrite: 12.5,  cacheRead: 1.0 },
  'opus-4.8':   { input: 5.0,  output: 25.0, cacheWrite: 6.25,  cacheRead: 0.5 },
  'opus-4.7':   { input: 5.0,  output: 25.0, cacheWrite: 6.25,  cacheRead: 0.5 },
  'opus-4.6':   { input: 5.0,  output: 25.0, cacheWrite: 6.25,  cacheRead: 0.5 },
  'opus-4.5':   { input: 5.0,  output: 25.0, cacheWrite: 6.25,  cacheRead: 0.5 },
  'opus-4.1':   { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
  'opus-4':     { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
  'sonnet-4.6': { input: 3.0,  output: 15.0, cacheWrite: 3.75,  cacheRead: 0.3 },
  'sonnet-4.5': { input: 3.0,  output: 15.0, cacheWrite: 3.75,  cacheRead: 0.3 },
  'sonnet-4':   { input: 3.0,  output: 15.0, cacheWrite: 3.75,  cacheRead: 0.3 },
  'haiku-4.5':  { input: 1.0,  output: 5.0,  cacheWrite: 1.25,  cacheRead: 0.1 },
  'haiku-3.5':  { input: 0.8,  output: 4.0,  cacheWrite: 1.0,   cacheRead: 0.08 },
};

// Display names for the UI
const MODEL_NAMES = {
  'fable-5':    'Claude Fable 5',
  'opus-4.8':   'Claude Opus 4.8',
  'opus-4.7':   'Claude Opus 4.7',
  'opus-4.6':   'Claude Opus 4.6',
  'opus-4.5':   'Claude Opus 4.5',
  'opus-4.1':   'Claude Opus 4.1',
  'opus-4':     'Claude Opus 4',
  'sonnet-4.6': 'Claude Sonnet 4.6',
  'sonnet-4.5': 'Claude Sonnet 4.5',
  'sonnet-4':   'Claude Sonnet 4',
  'haiku-4.5':  'Claude Haiku 4.5',
  'haiku-3.5':  'Claude Haiku 3.5',
};

module.exports = { DEFAULT_PRICING, MODEL_NAMES };
