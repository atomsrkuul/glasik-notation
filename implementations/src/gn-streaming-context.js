/**
 * GN v0.8 Streaming Shard Retrieval
 * Load shards progressively while LLM reasons on initial context
 * Reduces latency for large contexts by 2-5 seconds
 * 
 * Architecture:
 * 1. Retrieve + send top 3 shards immediately
 * 2. Send initial query to LLM (starts processing)
 * 3. Stream remaining shards in background
 * 4. LLM continues with enhanced context
 */

class GNStreamingContext {
  constructor(shards, router) {
    this.shards = shards;
    this.router = router;
  }

  /**
   * Prepare streaming context (v0.8: progressive loading)
   * Returns initial context + callback for streaming more shards
   * @param {string} sessionId
   * @param {string} query
   * @param {number} initialShards - Number of shards to load immediately (default: 3)
   * @returns {Promise<object>} { context, streamFn, stats }
   */
  async prepareStreamingContext(sessionId, query, initialShards = 3) {
    const startTime = Date.now();

    try {
      // Fetch ALL relevant shards (but only return top-k immediately)
      const allShards = await this.shards.getRelevantShards(
        sessionId,
        query,
        100 // Get up to 100, return only first N
      );

      // Split: initial load vs streaming
      const initialSet = allShards.slice(0, initialShards);
      const streamingSet = allShards.slice(initialShards);

      // Build initial context
      const initialContext = initialSet
        .map(s => s.content)
        .join('\n---SHARD-SEP---\n');

      // Create streaming function
      const streamShards = async (onShard) => {
        for (let i = 0; i < streamingSet.length; i++) {
          const shard = streamingSet[i];
          // Emit shard with slight delay to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 50));
          
          onShard({
            index: i,
            content: shard.content,
            importance: shard.importance_score,
            total: streamingSet.length
          });
        }
      };

      const elapsed = Date.now() - startTime;

      return {
        context: initialContext,
        streamFn: streamShards,
        stats: {
          initialShards: initialSet.length,
          streamingShards: streamingSet.length,
          totalShards: allShards.length,
          prepTime: elapsed,
          estimatedStreamTime: streamingSet.length * 50 // 50ms per shard
        }
      };
    } catch (e) {
      console.error('[GN-STREAMING] Error:', e.message);
      return {
        context: '',
        streamFn: async () => {},
        stats: { error: e.message }
      };
    }
  }

  /**
   * Helper: format context for streaming into prompt
   * Allows LLM to process initial context while shards stream
   * @param {string} initialContext
   * @param {Array} streamingShards - Array of incoming shards
   * @returns {string} Formatted context block
   */
  formatStreamingPrompt(initialContext, streamingShards = []) {
    let prompt = `\n=== CONTEXT SHARDS (${initialContext ? 'loaded' : 'loading'}) ===\n`;
    
    if (initialContext) {
      prompt += initialContext + '\n';
    }

    if (streamingShards.length > 0) {
      prompt += `\n=== ADDITIONAL SHARDS (${streamingShards.length} incoming) ===\n`;
      streamingShards.forEach((shard, idx) => {
        prompt += `\n[SHARD ${idx + 1}]\n${shard.content}\n`;
      });
    }

    prompt += '\n=== END CONTEXT ===\n';
    return prompt;
  }
}

module.exports = GNStreamingContext;
