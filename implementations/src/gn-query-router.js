/**
 * GN v0.7 Query Type Detection & Routing
 * Routes queries to optimal model based on type and cost
 * 
 * Query Types:
 * - 'exploit': Sensitive technical (RCE, SQLi, POC) → Anthropic (high-value)
 * - 'recon': Discovery & enumeration → Ollama (free, fast)
 * - 'analysis': Synthesis & research → Ollama (good reasoning)
 * - 'general': Default routing
 */

class GNQueryRouter {
  constructor(options = {}) {
    this.maxCostPerQuery = options.maxCostPerQuery || 0.10; // $0.10 default
    this.preferLocal = options.preferLocal !== false; // Default: prefer Ollama
    
    // Pattern matching for query types
    this.exploitPatterns = /exploit|poc|payload|rce|sql injection|sqli|bypass|remote code|shell|reverse shell|reverse-shell|authenticate bypass|auth bypass|xss payload|csrf|ssrf|lfi|rfi|path traversal|directory traversal|xxe|xml bomb/i;
    
    this.reconPatterns = /find|enumerate|scan|discover|list|brute|fuzz|wordlist|subnet|nmap|dirbuster|subfinder|httpx|shodan|censys|api endpoint|endpoint mapping|reconnaissance|recon|subdomain|vhost|virtual host|port scan|service detect|technology detect|fingerprint/i;
    
    this.analysisPatterns = /explain|analyze|research|writeup|report|how does|why|understand|architecture|design|pattern|best practice|comparison|summary|whatif|what if|impact analysis|risk assessment/i;
  }

  /**
   * Detect query type from user input
   * @param {string} query - User query text
   * @returns {string} Query type: 'exploit' | 'recon' | 'analysis' | 'general'
   */
  detectQueryType(query) {
    if (!query) return 'general';

    if (this.exploitPatterns.test(query)) return 'exploit';
    if (this.reconPatterns.test(query)) return 'recon';
    if (this.analysisPatterns.test(query)) return 'analysis';
    
    return 'general';
  }

  /**
   * Route query to best model based on type and cost
   * @param {string} query - User query
   * @param {object} providers - { anthropic: { healthy, cost }, ollama: { healthy, cost } }
   * @returns {object} { model, provider, reason, cost }
   */
  route(query, providers) {
    const queryType = this.detectQueryType(query);
    
    switch (queryType) {
      case 'exploit':
        // Always use Anthropic for sensitive technical work
        if (providers.anthropic?.healthy) {
          return {
            model: 'anthropic/claude-sonnet-4-6',
            provider: 'anthropic',
            reason: 'Exploit detection requires high-accuracy reasoning',
            queryType,
            cost: 0.01 // Estimated
          };
        }
        // Fallback to Ollama if Anthropic down
        return {
          model: 'ollama/qwen2.5:3b',
          provider: 'ollama',
          reason: 'Anthropic unavailable, using Ollama fallback',
          queryType,
          cost: 0
        };

      case 'recon':
        // Use Ollama (free, fast for enumeration)
        if (providers.ollama?.healthy && this.preferLocal) {
          return {
            model: 'ollama/qwen2.5:3b',
            provider: 'ollama',
            reason: 'Reconnaissance queries faster & free on Ollama',
            queryType,
            cost: 0
          };
        }
        // Fallback to Anthropic
        return {
          model: 'anthropic/claude-sonnet-4-6',
          provider: 'anthropic',
          reason: 'Ollama unavailable',
          queryType,
          cost: 0.01
        };

      case 'analysis':
        // Use Ollama for synthesis (good reasoning, free)
        if (providers.ollama?.healthy && this.preferLocal) {
          return {
            model: 'ollama/qwen2.5:3b',
            provider: 'ollama',
            reason: 'Analysis & synthesis work well on Ollama (cost-effective)',
            queryType,
            cost: 0
          };
        }
        // Use Anthropic if needed
        return {
          model: 'anthropic/claude-sonnet-4-6',
          provider: 'anthropic',
          reason: 'Ollama unavailable',
          queryType,
          cost: 0.01
        };

      default:
        // General: use cheapest available
        if (this.preferLocal && providers.ollama?.healthy) {
          return {
            model: 'ollama/qwen2.5:3b',
            provider: 'ollama',
            reason: 'General query routed to free Ollama',
            queryType,
            cost: 0
          };
        }
        if (providers.anthropic?.healthy) {
          return {
            model: 'anthropic/claude-sonnet-4-6',
            provider: 'anthropic',
            reason: 'Using Anthropic',
            queryType,
            cost: 0.01
          };
        }
        // Both down (shouldn't happen)
        throw new Error('No providers available');
    }
  }

  /**
   * Estimate monthly savings using smart routing
   * @param {number} queriesPerDay - Daily query count
   * @returns {object} Cost analysis
   */
  estimateSavings(queriesPerDay = 50) {
    const costPerAnthropicQuery = 0.01; // Estimated
    const costPerOllamaQuery = 0.0;
    
    // Assume distribution
    const exploitPct = 0.15; // 15% require Anthropic
    const reconPct = 0.40;   // 40% → Ollama
    const analysisPct = 0.30; // 30% → Ollama
    const generalPct = 0.15;  // 15% → Ollama if available

    const anthropicQueries = queriesPerDay * exploitPct * 30;
    const ollamaQueries = queriesPerDay * (reconPct + analysisPct + generalPct) * 30;

    const costWithoutRouting = queriesPerDay * 30 * costPerAnthropicQuery;
    const costWithRouting = anthropicQueries * costPerAnthropicQuery;
    const savings = costWithoutRouting - costWithRouting;

    return {
      queriesPerDay,
      monthly: {
        total: (queriesPerDay * 30),
        anthropic: anthropicQueries,
        ollama: ollamaQueries,
      },
      cost: {
        withoutRouting: costWithoutRouting.toFixed(2),
        withRouting: costWithRouting.toFixed(2),
        savings: savings.toFixed(2),
        savingsPercent: ((savings / costWithoutRouting) * 100).toFixed(1),
      },
      breakdown: {
        exploitQueries: exploitPct * 100,
        reconQueries: reconPct * 100,
        analysisQueries: analysisPct * 100,
        generalQueries: generalPct * 100,
      }
    };
  }
}

module.exports = GNQueryRouter;
