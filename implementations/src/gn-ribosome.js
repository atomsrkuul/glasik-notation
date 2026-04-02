/**
 * GN-Ribosome v0.2
 * Self-assembling compression system inspired by biological ribosomes
 * Combines all GN compression properties with adaptive learning + mRNA routing
 */

const GNAdaptiveCompressionEngine = require('./gn-adaptive-compression');
const GNmRNARouter = require('./gn-mrna-router');
const GNACEPersistence = require('./gn-ace-persistence');

class GNRibosome {
  constructor(db) {
    this.db = db;
    
    // Catalytic core
    this.ace = new GNAdaptiveCompressionEngine();
    
    // Persistence layer
    this.acePersist = new GNACEPersistence(db);
    this.loadAceState();
    
    // mRNA routing system
    this.mrnaRouter = new GNmRNARouter();
    
    // Processing state
    this.state = {
      processedShards: 0,
      totalCompressed: 0,
      avgCompressionRatio: 1.0,
      phaseTransitions: 0,
      activePolyribosomes: 0,
      routingDecisions: []
    };

    this.initTables();
  }

  /**
   * Load persisted ACE state
   */
  loadAceState() {
    const loaded = this.acePersist.load();
    if (loaded) {
      this.ace.state.symbolFreq = loaded.symbolFreq;
      this.ace.state.phraseFreq = loaded.phraseFreq;
      this.ace.state.zlibLevel = loaded.zlibLevel;
      this.ace.state.catalystStrength = loaded.catalystStrength;
      this.ace.state.avgRatio = loaded.avgRatio;
      this.ace.state.learningRate = loaded.learningRate;
    }
  }

  /**
   * Save ACE state to persistence
   */
  saveAceState() {
    this.acePersist.save(this.ace.state);
  }

  initTables() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ribosome_output (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shard_id INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          original_content TEXT,
          compressed BLOB,
          symbol_table TEXT,
          phrase_table TEXT,
          compression_ratio REAL,
          compression_gain REAL,
          ace_stats TEXT,
          phase_transition TEXT,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(shard_id) REFERENCES shards(id)
        );
        CREATE INDEX IF NOT EXISTS idx_ribosome_shard ON ribosome_output(shard_id);
        CREATE INDEX IF NOT EXISTS idx_ribosome_processed ON ribosome_output(processed_at);
      `);
    } catch (e) {
      // Table exists
    }
  }

  /**
   * Process a single shard through the ribosome
   * mRNA: instruction stream (shard data + routing)
   * catalytic core: ACE compression with routed strategy
   * output: compressed protein (result)
   */
  async processShardCodon(shardId) {
    try {
      // Fetch shard from DB
      const stmt = this.db.prepare(`
        SELECT id, session_id, content, importance_score FROM shards WHERE id = ?
      `);
      const shard = stmt.get(shardId);

      if (!shard) return null;

      // Route shard to optimal strategy (mRNA instruction)
      const routing = this.mrnaRouter.route(shard);
      this.state.routingDecisions.push(routing);

      // Run through ACE with routed strategy (catalytic core)
      const aceResult = this.ace.compress(shard.content, {
        importance: shard.importance_score,
        sessionId: shard.session_id,
        strategy: routing.strategy,
        parameters: routing.parameters
      });

      // Detect phase transition
      const phaseTransition = this.detectPhaseTransition(shard.importance_score, aceResult);

      // Store result (ribosomal output)
      const insertStmt = this.db.prepare(`
        INSERT INTO ribosome_output
        (shard_id, session_id, original_content, compressed, symbol_table, phrase_table, 
         compression_ratio, compression_gain, ace_stats, phase_transition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        shardId,
        shard.session_id,
        shard.content.slice(0, 500), // Store preview
        aceResult.compressed,
        JSON.stringify(Array.from(aceResult.symbolTable.entries())),
        JSON.stringify(Array.from(aceResult.phraseTable.entries())),
        parseFloat(aceResult.metadata.ratio),
        parseFloat(aceResult.metadata.gain),
        JSON.stringify(this.ace.getStats()),
        phaseTransition
      );

      // Update state
      this.state.processedShards++;
      this.state.totalCompressed += aceResult.compressed.length;

