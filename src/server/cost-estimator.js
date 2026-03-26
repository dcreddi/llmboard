'use strict';

const { DEFAULT_PRICING } = require('./pricing');

class CostEstimator {
  constructor(model = 'sonnet-4', customPricing = null) {
    this.model = model;
    this.pricing = customPricing || DEFAULT_PRICING;
  }

  // ~4 chars per token heuristic for English/code
  estimateTokens(data) {
    if (!data) return 0;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return Math.ceil(str.length / 4);
  }

  estimateEventCost(event, modelOverride) {
    const modelPricing = this.pricing[modelOverride || this.model] || this.pricing['sonnet-4'];

    const inputTokens = this.estimateTokens(event.tool_input);
    // tool_result counts as Claude's next-turn input, but displayed as "output" since it's the tool's response
    const outputTokens = this.estimateTokens(event.tool_result);

    const cost =
      (inputTokens / 1_000_000) * modelPricing.input +
      (outputTokens / 1_000_000) * modelPricing.output;

    return {
      inputTokens,
      outputTokens,
      cost,
    };
  }

  formatCost(cost) {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }

  formatTokens(tokens) {
    if (tokens < 1000) return `${tokens}`;
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }

  setModel(model) {
    this.model = model;
  }
}

module.exports = { CostEstimator };
