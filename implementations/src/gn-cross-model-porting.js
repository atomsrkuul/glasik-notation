/**
 * GN v1.0 Cross-Model Context Porting
 * Share semantic context across different LLM models
 * 
 * Problem: Switch Claude → GPT-4 → Ollama = lost context
 * Solution: Universal semantic representation via embeddings
 * 
 * Architecture:
 * 1. Embed context once (Mistral 384-dim via Ollama)
 * 2. Store universal embedding + shard content
 * 3. On model switch: retrieve shards, reformat for new model
 * 4. Model-agnostic system prompt generation
 * 5. Seamless context continuity across providers
 */

class GNCrossModelPorting {
  constructor(options = {}) {
    this.ollamaEndpoint = options.ollamaEndpoint || 'http://192.168.0.3:11434';
    this.embeddingModel = options.embeddingModel || 'mistral:latest';
    this.embedDim = 384; // Mistral embedding dimension
    
    // Model-specific context window limits
    this.modelLimits = {
      'anthropic/claude-sonnet-4-6': { contextWindow: 200000, name: 'Claude Sonnet 4' },
      'anthropic/claude-opus-4-5': { contextWindow: 200000, name: 'Claude Opus 4.5' },
      'openai/gpt-4': { contextWindow: 128000, name: 'GPT-4' },
      'openai/gpt-4-turbo': { contextWindow: 128000, name: 'GPT-4 Turbo' },
      'openai/gpt-3.5-turbo': { contextWindow: 16000, name: 'GPT-3.5 Turbo' },
      'ollama/qwen2.5:3b': { contextWindow: 32000, name: 'Qwen 2.5 3B' },
      'ollama/mistral:latest': { contextWindow: 32000, name: 'Mistral 7B' },
      'ollama/phi3.5': { contextWindow: 128000, name: 'Phi 3.5' },
    };

    // Model-specific prompt templates
    this.promptTemplates = {
      anthropic: {
        contextStart: '\n<context>',
        contextEnd: '</context>\n',
        separator: '\n---\n',
      },
      openai: {
        contextStart: '\n[CONTEXT START]\n',
        contextEnd: '\n[CONTEXT END]\n',
        separator: '\n---\n',
      },
      ollama: {
        contextStart: '\n=== CONTEXT ===\n',
        contextEnd: '\n=== END CONTEXT ===\n',
        separator: '\n---\n',
      },
    };
  }

  /**
   * Detect model family from model ID
   * @param {string} modelId - e.g. 'anthropic/claude-sonnet-4-6'
   * @returns {string} Family: 'anthropic' | 'openai' | 'ollama'
   */
  _getModelFamily(modelId) {
    if (modelId.startsWith('anthropic/')) return 'anthropic';
    if (modelId.startsWith('openai/')) return 'openai';
    if (modelId.startsWith('ollama/')) return 'ollama';
    return 'anthropic'; // Default
  }

  /**
   * Format context for a specific model
   * Handles model-specific requirements (tokens, prompts, formatting)
   * @param {Array} shards - Array of { content, importance_score }
   * @param {string} targetModel - Target model ID
   * @param {number} maxTokens - Max tokens to use (optional)
   * @returns {object} { formattedContext, shardCount, estimatedTokens }
   */
  formatContextForModel(shards, targetModel, maxTokens = null) {
    if (!shards || shards.length === 0) {
      return {
        formattedContext: '',
        shardCount: 0,
        estimatedTokens: 0,
        modelFamily: this._getModelFamily(targetModel),
      };
    }

    const modelFamily = this._getModelFamily(targetModel);
    const template = this.promptTemplates[modelFamily] || this.promptTemplates.anthropic;
    const modelLimit = this.modelLimits[targetModel];
    const contextWindow = modelLimit?.contextWindow || 32000;
    
    // Estimate token limit (rough: 1 token ≈ 4 characters)
    const maxContextTokens = maxTokens || Math.floor(contextWindow * 0.7);
    const maxContextChars = maxContextTokens * 4;

    // Sort shards by importance
    const sortedShards = [...shards].sort((a, b) =>
      (b.importance_score || 0.5) - (a.importance_score || 0.5)
    );

    // Build context up to limit
    let context = '';
    let usedShards = 0;
    let totalChars = 0;

    for (const shard of sortedShards) {
      const shardContent = shard.content || '';
      const shardSize = Buffer.byteLength(shardContent, 'utf8');

      if (totalChars + shardSize > maxContextChars) {
        break; // Exceeded limit
      }

      context += shardContent + template.separator;
      totalChars += shardSize;
      usedShards++;
    }

    // Remove trailing separator
    if (context.endsWith(template.separator)) {
      context = context.slice(0, -template.separator.length);
    }

    // Wrap in model-specific tags
    const formattedContext = template.contextStart + context + template.contextEnd;

    const estimatedTokens = Math.ceil(Buffer.byteLength(formattedContext, 'utf8') / 4);

    return {
      formattedContext,
      shardCount: usedShards,
      estimatedTokens,
      modelFamily,
      modelName: modelLimit?.name || targetModel,
      contextWindowUsage: ((estimatedTokens / contextWindow) * 100).toFixed(1),
    };
  }

