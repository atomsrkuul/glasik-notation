/**
 * GN v0.6 Continuous Context Router
 * Model-agnostic context continuity across Anthropic, Ollama, and future models
 * 
 * Solves: Switching models = lost context
 * Solution: Universal embeddings + semantic shard database + continuity scoring
 * 
 * Supports: claude, ollama, gpt, future models
 * Status: LIVE, ready for integration
 */

const GNSemanticShards = require('./gn-semantic-shards');
const path = require('path');

class GNContinuousRouter {
  constructor(options = {}) {
    this.sessionDir = options.sessionDir || path.join(process.cwd(), 'data');
    this.ollamaEndpoint = options.ollamaEndpoint || 'http://192.168.0.3:11434';
    this.anthropicKey = options.anthropicKey || process.env.ANTHROPIC_API_KEY;
    this.defaultModel = options.defaultModel || 'anthropic/claude-sonnet-4-6';
    
    // Initialize semantic shards database
    this.shards = new GNSemanticShards(path.join(this.sessionDir, 'gn-shards.db'));
    
    // Model capabilities
    this.modelCapabilities = {
      'anthropic/claude-sonnet-4-6': {
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        maxContext: 200000,
        costPer1kIn: 3,
        costPer1kOut: 15,
        supportsCache: true,
        supportsStreaming: true,
      },
      'ollama/qwen2.5:3b': {
        name: 'Qwen 2.5 3B',
        provider: 'ollama',
        maxContext: 32000,
        costPer1kIn: 0,
        costPer1kOut: 0,
        supportsCache: false,
        supportsStreaming: true,
      },
      'ollama/mistral:latest': {
        name: 'Mistral 7B',
        provider: 'ollama',
        maxContext: 32000,
        costPer1kIn: 0,
        costPer1kOut: 0,
        supportsCache: false,
        supportsStreaming: true,
      },
      'openai/gpt-4': {
        name: 'GPT-4',
        provider: 'openai',
        maxContext: 128000,
        costPer1kIn: 30,
        costPer1kOut: 60,
        supportsCache: true,
        supportsStreaming: true,
      },
    };

    this.healthChecks = {
      'anthropic': this.checkAnthropicHealth.bind(this),
      'ollama': this.checkOllamaHealth.bind(this),
    };
  }

