/**
 * GN mRNA Router v0.1
 * Routes shards to optimal compression strategies based on instruction metadata
 * Inspired by mRNA codons directing tRNA binding
 */

class GNmRNARouter {
  constructor() {
    // Instruction set: compression strategies
    this.strategies = {
      AGGRESSIVE: { zlibLevel: 9, symbolThreshold: 2, phraseMinLength: 3 },
      BALANCED: { zlibLevel: 6, symbolThreshold: 3, phraseMinLength: 4 },
      CONSERVATIVE: { zlibLevel: 3, symbolThreshold: 5, phraseMinLength: 5 },
      METADATA_ONLY: { zlibLevel: 1, symbolThreshold: 10, phraseMinLength: 10 }
    };
  }

  /**
   * Route shard to optimal strategy based on metadata
   */
  route(shard) {
    const importance = shard.importance_score || 0.5;
    const sessionType = this.detectSessionType(shard.session_id);
    const contentType = this.detectContentType(shard.content);

    let strategy = 'BALANCED'; // Default

    // Critical shards get aggressive compression
    if (importance >= 0.8) {
      strategy = 'AGGRESSIVE';
    }
    // Low importance gets conservative (faster, less CPU)
    else if (importance < 0.4) {
      strategy = 'CONSERVATIVE';
    }

    // Session-type routing
    if (sessionType === 'metadata') {
      strategy = 'METADATA_ONLY';
    } else if (sessionType === 'git') {
      strategy = 'AGGRESSIVE'; // Git commits compress well
    } else if (sessionType === 'memory') {
      strategy = 'BALANCED'; // Balanced for long-term memory
    }

    return {
      shardId: shard.id,
      strategy,
      parameters: this.strategies[strategy],
      routing: {
        importance,
        sessionType,
        contentType,
        reasoning: this.getReasoning(importance, sessionType, contentType)
      }
    };
  }

  /**
   * Detect session type from session_id
   */
  detectSessionType(sessionId) {
    if (sessionId.includes('memory')) return 'memory';
    if (sessionId.includes('git')) return 'git';
    if (sessionId.includes('gbt-session')) return 'conversation';
    if (sessionId.includes('test')) return 'metadata';
    return 'general';
  }

  /**
   * Detect content type (text, code, structured, etc)
   */
  detectContentType(content) {
    const lines = content.split('\n').length;
    const hasCode = /```|function|const|class/.test(content);
    const hasJson = /\{.*\}|\[.*\]/.test(content);
    const hasMarkdown = /^#+|^\*|-/m.test(content);

    if (hasCode) return 'code';
    if (hasJson) return 'structured';
    if (hasMarkdown) return 'markdown';
    if (lines > 50) return 'long-form';
    return 'text';
  }

  /**
   * Get human-readable routing reason
   */
  getReasoning(importance, sessionType, contentType) {
    const reasons = [];
    
    if (importance >= 0.8) reasons.push('High importance');
    if (importance < 0.4) reasons.push('Low importance');
    if (sessionType === 'git') reasons.push('Git history (high compressibility)');
    if (sessionType === 'memory') reasons.push('Long-term memory');
    if (contentType === 'code') reasons.push('Code content');
    if (contentType === 'structured') reasons.push('Structured data');

    return reasons.join(' + ');
  }

  /**
   * Batch route multiple shards
   */
  routeBatch(shards) {
    return shards.map(shard => this.route(shard));
  }
}

module.exports = GNmRNARouter;