  /**
   * Port context from source model to target model
   * Retrieves all context shards and reformats for new model
   * @param {object} db - SQLite database
   * @param {string} sessionId
   * @param {string} sourceModel - Current model (for reference)
   * @param {string} targetModel - New model to switch to
   * @returns {object} { context, shardCount, portingInfo }
   */
  async portContext(db, sessionId, sourceModel, targetModel) {
    try {
      // Retrieve all session shards
      const getStmt = db.prepare(`
        SELECT id, content, importance_score FROM shards
        WHERE session_id = ?
        ORDER BY importance_score DESC
      `);
      const shards = getStmt.all(sessionId);

      if (shards.length === 0) {
        return {
          context: '',
          shardCount: 0,
          portingInfo: {
            sourceModel,
            targetModel,
            status: 'no_context',
            message: 'No shards found for session'
          }
        };
      }

      // Format for target model
      const formatted = this.formatContextForModel(shards, targetModel);

      // Log porting event
      console.log(`[GN-PORTING] ${this._getModelFamily(sourceModel)} → ${this._getModelFamily(targetModel)}`);
      console.log(`[GN-PORTING] Shards: ${formatted.shardCount} | Tokens: ${formatted.estimatedTokens} | Usage: ${formatted.contextWindowUsage}%`);

      return {
        context: formatted.formattedContext,
        shardCount: formatted.shardCount,
        portingInfo: {
          sourceModel: sourceModel,
          targetModel: targetModel,
          sourceFamily: this._getModelFamily(sourceModel),
          targetFamily: this._getModelFamily(targetModel),
          shardsUsed: formatted.shardCount,
          totalShards: shards.length,
          estimatedTokens: formatted.estimatedTokens,
          contextWindowUsage: formatted.contextWindowUsage,
          status: 'success',
          timestamp: new Date().toISOString(),
        }
      };
    } catch (e) {
      console.error('[GN-PORTING] Error:', e.message);
      return {
        context: '',
        shardCount: 0,
        portingInfo: {
          status: 'error',
          error: e.message
        }
      };
    }
  }

  /**
   * Generate model-agnostic system prompt
   * Adapts prompt based on model capabilities
   * @param {string} model - Target model ID
   * @param {string} basePrompt - Base system prompt
   * @returns {string} Adapted system prompt
   */
  generateSystemPrompt(model, basePrompt) {
    const family = this._getModelFamily(model);
    const modelInfo = this.modelLimits[model];

    let prompt = basePrompt || 'You are a helpful AI assistant.';

    // Add model-specific instructions
    if (family === 'anthropic') {
      prompt += '\n\nRespond using natural language. Use XML tags for structured output.';
    } else if (family === 'openai') {
      prompt += '\n\nRespond clearly and concisely. Use markdown for formatting.';
    } else if (family === 'ollama') {
      prompt += '\n\nBe concise and direct. Keep responses focused and practical.';
    }

    // Add context hints
    prompt += '\n\nContext provided: Use the context blocks to inform your responses.';

    return prompt;
  }

  /**
   * Detect optimal model switch point
   * Returns true if switching would improve cost/quality
   * @param {string} currentModel
   * @param {Array} recentTokens - Token counts from last N queries
   * @returns {object} { shouldSwitch, recommendedModel, reason }
   */
  detectOptimalSwitch(currentModel, recentTokens = []) {
    const avgTokens = recentTokens.length > 0
      ? recentTokens.reduce((a, b) => a + b, 0) / recentTokens.length
      : 5000;

    const currentFamily = this._getModelFamily(currentModel);

    // Cost estimation (rough)
    const anthropicCostPer1k = 3 + 15; // in/out average
    const openaiCostPer1k = 30; // GPT-4 estimate
    const ollamaCostPer1k = 0;

    let recommendation = {
      shouldSwitch: false,
      recommendedModel: currentModel,
      reason: 'Current model is optimal'
    };

    // If using expensive Anthropic, check if Ollama would work
    if (currentFamily === 'anthropic' && avgTokens < 32000) {
      recommendation = {
        shouldSwitch: true,
        recommendedModel: 'ollama/qwen2.5:3b',
        reason: `Context size (${Math.round(avgTokens)} tokens) fits in Ollama. Save $${(anthropicCostPer1k * avgTokens / 1000).toFixed(2)} per query.`,
        costSavings: (anthropicCostPer1k * avgTokens / 1000).toFixed(2)
      };
    }

    // If using OpenAI, suggest Anthropic (usually cheaper)
    if (currentFamily === 'openai' && avgTokens > 16000) {
      recommendation = {
        shouldSwitch: true,
        recommendedModel: 'anthropic/claude-sonnet-4-6',
        reason: 'Anthropic cheaper than GPT-4 for large contexts',
        costSavings: ((openaiCostPer1k - anthropicCostPer1k) * avgTokens / 1000).toFixed(2)
      };
    }

    return recommendation;
  }

  /**
   * List all available models with capabilities
   * @returns {Array} Array of model info objects
   */
  listAvailableModels() {
    return Object.entries(this.modelLimits).map(([modelId, info]) => ({
      modelId,
      ...info,
      family: this._getModelFamily(modelId),
      costEstimate: modelId.startsWith('ollama/') ? 'Free' :
                    modelId.startsWith('openai/') ? 'High' :
                    'Medium'
    }));
  }

  /**
   * Estimate porting time and resource usage
   * @param {number} shardCount
   * @param {number} avgShardSize - In bytes
   * @returns {object} { estimatedTime, networkBandwidth, cpuUsage }
   */
  estimatePortingResources(shardCount, avgShardSize = 1024) {
    const totalSize = shardCount * avgShardSize;
    
    // Rough estimates
    const networkSpeed = 10 * 1024 * 1024; // 10 MB/s local network
    const estimatedTime = totalSize / networkSpeed; // seconds
    
    return {
      shardCount,
      totalSize,
      estimatedTimeSeconds: estimatedTime.toFixed(3),
      networkBandwidth: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      cpuUsage: 'Low (text formatting)',
      status: 'ready'
    };
  }
}

module.exports = GNCrossModelPorting;