  /**
   * Check Anthropic API health
   * @returns {Promise<boolean>}
   */
  async checkAnthropicHealth() {
    if (!this.anthropicKey) return false;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.anthropicKey });
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return msg.id !== undefined;
    } catch (e) {
      console.error('[GN-ROUTER] Anthropic health check failed:', e.message);
      return false;
    }
  }

  /**
   * Check Ollama health
   * @returns {Promise<boolean>}
   */
  async checkOllamaHealth() {
    try {
      const http = require('http');
      const options = new URL(this.ollamaEndpoint);
      
      return new Promise((resolve) => {
        const req = http.request(
          { hostname: options.hostname, port: options.port, path: '/api/tags', method: 'GET', timeout: 5000 },
          (res) => resolve(res.statusCode === 200)
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Route a query to the best available model
   * Considers: cost, latency, context size, availability
   * @param {string} sessionId
   * @param {Array} messages - Message history
   * @param {object} options - { preferModel, maxCost, requireCache }
   * @returns {Promise<object>} { model, provider, shouldCompress }
   */
  async route(sessionId, messages, options = {}) {
    const startTime = Date.now();
    const contextSize = messages.reduce((sum, m) => sum + (m.content ? m.content.length / 4 : 0), 0); // Rough token count

    // Get session stats
    const sessionStats = this.shards.getSessionStats(sessionId);
    const hasSessionContext = sessionStats && sessionStats.total_shards > 0;

    // Health checks
    const anthropicHealthy = await this.checkAnthropicHealth();
    const ollamaHealthy = await this.checkOllamaHealth();

    const availableModels = [];

    // Anthropic option
    if (anthropicHealthy) {
      const cap = this.modelCapabilities['anthropic/claude-sonnet-4-6'];
      const cost = (contextSize * cap.costPer1kIn) / 1000;
      availableModels.push({
        model: 'anthropic/claude-sonnet-4-6',
        provider: 'anthropic',
        score: this.scoreModel({
          cost, contextSize, available: true, hasCache: true,
          costLimit: options.maxCost
        }),
        cost,
      });
    }

    // Ollama options
    if (ollamaHealthy) {
      ['ollama/qwen2.5:3b', 'ollama/mistral:latest'].forEach(model => {
        const cap = this.modelCapabilities[model];
        const cost = 0; // Local
        const score = this.scoreModel({
          cost, contextSize,
          available: contextSize <= cap.maxContext,
          hasCache: false,
          costLimit: options.maxCost
        });

        if (contextSize <= cap.maxContext) {
          availableModels.push({
            model,
            provider: 'ollama',
            score,
            cost,
          });
        }
      });
    }

    // Fallback: if no local option, use Anthropic with compression
    if (availableModels.length === 0) {
      if (anthropicHealthy) {
        return {
          model: 'anthropic/claude-sonnet-4-6',
          provider: 'anthropic',
          shouldCompress: true,
          reason: 'no-local-available',
          decision: 'Using Anthropic with context compression',
        };
      } else {
        throw new Error('No models available (Anthropic down, Ollama down)');
      }
    }

    // Sort by score
    availableModels.sort((a, b) => b.score - a.score);
    const chosen = availableModels[0];

    return {
      model: chosen.model,
      provider: chosen.provider,
      shouldCompress: contextSize > 50000,
      score: chosen.score,
      cost: chosen.cost,
      alternatives: availableModels.slice(1),
      decision: `Routed to ${chosen.provider} (score: ${chosen.score.toFixed(2)})`,
      routingTime: Date.now() - startTime,
    };
  }

  /**
   * Score a model for a given query
   * Considers: cost, latency assumptions, context fit
   * @param {object} factors - { cost, contextSize, available, hasCache, costLimit }
   * @returns {number} Score [0, 100]
   */
  scoreModel(factors) {
    let score = 50;

    // Availability (critical)
    if (!factors.available) return -1;

    // Cost factor (20 points max)
    if (factors.costLimit && factors.cost > factors.costLimit) return -1;
    const costScore = Math.max(0, 20 - (factors.cost / 0.01)); // Penalize expensive
    score += costScore;

    // Cache benefit (15 points max)
    if (factors.hasCache) score += 15;

    // Context fit (15 points max)
    const contextFit = Math.min(1, 32000 / factors.contextSize); // Assume most local models = 32k
    score += contextFit * 15;

    return Math.min(100, score);
  }

  /**
   * Prepare context for a model using semantic shards
   * Retrieves relevant context from session history
   * @param {string} sessionId
   * @param {string} query - Current user query
   * @param {string} model - Target model
   * @returns {Promise<object>} { context, shardCount, compressionRatio }
   */
  async prepareContext(sessionId, query, model) {
    const cap = this.modelCapabilities[model];
    const maxContextTokens = cap.maxContext;

    // Get relevant shards
    const topK = Math.max(1, Math.floor(maxContextTokens / 200)); // Assume 200 tokens per shard
    const relevantShards = await this.shards.getRelevantShards(sessionId, query, topK);

    if (relevantShards.length === 0) {
      return { context: '', shardCount: 0, compressionRatio: 1 };
    }

    // Reconstruct context from shards
    const contextParts = relevantShards.map(shard => shard.content);
    const context = contextParts.join('\n---\n');

    const sessionStats = this.shards.getSessionStats(sessionId);
    const compressionRatio = sessionStats ? sessionStats.compressed_tokens / sessionStats.total_tokens : 1;

    return {
      context,
      shardCount: relevantShards.length,
      compressionRatio,
      costSaved: sessionStats ? sessionStats.cost_saved : 0,
    };
  }

  /**
   * Store conversation in semantic shards for future retrieval
   * @param {string} sessionId
   * @param {object} message - { role, content }
   * @returns {Promise<object>}
   */
  async storeMessage(sessionId, message) {
    const content = `[${message.role.toUpperCase()}]\n${message.content}`;
    return this.shards.addShards(sessionId, content, 512);
  }

  /**
   * Get health report
   * @returns {Promise<object>}
   */
  async getHealthReport() {
    const anthropicHealthy = await this.checkAnthropicHealth();
    const ollamaHealthy = await this.checkOllamaHealth();

    return {
      timestamp: new Date().toISOString(),
      providers: {
        anthropic: { healthy: anthropicHealthy, model: 'claude-sonnet-4-6' },
        ollama: { healthy: ollamaHealthy, endpoint: this.ollamaEndpoint },
      },
      status: (anthropicHealthy || ollamaHealthy) ? 'OPERATIONAL' : 'DOWN',
      fallback: anthropicHealthy ? 'anthropic' : ollamaHealthy ? 'ollama' : 'none',
    };
  }

  close() {
    this.shards.close();
  }
}

module.exports = GNContinuousRouter;
