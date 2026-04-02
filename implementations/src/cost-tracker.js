/**
 * OpenClaw Cost Tracker
 * Tracks API costs across all sessions and models
 * Persists to ~/.openclaw/workspace/data/cost-tracker.json
 */

const fs = require('fs');
const path = require('path');

const COST_FILE = path.join(process.env.HOME || '/home/boot', '.openclaw', 'workspace', 'data', 'cost-tracker.json');
const DATA_DIR = path.dirname(COST_FILE);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Cost per million tokens (from OpenClaw config + manual rates)
 */
const COSTS = {
  'anthropic/claude-opus-4-5': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75
  },
  'anthropic/claude-sonnet-4-6': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75
  },
  'anthropic/claude-haiku-4-5': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00
  },
  'local/qwen2.5:0.5b': {
    input: 0,
    output: 0,
    gpu: 0
  },
  'local/qwen2.5:3b': {
    input: 0,
    output: 0,
    gpu: 0
  },
  'local/mistral:latest': {
    input: 0,
    output: 0,
    gpu: 0
  },
  'local/deepseek-r1': {
    input: 0,
    output: 0,
    gpu: 0
  }
};

/**
 * Load cost tracker from file
 */
function loadCostTracker() {
  try {
    if (fs.existsSync(COST_FILE)) {
      const data = fs.readFileSync(COST_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[COST-TRACKER] Error loading cost file:', err.message);
  }
  
  return {
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    sessions: [],
    summary: {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      byModel: {}
    }
  };
}

/**
 * Save cost tracker to file
 */
function saveCostTracker(tracker) {
  try {
    fs.writeFileSync(COST_FILE, JSON.stringify(tracker, null, 2));
  } catch (err) {
    console.error('[COST-TRACKER] Error saving cost file:', err.message);
  }
}

/**
 * Calculate cost for a query
 */
function calculateCost(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const modelCost = COSTS[model] || COSTS['anthropic/claude-sonnet-4-6'];
  
  const cost = {
    inputCost: (inputTokens * modelCost.input) / 1_000_000,
    outputCost: (outputTokens * modelCost.output) / 1_000_000,
    cacheReadCost: (cacheReadTokens * modelCost.cacheRead) / 1_000_000,
    cacheWriteCost: (cacheWriteTokens * modelCost.cacheWrite) / 1_000_000,
    totalCost: 0
  };
  
  cost.totalCost = cost.inputCost + cost.outputCost + cost.cacheReadCost + cost.cacheWriteCost;
  return cost;
}

/**
 * Log a query to cost tracker
 */
function logQuery(sessionId, model, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const tracker = loadCostTracker();
  const cost = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  
  // Find or create session entry
  let session = tracker.sessions.find(s => s.sessionId === sessionId);
  if (!session) {
    session = {
      sessionId,
      createdAt: new Date().toISOString(),
      queries: [],
      cost: 0
    };
    tracker.sessions.push(session);
  }
  
  // Log query
  const query = {
    timestamp: new Date().toISOString(),
    model,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens
    },
    cost: cost.totalCost
  };
  
  session.queries.push(query);
  session.cost += cost.totalCost;
  
  // Update summary
  tracker.summary.totalCost += cost.totalCost;
  tracker.summary.totalInputTokens += inputTokens;
  tracker.summary.totalOutputTokens += outputTokens;
  tracker.summary.totalCacheReadTokens += cacheReadTokens;
  tracker.summary.totalCacheWriteTokens += cacheWriteTokens;
  
  if (!tracker.summary.byModel[model]) {
    tracker.summary.byModel[model] = {
      queries: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0
    };
  }
  
  tracker.summary.byModel[model].queries += 1;
  tracker.summary.byModel[model].inputTokens += inputTokens;
  tracker.summary.byModel[model].outputTokens += outputTokens;
  tracker.summary.byModel[model].totalCost += cost.totalCost;
  
  tracker.lastUpdatedAt = new Date().toISOString();
  
  saveCostTracker(tracker);
  
  return {
    query,
    tracker: tracker.summary
  };
}

/**
 * Get cost summary
 */
function getCostSummary() {
  const tracker = loadCostTracker();
  return tracker.summary;
}

/**
 * Get session costs
 */
function getSessionCosts(sessionId) {
  const tracker = loadCostTracker();
  const session = tracker.sessions.find(s => s.sessionId === sessionId);
  return session || null;
}

/**
 * Format cost for display
 */
function formatCost(dollars) {
  if (dollars < 0.01) {
    return `$${(dollars * 1000).toFixed(2)}m`;  // millidollars
  }
  return `$${dollars.toFixed(4)}`;
}

/**
 * Print cost report
 */
function printCostReport() {
  const tracker = loadCostTracker();
  const summary = tracker.summary;
  
  console.log('\n💰 COST TRACKER REPORT');
  console.log('═══════════════════════════════════════════');
  console.log(`Total Cost:              ${formatCost(summary.totalCost)}`);
  console.log(`Total Input Tokens:      ${summary.totalInputTokens.toLocaleString()}`);
  console.log(`Total Output Tokens:     ${summary.totalOutputTokens.toLocaleString()}`);
  console.log(`Cache Read Tokens:       ${summary.totalCacheReadTokens.toLocaleString()}`);
  console.log(`Cache Write Tokens:      ${summary.totalCacheWriteTokens.toLocaleString()}`);
  console.log('───────────────────────────────────────────');
  console.log('By Model:');
  
  Object.entries(summary.byModel).forEach(([model, stats]) => {
    console.log(`  ${model}: ${stats.queries} queries, ${formatCost(stats.totalCost)}`);
  });
  
  console.log('═══════════════════════════════════════════\n');
}

module.exports = {
  loadCostTracker,
  saveCostTracker,
  calculateCost,
  logQuery,
  getCostSummary,
  getSessionCosts,
  formatCost,
  printCostReport,
  COSTS
};