      return {
        shardId,
        ratio: aceResult.metadata.ratio,
        gain: aceResult.metadata.gain,
        phaseTransition,
        routing: routing.routing,
        strategy: routing.strategy,
        aceStats: this.ace.getStats()
      };
    } catch (e) {
      console.error('[RIBOSOME] Process error:', e.message);
      return null;
    }
  }

  /**
   * Process multiple shards (polyribosomes = parallel processing)
   */
  async processShards(shardIds) {
    this.state.activePolyribosomes++;

    const results = await Promise.all(
      shardIds.map(id => this.processShardCodon(id))
    );

    this.state.activePolyribosomes--;

    return results.filter(r => r !== null);
  }

  /**
   * Feed entire QS (Quantum Shards) dataset
   */
  async feedQuantumShards() {
    try {
      // Fetch all shards from gn-shards.db
      const stmt = this.db.prepare(`
        SELECT id FROM shards ORDER BY importance_score DESC LIMIT 50
      `);
      const shards = stmt.all();

      console.log(`[RIBOSOME] Feeding ${shards.length} quantum shards...`);

      // Process in batches (polyribosomes)
      const batchSize = 5;
      const results = [];

      for (let i = 0; i < shards.length; i += batchSize) {
        const batch = shards.slice(i, i + batchSize).map(s => s.id);
        const batchResults = await this.processShards(batch);
        results.push(...batchResults);
        console.log(`  [${i + batch.length}/${shards.length}] Processed batch`);
      }

      // Calculate aggregate stats
      const totalGain = results.reduce((sum, r) => sum + parseFloat(r.gain), 0) / results.length;
      const avgRatio = results.reduce((sum, r) => sum + parseFloat(r.ratio), 0) / results.length;

      this.state.avgCompressionRatio = avgRatio;
      this.state.phaseTransitions = results.filter(r => r.phaseTransition).length;

      return {
        processed: results.length,
        avgCompressionRatio: avgRatio.toFixed(4),
        avgGain: totalGain.toFixed(1) + '%',
        phaseTransitions: this.state.phaseTransitions,
        aceStats: this.ace.getStats()
      };
    } catch (e) {
      console.error('[RIBOSOME] QS feed error:', e.message);
      return null;
    }
  }

  /**
   * Detect phase transitions during compression
   */
  detectPhaseTransition(importance, aceResult) {
    const ratio = parseFloat(aceResult.metadata.ratio);
    const gain = parseFloat(aceResult.metadata.gain);

    // Good compression on critical shard = phase transition
    if (importance >= 0.8 && gain > 40) return 'CRITICAL_COALESCE';
    if (importance >= 0.8 && gain > 20) return 'CRITICAL_COMPRESS';
    
    // Phase change from high to medium
    if (importance < 0.6 && importance >= 0.4 && gain > 30) return 'MEDIUM_EMERGE';
    
    // Degradation
    if (gain < 0) return 'EXPANSION';

    return null;
  }

  /**
   * Get ribosomal output statistics
   */
  getStats() {
    // Count routing strategy distribution
    const strategies = {};
    this.state.routingDecisions.forEach(decision => {
      strategies[decision.strategy] = (strategies[decision.strategy] || 0) + 1;
    });

    return {
      processedShards: this.state.processedShards,
      totalCompressed: this.state.totalCompressed,
      avgCompressionRatio: this.state.avgCompressionRatio.toFixed(4),
      phaseTransitions: this.state.phaseTransitions,
      activePolyribosomes: this.state.activePolyribosomes,
      routingStrategies: strategies,
      mRNADecisions: this.state.routingDecisions.length,
      aceStats: this.ace.getStats()
    };
  }

  /**
   * Reset ribosome (for new context window)
   */
  reset() {
    this.ace.reset();
    this.state.processedShards = 0;
    this.state.totalCompressed = 0;
    this.state.phaseTransitions = 0;
    this.state.routingDecisions = [];
  }

  /**
   * Checkpoint learning state
   */
  checkpoint() {
    this.saveAceState();
    return { checkpoint: 'saved', timestamp: new Date().toISOString() };
  }
}

module.exports = GNRibosome;
