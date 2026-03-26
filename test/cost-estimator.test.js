'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CostEstimator } = require('../src/server/cost-estimator');

describe('CostEstimator', () => {
  test('estimates tokens from text (~4 chars per token)', () => {
    const estimator = new CostEstimator();
    const tokens = estimator.estimateTokens('Hello World!'); // 12 chars
    assert.equal(tokens, 3); // ceil(12 / 4)
  });

  test('estimates tokens from object', () => {
    const estimator = new CostEstimator();
    const obj = { file_path: '/src/index.js', content: 'console.log("hi")' };
    const tokens = estimator.estimateTokens(obj);
    const jsonStr = JSON.stringify(obj);
    assert.equal(tokens, Math.ceil(jsonStr.length / 4));
  });

  test('returns 0 for null/undefined input', () => {
    const estimator = new CostEstimator();
    assert.equal(estimator.estimateTokens(null), 0);
    assert.equal(estimator.estimateTokens(undefined), 0);
    assert.equal(estimator.estimateTokens(''), 0);
  });

  test('calculates cost with sonnet-4 pricing', () => {
    const estimator = new CostEstimator('sonnet-4');
    const event = {
      tool_input: 'A'.repeat(4000), // ~1000 tokens
      tool_result: 'B'.repeat(4000), // ~1000 tokens
    };

    const result = estimator.estimateEventCost(event);
    assert.equal(result.inputTokens, 1000);
    assert.equal(result.outputTokens, 1000);

    // Sonnet-4: $3/M input, $15/M output
    const expectedCost = (1000 / 1_000_000) * 3 + (1000 / 1_000_000) * 15;
    assert.ok(Math.abs(result.cost - expectedCost) < 0.0001);
  });

  test('calculates cost with opus-4 pricing', () => {
    const estimator = new CostEstimator('opus-4');
    const event = {
      tool_input: 'A'.repeat(4000), // ~1000 tokens
    };

    const result = estimator.estimateEventCost(event);
    assert.equal(result.inputTokens, 1000);

    // Opus-4: $15/M input
    const expectedCost = (1000 / 1_000_000) * 15;
    assert.ok(Math.abs(result.cost - expectedCost) < 0.0001);
  });

  test('formatCost handles different scales', () => {
    const estimator = new CostEstimator();
    assert.equal(estimator.formatCost(0.0001), '$0.0001');
    assert.equal(estimator.formatCost(0.05), '$0.050');
    assert.equal(estimator.formatCost(1.5), '$1.50');
    assert.equal(estimator.formatCost(12.345), '$12.35');
  });

  test('formatTokens handles different scales', () => {
    const estimator = new CostEstimator();
    assert.equal(estimator.formatTokens(500), '500');
    assert.equal(estimator.formatTokens(1500), '1.5K');
    assert.equal(estimator.formatTokens(1500000), '1.50M');
  });

  test('setModel changes pricing model', () => {
    const estimator = new CostEstimator('sonnet-4');
    const event = { tool_input: 'A'.repeat(4000) };

    const sonnetResult = estimator.estimateEventCost(event);
    estimator.setModel('opus-4');
    const opusResult = estimator.estimateEventCost(event);

    // Opus should cost more than Sonnet
    assert.ok(opusResult.cost > sonnetResult.cost);
  });
});
