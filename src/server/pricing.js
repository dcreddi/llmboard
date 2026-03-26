'use strict';

// Claude model pricing (USD per million tokens)
// Users can override in ~/.llmboard/config.json
const DEFAULT_PRICING = {
  'opus-4': { input: 15.0, output: 75.0 },
  'sonnet-4': { input: 3.0, output: 15.0 },
  'haiku-3.5': { input: 0.25, output: 1.25 },
};

// Display names for the UI
const MODEL_NAMES = {
  'opus-4': 'Claude Opus 4',
  'sonnet-4': 'Claude Sonnet 4',
  'haiku-3.5': 'Claude Haiku 3.5',
};

module.exports = { DEFAULT_PRICING, MODEL_NAMES };
